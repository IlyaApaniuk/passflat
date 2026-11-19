import { Prisma, type RoommateProfile } from '@prisma/client';

import { prisma } from '@/lib/prisma';

import { INTAKE_STEPS, type DistrictPick } from './rules';
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
 * Opens an edit step (`edit_<field>`) on a saved (active or expired) profile; the profile stays
 * active and counted (spec 06 §Save and the own card, Edit). An edit step already open is
 * replaced: the person picked another field.
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

/** Leaves an edit or renewal step of a saved profile; the profile itself stays as it was. */
export async function clearEditStep(profileId: string, step: string): Promise<boolean> {
  const { count } = await prisma.roommateProfile.updateMany({
    where: { id: profileId, step, status: { in: ['active', 'expired'] } },
    data: { step: null },
  });
  return count === 1;
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
 */
export async function saveProfile(
  profileId: string,
  moveInMonth: Date,
  now: Date,
): Promise<{ saved: true; expiresAt: Date } | { saved: false }> {
  const expiresAt = computeExpiresAt(now, moveInMonth);
  const { count } = await prisma.roommateProfile.updateMany({
    where: { id: profileId, status: 'draft' },
    data: {
      status: 'active',
      step: null,
      activatedAt: now,
      expiresAt,
      adultConfirmedAt: now,
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
