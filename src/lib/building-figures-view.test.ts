import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { summarizeFigures, type FigureReport } from './cost-figures';
import {
  breakdownRows,
  FIGURE_GROUP_N_KEY,
  FIGURE_GROUP_TITLE_KEY,
  GROUP_FIGURE_LABEL_KEY,
  groupFigureRows,
  orderedFigureGroups,
  sourceLineMessages,
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

type Translate = (key: string, values?: Record<string, number>) => string;

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
    expect(tenant.headline).toMatchObject({
      key: 'completeTotal',
      figure: { median: 3850, n: 2 },
    });
    expect(tenant.rows).toEqual([
      { key: 'rent', figure: expect.objectContaining({ median: 3200, n: 3 }) },
      { key: 'expenses', figure: expect.objectContaining({ median: 750, n: 2 }) },
    ]);

    // Asking prices have no complete total: rent is the headline, nothing merges.
    const asking = groupFigureRows(mixedBuilding.groups.asking!);
    expect(asking.headline).toMatchObject({ key: 'rent', figure: { median: 3400, n: 2 } });
    expect(asking.rows).toEqual([]);
  });

  it('adds the per-m² total when reports carry an area', () => {
    const summary = summarizeFigures(
      [complete('user', { rent: 3000, totalMonthlyAvg: 4000, areaM2: 50 })],
      building,
    );
    expect(groupFigureRows(summary.groups.tenant!).rows.map((row) => row.key)).toEqual([
      'rent',
      'expenses',
      'completeTotalPerM2',
    ]);
  });

  it('has no headline when the group has neither a complete total nor rent', () => {
    const summary = summarizeFigures([incomplete('user', { totalMonthlyAvg: 3100 })], building);
    expect(groupFigureRows(summary.groups.tenant!)).toEqual({ headline: null, rows: [] });
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
    expect(basic.map((row) => row.key)).toEqual(['rent', 'adminFee']);
    expect(detail.map((row) => row.key)).toEqual(['electricity', 'water']);
    expect(detail[0]).toMatchObject({ figure: { median: 150, n: 1 }, oftenIncluded: true });
    expect(detail[1]).toMatchObject({ figure: { median: 80, n: 1 }, oftenIncluded: false });
  });

  it('shows a confirmed zero as a value with its own N (golden example 5)', () => {
    const summary = summarizeFigures(
      [
        complete('user', { internet: 0 }),
        complete('user', { internet: null }),
        complete('user', { internetIncluded: true }),
      ],
      building,
    );
    expect(breakdownRows(summary.groups.tenant!).detail).toEqual([
      {
        key: 'internet',
        figure: expect.objectContaining({ median: 0, n: 1 }),
        oftenIncluded: false,
      },
    ]);
  });

  it('builds the asking group from asking prices only', () => {
    const { basic } = breakdownRows(mixedBuilding.groups.asking!);
    expect(basic).toEqual([
      {
        key: 'rent',
        figure: expect.objectContaining({ median: 3400, n: 2 }),
        oftenIncluded: false,
      },
    ]);
  });
});

describe('message keys', () => {
  const keys = [
    ...Object.values(FIGURE_GROUP_TITLE_KEY),
    ...Object.values(FIGURE_GROUP_N_KEY),
    ...Object.values(GROUP_FIGURE_LABEL_KEY),
    'costs.building.figures.sourceTenant',
    'costs.building.figures.sourceTenantWithImported',
    'costs.building.figures.sourceImported',
    'costs.building.figures.sourceAsking',
    'costs.building.figures.depositReturned',
    'costs.building.figures.countOfTotal',
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
