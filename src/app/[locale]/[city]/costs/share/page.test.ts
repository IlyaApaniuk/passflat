import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AreaStats } from '@/lib/cost-baselines';

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

const state = vi.hoisted(() => ({
  locale: 'en' as 'pl' | 'en' | 'ru' | 'uk',
  district: { id: 'd-mokotow', nameKey: 'Mokotów' } as { id: string; nameKey: string } | null,
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
const stats: AreaStats = {
  total: { median: 4000, p25: 3600, p75: 4400 },
  rentPerM2: { median: 64, p25: 60, p75: 70 },
  totalPerM2: { median: 80, p25: 72, p75: 88 },
  rentMedian: 3200,
  expensesMedian: 800,
  count: 12,
};
vi.mock('@/lib/cost-baselines', () => ({ getDistrictCostStats: vi.fn(async () => stats) }));
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
    state.district = { id: 'd-mokotow', nameKey: 'Mokotów' };
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

  it('shows the area figure labelled with its N', async () => {
    const page = await renderPage({ d: 'mokotow' });
    expect(page).toContain('Monthly total in Mokotów, median of all reports');
    expect(page).toContain('≈4,000 zł');
    expect(page).toContain('Rent ≈3,200');
    expect(page).toContain('Expenses ≈800');
    expect(page).toContain('≈80 zł/m²');
    expect(page).toContain('12 reports');
  });

  it('an old brag link previews the neutral area card', async () => {
    for (const searchParams of [BELOW, ABOVE, { d: 'mokotow' }]) {
      const { title, image } = await metadata(searchParams);
      expect(title).toBe('What people really pay for rent in Mokotów');
      expect(image.pathname).toBe('/api/og');
      expect(image.searchParams.get('title')).toBe(share('en').ogTitleNeutral);
      expect(image.searchParams.get('statLabel')).toBe('Mokotów median');
      expect(image.searchParams.get('stat')).toBe('≈4,000 zł');
      expect(image.searchParams.get('split')).toBe('≈80 zł/m²');
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
