import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany, cacheCalls } = vi.hoisted(() => ({
  findMany: vi.fn(),
  cacheCalls: [] as Array<{ keys: unknown; options: unknown }>,
}));

vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown, keys: unknown, options: unknown) => {
    cacheCalls.push({ keys, options });
    return fn;
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma: { building: { findMany } } }));

import { getBuildingsData } from './cost-aggregates';
import { buildingsForRentalType } from './costs-overview-filter';

type Report = {
  rent: number | null;
  adminFee: number | null;
  totalMonthlyAvg: number | null;
  areaM2: number | null;
  rentalType: string | null;
};

function building(id: string, costReports: Report[], districtSlug = 'mokotow') {
  return {
    id,
    slug: `slug-${id}`,
    addressFull: `Address ${id}`,
    district: { nameKey: `Name ${districtSlug}`, slug: districtSlug },
    lat: 52.2,
    lng: 21.0,
    costReports,
  };
}

// Golden example 6 (spec 03): R1 room total 2,200; R2 and R3 apartments 4,300 and 4,500; all
// complete. Rents, admin fees and areas are added so the existing fields have values to pin.
const EXAMPLE_6: Report[] = [
  { rent: 1800, adminFee: 0, totalMonthlyAvg: 2200, areaM2: 15, rentalType: 'room' },
  { rent: 3500, adminFee: 500, totalMonthlyAvg: 4300, areaM2: 50, rentalType: 'apartment' },
  { rent: 3700, adminFee: 600, totalMonthlyAvg: 4500, areaM2: 60, rentalType: 'apartment' },
];

describe('getBuildingsData', () => {
  beforeEach(() => findMany.mockReset());

  it('builds golden example 6: byType.room 2,200 (1), byType.apartment 4,400 (2)', async () => {
    findMany.mockResolvedValue([building('b1', EXAMPLE_6)]);
    const [row] = await getBuildingsData('city-1', null, null);

    expect(row.byType).toEqual({
      apartment: { medianTotal: 4400, medianRent: 3600, reports: 2 },
      room: { medianTotal: 2200, medianRent: 1800, reports: 1 },
    });
  });

  it('keeps every existing field byte-identical and adds byType last', async () => {
    findMany.mockResolvedValue([building('b1', EXAMPLE_6)]);
    const [row] = await getBuildingsData('city-1', null, null);
    const { byType, ...existing } = row;

    expect(byType).toBeDefined();
    expect(Object.keys(row).at(-1)).toBe('byType');
    // The values the code computed before byType was added, in the same key order.
    expect(JSON.stringify(existing)).toBe(
      JSON.stringify({
        id: 'b1',
        slug: 'slug-b1',
        address: 'Address b1',
        district: 'Name mokotow',
        districtSlug: 'mokotow',
        reports: 3,
        medianTotal: 4300,
        medianRent: 3500,
        medianAdminFee: 500,
        medianExpenses: 800,
        medianRentPerM2: 70,
        medianTotalPerM2: 86,
        medianAdminFeePerM2: 10,
        lat: 52.2,
        lng: 21,
        rentalType: 'apartment',
      }),
    );
  });

  it('gives a type without reports a zero count and no medians; null types count for neither', async () => {
    findMany.mockResolvedValue([
      building('flats', [EXAMPLE_6[1]]),
      building('unknown', [{ ...EXAMPLE_6[0], rentalType: null }]),
    ]);
    const [flats, unknown] = await getBuildingsData('city-1', null, null);

    expect(flats.byType.room).toEqual({ medianTotal: null, medianRent: null, reports: 0 });
    expect(flats.byType.apartment).toEqual({ medianTotal: 4300, medianRent: 3500, reports: 1 });
    expect(unknown.byType).toEqual({
      apartment: { medianTotal: null, medianRent: null, reports: 0 },
      room: { medianTotal: null, medianRent: null, reports: 0 },
    });
    expect(unknown.reports).toBe(1);
  });

  it('reads visible reports only and is cached under a renamed key with the costs tag', async () => {
    findMany.mockResolvedValue([]);
    await getBuildingsData('city-1', null, null);

    const where = findMany.mock.calls[0][0];
    expect(where.where.costReports).toEqual({ some: { isVisible: true } });
    expect(where.include.costReports.where).toEqual({ isVisible: true });

    expect(cacheCalls).toHaveLength(1);
    expect(cacheCalls[0].keys).toEqual(['cost-aggregates-buildings-by-type']);
    expect(cacheCalls[0].keys).not.toContain('cost-aggregates-buildings');
    expect(cacheCalls[0].options).toEqual({ revalidate: 300, tags: ['costs'] });
  });

  it('feeds the overview filter: each type shows its own figures and counts', async () => {
    findMany.mockResolvedValue([building('b1', EXAMPLE_6), building('flats', [EXAMPLE_6[1]])]);
    const buildings = await getBuildingsData('city-1', null, null);

    const rooms = buildingsForRentalType(buildings, 'room');
    expect(rooms.map((b) => [b.id, b.medianTotal, b.reports])).toEqual([['b1', 2200, 1]]);

    const flats = buildingsForRentalType(buildings, 'apartment');
    expect(flats.map((b) => [b.id, b.medianTotal, b.reports])).toEqual([
      ['b1', 4400, 2],
      ['flats', 4300, 1],
    ]);
  });
});
