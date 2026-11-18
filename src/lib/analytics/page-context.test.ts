import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  getPageContext,
  PAGE_TYPES,
  STATIC_CITY_ROUTES,
  STATIC_TOP_LEVEL_ROUTES,
  type PageContext,
} from './page-context';

const APP_LOCALE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../app/[locale]');

/** Names of the static (non-`[param]`) route directories in `dir`. */
function staticRouteDirs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('['))
    .map((entry) => entry.name)
    .sort();
}

describe('getPageContext', () => {
  // Golden examples of docs/specs/01-analytics-context.md#page-context.
  it.each<[string, PageContext]>([
    ['/', { page_type: 'home', locale: 'pl', city: null }],
    [
      '/ru/warsaw/roommate',
      { page_type: 'roommate', locale: 'ru', city: 'warsaw', listing_type: 'roommate' },
    ],
    [
      '/en/warsaw/sublet/abc',
      { page_type: 'listing_detail', locale: 'en', city: 'warsaw', listing_type: 'sublet' },
    ],
    ['/warsaw/building/marszalkowska-1', { page_type: 'building', locale: 'pl', city: 'warsaw' }],
    ['/uk/warsaw/costs/submit', { page_type: 'cost_submit', locale: 'uk', city: 'warsaw' }],
    ['/blog/przepisanie-licznikow-najem', { page_type: 'blog', locale: 'pl', city: null }],
    ['/en/about', { page_type: 'other', locale: 'en', city: null }],
    ['/warsaw/mokotow', { page_type: 'costs', locale: 'pl', city: 'warsaw' }],
  ])('golden example %s', (pathname, expected) => {
    expect(getPageContext(pathname)).toEqual(expected);
  });

  it.each<[string, PageContext]>([
    [
      '/warsaw/sublet',
      { page_type: 'other', locale: 'pl', city: 'warsaw', listing_type: 'sublet' },
    ],
    [
      '/ru/warsaw/replacement',
      { page_type: 'other', locale: 'ru', city: 'warsaw', listing_type: 'replacement' },
    ],
  ])('maps the list page %s to other with its listing_type', (pathname, expected) => {
    expect(getPageContext(pathname)).toEqual(expected);
  });

  it.each<[string, PageContext]>([
    [
      '/warsaw/roommate/abc',
      { page_type: 'listing_detail', locale: 'pl', city: 'warsaw', listing_type: 'roommate' },
    ],
    [
      '/uk/warsaw/replacement/xyz',
      { page_type: 'listing_detail', locale: 'uk', city: 'warsaw', listing_type: 'replacement' },
    ],
  ])('maps the listing detail %s', (pathname, expected) => {
    expect(getPageContext(pathname)).toEqual(expected);
  });

  it('maps /warsaw/review to other', () => {
    expect(getPageContext('/warsaw/review')).toEqual({
      page_type: 'other',
      locale: 'pl',
      city: 'warsaw',
    });
  });

  it.each<[string, PageContext['page_type']]>([
    ['/warsaw', 'costs'],
    ['/warsaw/costs', 'costs'],
    ['/warsaw/costs/share', 'costs'],
    ['/warsaw/calculator', 'costs'],
    ['/warsaw/check', 'checker'],
    ['/resources', 'resources'],
    ['/blog', 'blog'],
    ['/blog/warsaw-rent-prices', 'blog'],
  ])('maps %s to %s', (pathname, pageType) => {
    expect(getPageContext(pathname).page_type).toBe(pageType);
  });

  it.each([
    '/auth/login',
    '/auth/callback',
    '/dashboard',
    '/how-it-works',
    '/blog/a/b',
    '/resources/x',
    '/warsaw/building',
    '/warsaw/mokotow/extra',
    '/warsaw/sublet/abc/extra',
    '/warsaw/costs/unknown',
  ])('maps %s to other', (pathname) => {
    expect(getPageContext(pathname).page_type).toBe('other');
  });

  it('never reads a static top-level route as a city', () => {
    for (const route of STATIC_TOP_LEVEL_ROUTES) {
      expect(getPageContext(`/${route}`).city, route).toBeNull();
      expect(getPageContext(`/ru/${route}/sub`).city, route).toBeNull();
    }
  });

  it('reads the locale prefix and treats a bare locale as home', () => {
    expect(getPageContext('/en')).toEqual({ page_type: 'home', locale: 'en', city: null });
    expect(getPageContext('/uk/')).toEqual({ page_type: 'home', locale: 'uk', city: null });
    expect(getPageContext('/pl/warsaw').locale).toBe('pl');
  });

  it('ignores a trailing slash, query and hash', () => {
    expect(getPageContext('/ru/warsaw/check/?p=ChIJ#top')).toEqual({
      page_type: 'checker',
      locale: 'ru',
      city: 'warsaw',
    });
    expect(getPageContext('')).toEqual({ page_type: 'home', locale: 'pl', city: null });
  });

  it('only returns values listed in PAGE_TYPES, blog included', () => {
    expect(PAGE_TYPES).toContain('blog');
    expect(PAGE_TYPES).toContain(getPageContext('/blog').page_type);
  });
});

describe('route lists', () => {
  it('lists every static directory under src/app/[locale]/', () => {
    expect([...STATIC_TOP_LEVEL_ROUTES].sort()).toEqual(staticRouteDirs(APP_LOCALE_DIR));
  });

  it('lists every static directory under src/app/[locale]/[city]/', () => {
    expect([...STATIC_CITY_ROUTES].sort()).toEqual(staticRouteDirs(join(APP_LOCALE_DIR, '[city]')));
  });
});
