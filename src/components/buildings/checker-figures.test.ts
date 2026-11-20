import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { summarizeFigures, type AreaReference, type FigureReport } from '@/lib/cost-figures';
import type { LocationCheckerCosts } from '@/lib/location-checker';

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

// The real ICU rendering of the chosen locale file, as the checker's provider serves it.
const state = vi.hoisted(() => ({ locale: 'en' as 'pl' | 'en' | 'ru' | 'uk' }));
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: () =>
      actual.createTranslator({ locale: state.locale, messages: messages[state.locale] as never }),
  };
});

import { CheckerAreaReference, CheckerBuildingFigures } from './checker-figures';

const building = { level: 'building', rentalType: 'all' } as const;
const districtLevel = { level: 'district', rentalType: 'all' } as const;
const cityLevel = { level: 'city', rentalType: 'all' } as const;
const report = (
  source: string,
  rent: number,
  totalMonthlyAvg: number,
  utilitiesComplete: boolean | null,
  fields: Partial<FigureReport> = {},
): FigureReport => ({
  source,
  rentalType: 'apartment',
  rent,
  totalMonthlyAvg,
  utilitiesComplete,
  ...fields,
});

/** Golden example 1 of spec 03: a mixed building. */
const goldenBuilding = summarizeFigures(
  [
    report('user', 3200, 4000, true),
    report('import', 3000, 3700, true),
    report('user', 3400, 3900, false),
    report('scraped', 3500, 4100, false),
    report('scraped', 3300, 3900, false),
  ],
  building,
);

const districtReports = [4000, 4100, 3900, 4200, 3800, 4050].map((total) =>
  report('user', total - 800, total, true),
);
const district: AreaReference = {
  level: 'district',
  slug: 'mokotow',
  name: 'Mokotów',
  summary: summarizeFigures(districtReports, districtLevel),
};
const city: AreaReference = {
  level: 'city',
  slug: 'warsaw',
  // The city's translation key, never shown as it is.
  name: 'cities.warsaw',
  summary: summarizeFigures(
    Array.from({ length: 40 }, () => report('user', 3000, 3800, true)),
    cityLevel,
  ),
};

const deposit = (level: AreaReference['level'], answered: number, gotBack: number) => ({
  level,
  returns: { answered, gotBack, full: 0, medianDeposit: null },
});

function html(element: ReturnType<typeof createElement>, locale: Locale = 'en'): string {
  state.locale = locale;
  // Text only, entities decoded, so assertions read like the page.
  return renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');
}

function buildingFigures(summary = goldenBuilding, locale: Locale = 'en') {
  return html(createElement(CheckerBuildingFigures, { summary }), locale);
}

function areaReference(
  costs: Pick<LocationCheckerCosts, 'reference' | 'deposit'>,
  locale: Locale = 'en',
  cityName = 'Warsaw',
) {
  return html(createElement(CheckerAreaReference, { costs, cityName }), locale);
}

const n = (value: number) => value.toLocaleString();
const VERDICT =
  /cheaper|pricier|below|above|overpay|save|%|дешевле|дороже|taniej|drożej|дешевше|дорожче/i;

describe('CheckerBuildingFigures', () => {
  beforeEach(() => {
    state.locale = 'en';
  });

  it('shows the source line and both groups with their own N (golden example 1)', () => {
    const text = buildingFigures();
    expect(text).toContain('3 reports from tenants (1 entered by Passflat)');
    expect(text).toContain('2 asking prices from listings');

    // Tenant group first: complete total 3,850 (2), known part 3,900 (1), rent 3,200 (3),
    // expenses 750 (2); then asking prices: known part 4,000 (2 listings), rent 3,400 (2).
    const tenantAt = text.indexOf('Reports from tenants');
    const askingAt = text.indexOf('Asking prices from listings');
    expect(tenantAt).toBeGreaterThanOrEqual(0);
    expect(askingAt).toBeGreaterThan(tenantAt);
    const tenant = text.slice(tenantAt, askingAt);
    const asking = text.slice(askingAt);
    expect(tenant).toContain(`≈ ${n(3850)} PLN 2 reports`);
    expect(tenant).toContain(`Known part of the costs ≈ ${n(3900)} PLN 1 report`);
    expect(tenant).toContain(`Rent ≈ ${n(3200)} PLN 3 reports`);
    expect(tenant).toContain(`Expenses ≈ ${n(750)} PLN 2 reports`);
    expect(asking).toContain(`≈ ${n(4000)} PLN 2 listings`);
    expect(asking).toContain(`Rent ≈ ${n(3400)} PLN 2 listings`);
  });

  it('labels a known part as such and never as the monthly cost', () => {
    const text = buildingFigures();
    expect(text).toContain('Known part of the costs');
    expect(text).toContain('Not all utilities were listed, so the full monthly cost may be higher');
    const unknownOnly = summarizeFigures([report('user', 2800, 3100, false)], building);
    const one = buildingFigures(unknownOnly);
    expect(one).toContain(`Known part of the costs ${n(3100)} PLN`);
    expect(one).not.toContain('Monthly Total');
  });

  it('shows one observation as its values and characteristics, without ≈ or N', () => {
    const single = summarizeFigures(
      [report('user', 3200, 4000, true, { rooms: 2, areaM2: 52 })],
      building,
    );
    const text = buildingFigures(single);
    expect(text).toContain('One observation at this address');
    expect(text).toContain('Whole apartment · Rooms: 2 · Area ≈ 50 m²');
    // Below the source line ("1 report from tenants"): a value, no N, no median.
    const card = text.slice(text.indexOf('Reports from tenants'));
    expect(card).toContain(`${n(4000)} PLN`);
    expect(card).toContain(`Monthly total ${n(4000)} PLN Rent ${n(3200)} PLN`);
    // The only "≈" is the rounded area, never in front of a value.
    expect(card).not.toMatch(/≈ [\d\s.,]+(PLN|zł)/);
    expect(card).not.toMatch(/\d+ reports?/);
    expect(card).not.toMatch(/median|typical/i);
  });

  it('draws no cheaper/pricier conclusion in any locale', () => {
    for (const locale of LOCALES) {
      expect(buildingFigures(goldenBuilding, locale)).not.toMatch(VERDICT);
    }
  });

  it('renders nothing for a building without reports', () => {
    expect(buildingFigures(summarizeFigures([], building)).trim()).toBe('');
  });
});

describe('CheckerAreaReference', () => {
  it('labels the district reference with its level, group and N and shows its deposit statistic', () => {
    const text = areaReference({ reference: district, deposit: deposit('district', 3, 2) });
    expect(text).toContain('These figures are for the district, not for this building.');
    expect(text).toContain('Reference: tenant reports in Mokotów (6)');
    expect(text).toContain(`≈ ${n(4025)} PLN 6 reports`);
    expect(text).toContain(
      'In the Mokotów district, 2 of 3 who answered got the deposit back, fully or partly',
    );
    expect(text).not.toMatch(VERDICT);
  });

  it('names the city in the visitor’s locale, never by its translation key', () => {
    const text = areaReference({ reference: city, deposit: deposit('city', 12, 9) });
    expect(text).toContain('These figures are for the city, not for this building.');
    expect(text).toContain('Reference: tenant reports in Warsaw (40)');
    expect(text).toContain('In Warsaw, 9 of 12 who answered got the deposit back, fully or partly');
    expect(text).not.toContain('cities.warsaw');

    const ru = areaReference({ reference: city, deposit: deposit('city', 12, 9) }, 'ru', 'Варшава');
    expect(ru).toContain('Для ориентира: отчёты арендаторов по городу Варшава (40)');
    expect(ru).toContain(
      'По городу Варшава: 9 из 12 ответивших получили залог обратно — полностью или частично',
    );
  });

  it('withholds the deposit statistic below three answers', () => {
    const two = areaReference({ reference: district, deposit: deposit('district', 2, 2) });
    expect(two).toContain('Reference: tenant reports in Mokotów (6)');
    expect(two).not.toMatch(/deposit/i);
    const none = areaReference({ reference: district, deposit: null });
    expect(none).not.toMatch(/deposit/i);
  });

  it('renders the district deposit line in every locale with the area name', () => {
    // A district's name is its stored display name, the same in every locale.
    const expected: Record<Locale, string> = {
      en: 'In the Mokotów district, 2 of 3 who answered',
      ru: 'По району Mokotów: 2 из 3 ответивших',
      pl: 'W dzielnicy Mokotów: 2 z 3 osób, które odpowiedziały',
      uk: 'У районі Mokotów: 2 з 3 тих, хто відповів',
    };
    for (const locale of LOCALES) {
      const text = areaReference(
        { reference: district, deposit: deposit('district', 3, 2) },
        locale,
      );
      expect(text).toContain(expected[locale]);
      expect(text).not.toMatch(VERDICT);
    }
  });

  it('renders nothing without a reference', () => {
    expect(areaReference({ reference: null, deposit: null }).trim()).toBe('');
  });
});

describe('CheckerAreaReference: a group of one report', () => {
  // A district reference is chosen by MIN_AREA_REPORTS over both groups: 1 tenant report +
  // 4 asking prices qualifies, so its tenant group is one observation. A city can rest on one.
  const thinDistrict: AreaReference = {
    level: 'district',
    slug: 'mokotow',
    name: 'Mokotów',
    summary: summarizeFigures(
      [
        report('user', 3200, 4000, true, { rooms: 2, areaM2: 52 }),
        ...[4100, 3900, 4200, 3800].map((total) => report('scraped', total - 800, total, false)),
      ],
      districtLevel,
    ),
  };
  const thinCity: AreaReference = {
    level: 'city',
    slug: 'warsaw',
    name: 'cities.warsaw',
    summary: summarizeFigures([report('user', 3000, 3800, true)], cityLevel),
  };
  const buildingWording = (locale: Locale) =>
    (messages[locale].costs as { building: { figures: { oneObservation: string } } }).building
      .figures.oneObservation;
  const cityNames: Record<Locale, string> = {
    en: 'Warsaw',
    pl: 'Warszawa',
    ru: 'Варшава',
    uk: 'Варшава',
  };
  const expected: Record<Locale, { district: string; city: string }> = {
    en: { district: 'One observation in the Mokotów district', city: 'One observation in Warsaw' },
    pl: {
      district: 'Jedna obserwacja w dzielnicy Mokotów',
      city: 'Jedna obserwacja w mieście Warszawa',
    },
    ru: {
      district: 'Одно наблюдение по району Mokotów',
      city: 'Одно наблюдение по городу Варшава',
    },
    uk: {
      district: 'Одне спостереження у районі Mokotów',
      city: 'Одне спостереження у місті Варшава',
    },
  };

  it('names the district, never "at this address", in every locale', () => {
    expect(thinDistrict.summary.groups.tenant?.reportCount).toBe(1);
    for (const locale of LOCALES) {
      const text = areaReference({ reference: thinDistrict, deposit: null }, locale);
      expect(text, locale).toContain(expected[locale].district);
      expect(text, locale).not.toContain(buildingWording(locale));
    }
    const en = areaReference({ reference: thinDistrict, deposit: null });
    expect(en).toContain('Reference: tenant reports in Mokotów (1)');
    expect(en).not.toContain('at this address');
    // The one observation's values and characteristics, without "≈" or N.
    const tenant = en.slice(
      en.indexOf('Reference: tenant reports'),
      en.indexOf('Reference: asking prices'),
    );
    expect(tenant).toContain('Whole apartment · Rooms: 2 · Area ≈ 50 m²');
    expect(tenant).toContain(`Monthly total ${n(4000)} PLN`);
    expect(tenant).not.toMatch(/≈ [\d\s.,]+PLN/);
    // The asking-price group keeps its median and N.
    const asking = en.slice(en.indexOf('Reference: asking prices'));
    expect(asking).toContain('Reference: asking prices from listings in Mokotów (4)');
    expect(asking).toContain('4 listings');
    expect(asking).not.toContain('One observation');
  });

  it('names the city in the visitor’s locale, never "at this address"', () => {
    for (const locale of LOCALES) {
      const text = areaReference({ reference: thinCity, deposit: null }, locale, cityNames[locale]);
      expect(text, locale).toContain(expected[locale].city);
      expect(text, locale).not.toContain(buildingWording(locale));
      expect(text, locale).not.toContain('cities.warsaw');
    }
    const en = areaReference({ reference: thinCity, deposit: null });
    expect(en).toContain('Reference: tenant reports in Warsaw (1)');
    expect(en).not.toContain('at this address');
  });

  it('keeps the building wording for the building’s own one observation', () => {
    const single = summarizeFigures([report('user', 3200, 4000, true)], building);
    for (const locale of LOCALES) {
      const text = buildingFigures(single, locale);
      expect(text, locale).toContain(buildingWording(locale));
      expect(text, locale).not.toContain(expected[locale].district);
    }
    expect(buildingFigures(single)).toContain('One observation at this address');
  });
});

describe('checker copy', () => {
  it('no longer carries the district verdict keys', () => {
    for (const locale of LOCALES) {
      const costs = (messages[locale].checker as Record<string, Record<string, unknown>>).costs;
      for (const key of [
        'cheaperThanDistrict',
        'pricierThanDistrict',
        'depositReturned',
        'month',
        'rent',
        'expenses',
        'sourceTenant',
        'sourceMixed',
        'sourceScraped',
      ]) {
        expect(costs[key], `${locale}: checker.costs.${key}`).toBeUndefined();
      }
    }
  });

  it('renders the new deposit key in every locale', () => {
    for (const locale of LOCALES) {
      const t = createTranslator({ locale, messages: messages[locale] as never }) as unknown as (
        key: string,
        values: Record<string, string | number>,
      ) => string;
      for (const level of ['district', 'city']) {
        const text = t('costs.building.figures.depositReturnedArea', {
          level,
          area: 'X-area',
          gotBack: 2,
          answered: 3,
        });
        expect(text).toContain('X-area');
        expect(text).toContain('2');
        expect(text).toContain('3');
      }
    }
  });
});
