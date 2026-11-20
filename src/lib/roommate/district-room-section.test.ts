import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createTranslator } from 'next-intl';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FORBIDDEN, type HonestyLocale } from '@/i18n/honesty-rules';
import { groupFigureRows } from '@/lib/building-figures-view';

import { districtRoommateSection } from './district-section';
import type { FlatmateBlockCounts } from './flatmate-block';
import { perPersonLineValues } from './per-person-line';
import { loadRoomCostAreas } from './room-costs';
import {
  findCity,
  findDistrict,
  findReports,
  FIXTURE_CITY_ID,
  FIXTURE_DISTRICTS,
  flat,
  GOLDEN_REPORTS,
  MOKOTOW_ROOMS,
  reportsByDistrict,
  type FixtureReport,
} from './room-costs-fixture.test-support';

/**
 * The district section's room lines and per-person split (spec 09 §District section, PRD 4
 * FR-27): the real figure loaders (`loadRoomCostAreas(city, [district])`, the bot's loader) over a
 * Prisma mock serving the spec 06 golden case, then the pure `districtRoommateSection`. Golden
 * cases: PRD 4 §5 example 5 (Mokotów), Wesoła → the city fallback line, a district with too few
 * 2-room flats → the split named Warsaw. The room lines render through the room money block's
 * component (`AreaReferenceGroups`) with the real messages. Nothing reaches a database.
 */

const h = vi.hoisted(() => ({
  reports: [] as FixtureReport[],
  locale: 'en' as string,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: { findUnique: vi.fn(async () => findCity()) },
    district: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => findDistrict(where.id)),
    },
    costReport: {
      findMany: vi.fn(async ({ where }: { where: Parameters<typeof findReports>[1] }) =>
        findReports(h.reports, where),
      ),
    },
  },
}));

// The loaders' cache is Next's; here every call reads through.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

// `AreaReferenceGroups` (a client component) reads the root translator.
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  const fs = await import('node:fs');
  const path = await import('node:path');
  return {
    ...actual,
    useTranslations: () =>
      actual.createTranslator({
        locale: h.locale,
        messages: JSON.parse(
          fs.readFileSync(path.join(process.cwd(), `src/i18n/messages/${h.locale}.json`), 'utf8'),
        ) as never,
        onError: (error) => {
          throw error;
        },
      }),
  };
});

import { AreaReferenceGroups } from '@/components/buildings/figure-group-block';

const LOCALES: HonestyLocale[] = ['en', 'pl', 'ru', 'uk'];

type Translate = (key: string, values?: Record<string, string | number>) => string;

function translator(locale: HonestyLocale): Translate {
  const messages = JSON.parse(
    readFileSync(join(process.cwd(), `src/i18n/messages/${locale}.json`), 'utf8'),
  ) as never;
  return createTranslator({
    locale,
    messages,
    onError: (error) => {
      throw error;
    },
  }) as unknown as Translate;
}

const CITY = { id: FIXTURE_CITY_ID, districts: FIXTURE_DISTRICTS };

/** PRD 4 §5 example 4's counts (Mokotów 2). */
const EXAMPLE_4: FlatmateBlockCounts = {
  status: 'counts',
  total: 5,
  top: [
    { slug: 'mokotow', count: 2 },
    { slug: 'ochota', count: 2 },
    { slug: 'wola', count: 1 },
  ],
  byDistrict: { mokotow: 2, ochota: 2, wola: 1 },
};

async function section(slug: string, locale: HonestyLocale = 'en') {
  const [area] = await loadRoomCostAreas(CITY, [slug]);
  return districtRoommateSection({ slug, counts: EXAMPLE_4, area, translate: translator(locale) });
}

/** The room lines as the page renders them: the lead, the level line, then the groups. */
function roomText(
  view: Awaited<ReturnType<typeof section>>,
  district: string,
  locale: HonestyLocale,
) {
  const t = translator(locale);
  if (!view.room) return null;
  h.locale = locale;
  const groups = renderToStaticMarkup(
    createElement(AreaReferenceGroups, {
      reference: view.room.reference,
      area: view.room.areaName,
      oneObservationLabel: t(view.room.oneObservation.key, view.room.oneObservation.values),
    }),
  )
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    lead: t('costsSeo.districtRoomLead'),
    level: view.room.cityFallback
      ? t('costsSeo.districtRoomCityFallback', { district, ...view.room.cityFallback })
      : null,
    groups,
  };
}

/** Median and N of each group's headline: what the page shows and the bot words. */
function headlines(view: Awaited<ReturnType<typeof section>>) {
  const groups = view.room?.reference.summary.groups;
  const pick = (group: NonNullable<typeof groups>['tenant']) => {
    const headline = group ? groupFigureRows(group).headline : null;
    return headline && { key: headline.key, median: headline.figure.median, n: headline.figure.n };
  };
  return { tenant: pick(groups?.tenant ?? null), asking: pick(groups?.asking ?? null) };
}

beforeEach(() => {
  h.reports = GOLDEN_REPORTS;
  h.locale = 'en';
});

describe('golden case: PRD 4 §5 example 5 (Mokotów)', () => {
  it('the count line, the district room figures (tenant 1,700 (2), asking 1,550 known part (5)), the split 2,450 (5, Mokotów)', async () => {
    const view = await section('mokotow');
    expect(view.countLine).toEqual({ key: 'costsSeo.districtProfileCount', n: 2 });
    expect(view.room?.reference.level).toBe('district');
    expect(view.room?.areaName).toBe('Mokotów');
    expect(view.room?.cityFallback).toBeNull();
    expect(headlines(view)).toEqual({
      tenant: { key: 'completeTotal', median: 1_700, n: 2 },
      asking: { key: 'knownPartTotal', median: 1_550, n: 5 },
    });
    expect(perPersonLineValues(view.split, view.splitArea)).toEqual({
      value: 2_450,
      count: 5,
      area: 'Mokotów',
    });
  });

  it('renders both groups with their N and level, never one number over both', async () => {
    const text = roomText(await section('mokotow'), 'Mokotów', 'en');
    expect(text?.lead).toBe('Rooms: tenant reports and asking prices');
    expect(text?.level).toBeNull();
    expect(text?.groups).toContain('Reference: tenant reports in Mokotów (2)');
    expect(text?.groups).toContain('≈ 1,700 PLN');
    expect(text?.groups).toContain('Reference: asking prices from listings in Mokotów (5)');
    expect(text?.groups).toContain('≈ 1,550 PLN');
    // The median over all seven room reports (1,600) is a blended number: never shown.
    expect(text?.groups).not.toContain('1,600');
    expect(text?.groups).not.toMatch(/%/);
    // Tenant reports first.
    expect(text!.groups.indexOf('tenant reports')).toBeLessThan(
      text!.groups.indexOf('asking prices'),
    );
  });
});

describe('the level of the figures', () => {
  it('Wesoła below 5 room reports: "Wesoła has fewer than 5 room reports; Warsaw:" and the Warsaw lines', async () => {
    const view = await section('wesola');
    expect(view.room?.reference.level).toBe('city');
    expect(view.room?.areaName).toBe('Warsaw');
    expect(view.room?.cityFallback).toEqual({ min: 5, city: 'Warsaw' });
    const text = roomText(view, 'Wesoła', 'en');
    expect(text?.level).toBe('Wesoła has fewer than 5 room reports; Warsaw:');
    expect(text?.groups).toContain('Reference: tenant reports in Warsaw (3)');
    expect(text?.groups).toContain('≈ 1,600 PLN');
    expect(text?.groups).toContain('Reference: asking prices from listings in Warsaw (6)');
    // Wesoła has no flats of its own: the split is Warsaw's and says so.
    expect(perPersonLineValues(view.split, view.splitArea)).toEqual({
      value: 2_450,
      count: 5,
      area: 'Warsaw',
    });
  });

  it('a district with too few 2-room flats: its own room figures, the split named Warsaw', async () => {
    // Mokotów keeps its seven room reports; of its seven flats only four have 2+ rooms, below
    // MIN_AREA_REPORTS, so the split falls back to the city over the same four (spec 06, D71).
    h.reports = reportsByDistrict({
      'd-mok': [
        ...MOKOTOW_ROOMS,
        ...[3_000, 3_100, 3_200].map((total) => flat('user', total, true, 1)),
        ...[4_600, 4_800, 5_000, 5_200].map((total) => flat('user', total, true, 2)),
      ],
    });
    const view = await section('mokotow');
    expect(view.room?.reference.level).toBe('district');
    expect(view.room?.areaName).toBe('Mokotów');
    expect(view.room?.cityFallback).toBeNull();
    expect(view.split).toMatchObject({ level: 'city', n: 4 });
    expect(perPersonLineValues(view.split, view.splitArea)).toEqual({
      value: 2_450,
      count: 4,
      area: 'Warsaw',
    });
  });

  it('no room report at any level: no figure lines; the split still from the flats', async () => {
    h.reports = reportsByDistrict({
      'd-mok': [4_600, 4_800, 4_900, 5_100, 5_400].map((total) => flat('user', total)),
    });
    const view = await section('mokotow');
    expect(view.room).toBeNull();
    expect(roomText(view, 'Mokotów', 'en')).toBeNull();
    expect(perPersonLineValues(view.split, view.splitArea)).toEqual({
      value: 2_450,
      count: 5,
      area: 'Mokotów',
    });
  });

  it('no report at all: no figure lines and no split', async () => {
    h.reports = [];
    const view = await section('mokotow');
    expect(view.room).toBeNull();
    expect(view.split).toBeNull();
    expect(view.splitArea).toBeUndefined();
  });

  it('an area that is not this district (the loader answered for the city): nothing shown as the district’s', async () => {
    const [cityArea] = await loadRoomCostAreas(CITY, []);
    expect(cityArea.district).toBeNull();
    const view = districtRoommateSection({
      slug: 'mokotow',
      counts: EXAMPLE_4,
      area: cityArea,
      translate: translator('en'),
    });
    expect(view).toEqual({
      countLine: { key: 'costsSeo.districtProfileCount', n: 2 },
      room: null,
      split: null,
      splitArea: undefined,
    });
  });

  it('a rejected load (area absent): the count line only', () => {
    const view = districtRoommateSection({
      slug: 'mokotow',
      counts: EXAMPLE_4,
      area: undefined,
      translate: translator('en'),
    });
    expect(view.room).toBeNull();
    expect(view.split).toBeNull();
    expect(view.countLine).toEqual({ key: 'costsSeo.districtProfileCount', n: 2 });
  });
});

describe('the drafts in four locales', () => {
  const EXPECTED: Record<HonestyLocale, { lead: string; level: string; groups: RegExp[] }> = {
    en: {
      lead: 'Rooms: tenant reports and asking prices',
      level: 'Wesoła has fewer than 5 room reports; Warsaw:',
      groups: [/tenant reports in Warsaw \(3\)/],
    },
    pl: {
      lead: 'Pokoje: raporty najemców i ceny ofertowe z ogłoszeń',
      level: 'W dzielnicy Wesoła jest mniej niż 5 raportów dotyczących pokoi; Warszawa:',
      groups: [/raporty najemców w mieście Warszawa \(3\)/],
    },
    ru: {
      lead: 'Комнаты: отчёты жильцов и цены из объявлений',
      level: 'В районе Wesoła меньше 5 отчётов по комнатам; Варшава:',
      groups: [/Варшава/],
    },
    uk: {
      lead: 'Кімнати: звіти мешканців і ціни з оголошень',
      level: 'У районі Wesoła менше 5 звітів про кімнати; Варшава:',
      groups: [/Варшава/],
    },
  };

  it.each(LOCALES)(
    '%s: the lead, the level line and the city named in the groups',
    async (locale) => {
      const text = roomText(await section('wesola', locale), 'Wesoła', locale);
      expect(text?.lead).toBe(EXPECTED[locale].lead);
      expect(text?.level).toBe(EXPECTED[locale].level);
      for (const pattern of EXPECTED[locale].groups) expect(text?.groups).toMatch(pattern);
    },
  );

  it.each(LOCALES)(
    '%s: no claim word, percentage, rank or "cheapest" in the new lines',
    async (locale) => {
      const text = roomText(await section('wesola', locale), 'Wesoła', locale);
      for (const line of [text?.lead, text?.level]) {
        expect(line).not.toMatch(FORBIDDEN[locale]);
        expect(line).not.toMatch(/%|cheapest|najtań|дешевл|дешевш|rank|ranking|рейтинг/i);
      }
    },
  );
});
