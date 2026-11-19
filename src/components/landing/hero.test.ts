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

const baseStats = { buildingsWithCosts: 0, pricePerM2: null, expensesMonthly: null };

const render = (deposit: ReturnType<typeof depositClaim>) =>
  text(renderToStaticMarkup(createElement(Hero, { stats: { ...baseStats, deposit } })));

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
