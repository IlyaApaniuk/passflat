import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CaptureResult, Properties } from 'posthog-js';
import { describe, expect, it } from 'vitest';

import {
  createPageContextHook,
  getPageContext,
  PAGE_TYPES,
  STATIC_CITY_ROUTES,
  STATIC_TOP_LEVEL_ROUTES,
  withPageContext,
  type PageContext,
} from './page-context';

/** An event as posthog-js hands it to `before_send`. */
function captured(event: string, properties: Properties): CaptureResult {
  return { uuid: `uuid-${event}`, event, properties };
}

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

describe('withPageContext', () => {
  it('passes a null event through', () => {
    expect(withPageContext(null, '/warsaw/check', null)).toEqual({ event: null, entry: null });
  });

  it('adds the page context and the entry page type, keeping the other fields', () => {
    const event = captured('cost_form_started', { $session_id: 's1', source: 'hero' });

    const { event: result } = withPageContext(event, '/uk/warsaw/costs/submit', null);

    expect(result).toEqual({
      uuid: 'uuid-cost_form_started',
      event: 'cost_form_started',
      properties: {
        page_type: 'cost_submit',
        locale: 'uk',
        city: 'warsaw',
        entry_page_type: 'cost_submit',
        $session_id: 's1',
        source: 'hero',
      },
    });
    expect(event.properties).toEqual({ $session_id: 's1', source: 'hero' });
  });

  it('adds listing_type only on listing pages', () => {
    const onListing = withPageContext(captured('x', {}), '/en/warsaw/sublet/abc', null).event;
    const onHome = withPageContext(captured('x', {}), '/', null).event;

    expect(onListing?.properties).toMatchObject({
      page_type: 'listing_detail',
      listing_type: 'sublet',
    });
    expect(onHome?.properties).not.toHaveProperty('listing_type');
  });

  it("lets the event's own properties win", () => {
    const event = captured('building_detail_viewed', {
      $session_id: 's1',
      city: 'krakow',
      listing_type: 'roommate',
      entry_page_type: 'home',
    });

    const { event: result } = withPageContext(event, '/warsaw/building/marszalkowska-1', null);

    expect(result?.properties).toMatchObject({
      page_type: 'building',
      city: 'krakow',
      listing_type: 'roommate',
      entry_page_type: 'home',
    });
  });

  it('takes the entry from the SDK session entry pathname when the event has it', () => {
    const event = captured('cost_form_started', {
      $session_id: 's1',
      $session_entry_pathname: '/ru/warsaw/check',
    });

    const { event: result, entry } = withPageContext(event, '/ru/warsaw/costs/submit', null);

    expect(result?.properties).toMatchObject({
      page_type: 'cost_submit',
      entry_page_type: 'checker',
    });
    expect(entry).toEqual({ sessionId: 's1', entryPageType: 'checker' });
  });

  it('keeps the SDK entry for later events and follows it into a new session', () => {
    const first = withPageContext(
      captured('a', { $session_id: 's1', $session_entry_pathname: '/warsaw/roommate' }),
      '/warsaw/roommate',
      null,
    );
    const later = withPageContext(
      captured('b', { $session_id: 's1', $session_entry_pathname: '/warsaw/roommate' }),
      '/warsaw/costs/submit',
      first.entry,
    );
    const next = withPageContext(
      captured('c', { $session_id: 's2', $session_entry_pathname: '/blog/abc' }),
      '/warsaw/costs/submit',
      later.entry,
    );

    expect(later.event?.properties.entry_page_type).toBe('roommate');
    expect(next.event?.properties.entry_page_type).toBe('blog');
  });

  it('falls back to the first event of the session and keeps it for later events', () => {
    // `$web_vitals` arrives even when the landing `$pageview` is lost.
    const first = withPageContext(
      captured('$web_vitals', { $session_id: 's1' }),
      '/warsaw/check',
      null,
    );
    const later = withPageContext(
      captured('cost_form_started', { $session_id: 's1' }),
      '/warsaw/costs/submit',
      first.entry,
    );

    expect(first.event?.properties.entry_page_type).toBe('checker');
    expect(later.event?.properties).toMatchObject({
      page_type: 'cost_submit',
      entry_page_type: 'checker',
    });
    expect(later.entry).toEqual({ sessionId: 's1', entryPageType: 'checker' });
  });

  it('resets the fallback entry on a new $session_id', () => {
    const first = withPageContext(captured('a', { $session_id: 's1' }), '/warsaw/check', null);

    const next = withPageContext(
      captured('b', { $session_id: 's2' }),
      '/warsaw/costs/submit',
      first.entry,
    );

    expect(next.event?.properties.entry_page_type).toBe('cost_submit');
    expect(next.entry).toEqual({ sessionId: 's2', entryPageType: 'cost_submit' });
  });

  it('sends session-recording snapshots as the SDK built them', () => {
    const snapshot = captured('$snapshot', { $session_id: 's1', $snapshot_data: [] });
    const entry = { sessionId: 's0', entryPageType: 'home' as const };

    const result = withPageContext(snapshot, '/warsaw/check', entry);

    expect(result.event).toBe(snapshot);
    expect(result.entry).toBe(entry);
  });
});

describe('createPageContextHook', () => {
  it('reads the pathname at send time and keeps the session entry between events', () => {
    let pathname = '/ru/warsaw/check';
    const beforeSend = createPageContextHook(() => pathname);

    const first = beforeSend(captured('$pageleave', { $session_id: 's1' }));
    pathname = '/ru/warsaw/costs/submit';
    const later = beforeSend(captured('cost_form_started', { $session_id: 's1' }));
    const nextSession = beforeSend(captured('cost_form_started', { $session_id: 's2' }));

    expect(first?.properties).toMatchObject({ page_type: 'checker', entry_page_type: 'checker' });
    expect(later?.properties).toMatchObject({
      page_type: 'cost_submit',
      locale: 'ru',
      city: 'warsaw',
      entry_page_type: 'checker',
    });
    expect(nextSession?.properties.entry_page_type).toBe('cost_submit');
  });

  it('passes a null event through', () => {
    expect(createPageContextHook(() => '/')(null)).toBeNull();
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
