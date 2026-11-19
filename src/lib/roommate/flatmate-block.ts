import type { DistrictCount } from './counts';

/**
 * The "Looking for someone to rent with" block on `/warsaw/roommate` (spec 02 §Find a flatmate,
 * PRD 3 FR-21). Pure and client-safe: the server loads the counts (`website-counts.ts`) and
 * passes them down; this module decides what the block says.
 */

/**
 * The counts the server hands to the block: the Warsaw total and the most named districts
 * (spec 06 §Counts, without a viewer), or `unavailable` after a database error.
 */
export type FlatmateBlockCounts =
  | { status: 'counts'; total: number; top: DistrictCount[] }
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
 * stands for itself, as in the bot's counts reply.
 */
export function flatmateBlockView(
  counts: FlatmateBlockCounts,
  districts: readonly NamedDistrict[],
): FlatmateBlockView {
  if (counts.status === 'unavailable') return { countLine: 'none', total: 0, districts: [] };
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
