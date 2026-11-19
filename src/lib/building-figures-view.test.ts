import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { summarizeFigures, type FigureReport } from './cost-figures';
import {
  breakdownHasFigures,
  breakdownNotes,
  breakdownRows,
  buildingFiguresFallback,
  characteristicMessages,
  comparableTenantGroup,
  comparisonRows,
  FIGURE_GROUP_N_KEY,
  FIGURE_GROUP_RECORDED_KEY,
  FIGURE_GROUP_TITLE_KEY,
  GROUP_FIGURE_LABEL_KEY,
  groupDateMessages,
  groupFigureRows,
  isOneObservation,
  KNOWN_PART_HINT_KEY,
  NO_AREA_DATA_KEY,
  NO_BUILDING_DATA_KEY,
  ONE_OBSERVATION_KEY,
  orderedFigureGroups,
  referenceGroupLabel,
  referenceHintMessage,
  SAMPLE_SIZE_BADGE_MIN,
  sampleSizeBadge,
  sourceLineMessages,
  tenancyMessage,
  type FigureMessage,
} from './building-figures-view';

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as Record<string, unknown>,
  ]),
);

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** The real ICU rendering of a locale file, keyed by plain strings. */
function translator(locale: (typeof LOCALES)[number]): Translate {
  return createTranslator({ locale, messages: messages[locale] as never }) as unknown as Translate;
}

function lookup(tree: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    return node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
  }, tree);
}

const building = { level: 'building', rentalType: 'all' } as const;
const complete = (source: string, fields: Partial<FigureReport> = {}): FigureReport => ({
  source,
  utilitiesComplete: true,
  ...fields,
});
const incomplete = (source: string, fields: Partial<FigureReport> = {}): FigureReport => ({
  source,
  utilitiesComplete: false,
  ...fields,
});

/** Golden example 1 of spec 03. */
const mixedBuilding = summarizeFigures(
  [
    complete('user', { rentalType: 'apartment', rent: 3200, totalMonthlyAvg: 4000 }),
    complete('import', { rentalType: 'apartment', rent: 3000, totalMonthlyAvg: 3700 }),
    incomplete('user', { rentalType: 'apartment', rent: 3400, totalMonthlyAvg: 3900 }),
    incomplete('scraped', { rentalType: 'apartment', rent: 3500, totalMonthlyAvg: 4100 }),
    incomplete('scraped', { rentalType: 'apartment', rent: 3300, totalMonthlyAvg: 3900 }),
  ],
  building,
);

const summaryOf = (sources: string[]) =>
  summarizeFigures(
    sources.map((source) => complete(source, { rent: 3000, totalMonthlyAvg: 3800 })),
    building,
  );

const render = (locale: (typeof LOCALES)[number], messageList: FigureMessage[]) =>
  messageList.map((message) => translator(locale)(message.key, message.values));

/** Golden example 2 of spec 03: one observation, and the same with a second report. */
const oneReport = complete('user', {
  rentalType: 'apartment',
  rooms: 2,
  areaM2: 52,
  rent: 3200,
  totalMonthlyAvg: 4000,
});
const oneObservation = summarizeFigures([oneReport], building);
const twoObservations = summarizeFigures(
  [oneReport, incomplete('user', { totalMonthlyAvg: 4200 })],
  building,
);

/** Golden example 9 of spec 03: dates. */
const datedReport = complete('user', {
  createdAt: '2026-03-10',
  confirmedAt: '2026-09-01',
  livedFrom: '2025-01-01',
  livedUntil: '2026-06-30',
});
const undatedReport = complete('user', { createdAt: '2026-05-02' });
const monthIn = (locale: typeof enUS) => (month: Date) => format(month, 'LLLL yyyy', { locale });

describe('sourceLineMessages', () => {
  it('renders the spec line for a mixed building, tenant reports first', () => {
    const t = translator('en');
    expect(
      sourceLineMessages(mixedBuilding)
        .map((message) => t(message.key, message.values))
        .join(' · '),
    ).toBe('3 reports from tenants (1 entered by Passflat) · 2 asking prices from listings');
  });

  it('shows per-source counts only when the tenant group has both user and import', () => {
    expect(sourceLineMessages(summaryOf(['user', 'user']))).toEqual([
      { key: 'costs.building.figures.sourceTenant', values: { count: 2 } },
    ]);
    expect(sourceLineMessages(summaryOf(['import']))).toEqual([
      { key: 'costs.building.figures.sourceImported', values: { count: 1 } },
    ]);
    expect(sourceLineMessages(summaryOf(['user', 'import', 'import']))).toEqual([
      { key: 'costs.building.figures.sourceTenantWithImported', values: { count: 3, imported: 2 } },
    ]);
  });

  it('never calls asking prices tenant reports', () => {
    const t = translator('en');
    const line = sourceLineMessages(summaryOf(['scraped', 'scraped']));
    expect(line).toEqual([{ key: 'costs.building.figures.sourceAsking', values: { count: 2 } }]);
    expect(t(line[0].key, line[0].values)).toBe('2 asking prices from listings');
  });

  it('is empty without reports', () => {
    expect(sourceLineMessages(summaryOf([]))).toEqual([]);
  });

  it('renders in every locale with Slavic plural forms', () => {
    const line = sourceLineMessages(mixedBuilding);
    const render = (locale: (typeof LOCALES)[number]) =>
      line.map((message) => translator(locale)(message.key, message.values)).join(' · ');
    expect(render('ru')).toBe(
      '3 отчёта арендаторов (из них внесено Passflat: 1) · 2 цены из объявлений',
    );
    expect(render('pl')).toBe(
      '3 raporty od najemców (w tym wprowadzone przez Passflat: 1) · 2 ceny ofertowe z ogłoszeń',
    );
    expect(render('uk')).toBe('3 звіти орендарів (з них внесено Passflat: 1) · 2 ціни з оголошень');
  });
});

describe('orderedFigureGroups', () => {
  it('puts the tenant group first and keeps the asking group apart', () => {
    expect(orderedFigureGroups(mixedBuilding).map((group) => group.key)).toEqual([
      'tenant',
      'asking',
    ]);
  });

  it('leaves out a group without reports', () => {
    expect(orderedFigureGroups(summaryOf(['scraped'])).map((group) => group.key)).toEqual([
      'asking',
    ]);
    expect(orderedFigureGroups(summaryOf([]))).toEqual([]);
  });
});

describe('groupFigureRows', () => {
  it('gives each group its own figures and N (golden example 1)', () => {
    const tenant = groupFigureRows(mixedBuilding.groups.tenant!);
    expect(tenant.headline).toEqual({
      key: 'completeTotal',
      figure: expect.objectContaining({ median: 3850, n: 2 }),
      labelKey: 'costs.building.medianMonthlyTotal',
    });
    // "3 reports, all-in total from 2": the known part stays visible with its own N.
    expect(tenant.rows).toEqual([
      {
        key: 'knownPartTotal',
        figure: expect.objectContaining({ median: 3900, n: 1 }),
        labelKey: 'costs.building.figures.knownPart',
      },
      {
        key: 'rent',
        figure: expect.objectContaining({ median: 3200, n: 3 }),
        labelKey: 'costs.building.rent',
      },
      {
        key: 'expenses',
        figure: expect.objectContaining({ median: 750, n: 2 }),
        labelKey: 'costs.building.expenses',
      },
    ]);
    expect(tenant.knownPart).toBe(true);

    // Asking prices have no complete total: the known part leads, never as the monthly cost.
    const asking = groupFigureRows(mixedBuilding.groups.asking!);
    expect(asking.headline).toEqual({
      key: 'knownPartTotal',
      figure: expect.objectContaining({ median: 4000, n: 2 }),
      labelKey: 'costs.building.figures.knownPart',
    });
    expect(asking.rows.map((row) => [row.key, row.figure.median, row.figure.n])).toEqual([
      ['rent', 3400, 2],
    ]);
  });

  it('labels one observation as a value, not a typical total (golden example 2)', () => {
    const one = groupFigureRows(oneObservation.groups.tenant!);
    expect(one.headline).toEqual({
      key: 'completeTotal',
      figure: expect.objectContaining({ median: 4000, n: 1 }),
      labelKey: 'costs.compare.colTotal',
    });
    expect(one.rows.map((row) => [row.key, row.figure.median])).toEqual([
      ['rent', 3200],
      ['expenses', 800],
      ['completeTotalPerM2', 77],
    ]);
    expect(one.knownPart).toBe(false);
    expect(translator('ru')(one.headline!.labelKey)).toBe('Всего в месяц');

    // A second report makes the group several: the typical label, a complete total from 1.
    const several = groupFigureRows(twoObservations.groups.tenant!);
    expect(several.headline).toMatchObject({
      key: 'completeTotal',
      figure: { median: 4000, n: 1 },
      labelKey: 'costs.building.medianMonthlyTotal',
    });
    expect(several.rows[0]).toMatchObject({
      key: 'knownPartTotal',
      figure: { median: 4200, n: 1 },
    });
  });

  it('leads with the known part when utilities are not established (golden example 3)', () => {
    const summary = summarizeFigures(
      [incomplete('user', { rent: 2800, totalMonthlyAvg: 3100 })],
      building,
    );
    const card = groupFigureRows(summary.groups.tenant!);
    expect(card.headline).toMatchObject({
      key: 'knownPartTotal',
      figure: { median: 3100, n: 1 },
      labelKey: 'costs.building.figures.knownPart',
    });
    expect(card.rows.map((row) => row.key)).toEqual(['rent']);
    expect(card.knownPart).toBe(true);
    expect(translator('en')(card.headline!.labelKey)).toBe('Known part of the costs');
    expect(translator('en')(KNOWN_PART_HINT_KEY)).toBe(
      'Not all utilities were listed, so the full monthly cost may be higher',
    );
  });

  it('treats a legacy report as a known part (golden example 4)', () => {
    const summary = summarizeFigures(
      [{ source: 'user', totalMonthlyAvg: 3600, utilitiesComplete: null }],
      building,
    );
    const card = groupFigureRows(summary.groups.tenant!);
    expect(card.headline).toMatchObject({ key: 'knownPartTotal', figure: { median: 3600, n: 1 } });
    expect(card.rows).toEqual([]);
  });

  it('never labels a known part with a monthly-cost label in any locale', () => {
    for (const locale of LOCALES) {
      const label = translator(locale)(GROUP_FIGURE_LABEL_KEY.knownPartTotal);
      const monthly = translator(locale)(GROUP_FIGURE_LABEL_KEY.completeTotal);
      expect(label).not.toBe(monthly);
    }
    expect(render('ru', [{ key: GROUP_FIGURE_LABEL_KEY.knownPartTotal, values: {} }])).toEqual([
      'Известная часть расходов',
    ]);
  });

  it('adds the per-m² total when reports carry an area', () => {
    const summary = summarizeFigures(
      [
        complete('user', { rent: 3000, totalMonthlyAvg: 4000, areaM2: 50 }),
        complete('user', { rent: 3000, totalMonthlyAvg: 4000, areaM2: 50 }),
      ],
      building,
    );
    expect(groupFigureRows(summary.groups.tenant!).rows.map((row) => row.key)).toEqual([
      'rent',
      'expenses',
      'completeTotalPerM2',
    ]);
  });

  it('has no headline when the group has no total and no rent', () => {
    const summary = summarizeFigures([complete('user', { adminFee: 600 })], building);
    expect(groupFigureRows(summary.groups.tenant!)).toEqual({
      headline: null,
      rows: [],
      knownPart: false,
    });
  });
});

describe('one observation', () => {
  it('reads «Одно наблюдение по этому адресу» with its characteristics (golden example 2)', () => {
    const tenant = oneObservation.groups.tenant!;
    expect(isOneObservation(tenant)).toBe(true);
    expect(translator('ru')(ONE_OBSERVATION_KEY)).toBe('Одно наблюдение по этому адресу');
    expect(translator('en')(ONE_OBSERVATION_KEY)).toBe('One observation at this address');
    // Area rounded to 5 m² by the contract.
    expect(render('en', characteristicMessages(tenant))).toEqual([
      'Whole apartment',
      'Rooms: 2',
      'Area ≈ 50 m²',
    ]);
    expect(render('ru', characteristicMessages(tenant))).toEqual([
      'Вся квартира',
      'Комнат: 2',
      'Площадь ≈ 50 м²',
    ]);
  });

  it('is never compared, and has no characteristics once a second report arrives', () => {
    expect(comparableTenantGroup(oneObservation)).toBeNull();
    const several = twoObservations.groups.tenant!;
    expect(isOneObservation(several)).toBe(false);
    expect(characteristicMessages(several)).toEqual([]);
    expect(comparableTenantGroup(twoObservations)).toBe(several);
  });

  it('shows only the characteristics the report has', () => {
    const summary = summarizeFigures(
      [complete('scraped', { rentalType: 'room', rent: 1800 })],
      building,
    );
    expect(characteristicMessages(summary.groups.asking!)).toEqual([
      { key: 'costs.submit.room', values: {} },
    ]);
    expect(comparableTenantGroup(summary)).toBeNull();
  });
});

describe('breakdownRows', () => {
  it('keeps rent and the admin fee public and the utilities behind the gate', () => {
    const summary = summarizeFigures(
      [
        complete('user', { rent: 3000, adminFee: 600, electricityAvg: 150, water: 80 }),
        complete('user', { rent: 3200, adminFee: 650, electricityIncluded: true }),
      ],
      building,
    );
    const { basic, detail } = breakdownRows(summary.groups.tenant!);
    expect(basic.map((row) => [row.key, row.state, row.n])).toEqual([
      ['rent', 'value', 2],
      ['adminFee', 'value', 2],
    ]);
    expect(detail.map((row) => [row.key, row.state, row.n])).toEqual([
      ['electricity', 'value', 1],
      ['gas', 'unknown', 2],
      ['heating', 'unknown', 2],
      ['water', 'value', 1],
      ['internet', 'unknown', 2],
      ['other', 'unknown', 2],
    ]);
    // The electricity value comes with the report that said "included in rent".
    expect(render('en', breakdownNotes(detail[0]))).toEqual(['included in rent: 1']);
    expect(render('en', breakdownNotes(detail[3]))).toEqual(['unknown: 1']);
  });

  it('tells a confirmed zero, included in rent and unknown apart (golden example 5)', () => {
    const summary = summarizeFigures(
      [
        complete('user', { internet: 0 }),
        complete('user', { internet: null }),
        complete('user', { internetIncluded: true }),
      ],
      building,
    );
    const internet = breakdownRows(summary.groups.tenant!).detail.find(
      (row) => row.key === 'internet',
    )!;
    expect(internet).toEqual({
      key: 'internet',
      state: 'zero',
      figure: expect.objectContaining({ median: 0, n: 1 }),
      n: 1,
      includedCount: 1,
      unknownCount: 1,
    });
    expect(render('en', breakdownNotes(internet))).toEqual(['included in rent: 1', 'unknown: 1']);
  });

  it('says "included in rent" when no report gave an amount but some said it is included', () => {
    const summary = summarizeFigures(
      [
        complete('user', { heatingIncluded: true }),
        complete('user', { heatingIncluded: true }),
        complete('user', {}),
      ],
      building,
    );
    const heating = breakdownRows(summary.groups.tenant!).detail.find(
      (row) => row.key === 'heating',
    )!;
    expect(heating).toMatchObject({ state: 'included', n: 2, includedCount: 2, unknownCount: 1 });
    expect(render('en', breakdownNotes(heating))).toEqual(['unknown: 1']);
    expect(translator('ru')('costs.building.figures.valueIncluded')).toBe('Включено в аренду');
  });

  it('says "unknown" for a metric no report answered (golden example 3)', () => {
    const summary = summarizeFigures(
      [incomplete('user', { rent: 2800, totalMonthlyAvg: 3100 })],
      building,
    );
    const { basic, detail } = breakdownRows(summary.groups.tenant!);
    expect(basic.map((row) => [row.key, row.state, row.n])).toEqual([
      ['rent', 'value', 1],
      ['adminFee', 'unknown', 1],
    ]);
    expect(detail.every((row) => row.state === 'unknown' && row.n === 1)).toBe(true);
    expect(breakdownNotes(detail[0])).toEqual([]);
    expect(breakdownHasFigures(detail)).toBe(false);
    expect(translator('en')('costs.building.figures.valueUnknown')).toBe('Unknown');
  });

  it('builds the asking group from asking prices only, with the N of listings', () => {
    const { basic, detail } = breakdownRows(mixedBuilding.groups.asking!);
    expect(basic[0]).toMatchObject({ key: 'rent', state: 'value', figure: { median: 3400 }, n: 2 });
    expect(detail.every((row) => row.state === 'unknown' && row.n === 2)).toBe(true);
  });

  it('counts figures only where a row says more than unknown', () => {
    expect(breakdownHasFigures([{ state: 'unknown' }, { state: 'included' }])).toBe(true);
    expect(breakdownHasFigures([{ state: 'unknown' }, { state: 'zero' }])).toBe(true);
    expect(breakdownHasFigures([])).toBe(false);
  });
});

describe('dates', () => {
  it('shows when the last report was added or confirmed, as month and year (golden example 9)', () => {
    const summary = summarizeFigures([datedReport, undatedReport], building);
    const tenant = summary.groups.tenant!;
    expect(render('en', groupDateMessages(tenant, monthIn(enUS)))).toEqual([
      'Last report added or confirmed: September 2026',
      'Period of these costs: 2025–2026',
    ]);
    expect(render('ru', groupDateMessages(tenant, monthIn(ru)))).toEqual([
      'Последний отчёт добавлен или подтверждён: сентябрь 2026',
      'Период этих расходов: 2025–2026',
    ]);
  });

  it('says the period is not known when no report has tenancy dates (golden example 9)', () => {
    const tenant = summarizeFigures([undatedReport], building).groups.tenant!;
    expect(render('en', groupDateMessages(tenant, monthIn(enUS)))).toEqual([
      'Last report added or confirmed: May 2026',
      'The period these costs were paid is not known',
    ]);
    expect(render('ru', [tenancyMessage(null)])).toEqual([
      'Неизвестно, за какой период платились эти расходы',
    ]);
  });

  it('shows a current tenancy as running to now', () => {
    const tenant = summarizeFigures(
      [complete('user', { livedFrom: '2025-04-01', isCurrentTenant: true })],
      building,
    ).groups.tenant!;
    expect(render('en', [tenancyMessage(tenant.tenancy)])).toEqual([
      'Period of these costs: 2025 to now',
    ]);
  });

  it('covers a single year and a missing end or start', () => {
    expect(render('en', [tenancyMessage({ from: '2026', to: '2026' })])).toEqual([
      'Period of these costs: 2026',
    ]);
    expect(render('en', [tenancyMessage({ from: '2024', to: null })])).toEqual([
      'Period of these costs: from 2024',
    ]);
    expect(render('en', [tenancyMessage({ from: null, to: '2025' })])).toEqual([
      'Period of these costs: until 2025',
    ]);
    expect(render('en', [tenancyMessage({ from: null, to: 'now' })])).toEqual([
      'Period of these costs: up to now',
    ]);
  });

  it('gives asking prices the date they were added and no paid period', () => {
    const asking = summarizeFigures(
      [complete('scraped', { rent: 3000, createdAt: '2026-10-15' })],
      building,
    ).groups.asking!;
    expect(render('en', groupDateMessages(asking, monthIn(enUS)))).toEqual([
      'Last asking price added: October 2026',
    ]);
  });

  it('shows no recorded date when the group has none', () => {
    const tenant = summarizeFigures([complete('user', {})], building).groups.tenant!;
    expect(groupDateMessages(tenant, monthIn(enUS)).map((message) => message.key)).toEqual([
      'costs.building.figures.tenancyUnknown',
    ]);
  });
});

/** A loader's area reference over the given reports (district or city). */
const referenceOf = (level: 'district' | 'city', reports: FigureReport[], areaName: string) => ({
  level,
  areaName,
  summary: summarizeFigures(reports, { level, rentalType: 'all' }),
});

describe('buildingFiguresFallback (FR-33)', () => {
  const district = referenceOf(
    'district',
    [
      complete('user', { rent: 3500, totalMonthlyAvg: 3900 }),
      complete('user', { rent: 3300, totalMonthlyAvg: 3800 }),
      complete('import', { rent: 3100, totalMonthlyAvg: 3600 }),
      incomplete('scraped', { rent: 3600, totalMonthlyAvg: 4000 }),
      incomplete('scraped', { rent: 3400, totalMonthlyAvg: 3800 }),
    ],
    'Mokotów',
  );
  const city = referenceOf(
    'city',
    [complete('user', { rent: 3000, totalMonthlyAvg: 3600 })],
    'Warszawa',
  );
  const empty = summarizeFigures([], building);

  it('shows the building figures when the building has a report, whatever the reference', () => {
    expect(buildingFiguresFallback(mixedBuilding, district)).toEqual({ state: 'building' });
    expect(buildingFiguresFallback(mixedBuilding, null)).toEqual({ state: 'building' });
  });

  it('falls back to a district reference', () => {
    const fallback = buildingFiguresFallback(empty, district);
    expect(fallback).toEqual({ state: 'reference', reference: district });
  });

  it('falls back to a city reference', () => {
    const fallback = buildingFiguresFallback(empty, city);
    expect(fallback.state).toBe('reference');
    expect(fallback.state === 'reference' && fallback.reference.level).toBe('city');
  });

  it('has nothing without a reference or with an empty one', () => {
    expect(buildingFiguresFallback(empty, null)).toEqual({ state: 'none' });
    expect(buildingFiguresFallback(empty, referenceOf('city', [], 'Warszawa'))).toEqual({
      state: 'none',
    });
  });

  it('labels each reference group with its level, group and N, never as the building', () => {
    const en = translator('en');
    const ru = translator('ru');
    const [tenant, asking] = orderedFigureGroups(district.summary);
    const render = (t: Translate, message: FigureMessage) => t(message.key, message.values);

    expect(render(en, referenceGroupLabel('district', tenant, 'Mokotów'))).toBe(
      'Reference: tenant reports in Mokotów (3)',
    );
    expect(render(en, referenceGroupLabel('district', asking, 'Mokotów'))).toBe(
      'Reference: asking prices from listings in Mokotów (2)',
    );
    const [cityTenant] = orderedFigureGroups(city.summary);
    expect(render(en, referenceGroupLabel('city', cityTenant, 'Warsaw'))).toBe(
      'Reference: tenant reports in Warsaw (1)',
    );
    expect(render(ru, referenceGroupLabel('district', tenant, 'Мокотув'))).toBe(
      'Для ориентира: отчёты арендаторов по району Мокотув (3)',
    );
    expect(render(ru, referenceGroupLabel('city', cityTenant, 'Варшава'))).toBe(
      'Для ориентира: отчёты арендаторов по городу Варшава (1)',
    );
    expect(render(en, referenceHintMessage('district'))).toBe(
      'These figures are for the district, not for this building.',
    );
    expect(render(en, referenceHintMessage('city'))).toBe(
      'These figures are for the city, not for this building.',
    );
    for (const locale of LOCALES) {
      const t = translator(locale);
      for (const level of ['district', 'city'] as const) {
        for (const group of [tenant, asking]) {
          expect(render(t, referenceGroupLabel(level, group, 'X'))).toContain('X');
        }
        expect(render(t, referenceHintMessage(level))).not.toBe('');
      }
    }
  });

  it('gives the no-data lines (RU as given)', () => {
    expect(translator('ru')(NO_BUILDING_DATA_KEY)).toBe('По дому данных нет');
    expect(translator('en')(NO_BUILDING_DATA_KEY)).toBe('No data for this building');
    expect(translator('en')(NO_AREA_DATA_KEY)).toBe('No figures for this area yet');
  });
});

describe('sampleSizeBadge (FR-31)', () => {
  it('states the sample size, neutrally, from the threshold on', () => {
    expect(SAMPLE_SIZE_BADGE_MIN).toBe(5);
    const badge = sampleSizeBadge(7)!;
    expect(translator('en')(badge.key, badge.values)).toBe('5+ observations');
    expect(translator('ru')(badge.key, badge.values)).toBe('5+ наблюдений');
    expect(sampleSizeBadge(5)!.key).toBe('costs.trust.sampleSize');
  });

  it('keeps "early data" below the threshold and shows nothing without reports', () => {
    const badge = sampleSizeBadge(2)!;
    expect(translator('en')(badge.key, badge.values)).toBe('Early data · 2 reports');
    expect(sampleSizeBadge(0)).toBeNull();
  });

  it.each(LOCALES)('never claims reliability or verification in %s', (locale) => {
    const t = translator(locale);
    const texts = [sampleSizeBadge(5)!, sampleSizeBadge(1)!].map((badge) =>
      t(badge.key, badge.values),
    );
    texts.push(t('costs.building.whiteSpotDesc', { count: 2 }));
    expect(lookup(messages[locale], 'costs.trust.reliable')).toBeUndefined();
    for (const text of texts) {
      expect(text).not.toMatch(
        /reliab|verif|popular|wiarygod|zweryfik|popularn|надёжн|надежн|провер|популяр|надійн|перевір/i,
      );
    }
  });
});

describe('comparisonRows (FR-29)', () => {
  const district = (reports: FigureReport[], rentalType: 'all' | 'apartment' = 'all') => ({
    summary: summarizeFigures(reports, { level: 'district', rentalType }),
  });
  const tenantReports = (count: number, fields: Partial<FigureReport> = {}) =>
    Array.from({ length: count }, (_, i) =>
      complete('user', {
        rentalType: 'apartment',
        rent: 3000 + i * 100,
        totalMonthlyAvg: 3800 + i * 100,
        ...fields,
      }),
    );
  const mokotow = district([
    ...tenantReports(6),
    incomplete('scraped', { rentalType: 'apartment', rent: 3500, totalMonthlyAvg: 4100 }),
  ]);

  it('sets the tenant group beside the area tenant group, each with its own N', () => {
    const rows = comparisonRows(mixedBuilding, mokotow);
    expect(rows.map((row) => row.key)).toEqual(['completeTotal', 'rent', 'expenses']);
    const [total, rent, expenses] = rows;
    expect(total.building).toMatchObject({ median: 3850, n: 2 });
    expect(total.area).toMatchObject({ median: 4050, n: 6 });
    expect(rent.building).toMatchObject({ median: 3200, n: 3 });
    expect(rent.area.n).toBe(6);
    expect(expenses.building).toMatchObject({ median: 750, n: 2 });
    expect(total.labelKey).toBe(GROUP_FIGURE_LABEL_KEY.completeTotal);
  });

  it('draws no comparative statement while both sides load every rental type', () => {
    expect(mixedBuilding.rentalType).toBe('all');
    const big = summarizeFigures(tenantReports(8), building);
    const rows = comparisonRows(big, mokotow);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => !row.comparable)).toBe(true);
  });

  it('allows a position bar only for one rental type with N ≥ 5 on both sides', () => {
    const apartment = { level: 'building', rentalType: 'apartment' } as const;
    const area = district(tenantReports(6), 'apartment');
    const five = comparisonRows(summarizeFigures(tenantReports(5), apartment), area);
    expect(five.find((row) => row.key === 'completeTotal')?.comparable).toBe(true);
    const four = comparisonRows(summarizeFigures(tenantReports(4), apartment), area);
    expect(four.find((row) => row.key === 'completeTotal')?.comparable).toBe(false);
  });

  it('compares the same metric only, never a known part', () => {
    const unknownUtilities = summarizeFigures(
      [
        incomplete('user', { rent: 2800, totalMonthlyAvg: 3100 }),
        incomplete('user', { rent: 2900, totalMonthlyAvg: 3300 }),
      ],
      building,
    );
    expect(comparisonRows(unknownUtilities, mokotow).map((row) => row.key)).toEqual(['rent']);
  });

  it('lists nothing for one observation, without a reference or without area tenant reports', () => {
    const one = summarizeFigures(
      [complete('user', { rent: 3200, totalMonthlyAvg: 4000 })],
      building,
    );
    expect(comparisonRows(one, mokotow)).toEqual([]);
    expect(comparisonRows(mixedBuilding, null)).toEqual([]);
    const askingOnly = district([
      incomplete('scraped', { rent: 3500, totalMonthlyAvg: 4100 }),
      incomplete('scraped', { rent: 3300, totalMonthlyAvg: 3900 }),
    ]);
    expect(comparisonRows(mixedBuilding, askingOnly)).toEqual([]);
  });

  it.each(LOCALES)('labels both sides with no cheaper / pricier verdict in %s', (locale) => {
    const t = translator(locale);
    const tenant = mokotow.summary.groups.tenant!;
    const texts = [
      t('costs.building.comparison'),
      t('costs.building.thisBuilding'),
      t(FIGURE_GROUP_TITLE_KEY.tenant),
      t(FIGURE_GROUP_N_KEY.tenant, { count: 6 }),
      ...render(locale, [
        referenceGroupLabel('district', tenant, 'Mokotów'),
        referenceGroupLabel('city', tenant, 'Warszawa'),
      ]),
      ...comparisonRows(
        summarizeFigures(tenantReports(3, { areaM2: 50 }), building),
        district(tenantReports(6, { areaM2: 60 })),
      ).map((row) => t(row.labelKey)),
    ];
    expect(texts).toContain(t('costs.building.rentPerM2Compare'));
    for (const text of texts) {
      expect(text).not.toMatch(
        /cheap|pricier|overpa|sav(e|ing)|lower|higher|tańsz|drożs|przepła|oszczęd|niższ|wyższ|дешев|дорож|переплат|эконом|ниже|выше|економ|нижч|вищ/i,
      );
    }
  });
});

describe('message keys', () => {
  const keys = [
    ...Object.values(FIGURE_GROUP_TITLE_KEY),
    ...Object.values(FIGURE_GROUP_N_KEY),
    ...Object.values(GROUP_FIGURE_LABEL_KEY),
    ...Object.values(FIGURE_GROUP_RECORDED_KEY),
    ONE_OBSERVATION_KEY,
    KNOWN_PART_HINT_KEY,
    'costs.compare.colTotal',
    'costs.submit.wholeApartment',
    'costs.submit.room',
    'costs.building.figures.sourceTenant',
    'costs.building.figures.sourceTenantWithImported',
    'costs.building.figures.sourceImported',
    'costs.building.figures.sourceAsking',
    'costs.building.figures.depositReturned',
    'costs.building.figures.countOfTotal',
    'costs.building.figures.roomsValue',
    'costs.building.figures.areaValue',
    'costs.building.figures.valueUnknown',
    'costs.building.figures.valueIncluded',
    'costs.building.figures.includedCount',
    'costs.building.figures.unknownCount',
    ...[
      'tenancyRange',
      'tenancyYear',
      'tenancyOngoing',
      'tenancyCurrent',
      'tenancyFrom',
      'tenancyUntil',
      'tenancyUnknown',
      'viewDetails',
      'addExperience',
      'referenceTenantDistrict',
      'referenceTenantCity',
      'referenceAskingDistrict',
      'referenceAskingCity',
      'referenceHint',
    ].map((name) => `costs.building.figures.${name}`),
    NO_BUILDING_DATA_KEY,
    NO_AREA_DATA_KEY,
    'costs.trust.sampleSize',
    'costs.trust.earlyData',
    'costs.building.whiteSpotTitle',
    'costs.building.whiteSpotDesc',
    'costs.building.comparison',
    'costs.building.thisBuilding',
    'costs.building.rentPerM2Compare',
    'costs.building.perM2',
  ];

  it.each(LOCALES)('exist as strings in %s.json (client namespace costs)', (locale) => {
    for (const key of keys) {
      expect(key.startsWith('costs.'), key).toBe(true);
      expect(typeof lookup(messages[locale], key), `${locale}: ${key}`).toBe('string');
    }
  });

  it('render the deposit statistic and the N labels', () => {
    const t = translator('en');
    expect(t('costs.building.figures.depositReturned', { gotBack: 2, answered: 3 })).toBe(
      '2 of 3 who answered got the deposit back, fully or partly',
    );
    expect(t(FIGURE_GROUP_N_KEY.asking, { count: 1 })).toBe('1 listing');
    expect(t(FIGURE_GROUP_N_KEY.tenant, { count: 2 })).toBe('2 reports');
    expect(t('costs.building.estimateCaption', { count: 3 })).toBe(
      'Estimate based on 3 tenant reports',
    );
  });
});
