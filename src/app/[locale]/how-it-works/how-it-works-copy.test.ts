import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { pickMessages } from '@/i18n/messages';

// PRD 4 FR-16 (spec 08 §How it works, Help and About; D80): /how-it-works drops the
// "passing on a lease" (listers) tab and its keys; the seekers and costs tabs stay. No
// value under howItWorksPage names a price.

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];
type Dictionary = Record<string, Record<string, unknown>>;

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as Dictionary,
  ]),
) as Record<Locale, Dictionary>;

/** The namespaces of the page's scoped provider (`how-it-works/page.tsx`). */
const PROVIDER_NAMESPACES = ['howItWorksPage', 'documents', 'common'];

const state = vi.hoisted(() => ({ locale: 'en' as 'pl' | 'en' | 'ru' | 'uk' }));

// The real ICU translator over the provider's messages only; a missing key throws
// instead of rendering its path.
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({
        locale: state.locale,
        messages: pickMessages(messages[state.locale], PROVIDER_NAMESPACES) as never,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      }),
  };
});

vi.mock('posthog-js/react', () => ({ useFeatureFlagEnabled: () => false }));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));

import { HowItWorksClient } from './client';

const decode = (html: string) =>
  html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

const text = (html: string) =>
  decode(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const page = (locale: Locale) => messages[locale].howItWorksPage as Record<string, unknown>;

const render = (locale: Locale) => {
  state.locale = locale;
  return renderToStaticMarkup(createElement(HowItWorksClient, {}));
};

/** "PLN", or "zł" as a word ("Znalazłam" holds the letters, not a price); as in honesty-copy. */
const PRICE = /PLN|(^|[^a-ząćęłńóśźż])zł(?![a-ząćęłńóśźż])/i;

/** Every string leaf under a node, with its path. */
function leaves(value: unknown, prefix: string): Array<[string, string]> {
  if (value === null || typeof value !== 'object') return [[prefix, String(value)]];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, `${prefix}.${key}`));
}

describe('/how-it-works (PRD 4 FR-16, D80)', () => {
  it.each(LOCALES)('%s: two tabs, seekers first and selected, then costs', (locale) => {
    const html = render(locale);
    const tabs = [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map(
      ([, attributes, label]) => ({
        label: decode(label),
        pressed: /aria-pressed="true"/.test(attributes),
      }),
    );
    expect(tabs).toEqual([
      { label: page(locale).tabSeekers, pressed: true },
      { label: page(locale).tabCosts, pressed: false },
    ]);
  });

  it.each(LOCALES)('%s: the listers tab and its keys are gone', (locale) => {
    expect(page(locale).listers, `${locale}: howItWorksPage.listers`).toBeUndefined();
    expect(page(locale).tabListers, `${locale}: howItWorksPage.tabListers`).toBeUndefined();
    // The seekers and costs blocks stay.
    expect(typeof (page(locale).seekers as Record<string, string>).title).toBe('string');
    expect(typeof (page(locale).costs as Record<string, string>).title).toBe('string');
  });

  it.each(LOCALES)('%s: the tabbed steps link to no listing form', (locale) => {
    const html = render(locale);
    const tabbed = html.split('<section').find((chunk) => chunk.includes('aria-pressed'));
    expect(tabbed).toBeDefined();
    expect(tabbed).not.toContain('/create-listing');
  });

  it.each(LOCALES)(
    '%s: no value under howItWorksPage and no rendered text names a price',
    (locale) => {
      for (const [path, value] of leaves(page(locale), 'howItWorksPage')) {
        expect(value, `${locale}: ${path}`).not.toMatch(PRICE);
      }
      expect(text(render(locale))).not.toMatch(PRICE);
      expect(text(render(locale))).not.toContain('€');
    },
  );
});
