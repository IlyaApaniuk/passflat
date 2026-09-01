import { describe, expect, it } from 'vitest';

import { money, renderLookup } from './format';
import type { AddressLookup } from './lookup';
import { plural, reportsWord } from './texts';

const area = {
  total: { median: 4400, p25: 3700, p75: 5484 },
  rentPerM2: { median: null, p25: null, p75: null },
  totalPerM2: { median: null, p25: null, p75: null },
  rentMedian: 3500,
  expensesMedian: 850,
  count: 357,
};

function lookup(overrides: Partial<AddressLookup> = {}): AddressLookup {
  return {
    level: 'district',
    address: 'Grójecka 45',
    citySlug: 'warsaw',
    buildingId: null,
    buildingSlug: null,
    placeId: 'place-1',
    districtSlug: 'ochota',
    districtName: 'Ochota',
    building: null,
    area,
    areaIsCity: false,
    neighbours: [],
    deposit: { returned: 30, answered: 37, medianDeposit: 4756 },
    imprecise: false,
    ...overrides,
  };
}

describe('plural', () => {
  it('agrees with Slavic count forms', () => {
    expect(reportsWord('ru', 1)).toBe('отчёту');
    expect(reportsWord('ru', 3)).toBe('отчётам');
    expect(reportsWord('ru', 11)).toBe('отчётам');
    expect(plural(21, ['a', 'b', 'c'])).toBe('a');
    expect(plural(112, ['a', 'b', 'c'])).toBe('c');
  });
});

describe('money', () => {
  it('formats whole złoty and drops empty values', () => {
    expect(money(4400)).toMatch(/^4.400.zł$/);
    expect(money(null)).toBeNull();
  });
});

describe('renderLookup', () => {
  it('never returns an empty answer when the building is unknown', () => {
    const text = renderLookup(lookup(), 'ru');
    expect(text).toContain('Ochota');
    expect(text).toContain(money(4400)!);
    // The whole point of the fallback: an uncovered address still gets a CTA.
    expect(text).toContain('Оставь отчёт');
  });

  it('says the numbers widened to the city instead of implying they are the district', () => {
    const text = renderLookup(
      lookup({ level: 'city', areaIsCity: true, districtName: 'Rembertów' }),
      'ru',
    );
    expect(text).toContain('Rembertów');
    expect(text).toContain('показываю Варшаву целиком');
    expect(text).toContain('по данным жильцов города');
  });

  it('labels the deposit stat with the area it came from', () => {
    const text = renderLookup(lookup(), 'ru');
    expect(text).toContain('По Ochota: залог');
  });

  it('flags a single-report building instead of stating it as settled', () => {
    const text = renderLookup(
      lookup({
        level: 'building',
        address: 'Marszałkowska 58',
        buildingId: 'b1',
        building: {
          totalMedian: 3904,
          districtMedian: null,
          districtName: null,
          rentMedian: 2518,
          expensesMedian: 1386,
          reportCount: 1,
          tenantReportCount: 1,
          sourceKind: 'tenant',
          depositReturned: 0,
          depositAnswered: 0,
        },
      }),
      'ru',
    );
    expect(text).toContain('по 1 отчёту');
    expect(text).toContain('Отчёт пока один');
  });

  it('renders Ukrainian without falling back to Russian strings', () => {
    const text = renderLookup(lookup(), 'uk');
    expect(text).toContain('Залиш звіт');
    expect(text).not.toContain('Оставь отчёт');
  });
});
