import { Prisma, type RoommateProfile } from '@prisma/client';

import { prisma } from '@/lib/prisma';

import { isCompatible, type CompatibilityProfile } from './compatibility';
import { activeProfilesWhere, notReportedWith } from './counts';
import {
  HIDE_AT_REPORTERS,
  INTAKE_STEPS,
  type DistrictPick,
  type HiddenReason,
  type Outcome,
  type ReportReason,
} from './rules';
import { computeExpiresAt } from './time';

/**
 * Prisma access for roommate profiles (spec 06 §Module layout; server only).
 *
 * A chat has at most one profile (`chat_id` is unique). Nothing here logs: a
 * profile holds personal data (spec 06 §Boundaries).
 */

/** The step every new draft starts at (spec 06 §Intake steps, step 1). */
const FIRST_STEP = INTAKE_STEPS[0];

/** The answer fields an intake or edit step stores as it moves on. */
export type StepAnswer = Partial<
  Pick<
    RoommateProfile,
    | 'districtSlugs'
    | 'anyDistrict'
    | 'budgetBand'
    | 'moveInMonth'
    | 'languages'
    | 'gender'
    | 'prefers'
    | 'about'
    | 'smoking'
    | 'pets'
  >
>;

/**
 * A draft, or an edit or renewal step of an active or expired profile: the
 * chat's next typed message may be its answer, and no other intake may start
 * (spec 06 §Entry and routing, "One open intake per chat"). A hidden profile
 * never has an open step.
 */
export function isStepOpen(profile: Pick<RoommateProfile, 'status' | 'step'> | null): boolean {
  if (!profile || profile.step == null) return false;
  return profile.status === 'draft' || profile.status === 'active' || profile.status === 'expired';
}

/** The ban marker and the chat's profile, the two facts the entry decides on. */
export async function loadRoommateEntry(chatDbId: string) {
  return prisma.telegramChat.findUnique({
    where: { id: chatDbId },
    select: { roommateBannedAt: true, roommateProfile: true },
  });
}

export async function findRoommateProfile(chatDbId: string): Promise<RoommateProfile | null> {
  return prisma.roommateProfile.findUnique({ where: { chatId: chatDbId } });
}

/** True while a roommate draft or an edit step is open for this chat. */
export async function hasOpenRoommateStep(chatDbId: string): Promise<boolean> {
  const profile = await prisma.roommateProfile.findUnique({
    where: { chatId: chatDbId },
    select: { status: true, step: true },
  });
  return isStepOpen(profile);
}

/**
 * A new draft at the first step, or null when the chat already has a profile
 * (a double tap on the start button: the unique `chat_id` refuses the second).
 */
export async function createDraft(
  chatDbId: string,
  entrySource: string,
  tgUsername: string | null,
): Promise<RoommateProfile | null> {
  try {
    return await prisma.roommateProfile.create({
      data: { chatId: chatDbId, status: 'draft', step: FIRST_STEP, entrySource, tgUsername },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return null;
    }
    throw error;
  }
}

/** Stores the Telegram username (or null) on the profile (spec 07 §Usernames). */
export async function setRoommateUsername(
  profileId: string,
  tgUsername: string | null,
): Promise<void> {
  await prisma.roommateProfile.updateMany({ where: { id: profileId }, data: { tgUsername } });
}

/** Deletes a draft; an active, expired or hidden profile is never removed here. */
export async function deleteDraft(profileId: string): Promise<boolean> {
  const { count } = await prisma.roommateProfile.deleteMany({
    where: { id: profileId, status: 'draft' },
  });
  return count === 1;
}

/**
 * True when the profile is in a pair that matched: one of its reactions (either
 * direction) has `matched_at` (spec 06 §Delete, read before the delete so the
 * "Found someone here" reason is offered only then).
 */
export async function hasMatchedReaction(profileId: string): Promise<boolean> {
  const count = await prisma.roommateReaction.count({
    where: {
      matchedAt: { not: null },
      OR: [{ fromProfileId: profileId }, { toProfileId: profileId }],
    },
  });
  return count > 0;
}

/**
 * Deletes a saved (active or expired) or hidden profile on its owner's request,
 * at once (FR-13). The foreign keys do the rest in the same statement: its
 * reactions cascade, and reports keep their rows with the reference set to null
 * (D55); the chat's ban marker is on `telegram_chats` and stays. A draft is never
 * removed here (`deleteDraft`). True for exactly one of two overlapping confirms.
 */
export async function deleteProfile(profileId: string): Promise<boolean> {
  const { count } = await prisma.roommateProfile.deleteMany({
    where: { id: profileId, status: { in: ['active', 'expired', 'hidden'] } },
  });
  return count === 1;
}

/**
 * Opens an edit step (`edit_<field>`) or the renewal's `renew_month` on a saved (active or
 * expired) profile; the profile stays as it is and an active one stays counted (spec 06 §Save and
 * the own card, Edit; §Renewal). A step already open is replaced: the person picked another field
 * or tapped Renew.
 */
export async function openEditStep(profileId: string, step: string): Promise<boolean> {
  const { count } = await prisma.roommateProfile.updateMany({
    where: { id: profileId, status: { in: ['active', 'expired'] } },
    data: { step },
  });
  return count === 1;
}

/**
 * Stores an edit's answer and closes the edit step in one conditional write: false when the
 * profile is no longer at `step` (a repeated tap, `/cancel`, another field picked), and then
 * nothing changed. `expiresAt` is passed only by a month edit that lowers it.
 */
export async function saveEdit(
  profileId: string,
  step: string,
  answer: StepAnswer & { expiresAt?: Date | null },
): Promise<boolean> {
  const { count } = await prisma.roommateProfile.updateMany({
    where: { id: profileId, step, status: { in: ['active', 'expired'] } },
    data: { ...answer, step: null },
  });
  return count === 1;
}

/**
 * Renews a saved (active or expired) profile (spec 06 §Renewal): active again, `renewed_at` now,
 * `expires_at` from `computeExpiresAt(now, moveInMonth)`, the reminder and expiry marks cleared.
 * With `step` (`renew_month`) the new month is stored and that step closed; without it an open
 * edit step is left alone. One conditional write on `renewed_at` as read (and on the step), so of
 * two overlapping taps only one lands; a hidden profile never matches.
 */
export async function renewProfile(
  profile: Pick<RoommateProfile, 'id' | 'renewedAt'>,
  moveInMonth: Date,
  now: Date,
  step?: string,
): Promise<{ renewed: true; expiresAt: Date } | { renewed: false }> {
  const expiresAt = computeExpiresAt(now, moveInMonth);
  const { count } = await prisma.roommateProfile.updateMany({
    where: {
      id: profile.id,
      status: { in: ['active', 'expired'] },
      renewedAt: profile.renewedAt,
      ...(step ? { step } : {}),
    },
    data: {
      status: 'active',
      renewedAt: now,
      expiresAt,
      renewalRemindedAt: null,
      expiredAt: null,
      ...(step ? { moveInMonth, step: null } : {}),
    },
  });
  return count === 1 ? { renewed: true, expiresAt } : { renewed: false };
}

/**
 * True while the one-time message (spec 06 §Matching is open) waits for this profile: opted in and
 * not told yet. A profile told at an earlier opening (the switch went on, then off again, spec 07
 * §Switch) is not waiting, whatever `notify_on_open_at` holds.
 */
export function waitsForOpenMessage(
  profile: Pick<RoommateProfile, 'notifyOnOpenAt' | 'notifiedOpenAt'>,
): boolean {
  return profile.notifyOnOpenAt !== null && profile.notifiedOpenAt === null;
}

/**
 * Switches the opt-in on (spec 06 §Opt-in, FR-18): `notify_on_open_at = now` and
 * `notified_open_at` cleared on a saved (active or expired) profile whose opt-in is not waiting
 * (`waitsForOpenMessage`): never opted in, or told at an earlier opening, so "I'll message you
 * once when matching opens" holds for the next opening too (spec 07 §Switch, turning it off
 * again). One conditional write, so of two overlapping taps only one is the first: false means
 * it was already on (or the profile is no longer saved), and nothing changed.
 */
export async function optInToOpenMessage(profileId: string, now: Date): Promise<boolean> {
  const { count } = await prisma.roommateProfile.updateMany({
    where: {
      id: profileId,
      status: { in: ['active', 'expired'] },
      OR: [{ notifyOnOpenAt: null }, { notifiedOpenAt: { not: null } }],
    },
    data: { notifyOnOpenAt: now, notifiedOpenAt: null },
  });
  return count === 1;
}

/** Switches the opt-in off from the own card (`rm:c:optout`): `notify_on_open_at` cleared. */
export async function optOutOfOpenMessage(profileId: string): Promise<void> {
  await prisma.roommateProfile.updateMany({
    where: { id: profileId, status: { in: ['active', 'expired'] } },
    data: { notifyOnOpenAt: null },
  });
}

/** Leaves an edit or renewal step of a saved profile; the profile itself stays as it was. */
export async function clearEditStep(profileId: string, step: string): Promise<boolean> {
  const { count } = await prisma.roommateProfile.updateMany({
    where: { id: profileId, step, status: { in: ['active', 'expired'] } },
    data: { step: null },
  });
  return count === 1;
}

/**
 * Switches the daily push (spec 07 §Daily push, FR-27) off (`rm:push:off`) or back on
 * (`rm:push:on`) on a saved (active or expired) profile. One conditional write on `push_off`
 * holding the other value: false means it already was so (a repeat tap) and nothing changed.
 */
export async function setPushOff(profileId: string, off: boolean): Promise<boolean> {
  const { count } = await prisma.roommateProfile.updateMany({
    where: { id: profileId, status: { in: ['active', 'expired'] }, pushOff: !off },
    data: { pushOff: off },
  });
  return count === 1;
}

/**
 * Stores the answer to the outcome question (spec 07 §Outcome question, FR-29): one conditional
 * write on a profile that was asked (`outcome_asked_at` set) and has not answered (`outcome`
 * null). False for a second tap, an overlapping one, or a profile that was never asked; then
 * nothing changed.
 */
export async function storeOutcome(profileId: string, outcome: Outcome): Promise<boolean> {
  const { count } = await prisma.roommateProfile.updateMany({
    where: { id: profileId, outcomeAskedAt: { not: null }, outcome: null },
    data: { outcome },
  });
  return count === 1;
}

/**
 * The instant (ms) a profile last came up: `coalesce(renewed_at, activated_at)`, the order of the
 * cards and what the daily push counts as new.
 */
export function freshness(profile: Pick<RoommateProfile, 'renewedAt' | 'activatedAt'>): number {
  return (profile.renewedAt ?? profile.activatedAt)?.getTime() ?? 0;
}

/**
 * The candidates `profile` may be shown, before the compatibility rule: active at `now` by the
 * counts' definition (so never hidden, expired, blocked or banned), not the profile itself, none
 * `profile` has reacted to, none that skipped `profile` (no match is possible), no report between
 * the two in either direction.
 */
function candidatesWhere(profile: Pick<RoommateProfile, 'id'>, now: Date) {
  return {
    ...activeProfilesWhere(now),
    id: { not: profile.id },
    reactionsGot: { none: { fromProfileId: profile.id } },
    reactionsGiven: { none: { toProfileId: profile.id, kind: 'skip' } },
    ...notReportedWith(profile.id),
  } satisfies Prisma.RoommateProfileWhereInput;
}

/**
 * The profiles `profile` may be shown (spec 07 §Compatibility, FR-24), newest first by
 * `coalesce(renewed_at, activated_at)` (ties by id). One query loads the candidates
 * (`candidatesWhere`); they are then filtered in memory with the pure `isCompatible`, so the
 * result equals the rule by construction (**Assumption**: fine up to 2,000 active profiles; above
 * that the filter must move into SQL, see `src/lib/bot/README.md`).
 */
export async function findCompatible(
  profile: CompatibilityProfile & Pick<RoommateProfile, 'id'>,
  now: Date,
): Promise<RoommateProfile[]> {
  const candidates = await prisma.roommateProfile.findMany({
    where: candidatesWhere(profile, now),
  });
  return candidates
    .filter((candidate) => isCompatible(profile, candidate))
    .sort((a, b) => freshness(b) - freshness(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** A profile id as the database stores it; anything else in a callback names no profile. */
const PROFILE_ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The profile a card button names (`rm:x:<id>`, and the other card buttons of spec 07 §Cards)
 * when `findCompatible(viewer, now)` would still return it, else null: gone, hidden, expired, its
 * chat blocked or banned, reacted to, skipped the viewer, reported either way, no longer
 * compatible, the viewer itself, or an id of the wrong shape. The id from the callback is checked
 * here, never trusted.
 */
export async function findVisibleProfile(
  viewer: CompatibilityProfile & Pick<RoommateProfile, 'id'>,
  targetId: string,
  now: Date,
): Promise<RoommateProfile | null> {
  if (!PROFILE_ID_SHAPE.test(targetId) || targetId === viewer.id) return null;
  const target = await prisma.roommateProfile.findFirst({
    where: { ...candidatesWhere(viewer, now), id: targetId },
  });
  return target && isCompatible(viewer, target) ? target : null;
}

/** A profile `reporter` may report, and whether `reporter` already did. */
export type ReportableProfile = { target: RoommateProfile; alreadyReported: boolean };

/**
 * Who may report whom (spec 07 §Report): the profile a Report button names (`rm:r:<id>`,
 * `rm:rr:<reason>:<id>`) when `reporter` holds a reaction to it (a card they answered, or a reveal
 * of it: a reveal is claimed on the receiving person's own `interest` reaction), already reported
 * it, or may be shown it as a card now (`findVisibleProfile`: a card not answered yet). Else null:
 * gone, never a card for this person, the reporter itself, or an id of the wrong shape. Not the
 * card visibility rule alone, which hides reacted and reported profiles, so the Report button under
 * a reveal works; the id from the callback is checked here, never trusted. A hidden or expired
 * target is returned as it is (the caller decides).
 */
export async function findReportableProfile(
  reporter: CompatibilityProfile & Pick<RoommateProfile, 'id'>,
  targetId: string,
  now: Date,
): Promise<ReportableProfile | null> {
  if (!PROFILE_ID_SHAPE.test(targetId) || targetId === reporter.id) return null;
  const [reports, reactions] = await Promise.all([
    prisma.roommateReport.count({
      where: { reporterProfileId: reporter.id, targetProfileId: targetId },
    }),
    prisma.roommateReaction.count({
      where: { fromProfileId: reporter.id, toProfileId: targetId },
    }),
  ]);
  const target =
    reports + reactions > 0
      ? await prisma.roommateProfile.findUnique({ where: { id: targetId } })
      : await findVisibleProfile(reporter, targetId, now);
  return target ? { target, alreadyReported: reports > 0 } : null;
}

/**
 * Stores a report (spec 07 §Report, FR-31): one row per reporter and target, created at `now`.
 * `already` when the pair already holds one (the unique pair inserts nothing: a repeat or an
 * overlapping tap), `gone` when the target was deleted since the check.
 */
export async function storeReport(
  reporterProfileId: string,
  targetProfileId: string,
  reason: ReportReason,
  now: Date,
): Promise<'stored' | 'already' | 'gone'> {
  try {
    const { count } = await prisma.roommateReport.createMany({
      data: [{ reporterProfileId, targetProfileId, reason, createdAt: now }],
      skipDuplicates: true,
    });
    return count === 1 ? 'stored' : 'already';
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return 'gone';
    }
    throw error;
  }
}

/**
 * The reports that count toward `HIDE_AT_REPORTERS` (spec 07 §Automatic hiding): those of a
 * reporter whose profile still exists and whose decision the owner has not lifted. The pair is
 * unique, so each is a different reporter; a chat holds one profile at a time, so deleting and
 * re-creating a profile adds no second reporter (the old report's reference is null).
 */
function countingReportsWhere(targetProfileId: string) {
  return {
    targetProfileId,
    reporterProfileId: { not: null },
    decision: { not: 'lifted' },
  } satisfies Prisma.RoommateReportWhereInput;
}

/**
 * What a stored report did (`hideAfterReport`): the `hidden_reason` when this request hid the
 * target; `already_hidden` when another request had hidden it after this request's check and this
 * request decided the reports that hide left undecided (`decideLateReports`); null otherwise.
 */
export type ReportHide = HiddenReason | 'already_hidden' | null;

/**
 * Automatic hiding after a stored report (spec 07 §Automatic hiding, FR-32, FR-34, D62): the
 * target is hidden when the new report's reason is `under_18` (at once, `hidden_reason=under_18`)
 * or when `HIDE_AT_REPORTERS` reports count (`countingReportsWhere`, `hidden_reason=reports`).
 *
 * The hide is one conditional update `where { id, hidden_at: null }`, so of two reports in the
 * same moment only one request hides. That request, in the same transaction, sets the chat's ban
 * marker `roommate_banned_at` (when null; it stays, D55) and marks the target's reports
 * `decision=hidden`, `automated=true`, `decided_at=now`; reports the owner lifted keep their
 * decision. Returns the reason for that one request; that request then sends the statement of
 * reasons and the reporters' notices (`sendHideMessages`, `src/lib/bot/roommate-hide-messages.ts`).
 *
 * Every other request decides what that hide could not see: a report inserted after the hide's
 * own decision update (`decideLateReports`). It returns `already_hidden` when it decided any and
 * then sends the reporters' notices (`sendLateHideNotices`), null when it decided none.
 */
export async function hideAfterReport(
  target: Pick<RoommateProfile, 'id' | 'chatId'>,
  reason: ReportReason,
  now: Date,
): Promise<ReportHide> {
  const hiddenReason: HiddenReason | null =
    reason === 'under_18'
      ? 'under_18'
      : (await prisma.roommateReport.count({ where: countingReportsWhere(target.id) })) >=
          HIDE_AT_REPORTERS
        ? 'reports'
        : null;
  if (hiddenReason && (await hideTarget(target, hiddenReason, now))) return hiddenReason;
  return (await decideLateReports(target.id, now)) ? 'already_hidden' : null;
}

/** The hide of `hideAfterReport`: true only for the request whose update changed the row. */
async function hideTarget(
  target: Pick<RoommateProfile, 'id' | 'chatId'>,
  hiddenReason: HiddenReason,
  now: Date,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // `statement_sent_at` and `appealed_at` are cleared so this hide gets its own statement of
    // reasons and its own `/appeal`, also after an owner's unhide of an earlier one (spec 07
    // §Statement of reasons, §Appeals and the owner's review).
    const { count } = await tx.roommateProfile.updateMany({
      where: { id: target.id, hiddenAt: null },
      data: {
        status: 'hidden',
        hiddenAt: now,
        hiddenReason,
        statementSentAt: null,
        appealedAt: null,
      },
    });
    if (count !== 1) return false;
    await tx.telegramChat.updateMany({
      where: { id: target.chatId, roommateBannedAt: null },
      data: { roommateBannedAt: now },
    });
    await tx.roommateReport.updateMany({
      where: { targetProfileId: target.id, decision: { not: 'lifted' } },
      data: { decision: 'hidden', automated: true, decidedAt: now },
    });
    return true;
  });
}

/**
 * Reports on a hidden target that its hide left undecided (spec 07 §Automatic hiding, FR-32
 * criterion 4): a request found the target visible at its check (`findReportableProfile`), and
 * another request hid it before this request's insert became visible to the hide's decision
 * update. They are decided as the hide decided the rest, in one update conditional on the
 * target's `hidden_at` in the same statement, so a visible target's reports stay undecided and
 * an owner's `lifted` stays lifted. It runs after this request's own insert (so it sees its own
 * report) and after its own hide attempt, which, when the rule is met, waits on a concurrent hide's
 * row lock and so sees that hide committed. It also runs when the rule is not met (the hider's
 * report no longer counts, or a rule that needs more reporters than one hide plus this report).
 *
 * True when it decided any. Whoever decides a report sends the target's notices afterwards (the
 * hiding request, or the request whose update here decided it), so each reporter is told; the
 * claims on `reporter_notified_at` keep it to once.
 */
async function decideLateReports(targetProfileId: string, now: Date): Promise<boolean> {
  const { count } = await prisma.roommateReport.updateMany({
    where: { targetProfileId, decision: 'none', targetProfile: { hiddenAt: { not: null } } },
    data: { decision: 'hidden', automated: true, decidedAt: now },
  });
  return count > 0;
}

/**
 * `/appeal` of a hidden profile (spec 07 §Appeals and the owner's review, FR-35): one conditional
 * update from `appealed_at` null, so a second `/appeal`, or two at once, records nothing more.
 * True only for the request that recorded it. The owner reviews appeals by hand
 * (`src/lib/bot/README.md` §Owner review).
 */
export async function recordAppeal(profileId: string, now: Date): Promise<boolean> {
  const { count } = await prisma.roommateProfile.updateMany({
    where: { id: profileId, status: 'hidden', appealedAt: null },
    data: { appealedAt: now },
  });
  return count === 1;
}

/**
 * The owner's `lifted` decision on an appeal (spec 07 §Appeals and the owner's review, D73;
 * `POST /api/cron/roommate-appeal`, `src/lib/bot/README.md` §Owner review): one transaction.
 * The profile goes back to `active` while `expires_at` is in the future, else to `expired` with
 * `expired_at` (as it was, else `expires_at`, so the daily cron still deletes it 14 days after
 * expiry); `hidden_at` and `hidden_reason` are cleared and `appealed_at` is kept. Every report on
 * it becomes `decision=lifted`, `automated=false`, `decided_at=now` (never counted toward a hide
 * again), and the chat's ban is cleared. The unhide is conditional on `status=hidden`, so of two
 * calls only one changes anything: true only for that one (the claim of the decision message).
 */
export async function liftHide(profileId: string, now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.roommateProfile.findUnique({
      where: { id: profileId },
      select: { chatId: true, status: true, expiresAt: true, expiredAt: true },
    });
    if (!profile || profile.status !== 'hidden') return false;
    const active = profile.expiresAt !== null && profile.expiresAt > now;
    const { count } = await tx.roommateProfile.updateMany({
      where: { id: profileId, status: 'hidden' },
      data: {
        status: active ? 'active' : 'expired',
        ...(active ? {} : { expiredAt: profile.expiredAt ?? profile.expiresAt ?? now }),
        hiddenAt: null,
        hiddenReason: null,
      },
    });
    if (count !== 1) return false;
    await tx.roommateReport.updateMany({
      where: { targetProfileId: profileId },
      data: { decision: 'lifted', automated: false, decidedAt: now },
    });
    await tx.telegramChat.updateMany({
      where: { id: profile.chatId },
      data: { roommateBannedAt: null },
    });
    return true;
  });
}

/**
 * The owner's `upheld` decision on an appeal (spec 07 §Appeals, D73): the hide and the ban stay.
 * The claim of the decision message reuses `roommate_reports.automated` (the spec's Assumption: no
 * new column): the reports the hide decided (`decision=hidden`) are marked as reviewed by a person
 * (`automated=false`; `decision` and `decided_at` stay), in one statement conditional on the
 * profile still being hidden. True when any changed, so a repeat call finds none and sends nothing.
 */
export async function upholdHide(profileId: string): Promise<boolean> {
  const { count } = await prisma.roommateReport.updateMany({
    where: {
      targetProfileId: profileId,
      decision: 'hidden',
      automated: true,
      targetProfile: { status: 'hidden' },
    },
    data: { automated: false },
  });
  return count > 0;
}

/**
 * Gives back `upholdHide`'s claim when the decision message did not go out (a failed send, or a
 * 403), so the owner can call the route again. Only that claim writes `automated=false` on a
 * `decision=hidden` report, so this restores exactly what it took.
 */
export async function releaseUpheldHide(profileId: string): Promise<void> {
  await prisma.roommateReport.updateMany({
    where: { targetProfileId: profileId, decision: 'hidden', automated: false },
    data: { automated: true },
  });
}

/**
 * Stores "Skip" (spec 07 §Cards): one `skip` reaction from `fromProfileId` to `toProfileId`. The
 * pair is unique, so a repeat (a double tap) inserts nothing; a profile deleted since the
 * visibility check leaves nothing to store.
 */
export async function storeSkip(fromProfileId: string, toProfileId: string): Promise<void> {
  try {
    await prisma.roommateReaction.createMany({
      data: [{ fromProfileId, toProfileId, kind: 'skip' }],
      skipDuplicates: true,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') return;
    throw error;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The `interest` reactions `profileId` stored in the 24 hours before `now`, what the daily limit
 * of "Interested" counts (spec 07 §Interest, `INTEREST_DAILY_LIMIT`).
 */
export async function countRecentInterests(profileId: string, now: Date): Promise<number> {
  return prisma.roommateReaction.count({
    where: {
      fromProfileId: profileId,
      kind: 'interest',
      createdAt: { gt: new Date(now.getTime() - DAY_MS) },
    },
  });
}

/**
 * Stores "Interested" (spec 07 §Interest): one `interest` reaction from `fromProfileId` to
 * `toProfileId`, created at `now` (the clock the daily limit counts with). `already` when the pair
 * already holds a reaction (the unique pair inserts nothing: a double tap), `gone` when the target
 * was deleted since the visibility check.
 */
export async function storeInterest(
  fromProfileId: string,
  toProfileId: string,
  now: Date,
): Promise<'stored' | 'already' | 'gone'> {
  try {
    const { count } = await prisma.roommateReaction.createMany({
      data: [{ fromProfileId, toProfileId, kind: 'interest', createdAt: now }],
      skipDuplicates: true,
    });
    return count === 1 ? 'stored' : 'already';
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return 'gone';
    }
    throw error;
  }
}

/**
 * Forms the mutual match of two profiles (spec 07 §Interest and mutual match), in one statement:
 * `matched_at = now` on both reactions of the pair, only when both rows exist, both are `interest`
 * and both are unmatched. True only for the request whose statement changed the 2 rows (the
 * completer).
 *
 * The CTE locks the pair's unmatched interest rows in id order (`FOR UPDATE`, so two concurrent
 * statements wait for each other instead of deadlocking); a statement that waited re-checks
 * `matched_at IS NULL` on the rows the other one committed, finds none, and changes 0 rows. So two
 * concurrent taps form exactly one pair. A row missing (no interest back yet, a skip, a deleted
 * profile) leaves fewer than 2 rows, and nothing changes.
 */
export async function formMutualMatch(
  profileId: string,
  otherProfileId: string,
  now: Date,
): Promise<boolean> {
  const changed = await prisma.$executeRaw`
    WITH pair AS (
      SELECT id FROM roommate_reactions
      WHERE kind = 'interest'
        AND matched_at IS NULL
        AND (
          (from_profile_id = ${profileId}::uuid AND to_profile_id = ${otherProfileId}::uuid)
          OR (from_profile_id = ${otherProfileId}::uuid AND to_profile_id = ${profileId}::uuid)
        )
      ORDER BY id
      FOR UPDATE
    )
    UPDATE roommate_reactions
    SET matched_at = ${now}
    WHERE id IN (SELECT id FROM pair)
      AND (SELECT count(*) FROM pair) = 2`;
  return changed === 2;
}

/** The chat facts a reveal needs: where to send, whether it may, and in which language. */
const REVEAL_CHAT_SELECT = {
  chatId: true,
  blockedAt: true,
  locale: true,
  roommateBannedAt: true,
} as const;

/**
 * One person of a formed pair (spec 07 §Reveal): the profile, its chat and the person's own
 * `interest` reaction, whose `revealed_at` marks the reveal message to this person as claimed.
 */
export type RevealSide = {
  profile: RoommateProfile;
  chat: Prisma.TelegramChatGetPayload<{ select: typeof REVEAL_CHAT_SELECT }>;
  reaction: { id: string; createdAt: Date; revealedAt: Date | null };
};

/** A formed pair: the waiting person (the earlier interest) and the completer (the later one). */
export type RevealPair = { waiting: RevealSide; completer: RevealSide };

/**
 * The formed pair of two profiles with both people's profiles, chats and reactions, or null when
 * the two are not matched (or a profile is gone). The earlier interest is the waiting person's
 * (ties by reaction id), so a retry keeps the order of the first attempt.
 */
export async function loadMatchedPair(
  profileId: string,
  otherProfileId: string,
): Promise<RevealPair | null> {
  const rows = await prisma.roommateReaction.findMany({
    where: {
      kind: 'interest',
      matchedAt: { not: null },
      OR: [
        { fromProfileId: profileId, toProfileId: otherProfileId },
        { fromProfileId: otherProfileId, toProfileId: profileId },
      ],
    },
    include: { fromProfile: { include: { chat: { select: REVEAL_CHAT_SELECT } } } },
  });
  if (rows.length !== 2) return null;
  const [waiting, completer] = rows
    .sort(
      (x, y) =>
        x.createdAt.getTime() - y.createdAt.getTime() || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
    )
    .map(({ fromProfile: { chat, ...profile }, id, createdAt, revealedAt }) => ({
      profile,
      chat,
      reaction: { id, createdAt, revealedAt },
    }));
  return { waiting, completer };
}

/** Distinct unordered pairs of profile ids from reaction rows. */
function distinctPairs(rows: { fromProfileId: string; toProfileId: string }[]): [string, string][] {
  const pairs = new Map<string, [string, string]>();
  for (const { fromProfileId, toProfileId } of rows) {
    const pair: [string, string] =
      fromProfileId < toProfileId ? [fromProfileId, toProfileId] : [toProfileId, fromProfileId];
    pairs.set(pair.join(':'), pair);
  }
  return [...pairs.values()];
}

const UNREVEALED_MATCH = {
  kind: 'interest',
  matchedAt: { not: null },
  revealedAt: null,
} satisfies Prisma.RoommateReactionWhereInput;

/**
 * The other profile of every formed pair of `profileId` with a reveal not claimed yet on either
 * side: what Done under the reveal's username prompt retries (spec 07 §Reveal).
 */
export async function pendingRevealPartners(profileId: string): Promise<string[]> {
  const rows = await prisma.roommateReaction.findMany({
    where: { ...UNREVEALED_MATCH, OR: [{ fromProfileId: profileId }, { toProfileId: profileId }] },
    select: { fromProfileId: true, toProfileId: true },
  });
  return distinctPairs(rows).map(([x, y]) => (x === profileId ? y : x));
}

/**
 * The pairs the send-hour run retries (`retryPendingReveals`, spec 07 §Reveal): matched, a reveal
 * not claimed yet, both profiles active by the counts' definition (so both chats unblocked and not
 * banned) and both usernames stored. A pair waiting on a username stays out until Done stores one.
 * The oldest matches first.
 */
export async function dueRevealPairs(now: Date, take: number): Promise<[string, string][]> {
  const ready = { ...activeProfilesWhere(now), tgUsername: { not: null } };
  const rows = await prisma.roommateReaction.findMany({
    where: { ...UNREVEALED_MATCH, fromProfile: ready, toProfile: ready },
    select: { fromProfileId: true, toProfileId: true },
    orderBy: { matchedAt: 'asc' },
    take,
  });
  return distinctPairs(rows);
}

/**
 * Claims the reveal message to the person whose reaction this is (`revealed_at` null → `now`, a
 * conditional update): true only for the one request that may send it.
 */
export async function claimReveal(reactionId: string, now: Date): Promise<boolean> {
  const { count } = await prisma.roommateReaction.updateMany({
    where: { id: reactionId, matchedAt: { not: null }, revealedAt: null },
    data: { revealedAt: now },
  });
  return count === 1;
}

/** Undoes `claimReveal` after a failed send, so a retry sends it. */
export async function releaseReveal(reactionId: string, now: Date): Promise<void> {
  await prisma.roommateReaction.updateMany({
    where: { id: reactionId, revealedAt: now },
    data: { revealedAt: null },
  });
}

/** The Telegram chat id of a chat row, for an event about another person (`tg_<chatId>`). */
export async function telegramChatIdOf(chatDbId: string): Promise<number | null> {
  const chat = await prisma.telegramChat.findUnique({
    where: { id: chatDbId },
    select: { chatId: true },
  });
  return chat ? Number(chat.chatId) : null;
}

/**
 * Stores a district pick while the profile is still at `step`, so an answer to a
 * step that has moved on changes nothing (spec 06 "Stale and repeated taps").
 */
export async function setDistrictPick(
  profileId: string,
  step: string,
  pick: DistrictPick,
): Promise<boolean> {
  const { count } = await prisma.roommateProfile.updateMany({
    where: { id: profileId, step },
    data: { districtSlugs: [...pick.districtSlugs], anyDistrict: pick.anyDistrict },
  });
  return count === 1;
}

/**
 * Stores the ticked languages while the profile is still at `step` (the
 * languages step's toggles, spec 06 "Stale and repeated taps").
 */
export async function setLanguages(
  profileId: string,
  step: string,
  languages: readonly string[],
): Promise<boolean> {
  const { count } = await prisma.roommateProfile.updateMany({
    where: { id: profileId, step },
    data: { languages: [...languages] },
  });
  return count === 1;
}

/**
 * Saves a finished draft (spec 06 §Save): active, no open step, activated and
 * 18+ confirmed at `now`, hiding at `computeExpiresAt(now, moveInMonth)`. One
 * conditional write on `status = 'draft'`: true for exactly one of two
 * overlapping taps on "I'm 18+", so only that one sends the event and the card.
 * With `step` (`save_month`, a month that passed while the draft was open) the
 * new month is stored too and the write also needs the draft at that step.
 */
export async function saveProfile(
  profileId: string,
  moveInMonth: Date,
  now: Date,
  step?: string,
): Promise<{ saved: true; expiresAt: Date } | { saved: false }> {
  const expiresAt = computeExpiresAt(now, moveInMonth);
  const { count } = await prisma.roommateProfile.updateMany({
    where: { id: profileId, status: 'draft', ...(step ? { step } : {}) },
    data: {
      status: 'active',
      step: null,
      activatedAt: now,
      expiresAt,
      adultConfirmedAt: now,
      ...(step ? { moveInMonth } : {}),
    },
  });
  return count === 1 ? { saved: true, expiresAt } : { saved: false };
}

/**
 * Stores a step's answer and moves the profile from step `from` to `to` in one
 * conditional write: false when the profile is no longer at `from` (a repeated
 * tap, a redelivered update, an older message), and then nothing changed (spec 06
 * "Stale and repeated taps").
 */
export async function advanceStep(
  profileId: string,
  from: string,
  to: string | null,
  answer: StepAnswer = {},
): Promise<boolean> {
  const { count } = await prisma.roommateProfile.updateMany({
    where: { id: profileId, step: from },
    data: { ...answer, step: to },
  });
  return count === 1;
}
