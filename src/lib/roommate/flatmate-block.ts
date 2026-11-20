import { LOCATION_CHECKER_CITY_SLUG } from '@/lib/location-checker';

import type { DistrictCount } from './counts';

/**
 * The "Looking for someone to rent with" block on `/warsaw/roommate` (spec 02 §Find a flatmate,
 * PRD 3 FR-21). Pure and client-safe: the server loads the counts (`website-counts.ts`) and
 * passes them down; this module decides what the block says.
 */

/**
 * Whether the roommate page of `citySlug` renders the block: only the checker city (`warsaw`),
 * with or without the bot username (spec 08 §Roommate page default view, PRD 4 FR-2).
 */
export function pageHasFlatmateBlock(citySlug: string): boolean {
  return citySlug === LOCATION_CHECKER_CITY_SLUG;
}

/**
 * Whether the page loads the block's counts: the checker city, and only when the bot is
 * configured (`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`), so no counts are shown without a bot to join.
 */
export function canLoadFlatmateCounts(
  citySlug: string,
  botUsername: string | undefined = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
): boolean {
  return pageHasFlatmateBlock(citySlug) && Boolean(botUsername);
}

/**
 * The counts the server hands to the block: the Warsaw total, the most named districts and every
 * named district's own count (`byDistrict`, read by the district page, spec 09 §District section;
 * spec 06 §Counts, without a viewer), or `unavailable` after a database error.
 */
export type FlatmateBlockCounts =
  | {
      status: 'counts';
      total: number;
      top: DistrictCount[];
      byDistrict: Record<string, number>;
    }
  | { status: 'unavailable' };

/** A district as the listings district filter names it (`District.nameKey`, e.g. "Mokotów"). */
type NamedDistrict = { slug: string; name: string };

export type FlatmateBlockView = {
  /**
   * `count`: "{count} people in Warsaw already have a profile"; `first`: "Be among the first"
   * (zero, no number); `none`: the counts are not available, so no count sentence at all.
   */
  countLine: 'count' | 'first' | 'none';
  total: number;
  /** Up to `TOP_DISTRICTS_ON_WEBSITE` districts with their own counts, never summed. */
  districts: Array<{ slug: string; name: string; count: number }>;
};

/**
 * What the block shows for `counts`, with district names taken from `districts` (the city's
 * districts the page already passes to the listings filter). A slug missing from that list
 * stands for itself, as in the bot's counts reply. No counts (`undefined`: not loaded, e.g.
 * without the bot username) and `unavailable` both mean no count sentence and no districts.
 */
export function flatmateBlockView(
  counts: FlatmateBlockCounts | undefined,
  districts: readonly NamedDistrict[],
): FlatmateBlockView {
  if (!counts || counts.status === 'unavailable') {
    return { countLine: 'none', total: 0, districts: [] };
  }
  if (counts.total === 0) return { countLine: 'first', total: 0, districts: [] };
  const names = new Map(districts.map((district) => [district.slug, district.name]));
  return {
    countLine: 'count',
    total: counts.total,
    districts: counts.top.map(({ slug, count }) => ({
      slug,
      name: names.get(slug) ?? slug,
      count,
    })),
  };
}
