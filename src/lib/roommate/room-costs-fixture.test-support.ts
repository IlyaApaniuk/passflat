import type { FigureReport } from '@/lib/cost-figures';

/**
 * Spec 06 §Room cost reference's golden case (PRD 3 §5 example 2 under D71, PRD 4 §5 example 5)
 * for tests that run the real figure loaders over a Prisma mock: the reports of Mokotów and
 * Wesoła, and the `where` filter `costReport.findMany` applies as the database would. Shared by
 * the district page's tests so the website and the bot read one fixture.
 */

export const FIXTURE_CITY_ID = 'city-1';

export const FIXTURE_DISTRICTS = [
  { id: 'd-mok', slug: 'mokotow', nameKey: 'Mokotów' },
  { id: 'd-wes', slug: 'wesola', nameKey: 'Wesoła' },
  { id: 'd-wol', slug: 'wola', nameKey: 'Wola' },
];

function room(source: string, total: number, complete = true): FigureReport {
  return { source, rentalType: 'room', totalMonthlyAvg: total, utilitiesComplete: complete };
}

export function flat(
  source: string,
  total: number,
  complete = true,
  rooms: number | null = 2,
): FigureReport {
  return {
    source,
    rentalType: 'apartment',
    totalMonthlyAvg: total,
    utilitiesComplete: complete,
    rooms,
  };
}

/** R1 user 1,600, R2 import 1,800 (all-in), R3 – R7 scraped known parts. */
export const MOKOTOW_ROOMS = [
  room('user', 1_600),
  room('import', 1_800),
  ...[1_400, 1_500, 1_550, 1_700, 2_000].map((total) => room('scraped', total, false)),
];

/** Tenant all-in totals of whole flats, rooms 1 / 2 / 2 / 3 / 2 / 3: the studio is left out (D71). */
const MOKOTOW_FLATS = (
  [
    [4_200, 1],
    [4_600, 2],
    [4_800, 2],
    [4_900, 3],
    [5_100, 2],
    [5_400, 3],
  ] as const
).map(([total, rooms]) => flat('user', total, true, rooms));

/** Two room reports: below MIN_AREA_REPORTS, so Wesoła's rooms answer with Warsaw. */
const WESOLA_ROOMS = [room('user', 1_500), room('scraped', 1_300, false)];

export type FixtureReport = FigureReport & { districtId: string };

export function reportsByDistrict(byDistrict: Record<string, FigureReport[]>): FixtureReport[] {
  return Object.entries(byDistrict).flatMap(([districtId, rows]) =>
    rows.map((row) => ({ ...row, districtId })),
  );
}

export const GOLDEN_REPORTS = reportsByDistrict({
  'd-mok': [...MOKOTOW_ROOMS, ...MOKOTOW_FLATS],
  'd-wes': WESOLA_ROOMS,
});

type Where = {
  rentalType?: string;
  rooms?: { gte: number };
  building?: { districtId?: string; cityId?: string };
};

/** `costReport.findMany({ where })` over the fixture, as the database answers it. */
export function findReports(reports: readonly FixtureReport[], where: Where): FigureReport[] {
  return (
    reports
      .filter((row) => !where.rentalType || row.rentalType === where.rentalType)
      // `rooms: { gte }` as SQL reads it: a null room count never passes.
      .filter(
        (row) => !where.rooms || (typeof row.rooms === 'number' && row.rooms >= where.rooms.gte),
      )
      .filter((row) =>
        where.building?.districtId
          ? row.districtId === where.building.districtId
          : where.building?.cityId === FIXTURE_CITY_ID,
      )
      .map(({ districtId: _districtId, ...row }) => row)
  );
}

/**
 * `city.findUnique` for Warsaw, by id (the figure loaders) or by slug (the district page, the
 * bot): every caller's `select` / `include` is a subset of this row.
 */
export function findCity() {
  return {
    id: FIXTURE_CITY_ID,
    slug: 'warsaw',
    nameKey: 'city.warsaw',
    isActive: true,
    districts: FIXTURE_DISTRICTS,
  };
}

/** `district.findUnique({ where: { id } })` over the fixture districts. */
export function findDistrict(id: string): { slug: string; nameKey: string } | null {
  const district = FIXTURE_DISTRICTS.find((row) => row.id === id);
  return district ? { slug: district.slug, nameKey: district.nameKey } : null;
}
