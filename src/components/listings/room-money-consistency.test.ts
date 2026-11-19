import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spec 02 §Room money block / PRD 3 FR-22 criterion 1: one fixture of reports through the
// roommate page's room money loader and block, and through the bot's room cost reference for
// "any district" (`roomCostsReply`, T080), shows the same Warsaw room figures per group.

const h = vi.hoisted(() => ({
  cityFindUnique: vi.fn(),
  costReportFindMany: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: { findUnique: h.cityFindUnique },
    costReport: { findMany: h.costReportFindMany },
  },
}));

// The loaders' cache is Next's; here every call reads through.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const en = JSON.parse(
  readFileSync(join(process.cwd(), 'src/i18n/messages/en.json'), 'utf8'),
) as Record<string, unknown>;
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({
        locale: 'en',
        messages: en as never,
        namespace: namespace as never,
      }),
  };
});
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture: h.capture }) }));
vi.mock('@/i18n/navigation', async () => {
  const { createElement: el } = await import('react');
  return {
    Link: ({ href, children }: { href: string; children?: ReactNode }) =>
      el('a', { href }, children),
  };
});

import type { FigureReport } from '@/lib/cost-figures';
import { roomCostsReply } from '@/lib/bot/roommate-room-costs';
import { loadRoomMoneyReference } from '@/lib/roommate/room-money';

import { RoomMoneyBlock } from './room-money-block';

const WARSAW = {
  id: 'city-1',
  slug: 'warsaw',
  nameKey: 'city.warsaw',
  isActive: true,
  districts: [
    { id: 'd-mok', slug: 'mokotow', nameKey: 'Mokotów' },
    { id: 'd-wola', slug: 'wola', nameKey: 'Wola' },
  ],
};

type Where = { rentalType?: string; building?: { districtId?: string; cityId?: string } };

/** The city's reports, filtered by rental type as the database would. */
function serveReports(rows: FigureReport[]) {
  h.costReportFindMany.mockImplementation(async ({ where }: { where: Where }) => {
    if (!where.building?.cityId && !where.building?.districtId) return [];
    return rows.filter((row) => !where.rentalType || row.rentalType === where.rentalType);
  });
}

function report(rentalType: string, source: string, total: number, complete = true): FigureReport {
  return { source, rentalType, totalMonthlyAvg: total, utilitiesComplete: complete };
}

interface Shown {
  group: 'tenant' | 'asking';
  median: number;
  n: number;
}

const amount = (text: string) => Number(text.replace(/[^\d]/g, ''));

/** The website block's groups: title, headline value and its N. */
async function websiteFigures(): Promise<{ shown: Shown[]; text: string }> {
  const reference = await loadRoomMoneyReference(WARSAW.id);
  const figures = reference && { reference, areaName: 'Warsaw' };
  const text = renderToStaticMarkup(createElement(RoomMoneyBlock, { figures, citySlug: 'warsaw' }))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  const shown = [
    ...text.matchAll(
      /Reference: (tenant reports|asking prices from listings) in Warsaw \(\d+\) [^≈]*≈ ([\d,]+) PLN (\d+) (?:reports?|listings?)/g,
    ),
  ].map((match) => ({
    group: match[1] === 'tenant reports' ? ('tenant' as const) : ('asking' as const),
    median: amount(match[2]),
    n: Number(match[3]),
  }));
  return { shown, text };
}

/** The bot reply's room lines: group, value and its N. */
function botFigures(text: string): Shown[] {
  return [
    ...text.matchAll(
      /^ {3}(отчёты жильцов|цены из объявлений)[^:]*: <b>([^<]+)<\/b> <i>\(медиана по (\d+) /gm,
    ),
  ].map((match) => ({
    group: match[1] === 'отчёты жильцов' ? ('tenant' as const) : ('asking' as const),
    median: amount(match[2]),
    n: Number(match[3]),
  }));
}

const ANY_DISTRICT = { districtSlugs: [], anyDistrict: true };

/** Warsaw rooms: tenant 1,600 / 1,700 / 1,800 (import counts as tenant) and five asking prices. */
const WARSAW_ROOMS = [
  report('room', 'user', 1_600),
  report('room', 'import', 1_800),
  report('room', 'user', 1_700),
  ...[1_400, 1_500, 1_550, 1_700, 2_000].map((total) => report('room', 'scraped', total, false)),
];

/** Whole flats, which neither the room block nor the bot's room lines may count. */
const FLATS = [4_200, 4_600, 4_800].map((total) => report('apartment', 'user', total));

beforeEach(() => {
  for (const mock of Object.values(h)) mock.mockReset();
  h.cityFindUnique.mockResolvedValue(WARSAW);
});

describe('the room money block and the bot room reference agree on one fixture', () => {
  it('the same Warsaw median and N per group (tenant and asking prices)', async () => {
    serveReports([...WARSAW_ROOMS, ...FLATS]);

    const website = await websiteFigures();
    const bot = await roomCostsReply(ANY_DISTRICT, 'ru');

    expect(website.shown).toEqual([
      { group: 'tenant', median: 1_700, n: 3 },
      { group: 'asking', median: 1_550, n: 5 },
    ]);
    expect(botFigures(bot!)).toEqual(website.shown);
    expect(bot).toContain('<b>Варшава</b>:');
    // Neither shows a flat's figure or a number over both groups (1,650 over all eight rooms).
    expect(website.text).not.toMatch(/4,600|1,650/);
  });

  it('tenant reports only: the same single group in both', async () => {
    serveReports([1_500, 1_900].map((total) => report('room', 'user', total)));

    const website = await websiteFigures();
    const bot = await roomCostsReply(ANY_DISTRICT, 'ru');

    expect(website.shown).toEqual([{ group: 'tenant', median: 1_700, n: 2 }]);
    expect(botFigures(bot!)).toEqual(website.shown);
  });

  it('no room report: the block has no figures line and the bot says there are no room figures', async () => {
    serveReports(FLATS);

    const website = await websiteFigures();
    const bot = await roomCostsReply(ANY_DISTRICT, 'ru');

    expect(website.shown).toEqual([]);
    expect(website.text).not.toContain('A room in Warsaw, per month');
    expect(website.text).not.toContain('PLN');
    expect(botFigures(bot!)).toEqual([]);
  });
});
