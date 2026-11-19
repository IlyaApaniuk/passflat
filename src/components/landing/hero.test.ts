import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { depositClaim } from '@/lib/deposit-claim';

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
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));

import { Hero } from './hero';

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

const baseStats = { buildingsWithCosts: 0, cityFigure: null };

const render = (deposit: ReturnType<typeof depositClaim>) =>
  text(renderToStaticMarkup(createElement(Hero, { stats: { ...baseStats, deposit } })));

type CityFigure = NonNullable<Parameters<typeof Hero>[0]['stats']>['cityFigure'];
const renderCity = (cityFigure: CityFigure) =>
  text(
    renderToStaticMarkup(
      createElement(Hero, { stats: { buildingsWithCosts: 0, cityFigure, deposit: null } }),
    ),
  );

describe('Hero city tiles (D23)', () => {
  beforeEach(() => {
    state.locale = 'en';
  });

  it('shows per m² and expenses from the city group, each with that group and its own N', () => {
    const page = renderCity({
      group: 'tenant',
      completeTotalPerM2: { value: 87.6, n: 41 },
      expenses: { value: 742, n: 38 },
    });
    expect(page).toContain('≈88 zł/m² Warsaw median Tenant reports (41)');
    expect(page).toContain('≈742 zł/mo costs on top of rent Tenant reports (38)');
  });

  it('names the asking prices when the city falls back to them, in every locale', () => {
    for (const locale of LOCALES) {
      state.locale = locale;
      const page = renderCity({
        group: 'asking',
        completeTotalPerM2: { value: 90, n: 12 },
        expenses: null,
      });
      const figureAsking = (messages[locale].costs as { overview: Record<string, string> }).overview
        .figureAsking;
      expect(page, locale).toContain(figureAsking.replace('{count}', '12'));
      expect(page, locale).not.toContain(
        (messages[locale].landing as { hero: Record<string, string> }).hero.statsExpenses,
      );
    }
  });

  it('shows no cost tile without an all-in city figure', () => {
    const page = renderCity({ group: 'tenant', completeTotalPerM2: null, expenses: null });
    expect(page).not.toMatch(/zł|Tenant reports/);
  });
});

describe('Hero deposit stat', () => {
  beforeEach(() => {
    state.locale = 'en';
  });

  it('shows "X of N who answered got it back, fully or partly" from summarizeDepositReturns', () => {
    const deposit = depositClaim([
      { source: 'user', depositAmount: 4000, depositReturned: true, depositReturnedAmount: 4000 },
      { source: 'user', depositAmount: 4000, depositReturned: true, depositReturnedAmount: 1500 },
      { source: 'import', depositAmount: 4000, depositReturned: false, depositReturnedAmount: 0 },
      // A current tenant is not an answer.
      { source: 'user', depositAmount: 4000, depositReturned: true, isCurrentTenant: true },
    ]);
    const page = render(deposit);

    expect(page).toContain('≈4000 zł');
    expect(page).toContain('deposit · 2 of 3 who answered got it back, fully or partly');
    expect(page).not.toMatch(/%|in full|returned/);
  });

  it('renders the claim in every locale with both counts', () => {
    for (const locale of LOCALES) {
      state.locale = locale;
      const page = render({ medianDeposit: 3500, gotBack: 7, answered: 9 });
      expect(page, locale).toContain('≈3500 zł');
      expect(page, locale).toMatch(/7\D+9/);
      expect(page, locale).not.toContain('%');
    }
  });

  it('shows no deposit stat below the gate', () => {
    const deposit = depositClaim([
      { source: 'user', depositAmount: 4000, depositReturned: true, depositReturnedAmount: 4000 },
      { source: 'user', depositAmount: 4000, depositReturned: false, depositReturnedAmount: 0 },
    ]);
    expect(deposit).toBeNull();

    const page = render(deposit);
    expect(page).not.toContain('zł');
    expect(page).not.toContain('deposit ·');
  });
});
