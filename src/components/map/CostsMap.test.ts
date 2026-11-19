import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pinLabel } from '@/lib/map-style';

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

type PopupBuilding = {
  id: string;
  slug: string;
  lat: number;
  lng: number;
  address: string;
  district: string;
  reports: number;
  avgTotal: number;
  perM2?: number | null;
  hasContributed: boolean;
};

// The token is read when the module loads; the popup is the component's
// `popupInfo` state (the only `useState(null)`), opened here without a click.
const state = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'test-token';
  return {
    locale: 'en' as 'pl' | 'en' | 'ru' | 'uk',
    popup: null as PopupBuilding | null,
    sourceData: null as { features: Array<{ properties: Record<string, unknown> }> } | null,
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => [initial === null ? state.popup : initial, () => {}],
  };
});
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: (namespace: string) =>
      actual.createTranslator({
        locale: state.locale,
        messages: messages[state.locale] as never,
        namespace: namespace as never,
      }),
  };
});
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));
vi.mock('react-map-gl', () => ({
  default: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-map': '' }, children),
  Source: ({ data, children }: { data: typeof state.sourceData; children: ReactNode }) => {
    state.sourceData = data;
    return createElement('div', { 'data-source': '' }, children);
  },
  Layer: () => null,
  NavigationControl: () => null,
  Popup: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-popup': '' }, children),
}));

import { CostsMap } from './CostsMap';

const building: PopupBuilding = {
  id: 'b1',
  slug: 'pulawska-1',
  lat: 52.2,
  lng: 21.0,
  address: 'Puławska 1',
  district: 'Mokotów',
  reports: 2,
  avgTotal: 3900,
  perM2: 78,
  hasContributed: true,
};
// A much cheaper neighbour, so the old popup would have said "% below the median".
const neighbour: PopupBuilding = {
  ...building,
  id: 'b2',
  slug: 'pulawska-3',
  address: 'Puławska 3',
  avgTotal: 2000,
  perM2: null,
};

// `cityMedianTotal` was the prop the removed verdict compared against; it is
// still passed so that bringing the comparison back fails these tests.
const renderMap = (popup: PopupBuilding | null) => {
  state.popup = popup;
  const props = {
    buildings: [building, neighbour],
    citySlug: 'warsaw',
    cityMedianTotal: 3000,
  } as ComponentProps<typeof CostsMap>;
  return renderToStaticMarkup(createElement(CostsMap, props));
};
const popupText = (html: string) =>
  (html.split('data-popup')[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('CostsMap popup', () => {
  beforeEach(() => {
    state.locale = 'en';
    state.popup = null;
    state.sourceData = null;
  });

  it("shows the building's own figures unchanged (Q-2)", () => {
    const html = renderMap(building);
    const text = popupText(html);
    expect(text).toContain('Puławska 1');
    expect(text).toContain('Mokotów');
    expect(text).toContain('2 reports');
    expect(text).toContain(`${(3900).toLocaleString()} PLN`);
    expect(text).toContain(`${(78).toLocaleString()} PLN/m²`);
    expect(html).toContain('href="/warsaw/building/pulawska-1"');
  });

  it('draws no above / below / at-the-median conclusion in any locale', () => {
    for (const locale of LOCALES) {
      state.locale = locale;
      for (const popup of [building, neighbour]) {
        const html = renderMap(popup);
        const text = popupText(html);
        expect(text, locale).not.toContain('%');
        expect(text.toLowerCase(), locale).not.toMatch(/median|mediany|медиан|медіан/);
        // The verdict was tinted with an HSL red/green.
        expect(html, locale).not.toContain('hsl(');
      }
    }
  });

  it('keeps the pin labels as the building medians', () => {
    renderMap(null);
    const labels = state.sourceData?.features.map((f) => f.properties.label);
    expect(labels).toEqual([pinLabel(3900), pinLabel(2000)]);
    expect(labels).toEqual(['3.9k', '2.0k']);
  });

  it('renders no popup until a building is chosen', () => {
    expect(renderMap(null)).not.toContain('data-popup');
  });

  it('the vsMedian keys are gone from all four locale files', () => {
    for (const locale of LOCALES) {
      const overview = (messages[locale].costs as Record<string, Record<string, unknown>>).overview;
      for (const key of ['vsMedianAbove', 'vsMedianBelow', 'vsMedianEqual']) {
        expect(overview, `${locale} costs.overview.${key}`).not.toHaveProperty(key);
      }
    }
  });
});
