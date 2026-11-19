import { GrammyError, InlineKeyboard, type Api } from 'grammy';

import { prisma } from '@/lib/prisma';
import { activeProfilesWhere } from '@/lib/roommate/counts';
import {
  DRAFT_LIFE_DAYS,
  GRACE_DAYS,
  OUTCOMES,
  OUTCOME_QUESTION_DAYS,
  RENEWAL_REMINDER_DAYS,
  REPORT_LIFE_MONTHS,
  countBand,
  type Outcome,
} from '@/lib/roommate/rules';
import { findCompatible, freshness } from '@/lib/roommate/store';
import { isMatchingEnabled } from '@/lib/roommate/switch';
import { formatWarsawDate, isRoommateSendHour, isSameWarsawDay } from '@/lib/roommate/time';

import { track } from './analytics';
import { retryHideNotices, retryStatements } from './roommate-hide-messages';
import { retryPendingReveals } from './roommate-reveal';
import { roommateLocale, rt, rtPeople, type RoommateLocale } from './roommate-texts';
import { plural } from './texts';

/**
 * The jobs of the roommate daily cron (spec 06 §Daily cron; FR-15, FR-12 criterion 4, D55, D68):
 * the housekeeping every run does, and the messages the send-hour run sends through one shared
 * claim-send-release helper (`createCronSender`). `GET /api/cron/roommate-daily` delegates here.
 *
 * Nothing here logs a chat id, a username, a text or an error object: only an error's message.
 */

/** Messages one run sends at most; the rest wait for the next day (Assumption, spec 06). */
export const MAX_MESSAGES_PER_RUN = 1000;

/**
 * No new send starts this long after the run began (Assumption, spec 06): the function has 60 s,
 * and PostHog sends one request per event before the response.
 */
export const SEND_BUDGET_MS = 45_000;

/** Messages a second at most, below Telegram's broadcast limit (Assumption, spec 06). */
export const MESSAGES_PER_SECOND = 25;

/** An edit or renewal step left open this long is cleared (spec 06 §Entry and routing). */
const OPEN_STEP_LIFE_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MIN_SEND_INTERVAL_MS = 1000 / MESSAGES_PER_SECOND;

// ---------------------------------------------------------------------------------------------
// Housekeeping (spec 06 §Daily cron step 1, §Retention), every run
// ---------------------------------------------------------------------------------------------

export type HousekeepingCounts = {
  draftsDeleted: number;
  openStepsCleared: number;
  expired: number;
  deletedExpired: number;
  deletedModeration: number;
  reportsDeleted: number;
};

/** The instant `months` calendar months (UTC fields) before `now`. */
function monthsBefore(now: Date, months: number): Date {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
}

const CHAT_ID_SELECT = { id: true, chat: { select: { chatId: true } } } as const;

/**
 * Deletes each due row of one kind through its own conditional `deleteMany({ id, status })`
 * and sends one `tg_roommate_profile_deleted` per row whose delete landed, so a doubled run
 * (Vercel can invoke a cron twice) sends each event once. Reactions cascade and report
 * references are nulled by the foreign keys; the chat's ban marker stays (D55).
 */
async function deleteDue(
  status: 'expired' | 'hidden',
  dateWhere: { expiredAt: { lte: Date } } | { expiresAt: { lte: Date } },
  reason: 'expired' | 'moderation',
): Promise<number> {
  const due = await prisma.roommateProfile.findMany({
    where: { status, ...dateWhere },
    select: CHAT_ID_SELECT,
  });
  let deleted = 0;
  for (const row of due) {
    const { count } = await prisma.roommateProfile.deleteMany({ where: { id: row.id, status } });
    if (count !== 1) continue; // another run, a renewal or the owner's delete got there first
    deleted += 1;
    track(Number(row.chat.chatId), 'tg_roommate_profile_deleted', { reason });
  }
  return deleted;
}

/**
 * Spec 06 §Daily cron step 1, idempotent: drafts untouched for `DRAFT_LIFE_DAYS`; edit and renewal
 * steps of saved profiles untouched for 24 hours; active profiles past `expires_at` marked
 * expired (one `tg_roommate_profile_expired` each); expired profiles past their grace and hidden
 * profiles past `expires_at` + `GRACE_DAYS` deleted (one `tg_roommate_profile_deleted` each);
 * reports older than `REPORT_LIFE_MONTHS`.
 */
export async function runRoommateHousekeeping(now: Date): Promise<HousekeepingCounts> {
  const drafts = await prisma.roommateProfile.deleteMany({
    where: {
      status: 'draft',
      updatedAt: { lte: new Date(now.getTime() - DRAFT_LIFE_DAYS * DAY_MS) },
    },
  });

  // An expired profile can hold an edit or a renewal step too; left open it would keep the
  // deposit questions from starting until the profile is deleted.
  const openSteps = await prisma.roommateProfile.updateMany({
    where: {
      status: { in: ['active', 'expired'] },
      step: { not: null },
      updatedAt: { lte: new Date(now.getTime() - OPEN_STEP_LIFE_HOURS * HOUR_MS) },
    },
    data: { step: null },
  });

  const dueToExpire = await prisma.roommateProfile.findMany({
    where: { status: 'active', expiresAt: { lte: now } },
    select: CHAT_ID_SELECT,
  });
  let expired = 0;
  for (const row of dueToExpire) {
    // `expires_at` is checked again: a renewal between the read and this write moved it.
    const { count } = await prisma.roommateProfile.updateMany({
      where: { id: row.id, status: 'active', expiresAt: { lte: now } },
      data: { status: 'expired', expiredAt: now },
    });
    if (count !== 1) continue;
    expired += 1;
    track(Number(row.chat.chatId), 'tg_roommate_profile_expired');
  }

  const graceCutoff = new Date(now.getTime() - GRACE_DAYS * DAY_MS);
  const deletedExpired = await deleteDue('expired', { expiredAt: { lte: graceCutoff } }, 'expired');
  const deletedModeration = await deleteDue(
    'hidden',
    { expiresAt: { lte: graceCutoff } },
    'moderation',
  );

  const reports = await prisma.roommateReport.deleteMany({
    where: { createdAt: { lte: monthsBefore(now, REPORT_LIFE_MONTHS) } },
  });

  return {
    draftsDeleted: drafts.count,
    openStepsCleared: openSteps.count,
    expired,
    deletedExpired,
    deletedModeration,
    reportsDeleted: reports.count,
  };
}

// ---------------------------------------------------------------------------------------------
// The claim-send-release helper (spec 06 §Daily cron, "Rules for every message of the cron")
// ---------------------------------------------------------------------------------------------

/** Wall-clock time for the rate and the time budget; tests pass a fake one. */
export type CronClock = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

export const SYSTEM_CLOCK: CronClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * One message of a cron job. `claim` is the conditional `updateMany` on the column the message
 * sets and returns true only when it updated one row; `release` undoes it so the next day
 * retries. `blockedAt` is the chat's `blocked_at` as the job read it.
 */
export type CronMessage = {
  /** `telegram_chats.chat_id` of the recipient. */
  chatId: bigint;
  blockedAt: Date | null;
  claim: () => Promise<boolean>;
  release: () => Promise<void>;
  text: string;
  options?: Parameters<Api['sendMessage']>[2];
  /** Runs once the message was delivered (its event, for example). */
  onSent?: () => void;
  /**
   * The claim runs for a blocked chat too, and only the message is skipped: the closing route
   * (`roommate-close.ts`) deletes every profile whether or not its chat can be written to.
   */
  claimWhenBlocked?: boolean;
  /**
   * A 403 releases the claim too, so the column stays null for a chat that blocked the bot: the
   * statement of reasons (spec 07 §Statement of reasons: a blocked chat keeps `statement_sent_at`
   * null, which the owner's SQL shows). The retry reads unblocked chats only, so it goes out once
   * the person writes to the bot again.
   */
  releaseWhenBlocked?: boolean;
};

/** `taken`: another run (or the person) claimed the row first; nothing was sent. */
type SendOutcome = 'sent' | 'skipped' | 'taken' | 'blocked' | 'failed' | 'stopped';

type StopReason = 'rate_limited' | 'message_cap' | 'time_budget';

type CronSendCounts = {
  sent: number;
  blocked: number;
  failed: number;
  skipped: number;
  stopped: StopReason | null;
};

export type CronSender = {
  /** The bot API the messages go through, for a job that reads from Telegram first (`getChat`). */
  readonly api: Api;
  send: (message: CronMessage) => Promise<SendOutcome>;
  /** Set once no further message may start in this run; a job stops iterating then. */
  readonly stopped: StopReason | null;
  counts: () => CronSendCounts;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

/**
 * The one helper every message of the roommate cron goes through: a chat already blocked (as
 * read, or by a 403 earlier in this run) is skipped; the row is claimed before the send and sent
 * only when the claim landed; a 403 marks the chat blocked and keeps the claim; any other error
 * releases it, and a 429 also stops all sending for the run; messages go one by one, at most
 * `MESSAGES_PER_SECOND` a second and `MAX_MESSAGES_PER_RUN` a run, and none starts after
 * `SEND_BUDGET_MS` from `startedAt` (the start of the run).
 */
export function createCronSender(
  api: Api,
  { now, startedAt, clock = SYSTEM_CLOCK }: { now: Date; startedAt: number; clock?: CronClock },
): CronSender {
  const blockedChats = new Set<bigint>();
  const counts = { sent: 0, blocked: 0, failed: 0, skipped: 0 };
  let attempts = 0;
  let lastSendAt: number | null = null;
  let stopped: StopReason | null = null;

  async function release(message: CronMessage) {
    try {
      await message.release();
    } catch (error) {
      console.error('[bot/roommate] cron claim release failed', errorMessage(error));
    }
  }

  async function send(message: CronMessage): Promise<SendOutcome> {
    if (!stopped && attempts >= MAX_MESSAGES_PER_RUN) stopped = 'message_cap';
    if (!stopped && clock.now() - startedAt >= SEND_BUDGET_MS) stopped = 'time_budget';
    if (stopped) return 'stopped';

    if (message.blockedAt || blockedChats.has(message.chatId)) {
      if (message.claimWhenBlocked && !(await message.claim())) return 'taken';
      counts.skipped += 1;
      return 'skipped';
    }
    if (!(await message.claim())) return 'taken';

    if (lastSendAt !== null) {
      const wait = lastSendAt + MIN_SEND_INTERVAL_MS - clock.now();
      if (wait > 0) await clock.sleep(wait);
    }
    lastSendAt = clock.now();
    attempts += 1;

    try {
      await api.sendMessage(Number(message.chatId), message.text, message.options);
    } catch (error) {
      if (error instanceof GrammyError && error.error_code === 403) {
        // The person blocked the bot: no message to this chat until it writes again.
        counts.blocked += 1;
        blockedChats.add(message.chatId);
        await prisma.telegramChat.updateMany({
          where: { chatId: message.chatId },
          data: { blockedAt: now },
        });
        if (message.releaseWhenBlocked) await release(message);
        return 'blocked';
      }
      counts.failed += 1;
      await release(message);
      if (error instanceof GrammyError && error.error_code === 429) {
        stopped = 'rate_limited';
        return 'stopped';
      }
      // The message only: a GrammyError's payload holds the chat id.
      console.error('[bot/roommate] cron message failed', errorMessage(error));
      return 'failed';
    }

    counts.sent += 1;
    message.onSent?.();
    return 'sent';
  }

  return {
    api,
    send,
    get stopped() {
      return stopped;
    },
    counts: () => ({ ...counts, stopped }),
  };
}

// ---------------------------------------------------------------------------------------------
// The run (spec 06 §Daily cron)
// ---------------------------------------------------------------------------------------------

/**
 * One message job of the send-hour run: reads its due rows (chats with `blocked_at` null) and
 * passes each to `sender.send`, stopping as soon as `sender.stopped` is set.
 */
export type MessageJob = (sender: CronSender, now: Date) => Promise<void>;

/**
 * The reminder's buttons: "Renew for 30 days" and "Delete", handled in `roommate-flow.ts`
 * (`rm:c:renew`, `rm:c:del`), which this module does not import (it would pull the whole
 * conversation into the cron).
 */
function renewalReminderKeyboard(locale: RoommateLocale): InlineKeyboard {
  return InlineKeyboard.from([
    [InlineKeyboard.text(rt(locale, 'btnRenew'), 'rm:c:renew')],
    [InlineKeyboard.text(rt(locale, 'btnDelete'), 'rm:c:del')],
  ]);
}

/**
 * The renewal reminder (spec 06 §Renewal, FR-15): from the first send-hour run at or after
 * `expires_at − RENEWAL_REMINDER_DAYS`, one message per active profile with
 * `renewal_reminded_at` null, naming the date it hides (not "in 3 days": a profile capped by its
 * month's end can have less), with Renew and Delete. Claimed on `renewal_reminded_at`; the claim
 * also checks `expires_at` as read, so a renewal between the read and the claim is not reminded
 * of the old date. A renewal clears `renewal_reminded_at`, so the next date is reminded again.
 * The earliest hide dates go first. No event (spec 06 §Events has none for the reminder).
 */
const sendRenewalReminders: MessageJob = async (sender, now) => {
  const due = await prisma.roommateProfile.findMany({
    where: {
      status: 'active',
      renewalRemindedAt: null,
      expiresAt: { lte: new Date(now.getTime() + RENEWAL_REMINDER_DAYS * DAY_MS) },
      chat: { blockedAt: null },
    },
    select: {
      id: true,
      expiresAt: true,
      chat: { select: { chatId: true, blockedAt: true, locale: true } },
    },
    orderBy: { expiresAt: 'asc' },
    take: MAX_MESSAGES_PER_RUN,
  });

  for (const row of due) {
    if (sender.stopped) return;
    const { expiresAt } = row;
    if (!expiresAt) continue; // never: the `lte` filter leaves out null
    const locale = roommateLocale(row.chat.locale);
    await sender.send({
      chatId: row.chat.chatId,
      blockedAt: row.chat.blockedAt,
      claim: async () => {
        const { count } = await prisma.roommateProfile.updateMany({
          where: { id: row.id, status: 'active', renewalRemindedAt: null, expiresAt },
          data: { renewalRemindedAt: now },
        });
        return count === 1;
      },
      release: async () => {
        await prisma.roommateProfile.updateMany({
          where: { id: row.id, renewalRemindedAt: now },
          data: { renewalRemindedAt: null },
        });
      },
      text: rt(locale, 'renewalReminder', { date: formatWarsawDate(expiresAt, locale) }),
      options: { reply_markup: renewalReminderKeyboard(locale) },
    });
  }
};

/** The label of each answer of the outcome question, one button a row, in the spec's order. */
const OUTCOME_LABEL = {
  renting_together: 'btnOutcomeRenting',
  talking: 'btnOutcomeTalking',
  no_fit: 'btnOutcomeNoFit',
  dont_ask: 'btnOutcomeDontAsk',
} as const satisfies Record<Outcome, string>;

/**
 * The outcome question's buttons (`rm:o:<outcome>`), handled in `roommate-matching.ts`, which this
 * module does not import.
 */
function outcomeKeyboard(locale: RoommateLocale): InlineKeyboard {
  return InlineKeyboard.from(
    OUTCOMES.map((outcome) => [
      InlineKeyboard.text(rt(locale, OUTCOME_LABEL[outcome]), `rm:o:${outcome}`),
    ]),
  );
}

/**
 * The outcome question (spec 07 §Outcome question, FR-29; D68), switch on or off: every active or
 * expired profile with `outcome_asked_at` null whose earliest `matched_at` is at least
 * `OUTCOME_QUESTION_DAYS` old (one of its reactions matched at or before that cutoff; both
 * reactions of a pair are matched together) gets "Did you find someone to rent with?" with the
 * four answers. Claimed on `outcome_asked_at`, so it is asked once per profile life (a renewal
 * keeps it); a release clears it so the next day retries. A hidden or deleted profile is not
 * asked. The earliest activated first. No event: only the answer sends one (`rm:o:<outcome>`).
 */
const sendOutcomeQuestions: MessageJob = async (sender, now) => {
  const matchedBy = new Date(now.getTime() - OUTCOME_QUESTION_DAYS * DAY_MS);
  const due = await prisma.roommateProfile.findMany({
    where: {
      status: { in: ['active', 'expired'] },
      outcomeAskedAt: null,
      reactionsGiven: { some: { matchedAt: { lte: matchedBy } } },
      chat: { blockedAt: null },
    },
    select: { id: true, chat: { select: { chatId: true, blockedAt: true, locale: true } } },
    orderBy: { activatedAt: 'asc' },
    take: MAX_MESSAGES_PER_RUN,
  });

  for (const row of due) {
    if (sender.stopped) return;
    const locale = roommateLocale(row.chat.locale);
    await sender.send({
      chatId: row.chat.chatId,
      blockedAt: row.chat.blockedAt,
      claim: async () => {
        const { count } = await prisma.roommateProfile.updateMany({
          where: { id: row.id, status: { in: ['active', 'expired'] }, outcomeAskedAt: null },
          data: { outcomeAskedAt: now },
        });
        return count === 1;
      },
      release: async () => {
        await prisma.roommateProfile.updateMany({
          where: { id: row.id, outcomeAskedAt: now },
          data: { outcomeAskedAt: null },
        });
      },
      text: rt(locale, 'outcomeQuestion'),
      options: { reply_markup: outcomeKeyboard(locale) },
    });
  }
};

/** A stage 2 job (spec 07 §Switch): runs only while the matching switch is on, read per run. */
function switchOnOnly(job: MessageJob): MessageJob {
  return async (sender, now) => {
    if (isMatchingEnabled()) await job(sender, now);
  };
}

/**
 * "Matching is open. N people fit you right now." (PRD 3 §8), the verb agreeing with N; N = 0 says
 * nobody fits yet and, only while the daily push is on (it is what backs the sentence), that the
 * bot writes once a day when someone new fits (FR-19 criterion 4).
 */
function matchingOpenText(locale: RoommateLocale, count: number, pushOn: boolean): string {
  if (count === 0) {
    const nobody = rt(locale, 'openNobody');
    return pushOn ? `${nobody} ${rt(locale, 'openNobodyDaily')}` : nobody;
  }
  const one = locale === 'en' ? count === 1 : plural(count, ['one', 'many', 'many']) === 'one';
  return rt(locale, one ? 'openFitsOne' : 'openFitsMany', {
    count: String(count),
    people: rtPeople(locale, count),
  });
}

/**
 * The one-time "matching is open" message (spec 06 §Matching is open, FR-19, D49), switch on only:
 * every active profile (the counts' definition, so its chat is neither blocked nor banned) that
 * opted in (`notify_on_open_at`) and has not had it (`notified_open_at` null) gets the number of
 * people who fit it now (`findCompatible`) and "Show" (`rm:show:o`, spec 07 §Cards). Claimed on
 * `notified_open_at`; the claim also checks the opt-in is still on and sets `last_push_at` to the
 * send time, so the daily push gives this profile nothing the same day; a release restores both.
 * Earliest opt-ins first. Each delivered message sends `tg_roommate_open_notified` with
 * `count_band` only.
 */
const sendMatchingOpenMessages: MessageJob = async (sender, now) => {
  const due = await prisma.roommateProfile.findMany({
    where: { ...activeProfilesWhere(now), notifyOnOpenAt: { not: null }, notifiedOpenAt: null },
    include: { chat: { select: { chatId: true, blockedAt: true, locale: true } } },
    orderBy: { notifyOnOpenAt: 'asc' },
    take: MAX_MESSAGES_PER_RUN,
  });

  for (const { chat, ...profile } of due) {
    if (sender.stopped) return;
    const count = (await findCompatible(profile, now)).length;
    const locale = roommateLocale(chat.locale);
    await sender.send({
      chatId: chat.chatId,
      blockedAt: chat.blockedAt,
      claim: async () => {
        const claimed = await prisma.roommateProfile.updateMany({
          where: {
            id: profile.id,
            status: 'active',
            notifyOnOpenAt: { not: null },
            notifiedOpenAt: null,
          },
          data: { notifiedOpenAt: now, lastPushAt: now },
        });
        return claimed.count === 1;
      },
      release: async () => {
        await prisma.roommateProfile.updateMany({
          where: { id: profile.id, notifiedOpenAt: now },
          data: { notifiedOpenAt: null, lastPushAt: profile.lastPushAt },
        });
      },
      text: matchingOpenText(locale, count, !profile.pushOff),
      options: {
        reply_markup: InlineKeyboard.from([
          [InlineKeyboard.text(rt(locale, 'btnShow'), 'rm:show:o')],
        ]),
      },
      onSent: () =>
        track(Number(chat.chatId), 'tg_roommate_open_notified', { count_band: countBand(count) }),
    });
  }
};

/** "<N> new people fit you" (PRD 3 §8 "Daily push"); RU / UK read the same for every N. */
function dailyPushText(locale: RoommateLocale, count: number): string {
  return rt(locale, count === 1 ? 'pushNewOne' : 'pushNewMany', { count: String(count) });
}

/**
 * The daily push (spec 07 §Daily push, FR-27, D49, D68), switch on only: every active profile (the
 * counts' definition, so never hidden, expired, blocked or banned) with `push_off` false gets
 * "<N> new people fit you" with "Show" (`rm:show:p`, spec 07 §Cards) and "Stop daily messages"
 * (`rm:push:off`), where N counts the profiles of `findCompatible` (so none it has reacted to)
 * that came up (`coalesce(renewed_at, activated_at)`) after `coalesce(last_push_at,
 * activated_at)` of this profile and at or before `now`, the instant the claim writes, so the
 * next push counts from where this one stopped. N = 0 → no message and nothing written. A
 * profile whose last push (or the one-time message, which sets `last_push_at`) went out the same
 * Warsaw day gets none, so a cron invoked twice in the send hour writes once a day. Claimed on
 * `last_push_at` as read (the claim also checks the push is still on); a release restores it.
 * Each delivered push sends `tg_roommate_push_sent` with `count_band` only.
 */
const sendDailyPushes: MessageJob = async (sender, now) => {
  const due = await prisma.roommateProfile.findMany({
    where: { ...activeProfilesWhere(now), pushOff: false },
    include: { chat: { select: { chatId: true, blockedAt: true, locale: true } } },
    orderBy: { activatedAt: 'asc' },
  });

  for (const { chat, ...profile } of due) {
    if (sender.stopped) return;
    const { lastPushAt } = profile;
    if (lastPushAt && isSameWarsawDay(lastPushAt, now)) continue;
    const since = (lastPushAt ?? profile.activatedAt)?.getTime() ?? 0;
    const count = (await findCompatible(profile, now)).filter((candidate) => {
      const cameUp = freshness(candidate);
      return cameUp > since && cameUp <= now.getTime();
    }).length;
    if (count === 0) continue;
    const locale = roommateLocale(chat.locale);
    await sender.send({
      chatId: chat.chatId,
      blockedAt: chat.blockedAt,
      claim: async () => {
        const claimed = await prisma.roommateProfile.updateMany({
          where: { id: profile.id, status: 'active', pushOff: false, lastPushAt },
          data: { lastPushAt: now },
        });
        return claimed.count === 1;
      },
      release: async () => {
        await prisma.roommateProfile.updateMany({
          where: { id: profile.id, lastPushAt: now },
          data: { lastPushAt },
        });
      },
      text: dailyPushText(locale, count),
      options: {
        reply_markup: InlineKeyboard.from([
          [InlineKeyboard.text(rt(locale, 'btnShow'), 'rm:show:p')],
          [InlineKeyboard.text(rt(locale, 'btnPushOff'), 'rm:push:off')],
        ]),
      },
      onSent: () =>
        track(Number(chat.chatId), 'tg_roommate_push_sent', { count_band: countBand(count) }),
    });
  }
};

/**
 * The send-hour jobs in the priority order of spec 06 §Daily cron step 2, so the important ones go
 * first when the cap or the time budget runs out:
 * 1. the retry of unsent statements of reasons (`retryStatements`, `roommate-hide-messages.ts`,
 *    spec 07 FR-33);
 * 2. the retry of waiting reveals (`retryPendingReveals`, `roommate-reveal.ts`, spec 07 §Reveal);
 * 3. the retry of unsent hide notices to reporters (`retryHideNotices`,
 *    `roommate-hide-messages.ts`, spec 07 §Automatic hiding);
 * 4. the renewal reminders (§Renewal, `sendRenewalReminders`);
 * 5. the outcome question (spec 07 FR-29, `sendOutcomeQuestions`);
 * 6. switch on only: the one-time message (§Matching is open, `sendMatchingOpenMessages`, T082);
 * 7. switch on only: the daily push (spec 07 FR-27, `sendDailyPushes`).
 * The retries and the outcome question run with the switch on or off.
 */
const MESSAGE_JOBS: readonly MessageJob[] = [
  retryStatements,
  retryPendingReveals,
  retryHideNotices,
  sendRenewalReminders,
  sendOutcomeQuestions,
  switchOnOnly(sendMatchingOpenMessages),
  switchOnOnly(sendDailyPushes),
];

export type RoommateDailyResult = {
  housekeeping: HousekeepingCounts;
  messages: CronSendCounts | { skipped: 'bot not configured' | 'not the send hour' };
};

/**
 * One cron run: housekeeping always; the message jobs only when a bot is configured and `now` is
 * the send hour (10:xx Warsaw, `isRoommateSendHour`). The result holds counts only, never a chat
 * id, a username or a text. The caller flushes PostHog before it answers.
 */
export async function runRoommateDaily(
  api: Api | null,
  now: Date,
  {
    jobs = MESSAGE_JOBS,
    clock = SYSTEM_CLOCK,
  }: { jobs?: readonly MessageJob[]; clock?: CronClock } = {},
): Promise<RoommateDailyResult> {
  const startedAt = clock.now();
  const housekeeping = await runRoommateHousekeeping(now);

  if (!api) return { housekeeping, messages: { skipped: 'bot not configured' } };
  if (!isRoommateSendHour(now)) return { housekeeping, messages: { skipped: 'not the send hour' } };

  const sender = createCronSender(api, { now, startedAt, clock });
  for (const job of jobs) {
    if (sender.stopped) break;
    await job(sender, now);
  }
  return { housekeeping, messages: sender.counts() };
}
