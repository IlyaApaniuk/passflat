import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// FR-34: the same reports through the website checker (POST /api/location-score,
// spec 03 §Checker) and through the bot (lookupAddress → renderLookup) show the
// same median and N for the same group and metric.

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
    costReport: { findMany: h.costReportFindMany },
    buildingTag: { findMany: h.buildingTagFindMany },
  },
}));

// The loaders' cache is Next's; here every call reads through.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock('@/lib/poi-lookup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/poi-lookup')>()),
  computeLocationScoreFromDb: h.computeScore,
}));

vi.mock('@/lib/geo/district', () => ({
  resolveDistrictByPoint: vi.fn(() => 'srodmiescie'),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: h.getTranslations,
}));

import { POST } from '@/app/api/location-score/route';
import { groupFigureRows, orderedFigureGroups } from '@/lib/building-figures-view';
import type { FigureReport, FigureSummary } from '@/lib/cost-figures';
import { resetLocationCheckRateLimit, type LocationCheckerCosts } from '@/lib/location-checker';
import { SCORE_VERSION } from '@/lib/location-score';

import { renderLookup } from './format';
import type { GeocodedAddress } from './geocode';
import { lookupAddress } from './lookup';

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

/** The same address as the bot receives it from Google. */
const geo: GeocodedAddress = {
  placeId: 'ChIJ-test',
  formatted: 'Marszałkowska 1, Warszawa, Polska',
  street: 'Marszałkowska',
  buildingNumber: '1',
  lat: 52.23,
  lng: 21.01,
  city: 'Warszawa',
  postalCode: '00-001',
  isPrecise: true,
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

const existingBuilding = {
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
  locationScore: {
    overall: 78,
    categories: [{ key: 'supermarket', score: 90, nearestM: 120, name: 'Shop' }],
    computedAt: new Date('2026-07-26T10:00:00.000Z'),
    version: SCORE_VERSION,
  },
};

type Where = {
  buildingId?: string;
  building?: { districtId?: string; cityId?: string };
};

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

function report(source: string, fields: Partial<FigureReport> = {}): FigureReport {
  return {
    source,
    rentalType: 'apartment',
    utilitiesComplete: true,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    ...fields,
  };
}

const many = (count: number, make: (index: number) => FigureReport) =>
  Array.from({ length: count }, (_, index) => make(index));

/** Golden example 1 of spec 03: three tenant reports and two asking prices. */
const mixedBuildingReports = [
  report('user', { rent: 3_200, totalMonthlyAvg: 4_000 }),
  report('import', { rent: 3_000, totalMonthlyAvg: 3_700 }),
  report('user', { rent: 3_400, totalMonthlyAvg: 3_900, utilitiesComplete: false }),
  report('scraped', { rent: 3_500, totalMonthlyAvg: 4_100, utilitiesComplete: false }),
  report('scraped', { rent: 3_300, totalMonthlyAvg: 3_900, utilitiesComplete: false }),
];

/** Six district reports: five tenant reports and one asking price. */
const districtReports = [
  report('user', { rent: 3_100, totalMonthlyAvg: 4_000 }),
  report('user', { rent: 3_300, totalMonthlyAvg: 4_100 }),
  report('user', { rent: 3_000, totalMonthlyAvg: 3_900 }),
  report('user', { rent: 3_400, totalMonthlyAvg: 4_300, isCurrentTenant: true }),
  report('import', { rent: 3_350, totalMonthlyAvg: 4_200 }),
  report('scraped', { rent: 3_600, totalMonthlyAvg: 4_500, utilitiesComplete: false }),
];

const cityReports = many(40, (index) =>
  report(index % 4 === 0 ? 'scraped' : 'user', {
    rent: 2_400 + index * 40,
    totalMonthlyAvg: 3_000 + index * 50,
    utilitiesComplete: index % 4 !== 0,
  }),
);

async function checkerCosts(): Promise<LocationCheckerCosts> {
  h.buildingFindFirst.mockResolvedValue(existingBuilding);
  h.buildingUpdate.mockResolvedValue(existingBuilding);
  const response = await POST(
    new NextRequest('http://localhost/api/location-score', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: JSON.stringify(input),
    }),
  );
  expect(response.status).toBe(200);
  return (await response.json()).costs;
}

interface Shown {
  group: 'tenant' | 'asking';
  median: number;
  n: number;
}

/** The headline the checker shows per group: the same rule its components render. */
function checkerHeadlines(summary: FigureSummary): Shown[] {
  return orderedFigureGroups(summary).map((group) => {
    const { headline } = groupFigureRows(group);
    return {
      group: group.key,
      median: Math.round(headline!.figure.median!),
      n: headline!.figure.n,
    };
  });
}

const amount = (text: string) => Number(text.replace(/[^\d]/g, ''));

/** Read the group blocks of a bot card back: group, headline value and its N. */
function cardHeadlines(card: string): Shown[] {
  const shown: Shown[] = [];
  let group: Shown['group'] | null = null;
  for (const line of card.split('\n')) {
    if (line.startsWith('👥')) group = 'tenant';
    if (line.startsWith('📰')) group = 'asking';
    const match = line.match(/^💸 [^:]+: <b>([^<]+)<\/b> <i>\(медиана по (\d+) /);
    if (match && group) shown.push({ group, median: amount(match[1]), n: Number(match[2]) });
  }
  return shown;
}

/** Read the labelled reference lines of a building card back. */
function cardReference(card: string): Shown[] {
  return [
    ...card.matchAll(/, (отчёты жильцов|цены из объявлений)[^:]*: <b>([^<]+)<\/b> \((\d+)\)/g),
  ].map((match) => ({
    group: match[1] === 'отчёты жильцов' ? 'tenant' : 'asking',
    median: amount(match[2]),
    n: Number(match[3]),
  }));
}

beforeEach(() => {
  resetLocationCheckRateLimit();
  for (const mock of Object.values(h)) mock.mockReset();
  h.cityFindUnique.mockResolvedValue(activeCity);
  h.buildingFindFirst.mockResolvedValue(null);
  h.buildingFindUnique.mockResolvedValue(null);
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

describe('checker summary and bot card agree on the same reports', () => {
  it('shows the same median and N per group for a mixed building and its district reference', async () => {
    serveReports({ building: mixedBuildingReports, district: districtReports });

    const costs = await checkerCosts();
    const lookup = await lookupAddress(geo);
    expect(lookup?.level).toBe('building');
    const card = renderLookup(lookup!, 'ru');

    const building = checkerHeadlines(costs.building);
    expect(building).toEqual([
      { group: 'tenant', median: 3_850, n: 2 },
      { group: 'asking', median: 4_000, n: 2 },
    ]);
    expect(cardHeadlines(card)).toEqual(building);

    expect(costs.reference?.level).toBe('district');
    const area = checkerHeadlines(costs.reference!.summary);
    expect(area).toEqual([
      { group: 'tenant', median: 4_100, n: 5 },
      { group: 'asking', median: 4_500, n: 1 },
    ]);
    expect(cardReference(card)).toEqual(area);
    expect(card).toContain('Район Śródmieście, отчёты жильцов');
  });

  it('shows the same district figures for a building without reports', async () => {
    serveReports({ district: districtReports });

    const costs = await checkerCosts();
    const lookup = await lookupAddress(geo);
    expect(costs.building.reportCount).toBe(0);
    expect(lookup?.level).toBe('district');
    const card = renderLookup(lookup!, 'ru');

    // The one asking price is one observation: no median, so only the tenant headline is read.
    expect(cardHeadlines(card)).toEqual(
      checkerHeadlines(costs.reference!.summary).filter((shown) => shown.group === 'tenant'),
    );
    expect(card).toContain(`<b>4${' '}500${' '}zł</b>\n`);
  });

  it('falls back to the same city figures when the district is thin', async () => {
    serveReports({ district: districtReports.slice(0, 4), city: cityReports });

    const costs = await checkerCosts();
    const lookup = await lookupAddress(geo);
    expect(costs.reference?.level).toBe('city');
    expect(lookup?.level).toBe('city');
    const card = renderLookup(lookup!, 'ru');

    const city = checkerHeadlines(costs.reference!.summary);
    expect(city).toEqual([
      { group: 'tenant', median: expect.any(Number), n: 30 },
      { group: 'asking', median: expect.any(Number), n: 10 },
    ]);
    expect(cardHeadlines(card)).toEqual(city);
    expect(card).toContain('данные по городу');
  });

  it('gives a neighbour the same single number, group and N on the checker map and in the bot (D23)', async () => {
    serveReports({ district: districtReports });
    h.buildingFindMany.mockResolvedValue([
      {
        id: 'b-tenant',
        slug: 'tenant-1',
        addressFull: 'Marszałkowska 3',
        lat: 52.2309,
        lng: 21.01,
        costReports: [
          { source: 'user', utilitiesComplete: true, totalMonthlyAvg: 4_000, rent: 3_100 },
          { source: 'import', utilitiesComplete: true, totalMonthlyAvg: 4_200, rent: 3_300 },
          { source: 'scraped', utilitiesComplete: false, totalMonthlyAvg: 9_000, rent: 8_000 },
        ],
      },
      {
        id: 'b-asking',
        slug: 'asking-1',
        addressFull: 'Marszałkowska 5',
        lat: 52.2318,
        lng: 21.01,
        costReports: [
          { source: 'scraped', utilitiesComplete: false, totalMonthlyAvg: 4_100, rent: 3_000 },
          { source: 'scraped', utilitiesComplete: false, totalMonthlyAvg: 3_900, rent: 3_000 },
        ],
      },
    ]);
    h.buildingFindFirst.mockResolvedValue(existingBuilding);
    h.buildingUpdate.mockResolvedValue(existingBuilding);
    const response = await POST(
      new NextRequest('http://localhost/api/location-score', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.11' },
        body: JSON.stringify(input),
      }),
    );
    const checker = (await response.json()).neighbours as Array<{ slug: string; figure: unknown }>;
    const lookup = await lookupAddress(geo);

    const expected = [
      {
        slug: 'tenant-1',
        figure: { group: 'tenant', metric: 'completeTotal', value: 4_100, n: 2 },
      },
      {
        slug: 'asking-1',
        figure: { group: 'asking', metric: 'knownPartTotal', value: 4_000, n: 2 },
      },
    ];
    expect(checker.map(({ slug, figure }) => ({ slug, figure }))).toEqual(expected);
    expect(lookup!.neighbours.map(({ slug, figure }) => ({ slug, figure }))).toEqual(expected);
    const card = renderLookup(lookup!, 'ru');
    expect(card).toContain('Marszałkowska 3, отчёты жильцов: 4');
    expect(card).toContain('Marszałkowska 5, цены из объявлений, известная часть расходов: 4');
  });
});
