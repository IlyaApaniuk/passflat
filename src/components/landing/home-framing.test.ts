import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// PRD 4 FR-6 (spec 08 §Home framing surfaces): the ForWhom cards, the 404, the
// dashboard's saved-listings button and the home district cards lead to the
// roommate page, the checker, the costs or the district pages.

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

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  return {
    // A missing key throws instead of rendering its path.
    getTranslations: async (namespace?: string) =>
      createTranslator({
        locale: state.locale,
        messages: messages[state.locale] as never,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      }),
  };
});
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    className,
    children,
  }: {
    href: string;
    className?: string;
    children: ReactNode;
  }) => createElement('a', { href, className }, children),
}));
vi.mock('@/components/landing/footer', () => ({ Footer: () => null }));

import LocaleNotFound, { generateMetadata as notFoundMetadata } from '@/app/[locale]/not-found';
import { Districts } from './districts';
import { ForWhom } from './for-whom';

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

type Anchor = { href: string; className: string; label: string };

const anchors = (html: string): Anchor[] =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, inner]) => ({
    href: /href="([^"]*)"/.exec(attrs)?.[1] ?? '',
    className: /class="([^"]*)"/.exec(attrs)?.[1] ?? '',
    label: text(inner),
  }));

const renderServer = async (element: Promise<ReactElement>) => renderToStaticMarkup(await element);

const at = (locale: Locale, path: string) =>
  path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], messages[locale]) as
    | string
    | undefined;

const FROZEN_ROUTE = /\/(replacement|sublet|create-listing)\b/;

beforeEach(() => {
  state.locale = 'en';
});

describe('ForWhom (PRD 4 FR-6)', () => {
  it('shows the three thesis segments in order, with their targets (EN)', async () => {
    const html = await renderServer(ForWhom());
    expect(anchors(html).map(({ href, label }) => [href, label])).toEqual([
      ['/warsaw/roommate', 'Find someone to rent with'],
      ['/warsaw/roommate', 'See room costs'],
      ['/warsaw/check', 'Check an address'],
    ]);
    const page = text(html);
    const order = [
      'Renting a whole flat with someone',
      'Create a short profile in the Passflat Telegram bot',
      'Looking for a room',
      'What a room costs in Warsaw from tenant reports and asking prices',
      'Checking a flat you found',
      'Known costs for the building, the location and the nuisances, in one answer.',
      'Free, no account.',
    ].map((part) => page.indexOf(part));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(page).toContain(
      'Someone to rent with, a room, or a flat you already found — start with the figures.',
    );
  });

  it.each(LOCALES)('renders every card key, the subtitle and the note in %s', async (locale) => {
    state.locale = locale;
    const html = await renderServer(ForWhom());
    const page = text(html);
    const cards = ['rentTogether', 'findRoom', 'checkFlat'];
    expect(anchors(html).map(({ href }) => href)).toEqual([
      '/warsaw/roommate',
      '/warsaw/roommate',
      '/warsaw/check',
    ]);
    expect(anchors(html).map(({ label }) => label)).toEqual(
      cards.map((card) => at(locale, `landing.forWhom.${card}.cta`)),
    );
    for (const card of cards) {
      for (const field of ['title', 'description']) {
        expect(page, `${locale} ${card}.${field}`).toContain(
          at(locale, `landing.forWhom.${card}.${field}`),
        );
      }
    }
    expect(page).toContain(at(locale, 'landing.cta.subtitle'));
    expect(page).toContain(at(locale, 'landing.cta.freeNote'));
    expect(html).not.toMatch(FROZEN_ROUTE);
  });

  it('the old persona keys are gone in four locales', () => {
    for (const locale of LOCALES) {
      const forWhom = (messages[locale].landing as Record<string, Record<string, unknown>>).forWhom;
      expect(Object.keys(forWhom), locale).toEqual([
        'title',
        'titleHighlight',
        'rentTogether',
        'findRoom',
        'checkFlat',
      ]);
    }
  });

  it('the note says free, no account, with the spec 08 values (Q-12, D89)', () => {
    expect(LOCALES.map((locale) => at(locale, 'landing.cta.freeNote'))).toEqual([
      'Bezpłatnie, bez konta.',
      'Free, no account.',
      'Бесплатно, без аккаунта.',
      'Безкоштовно, без акаунта.',
    ]);
  });
});

describe('404 (PRD 4 FR-6)', () => {
  it('leads home, to the checker and (ghost) to the roommate page (EN)', async () => {
    const links = anchors(await renderServer(LocaleNotFound()));
    expect(links.map(({ href, label }) => [href, label])).toEqual([
      ['/', 'Back to home'],
      ['/warsaw/check', 'Check an address'],
      ['/warsaw/roommate', 'Find a flatmate'],
    ]);
    // The second button stays outline, the third is the ghost variant.
    expect(links[1].className).toContain('border bg-background');
    expect(links[2].className).not.toContain('border bg-background');
    expect(links[2].className).toContain('hover:bg-accent');
  });

  it.each(LOCALES)('labels the buttons from their keys in %s', async (locale) => {
    state.locale = locale;
    const links = anchors(await renderServer(LocaleNotFound()));
    expect(links.map(({ label }) => label)).toEqual([
      at(locale, 'errors.notFound.home'),
      at(locale, 'errors.notFound.browse'),
      at(locale, 'common.findFlatmate'),
    ]);
    expect(at(locale, 'errors.notFound.browse')).toBe(at(locale, 'common.checkAddress'));
  });

  it('stays out of the index', async () => {
    const metadata = await notFoundMetadata();
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

describe('home district cards (PRD 4 FR-6)', () => {
  it('link to the district pages, keeping the Praga slug overrides', async () => {
    const hrefs = anchors(await renderServer(Districts({}))).map(({ href }) => href);
    expect(hrefs).toEqual([
      '/warsaw/srodmiescie',
      '/warsaw/mokotow',
      '/warsaw/wola',
      '/warsaw/praga-polnoc',
      '/warsaw/praga-poludnie',
      '/warsaw/zoliborz',
      '/warsaw/ochota',
      '/warsaw/ursynow',
      '/warsaw/bielany',
      '/warsaw/wilanow',
      '/warsaw/bemowo',
      '/warsaw/targowek',
    ]);
    expect(hrefs.some((href) => href.includes('costs'))).toBe(false);
  });
});

describe('dashboard saved-listings button (PRD 4 FR-6)', () => {
  const dashboard = readFileSync(
    join(process.cwd(), 'src/app/[locale]/dashboard/client.tsx'),
    'utf8',
  );

  it('leads to the costs with the existing dashboard costs label', () => {
    expect(dashboard).toContain(`<Link href="/warsaw/costs">{t('dashboard.accessBrowse')}</Link>`);
    expect(dashboard).not.toContain('/warsaw/replacement');
    expect(dashboard).not.toContain('dashboard.browseListings');
    for (const locale of LOCALES) {
      expect(at(locale, 'dashboard.browseListings'), locale).toBeUndefined();
      expect(typeof at(locale, 'dashboard.accessBrowse'), locale).toBe('string');
    }
  });

  it('leaves the listings section unchanged (frozen, reachable)', () => {
    expect(dashboard).toContain('path={`/${listingsCitySlug}/replacement`}');
  });
});
