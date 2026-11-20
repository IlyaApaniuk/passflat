import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Spec 08 §Per-person line (PRD 4 FR-13; D61, D71): the website's line and the bot's `roomSplit`
 * line come from one loader. One fixture of reports runs through the website path
 * (`loadWarsawPerPersonSplit` → `perPersonSplit` → `perPersonLineValues`) and through the bot's
 * `roomCostsReply` for a profile with any district, over one Prisma mock that serves reports by
 * city, rental type and room floor as the database would; value and N must agree. The golden
 * cases are PRD 4 §5 examples 1 – 3. Nothing reaches a database or Telegram.
 */

type Where = {
  rentalType?: string;
  rooms?: { gte: number };
  building?: { districtId?: string; cityId?: string };
};

type Report = {
  source: string;
  rentalType: string;
  totalMonthlyAvg: number;
  utilitiesComplete: boolean;
  rooms: number | null;
};

const h = vi.hoisted(() => ({
  reports: [] as Report[],
  cityFindUnique: vi.fn(),
  costReportFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: { findUnique: h.cityFindUnique },
    district: { findUnique: vi.fn(async () => null) },
    costReport: { findMany: h.costReportFindMany },
  },
}));

// The loaders' cache is Next's; here every call reads through.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

import { roomCostsReply } from '@/lib/bot/roommate-room-costs';
import { loadAreaReference } from '@/lib/cost-figures-query';

import { perPersonLineValues, perPersonSplitArea } from './per-person-line';
import { loadWarsawPerPersonSplit, perPersonSplit } from './room-costs';

const DISTRICTS = [{ id: 'd-mok', slug: 'mokotow', nameKey: 'Mokotów' }];

function flat(source: string, total: number, rooms: number | null, complete = true): Report {
  return {
    source,
    rentalType: 'apartment',
    totalMonthlyAvg: total,
    utilitiesComplete: complete,
    rooms,
  };
}

/** PRD 4 §5 example 1: R1 – R8, Warsaw, whole apartments. */
const EXAMPLE_1 = [
  flat('user', 3_600, 1), // R1 studio: out (D71)
  flat('user', 4_100, 2), // R2
  flat('import', 4_600, 2), // R3
  flat('user', 4_900, 3), // R4
  flat('user', 5_300, 2), // R5
  flat('user', 5_800, 3), // R6
  flat('user', 5_000, null), // R7 no room count: out
  flat('scraped', 4_400, 2), // R8 asking price: never in the tenant group
];
/** Example 2: only R2 qualifies (N = 1 < 2). */
const EXAMPLE_2 = [EXAMPLE_1[0], EXAMPLE_1[1], EXAMPLE_1[6], EXAMPLE_1[7]];
/** Example 3: R2 – R6 known parts only (`utilitiesComplete = false`). */
const EXAMPLE_3 = EXAMPLE_1.map((report, index) =>
  index >= 1 && index <= 5 ? { ...report, utilitiesComplete: false } : report,
);

const translate = (key: string) => (key === 'city.warsaw' ? 'Warsaw' : `missing ${key}`);

/** The website path, as a page and the callout run it. */
async function websiteLine() {
  const split = await loadWarsawPerPersonSplit();
  return perPersonLineValues(split, split ? perPersonSplitArea(split, translate) : undefined);
}

/** The bot's `roomSplit` line for "any district", parsed back to value and N. */
async function botSplit(): Promise<{ value: number; count: number; area: string } | null> {
  const text = await roomCostsReply({ districtSlugs: [], anyDistrict: true }, 'en');
  expect(text).not.toBeNull();
  const match =
    /For two people about ([\d\s]+)\szł each \(half of the median flat, (\d+) tenant reports, ([^)]+)\)\./.exec(
      text ?? '',
    );
  return match
    ? { value: Number(match[1].replace(/\s/g, '')), count: Number(match[2]), area: match[3] }
    : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.cityFindUnique.mockImplementation(async () => ({
    id: 'city-1',
    slug: 'warsaw',
    nameKey: 'city.warsaw',
    isActive: true,
    districts: DISTRICTS,
  }));
  h.costReportFindMany.mockImplementation(async ({ where }: { where: Where }) =>
    h.reports
      .filter((row) => !where.rentalType || row.rentalType === where.rentalType)
      // `rooms: { gte }` as SQL reads it: a null room count never passes.
      .filter(
        (row) => !where.rooms || (typeof row.rooms === 'number' && row.rooms >= where.rooms.gte),
      )
      .filter(() => !where.building?.districtId && where.building?.cityId === 'city-1'),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PRD 4 §5 golden cases through the website path', () => {
  it('example 1 → { value: 2450, count: 5 }, Warsaw', async () => {
    h.reports = EXAMPLE_1;
    expect(await websiteLine()).toEqual({ value: 2_450, count: 5, area: 'Warsaw' });
  });

  it('example 2 (one qualifying report) → null', async () => {
    h.reports = EXAMPLE_2;
    expect(await websiteLine()).toBeNull();
  });

  it('example 3 (known part only) → null', async () => {
    h.reports = EXAMPLE_3;
    expect(await websiteLine()).toBeNull();
  });

  it('reads Warsaw by slug with its districts, and the flats with 2 or more rooms (D71)', async () => {
    h.reports = EXAMPLE_1;
    await loadWarsawPerPersonSplit();
    expect(h.cityFindUnique).toHaveBeenCalledWith({
      where: { slug: 'warsaw' },
      select: { id: true, districts: { select: { id: true, slug: true, nameKey: true } } },
    });
    const wheres = h.costReportFindMany.mock.calls.map(
      ([args]) => (args as { where: Where }).where,
    );
    expect(wheres).toContainEqual(
      expect.objectContaining({
        building: { cityId: 'city-1' },
        rentalType: 'apartment',
        rooms: { gte: 2 },
      }),
    );
  });

  it('a missing Warsaw row or a database error → null, with only the message logged', async () => {
    h.cityFindUnique.mockResolvedValueOnce(null);
    expect(await loadWarsawPerPersonSplit()).toBeNull();

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.reports = EXAMPLE_1;
    h.costReportFindMany.mockRejectedValueOnce(new Error('timeout'));
    expect(await loadWarsawPerPersonSplit()).toBeNull();
    expect(error).toHaveBeenCalledWith('[roommate] per-person split failed', 'timeout');
  });
});

describe('the website and the bot agree (one loader, no second aggregation)', () => {
  it.each([
    ['example 1', EXAMPLE_1],
    ['example 2', EXAMPLE_2],
    ['example 3', EXAMPLE_3],
  ])('%s: the same value and N, or no line on both', async (_label, reports) => {
    h.reports = reports;
    const website = await websiteLine();
    const bot = await botSplit();
    expect(website?.value).toBe(bot?.value);
    expect(website?.count).toBe(bot?.count);
    expect(website?.area).toBe(bot?.area);
  });

  it.each([
    ['example 1', EXAMPLE_1],
    ['example 2', EXAMPLE_2],
    ['example 3', EXAMPLE_3],
  ])(
    '%s: perPersonSplit of the D71 reference plus the website helper equals the bot line',
    async (_label, reports) => {
      h.reports = reports;
      const reference = await loadAreaReference({
        districtId: null,
        cityId: 'city-1',
        rentalType: 'apartment',
        minRooms: 2,
      });
      const split = perPersonSplit(reference);
      const line = perPersonLineValues(split, split ? perPersonSplitArea(split, translate) : null);
      expect(line).toEqual(await botSplit());
      expect(line).toEqual(await websiteLine());
    },
  );

  it('example 1 agrees on 2,450 zł and N 5', async () => {
    h.reports = EXAMPLE_1;
    expect(await loadWarsawPerPersonSplit()).toEqual({
      value: 2_450,
      n: 5,
      level: 'city',
      name: 'city.warsaw',
    });
    expect(await botSplit()).toEqual({ value: 2_450, count: 5, area: 'Warsaw' });
  });
});
