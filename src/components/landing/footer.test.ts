import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// PRD 4 FR-5, spec 08 §Header and footer entries: the product column gains
// "Costs by district" (the hub) and "Building reviews" (moved from the header).
// FR-7, spec 08 §Footer product column (D82): it drops the three frozen listings
// links (lease takeovers, sublets, posting a listing) and their keys.

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];
type Messages = Record<string, Record<string, unknown>>;

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as Messages,
  ]),
) as Record<Locale, Messages>;

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
        onError: (error) => {
          throw error;
        },
      }),
  };
});
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));

import { Footer } from './footer';

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** The footer's link columns by their `h4` title, each as `[href, label]` pairs. */
function columns(html: string): Map<string, [string, string][]> {
  return new Map(
    [...html.matchAll(/<h4[^>]*>([^<]*)<\/h4>\s*<ul[^>]*>([\s\S]*?)<\/ul>/g)].map(
      ([, title, body]) => [
        text(title),
        [...body.matchAll(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(
          ([, href, label]) => [href, text(label)] as [string, string],
        ),
      ],
    ),
  );
}

function productColumn(locale: Locale) {
  state.locale = locale;
  const footer = messages[locale].landing.footer as Record<string, string>;
  return columns(renderToStaticMarkup(createElement(Footer))).get(footer.product);
}

describe('Footer product column (PRD 4 FR-5, FR-7)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('lists roommate search, the costs, the hub and building reviews in English', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_DOCUMENT_TEMPLATES', 'false');
    expect(productColumn('en')).toEqual([
      ['/warsaw/roommate', 'Roommate Search'],
      ['/warsaw/costs', 'Cost Reports'],
      ['/warsaw', 'Costs by district'],
      ['/warsaw/review', 'Building reviews'],
    ]);
  });

  it('labels the two new links from landing.footer.costsByDistrict and common.buildingReviews, in every locale', () => {
    for (const locale of LOCALES) {
      const links = new Map(productColumn(locale));
      const footer = messages[locale].landing.footer as Record<string, string>;
      expect(links.get('/warsaw'), locale).toBe(footer.costsByDistrict);
      expect(links.get('/warsaw/review'), locale).toBe(messages[locale].common.buildingReviews);
    }
  });

  it('links to no frozen listings page in any locale, with or without the templates flag (FR-7)', () => {
    for (const flag of ['false', 'true']) {
      vi.stubEnv('NEXT_PUBLIC_FEATURE_DOCUMENT_TEMPLATES', flag);
      for (const locale of LOCALES) {
        state.locale = locale;
        const hrefs = [...renderToStaticMarkup(createElement(Footer)).matchAll(/href="([^"]*)"/g)]
          .map(([, href]) => href)
          .filter((href) => /\/(replacement|sublet|create-listing)\b/.test(href));
        expect(hrefs, `${locale}, templates ${flag}`).toEqual([]);
      }
    }
  });

  it('the three frozen link keys are gone from landing.footer in every locale', () => {
    for (const locale of LOCALES) {
      const footer = messages[locale].landing.footer as Record<string, string>;
      for (const key of ['browseListings', 'temporarySublets', 'addListing']) {
        expect(footer[key], `${locale}: landing.footer.${key}`).toBeUndefined();
      }
    }
  });

  it('keeps the document templates link behind its flag', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_DOCUMENT_TEMPLATES', 'true');
    expect(productColumn('en')?.at(-1)).toEqual(['/resources', 'Document Templates']);
  });
});

describe('Footer stays isomorphic', () => {
  it("keeps the non-async useTranslations() hook and no 'use client'", () => {
    const source = readFileSync(join(process.cwd(), 'src/components/landing/footer.tsx'), 'utf8');
    // A directive is a statement on its own line (the file's comment names it).
    expect(source).not.toMatch(/^\s*['"]use client['"];?\s*$/m);
    expect(source).not.toContain('getTranslations');
    expect(source).toContain("import { useTranslations } from 'next-intl';");
    expect(source).toContain('const t = useTranslations();');
  });
});
