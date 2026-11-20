import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Loader = (...args: unknown[]) => Promise<unknown>;

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  findDistrict: vi.fn(),
  findDistricts: vi.fn(),
  findCity: vi.fn(),
  registered: [] as Array<{ keyParts: string[]; options: unknown }>,
  /** 'mock' calls the loader straight through; 'real' runs Next's own unstable_cache. */
  mode: { cache: 'mock' as 'mock' | 'real' },
}));

vi.mock('next/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/cache')>();
  return {
    unstable_cache: (fn: Loader, keyParts: string[], options: unknown) => {
      h.registered.push({ keyParts, options });
      const real = actual.unstable_cache(
        fn,
        keyParts,
        options as Parameters<typeof actual.unstable_cache>[2],
      );
      return (...args: unknown[]) => (h.mode.cache === 'real' ? real(...args) : fn(...args));
    },
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    costReport: { findMany: h.findMany },
    district: { findUnique: h.findDistrict, findMany: h.findDistricts },
    city: { findUnique: h.findCity },
  },
}));

import { groupFigureRows } from './building-figures-view';
import {
  loadAreaReference,
  loadBuildingFigures,
  loadDepositReturns,
  loadDistrictFigures,
} from './cost-figures-query';

const FIGURE_FIELDS = [
  'adminFee',
  'areaM2',
  'confirmedAt',
  'createdAt',
  'electricityAvg',
  'electricityIncluded',
  'gas',
  'heating',
  'heatingIncluded',
  'internet',
  'isCurrentTenant',
  'livedFrom',
  'livedUntil',
  'otherCosts',
  'rent',
  'rentalType',
  'rooms',
  'source',
  'totalMonthlyAvg',
  'utilitiesComplete',
  'water',
  'waterIncluded',
];
const DEPOSIT_FIELDS = [
  'depositAmount',
  'depositReturned',
  'depositReturnedAmount',
  'isCurrentTenant',
];

const DISTRICT = { slug: 'mokotow', nameKey: 'Mokotów' };
const CITY = { slug: 'warsaw', nameKey: 'Warsaw' };

/** A visible report as Prisma returns it: Decimals and Dates, passed on as they are. */
function report(overrides: Record<string, unknown> = {}) {
  return {
    source: 'user',
    rentalType: 'apartment',
    rent: new Prisma.Decimal('3000'),
    totalMonthlyAvg: new Prisma.Decimal('3800'),
    utilitiesComplete: true,
    createdAt: new Date('2026-05-02T10:00:00Z'),
    confirmedAt: null,
    ...overrides,
  };
}

function reports(count: number, overrides: Record<string, unknown> = {}) {
  return Array.from({ length: count }, () => report(overrides));
}

function findManyArgs(call = 0) {
  return h.findMany.mock.calls[call][0];
}

beforeEach(() => {
  h.findMany.mockReset();
  h.findDistrict.mockReset().mockResolvedValue(DISTRICT);
  h.findDistricts.mockReset();
  h.findCity.mockReset().mockResolvedValue(CITY);
  h.mode.cache = 'mock';
});

describe('cache registration', () => {
  it('caches every loader under its own key with the costs tag for 300 s', () => {
    expect(h.registered).toHaveLength(4);
    for (const { options } of h.registered) {
      expect(options).toEqual({ revalidate: 300, tags: ['costs'] });
    }
    const keys = h.registered.map(({ keyParts }) => keyParts.join('/'));
    expect(new Set(keys).size).toBe(4);
    expect(keys.every((key) => key.startsWith('cost-figures-'))).toBe(true);
  });

  it('calls the loader straight through when Next has no incremental cache (bot:dev under tsx)', async () => {
    h.mode.cache = 'real';
    h.findMany.mockResolvedValue([report()]);

    const summary = await loadBuildingFigures('b1');

    expect(summary.groups.tenant?.completeTotal).toMatchObject({ median: 3800, n: 1 });
    expect(h.findMany).toHaveBeenCalledTimes(1);
  });

  it('passes a database error on without querying again', async () => {
    h.mode.cache = 'real';
    h.findMany.mockRejectedValue(new Error('db down'));
    await expect(loadBuildingFigures('b1')).rejects.toThrow('db down');
    expect(h.findMany).toHaveBeenCalledTimes(1);

    h.mode.cache = 'mock';
    h.findMany.mockClear();
    await expect(loadBuildingFigures('b1')).rejects.toThrow('db down');
    expect(h.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('loadBuildingFigures', () => {
  it("reads the building's visible reports, only the contract's fields, at most 5000", async () => {
    h.findMany.mockResolvedValue([
      report(),
      report({ source: 'scraped', utilitiesComplete: false }),
    ]);

    const summary = await loadBuildingFigures('b1');

    const args = findManyArgs();
    expect(args.where).toEqual({ buildingId: 'b1', isVisible: true });
    expect(args.take).toBe(5000);
    expect(Object.keys(args.select).sort()).toEqual(FIGURE_FIELDS);
    expect(summary).toMatchObject({
      level: 'building',
      rentalType: 'all',
      reportCount: 2,
      sourceCounts: { user: 1, import: 0, scraped: 1 },
    });
    expect(summary.groups.tenant?.completeTotal).toMatchObject({ median: 3800, n: 1 });
    expect(summary.groups.asking?.knownPartTotal).toMatchObject({ median: 3800, n: 1 });
  });

  it('filters by rental type in the query and before the summary', async () => {
    // The mock ignores `where`, so the summary proves the filter also runs before summarizeFigures.
    h.findMany.mockResolvedValue([
      report({ rentalType: 'room', totalMonthlyAvg: new Prisma.Decimal('2200') }),
      report({ rentalType: 'apartment', totalMonthlyAvg: new Prisma.Decimal('4300') }),
      report({ rentalType: null, totalMonthlyAvg: new Prisma.Decimal('4500') }),
    ]);

    const summary = await loadBuildingFigures('b1', 'room');

    expect(findManyArgs().where).toEqual({ buildingId: 'b1', isVisible: true, rentalType: 'room' });
    expect(summary).toMatchObject({ rentalType: 'room', reportCount: 1 });
    expect(summary.groups.tenant?.completeTotal).toMatchObject({ median: 2200, n: 1 });
  });

  it('returns empty groups for a building without visible reports', async () => {
    h.findMany.mockResolvedValue([]);
    const summary = await loadBuildingFigures('b1');
    expect(summary).toMatchObject({ reportCount: 0, groups: { tenant: null, asking: null } });
  });
});

describe('loadAreaReference', () => {
  it('answers with the district when it holds 5 visible reports, without reading the city', async () => {
    h.findMany.mockResolvedValueOnce(reports(5));

    const reference = await loadAreaReference({ districtId: 'd1', cityId: 'c1' });

    expect(reference).toMatchObject({ level: 'district', slug: 'mokotow', name: 'Mokotów' });
    expect(reference?.summary).toMatchObject({ level: 'district', reportCount: 5 });
    expect(h.findDistrict).toHaveBeenCalledWith({
      where: { id: 'd1' },
      select: { slug: true, nameKey: true },
    });
    expect(findManyArgs().where).toEqual({ building: { districtId: 'd1' }, isVisible: true });
    expect(findManyArgs().take).toBe(5000);
    expect(Object.keys(findManyArgs().select).sort()).toEqual(FIGURE_FIELDS);
    expect(h.findMany).toHaveBeenCalledTimes(1);
    expect(h.findCity).not.toHaveBeenCalled();
  });

  it('falls back to the city when the district has 4 reports and the city 40 (example 11)', async () => {
    h.findMany.mockResolvedValueOnce(reports(4)).mockResolvedValueOnce(reports(40));

    const reference = await loadAreaReference({ districtId: 'd1', cityId: 'c1' });

    expect(reference).toMatchObject({ level: 'city', slug: 'warsaw', name: 'Warsaw' });
    expect(reference?.summary).toMatchObject({ level: 'city', reportCount: 40 });
    expect(findManyArgs(1).where).toEqual({ building: { cityId: 'c1' }, isVisible: true });
    expect(h.findCity).toHaveBeenCalledWith({
      where: { id: 'c1' },
      select: { slug: true, nameKey: true },
    });
  });

  it('gives no reference when the city has no report either', async () => {
    h.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(loadAreaReference({ districtId: 'd1', cityId: 'c1' })).resolves.toBeNull();
  });

  it('gives no reference when the city row is missing', async () => {
    h.findCity.mockResolvedValue(null);
    h.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(reports(40));
    await expect(loadAreaReference({ districtId: 'd1', cityId: 'c1' })).resolves.toBeNull();
  });

  it('reads the city directly for a building without a district', async () => {
    h.findMany.mockResolvedValueOnce(reports(2));

    const reference = await loadAreaReference({ districtId: null, cityId: 'c1' });

    expect(reference).toMatchObject({ level: 'city', summary: { reportCount: 2 } });
    expect(h.findDistrict).not.toHaveBeenCalled();
    expect(h.findMany).toHaveBeenCalledTimes(1);
  });

  it('counts the district after the rental-type filter', async () => {
    // 5 district reports, but only 4 rooms: the room reference widens to the city.
    h.findMany
      .mockResolvedValueOnce([...reports(4, { rentalType: 'room' }), report()])
      .mockResolvedValueOnce(reports(40, { rentalType: 'room' }));

    const reference = await loadAreaReference({
      districtId: 'd1',
      cityId: 'c1',
      rentalType: 'room',
    });

    expect(findManyArgs(0).where).toEqual({
      building: { districtId: 'd1' },
      isVisible: true,
      rentalType: 'room',
    });
    expect(findManyArgs(1).where).toEqual({
      building: { cityId: 'c1' },
      isVisible: true,
      rentalType: 'room',
    });
    expect(reference).toMatchObject({
      level: 'city',
      summary: { rentalType: 'room', reportCount: 40 },
    });
  });

  it('D71: minRooms filters both queries by rooms ≥ n, and the level counts the filtered reports', async () => {
    // The database returns only flats with 2+ rooms: 4 in the district, so the city answers.
    h.findMany
      .mockResolvedValueOnce(reports(4, { rooms: 2 }))
      .mockResolvedValueOnce(reports(12, { rooms: 3 }));

    const reference = await loadAreaReference({
      districtId: 'd1',
      cityId: 'c1',
      rentalType: 'apartment',
      minRooms: 2,
    });

    expect(findManyArgs(0).where).toEqual({
      building: { districtId: 'd1' },
      isVisible: true,
      rentalType: 'apartment',
      rooms: { gte: 2 },
    });
    expect(findManyArgs(1).where).toEqual({
      building: { cityId: 'c1' },
      isVisible: true,
      rentalType: 'apartment',
      rooms: { gte: 2 },
    });
    expect(reference).toMatchObject({
      level: 'city',
      summary: { rentalType: 'apartment', reportCount: 12 },
    });
  });

  it('without minRooms (every other caller) the query has no rooms filter', async () => {
    h.findMany.mockResolvedValue(reports(5));
    await loadAreaReference({ districtId: 'd1', cityId: 'c1', rentalType: 'apartment' });
    await loadAreaReference({ districtId: 'd1', cityId: 'c1', minRooms: null });
    expect(h.findMany.mock.calls.every(([args]) => !('rooms' in args.where))).toBe(true);
  });
});

describe('loadDistrictFigures', () => {
  const MOKOTOW = { id: 'd-mok', slug: 'mokotow', nameKey: 'Mokotów' };
  const WOLA = { id: 'd-wola', slug: 'wola', nameKey: 'Wola' };

  /** Reports of two districts, served per query the way Prisma would filter them. */
  function serve(rows: Array<Record<string, unknown> & { building: { districtId: string } }>) {
    h.findDistricts.mockResolvedValue([MOKOTOW, WOLA]);
    h.findMany.mockImplementation(
      async (args: { where: { building?: { districtId?: string }; rentalType?: string } }) =>
        rows.filter(
          (row) =>
            (!args.where.building?.districtId ||
              row.building.districtId === args.where.building.districtId) &&
            (!args.where.rentalType || row.rentalType === args.where.rentalType),
        ),
    );
  }
  const inDistrict = (districtId: string, overrides: Record<string, unknown>, count = 1) =>
    reports(count, overrides).map((row) => ({ ...row, building: { districtId } }));

  it("reads the city's visible reports once, only the contract's fields and the district id", async () => {
    serve([]);
    await loadDistrictFigures('c1');

    expect(h.findDistricts.mock.calls[0][0]).toEqual({
      where: { cityId: 'c1' },
      select: { id: true, slug: true, nameKey: true },
    });
    expect(h.findMany).toHaveBeenCalledTimes(1);
    const args = findManyArgs();
    expect(args.where).toEqual({ isVisible: true, building: { cityId: 'c1' } });
    expect(args.take).toBe(5000);
    const { building, ...fields } = args.select;
    expect(building).toEqual({ select: { districtId: true } });
    expect(Object.keys(fields).sort()).toEqual(FIGURE_FIELDS);
  });

  it('gives each district its own single number per rental type, a median of reports', async () => {
    serve([
      ...inDistrict(MOKOTOW.id, { totalMonthlyAvg: new Prisma.Decimal('4000') }, 2),
      ...inDistrict(MOKOTOW.id, {
        rentalType: 'room',
        totalMonthlyAvg: new Prisma.Decimal('2200'),
      }),
      ...inDistrict(WOLA.id, {
        source: 'scraped',
        utilitiesComplete: false,
        totalMonthlyAvg: new Prisma.Decimal('3500'),
      }),
    ]);
    const [mokotow, wola] = await loadDistrictFigures('c1');

    expect(mokotow).toMatchObject({ slug: 'mokotow', name: 'Mokotów' });
    expect(mokotow.figures.all).toMatchObject({ group: 'tenant', value: 4000, n: 3 });
    expect(mokotow.figures.apartment).toMatchObject({ value: 4000, n: 2 });
    expect(mokotow.figures.room).toMatchObject({ value: 2200, n: 1 });
    expect(wola.figures.all).toMatchObject({ group: 'asking', metric: 'knownPartTotal', n: 1 });
    expect(wola.figures.room).toBeNull();
  });

  it("example 15: 3 tenant + 40 asking reports give the tenant figure of loadAreaReference's headline", async () => {
    serve([
      ...inDistrict(MOKOTOW.id, { totalMonthlyAvg: new Prisma.Decimal('3900') }),
      ...inDistrict(MOKOTOW.id, { totalMonthlyAvg: new Prisma.Decimal('4100') }),
      ...inDistrict(MOKOTOW.id, { totalMonthlyAvg: new Prisma.Decimal('4400') }),
      ...inDistrict(MOKOTOW.id, { source: 'scraped', utilitiesComplete: false }, 40),
    ]);
    const [mokotow] = await loadDistrictFigures('c1');
    h.findDistrict.mockResolvedValue({ slug: MOKOTOW.slug, nameKey: MOKOTOW.nameKey });
    const reference = await loadAreaReference({ districtId: MOKOTOW.id, cityId: 'c1' });

    expect(reference?.level).toBe('district');
    const headline = groupFigureRows(reference!.summary.groups.tenant!).headline!;
    expect(mokotow.figures.all).toMatchObject({ group: 'tenant', metric: headline.key, n: 3 });
    expect(mokotow.figures.all?.value).toBe(headline.figure.median);
    expect(mokotow.figures.all?.n).toBe(headline.figure.n);
  });
});

describe('loadDepositReturns', () => {
  // Golden example 10.
  const DEPOSIT_REPORTS = [
    {
      depositAmount: 4000,
      depositReturned: true,
      depositReturnedAmount: 4000,
      isCurrentTenant: false,
    },
    {
      depositAmount: 4000,
      depositReturned: true,
      depositReturnedAmount: 2500,
      isCurrentTenant: false,
    },
    {
      depositAmount: 4000,
      depositReturned: false,
      depositReturnedAmount: 0,
      isCurrentTenant: false,
    },
    {
      depositAmount: 4000,
      depositReturned: null,
      depositReturnedAmount: null,
      isCurrentTenant: true,
    },
  ].map((row) => ({
    ...row,
    depositAmount: new Prisma.Decimal(row.depositAmount),
    depositReturnedAmount:
      row.depositReturnedAmount == null ? null : new Prisma.Decimal(row.depositReturnedAmount),
  }));

  it("summarises a district's visible reports with the deposit fields only", async () => {
    h.findMany.mockResolvedValue(DEPOSIT_REPORTS);

    await expect(loadDepositReturns({ districtId: 'd1' })).resolves.toEqual({
      answered: 3,
      gotBack: 2,
      full: 1,
      medianDeposit: 4000,
    });
    expect(findManyArgs().where).toEqual({ isVisible: true, building: { districtId: 'd1' } });
    expect(findManyArgs().take).toBe(5000);
    expect(Object.keys(findManyArgs().select).sort()).toEqual(DEPOSIT_FIELDS);
  });

  it("reads a city's visible reports", async () => {
    h.findMany.mockResolvedValue([]);

    await expect(loadDepositReturns({ cityId: 'c1' })).resolves.toEqual({
      answered: 0,
      gotBack: 0,
      full: 0,
      medianDeposit: null,
    });
    expect(findManyArgs().where).toEqual({ isVisible: true, building: { cityId: 'c1' } });
  });
});
