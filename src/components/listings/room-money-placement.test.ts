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
vi.mock('@/components/listings/listing-filters', () => ({
  ListingFiltersDesktop: () => null,
  ListingFiltersMobile: () => null,
  ActiveFilters: () => null,
  QuickFilters: () => null,
  ListingTypeTabs: () => null,
}));
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
vi.mock('@/components/listings/roommate-role-selector', () => ({
  RoommateRoleSelector: () => null,
}));
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
  return { FindFlatmateBlock: () => el('div', { 'data-marker': 'flatmate' }) };
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

function render({
  intent,
  offers,
  citySlug = 'warsaw',
  listingType = 'roommate',
  roomMoney,
}: {
  intent?: 'find_room' | 'offer_room' | 'find_flatmate';
  offers: boolean;
  citySlug?: string;
  listingType?: 'roommate' | 'sublet';
  roomMoney?: RoomMoneyFigures | null;
}): { markers: string[]; bridge: boolean } {
  h.initial = intent ? { intent, collapsed: true } : { collapsed: false };
  const html = renderToStaticMarkup(
    createElement(ListingsPageClient, {
      listings: offers ? [LISTING] : [],
      districts: [],
      citySlug,
      listingType,
      cityOfferCount: listingType === 'roommate' ? (offers ? 1 : 0) : undefined,
      flatmateCounts: { status: 'counts', total: 0, top: [] },
      roomMoney,
    }),
  );
  return {
    markers: [...html.matchAll(/data-marker="([^"]+)"/g)].map((match) => match[1]),
    bridge: html.includes(`href="/${citySlug}/check"`),
  };
}

describe('ListingsPageClient: the room money block (spec 02 §Room money block)', () => {
  beforeEach(() => {
    h.initial = { collapsed: false };
  });

  it('no role chosen, offers in the city: no block, the bridge line stays', () => {
    expect(render({ offers: true, roomMoney: FIGURES })).toEqual({
      markers: ['list'],
      bridge: true,
    });
  });

  it('"I\'m looking for a room": the block at the top of the list, the bridge line replaced', () => {
    expect(render({ intent: 'find_room', offers: true, roomMoney: FIGURES })).toEqual({
      markers: ['room-money:figures:warsaw', 'list'],
      bridge: false,
    });
  });

  it('no offers in the city, no role chosen: the block above the empty state, no bridge line', () => {
    expect(render({ offers: false, roomMoney: FIGURES })).toEqual({
      markers: ['room-money:figures:warsaw', 'empty-state'],
      bridge: false,
    });
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
