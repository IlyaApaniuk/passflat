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

type District = { slug: string; nameKey: string; cityId: string };
const MOKOTOW: District = { slug: 'mokotow', nameKey: 'Mokotów', cityId: 'c-warsaw' };

// Mokotów's single number (D23): the tenant group's all-in total with its N, and that
// group's rent, expenses and per m².
const TENANT: SingleNumberFigure = {
  group: 'tenant',
  metric: 'completeTotal',
  value: 4000,
  n: 12,
  reportCount: 12,
  rent: { value: 3200, n: 12 },
  expenses: { value: 800, n: 12 },
  rentPerM2: { value: 64, n: 12 },
  completeTotalPerM2: { value: 80, n: 12 },
  adminFeePerM2: null,
};
const ASKING_PART: SingleNumberFigure = {
  ...TENANT,
  group: 'asking',
  metric: 'knownPartTotal',
  value: 4100,
  n: 5,
  reportCount: 5,
  rent: { value: 3600, n: 5 },
  expenses: null,
  completeTotalPerM2: null,
};

const state = vi.hoisted(() => ({
  locale: 'en' as 'pl' | 'en' | 'ru' | 'uk',
  district: null as { slug: string; nameKey: string; cityId: string } | null,
  figure: null as unknown,
  loadedCities: [] as string[],
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
  };
});
vi.mock('@/lib/prisma', () => ({
  prisma: { district: { findFirst: vi.fn(async () => state.district) } },
}));
vi.mock('@/lib/cost-figures-query', () => ({
  loadDistrictFigures: vi.fn(async (cityId: string) => {
    state.loadedCities.push(cityId);
    return [
      {
        slug: 'mokotow',
        name: 'Mokotów',
        figures: { all: state.figure, apartment: null, room: null },
      },
      { slug: 'wola', name: 'Wola', figures: { all: null, apartment: null, room: null } },
    ];
  }),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));

import CostShareLandingPage, { generateMetadata } from './page';

const params = Promise.resolve({ locale: 'en', city: 'warsaw' });
// Links shared before T025 still carry the sharer's gap and amount.
// Their numbers are unlike any figure in `stats`, so a leak is unambiguous.
const BELOW = { d: 'mokotow', pct: '-37', amt: '3517' };
const ABOVE = { d: 'mokotow', pct: '23', amt: '5193' };

const share = (locale: Locale) => messages[locale].share as Record<string, string>;
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

async function renderPage(searchParams: Record<string, string>) {
  const page = (await CostShareLandingPage({
    params,
    searchParams: Promise.resolve(searchParams),
  })) as ReactElement;
  return text(renderToStaticMarkup(page));
}

async function metadata(searchParams: Record<string, string>) {
  const meta = await generateMetadata({ params, searchParams: Promise.resolve(searchParams) });
  const images = meta.openGraph?.images as Array<{ url: string }>;
  return { title: meta.title as string, image: new URL(images[0].url) };
}

describe('share landing', () => {
  beforeEach(() => {
    state.locale = 'en';
    state.district = MOKOTOW;
    state.figure = TENANT;
    state.loadedCities = [];
  });

  it('an old brag link gets the neutral body, never the gap or the amount', async () => {
    for (const searchParams of [BELOW, ABOVE]) {
      const page = await renderPage(searchParams);
      expect(page).toContain(share('en').landingBody);
      for (const leaked of ['37', '23', '3,517', '3517', '5,193', '5193', '%']) {
        expect(page).not.toContain(leaked);
      }
      expect(page).not.toMatch(/below|above|market|average/i);
    }
  });

  it('shows the district figure (D23) with its group and N, and that group only', async () => {
    const page = await renderPage({ d: 'mokotow' });
    expect(page).toContain(
      'Costs in Mokotów Median Monthly Total ≈ 4,000 zł Rent ≈ 3,200 Expenses ≈ 800 ≈ 80 zł/m² Tenant reports (12)',
    );
    expect(state.loadedCities).toEqual(['c-warsaw']);
    // The blended card said "median of all reports" and counted every source.
    expect(page).not.toMatch(/all reports|\d+ reports/);
  });

  it('an asking-price known part is labelled and shows no expenses or per m²', async () => {
    state.figure = ASKING_PART;
    const page = await renderPage({ d: 'mokotow' });
    expect(page).toContain(
      'Costs in Mokotów Known part of the costs ≈ 4,100 zł Rent ≈ 3,600 Asking prices (5), known part',
    );
    expect(page).not.toMatch(/Expenses|zł\/m²|Tenant reports/);

    const { image } = await metadata({ d: 'mokotow' });
    expect(image.searchParams.get('statLabel')).toBe('Known part of the costs');
    expect(image.searchParams.get('figureLabel')).toBe('Asking prices (5), known part');
    expect(image.searchParams.get('split')).toBe('Rent ≈ 3,600');
  });

  it('a district without a usable figure shows no card and a generic preview', async () => {
    state.district = { ...MOKOTOW, slug: 'wola', nameKey: 'Wola' };
    const page = await renderPage({ d: 'wola' });
    expect(page).not.toContain('Costs in Wola');
    expect(page).not.toContain('zł');
    const { title, image } = await metadata({ d: 'wola' });
    expect(title).toBe('Reported rental costs in Wola');
    expect(image.searchParams.get('stat')).toBeNull();
    expect(image.searchParams.get('figureLabel')).toBeNull();
  });

  it('an old brag link previews the neutral district card', async () => {
    for (const searchParams of [BELOW, ABOVE, { d: 'mokotow' }]) {
      const { title, image } = await metadata(searchParams);
      expect(title).toBe('Reported rental costs in Mokotów');
      expect(image.pathname).toBe('/api/og');
      expect(Object.fromEntries(image.searchParams)).toEqual({
        title: 'Mokotów',
        subtitle: share('en').cardDescription,
        stat: '≈ 4,000 zł',
        statLabel: 'Median Monthly Total',
        figureLabel: 'Tenant reports (12)',
        split: 'Rent ≈ 3,200 · Expenses ≈ 800',
      });
      for (const value of image.searchParams.values()) {
        expect(value).not.toMatch(/37|23|%/);
      }
    }
  });

  it('without a district the preview and the page stay generic', async () => {
    state.district = null;
    const { title } = await metadata(BELOW);
    expect(title).toBe(share('en').cardTitleGeneric);
    const page = await renderPage(BELOW);
    expect(page).toContain(share('en').landingBody);
    expect(page).not.toContain('Mokotów');
  });

  it('renders every locale without a percentage or a raw key', async () => {
    for (const locale of LOCALES) {
      state.locale = locale;
      const page = await renderPage(BELOW);
      const { title, image } = await metadata(BELOW);
      expect(page, locale).not.toContain('%');
      expect(page, locale).not.toMatch(/share\.|costs\.overview/);
      expect(page, locale).toContain('Mokotów');
      expect(title, locale).toBe(share(locale).cardTitleArea.replace('{district}', 'Mokotów'));
      for (const value of image.searchParams.values()) {
        expect(value, locale).not.toContain('%');
      }
    }
  });

  it('the description, the steps and the range render and make no overpay promise', async () => {
    for (const locale of LOCALES) {
      state.locale = locale;
      const page = await renderPage({ d: 'mokotow' });
      const meta = await generateMetadata({
        params,
        searchParams: Promise.resolve({ d: 'mokotow' }),
      });
      expect(meta.description, locale).toBe(share(locale).cardDescription);
      expect(meta.openGraph?.description, locale).toBe(share(locale).cardDescription);
      for (const key of ['landingStep1', 'landingStep2', 'landingStep3'] as const) {
        expect(page, `${locale} ${key}`).toContain(share(locale)[key]);
      }
    }
    state.locale = 'en';
    const { image } = await metadata({ d: 'mokotow' });
    expect(image.searchParams.get('subtitle')).toBe(
      'Monthly rent and expenses by district, from reports on Passflat',
    );
    // The single number carries no p25–p75 range (the blended card's "half of the reports").
    const page = await renderPage({ d: 'mokotow' });
    expect(page).not.toContain('Half of the reports');
  });

  it('share copy asks no overpay question and promises no median comparison (FR-29)', () => {
    // The post-submit screen sets the own report beside one labelled area with
    // no verdict, and p25–p75 holds half of the reports, not "most".
    const OVERPAY =
      /overpa|cheaper|pricier|whether|przepłac|taniej|drożej|czy nie|переплач|дешевл|дешевш|дорож/i;
    const MEDIAN = /median|медиан|медіан/i;
    const MOST = /most pay|najczęściej|обычно|зазвичай/i;
    for (const locale of LOCALES) {
      const s = share(locale);
      expect(s.cardDescription, locale).not.toMatch(OVERPAY);
      for (const key of ['landingStep2', 'landingStep3'] as const) {
        expect(s[key], `${locale} ${key}`).not.toMatch(OVERPAY);
        expect(s[key], `${locale} ${key}`).not.toMatch(MEDIAN);
      }
      expect(s.landingRange, locale).not.toMatch(MOST);
      expect(s.landingRange, locale).toContain('{from}');
      expect(s.landingRange, locale).toContain('{to}');
    }
  });

  it('the brag keys are gone and no share text takes a percentage', () => {
    const removed = [
      'cardTitle',
      'landingBodyBelow',
      'landingBodyAbove',
      'ogTitle',
      'ogStatLabel',
      'ogStat',
      'ogMedian',
    ];
    for (const locale of LOCALES) {
      for (const key of removed) {
        expect(share(locale), `${locale} share.${key}`).not.toHaveProperty(key);
      }
      for (const [key, value] of Object.entries(share(locale))) {
        expect(value, `${locale} share.${key}`).not.toContain('{percent}');
        expect(value, `${locale} share.${key}`).not.toContain('{amount} zł —');
      }
    }
  });
});
