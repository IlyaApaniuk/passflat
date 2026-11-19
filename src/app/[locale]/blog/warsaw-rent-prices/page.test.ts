import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  loadCityFigure: vi.fn(async () => null),
  loadDistrictFigures: vi.fn(async () => []),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));
vi.mock('@/components/landing/footer', () => ({ Footer: () => null }));

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
