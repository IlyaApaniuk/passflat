import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SingleNumberFigure } from '@/lib/cost-figures';

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as Record<string, unknown>,
  ]),
) as Record<Locale, Record<string, unknown>>;

type DepositRow = {
  source: string;
  depositAmount: number | null;
  depositReturned: boolean | null;
  depositReturnedAmount?: number | null;
  isCurrentTenant?: boolean | null;
};

const state = vi.hoisted(() => ({
  locale: 'en' as 'pl' | 'en' | 'ru' | 'uk',
  deposits: [] as DepositRow[],
  findMany: [] as unknown[],
  cityFigure: null as SingleNumberFigure | null,
  /** The props of every `FlatmateCallout` the page rendered. */
  callouts: [] as unknown[],
  /** What `loadWarsawPerPersonSplit` resolves to; an Error rejects. */
  split: null as unknown,
}));

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  return {
    getTranslations: async (namespace?: string) =>
      createTranslator({
        locale: state.locale,
        messages: messages[state.locale] as never,
        namespace: namespace as never,
      }),
    getLocale: async () => state.locale,
    setRequestLocale: () => {},
  };
});
vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: {
      findUnique: vi.fn(async () => ({ id: 'c-warsaw', nameKey: 'cities.warsaw', districts: [] })),
    },
    costReport: {
      findMany: vi.fn(async (args: unknown) => {
        state.findMany.push(args);
        return state.deposits;
      }),
    },
  },
}));
// The cost figures of the report are tested in `src/lib/area-figures-consistency.test.ts`.
vi.mock('@/lib/cost-aggregates', () => ({ getBuildingsData: vi.fn(async () => []) }));
vi.mock('@/lib/cost-figures-query', () => ({
  loadCityFigure: vi.fn(async () => state.cityFigure),
  loadDistrictFigures: vi.fn(async () => []),
}));
// The split's loader is tested over reports in `src/lib/roommate/per-person-consistency.test.ts`.
vi.mock('@/lib/roommate/room-costs', () => ({
  loadWarsawPerPersonSplit: vi.fn(async () => {
    if (state.split instanceof Error) throw state.split;
    return state.split;
  }),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));
vi.mock('@/components/landing/footer', () => ({ Footer: () => null }));
// The async server callout cannot run inside `renderToStaticMarkup`; a marker stands in for it
// (its own render is tested in `src/components/roommate/flatmate-callout.test.ts`).
vi.mock('@/components/roommate/flatmate-callout', () => ({
  FlatmateCallout: (props: { surface: string }) => {
    state.callouts.push(props);
    return createElement('section', { 'data-callout': props.surface }, 'FLATMATE_CALLOUT');
  },
}));

import WarsawRentPricesReport from './page';

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');

async function renderReport() {
  const page = (await WarsawRentPricesReport({
    params: Promise.resolve({ locale: state.locale }),
  })) as ReactElement;
  return text(renderToStaticMarkup(page));
}

const report = (locale: Locale) => messages[locale].rentReport as Record<string, string>;

describe('blog data report: deposit numbers', () => {
  beforeEach(() => {
    state.locale = 'en';
    state.findMany = [];
    state.deposits = [
      { source: 'user', depositAmount: 4000, depositReturned: true, depositReturnedAmount: 4000 },
      { source: 'user', depositAmount: 4000, depositReturned: true, depositReturnedAmount: 1000 },
      { source: 'import', depositAmount: 4000, depositReturned: false, depositReturnedAmount: 0 },
      // Neither a current tenant nor an asking price is an answer.
      { source: 'user', depositAmount: 4000, depositReturned: true, isCurrentTenant: true },
      {
        source: 'scraped',
        depositAmount: 9000,
        depositReturned: true,
        depositReturnedAmount: 9000,
      },
    ];
  });

  it('reads the fields summarizeDepositReturns needs', async () => {
    await renderReport();
    expect(state.findMany).toContainEqual({
      where: { building: { cityId: 'c-warsaw' }, isVisible: true },
      select: {
        source: true,
        depositAmount: true,
        depositReturned: true,
        depositReturnedAmount: true,
        isCurrentTenant: true,
      },
      take: 5000,
    });
  });

  it('shows "X of N who answered got it back, fully or partly" in the card and the FAQ', async () => {
    const page = await renderReport();

    expect(page).toContain(report('en').kaucjaTitle);
    expect(page).toContain('The median deposit in tenant reports is ≈4 000 zł.');
    expect(page).toContain('2 of 3 who answered got the deposit back, fully or partly');
    expect(page).toContain(
      'In our data, 2 of 3 leavers who answered got the deposit back, fully or partly.',
    );
    // The FAQPage JSON-LD carries the same answer.
    expect(page).toContain('"text":"In our data, 2 of 3 leavers who answered');
    expect(page).not.toContain('%');
    expect(page).not.toMatch(/back in full\b(?! — guide)/);
  });

  it('renders the deposit copy in every locale with both counts', async () => {
    for (const locale of LOCALES) {
      state.locale = locale;
      const page = await renderReport();
      expect(page, locale).toContain(report(locale).kaucjaReturnedLabel);
      expect(page, locale).toContain(report(locale).faqQ3);
      expect(page, locale).toMatch(/2\D{1,4}3/);
      expect(page, locale).not.toContain('%');
    }
  });

  it('shows no deposit claim below the gate', async () => {
    state.deposits = [
      { source: 'user', depositAmount: 4000, depositReturned: true, depositReturnedAmount: 4000 },
      { source: 'user', depositAmount: 4000, depositReturned: false, depositReturnedAmount: 0 },
      { source: 'user', depositAmount: 4000, depositReturned: true, isCurrentTenant: true },
    ];
    const page = await renderReport();

    expect(page).not.toContain(report('en').kaucjaTitle);
    expect(page).not.toContain(report('en').faqQ3);
    expect(page).not.toContain('got the deposit back');
  });
});

// PRD 4 FR-12 (spec 08 §Callout placements): the flatmate callout under the city figure, with its
// own surface `report` so the readout tells it from the guides; no counts. T129 adds the split.
const CITY_FIGURE: SingleNumberFigure = {
  group: 'tenant',
  metric: 'completeTotal',
  value: 4321,
  n: 6,
  reportCount: 6,
  rent: { value: 3500, n: 6 },
  expenses: { value: 821, n: 6 },
  rentPerM2: null,
  completeTotalPerM2: null,
  adminFeePerM2: null,
};

describe('blog data report: the flatmate callout', () => {
  beforeEach(() => {
    state.locale = 'en';
    state.deposits = [];
    state.callouts = [];
    state.cityFigure = CITY_FIGURE;
    state.split = null;
  });

  it('renders FlatmateCallout once with surface "report" and no counts', async () => {
    await renderReport();
    expect(state.callouts).toEqual([{ surface: 'report', split: null, splitArea: undefined }]);
    expect(Object.keys(state.callouts[0] as object)).not.toContain('counts');
  });

  it('sits under the city figure and before the anatomy section', async () => {
    const page = await renderReport();
    const figure = page.indexOf('≈ 4 321 zł');
    const callout = page.indexOf('FLATMATE_CALLOUT');
    const anatomy = page.indexOf(report('en').anatomyTitle);
    expect(figure).toBeGreaterThan(-1);
    expect(callout).toBeGreaterThan(figure);
    expect(anatomy).toBeGreaterThan(callout);
  });

  it('without a city figure the callout still renders, before the anatomy section', async () => {
    state.cityFigure = null;
    const page = await renderReport();
    expect(page).not.toContain('≈ 4 321 zł');
    expect(state.callouts).toEqual([{ surface: 'report', split: null, splitArea: undefined }]);
    expect(page.indexOf(report('en').anatomyTitle)).toBeGreaterThan(
      page.indexOf('FLATMATE_CALLOUT'),
    );
  });

  it('loads no counts', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/[locale]/blog/warsaw-rent-prices/page.tsx'),
      'utf8',
    );
    expect(source).not.toContain('loadFlatmateBlockCounts');
    expect(source).toMatch(/<FlatmateCallout\s+surface="report"/);
    expect(source).not.toMatch(/counts=/);
  });
});

// PRD 4 FR-13 (spec 08 §Per-person line): the callout carries the bot's Warsaw split; the report
// renders the line only through the callout.
describe('blog data report: the per-person line', () => {
  const SPLIT = { value: 2_450, n: 5, level: 'city', name: 'city.warsaw' };

  beforeEach(() => {
    state.locale = 'en';
    state.deposits = [];
    state.callouts = [];
    state.cityFigure = CITY_FIGURE;
  });

  it('passes the split and its own area, named on the server, to the one callout', async () => {
    state.split = SPLIT;
    await renderReport();
    expect(state.callouts).toEqual([{ surface: 'report', split: SPLIT, splitArea: 'Warsaw' }]);
    state.callouts = [];
    state.locale = 'pl';
    await renderReport();
    expect(state.callouts).toEqual([{ surface: 'report', split: SPLIT, splitArea: 'Warszawa' }]);
  });

  it('null or a rejection → no split for the callout; the report still renders', async () => {
    for (const split of [null, new Error('db down')]) {
      state.split = split;
      state.callouts = [];
      const page = await renderReport();
      expect(state.callouts).toEqual([{ surface: 'report', split: null, splitArea: undefined }]);
      expect(page).toContain(report('en').anatomyTitle);
    }
  });

  it('the split joins the report loads; the page itself words no per-person line', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/[locale]/blog/warsaw-rent-prices/page.tsx'),
      'utf8',
    );
    expect(source).toMatch(/Promise\.all\(\[[\s\S]*loadWarsawPerPersonSplit\(\)[\s\S]*\]\)/);
    expect(source).not.toContain("perPerson'");
    expect(source).not.toContain('flatmateCallout.perPerson');
  });
});
