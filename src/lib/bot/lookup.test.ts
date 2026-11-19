import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cityFindUnique: vi.fn(),
  districtFindUnique: vi.fn(),
  buildingFindFirst: vi.fn(),
  buildingFindMany: vi.fn(),
  costReportFindMany: vi.fn(),
  resolveDistrictByPoint: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: { findUnique: h.cityFindUnique },
    district: { findUnique: h.districtFindUnique },
    building: { findFirst: h.buildingFindFirst, findMany: h.buildingFindMany },
    // The figure contract's loaders: the building, its district or city, deposits.
    costReport: { findMany: h.costReportFindMany },
  },
}));

// The loaders' cache is Next's; here every call reads through.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock('@/lib/geo/district', () => ({ resolveDistrictByPoint: h.resolveDistrictByPoint }));

import { summarizeDepositReturns, summarizeFigures, type FigureReport } from '@/lib/cost-figures';
import type { GeocodedAddress } from './geocode';
import { getCityDepositFacts, lookupAddress } from './lookup';

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

function serveReports(rows: {
  building?: FigureReport[];
  district?: FigureReport[];
  city?: FigureReport[];
}) {
  h.costReportFindMany.mockImplementation(async ({ where }: { where: Where }) => {
    if (where.buildingId) return where.buildingId === 'building-1' ? (rows.building ?? []) : [];
    if (where.building?.districtId) return rows.district ?? [];
    if (where.building?.cityId) return rows.city ?? [];
    return [];
  });
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
  h.buildingFindMany.mockResolvedValue([]);
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

  it('keeps the neighbours on their blended number (Q-2)', async () => {
    h.buildingFindMany.mockResolvedValue([
      {
        slug: 'pulawska-12',
        addressFull: 'Puławska 12',
        lat: 52.2009,
        lng: 21.02,
        costReports: [
          { source: 'user', totalMonthlyAvg: 4_000, rent: 3_000 },
          { source: 'scraped', totalMonthlyAvg: 4_400, rent: 3_400 },
        ],
      },
    ]);

    const lookup = await lookupAddress(geo);

    expect(lookup!.neighbours).toEqual([
      {
        address: 'Puławska 12',
        slug: 'pulawska-12',
        distanceM: 100,
        totalMedian: 4_200,
        totalCount: 2,
        reportCount: 2,
      },
    ]);
    expect(h.buildingFindMany.mock.calls[0][0].where.id).toEqual({ not: 'building-1' });
  });

  it('returns null outside the city bounds and for an inactive city', async () => {
    await expect(lookupAddress({ ...geo, lat: 50.06, lng: 19.94 })).resolves.toBeNull();
    h.cityFindUnique.mockResolvedValue({ ...city, isActive: false });
    await expect(lookupAddress(geo)).resolves.toBeNull();
    expect(h.costReportFindMany).not.toHaveBeenCalled();
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
