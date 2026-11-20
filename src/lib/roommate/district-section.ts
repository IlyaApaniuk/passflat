import { areaOneObservationMessage, type FigureMessage } from '@/lib/building-figures-view';
import { MIN_AREA_REPORTS, type AreaReference } from '@/lib/cost-figures';

import type { FlatmateBlockCounts } from './flatmate-block';
import { perPersonSplitArea } from './per-person-line';
import type { PerPersonSplit, RoomCostArea } from './room-costs';

/**
 * The district page's "Room and shared renting" section (spec 09 §District section, PRD 4 FR-26,
 * FR-27). Pure: the page loads the website's counts (`loadFlatmateBlockCounts`) and the district's
 * room cost reference (`loadRoomCostAreas(city, [district])[0]`, the bot's loader) and renders what
 * this decides. A count is the number of active profiles naming the district (spec 06 §Counts:
 * "any district" profiles count in no district, nothing is summed); the room figures and the split
 * are the contract's, each with its own level and N. No percentage, rank or freshness.
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

/**
 * The room lines: the lead-in `costsSeo.districtRoomLead`, the level line
 * `costsSeo.districtRoomCityFallback` when the district has fewer than MIN_AREA_REPORTS room
 * reports and the figures are the city's, then the reference's groups with their N
 * (`AreaReferenceGroups`).
 */
interface DistrictRoomLines {
  reference: AreaReference;
  /** The reference's own area in the visitor's locale: the district, or the city it fell back to. */
  areaName: string;
  /** The level line's values; null when the district answers on its own. */
  cityFallback: { min: number; city: string } | null;
  /** "One observation in …" for a group of one report, naming the reference's own area. */
  oneObservation: FigureMessage;
}

export interface DistrictRoommateSectionView {
  countLine: DistrictCountLine;
  /** Null: no room report at any level, or the room costs did not load → no figure lines. */
  room: DistrictRoomLines | null;
  /** The callout's per-person line (spec 08): the area's split, null → no line. */
  split: PerPersonSplit | null;
  /** The split's **own** area: the district, or the city when the split fell back to it. */
  splitArea: string | undefined;
}

function countLineFor(slug: string, counts: FlatmateBlockCounts | undefined): DistrictCountLine {
  if (!counts || counts.status === 'unavailable' || !counts.byDistrict) return null;
  // Own properties only: a slug such as "constructor" must not read `Object.prototype`.
  const n = Object.prototype.hasOwnProperty.call(counts.byDistrict, slug)
    ? counts.byDistrict[slug]
    : 0;
  return typeof n === 'number' && n > 0
    ? { key: 'costsSeo.districtProfileCount', n }
    : { key: 'costsSeo.districtProfileNone' };
}

/**
 * What the section shows for the district `slug`. `counts` absent (a rejected load) or
 * `unavailable` (a database error caught in the loader) → no count line; `area` absent (a
 * rejected load) or an area of another district → no figure lines and no split; the section and
 * its callout still render. `translate` resolves the city's `nameKey` (a district's `nameKey` is
 * its display name as is).
 */
export function districtRoommateSection({
  slug,
  counts,
  area,
  translate,
}: {
  slug: string;
  counts?: FlatmateBlockCounts;
  area?: RoomCostArea;
  translate: (key: string) => string;
}): DistrictRoommateSectionView {
  const countLine = countLineFor(slug, counts);
  // `loadRoomCostAreas` answers for the whole city when the slug is not in it; never show that
  // as the district's.
  if (!area || area.district?.slug !== slug) {
    return { countLine, room: null, split: null, splitArea: undefined };
  }
  const { room: reference, split } = area;
  let room: DistrictRoomLines | null = null;
  if (reference) {
    const areaName = perPersonSplitArea(reference, translate);
    room = {
      reference,
      areaName,
      cityFallback: reference.level === 'city' ? { min: MIN_AREA_REPORTS, city: areaName } : null,
      oneObservation: areaOneObservationMessage(reference.level, areaName),
    };
  }
  return {
    countLine,
    room,
    split,
    splitArea: split ? perPersonSplitArea(split, translate) : undefined,
  };
}
