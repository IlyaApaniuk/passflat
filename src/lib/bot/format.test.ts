import { describe, expect, it } from 'vitest';

import { summarizeFigures, type AreaReference, type FigureReport } from '@/lib/cost-figures';

import { money, renderLookup } from './format';
import type { AddressLookup } from './lookup';
import { plural, reportsWord } from './texts';

function report(source: string, fields: Partial<FigureReport> = {}): FigureReport {
  return { source, rentalType: 'apartment', utilitiesComplete: true, ...fields };
}

/** Five tenant reports (median total 4,400 zł) and two asking prices. */
const areaReports = [
  report('user', { totalMonthlyAvg: 3_700, rent: 3_000 }),
  report('user', { totalMonthlyAvg: 4_000, rent: 3_200 }),
  report('import', { totalMonthlyAvg: 4_400, rent: 3_500 }),
  report('user', { totalMonthlyAvg: 5_000, rent: 4_000 }),
  report('user', { totalMonthlyAvg: 5_484, rent: 4_400 }),
  report('scraped', { totalMonthlyAvg: 9_000, rent: 8_000, utilitiesComplete: false }),
  report('scraped', { totalMonthlyAvg: 9_500, rent: 8_500, utilitiesComplete: false }),
];

function reference(level: AreaReference['level'] = 'district'): AreaReference {
  return {
    level,
    slug: level === 'district' ? 'ochota' : 'warsaw',
    name: level === 'district' ? 'Ochota' : 'Warszawa',
    summary: summarizeFigures(areaReports, { level, rentalType: 'all' }),
  };
}

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
    reference: reference(),
    neighbours: [],
    deposit: { answered: 37, gotBack: 30, full: 22, medianDeposit: 4756 },
    imprecise: false,
    ...overrides,
  };
}

function buildingLookup(reports: FigureReport[]): AddressLookup {
  return lookup({
    level: 'building',
    address: 'Marszałkowska 58',
    buildingId: 'b1',
    building: summarizeFigures(reports, { level: 'building', rentalType: 'all' }),
  });
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

  it('shows the tenant group of the reference with its own report count', () => {
    const text = renderLookup(lookup(), 'ru');
    expect(text).toContain(`${money(4000)} – ${money(5000)}`);
    expect(text).toContain('по 5 отчётам');
    expect(text).not.toContain(money(9000)!);
  });

  it('says the numbers widened to the city instead of implying they are the district', () => {
    const text = renderLookup(
      lookup({ level: 'city', reference: reference('city'), districtName: 'Rembertów' }),
      'ru',
    );
    expect(text).toContain('Rembertów');
    expect(text).toContain('показываю Варшаву целиком');
    expect(text).toContain('по данным жильцов города');
    expect(text).toContain('По Варшаве: залог');
  });

  it('still answers when the city has no reference at all', () => {
    const text = renderLookup(lookup({ level: 'city', reference: null }), 'ru');
    expect(text).toContain('по 0 отчётам');
    expect(text).toContain('Оставь отчёт');
  });

  it('labels the deposit stat with the area it came from', () => {
    const text = renderLookup(lookup(), 'ru');
    expect(text).toContain('По Ochota: залог');
    // Got back fully or partly, in the old wording until the deposit line changes (T034).
    expect(text).toContain('в 81% случаев');
    expect(text).toContain('по 37');
  });

  it('hides the deposit stat below three answers', () => {
    const text = renderLookup(
      lookup({ deposit: { answered: 2, gotBack: 2, full: 2, medianDeposit: 4000 } }),
      'ru',
    );
    expect(text).not.toContain('залог');
  });

  it('flags a single-report building instead of stating it as settled', () => {
    const text = renderLookup(
      buildingLookup([report('user', { totalMonthlyAvg: 3_904, rent: 2_518 })]),
      'ru',
    );
    expect(text).toContain(money(3904)!);
    expect(text).toContain(money(1386)!);
    expect(text).toContain('по 1 отчёту');
    expect(text).toContain('Отчёт пока один');
  });

  it('reads a building from its tenant group and compares it only with the same group', () => {
    const text = renderLookup(
      buildingLookup([
        report('user', { totalMonthlyAvg: 4_400, rent: 3_400 }),
        report('user', { totalMonthlyAvg: 4_400, rent: 3_400 }),
        report('scraped', { totalMonthlyAvg: 6_000, rent: 5_000, utilitiesComplete: false }),
      ]),
      'ru',
    );
    expect(text).toContain(money(4400)!);
    expect(text).toContain('на уровне района');
    expect(text).toContain('по 2 отчётам');
    expect(text).not.toContain(money(6000)!);

    const askingOnly = renderLookup(
      buildingLookup([
        report('scraped', { totalMonthlyAvg: 6_000, rent: 5_000, utilitiesComplete: false }),
      ]),
      'ru',
    );
    expect(askingOnly).toContain(money(6000)!);
    expect(askingOnly).not.toContain('района');
  });

  it('renders Ukrainian without falling back to Russian strings', () => {
    const text = renderLookup(lookup(), 'uk');
    expect(text).toContain('Залиш звіт');
    expect(text).not.toContain('Оставь отчёт');
  });
});
