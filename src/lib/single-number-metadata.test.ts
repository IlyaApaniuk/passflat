// The metadata and OG parameter builders of the single-number surfaces (spec 03 §Single-number
// surfaces, D23, T053): one group's figure, what it is, its group label and N, and that group's
// rent and expenses only, in all four locales.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import type { SingleNumberFigure } from './cost-figures';
import { getCostOgImage } from './seo';
import { buildingMetaDescription, figureOgCard } from './single-number-metadata';

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];
type Translate = (key: string, values?: Record<string, string | number>) => string;

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8')),
  ]),
) as Record<Locale, Record<string, unknown>>;
const translator = (locale: Locale) =>
  createTranslator({ locale, messages: messages[locale] as never }) as unknown as Translate;
const t = translator('en');
const format = (locale: Locale) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format;

function figure(overrides: Partial<SingleNumberFigure> = {}): SingleNumberFigure {
  return {
    group: 'tenant',
    metric: 'completeTotal',
    value: 3700,
    n: 3,
    reportCount: 3,
    rent: { value: 3000, n: 3 },
    expenses: { value: 700, n: 3 },
    rentPerM2: { value: 60, n: 3 },
    completeTotalPerM2: { value: 74, n: 3 },
    adminFeePerM2: null,
    ...overrides,
  };
}
const TENANT = figure();
const ASKING_PART = figure({
  group: 'asking',
  metric: 'knownPartTotal',
  value: 4000,
  n: 5,
  reportCount: 5,
  rent: { value: 3500, n: 5 },
  expenses: null,
  completeTotalPerM2: null,
});
const RENT_ONLY = figure({
  metric: 'rent',
  value: 2800,
  n: 2,
  reportCount: 2,
  rent: { value: 2800, n: 2 },
  expenses: null,
  completeTotalPerM2: null,
});
const ONE = figure({ value: 3100, n: 1, reportCount: 1, rent: { value: 2500, n: 1 } });
const RAW_KEY = /\b(costs|costsSeo|share|rentReport)\.[a-zA-Z]/;

describe('figureOgCard', () => {
  it('a tenant all-in total: heading, value, group with N, and the same group rent and expenses', () => {
    expect(figureOgCard(t, TENANT, { title: 'Mokotów', subtitle: 'Warsaw' })).toEqual({
      title: 'Mokotów',
      subtitle: 'Warsaw',
      stat: '≈ 3,700 zł',
      statLabel: 'Median Monthly Total',
      figureLabel: 'Tenant reports (3)',
      split: 'Rent ≈ 3,000 · Expenses ≈ 700',
    });
  });

  it('an asking known part is named as such, never as the monthly total, and shows no expenses', () => {
    const card = figureOgCard(t, ASKING_PART, { title: 'Wola' });
    expect(card).toEqual({
      title: 'Wola',
      stat: '≈ 4,000 zł',
      statLabel: 'Known part of the costs',
      figureLabel: 'Asking prices (5), known part',
      split: 'Rent ≈ 3,500',
    });
    expect(Object.values(card).join(' ')).not.toMatch(/monthly total|tenant/i);
  });

  it('rent only is the rent, with no split', () => {
    const card = figureOgCard(t, RENT_ONLY, { title: 'Ochota' });
    expect(card.statLabel).toBe('Rent');
    expect(card.figureLabel).toBe('Tenant reports (2), rent only');
    expect(card).not.toHaveProperty('split');
    expect(card).not.toHaveProperty('subtitle');
  });

  it('one value is not called a median', () => {
    const card = figureOgCard(t, ONE, { title: 'ul. Puławska 1' });
    expect(card.statLabel).toBe('Monthly total');
    expect(card.figureLabel).toBe('Tenant reports (1)');
  });

  it('renders every case in every locale with the label and N and no raw key', () => {
    for (const locale of LOCALES) {
      const tr = translator(locale);
      for (const shown of [TENANT, ASKING_PART, RENT_ONLY, ONE]) {
        const card = figureOgCard(tr, shown, { title: 'X' });
        const all = Object.values(card).join(' | ');
        expect(all, locale).not.toMatch(RAW_KEY);
        expect(all, locale).not.toContain('{');
        expect(card.figureLabel, locale).toContain(`(${shown.n})`);
        expect(card.statLabel.length, locale).toBeGreaterThan(0);
      }
      expect(figureOgCard(tr, ASKING_PART, { title: 'X' }).figureLabel, locale).toBe(
        `${tr('costs.overview.figureAsking', { count: 5 })}, ${tr('costs.overview.figureKnownPart')}`,
      );
    }
  });

  it('getCostOgImage carries the label to /api/og with the other strings', () => {
    const url = new URL(
      getCostOgImage(figureOgCard(t, ASKING_PART, { title: 'Wola', subtitle: 'Warsaw' })).url,
    );
    expect(url.pathname).toBe('/api/og');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      title: 'Wola',
      subtitle: 'Warsaw',
      stat: '≈ 4,000 zł',
      statLabel: 'Known part of the costs',
      figureLabel: 'Asking prices (5), known part',
      split: 'Rent ≈ 3,500',
    });
  });
});

describe('buildingMetaDescription', () => {
  const base = { address: 'ul. Puławska 1', city: 'Warsaw', format: format('en') };

  it('an all-in total with rent and expenses, labelled with its group and N', () => {
    expect(buildingMetaDescription(t, { ...base, figure: TENANT })).toBe(
      'Reported costs of renting at ul. Puławska 1, Warsaw: ≈ 3,700 zł/mo in total (rent ≈ 3,000, utilities ≈ 700). Tenant reports (3).',
    );
  });

  it('a known part is not a monthly total', () => {
    const text = buildingMetaDescription(t, { ...base, figure: ASKING_PART });
    expect(text).toBe(
      'Reported costs of renting at ul. Puławska 1, Warsaw: the known part of the costs is ≈ 4,000 zł/mo. Asking prices (5).',
    );
    expect(text).not.toContain('in total');
  });

  it('rent only says the other costs are not known', () => {
    expect(buildingMetaDescription(t, { ...base, figure: RENT_ONLY })).toBe(
      'Reported costs of renting at ul. Puławska 1, Warsaw: rent ≈ 2,800 zł/mo, other costs unknown. Tenant reports (2).',
    );
  });

  it('an all-in total without rent gives the total alone', () => {
    expect(
      buildingMetaDescription(t, { ...base, figure: figure({ rent: null, expenses: null }) }),
    ).toBe(
      'Reported costs of renting at ul. Puławska 1, Warsaw: ≈ 3,700 zł/mo in total. Tenant reports (3).',
    );
  });

  it('without a figure it carries no number and names the area reference (table B)', () => {
    expect(buildingMetaDescription(t, { ...base, address: 'ul. Długa', figure: null })).toBe(
      'ul. Długa, Warsaw: no report for this building yet — we show the district or Warsaw reference with its group and N. Add your own costs.',
    );
    for (const locale of LOCALES) {
      const text = buildingMetaDescription(translator(locale), {
        ...base,
        address: 'ul. Długa',
        format: format(locale),
        figure: null,
      });
      expect(text, locale).toMatch(/^ul\. Długa, Warsaw: /);
      expect(text, locale).not.toMatch(/\d|\{/);
      expect(text, locale).not.toMatch(RAW_KEY);
    }
  });

  it('renders every case in every locale with the value and the group label', () => {
    for (const locale of LOCALES) {
      const tr = translator(locale);
      const fmt = format(locale);
      for (const shown of [TENANT, ASKING_PART, RENT_ONLY, figure({ rent: null })]) {
        const text = buildingMetaDescription(tr, { ...base, format: fmt, figure: shown });
        const group =
          shown.group === 'tenant' ? 'costs.overview.figureTenant' : 'costs.overview.figureAsking';
        expect(text, locale).toContain(fmt(shown.value));
        expect(text, locale).toContain(tr(group, { count: shown.n }));
        expect(text, locale).not.toMatch(RAW_KEY);
        expect(text, locale).not.toContain('{');
        expect(text, locale).not.toContain('..');
      }
    }
  });
});
