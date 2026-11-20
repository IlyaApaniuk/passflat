import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { summarizeFigures, type FigureReport } from '@/lib/cost-figures';

// PRD 4 FR-11 (spec 08 §Callout placements): the building page's bottom card, which promoted the
// frozen listings (`/replacement?district=`), is replaced by the shared flatmate callout. The
// server page renders it without counts (no number on a building, Assumption) and hands it to the
// client as a ReactNode; the client places it where the card was, outside the contribution gate.

const DIR = join(process.cwd(), 'src/app/[locale]/[city]/building/[slug]');
const CLIENT_SOURCE = readFileSync(join(DIR, 'client.tsx'), 'utf8');
const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(join(process.cwd(), `src/i18n/messages/${locale}.json`), 'utf8')),
  ]),
) as Record<(typeof LOCALES)[number], Record<string, Record<string, Record<string, unknown>>>>;
const en = messages.en;

const { loadFlatmateBlockCounts } = vi.hoisted(() => ({ loadFlatmateBlockCounts: vi.fn() }));

const REPORTS: FigureReport[] = [
  {
    source: 'user',
    rentalType: 'apartment',
    rent: 3000,
    adminFee: 600,
    utilitiesComplete: true,
    totalMonthlyAvg: 3800,
    createdAt: new Date(2026, 8, 1),
  },
  {
    source: 'user',
    rentalType: 'apartment',
    rent: 3200,
    adminFee: 650,
    utilitiesComplete: true,
    totalMonthlyAvg: 4000,
    createdAt: new Date(2026, 9, 1),
  },
];
const FIGURES = summarizeFigures(REPORTS, { level: 'building', rentalType: 'all' });

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: { findUnique: async () => ({ id: 'city-1' }) },
    building: {
      findUnique: async () => ({
        id: 'b1',
        slug: 'marszalkowska-1',
        addressFull: 'Marszałkowska 1, Warszawa',
        cityId: 'city-1',
        districtId: 'd1',
        lat: 52.2,
        lng: 21,
        placeId: null,
        district: { nameKey: 'Śródmieście', slug: 'srodmiescie' },
        city: { nameKey: 'city.warsaw' },
        locationScore: null,
        costReports: [],
        tags: [],
      }),
    },
  },
}));
vi.mock('@/lib/cost-figures-query', () => ({
  loadBuildingFigures: async () => FIGURES,
  loadAreaReference: async () => null,
}));
vi.mock('@/lib/nuisances', () => ({ findNuisances: async () => [] }));
vi.mock('@/lib/roommate/website-counts', () => ({ loadFlatmateBlockCounts }));
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  return {
    setRequestLocale: vi.fn(),
    getLocale: async () => 'en',
    getTranslations: async (namespace?: string) =>
      createTranslator({
        locale: 'en',
        messages: en as never,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      }),
  };
});
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useLocale: () => 'en',
    useTranslations: (namespace?: string) =>
      actual.createTranslator({
        locale: 'en',
        messages: en as never,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      }),
  };
});
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));
vi.mock('@/components/landing/footer', () => ({ Footer: () => null }));
vi.mock('@/components/costs/share-button', () => ({ ShareButton: () => null }));
vi.mock('@/components/costs/follow-building-button', () => ({ FollowBuildingButton: () => null }));
vi.mock('@/components/listings/location-score', () => ({ LocationScore: () => null }));
vi.mock('@/components/buildings/tenant-tags', () => ({ TenantTags: () => null }));

import { FlatmateCallout } from '@/components/roommate/flatmate-callout';

import { BuildingCostsClient } from './client';
import BuildingCostsPage from './page';

function findElement(
  node: ReactNode,
  match: (element: ReactElement) => boolean,
): ReactElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, match);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  if (match(node)) return node;
  return findElement((node.props as { children?: ReactNode }).children, match);
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

describe('building client: no frozen listings card (static scan)', () => {
  it('names no /replacement and none of the deleted keys', () => {
    expect(CLIENT_SOURCE).not.toMatch(/\/replacement\b/);
    expect(CLIENT_SOURCE).not.toContain('lookingForApartment');
    expect(CLIENT_SOURCE).not.toContain('viewListingsIn');
  });

  it('the scan pattern catches the old link', () => {
    expect('<Link href={`/${citySlug}/replacement?district=${slug}`}>').toMatch(/\/replacement\b/);
  });

  it('places the flatmateCallout prop once, outside every GatedSection', () => {
    const occurrences = CLIENT_SOURCE.split('{flatmateCallout}').length - 1;
    expect(occurrences).toBe(1);
    const before = CLIENT_SOURCE.slice(0, CLIENT_SOURCE.indexOf('{flatmateCallout}'));
    const opened = before.split('<GatedSection').length - 1;
    const closed = before.split('</GatedSection>').length - 1;
    expect(opened).toBeGreaterThan(0);
    expect(opened).toBe(closed);
  });

  it('does not import the async server callout (a client module cannot)', () => {
    expect(CLIENT_SOURCE).not.toContain('roommate/flatmate-callout');
  });
});

describe('the deleted keys', () => {
  it.each(LOCALES)('%s: costs.building has no lookingForApartment* or viewListingsIn', (locale) => {
    const building = messages[locale].costs.building;
    expect(building).toBeDefined();
    for (const key of ['lookingForApartment', 'lookingForApartmentDesc', 'viewListingsIn']) {
      expect(building, key).not.toHaveProperty(key);
    }
  });
});

describe('building server page → FlatmateCallout surface="building"', () => {
  beforeEach(() => {
    loadFlatmateBlockCounts.mockReset();
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
  });

  async function clientElement() {
    const page = (await BuildingCostsPage({
      params: Promise.resolve({ locale: 'en', city: 'warsaw', slug: 'marszalkowska-1' }),
    })) as ReactElement;
    const client = findElement(page, (element) => element.type === BuildingCostsClient);
    expect(client).toBeDefined();
    return client as ReactElement<{ flatmateCallout: ReactNode }>;
  }

  it('passes the callout as a ReactNode prop, without counts, and loads no counts', async () => {
    const callout = (await clientElement()).props.flatmateCallout;
    expect(isValidElement(callout)).toBe(true);
    expect((callout as ReactElement).type).toBe(FlatmateCallout);
    expect((callout as ReactElement).props).toEqual({ surface: 'building' });
    expect(loadFlatmateBlockCounts).not.toHaveBeenCalled();
  });

  it('renders the question, no count line, the roommate link and the bot button', async () => {
    const callout = (await clientElement()).props.flatmateCallout as ReactElement<
      Parameters<typeof FlatmateCallout>[0]
    >;
    const html = renderToStaticMarkup(await FlatmateCallout(callout.props));
    expect(html).toMatch(/^<section aria-labelledby="flatmate-callout-building-title"/);
    expect(text(html)).toContain('Looking for someone to rent with in Warsaw?');
    expect(html).not.toContain('already ha');
    expect(html).not.toContain('Be among the first');
    expect(html).toContain('href="/warsaw/roommate"');
    expect(html).toContain('https://t.me/passflat_test_bot?start=mate_web_building');
    expect(html).not.toContain('/replacement');
  });
});

describe('building client places the callout where the card was', () => {
  it('after the comparison, once, and no frozen listings link', () => {
    const marker = createElement('div', { 'data-flatmate-callout': 'marker' });
    const html = renderToStaticMarkup(
      createElement(BuildingCostsClient, {
        building: {
          id: 'b1',
          slug: 'marszalkowska-1',
          address: 'Marszałkowska 1',
          district: 'Śródmieście',
          districtSlug: 'srodmiescie',
          city: 'Warsaw',
          placeId: null,
        },
        figures: FIGURES,
        areaReference: null,
        nuisancesCard: null,
        flatmateCallout: marker,
        tenantDetails: null,
        lastUpdated: null,
        citySlug: 'warsaw',
        tenantTags: null,
        initialLocationScore: null,
      }),
    );
    expect(html.split('data-flatmate-callout="marker"').length - 1).toBe(1);
    const comparisonTitle = en.costs.building.comparison as unknown as string;
    expect(html.indexOf(comparisonTitle)).toBeGreaterThan(-1);
    expect(html.indexOf('data-flatmate-callout')).toBeGreaterThan(html.indexOf(comparisonTitle));
    expect(html).not.toContain('/replacement');
    expect(html).not.toContain('Looking for an apartment');
  });
});
