import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  cityFindUnique: vi.fn(),
  buildingFindFirst: vi.fn(),
  buildingFindUnique: vi.fn(),
  buildingUpdate: vi.fn(),
  buildingCreate: vi.fn(),
  buildingCount: vi.fn(),
  scoreUpsert: vi.fn(),
  computeScore: vi.fn(),
  buildingFindMany: vi.fn(),
  poiFindMany: vi.fn(),
  costReportFindMany: vi.fn(),
  districtFindUnique: vi.fn(),
  buildingTagFindMany: vi.fn(),
  getTranslations: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: { findUnique: h.cityFindUnique },
    district: { findUnique: h.districtFindUnique },
    building: {
      findFirst: h.buildingFindFirst,
      findMany: h.buildingFindMany,
      findUnique: h.buildingFindUnique,
      update: h.buildingUpdate,
      create: h.buildingCreate,
      count: h.buildingCount,
    },
    buildingLocationScore: { upsert: h.scoreUpsert },
    poi: { findMany: h.poiFindMany },
    // The figure contract's loaders: the building, its district or city, deposits.
    costReport: { findMany: h.costReportFindMany },
    buildingTag: { findMany: h.buildingTagFindMany },
  },
}));

// The loaders' cache is Next's; here every call reads through.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

// Only the scoring source is faked; the category table and math stay real so a
// change to either still has to keep this route's contract working.
vi.mock('@/lib/poi-lookup', async (importOriginal) => ({
  // Only the scoring source is faked. boundingBoxAround is pure geometry and
  // the neighbours query depends on it, so it stays real.
  ...(await importOriginal<typeof import('@/lib/poi-lookup')>()),
  computeLocationScoreFromDb: h.computeScore,
}));

vi.mock('@/lib/geo/district', () => ({
  resolveDistrictByPoint: vi.fn(() => 'srodmiescie'),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: h.getTranslations,
}));

import type { FigureGroup, FigureReport, FigureSummary } from '@/lib/cost-figures';
import { loadBuildingFigures } from '@/lib/cost-figures-query';
import {
  isLocationCheckRateLimited,
  NEIGHBOUR_REPORT_SELECT,
  resetLocationCheckRateLimit,
} from '@/lib/location-checker';
import { SCORE_VERSION } from '@/lib/location-score';
import { GET, POST } from './route';

const input = {
  citySlug: 'warsaw',
  place: {
    street: 'Marszałkowska',
    buildingNumber: '1',
    district: 'Śródmieście',
    city: 'Warszawa',
    postalCode: '00-001',
    lat: 52.23,
    lng: 21.01,
    placeId: 'ChIJ-test',
    formattedAddress: 'Marszałkowska 1, Warszawa, Polska',
  },
};

const activeCity = {
  id: 'city-1',
  slug: 'warsaw',
  nameKey: 'city.warsaw',
  lat: 52.2297,
  lng: 21.0122,
  bounds: { north: 52.4, south: 52.0, east: 21.3, west: 20.7 },
  isActive: true,
  country: { defaultLocale: 'pl' },
  districts: [{ id: 'district-1', slug: 'srodmiescie', nameKey: 'Śródmieście' }],
};

const cachedScore = {
  overall: 78,
  categories: [{ key: 'supermarket', score: 90, nearestM: 120, name: 'Shop' }],
  computedAt: new Date('2026-07-26T10:00:00.000Z'),
  version: SCORE_VERSION,
};

function building(overrides: Record<string, unknown> = {}) {
  return {
    id: 'building-1',
    slug: 'marszalkowska-1',
    cityId: 'city-1',
    districtId: 'district-1',
    street: 'Marszałkowska',
    buildingNumber: '1',
    addressFull: 'Marszałkowska 1',
    addressNormalized: 'marszalkowska 1',
    lat: 52.23,
    lng: 21.01,
    placeId: 'ChIJ-test',
    postalCode: '00-001',
    checksCount: 4,
    lastCheckedAt: new Date('2026-07-25T10:00:00.000Z'),
    city: { slug: 'warsaw', lat: 52.2297, lng: 21.0122 },
    district: { slug: 'srodmiescie', nameKey: 'Śródmieście' },
    locationScore: cachedScore,
    ...overrides,
  };
}

type Where = {
  buildingId?: string;
  building?: { districtId?: string; cityId?: string };
};
type ReportFixture = FigureReport;

/**
 * Serve the loaders' report queries by their `where`: this building's reports,
 * the district's and the city's. Deposit queries read the same rows.
 */
function serveReports(rows: {
  building?: ReportFixture[];
  district?: ReportFixture[];
  city?: ReportFixture[];
}) {
  h.costReportFindMany.mockImplementation(async ({ where }: { where: Where }) => {
    if (where.buildingId) return where.buildingId === 'building-1' ? (rows.building ?? []) : [];
    if (where.building?.districtId) return rows.district ?? [];
    if (where.building?.cityId) return rows.city ?? [];
    return [];
  });
}

function report(source: string, fields: Partial<ReportFixture> = {}): ReportFixture {
  return {
    source,
    rentalType: 'apartment',
    utilitiesComplete: true,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    ...fields,
  };
}

const many = (count: number, make: (index: number) => ReportFixture) =>
  Array.from({ length: count }, (_, index) => make(index));

/** Golden example 1 of spec 03: three tenant reports and two asking prices. */
const mixedBuildingReports = [
  report('user', { rent: 3_200, totalMonthlyAvg: 4_000 }),
  report('import', { rent: 3_000, totalMonthlyAvg: 3_700 }),
  report('user', { rent: 3_400, totalMonthlyAvg: 3_900, utilitiesComplete: false }),
  report('scraped', { rent: 3_500, totalMonthlyAvg: 4_100, utilitiesComplete: false }),
  report('scraped', { rent: 3_300, totalMonthlyAvg: 3_900, utilitiesComplete: false }),
];

/** A district answer (golden example 10 among its rows) of six reports. */
const districtReports = [
  report('user', {
    totalMonthlyAvg: 4_000,
    depositAmount: 4_000,
    depositReturned: true,
    depositReturnedAmount: 4_000,
  }),
  report('user', {
    totalMonthlyAvg: 4_100,
    depositAmount: 4_000,
    depositReturned: true,
    depositReturnedAmount: 2_500,
  }),
  report('user', {
    totalMonthlyAvg: 3_900,
    depositAmount: 4_000,
    depositReturned: false,
    depositReturnedAmount: 0,
  }),
  report('user', { totalMonthlyAvg: 4_300, isCurrentTenant: true, depositReturned: null }),
  report('import', { totalMonthlyAvg: 4_200 }),
  report('scraped', { totalMonthlyAvg: 4_500, utilitiesComplete: false }),
];

async function checkedCosts() {
  const existing = building();
  h.buildingFindFirst.mockResolvedValue(existing);
  h.buildingUpdate.mockResolvedValue(existing);
  const response = await POST(postRequest());
  expect(response.status).toBe(200);
  return (await response.json()).costs;
}

const METRICS = [
  'completeTotal',
  'knownPartTotal',
  'rent',
  'expenses',
  'rentPerM2',
  'completeTotalPerM2',
  'adminFee',
] as const;

/** Median and N of every metric per group: what two surfaces must agree on. */
function mediansAndN(summary: FigureSummary) {
  const byGroup = (group: FigureGroup | null) =>
    group &&
    Object.fromEntries(
      METRICS.map((metric) => [metric, { median: group[metric].median, n: group[metric].n }]),
    );
  return { tenant: byGroup(summary.groups.tenant), asking: byGroup(summary.groups.asking) };
}

function postRequest(body: unknown = input, ip = '203.0.113.10') {
  return new NextRequest('http://localhost/api/location-score', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetLocationCheckRateLimit();
  for (const mock of Object.values(h)) mock.mockReset();
  h.cityFindUnique.mockResolvedValue(activeCity);
  h.buildingFindFirst.mockResolvedValue(null);
  h.buildingFindUnique.mockResolvedValue(null);
  // No neighbours, nuisances or tenant tags unless a test says otherwise.
  h.buildingFindMany.mockResolvedValue([]);
  h.poiFindMany.mockResolvedValue([]);
  h.costReportFindMany.mockResolvedValue([]);
  h.districtFindUnique.mockResolvedValue({ slug: 'srodmiescie', nameKey: 'Śródmieście' });
  h.buildingTagFindMany.mockResolvedValue([]);
  h.buildingCount.mockResolvedValue(0);
  h.getTranslations.mockResolvedValue((key: string) => (key === 'city.warsaw' ? 'Warszawa' : key));
  h.computeScore.mockResolvedValue({
    overall: 81,
    categories: [{ key: 'supermarket', score: 100, nearestM: 50, name: null }],
  });
  h.scoreUpsert.mockResolvedValue({
    overall: 81,
    categories: [{ key: 'supermarket', score: 100, nearestM: 50, name: null }],
    computedAt: new Date('2026-07-26T11:00:00.000Z'),
    version: SCORE_VERSION,
  });
});

describe('POST /api/location-score', () => {
  it('rejects malformed input before touching the database', async () => {
    const response = await POST(postRequest({ citySlug: 'warsaw', place: {} }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'INVALID_REQUEST' });
    expect(h.cityFindUnique).not.toHaveBeenCalled();
  });

  it('keeps v1 explicitly limited to Warsaw', async () => {
    const response = await POST(postRequest({ ...input, citySlug: 'krakow' }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: 'CITY_NOT_FOUND' });
    expect(h.cityFindUnique).not.toHaveBeenCalled();
  });

  it('rejects an address outside the active city bounds or canonical locality', async () => {
    const response = await POST(
      postRequest({ ...input, place: { ...input.place, city: 'Pruszków' } }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'ADDRESS_OUTSIDE_CITY' });
    expect(h.buildingFindFirst).not.toHaveBeenCalled();
  });

  it('enforces the ten-per-minute IP limiter', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect(isLocationCheckRateLimited('203.0.113.10')).toBe(false);
    }
    const response = await POST(postRequest());
    expect(response.status).toBe(429);
    expect(h.cityFindUnique).not.toHaveBeenCalled();
  });

  it('returns nearby buildings with costs, trimmed to the radius and nearest first', async () => {
    const existing = building();
    h.buildingFindFirst.mockResolvedValue(existing);
    h.buildingUpdate.mockResolvedValue(existing);
    h.buildingFindMany.mockResolvedValue([
      // ~780m east — inside the 1km circle.
      {
        id: 'b-far',
        slug: 'far',
        addressFull: 'Far 2',
        lat: 52.23,
        lng: 21.0215,
        // Asking prices only, utilities not established: the asking group's known part.
        costReports: [
          { source: 'scraped', utilitiesComplete: false, totalMonthlyAvg: 5_000, rent: 4_000 },
        ],
      },
      // ~110m north — nearest, so it must come first.
      {
        id: 'b-near',
        slug: 'near',
        addressFull: 'Near 1',
        lat: 52.231,
        lng: 21.01,
        // The tenant report wins; the asking price is not blended into it.
        costReports: [
          { source: 'user', utilitiesComplete: true, totalMonthlyAvg: 4_000, rent: 3_100 },
          { source: 'scraped', utilitiesComplete: false, totalMonthlyAvg: 9_000, rent: 8_000 },
        ],
      },
      // Inside the bounding box corner but ~1.2km away, so outside the circle.
      {
        id: 'b-corner',
        slug: 'corner',
        addressFull: 'Corner 3',
        lat: 52.2375,
        lng: 21.0195,
        costReports: [{ source: 'user', totalMonthlyAvg: 9_000, rent: 8_000 }],
      },
      // No usable median — nothing to show on a pin.
      {
        id: 'b-empty',
        slug: 'empty',
        addressFull: 'Empty 4',
        lat: 52.2305,
        lng: 21.0105,
        costReports: [{ source: 'user', totalMonthlyAvg: null, rent: null }],
      },
    ]);

    const response = await POST(postRequest());
    const body = await response.json();

    expect(body.neighbours.map((n: { id: string }) => n.id)).toEqual(['b-near', 'b-far']);
    expect(body.neighbours[0]).toMatchObject({
      slug: 'near',
      address: 'Near 1',
      figure: { group: 'tenant', metric: 'completeTotal', value: 4_000, n: 1 },
      // Both groups' visible reports, for analytics only.
      reportCount: 2,
    });
    expect(body.neighbours[1]).toMatchObject({
      slug: 'far',
      figure: { group: 'asking', metric: 'knownPartTotal', value: 5_000, n: 1 },
      reportCount: 1,
    });
    expect(body.neighbours[0]).not.toHaveProperty('totalMedian');
    expect(body.neighbours[0].distanceM).toBeLessThan(body.neighbours[1].distanceM);
    // The neighbour query selects only the headline fields.
    const neighbourQuery = h.buildingFindMany.mock.calls.find(
      ([args]) => args?.select?.costReports,
    )?.[0];
    expect(neighbourQuery.select.costReports.select).toEqual(NEIGHBOUR_REPORT_SELECT);
  });

  it('uses a fresh cache, increments the check and returns the costs by group', async () => {
    const existing = building();
    const updated = building({ ...existing, checksCount: 5 });
    h.buildingFindFirst.mockResolvedValue(existing);
    h.buildingUpdate.mockResolvedValue(updated);
    serveReports({
      building: [
        report('user', { totalMonthlyAvg: 4_000, rent: 3_200 }),
        report('scraped', { totalMonthlyAvg: 4_400, rent: 3_400, utilitiesComplete: false }),
      ],
    });

    const response = await POST(postRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      building: { id: 'building-1', address: 'Marszałkowska 1', citySlug: 'warsaw' },
      score: { overall: 78 },
      costs: {
        building: {
          level: 'building',
          reportCount: 2,
          sourceCounts: { user: 1, import: 0, scraped: 1 },
          groups: {
            tenant: { reportCount: 1, completeTotal: { median: 4_000, n: 1 } },
            asking: { reportCount: 1, knownPartTotal: { median: 4_400, n: 1 } },
          },
        },
      },
    });
    expect(h.buildingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'building-1' },
        data: expect.objectContaining({ checksCount: { increment: 1 } }),
      }),
    );
    const updateData = h.buildingUpdate.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty('placeId');
    expect(updateData).not.toHaveProperty('lat');
    expect(updateData).not.toHaveProperty('lng');
    expect(updateData).not.toHaveProperty('postalCode');
    expect(updateData).not.toHaveProperty('districtId');
    expect(h.buildingCount).not.toHaveBeenCalled();
    expect(h.computeScore).not.toHaveBeenCalled();
  });

  it('creates a tracked building under the durable breaker and caches a computed score', async () => {
    const created = building({
      checksCount: 1,
      locationScore: null,
      costReports: [],
    });
    h.buildingCreate.mockResolvedValue(created);

    const response = await POST(postRequest());
    expect(response.status).toBe(200);
    expect(h.buildingCount).toHaveBeenCalledWith({
      where: {
        createdAt: { gt: expect.any(Date) },
        checksCount: { gt: 0 },
      },
    });
    expect(h.buildingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cityId: 'city-1',
          placeId: 'ChIJ-test',
          checksCount: 1,
          lastCheckedAt: expect.any(Date),
        }),
      }),
    );
    expect(h.computeScore).toHaveBeenCalledOnce();
    expect(h.scoreUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { buildingId: 'building-1' },
        create: expect.objectContaining({ version: SCORE_VERSION }),
        update: expect.objectContaining({ version: SCORE_VERSION }),
      }),
    );
  });

  it('deduplicates simultaneous Overpass work for the same uncached building', async () => {
    const uncached = building({ locationScore: null });
    h.buildingFindFirst.mockResolvedValue(uncached);
    h.buildingUpdate.mockResolvedValue(uncached);

    let resolveScore!: (value: {
      overall: number;
      categories: Array<{ key: string; score: number; nearestM: number; name: null }>;
    }) => void;
    h.computeScore.mockReturnValue(
      new Promise((resolve) => {
        resolveScore = resolve;
      }),
    );

    const first = POST(postRequest(input, '203.0.113.11'));
    const second = POST(postRequest(input, '203.0.113.12'));

    await vi.waitFor(() => expect(h.computeScore).toHaveBeenCalledOnce());
    resolveScore({
      overall: 81,
      categories: [{ key: 'supermarket', score: 100, nearestM: 50, name: null }],
    });

    const responses = await Promise.all([first, second]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(h.computeScore).toHaveBeenCalledOnce();
    expect(h.scoreUpsert).toHaveBeenCalledOnce();
  });

  it('trips the durable breaker only on a genuinely new address', async () => {
    h.buildingCount.mockResolvedValue(200);
    const response = await POST(postRequest());
    expect(response.status).toBe(429);
    expect(h.buildingCreate).not.toHaveBeenCalled();
    expect(h.computeScore).not.toHaveBeenCalled();
  });

  it('recovers a same-address create race after P2002 and records both checks', async () => {
    const raced = building();
    h.buildingFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(raced);
    h.buildingCreate.mockRejectedValueOnce({ code: 'P2002' });
    h.buildingUpdate.mockResolvedValue(building({ checksCount: 2 }));

    const response = await POST(postRequest());
    expect(response.status).toBe(200);
    expect(h.buildingCreate).toHaveBeenCalledOnce();
    expect(h.buildingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'building-1' },
        data: expect.objectContaining({ checksCount: { increment: 1 } }),
      }),
    );
    expect(h.computeScore).not.toHaveBeenCalled();
  });

  it('briefly cools down retries when Overpass fails', async () => {
    const uncached = building({ locationScore: null });
    h.buildingFindFirst.mockResolvedValue(uncached);
    h.buildingUpdate.mockResolvedValue(uncached);
    h.computeScore.mockRejectedValue(new Error('Overpass unavailable'));

    const first = await POST(postRequest(input, '203.0.113.21'));
    const second = await POST(postRequest(input, '203.0.113.22'));

    expect(first.status).toBe(503);
    expect(second.status).toBe(503);
    expect(h.computeScore).toHaveBeenCalledOnce();
    expect(h.scoreUpsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/location-score costs from the figure contract', () => {
  const isDepositQuery = (args: { select: Record<string, boolean> }) =>
    'depositReturned' in args.select && !('source' in args.select);

  it('answers a mixed building by group, with the district reference and its deposit statistic', async () => {
    serveReports({ building: mixedBuildingReports, district: districtReports });

    const costs = await checkedCosts();

    expect(costs.building).toMatchObject({
      level: 'building',
      rentalType: 'all',
      reportCount: 5,
      sourceCounts: { user: 2, import: 1, scraped: 2 },
      groups: {
        tenant: {
          reportCount: 3,
          observation: 'several',
          completeTotal: { median: 3_850, n: 2 },
          knownPartTotal: { median: 3_900, n: 1 },
          rent: { median: 3_200, n: 3 },
          expenses: { median: 750, n: 2 },
        },
        asking: {
          reportCount: 2,
          completeTotal: { median: null, n: 0 },
          knownPartTotal: { median: 4_000, n: 2 },
          rent: { median: 3_400, n: 2 },
        },
      },
    });
    expect(costs.reference).toMatchObject({
      level: 'district',
      slug: 'srodmiescie',
      name: 'Śródmieście',
      summary: {
        level: 'district',
        reportCount: 6,
        groups: {
          tenant: { completeTotal: { median: 4_100, n: 5 } },
          asking: { knownPartTotal: { median: 4_500, n: 1 } },
        },
      },
    });
    expect(costs.deposit).toEqual({
      level: 'district',
      returns: { answered: 3, gotBack: 2, full: 1, medianDeposit: 4_000 },
    });
    const depositCall = h.costReportFindMany.mock.calls.find(([args]) => isDepositQuery(args));
    expect(depositCall?.[0].where).toEqual({
      isVisible: true,
      building: { districtId: 'district-1' },
    });
    // The building's figure is never set against an ungated district median.
    expect(JSON.stringify(costs)).not.toMatch(/districtMedian|districtName|sourceKind/);
  });

  it('answers a building without reports with its district as a labelled reference', async () => {
    serveReports({ district: districtReports });

    const costs = await checkedCosts();

    expect(costs.building).toMatchObject({
      level: 'building',
      reportCount: 0,
      groups: { tenant: null, asking: null },
    });
    expect(costs.reference).toMatchObject({
      level: 'district',
      name: 'Śródmieście',
      summary: { reportCount: 6, groups: { tenant: { reportCount: 5 } } },
    });
    expect(costs.deposit).toMatchObject({ level: 'district', returns: { answered: 3 } });
  });

  it('falls back to the city when the district holds fewer than MIN_AREA_REPORTS reports', async () => {
    const cityReports = many(40, (index) =>
      report(index % 4 === 0 ? 'scraped' : 'user', {
        totalMonthlyAvg: 3_000 + index * 50,
        depositAmount: 3_000,
        depositReturned: index % 2 === 0,
      }),
    );
    serveReports({ district: districtReports.slice(0, 4), city: cityReports });

    const costs = await checkedCosts();

    expect(costs.building.reportCount).toBe(0);
    expect(costs.reference).toMatchObject({
      level: 'city',
      slug: 'warsaw',
      name: 'city.warsaw',
      summary: { level: 'city', reportCount: 40, sourceCounts: { user: 30, scraped: 10 } },
    });
    expect(costs.deposit).toMatchObject({ level: 'city', returns: { answered: 40, gotBack: 20 } });
    const depositCall = h.costReportFindMany.mock.calls.find(([args]) => isDepositQuery(args));
    expect(depositCall?.[0].where).toEqual({ isVisible: true, building: { cityId: 'city-1' } });
    // Four district reports never surface as a district figure.
    expect(JSON.stringify(costs)).not.toContain('Śródmieście');
  });

  it('has no reference and no deposit statistic when the city has no report either', async () => {
    serveReports({});

    const costs = await checkedCosts();

    expect(costs).toMatchObject({
      building: { reportCount: 0, groups: { tenant: null, asking: null } },
      reference: null,
      deposit: null,
    });
    expect(h.costReportFindMany.mock.calls.some(([args]) => isDepositQuery(args))).toBe(false);
  });

  it('gives the same median and N per group as loadBuildingFigures for the same reports', async () => {
    const fixture = [
      ...mixedBuildingReports.map((row, index) => ({
        ...row,
        areaM2: 40 + index * 5,
        adminFee: index === 0 ? 0 : 400 + index * 10,
      })),
      report('import', { rentalType: 'room', rent: 2_000, totalMonthlyAvg: 2_300, areaM2: 15 }),
    ];
    serveReports({ building: fixture, district: districtReports });

    const checker = (await checkedCosts()).building as FigureSummary;
    const page = await loadBuildingFigures('building-1');

    expect(mediansAndN(checker)).toEqual(mediansAndN(page));
    expect(mediansAndN(checker).tenant).toMatchObject({
      completeTotal: { median: 3_700, n: 3 },
      rent: { median: 3_100, n: 4 },
    });
    // The whole summary, not only the medians, is the contract's.
    expect(checker).toEqual(JSON.parse(JSON.stringify(page)));
  });
});

describe('GET /api/location-score', () => {
  it('does not expose the v1 read endpoint for other active cities', async () => {
    const request = new NextRequest('http://localhost/api/location-score?city=krakow&p=ChIJ-test');
    const response = await GET(request);
    expect(response.status).toBe(404);
    expect(h.cityFindUnique).not.toHaveBeenCalled();
  });

  it('returns a known fresh cached result without writes, increments or Overpass', async () => {
    h.buildingFindFirst.mockResolvedValue(building());
    const request = new NextRequest('http://localhost/api/location-score?city=warsaw&p=ChIJ-test');
    const response = await GET(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ score: { overall: 78 } });
    expect(h.buildingUpdate).not.toHaveBeenCalled();
    expect(h.computeScore).not.toHaveBeenCalled();
    expect(h.scoreUpsert).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown address and 204 for a known missing cache', async () => {
    h.buildingFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(building({ locationScore: null }));
    const request = () =>
      new NextRequest('http://localhost/api/location-score?city=warsaw&p=ChIJ-test');

    expect((await GET(request())).status).toBe(404);
    expect((await GET(request())).status).toBe(204);
    expect(h.computeScore).not.toHaveBeenCalled();
  });
});
