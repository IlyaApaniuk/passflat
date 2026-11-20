import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cityFindUnique: vi.fn(),
  districtFindUnique: vi.fn(),
  districtFindMany: vi.fn(),
  buildingFindFirst: vi.fn(),
  buildingFindUnique: vi.fn(),
  buildingFindMany: vi.fn(),
  buildingWrite: vi.fn(),
  costReportFindMany: vi.fn(),
  resolveDistrictByPoint: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: { findUnique: h.cityFindUnique },
    district: { findUnique: h.districtFindUnique, findMany: h.districtFindMany },
    building: {
      findFirst: h.buildingFindFirst,
      findUnique: h.buildingFindUnique,
      findMany: h.buildingFindMany,
      // Any write fails the "never creates a building" assertions below.
      create: h.buildingWrite,
      upsert: h.buildingWrite,
      update: h.buildingWrite,
    },
    // The figure contract's loaders: the building, its district or city, deposits.
    costReport: { findMany: h.costReportFindMany },
  },
}));

// The loaders' cache is Next's; here every call reads through.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock('@/lib/geo/district', () => ({ resolveDistrictByPoint: h.resolveDistrictByPoint }));

import {
  RENTAL_TYPE_FILTERS,
  singleNumberFigure,
  summarizeDepositReturns,
  summarizeFigures,
  type FigureReport,
  type RentalTypeFilter,
  type SingleNumberFigure,
} from '@/lib/cost-figures';
import { loadAreaReference, type DistrictFigures } from '@/lib/cost-figures-query';
import type { GeocodedAddress } from './geocode';
import {
  districtRank,
  districtTableRows,
  getCityDepositFacts,
  getDistrictBySlug,
  getDistrictTable,
  lookupAddress,
  lookupBuilding,
} from './lookup';

type Where = {
  buildingId?: string;
  building?: { districtId?: string; cityId?: string };
};

const city = {
  id: 'city-1',
  slug: 'warsaw',
  nameKey: 'Warszawa',
  isActive: true,
  bounds: { north: 52.37, south: 52.09, east: 21.28, west: 20.85 },
  districts: [{ id: 'district-mokotow', slug: 'mokotow', nameKey: 'Mokotów' }],
};

const geo: GeocodedAddress = {
  placeId: 'place-1',
  formatted: 'Puławska 10, Warszawa, Polska',
  street: 'Puławska',
  buildingNumber: '10',
  lat: 52.2,
  lng: 21.02,
  city: 'Warszawa',
  postalCode: '02-512',
  isPrecise: true,
};

const buildingRow = {
  id: 'building-1',
  slug: 'pulawska-10',
  placeId: 'place-1',
  addressFull: 'Puławska 10',
  districtId: 'district-mokotow',
  district: { slug: 'mokotow', nameKey: 'Mokotów' },
};

/** The same building as stored, for a lookup by id: its city and the geocoded point. */
const storedBuilding = { ...buildingRow, cityId: 'city-1', lat: geo.lat, lng: geo.lng };

function report(source: string, fields: Partial<FigureReport> = {}): FigureReport {
  return { source, rentalType: 'apartment', utilitiesComplete: true, ...fields };
}

const many = (count: number, make: (index: number) => FigureReport) =>
  Array.from({ length: count }, (_, index) => make(index));

/** Three tenant reports and one asking price. */
const buildingReports = [
  report('user', { rent: 3_200, totalMonthlyAvg: 4_000 }),
  report('import', { rent: 3_000, totalMonthlyAvg: 3_700 }),
  report('user', { rent: 3_400, totalMonthlyAvg: 3_900, utilitiesComplete: false }),
  report('scraped', { rent: 3_500, totalMonthlyAvg: 4_100, utilitiesComplete: false }),
];

/** Six district reports; three ended tenancies answered the deposit question. */
const districtReports = many(6, (index) =>
  report('user', {
    rent: 3_000 + index * 100,
    totalMonthlyAvg: 3_800 + index * 100,
    depositAmount: 4_000,
    depositReturned: index < 3 ? index !== 2 : null,
    depositReturnedAmount: index === 0 ? 4_000 : index === 1 ? 3_000 : null,
    isCurrentTenant: index >= 3,
  }),
);

const cityReports = many(12, (index) =>
  report(index % 3 === 0 ? 'scraped' : 'user', {
    rent: 2_800 + index * 50,
    totalMonthlyAvg: 3_600 + index * 50,
    depositReturned: index < 4,
    isCurrentTenant: false,
  }),
);

/** The city's districts as `loadDistrictFigures` reads them: Mokotów and Wola. */
const cityDistricts = [
  { id: 'district-mokotow', slug: 'mokotow', nameKey: 'Mokotów' },
  { id: 'district-wola', slug: 'wola', nameKey: 'Wola' },
];

/**
 * Reports by `where`. The district-figures query (it selects `building`) reads
 * the whole city with each report's district: the district rows are Mokotów's,
 * the city rows Wola's.
 */
function serveReports(rows: {
  building?: FigureReport[];
  district?: FigureReport[];
  city?: FigureReport[];
}) {
  h.costReportFindMany.mockImplementation(
    async ({ where, select }: { where: Where; select: Record<string, unknown> }) => {
      if (where.buildingId) return where.buildingId === 'building-1' ? (rows.building ?? []) : [];
      if (where.building?.districtId) return rows.district ?? [];
      if (where.building?.cityId && select.building) {
        return [
          ...(rows.district ?? []).map((r) => ({
            ...r,
            building: { districtId: 'district-mokotow' },
          })),
          ...(rows.city ?? []).map((r) => ({ ...r, building: { districtId: 'district-wola' } })),
        ];
      }
      if (where.building?.cityId) return rows.city ?? [];
      return [];
    },
  );
}

/** The `where` of every cost-report query that selected deposit fields. */
function depositQueries(): Where[] {
  return h.costReportFindMany.mock.calls
    .map(([args]) => args as { where: Where; select: Record<string, boolean> })
    .filter((args) => args.select.depositReturned)
    .map((args) => args.where);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.cityFindUnique.mockResolvedValue(city);
  h.districtFindUnique.mockResolvedValue({ slug: 'mokotow', nameKey: 'Mokotów' });
  h.buildingFindFirst.mockResolvedValue(buildingRow);
  h.buildingFindUnique.mockResolvedValue(storedBuilding);
  h.buildingFindMany.mockResolvedValue([]);
  h.districtFindMany.mockResolvedValue(cityDistricts);
  h.resolveDistrictByPoint.mockReturnValue('mokotow');
  serveReports({ building: buildingReports, district: districtReports, city: cityReports });
});

describe('lookupAddress on the figure contract', () => {
  it('answers at the building level with its figures, the district reference and its deposits', async () => {
    const lookup = await lookupAddress(geo);

    expect(lookup).toMatchObject({
      level: 'building',
      address: 'Puławska 10',
      buildingId: 'building-1',
      buildingSlug: 'pulawska-10',
      placeId: 'place-1',
      districtSlug: 'mokotow',
      districtName: 'Mokotów',
      imprecise: false,
    });
    // The same summary the website's loaders give for these reports.
    expect(lookup!.building).toEqual(
      summarizeFigures(buildingReports, { level: 'building', rentalType: 'all' }),
    );
    expect(lookup!.building!.groups.tenant).toMatchObject({
      reportCount: 3,
      completeTotal: { median: 3_850, n: 2 },
    });
    expect(lookup!.building!.groups.asking).toMatchObject({ reportCount: 1 });
    expect(lookup!.reference).toEqual({
      level: 'district',
      slug: 'mokotow',
      name: 'Mokotów',
      summary: summarizeFigures(districtReports, { level: 'district', rentalType: 'all' }),
    });
    // Ended tenancies only: two of three got the deposit back, one in full.
    expect(lookup!.deposit).toEqual({ answered: 3, gotBack: 2, full: 1, medianDeposit: 4_000 });
    expect(depositQueries()).toEqual([
      { isVisible: true, building: { districtId: 'district-mokotow' } },
    ]);
  });

  it('reads no report through the building query: the loaders do the aggregation', async () => {
    await lookupAddress(geo);

    const select = h.buildingFindFirst.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('costReports');
    expect(h.costReportFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { buildingId: 'building-1', isVisible: true } }),
    );
  });

  it('answers at the district level for an address without a building row', async () => {
    h.buildingFindFirst.mockResolvedValue(null);

    const lookup = await lookupAddress(geo);

    expect(lookup).toMatchObject({
      level: 'district',
      address: 'Puławska 10, Warszawa, Polska',
      buildingId: null,
      placeId: 'place-1',
      districtSlug: 'mokotow',
      districtName: 'Mokotów',
      building: null,
      reference: { level: 'district', slug: 'mokotow', name: 'Mokotów' },
    });
    expect(lookup!.reference!.summary.reportCount).toBe(6);
    expect(h.costReportFindMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ buildingId: expect.anything() }),
      }),
    );
    expect(depositQueries()).toEqual([
      { isVisible: true, building: { districtId: 'district-mokotow' } },
    ]);
  });

  it('answers at the district level for a known building nobody reported on', async () => {
    serveReports({ building: [], district: districtReports, city: cityReports });

    const lookup = await lookupAddress(geo);

    expect(lookup!.level).toBe('district');
    expect(lookup!.buildingId).toBe('building-1');
    expect(lookup!.building).toMatchObject({
      reportCount: 0,
      groups: { tenant: null, asking: null },
    });
  });

  it('widens to the city when the district has fewer than 5 reports', async () => {
    h.buildingFindFirst.mockResolvedValue(null);
    serveReports({ district: districtReports.slice(0, 4), city: cityReports });

    const lookup = await lookupAddress(geo);

    expect(lookup).toMatchObject({
      level: 'city',
      districtSlug: 'mokotow',
      districtName: 'Mokotów',
      reference: { level: 'city', slug: 'warsaw', name: 'Warszawa' },
    });
    expect(lookup!.reference!.summary).toEqual(
      summarizeFigures(cityReports, { level: 'city', rentalType: 'all' }),
    );
    expect(lookup!.deposit).toMatchObject({ answered: 12, gotBack: 4 });
    expect(depositQueries()).toEqual([{ isVisible: true, building: { cityId: 'city-1' } }]);
  });

  it('keeps a reported building at the building level when its district is thin', async () => {
    serveReports({
      building: buildingReports,
      district: districtReports.slice(0, 4),
      city: cityReports,
    });

    const lookup = await lookupAddress(geo);

    expect(lookup!.level).toBe('building');
    expect(lookup!.reference).toMatchObject({ level: 'city', slug: 'warsaw' });
    expect(depositQueries()).toEqual([{ isVisible: true, building: { cityId: 'city-1' } }]);
  });

  it('uses the city reference when the point lies in no district', async () => {
    h.buildingFindFirst.mockResolvedValue(null);
    h.resolveDistrictByPoint.mockReturnValue(null);

    const lookup = await lookupAddress(geo);

    expect(lookup).toMatchObject({
      level: 'city',
      districtSlug: null,
      reference: { level: 'city' },
    });
    expect(h.districtFindUnique).not.toHaveBeenCalled();
  });

  it('carries no reference when the city has no report at all', async () => {
    h.buildingFindFirst.mockResolvedValue(null);
    serveReports({});

    const lookup = await lookupAddress(geo);

    expect(lookup).toMatchObject({ level: 'city', reference: null, building: null });
    expect(lookup!.deposit).toEqual({ answered: 0, gotBack: 0, full: 0, medianDeposit: null });
  });

  it('gives each neighbour one group’s number with its N, never a blend (D23)', async () => {
    h.buildingFindMany.mockResolvedValue([
      {
        slug: 'pulawska-12',
        addressFull: 'Puławska 12',
        lat: 52.2009,
        lng: 21.02,
        costReports: [
          { source: 'user', utilitiesComplete: true, totalMonthlyAvg: 4_000, rent: 3_000 },
          { source: 'scraped', utilitiesComplete: false, totalMonthlyAvg: 4_400, rent: 3_400 },
        ],
      },
      {
        slug: 'pulawska-14',
        addressFull: 'Puławska 14',
        lat: 52.2018,
        lng: 21.02,
        costReports: [
          { source: 'scraped', utilitiesComplete: false, totalMonthlyAvg: 4_100, rent: 3_000 },
          { source: 'scraped', utilitiesComplete: false, totalMonthlyAvg: 3_900, rent: 3_000 },
        ],
      },
      // No usable value in either group: not listed.
      {
        slug: 'pulawska-16',
        addressFull: 'Puławska 16',
        lat: 52.2005,
        lng: 21.02,
        costReports: [
          { source: 'user', utilitiesComplete: null, totalMonthlyAvg: null, rent: null },
        ],
      },
    ]);

    const lookup = await lookupAddress(geo);

    expect(lookup!.neighbours).toEqual([
      {
        address: 'Puławska 12',
        slug: 'pulawska-12',
        distanceM: 100,
        figure: { group: 'tenant', metric: 'completeTotal', value: 4_000, n: 1 },
      },
      {
        address: 'Puławska 14',
        slug: 'pulawska-14',
        distanceM: 200,
        figure: { group: 'asking', metric: 'knownPartTotal', value: 4_000, n: 2 },
      },
    ]);
    const query = h.buildingFindMany.mock.calls[0][0];
    expect(query.where.id).toEqual({ not: 'building-1' });
    expect(query.select.costReports.select).toEqual({
      source: true,
      utilitiesComplete: true,
      totalMonthlyAvg: true,
      rent: true,
    });
  });

  it('returns null outside the city bounds and for an inactive city', async () => {
    await expect(lookupAddress({ ...geo, lat: 50.06, lng: 19.94 })).resolves.toBeNull();
    h.cityFindUnique.mockResolvedValue({ ...city, isActive: false });
    await expect(lookupAddress(geo)).resolves.toBeNull();
    expect(h.costReportFindMany).not.toHaveBeenCalled();
  });
});

describe('lookupBuilding (the b_<id> link)', () => {
  const neighbour = {
    slug: 'pulawska-12',
    addressFull: 'Puławska 12',
    lat: 52.2009,
    lng: 21.02,
    costReports: [{ source: 'user', totalMonthlyAvg: 4_000, rent: 3_000 }],
  };

  it('returns the same answer as typing the building’s address', async () => {
    h.buildingFindMany.mockResolvedValue([neighbour]);

    const byId = await lookupBuilding('building-1');
    const byAddress = await lookupAddress(geo);

    expect(byId).toEqual(byAddress);
    expect(byId).toMatchObject({
      level: 'building',
      address: 'Puławska 10',
      buildingId: 'building-1',
      districtSlug: 'mokotow',
      reference: { level: 'district', slug: 'mokotow' },
      imprecise: false,
    });
    expect(byId!.neighbours).toHaveLength(1);
    expect(h.buildingFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'building-1' } }),
    );
    expect(h.buildingFindUnique.mock.calls[0][0].select).not.toHaveProperty('costReports');
  });

  it('never creates or changes a building', async () => {
    await lookupBuilding('building-1');
    h.buildingFindUnique.mockResolvedValue(null);
    await lookupBuilding('building-404');

    expect(h.buildingWrite).not.toHaveBeenCalled();
  });

  it('answers with the district card for a building nobody reported on', async () => {
    serveReports({ building: [], district: districtReports, city: cityReports });

    const lookup = await lookupBuilding('building-1');

    expect(lookup).toMatchObject({
      level: 'district',
      buildingId: 'building-1',
      building: { reportCount: 0 },
      reference: { level: 'district', slug: 'mokotow' },
    });
  });

  it('uses the city reference and no neighbours for a building without coordinates', async () => {
    h.buildingFindUnique.mockResolvedValue({ ...storedBuilding, lat: null, lng: null });
    serveReports({ building: [], district: districtReports, city: cityReports });

    const lookup = await lookupBuilding('building-1');

    expect(lookup).toMatchObject({
      level: 'city',
      address: 'Puławska 10',
      buildingId: 'building-1',
      districtSlug: null,
      districtName: null,
      reference: { level: 'city', slug: 'warsaw' },
      neighbours: [],
    });
    expect(h.buildingFindMany).not.toHaveBeenCalled();
    expect(h.resolveDistrictByPoint).not.toHaveBeenCalled();
    expect(depositQueries()).toEqual([{ isVisible: true, building: { cityId: 'city-1' } }]);
  });

  it('uses the city reference for a building in no district', async () => {
    h.buildingFindUnique.mockResolvedValue({ ...storedBuilding, districtId: null, district: null });
    h.resolveDistrictByPoint.mockReturnValue(null);
    serveReports({ building: [], district: districtReports, city: cityReports });

    const lookup = await lookupBuilding('building-1');

    expect(lookup).toMatchObject({
      level: 'city',
      districtSlug: null,
      reference: { level: 'city', slug: 'warsaw' },
    });
  });

  it('keeps a reported building without coordinates at the building level', async () => {
    h.buildingFindUnique.mockResolvedValue({ ...storedBuilding, lat: null, lng: null });

    const lookup = await lookupBuilding('building-1');

    expect(lookup!.level).toBe('building');
    expect(lookup!.reference).toMatchObject({ level: 'city' });
  });

  it.each([
    ['an unknown or deleted building', null],
    ['a building of another city', { ...storedBuilding, cityId: 'city-krakow' }],
    ['a building outside the city bounds', { ...storedBuilding, lat: 50.06, lng: 19.94 }],
  ])('returns null for %s, reading no report', async (_label, row) => {
    h.buildingFindUnique.mockResolvedValue(row);

    await expect(lookupBuilding('building-1')).resolves.toBeNull();
    expect(h.costReportFindMany).not.toHaveBeenCalled();
  });

  it('returns null when the city is not live, without a building query', async () => {
    h.cityFindUnique.mockResolvedValue({ ...city, isActive: false });

    await expect(lookupBuilding('building-1')).resolves.toBeNull();
    expect(h.buildingFindUnique).not.toHaveBeenCalled();
  });

  it('lets a database error through to the caller', async () => {
    h.buildingFindUnique.mockRejectedValue(new Error('connection refused'));

    await expect(lookupBuilding('building-1')).rejects.toThrow('connection refused');
  });
});

describe('getCityDepositFacts', () => {
  it('summarizes the city’s cost reports only; deposit cases are never read', async () => {
    // The Prisma mock has no depositCase model: reading one would throw here.
    const facts = await getCityDepositFacts();

    expect(facts).toEqual({ deposit: summarizeDepositReturns(cityReports) });
    expect(facts!.deposit).toMatchObject({ answered: 12, gotBack: 4 });
    expect(depositQueries()).toEqual([{ isVisible: true, building: { cityId: 'city-1' } }]);
  });
});

/** Cost-report queries without a `select` of the contract's report fields: a second aggregation. */
function nonContractQueries() {
  return h.costReportFindMany.mock.calls.filter(
    ([args]) => (args as { where: { totalMonthlyAvg?: unknown } }).where.totalMonthlyAvg,
  );
}

const districtSummary = (reports: FigureReport[]) =>
  summarizeFigures(reports, { level: 'district', rentalType: 'all' });

describe('getDistrictBySlug on the figure contract (the typed-district card)', () => {
  it('carries the district reference, its single number and no rank under all', async () => {
    const district = await getDistrictBySlug('mokotow');

    expect(district).toEqual({
      citySlug: 'warsaw',
      slug: 'mokotow',
      name: 'Mokotów',
      deposit: summarizeDepositReturns(districtReports),
      reference: {
        level: 'district',
        slug: 'mokotow',
        name: 'Mokotów',
        summary: districtSummary(districtReports),
      },
      figure: singleNumberFigure(districtSummary(districtReports)),
      // Mokotów (tenant, 6) and Wola (tenant, 8) pass every gate but the rental type.
      rank: null,
    });
    expect(district!.figure).toMatchObject({ group: 'tenant', n: 6, reportCount: 6 });
    expect(depositQueries()).toEqual([
      { isVisible: true, building: { districtId: 'district-mokotow' } },
    ]);
    expect(nonContractQueries()).toEqual([]);
  });

  it('gives the district figure the value and N its reference headline has (FR-34)', async () => {
    const district = await getDistrictBySlug('mokotow');
    const reference = await loadAreaReference({
      districtId: 'district-mokotow',
      cityId: 'city-1',
    });
    const headline = singleNumberFigure(reference!.summary);

    expect(district!.figure).toEqual(headline);
  });

  it('falls back to the city reference for a thin district; the figure stays the district’s', async () => {
    serveReports({ district: districtReports.slice(0, 2), city: cityReports });
    const district = await getDistrictBySlug('mokotow');

    expect(district!.reference).toMatchObject({ level: 'city', slug: 'warsaw', name: 'Warszawa' });
    expect(district!.reference!.summary).toEqual(
      summarizeFigures(cityReports, { level: 'city', rentalType: 'all' }),
    );
    expect(district!.figure).toMatchObject({ group: 'tenant', n: 2, reportCount: 2 });
    // The deposit statistic stays the district's own.
    expect(depositQueries()).toEqual([
      { isVisible: true, building: { districtId: 'district-mokotow' } },
    ]);
    expect(nonContractQueries()).toEqual([]);
  });

  it('gives no reference and no figure when neither the district nor the city has a report', async () => {
    serveReports({});
    const district = await getDistrictBySlug('mokotow');

    expect(district).toMatchObject({ slug: 'mokotow', reference: null, figure: null, rank: null });
  });

  it('gives null for a slug that is not a district of the city', async () => {
    expect(await getDistrictBySlug('atlantis')).toBeNull();
  });
});

/** A district's figures with one value under every filter, as `loadDistrictFigures` gives them. */
function districtFigures(
  slug: string,
  figure: Pick<SingleNumberFigure, 'group' | 'metric' | 'value' | 'n'> | null,
  filters: RentalTypeFilter[] = RENTAL_TYPE_FILTERS,
): DistrictFigures {
  const full: SingleNumberFigure | null = figure && {
    ...figure,
    reportCount: figure.n,
    rent: null,
    expenses: null,
    rentPerM2: null,
    completeTotalPerM2: null,
    adminFeePerM2: null,
  };
  return {
    slug,
    name: slug.toUpperCase(),
    figures: {
      all: filters.includes('all') ? full : null,
      apartment: filters.includes('apartment') ? full : null,
      room: filters.includes('room') ? full : null,
    },
  };
}

describe('districtRank (golden example 16)', () => {
  const total = (group: 'tenant' | 'asking', value: number, n: number) =>
    ({ group, metric: 'completeTotal', value, n }) as const;
  const districts = [
    districtFigures('a', total('tenant', 3_900, 37)),
    districtFigures('b', total('tenant', 3_500, 6)),
    districtFigures('c', total('asking', 3_200, 12)),
    districtFigures('d', total('tenant', 3_000, 2)),
  ];

  it('states no rank under all (the bot’s filter)', () => {
    for (const slug of ['a', 'b', 'c', 'd']) {
      expect(districtRank(districts, slug)).toBeNull();
      expect(districtRank(districts, slug, 'all')).toBeNull();
    }
  });

  it('ranks only A and B under apartment, B before A', () => {
    expect(districtRank(districts, 'b', 'apartment')).toEqual({ position: 1, total: 2 });
    expect(districtRank(districts, 'a', 'apartment')).toEqual({ position: 2, total: 2 });
    expect(districtRank(districts, 'c', 'apartment')).toBeNull();
    expect(districtRank(districts, 'd', 'apartment')).toBeNull();
  });
});

describe('getDistrictTable (/districts on the single-number rule)', () => {
  it('lists each district’s single number with its group and N, never a blend', async () => {
    const rows = await getDistrictTable();

    // Both all-in totals, so by value: Wola 3,900 before Mokotów 4,050 (a display order).
    expect(rows).toEqual([
      {
        slug: 'wola',
        name: 'Wola',
        // The city fixture's Wola: 8 tenant and 4 asking reports, the tenant group wins.
        figure: singleNumberFigure(districtSummary(cityReports)),
      },
      {
        slug: 'mokotow',
        name: 'Mokotów',
        figure: singleNumberFigure(districtSummary(districtReports)),
      },
    ]);
    expect(rows[0].figure).toMatchObject({ group: 'tenant', n: 8, reportCount: 8, value: 3_900 });
    expect(nonContractQueries()).toEqual([]);
  });

  it('is empty for an unknown city', async () => {
    h.cityFindUnique.mockResolvedValue(null);
    expect(await getDistrictTable('atlantis')).toEqual([]);
  });

  it('orders all-in totals, then known parts, then rent, each by value; drops districts without a value', () => {
    const rows = districtTableRows([
      districtFigures('rent-only', { group: 'tenant', metric: 'rent', value: 2_000, n: 3 }),
      districtFigures('known', { group: 'asking', metric: 'knownPartTotal', value: 2_500, n: 9 }),
      districtFigures('dear', { group: 'tenant', metric: 'completeTotal', value: 4_500, n: 2 }),
      districtFigures('cheap', { group: 'asking', metric: 'completeTotal', value: 3_000, n: 40 }),
      districtFigures('empty', null),
      // A value only under apartment: not in the table, which reads `all`.
      districtFigures('flats', { group: 'tenant', metric: 'completeTotal', value: 100, n: 9 }, [
        'apartment',
      ]),
    ]);

    expect(rows.map((row) => row.slug)).toEqual(['cheap', 'dear', 'known', 'rent-only']);
  });
});
