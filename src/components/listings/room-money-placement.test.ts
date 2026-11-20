import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoomMoneyFigures } from './room-money-block';

// Spec 02 §Room money block, wired into `ListingsPageClient`: the block shows for "I'm
// looking for a room" and on a city without offers, only where the page passes `roomMoney`
// (`/warsaw/roommate`), at the top of the list container; while it shows, its address-check
// item replaces the bridge line. The role state starts from `INITIAL_ROOMMATE_ROLE_STATE`,
// which this test sets per case (no DOM, so no click).

const h = vi.hoisted(() => ({
  initial: { collapsed: false } as { intent?: string; collapsed: boolean },
}));

vi.mock('@/lib/roommate-roles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/roommate-roles')>();
  return {
    ...actual,
    get INITIAL_ROOMMATE_ROLE_STATE() {
      return h.initial;
    },
  };
});

const en = JSON.parse(
  readFileSync(join(process.cwd(), 'src/i18n/messages/en.json'), 'utf8'),
) as Record<string, unknown>;
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({
        locale: 'en',
        messages: en as never,
        namespace: namespace as never,
      }),
  };
});
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture: vi.fn() }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/i18n/navigation', async () => {
  const { createElement: el } = await import('react');
  return {
    Link: ({ href, children }: { href: string; children?: ReactNode }) =>
      el('a', { href }, children),
    useRouter: () => ({ refresh: vi.fn() }),
  };
});
vi.mock('@/hooks/use-url-filters', () => ({
  useUrlFilters: () => ({ filters: {}, setFilters: vi.fn(), sortBy: 'newest', setSortBy: vi.fn() }),
}));
vi.mock('@/hooks/use-favorites', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }),
}));
vi.mock('@/components/listings/listing-filters', async () => {
  const { createElement: el } = await import('react');
  return {
    ListingFiltersDesktop: () => null,
    ListingFiltersMobile: () => null,
    ActiveFilters: () => null,
    QuickFilters: () => null,
    // `data-row`, not `data-marker`: the header rows are checked apart from the list markers
    // (and not `data-slot`, which the real `Button` renders).
    ListingTypeTabs: ({ variant }: { variant: string }) =>
      el('div', { 'data-row': `tabs:${variant}` }),
  };
});
vi.mock('@/components/ui/select', () => {
  const Pass = ({ children }: { children?: ReactNode }) => children ?? null;
  return {
    Select: Pass,
    SelectContent: () => null,
    SelectItem: () => null,
    SelectTrigger: () => null,
    SelectValue: () => null,
  };
});
vi.mock('@/components/listings/roommate-role-selector', async () => {
  const { createElement: el } = await import('react');
  return { RoommateRoleSelector: () => el('div', { 'data-row': 'selector' }) };
});
vi.mock('@/components/listings/listings-page-skeleton', () => ({
  ListingsPageSkeleton: () => null,
}));
vi.mock('@/components/map/map-skeleton', () => ({ MapSkeleton: () => null }));
vi.mock('@/components/listings/listing-card', async () => {
  const { createElement: el } = await import('react');
  return { ListingGrid: () => el('div', { 'data-marker': 'list' }) };
});
vi.mock('@/components/listings/listings-empty-state', async () => {
  const { createElement: el } = await import('react');
  return { ListingsEmptyState: () => el('div', { 'data-marker': 'empty-state' }) };
});
vi.mock('@/components/listings/listings-no-match', () => ({ ListingsNoMatch: () => null }));
vi.mock('@/components/listings/find-flatmate-block', async () => {
  const { createElement: el } = await import('react');
  return {
    FindFlatmateBlock: ({ counts }: { counts?: unknown }) =>
      el('div', { 'data-marker': 'flatmate', 'data-counts': counts ? 'yes' : 'no' }),
  };
});
vi.mock('@/components/landing/footer', async () => {
  const { createElement: el } = await import('react');
  return { Footer: () => el('footer', { 'data-shell': 'footer' }) };
});
vi.mock('./room-money-block', async () => {
  const { createElement: el } = await import('react');
  return {
    RoomMoneyBlock: ({ figures, citySlug }: { figures: unknown; citySlug: string }) =>
      el('div', { 'data-marker': `room-money:${figures ? 'figures' : 'none'}:${citySlug}` }),
  };
});

import { ListingsPageClient } from './listings-page-client';
import type { Listing } from '@/lib/listings-data';

const LISTING = {
  id: 'l1',
  totalCost: 2_000,
  area: 20,
  createdAt: '2026-11-01T10:00:00.000Z',
  promoted: false,
  lat: 52.2,
  lng: 21.0,
} as unknown as Listing;

const FIGURES = { reference: { level: 'city' }, areaName: 'Warsaw' } as unknown as RoomMoneyFigures;

type RenderOptions = {
  intent?: 'find_room' | 'offer_room' | 'find_flatmate';
  offers: boolean;
  citySlug?: string;
  listingType?: 'roommate' | 'sublet' | 'replacement';
  roomMoney?: RoomMoneyFigures | null;
  withCounts?: boolean;
};

function html({
  intent,
  offers,
  citySlug = 'warsaw',
  listingType = 'roommate',
  roomMoney,
  withCounts = true,
}: RenderOptions): string {
  h.initial = intent ? { intent, collapsed: true } : { collapsed: false };
  return renderToStaticMarkup(
    createElement(ListingsPageClient, {
      listings: offers ? [LISTING] : [],
      districts: [],
      citySlug,
      listingType,
      cityOfferCount: listingType === 'roommate' ? (offers ? 1 : 0) : undefined,
      flatmateCounts: withCounts
        ? { status: 'counts', total: 0, top: [], byDistrict: {} }
        : undefined,
      roomMoney,
    }),
  );
}

function render(options: RenderOptions): { markers: string[]; bridge: boolean } {
  const page = html(options);
  return {
    markers: [...page.matchAll(/data-marker="([^"]+)"/g)].map((match) => match[1]),
    bridge: page.includes(`href="/${options.citySlug ?? 'warsaw'}/check"`),
  };
}

/** The header rows in document order: the selector, the two type tab variants. */
function slots(options: RenderOptions): string[] {
  return [...html(options).matchAll(/data-row="([^"]+)"/g)].map((match) => match[1]);
}

/** How many `listings.listingsInCity` lines render (desktop and mobile each have one). */
function countLines(options: RenderOptions): string[] {
  return [...html(options).matchAll(/<p aria-live="polite"[^>]*>([\s\S]*?)<\/p>/g)].map((match) =>
    match[1].replace(/<[^>]+>/g, ''),
  );
}

describe('ListingsPageClient: the room money block (spec 02 §Room money block)', () => {
  beforeEach(() => {
    h.initial = { collapsed: false };
  });

  it('no role chosen, offers in the city: the flatmate block first, no room money block, the bridge line stays', () => {
    expect(render({ offers: true, roomMoney: FIGURES })).toEqual({
      markers: ['flatmate', 'list'],
      bridge: true,
    });
  });

  it('"I\'m looking for a room": the block at the top of the list, the bridge line replaced', () => {
    expect(render({ intent: 'find_room', offers: true, roomMoney: FIGURES })).toEqual({
      markers: ['room-money:figures:warsaw', 'list'],
      bridge: false,
    });
  });

  it('no offers in the city, no role chosen: the flatmate block, then room money, then the empty state; no bridge line', () => {
    expect(render({ offers: false, roomMoney: FIGURES })).toEqual({
      markers: ['flatmate', 'room-money:figures:warsaw', 'empty-state'],
      bridge: false,
    });
  });

  it('"I have a free room": no flatmate block; room money only on a city without offers', () => {
    expect(render({ intent: 'offer_room', offers: true, roomMoney: FIGURES }).markers).toEqual([
      'list',
    ]);
    expect(render({ intent: 'offer_room', offers: false, roomMoney: FIGURES }).markers).toEqual([
      'room-money:figures:warsaw',
      'empty-state',
    ]);
  });

  it('no offers in the city and "Looking for someone to rent with": both blocks, flatmate first', () => {
    expect(render({ intent: 'find_flatmate', offers: false, roomMoney: FIGURES })).toEqual({
      markers: ['flatmate', 'room-money:figures:warsaw', 'empty-state'],
      bridge: false,
    });
  });

  it('"Looking for someone to rent with" with offers: no room money block, the bridge line stays', () => {
    expect(render({ intent: 'find_flatmate', offers: true, roomMoney: FIGURES })).toEqual({
      markers: ['flatmate', 'list'],
      bridge: true,
    });
  });

  it('no room figures (null): the block without figures', () => {
    expect(render({ intent: 'find_room', offers: true, roomMoney: null }).markers).toEqual([
      'room-money:none:warsaw',
      'list',
    ]);
  });

  it('a page without roomMoney (another city): never the block, the bridge line stays', () => {
    expect(render({ intent: 'find_room', offers: true, citySlug: 'krakow' })).toEqual({
      markers: ['list'],
      bridge: true,
    });
    expect(render({ offers: false, citySlug: 'krakow' })).toEqual({
      markers: ['empty-state'],
      bridge: true,
    });
  });

  it('another listing type never shows the block, even with roomMoney passed', () => {
    expect(
      render({ intent: 'find_room', offers: false, listingType: 'sublet', roomMoney: FIGURES })
        .markers,
    ).toEqual(['empty-state']);
  });
});

describe('ListingsPageClient: the roommate page default view (spec 08, PRD 4 FR-1, FR-2, FR-7)', () => {
  beforeEach(() => {
    h.initial = { collapsed: false };
  });

  it('the role selector row renders above the type tabs row (desktop and mobile tabs)', () => {
    expect(slots({ offers: true, roomMoney: FIGURES })).toEqual([
      'selector',
      'tabs:tabs',
      'tabs:segmented',
    ]);
  });

  it('no offer in the city: the selector without the type tabs, on desktop and mobile (FR-7, D82)', () => {
    expect(slots({ offers: false, roomMoney: FIGURES })).toEqual(['selector']);
    for (const intent of ['find_room', 'offer_room', 'find_flatmate'] as const) {
      expect(slots({ intent, offers: false, roomMoney: FIGURES }), intent).toEqual(['selector']);
    }
    // The sort select stays: the desktop row keeps it on the right without the tabs.
    expect(html({ offers: false, roomMoney: FIGURES })).toContain('class="ml-auto shrink-0"');
  });

  it('/replacement and /sublet: no selector, the tabs as before, also with nothing listed', () => {
    for (const listingType of ['replacement', 'sublet'] as const) {
      for (const offers of [true, false]) {
        expect(slots({ offers, listingType })).toEqual(['tabs:tabs', 'tabs:segmented']);
      }
    }
  });

  it('the count line is absent on desktop and mobile while the city has no offer', () => {
    expect(countLines({ offers: false, roomMoney: FIGURES })).toEqual([]);
    expect(countLines({ intent: 'find_flatmate', offers: false, roomMoney: FIGURES })).toEqual([]);
  });

  it('the count line is back on desktop and mobile once the city has an offer', () => {
    expect(countLines({ offers: true, roomMoney: FIGURES })).toEqual(['1 listing', '1 listing']);
  });

  it('/replacement and /sublet keep the count line, also with nothing listed', () => {
    for (const listingType of ['replacement', 'sublet'] as const) {
      expect(countLines({ offers: false, listingType })).toEqual(['0 listings', '0 listings']);
    }
  });

  it('no counts passed (no bot username): the flatmate block still renders first', () => {
    const page = html({ offers: false, roomMoney: FIGURES, withCounts: false });
    expect(page).toContain('data-marker="flatmate" data-counts="no"');
    expect(render({ offers: false, roomMoney: FIGURES, withCounts: false }).markers).toEqual([
      'flatmate',
      'room-money:figures:warsaw',
      'empty-state',
    ]);
    expect(html({ offers: false, roomMoney: FIGURES })).toContain(
      'data-marker="flatmate" data-counts="yes"',
    );
  });

  it('another city: no flatmate block even with counts passed', () => {
    expect(render({ offers: true, citySlug: 'krakow' }).markers).toEqual(['list']);
  });
});

describe('ListingsPageClient: the page shell (spec 08 §Roommate page shell, PRD 4 FR-3, FR-4)', () => {
  beforeEach(() => {
    h.initial = { collapsed: false };
  });

  const count = (page: string, pattern: RegExp) =>
    [...page.matchAll(new RegExp(pattern.source, 'g'))].length;

  /** The opening tags of `main` and `h1`, the header rows, the list markers and the footer in order. */
  function shell(options: RenderOptions): string[] {
    return [
      ...html(options).matchAll(
        /<(main|h1)\b[^>]*>|data-row="([^"]+)"|data-marker="([^"]+)"|data-shell="([^"]+)"/g,
      ),
    ].map((match) => match[1] ?? match[2] ?? match[3] ?? match[4]);
  }

  it('the roommate page: one main landmark, one h1 first in it with listings.roommateH1, then the selector', () => {
    for (const offers of [false, true]) {
      const page = html({ offers, roomMoney: FIGURES });
      expect(count(page, /<main\b/)).toBe(1);
      expect(page).toContain('<main id="main"');
      expect(count(page, /<h1\b/)).toBe(1);
      expect(page).toMatch(/<h1\b[^>]*>Find a flatmate in Warsaw<\/h1>/);
      expect(shell({ offers, roomMoney: FIGURES }).slice(0, 3)).toEqual(['main', 'h1', 'selector']);
    }
  });

  it('the h1 stays whatever the role chosen', () => {
    for (const intent of ['find_room', 'offer_room', 'find_flatmate'] as const) {
      expect(count(html({ intent, offers: true, roomMoney: FIGURES }), /<h1\b/)).toBe(1);
    }
  });

  it('/replacement and /sublet: the main landmark and the footer, no h1', () => {
    for (const listingType of ['replacement', 'sublet'] as const) {
      for (const offers of [false, true]) {
        const page = html({ offers, listingType });
        expect(count(page, /<main id="main"/)).toBe(1);
        expect(count(page, /<h1\b/)).toBe(0);
        expect(count(page, /data-shell="footer"/)).toBe(1);
      }
    }
  });

  it('the footer renders once, after the grid or the empty state, inside main', () => {
    expect(shell({ offers: true, roomMoney: FIGURES }).slice(-2)).toEqual(['list', 'footer']);
    expect(shell({ offers: false, roomMoney: FIGURES }).slice(-2)).toEqual([
      'empty-state',
      'footer',
    ]);
    const page = html({ offers: true, roomMoney: FIGURES });
    expect(count(page, /data-shell="footer"/)).toBe(1);
    expect(page.indexOf('data-shell="footer"')).toBeLessThan(page.indexOf('</main>'));
  });

  it('the source: h-dvh instead of h-screen, one main id="main", one Footer element', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/listings/listings-page-client.tsx'),
      'utf8',
    );
    expect(source).toContain('h-dvh');
    expect(source).not.toContain('h-screen');
    expect(count(source, /<main id="main"/)).toBe(1);
    expect(count(source, /<Footer\b/)).toBe(1);
    expect(source).toContain("import { Footer } from '@/components/landing/footer'");
  });
});
