import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

/**
 * Honest counts of who is looking (PRD 3 FR-16, spec 06 §Counts), the one counting
 * rule the bot and the website share (server only for the loader).
 *
 * In stage 1 these numbers are the only thing a person learns about other people
 * (D49). A count is per district and never combined with budget, month, language,
 * gender or "live with" (D51); a profile naming several districts counts in each,
 * an "any district" profile is counted on its own line and never added to a
 * district, and no result holds a sum of district numbers.
 */

/** A profile's district choice: the only fields the counts read. */
export type CountedProfile = {
  id: string;
  districtSlugs: readonly string[];
  anyDistrict: boolean;
};

export type DistrictCount = { slug: string; count: number };

/**
 * `districts`: a viewer who chose districts gets each of them (in the viewer's
 * order, zero included), the number open to any district and the Warsaw total.
 * `top`: a viewer who chose "any", and the website without a viewer, get the
 * Warsaw total and the districts named by most profiles (only districts named at
 * least once). Every number excludes the viewer. Only the website (no viewer) also
 * gets `byDistrict`: every district named by at least one counted profile with its
 * own count (PRD 4 FR-26, spec 09 §District section), never summed.
 */
export type RoommateCounts =
  | { kind: 'districts'; districts: DistrictCount[]; anyDistrict: number; total: number }
  | { kind: 'top'; total: number; top: DistrictCount[]; byDistrict?: Record<string, number> };

/** **Assumption** (PRD 3 FR-16, D68): a viewer who chose "any" sees the three most named districts. */
export const TOP_DISTRICTS_FOR_ANY = 3;

/** Spec 02 §Find a flatmate: the website block shows the five most named districts. */
export const TOP_DISTRICTS_ON_WEBSITE = 5;

/**
 * The counts for `viewer` (null on the website) over the active profiles in
 * `others`; the viewer's own row is left out wherever it appears. Ties among the
 * most named districts go in alphabetical order of slug (**Assumption**, PRD 3 §5
 * example 1).
 */
export function countRoommates(
  viewer: CountedProfile | null,
  others: readonly CountedProfile[],
): RoommateCounts {
  const counted = others.filter((profile) => profile.id !== viewer?.id);
  const byDistrict = new Map<string, number>();
  let anyDistrict = 0;
  for (const profile of counted) {
    if (profile.anyDistrict) {
      anyDistrict += 1;
      continue;
    }
    for (const slug of new Set(profile.districtSlugs)) {
      byDistrict.set(slug, (byDistrict.get(slug) ?? 0) + 1);
    }
  }

  if (viewer && !viewer.anyDistrict) {
    return {
      kind: 'districts',
      districts: [...new Set(viewer.districtSlugs)].map((slug) => ({
        slug,
        count: byDistrict.get(slug) ?? 0,
      })),
      anyDistrict,
      total: counted.length,
    };
  }

  const top = [...byDistrict]
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, viewer ? TOP_DISTRICTS_FOR_ANY : TOP_DISTRICTS_ON_WEBSITE);
  if (viewer) return { kind: 'top', total: counted.length, top };
  return { kind: 'top', total: counted.length, top, byDistrict: Object.fromEntries(byDistrict) };
}

/**
 * The profiles that are active at `now` (spec 06 §Counts, also the candidates of spec
 * 07 §Compatibility): `status=active` and `expires_at` still in the future (by time,
 * so a profile the daily cron has not marked expired yet is not counted), the chat
 * neither blocked nor banned.
 */
export function activeProfilesWhere(now: Date) {
  return {
    status: 'active',
    expiresAt: { gt: now },
    chat: { blockedAt: null, roommateBannedAt: null },
  } satisfies Prisma.RoommateProfileWhereInput;
}

/**
 * The profiles with no report between them and `profileId` in either direction (spec 07 §Report:
 * a stored report hides the pair from each other at once, in the counts and the cards).
 */
export function notReportedWith(profileId: string) {
  return {
    reportsReceived: { none: { reporterProfileId: profileId } },
    reportsMade: { none: { targetProfileId: profileId } },
  } satisfies Prisma.RoommateProfileWhereInput;
}

/**
 * Loads the district fields of the active profiles in one query and counts them:
 * for the bot with its viewer (leaving out the profiles the viewer reported or was
 * reported by, `notReportedWith`), for the website without one (the Warsaw total,
 * the top `TOP_DISTRICTS_ON_WEBSITE` districts and `byDistrict`). A database error is thrown to the
 * caller, which says the counts are not available now.
 */
export async function loadRoommateCounts(
  viewer: CountedProfile | null = null,
  now: Date = new Date(),
): Promise<RoommateCounts> {
  const others = await prisma.roommateProfile.findMany({
    where: { ...activeProfilesWhere(now), ...(viewer ? notReportedWith(viewer.id) : {}) },
    select: { id: true, districtSlugs: true, anyDistrict: true },
  });
  return countRoommates(viewer, others);
}
