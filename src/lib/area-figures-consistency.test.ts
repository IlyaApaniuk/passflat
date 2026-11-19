// FR-34 for the area surfaces of T052 (spec 03 §Single-number surfaces, D23): the city hub,
// the district page, the calculator baseline and the home page (hero city tiles, district
// cards, featured building) show one group's figure with its label and N, and an area's
// figure is a summary over the area's reports equal to `loadAreaReference`'s headline for the
// same area and rental type. Every path reads one Prisma mock holding the same reports.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const en = JSON.parse(
  readFileSync(join(process.cwd(), 'src/i18n/messages/en.json'), 'utf8'),
) as Record<string, unknown>;

const h = vi.hoisted(() => {
  const decimal = (value: number | null) => value;
  type Row = {
    buildingId: string;
    districtId: string;
    source: string;
    rentalType: string | null;
    rent: unknown;
    adminFee: unknown;
    totalMonthlyAvg: unknown;
    areaM2: unknown;
    utilitiesComplete: boolean;
  };
  const rows: Row[] = [];
  const add = (
    buildingId: string,
    districtId: string,
    source: string,
    rentalType: string,
    [total, rent, adminFee, area]: [number, number, number, number],
    complete: boolean,
  ) =>
    rows.push({
      buildingId,
      districtId,
      source,
      rentalType,
      rent: decimal(rent),
      adminFee: decimal(adminFee),
      totalMonthlyAvg: decimal(total),
      areaM2: decimal(area),
      utilitiesComplete: complete,
    });
  return { rows, add };
});

// Mokotów: 3 tenant reports and 6 asking prices (example 15's shape) → tenant, N 3.
h.add('b-mok-1', 'd-mok', 'user', 'apartment', [4000, 3200, 500, 50], true);
h.add('b-mok-1', 'd-mok', 'import', 'apartment', [3700, 3000, 450, 45], true);
h.add('b-mok-1', 'd-mok', 'user', 'room', [2200, 1800, 300, 20], true);
for (const total of [5000, 5100, 5200, 5300, 5400, 5500]) {
  h.add('b-mok-2', 'd-mok', 'scraped', 'apartment', [total, total - 600, 600, 60], false);
}
// Wola: asking prices only, known part, N 5 (enough for the czynsz anchor).
for (const total of [4100, 3900, 4000, 4200, 3800]) {
  h.add('b-wol-1', 'd-wol', 'scraped', 'apartment', [total, total - 500, 600, 50], false);
}
// Ochota: 2 tenant reports, below MIN_AREA_REPORTS, so its reference is the city.
h.add('b-och-1', 'd-och', 'user', 'apartment', [3000, 2400, 400, 40], true);
h.add('b-och-1', 'd-och', 'user', 'apartment', [3200, 2600, 420, 42], true);
// Bemowo: one report with neither rent nor total, so no usable figure anywhere.
h.rows.push({
  buildingId: 'b-bem-1',
  districtId: 'd-bem',
  source: 'user',
  rentalType: 'apartment',
  rent: null,
  adminFee: null,
  totalMonthlyAvg: null,
  areaM2: null,
  utilitiesComplete: false,
});

const CITY = { id: 'city-1', slug: 'warsaw', nameKey: 'Warszawa' };
const DISTRICTS = [
  { id: 'd-mok', slug: 'mokotow', nameKey: 'Mokotów' },
  { id: 'd-wol', slug: 'wola', nameKey: 'Wola' },
  { id: 'd-och', slug: 'ochota', nameKey: 'Ochota' },
  { id: 'd-bem', slug: 'bemowo', nameKey: 'Bemowo' },
];
const BUILDINGS = [
  { id: 'b-mok-1', address: 'ul. Puławska 1', district: DISTRICTS[0] },
  { id: 'b-mok-2', address: 'ul. Puławska 2', district: DISTRICTS[0] },
  { id: 'b-wol-1', address: 'ul. Wolska 1', district: DISTRICTS[1] },
  { id: 'b-och-1', address: 'ul. Grójecka 1', district: DISTRICTS[2] },
  { id: 'b-bem-1', address: 'ul. Bemowska 1', district: DISTRICTS[3] },
];

type Where = {
  buildingId?: string;
  rentalType?: string;
  building?: { districtId?: string; cityId?: string };
  district?: { slug?: string };
  id?: string;
  slug?: string;
};
const toDecimal = (value: unknown) => (value == null ? null : new Prisma.Decimal(String(value)));
const asDecimal = (row: (typeof h.rows)[number]) => ({
  ...row,
  rent: toDecimal(row.rent),
  adminFee: toDecimal(row.adminFee),
  totalMonthlyAvg: toDecimal(row.totalMonthlyAvg),
  areaM2: toDecimal(row.areaM2),
  building: { districtId: row.districtId },
});

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: {
      findUnique: async ({ where }: { where: Where }) =>
        where.slug === CITY.slug || where.id === CITY.id
          ? { ...CITY, districts: DISTRICTS.map(({ slug, nameKey }) => ({ slug, nameKey })) }
          : null,
    },
    district: {
      findUnique: async ({ where }: { where: Where }) =>
        DISTRICTS.find((district) => district.id === where.id) ?? null,
      findMany: async () => DISTRICTS,
    },
    building: {
      findMany: async ({ where }: { where: Where }) =>
        BUILDINGS.filter(
          (b) => !where.district?.slug || b.district.slug === where.district.slug,
        ).map((b) => ({
          id: b.id,
          slug: b.id,
          addressFull: b.address,
          lat: 52.2,
          lng: 21,
          district: { nameKey: b.district.nameKey, slug: b.district.slug },
          costReports: h.rows.filter((row) => row.buildingId === b.id).map(asDecimal),
        })),
    },
    costReport: {
      findMany: async ({ where }: { where: Where }) =>
        h.rows
          .filter((row) => !where.buildingId || row.buildingId === where.buildingId)
          .filter(
            (row) => !where.building?.districtId || row.districtId === where.building.districtId,
          )
          .filter((row) => !where.rentalType || row.rentalType === where.rentalType)
          .map(asDecimal),
    },
  },
}));
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  return {
    getTranslations: async (namespace?: string) =>
      createTranslator({ locale: 'en', messages: en as never, namespace: namespace as never }),
    getLocale: async () => 'en',
    setRequestLocale: () => undefined,
  };
});
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
    useFormatter: () => ({ number: (value: number) => value.toLocaleString('en') }),
  };
});
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));
vi.mock('@/components/landing/footer', () => ({ Footer: () => null }));
vi.mock('@/components/costs/share-button', () => ({ ShareButton: () => null }));

import { createTranslator } from 'next-intl';

import CityCostsHub from '@/app/[locale]/[city]/page';
import DistrictCostsPage from '@/app/[locale]/[city]/[district]/page';
import { CalculatorClient } from '@/app/[locale]/[city]/calculator/client';
import { CostTransparencyCard } from '@/components/landing/cost-transparency-card';
import { Districts } from '@/components/landing/districts';
import { Hero } from '@/components/landing/hero';

import { groupFigureRows } from './building-figures-view';
import { calculatorBaseline } from './calculator-baseline';
import { RENTAL_TYPE_FILTERS, singleNumberFigure, type FigureSummary } from './cost-figures';
import {
  loadAreaReference,
  loadBuildingFigures,
  loadCityFigure,
  loadDistrictFigures,
} from './cost-figures-query';
import { loadFeaturedBuilding, loadHomeCityFigure, loadHomeDistrictFigures } from './home-figures';

const t = createTranslator({ locale: 'en', messages: en as never }) as unknown as (
  key: string,
  values?: Record<string, string | number>,
) => string;
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');
const render = (element: ReactElement) => text(renderToStaticMarkup(element));

/** The chosen group's headline on the reference: what the building page and the bot show. */
function referenceHeadline(summary: FigureSummary) {
  const figure = singleNumberFigure(summary);
  const group = figure ? summary.groups[figure.group] : null;
  return { figure, headline: group ? groupFigureRows(group).headline : null };
}

describe('area figures equal the loadAreaReference headline (FR-34)', () => {
  it.each(RENTAL_TYPE_FILTERS)(
    'every district figure with a district-level reference, under %s',
    async (rentalType) => {
      const districts = await loadDistrictFigures(CITY.id);
      let compared = 0;
      for (const district of DISTRICTS) {
        const reference = await loadAreaReference({
          districtId: district.id,
          cityId: CITY.id,
          rentalType,
        });
        if (reference?.level !== 'district') continue;
        compared += 1;
        const shown = districts.find((d) => d.slug === district.slug)!.figures[rentalType];
        const { figure, headline } = referenceHeadline(reference.summary);
        expect(shown, district.slug).toEqual(figure);
        expect(shown?.value, district.slug).toBe(headline?.figure.median);
        expect(shown?.n, district.slug).toBe(headline?.figure.n);
        expect(shown?.metric, district.slug).toBe(headline?.key);
      }
      // Mokotów and Wola under all and apartment; under room no district reaches 5 reports.
      expect(compared).toBe(rentalType === 'room' ? 0 : 2);
    },
  );

  it.each(RENTAL_TYPE_FILTERS)('the city figure, under %s', async (rentalType) => {
    const reference = await loadAreaReference({ districtId: null, cityId: CITY.id, rentalType });
    expect(reference?.level).toBe('city');
    const { figure, headline } = referenceHeadline(reference!.summary);
    const shown = await loadCityFigure(CITY.id, rentalType);
    expect(shown).toEqual(figure);
    expect(shown?.value).toBe(headline?.figure.median);
    expect(shown?.n).toBe(headline?.figure.n);
  });

  it('picks tenant 3,700 (3) for Mokotów, asking known part 4,000 (5) for Wola, tenant 3,200 (5) for the city', async () => {
    const districts = await loadDistrictFigures(CITY.id);
    const all = (slug: string) => districts.find((d) => d.slug === slug)!.figures.all;
    expect(all('mokotow')).toMatchObject({
      group: 'tenant',
      metric: 'completeTotal',
      value: 3700,
      n: 3,
    });
    expect(all('wola')).toMatchObject({
      group: 'asking',
      metric: 'knownPartTotal',
      value: 4000,
      n: 5,
    });
    expect(all('bemowo')).toBeNull();
    expect(await loadCityFigure(CITY.id)).toMatchObject({
      group: 'tenant',
      metric: 'completeTotal',
      value: 3200,
      n: 5,
    });
  });
});

describe('city hub and district page (D23)', () => {
  it('the hub lists each district with its figure, group label and N, and no all-sources count', async () => {
    const page = render(
      (await CityCostsHub({
        params: Promise.resolve({ locale: 'en', city: 'warsaw' }),
      })) as ReactElement,
    );
    expect(page).toContain('Mokotów Median Monthly Total ≈ 3,700 PLN Tenant reports (3)');
    expect(page).toContain('Wola Known part of the costs ≈ 4,000 PLN Asking prices (5)');
    expect(page).toContain('Ochota Median Monthly Total ≈ 3,100 PLN Tenant reports (2)');
    expect(page).not.toContain('Bemowo');
    // The old rows said "N reports" over all three sources (9 for Mokotów).
    expect(page).not.toMatch(/\d+ reports/);
    // Expenses only beside an all-in total, from the same group.
    expect(page).toContain('Rent ≈ 3,000 · Expenses ≈ 700');
  });

  it('the district page shows the district figure and each building figure, labelled', async () => {
    const page = render(
      (await DistrictCostsPage({
        params: Promise.resolve({ locale: 'en', city: 'warsaw', district: 'mokotow' }),
      })) as ReactElement,
    );
    const reference = await loadAreaReference({ districtId: 'd-mok', cityId: CITY.id });
    const { headline } = referenceHeadline(reference!.summary);
    expect(headline?.figure.median).toBe(3700);

    expect(page).toContain(
      'Median Monthly Total ≈ 3,700 PLN Tenant reports (3) Rent ≈ 3,000 · Expenses ≈ 700',
    );
    expect(page).toContain('2 buildings');
    expect(page).toContain('ul. Puławska 1 Median Monthly Total ≈ 3,700 PLN Tenant reports (3)');
    expect(page).toContain('ul. Puławska 2 Known part of the costs ≈ 5,250 PLN Asking prices (6)');
    expect(page).not.toMatch(/\d+ reports/);
  });
});

describe('calculator baseline (D23, tariffs unchanged)', () => {
  async function baseline() {
    return calculatorBaseline({
      districts: DISTRICTS,
      districtFigures: await loadDistrictFigures(CITY.id),
      cityFigure: await loadCityFigure(CITY.id),
      t,
    });
  }

  it('takes rent and czynsz per m² from the district group, with that group and N', async () => {
    const { districts, cityRentPerM2, cityRentLabel } = await baseline();
    const bySlug = Object.fromEntries(districts.map((d) => [d.slug, d]));
    const figures = await loadDistrictFigures(CITY.id);
    const all = (slug: string) => figures.find((d) => d.slug === slug)!.figures.all!;

    expect(bySlug.mokotow).toMatchObject({
      rentPerM2: all('mokotow').rentPerM2!.value,
      rentLabel: 'Tenant reports (3)',
      // Three czynsz values are below the reliable gate: norms are used.
      czynszPerM2: 0,
      czynszLabel: null,
      reliable: false,
      hasData: true,
    });
    expect(bySlug.wola).toMatchObject({
      rentPerM2: all('wola').rentPerM2!.value,
      rentLabel: 'Asking prices (5)',
      czynszPerM2: 12,
      czynszLabel: 'Asking prices (5)',
      reliable: true,
    });
    expect(bySlug.bemowo).toMatchObject({
      rentPerM2: 0,
      rentLabel: null,
      hasData: false,
      reliable: false,
    });
    const city = await loadCityFigure(CITY.id);
    expect(cityRentPerM2).toBe(city!.rentPerM2!.value);
    expect(cityRentLabel).toBe('Tenant reports (5)');
    expect(districts.map((d) => d.slug)).toEqual(['bemowo', 'mokotow', 'ochota', 'wola']);
  });

  it('renders the rent and czynsz source with the group and N, and the city label on a fallback', async () => {
    const { districts, cityRentPerM2, cityRentLabel } = await baseline();
    const props = {
      citySlug: 'warsaw',
      cityName: 'Warsaw',
      districts,
      cityRentPerM2,
      cityRentLabel,
    };

    const wola = render(createElement(CalculatorClient, { ...props, initialDistrict: 'wola' }));
    expect(wola).toContain('from district data Asking prices (5)');
    expect(wola).toContain('from the czynsz median in this district · Asking prices (5)');

    const bemowo = render(createElement(CalculatorClient, { ...props, initialDistrict: 'bemowo' }));
    expect(bemowo).toContain('from city median · little data in this district Tenant reports (5)');
    expect(bemowo).not.toContain('Asking prices');
  });
});

describe('home page (D23)', () => {
  it('the district cards read loadDistrictFigures and gate on the N shown', async () => {
    const medians = await loadHomeDistrictFigures('warsaw');
    const figures = await loadDistrictFigures(CITY.id);
    expect(medians).toEqual(
      figures.flatMap((d) => (d.figures.all ? [{ slug: d.slug, figure: d.figures.all }] : [])),
    );

    const page = render((await Districts({ medians })) as ReactElement);
    // Wola (N 5) shows its figure; Mokotów (N 3, 9 reports in all) keeps its vibe line.
    expect(page).toMatch(/Wola ≈4\s?000 zł Asking prices \(5\), known part/);
    expect(page).toContain('Mokotów Green parks');
    expect(page).not.toContain('Tenant reports');
  });

  it('the hero tiles use the city figure', async () => {
    const cityFigure = await loadHomeCityFigure('warsaw');
    expect(cityFigure).toEqual(await loadCityFigure(CITY.id));
    const page = render(
      createElement(Hero, { stats: { buildingsWithCosts: 0, cityFigure, deposit: null } }),
    );
    expect(page).toContain(
      `≈${Math.round(cityFigure!.completeTotalPerM2!.value)} zł/m² Warsaw median Tenant reports (${cityFigure!.completeTotalPerM2!.n})`,
    );
    expect(page).toContain(
      `≈${cityFigure!.expenses!.value} zł/mo costs on top of rent Tenant reports (${cityFigure!.expenses!.n})`,
    );
  });

  it('the featured building shows the building page headline and that group only', async () => {
    const featured = await loadFeaturedBuilding(0);
    const summary = await loadBuildingFigures('b-mok-1');
    const { headline } = referenceHeadline(summary);
    expect(featured).toMatchObject({
      address: 'ul. Puławska 1',
      district: 'Mokotów',
      figure: { group: 'tenant', value: headline!.figure.median, n: headline!.figure.n },
      adminFee: summary.groups.tenant!.adminFee.median,
    });

    const card = render(createElement(CostTransparencyCard, { buildingData: featured }));
    expect(card).toContain('Median Monthly Total Tenant reports (3) ~3,700 PLN');
    expect(card).toContain('Rent 3,000 PLN');
    // No electricity, internet or gas in the fixture: unknown, never a sample number.
    expect(card).toContain('Electricity —');
    expect(card).not.toContain('280');
  });

  it('the featured building rotates by day and skips a building without a usable figure', async () => {
    const featured = await loadFeaturedBuilding(3);
    expect(featured?.address).toBe('ul. Grójecka 1');
    expect(featured?.figure).toEqual(singleNumberFigure(await loadBuildingFigures('b-och-1')));
    // Day 4 lands on b-bem-1 (no rent, no total) and moves on to the next building.
    expect((await loadFeaturedBuilding(4))?.address).toBe('ul. Puławska 1');
  });
});
