import { groupFigureRows } from '@/lib/building-figures-view';
import type { AreaReference } from '@/lib/cost-figures';
import { loadAreaReference } from '@/lib/cost-figures-query';
import { LOCATION_CHECKER_CITY_SLUG } from '@/lib/location-checker';
import { prisma } from '@/lib/prisma';

/**
 * The room cost reference next to the roommate counts (PRD 3 FR-17, spec 06 §Room cost
 * reference): for each district a person chose, or Warsaw for "any", the room figures of
 * the figure contract (`loadAreaReference` with `rentalType: 'room'`, the district from
 * MIN_AREA_REPORTS room reports, else the city) and the per-person split of D61 over flats
 * with 2 or more rooms (D71). Figures
 * come only from the shared loaders (CLAUDE.md: never a second aggregation for the bot);
 * the bot and the website render them in their own words.
 */

/** D61: "for two people about X each". */
const SPLIT_PEOPLE = 2;

/** Spec 06 §Room cost reference: the split needs this many tenant all-in totals. */
const MIN_SPLIT_REPORTS = 2;

/** D71 (PRD 3 Q-17): the split halves only flats with at least this many rooms, no studios. */
const SPLIT_MIN_ROOMS = 2;

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
 * D61: half of the tenant group's all-in median of the flats in the reference (D71: those
 * `loadPerPersonSplit` loads), rounded half up to 10 zł, only when that median is the
 * group's headline (not a known part or rent) and rests on at least MIN_SPLIT_REPORTS
 * reports; never from asking prices. Null otherwise.
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
 * The flats the split halves, in one place: whole apartments with SPLIT_MIN_ROOMS rooms or
 * more (D71 narrowed D61's every whole apartment), so studios and reports without a room
 * count are left out. The filter sits in the figure contract's loader, so the level (the
 * district from MIN_AREA_REPORTS such flats, else the city), the N and one observation are
 * those of the filtered set; the room lines read the loader unfiltered.
 */
async function loadPerPersonSplit(
  districtId: string | null,
  cityId: string,
): Promise<PerPersonSplit | null> {
  return perPersonSplit(
    await loadAreaReference({
      districtId,
      cityId,
      rentalType: 'apartment',
      minRooms: SPLIT_MIN_ROOMS,
    }),
  );
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

/**
 * The website's per-person line for Warsaw (spec 08 §Per-person line, PRD 4 FR-13): the split
 * of the bot's "any district" reference (`loadRoomCostAreas(city, [])`), so the site and the bot
 * show the same value and N and no second aggregation exists. Null when Warsaw is missing, the
 * rule has no figure, or anything fails (only the error's message is logged).
 */
export async function loadWarsawPerPersonSplit(): Promise<PerPersonSplit | null> {
  try {
    const city = await prisma.city.findUnique({
      where: { slug: LOCATION_CHECKER_CITY_SLUG },
      select: { id: true, districts: { select: { id: true, slug: true, nameKey: true } } },
    });
    if (!city) return null;
    const [area] = await loadRoomCostAreas(city, []);
    return area?.split ?? null;
  } catch (error) {
    console.error(
      '[roommate] per-person split failed',
      error instanceof Error ? error.message : 'unknown error',
    );
    return null;
  }
}
