import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { summarizeFigures, type FigureReport } from '@/lib/cost-figures';
import { ownReportReference, type OwnReportFigures } from '@/lib/own-report-reference';

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

// The real ICU rendering of the chosen locale file, as the page's provider serves it.
const state = vi.hoisted(() => ({ locale: 'en' as 'pl' | 'en' | 'ru' | 'uk' }));
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: () =>
      actual.createTranslator({ locale: state.locale, messages: messages[state.locale] as never }),
  };
});
// The panel's links and share button are not under test; their targets are.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));
vi.mock('./share-button', () => ({
  ShareButton: ({ path }: { path: string }) => createElement('span', { 'data-share': path }),
}));

import { OwnCostsReference } from './own-costs-reference';
import { CostReportsPanel, type ReportComparison } from './cost-reports-panel';

const report = (
  source: string,
  rent: number,
  totalMonthlyAvg: number,
  utilitiesComplete: boolean | null,
): FigureReport => ({
  source,
  rentalType: 'apartment',
  rent,
  totalMonthlyAvg,
  utilitiesComplete,
  areaM2: 50,
});

const district = ownReportReference({
  level: 'district',
  slug: 'mokotow',
  name: 'Mokotów',
  summary: summarizeFigures(
    [4000, 4100, 3900, 4200, 3800, 4050].map((total) => report('user', total - 800, total, true)),
    { level: 'district', rentalType: 'all' },
  ),
});
const city = ownReportReference({
  level: 'city',
  slug: 'warsaw',
  name: 'cities.warsaw',
  summary: summarizeFigures(
    [report('user', 3200, 4000, true), report('import', 3000, 3700, true)],
    { level: 'city', rentalType: 'all' },
  ),
});

const own: OwnReportFigures = { total: 4500, rent: 3600, areaM2: 50, utilitiesComplete: true };

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const render = (props: Parameters<typeof OwnCostsReference>[0]) =>
  text(renderToStaticMarkup(createElement(OwnCostsReference, props)));

// Wording that would state a verdict or a position against the area (FR-29).
const VERDICT =
  /overpay|you save|cheaper|pricier|higher|lower|matches|on par|%|переплач|экономи|дешевле|дороже|выше|ниже|переплачу|економ|дешевше|дорожче|вище|нижче|przepłac|oszczędz|taniej|drożej|wyżej|niżej/i;

beforeEach(() => {
  state.locale = 'en';
});

describe('OwnCostsReference (spec 03 §Comparisons, FR-29)', () => {
  it('sets the own total beside the labelled district reference with each figure’s N', () => {
    const out = render({ own, reference: district, areaName: 'Mokotów' });
    expect(out).toContain('You pay · Reference: tenant reports in Mokotów (6)');
    expect(out).toContain('Monthly total 4,500 PLN ≈ 4,025 PLN · 6 reports');
    expect(out).toContain('Rent per m² 72 zł/m² ≈ 65 zł/m² · 6 reports');
    expect(out).toContain('Total per m² 90 zł/m² ≈ 81 zł/m² · 6 reports');
    expect(out).not.toMatch(VERDICT);
  });

  it('names a city reference by the name the caller resolved, with the group’s own N', () => {
    const out = render({ own, reference: city, areaName: 'Warsaw' });
    expect(out).toContain('Reference: tenant reports in Warsaw (2)');
    expect(out).toContain('≈ 3,850 PLN · 2 reports');
    expect(out).not.toContain('cities.warsaw');
  });

  it('labels an incomplete report as the known part, beside nothing, with the hint', () => {
    const out = render({
      own: { ...own, utilitiesComplete: false },
      reference: district,
      areaName: 'Mokotów',
    });
    expect(out).toContain('Known part of the costs 4,500 PLN');
    expect(out).not.toContain('Monthly total');
    expect(out).not.toContain('4,025');
    expect(out).toContain('Not all utilities were listed, so the full monthly cost may be higher');
  });

  it('shows the own values alone without a reference', () => {
    const out = render({ own, reference: null, areaName: null });
    expect(out).toContain('Monthly total 4,500 PLN');
    expect(out).not.toContain('Reference');
    expect(out).not.toContain('≈');
  });

  it('renders the heading of the post-submit screen per level', async () => {
    state.locale = 'ru';
    const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl');
    const t = createTranslator({ locale: 'ru', messages: messages.ru as never }) as unknown as (
      key: string,
      values?: Record<string, string>,
    ) => string;
    const heading = (level: string) => t('costs.submit.comparisonHeading', { level });
    expect(heading('district')).toBe('Твои расходы и цифры по району');
    expect(heading('city')).toBe('Твои расходы и цифры по городу');

    const out = render({
      own,
      reference: district,
      areaName: 'Mokotów',
      heading: heading('district'),
    });
    expect(out).toContain('Твои расходы и цифры по району');
    expect(out).toContain('Для ориентира: отчёты арендаторов по району Mokotów (6)');
  });

  it.each(LOCALES)('states no verdict and renders every key in %s', (locale) => {
    state.locale = locale;
    for (const reference of [district, city]) {
      const out = render({ own, reference, areaName: 'Mokotów' });
      expect(out).not.toMatch(VERDICT);
      expect(out).not.toMatch(/costs\.|dashboard\./);
    }
    const known = render({
      own: { ...own, utilitiesComplete: false },
      reference: district,
      areaName: 'Mokotów',
    });
    expect(known).not.toMatch(/costs\.|dashboard\./);
  });
});

describe('post-submit heading and removed verdict keys', () => {
  it.each(LOCALES)('%s: the heading follows the level and no verdict key is left', (locale) => {
    const costs = messages[locale].costs as {
      submit: Record<string, string>;
      building: Record<string, string>;
    };
    for (const key of ['comparisonOverpay', 'comparisonSave']) {
      expect(costs.submit).not.toHaveProperty(key);
    }
    for (const key of ['percentHigher', 'percentLower', 'matchesMedian', 'onPar']) {
      expect(costs.building).not.toHaveProperty(key);
    }
    expect(costs.submit.comparisonHeading).toMatch(
      /^\{level, select, district \{.+\} other \{.+\}\}$/,
    );
    expect(costs.submit.comparisonHeading).not.toMatch(/median|медиан|mediana|медіан/i);
  });
});

describe('CostReportsPanel (dashboard)', () => {
  const comparison: ReportComparison = {
    reportId: 'r-1',
    address: 'Puławska 10',
    districtName: 'Mokotów',
    districtSlug: 'mokotow',
    citySlug: 'warsaw',
    buildingSlug: 'pulawska-10',
    createdAt: '2026-11-01T00:00:00.000Z',
    status: 'visible',
    periodicCount: 0,
    own,
    reference: district,
    areaName: 'Mokotów',
  };
  const renderPanel = (reports: ReportComparison[]) =>
    renderToStaticMarkup(createElement(CostReportsPanel, { reports, userId: 'u-1' }));

  it('shows the report beside the area reference, without verdict, percentage or bar', () => {
    const html = renderPanel([comparison]);
    const out = text(html);
    expect(out).toContain('Reference: tenant reports in Mokotów (6)');
    expect(out).toContain('Monthly total 4,500 PLN ≈ 4,025 PLN · 6 reports');
    expect(out).not.toMatch(VERDICT);
    // No position bar markup and no red/green verdict colouring.
    expect(html).not.toMatch(/red-|green-|hsl\(/);
    // The share link carries no percentage or amount.
    expect(html).toContain('data-share="/warsaw/costs/share?d=mokotow"');
  });

  it('labels an incomplete report as the known part rather than a monthly total', () => {
    const out = text(renderPanel([{ ...comparison, own: { ...own, utilitiesComplete: false } }]));
    expect(out).toContain('Known part of the costs 4,500 PLN');
    expect(out).not.toMatch(/4,500 PLN\s*\/\s*mo/);
  });
});
