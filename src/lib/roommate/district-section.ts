import type { FlatmateBlockCounts } from './flatmate-block';

/**
 * The district page's "Room and shared renting" section (spec 09 §District section, PRD 4 FR-26).
 * Pure: the page loads the website's counts (`loadFlatmateBlockCounts`) and renders what this
 * decides. A count is the number of active profiles naming the district (spec 06 §Counts: "any
 * district" profiles count in no district, nothing is summed); no percentage, rank or freshness.
 */

/**
 * The count line under `costsSeo`, the district name first so no case is needed (spec 09
 * §Nominative-safe templates): `districtProfileCount` with `n` > 0, `districtProfileNone` when
 * nobody names the district (0 or the slug absent), null when the counts are not available.
 */
type DistrictCountLine =
  | { key: 'costsSeo.districtProfileCount'; n: number }
  | { key: 'costsSeo.districtProfileNone' }
  | null;

export type DistrictRoommateSectionView = { countLine: DistrictCountLine };

/**
 * What the section shows for the district `slug`. `counts` absent (a rejected load) or
 * `unavailable` (a database error caught in the loader) → no count line; the section and its
 * callout still render.
 */
export function districtRoommateSection({
  slug,
  counts,
}: {
  slug: string;
  counts?: FlatmateBlockCounts;
}): DistrictRoommateSectionView {
  if (!counts || counts.status === 'unavailable' || !counts.byDistrict) {
    return { countLine: null };
  }
  // Own properties only: a slug such as "constructor" must not read `Object.prototype`.
  const n = Object.prototype.hasOwnProperty.call(counts.byDistrict, slug)
    ? counts.byDistrict[slug]
    : 0;
  return {
    countLine:
      typeof n === 'number' && n > 0
        ? { key: 'costsSeo.districtProfileCount', n }
        : { key: 'costsSeo.districtProfileNone' },
  };
}
