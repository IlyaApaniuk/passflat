import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// PRD 3 FR-17 criterion 4: the same reports through the website checker's area summary
// (POST /api/location-score, its `costs.reference`) and through the roommate room cost
// reference (`roomCostsReply`) show the same median and N per group. The checker reads every
// rental type, so each fixture holds one rental type only: room reports for the room lines,
// whole flats for the per-person split.

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
  resolveDistrictByPoint: vi.fn(() => 'mokotow'),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: h.getTranslations,
}));

import { POST } from '@/app/api/location-score/route';
import { groupFigureRows, orderedFigureGroups } from '@/lib/building-figures-view';
import type { FigureReport, FigureSummary } from '@/lib/cost-figures';
import { resetLocationCheckRateLimit, type LocationCheckerCosts } from '@/lib/location-checker';
import { roundHalfUpTo10 } from '@/lib/roommate/room-costs';
import { SCORE_VERSION } from '@/lib/location-score';

import { roomCostsReply } from './roommate-room-costs';

const input = {
  citySlug: 'warsaw',
  place: {
    street: 'Puławska',
    buildingNumber: '100',
    district: 'Mokotów',
    city: 'Warszawa',
    postalCode: '02-620',
    lat: 52.19,
    lng: 21.02,
    placeId: 'ChIJ-room-test',
    formattedAddress: 'Puławska 100, Warszawa, Polska',
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
  districts: [{ id: 'd-mok', slug: 'mokotow', nameKey: 'Mokotów' }],
};

const building = {
  id: 'building-1',
  slug: 'pulawska-100',
  cityId: 'city-1',
  districtId: 'd-mok',
  street: 'Puławska',
  buildingNumber: '100',
  addressFull: 'Puławska 100',
  addressNormalized: 'pulawska 100',
  lat: 52.19,
  lng: 21.02,
  placeId: 'ChIJ-room-test',
  postalCode: '02-620',
  checksCount: 1,
  lastCheckedAt: new Date('2026-11-01T10:00:00.000Z'),
  city: { slug: 'warsaw', lat: 52.2297, lng: 21.0122 },
  district: { slug: 'mokotow', nameKey: 'Mokotów' },
  locationScore: {
    overall: 70,
    categories: [{ key: 'supermarket', score: 90, nearestM: 120, name: 'Shop' }],
    computedAt: new Date('2026-11-01T10:00:00.000Z'),
    version: SCORE_VERSION,
  },
};

type Where = {
  buildingId?: string;
  rentalType?: string;
  building?: { districtId?: string; cityId?: string };
};

/** Reports of the building's district and of the rest of the city, filtered as the database would. */
function serveReports(rows: { district?: FigureReport[]; elsewhere?: FigureReport[] }) {
  h.costReportFindMany.mockImplementation(async ({ where }: { where: Where }) => {
    if (where.buildingId) return [];
    const district = rows.district ?? [];
    const pool = where.building?.districtId
      ? district
      : where.building?.cityId
        ? [...district, ...(rows.elsewhere ?? [])]
        : [];
    return pool.filter((row) => !where.rentalType || row.rentalType === where.rentalType);
  });
}

function report(rentalType: string, source: string, total: number, complete = true): FigureReport {
  return { source, rentalType, totalMonthlyAvg: total, utilitiesComplete: complete };
}

/** PRD 3 §5 example 2. */
const MOKOTOW_ROOMS = [
  report('room', 'user', 1_600),
  report('room', 'import', 1_800),
  ...[1_400, 1_500, 1_550, 1_700, 2_000].map((total) => report('room', 'scraped', total, false)),
];
const MOKOTOW_FLATS = [4_200, 4_600, 4_800, 4_900, 5_100, 5_400].map((total) =>
  report('apartment', 'user', total),
);

async function checkerCosts(): Promise<LocationCheckerCosts> {
  const response = await POST(
    new NextRequest('http://localhost/api/location-score', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.20' },
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

/** The headline the checker shows per group: the rule its components render. */
function checkerHeadlines(summary: FigureSummary): Shown[] {
  return orderedFigureGroups(summary).map((group) => {
    const { headline } = groupFigureRows(group);
    return { group: group.key, median: headline!.figure.median!, n: headline!.figure.n };
  });
}

const amount = (text: string) => Number(text.replace(/[^\d]/g, ''));

/** Read the room lines of the reply back: group, value and its N. */
function replyRoomLines(text: string): Shown[] {
  return [
    ...text.matchAll(
      /^ {3}(отчёты жильцов|цены из объявлений)[^:]*: <b>([^<]+)<\/b> <i>\(медиана по (\d+) /gm,
    ),
  ].map((match) => ({
    group: match[1] === 'отчёты жильцов' ? 'tenant' : 'asking',
    median: amount(match[2]),
    n: Number(match[3]),
  }));
}

const MOKOTOW = { districtSlugs: ['mokotow'], anyDistrict: false };

beforeEach(() => {
  resetLocationCheckRateLimit();
  for (const mock of Object.values(h)) mock.mockReset();
  h.cityFindUnique.mockResolvedValue(activeCity);
  h.buildingFindFirst.mockResolvedValue(building);
  h.buildingUpdate.mockResolvedValue(building);
  h.buildingFindUnique.mockResolvedValue(null);
  h.buildingFindMany.mockResolvedValue([]);
  h.poiFindMany.mockResolvedValue([]);
  h.districtFindUnique.mockResolvedValue({ slug: 'mokotow', nameKey: 'Mokotów' });
  h.buildingTagFindMany.mockResolvedValue([]);
  h.buildingCount.mockResolvedValue(0);
  h.getTranslations.mockResolvedValue((key: string) => (key === 'city.warsaw' ? 'Warszawa' : key));
  h.computeScore.mockResolvedValue({
    overall: 70,
    categories: [{ key: 'supermarket', score: 90, nearestM: 120, name: null }],
  });
  h.scoreUpsert.mockResolvedValue({
    overall: 70,
    categories: [{ key: 'supermarket', score: 90, nearestM: 120, name: null }],
    computedAt: new Date('2026-11-01T11:00:00.000Z'),
    version: SCORE_VERSION,
  });
});

describe('the checker area summary and the room cost reference agree on the same reports', () => {
  it('room lines: the same median and N per group as the checker (golden case, district level)', async () => {
    serveReports({ district: MOKOTOW_ROOMS });

    const costs = await checkerCosts();
    const text = await roomCostsReply(MOKOTOW, 'ru');

    expect(costs.reference?.level).toBe('district');
    const area = checkerHeadlines(costs.reference!.summary);
    expect(area).toEqual([
      { group: 'tenant', median: 1_700, n: 2 },
      { group: 'asking', median: 1_550, n: 5 },
    ]);
    expect(replyRoomLines(text!)).toEqual(area);
    expect(text).toContain('<b>Mokotów</b>:');
  });

  it('a thin district falls back to the same city figures in both', async () => {
    serveReports({
      district: MOKOTOW_ROOMS.slice(0, 3),
      elsewhere: [
        ...[1_300, 1_450, 1_900].map((total) => report('room', 'user', total)),
        ...[1_200, 1_350].map((total) => report('room', 'scraped', total, false)),
      ],
    });

    const costs = await checkerCosts();
    const text = await roomCostsReply(MOKOTOW, 'ru');

    expect(costs.reference?.level).toBe('city');
    expect(text).toContain('В районе Mokotów меньше 5 отчётов по комнатам; Варшава:');
    const city = checkerHeadlines(costs.reference!.summary);
    expect(city).toEqual([
      { group: 'tenant', median: 1_600, n: 5 },
      { group: 'asking', median: 1_350, n: 3 },
    ]);
    expect(replyRoomLines(text!)).toEqual(city);
  });

  it('the per-person split is half the checker tenant all-in median of the same flats, with its N', async () => {
    serveReports({ district: MOKOTOW_FLATS });

    const costs = await checkerCosts();
    const text = await roomCostsReply(MOKOTOW, 'ru');

    const [tenant] = checkerHeadlines(costs.reference!.summary);
    expect(tenant).toEqual({ group: 'tenant', median: 4_850, n: 6 });
    const split = text!.match(
      /примерно по ([^с]+) с человека \([^,]+, Mokotów; отчёты жильцов: (\d+)\)/,
    );
    expect(split).not.toBeNull();
    expect(amount(split![1])).toBe(roundHalfUpTo10(tenant.median / 2));
    expect(amount(split![1])).toBe(2_430);
    expect(Number(split![2])).toBe(tenant.n);
  });
});
