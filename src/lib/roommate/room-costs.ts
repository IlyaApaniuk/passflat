import { groupFigureRows } from '@/lib/building-figures-view';
import type { AreaReference } from '@/lib/cost-figures';
import { loadAreaReference } from '@/lib/cost-figures-query';

/**
 * The room cost reference next to the roommate counts (PRD 3 FR-17, spec 06 §Room cost
 * reference): for each district a person chose, or Warsaw for "any", the room figures of
 * the figure contract (`loadAreaReference` with `rentalType: 'room'`, the district from
 * MIN_AREA_REPORTS room reports, else the city) and the per-person split of D61. Figures
 * come only from the shared loaders (CLAUDE.md: never a second aggregation for the bot);
 * the bot and the website render them in their own words.
 */

/** D61: "for two people about X each". */
const SPLIT_PEOPLE = 2;

/** Spec 06 §Room cost reference: the split needs this many tenant all-in totals. */
const MIN_SPLIT_REPORTS = 2;

/** Half up to the nearest 10 zł (spec 06): 2,425 → 2,430; 2,424 → 2,420. */
export function roundHalfUpTo10(value: number): number {
  return Math.floor(value / 10 + 0.5) * 10;
}

/** "For two people about X each": the value, the N it rests on and its own area. */
export interface PerPersonSplit {
  value: number;
  /** The tenant all-in totals the median is drawn from. */
  n: number;
  /** The flat figures have their own level: the district from MIN_AREA_REPORTS, else the city. */
  level: AreaReference['level'];
  /** Display name source of that area (the district's or the city's `nameKey`). */
  name: string;
}

/**
 * D61: half of the tenant group's all-in median of whole flats, rounded half up to 10 zł,
 * only when that median is the group's headline (not a known part or rent) and rests on at
 * least MIN_SPLIT_REPORTS reports; never from asking prices. Null otherwise.
 */
export function perPersonSplit(reference: AreaReference | null): PerPersonSplit | null {
  const tenant = reference?.summary.groups.tenant;
  if (!reference || !tenant) return null;
  const { headline } = groupFigureRows(tenant);
  if (headline?.key !== 'completeTotal' || headline.figure.median == null) return null;
  if (headline.figure.n < MIN_SPLIT_REPORTS) return null;
  return {
    value: roundHalfUpTo10(headline.figure.median / SPLIT_PEOPLE),
    n: headline.figure.n,
    level: reference.level,
    name: reference.name,
  };
}

/**
 * The flats the split halves, in one place: D61 takes every whole apartment, studios
 * included. Whether studios are left out is PRD 3 Q-17 (T107); its answer changes this
 * filter only.
 */
async function loadPerPersonSplit(
  districtId: string | null,
  cityId: string,
): Promise<PerPersonSplit | null> {
  return perPersonSplit(await loadAreaReference({ districtId, cityId, rentalType: 'apartment' }));
}

/** One area of the reference: a chosen district, or Warsaw (`district` null) for "any". */
export interface RoomCostArea {
  district: { slug: string; name: string } | null;
  /** The room figures: the district from MIN_AREA_REPORTS room reports, else the city; null = none. */
  room: AreaReference | null;
  split: PerPersonSplit | null;
}

interface RoomCostCity {
  id: string;
  districts: ReadonlyArray<{ id: string; slug: string; nameKey: string }>;
}

/**
 * The room cost reference of the chosen districts in their order (repeated and unknown slugs
 * left out), or of Warsaw when the person chose "any" (`districtSlugs` empty) or no chosen
 * district is in the city.
 */
export async function loadRoomCostAreas(
  city: RoomCostCity,
  districtSlugs: readonly string[],
): Promise<RoomCostArea[]> {
  const chosen = [...new Set(districtSlugs)].flatMap((slug) => {
    const district = city.districts.find((row) => row.slug === slug);
    return district ? [district] : [];
  });
  const areas = chosen.length > 0 ? chosen : [null];
  return Promise.all(
    areas.map(async (district) => {
      const districtId = district?.id ?? null;
      const [room, split] = await Promise.all([
        loadAreaReference({ districtId, cityId: city.id, rentalType: 'room' }),
        loadPerPersonSplit(districtId, city.id),
      ]);
      return {
        district: district && { slug: district.slug, name: district.nameKey },
        room,
        split,
      };
    }),
  );
}
