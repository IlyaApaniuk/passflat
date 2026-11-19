// The costs overview's list card and district tab render the single number of spec 03
// §Single-number surfaces (D23): one group, labelled with it and its N, a known part named as
// such, and no bar across districts that `comparableRanks` does not rank.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { RentalTypeFilter, SingleNumberFigure } from '@/lib/cost-figures';

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];
const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8')),
  ]),
) as Record<Locale, Record<string, unknown>>;

const state = vi.hoisted(() => ({ locale: 'en' as 'pl' | 'en' | 'ru' | 'uk' }));

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({
        locale: state.locale,
        messages: messages[state.locale] as never,
        namespace: namespace as never,
      }),
  };
});
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));

import { BuildingFigureSummary } from './building-figure-summary';
import { DistrictComparison, type DistrictFigureRow } from './district-comparison';

function figure(value: number, n: number, overrides: Partial<SingleNumberFigure> = {}) {
  const shown: SingleNumberFigure = {
    group: 'tenant',
    metric: 'completeTotal',
    value,
    n,
    reportCount: n,
    rent: null,
    expenses: null,
    rentPerM2: null,
    completeTotalPerM2: null,
    ...overrides,
  };
  return shown;
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const card = (shown: SingleNumberFigure) =>
  text(renderToStaticMarkup(createElement(BuildingFigureSummary, { figure: shown })));

describe('BuildingFigureSummary (list card)', () => {
  it('shows a tenant median with its N and the same group rent, expenses and per m²', () => {
    const out = card(
      figure(3850, 2, {
        reportCount: 3,
        rent: { value: 3200, n: 3 },
        expenses: { value: 750, n: 2 },
        completeTotalPerM2: { value: 77, n: 2 },
      }),
    );
    expect(out).toContain('Median Monthly Total');
    expect(out).toContain(`≈ ${(3850).toLocaleString()} PLN`);
    expect(out).toContain('Tenant reports (2)');
    expect(out).toContain(`Rent ≈ ${(3200).toLocaleString()}`);
    expect(out).toContain(`Expenses ≈ ${(750).toLocaleString()}`);
    expect(out).toContain('77 zł/m²');
  });

  it('never calls one value a median', () => {
    const out = card(figure(4000, 1));
    expect(out).toContain('Monthly total');
    expect(out).not.toMatch(/median/i);
    expect(out).toContain('Tenant reports (1)');
  });

  it('names a known part as such and shows no expenses or per-m² total beside it', () => {
    const out = card(
      figure(4000, 2, {
        group: 'asking',
        metric: 'knownPartTotal',
        rent: { value: 3400, n: 2 },
        expenses: { value: 600, n: 1 },
        completeTotalPerM2: { value: 80, n: 1 },
      }),
    );
    expect(out).toContain('Known part of the costs');
    expect(out).not.toMatch(/monthly total/i);
    expect(out).toContain('Asking prices (2)');
    expect(out).toContain(`Rent ≈ ${(3400).toLocaleString()}`);
    expect(out).not.toContain('Expenses');
    expect(out).not.toContain('zł/m²');
  });

  it('shows rent alone under a rent heading, once', () => {
    const out = card(figure(3000, 1, { metric: 'rent', rent: { value: 3000, n: 1 } }));
    expect(out.match(/Rent/g)).toHaveLength(1);
    expect(out).toContain(`≈ ${(3000).toLocaleString()} PLN`);
  });

  it('renders the label in every locale', () => {
    for (const locale of LOCALES) {
      state.locale = locale;
      const overview = (messages[locale].costs as Record<string, Record<string, string>>).overview;
      expect(card(figure(3850, 2)), locale).toContain(
        overview.figureTenant.replace('{count}', '2'),
      );
    }
    state.locale = 'en';
  });
});

const district = (slug: string, shown: SingleNumberFigure): DistrictFigureRow => ({
  slug,
  name: slug.toUpperCase(),
  figure: shown,
});
const table = (rows: DistrictFigureRow[], rentalType: RentalTypeFilter) =>
  renderToStaticMarkup(createElement(DistrictComparison, { rows, rentalType, citySlug: 'warsaw' }));
/** Rendered rows in display order, as plain text. */
const bodyRows = (html: string) =>
  (html.match(/<tbody[^>]*>([\s\S]*)<\/tbody>/)?.[1] ?? '').split('</tr>').filter(Boolean);
const tableRows = (html: string) => bodyRows(html).map(text);

// Golden example 16 as district rows.
const ROWS = [
  district('a', figure(3900, 37, { rent: { value: 3100, n: 37 } })),
  district('b', figure(3500, 6, { rent: { value: 2900, n: 6 } })),
  district('c', figure(3200, 12, { group: 'asking' })),
  district('d', figure(3000, 2)),
];

describe('DistrictComparison (district tab)', () => {
  it('labels every district with its group and N', () => {
    const rows = tableRows(table(ROWS, 'all'));
    expect(rows.find((row) => row.startsWith('A'))).toContain('Tenant reports (37)');
    expect(rows.find((row) => row.startsWith('C'))).toContain('Asking prices (12)');
    expect(rows.find((row) => row.startsWith('D'))).toContain('Tenant reports (2)');
  });

  it('draws no bar under "all" (example 16), only a display order by value', () => {
    const html = table(ROWS, 'all');
    expect(html).not.toContain('bg-muted-foreground/30');
    expect(tableRows(html).map((row) => row[0])).toEqual(['D', 'C', 'B', 'A']);
  });

  it('draws bars only for the comparable rank under one rental type: A and B', () => {
    const html = table(ROWS, 'apartment');
    const rows = tableRows(html);
    const withBar = bodyRows(html)
      .filter((row) => row.includes('bg-muted-foreground/30'))
      .map((row) => text(row)[0]);
    expect(withBar.sort()).toEqual(['A', 'B']);
    expect(rows).toHaveLength(4);
  });

  it('shows a known part in the total column with its label and a rent-only row without a total', () => {
    const rows = tableRows(
      table(
        [
          district('k', figure(4000, 2, { group: 'asking', metric: 'knownPartTotal' })),
          district('r', figure(3000, 1, { metric: 'rent', rent: { value: 3000, n: 1 } })),
        ],
        'all',
      ),
    );
    expect(rows.find((row) => row.startsWith('K'))).toContain('Asking prices (2), known part');
    expect(rows.find((row) => row.startsWith('K'))).toContain(`≈ ${(4000).toLocaleString()} PLN`);
    const rent = rows.find((row) => row.startsWith('R'))!;
    expect(rent).toContain('Tenant reports (1), rent only');
    expect(rent).not.toContain('PLN');
    expect(rent).toContain(`≈ ${(3000).toLocaleString()}`);
  });

  it('shows the empty state without rows', () => {
    expect(text(table([], 'room'))).toContain('No district data yet');
  });
});
