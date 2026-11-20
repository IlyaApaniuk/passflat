import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NeighbourMarker } from './location-poi-map';

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

// The token is read when the module loads; the popup is the `selected` state
// (the only `useState(null)`), opened here without a click.
const state = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'test-token';
  return {
    locale: 'en' as 'pl' | 'en' | 'ru' | 'uk',
    selected: null as { kind: 'neighbour'; marker: unknown } | null,
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => [
      initial === null ? state.selected : typeof initial === 'function' ? initial() : initial,
      () => {},
    ],
  };
});
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
vi.mock('posthog-js/react', () => ({ usePostHog: () => null }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));
vi.mock('react-map-gl', () => ({
  default: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-map': '' }, children),
  Marker: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-marker': '' }, children),
  NavigationControl: () => null,
  Popup: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-popup': '' }, children),
}));

import LocationPoiMap from './location-poi-map';

const tenant: NeighbourMarker = {
  id: 'b-1',
  slug: 'pulawska-12',
  address: 'Puławska 12',
  lat: 52.2,
  lng: 21.02,
  distanceM: 120,
  figure: { group: 'tenant', metric: 'completeTotal', value: 4_100, n: 2 },
  reportCount: 3,
};
const asking: NeighbourMarker = {
  ...tenant,
  id: 'b-2',
  slug: 'pulawska-14',
  address: 'Puławska 14',
  figure: { group: 'asking', metric: 'knownPartTotal', value: 3_900, n: 4 },
  reportCount: 4,
};

function render(props: Partial<ComponentProps<typeof LocationPoiMap>> = {}) {
  return renderToStaticMarkup(
    createElement(LocationPoiMap, {
      citySlug: 'warsaw',
      lat: 52.2,
      lng: 21.02,
      pois: [],
      neighbours: [tenant, asking],
      formatDistance: (m: number) => `${m} m`,
      formatMoney: (amount: number) => `${amount} zł`,
      surface: 'checker',
      ...props,
    }),
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

beforeEach(() => {
  state.locale = 'en';
  state.selected = null;
});

describe('LocationPoiMap neighbour layer (D23)', () => {
  it('pins each neighbour by its group, with "+" for a number that is not an all-in total', () => {
    const html = render();
    expect(html).toContain('data-group="tenant"');
    expect(html).toContain('data-group="asking"');
    expect(html).toMatch(/data-group="tenant"[^>]*>4\.1k</);
    expect(html).toMatch(/data-group="asking"[^>]*>3\.9k\+</);
    expect(text(html)).toContain('+ after a number: only part of the costs is known');
  });

  it('labels the popup with the group and its N, never an all-sources report count', () => {
    state.selected = { kind: 'neighbour', marker: asking };
    const popup = text(render());
    expect(popup).toContain('3900 zł · 120 m');
    expect(popup).toContain('Asking prices (4), known part');
    expect(popup).not.toMatch(/\d+ reports?\b/);

    state.selected = { kind: 'neighbour', marker: tenant };
    expect(text(render())).toContain('Tenant reports (2)');
  });

  it('renders the label in every locale without a raw key', () => {
    state.selected = { kind: 'neighbour', marker: asking };
    for (const locale of LOCALES) {
      state.locale = locale;
      const popup = text(render());
      expect(popup).not.toContain('costs.overview');
      expect(popup).toMatch(/\(4\)/);
    }
  });

  it('shows no legend without neighbours', () => {
    expect(render({ neighbours: [] })).not.toContain('data-legend');
  });
});
