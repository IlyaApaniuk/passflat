import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { groupFigureRows } from './building-figures-view';
import { singleNumberLabel } from './single-number-view';

import {
  answerProperties,
  areaReferenceLevel,
  comparableRanks,
  isComparable,
  LEGACY_NULL_IS_COMPLETE,
  MIN_AREA_REPORTS,
  MIN_COMPARABLE_N,
  MIN_DEPOSIT_ANSWERS,
  SINGLE_NUMBER_MIN_N,
  singleNumberFigure,
  summarizeDepositReturns,
  summarizeFigures,
  TENANCY_ONGOING,
  type ComparisonSide,
  type FigureReport,
  type FigureSummary,
  type RankCandidate,
  type SingleNumberFigure,
} from './cost-figures';

const building = { level: 'building', rentalType: 'all' } as const;

function report(source: FigureReport['source'], fields: Partial<FigureReport> = {}): FigureReport {
  return { source, ...fields };
}

/** A complete report with a rent and an all-in total. */
function complete(source: FigureReport['source'], fields: Partial<FigureReport> = {}) {
  return report(source, { utilitiesComplete: true, ...fields });
}

function reports(count: number, source: FigureReport['source'] = 'user'): FigureReport[] {
  return Array.from({ length: count }, (_, i) =>
    complete(source, { rentalType: 'apartment', rent: 3000 + i, totalMonthlyAvg: 3800 + i }),
  );
}

describe('cost-figures constants', () => {
  it('keeps the shared gates and the cautious Q-3 default', () => {
    expect(MIN_AREA_REPORTS).toBe(5);
    expect(MIN_DEPOSIT_ANSWERS).toBe(3);
    expect(LEGACY_NULL_IS_COMPLETE).toBe(false);
  });
});

describe('summarizeFigures — golden examples (spec 03)', () => {
  it('1. mixed building: tenant and asking groups never share a number', () => {
    const summary = summarizeFigures(
      [
        complete('user', { rentalType: 'apartment', rent: 3200, totalMonthlyAvg: 4000 }),
        complete('import', { rentalType: 'apartment', rent: 3000, totalMonthlyAvg: 3700 }),
        report('user', {
          rentalType: 'apartment',
          rent: 3400,
          totalMonthlyAvg: 3900,
          utilitiesComplete: false,
        }),
        report('scraped', {
          rentalType: 'apartment',
          rent: 3500,
          totalMonthlyAvg: 4100,
          utilitiesComplete: false,
        }),
        report('scraped', {
          rentalType: 'apartment',
          rent: 3300,
          totalMonthlyAvg: 3900,
          utilitiesComplete: false,
        }),
      ],
      building,
    );

    expect(summary.reportCount).toBe(5);
    expect(summary.sourceCounts).toEqual({ user: 2, import: 1, scraped: 2 });

    const tenant = summary.groups.tenant!;
    expect(tenant.reportCount).toBe(3);
    expect(tenant.sourceCounts).toEqual({ user: 2, import: 1, scraped: 0 });
    expect(tenant.completeTotal).toMatchObject({ median: 3850, n: 2 });
    expect(tenant.knownPartTotal).toMatchObject({ median: 3900, n: 1 });
    expect(tenant.rent).toMatchObject({ median: 3200, n: 3 });
    expect(tenant.expenses).toMatchObject({ median: 750, n: 2 });
    expect(tenant.observation).toBe('several');

    const asking = summary.groups.asking!;
    expect(asking.reportCount).toBe(2);
    expect(asking.sourceCounts).toEqual({ user: 0, import: 0, scraped: 2 });
    expect(asking.completeTotal).toEqual({ median: null, p25: null, p75: null, n: 0 });
    expect(asking.knownPartTotal).toMatchObject({ median: 4000, n: 2 });
    expect(asking.rent).toMatchObject({ median: 3400, n: 2 });
  });

  it('2. one observation shows its characteristics; a second report hides them', () => {
    const first = complete('user', {
      rentalType: 'apartment',
      rooms: 2,
      areaM2: 52,
      rent: 3200,
      totalMonthlyAvg: 4000,
    });

    const one = summarizeFigures([first], building);
    expect(one.groups.tenant!.observation).toBe('one');
    expect(one.groups.tenant!.completeTotal).toMatchObject({ median: 4000, n: 1 });
    expect(one.groups.tenant!.characteristics).toEqual({
      rentalType: 'apartment',
      rooms: 2,
      areaM2: 50,
    });
    expect(one.groups.asking).toBeNull();

    const two = summarizeFigures(
      [first, report('user', { totalMonthlyAvg: 4200, utilitiesComplete: false })],
      building,
    );
    const tenant = two.groups.tenant!;
    expect(tenant.observation).toBe('several');
    expect(tenant.completeTotal.n).toBe(1);
    expect(tenant.knownPartTotal.n).toBe(1);
    expect(tenant.characteristics).toBeNull();
  });

  it('3. unknown utilities give a known part, never a complete total', () => {
    const tenant = summarizeFigures(
      [report('user', { rent: 2800, totalMonthlyAvg: 3100, utilitiesComplete: false })],
      building,
    ).groups.tenant!;

    expect(tenant.completeTotal.n).toBe(0);
    expect(tenant.completeTotal.median).toBeNull();
    expect(tenant.knownPartTotal).toMatchObject({ median: 3100, n: 1 });
    expect(tenant.observation).toBe('one');
  });

  it('4. a legacy null report counts as not established by default', () => {
    const tenant = summarizeFigures(
      [report('user', { totalMonthlyAvg: 3600, utilitiesComplete: null })],
      building,
    ).groups.tenant!;

    expect(tenant.knownPartTotal).toMatchObject({ median: 3600, n: 1 });
    expect(tenant.completeTotal.n).toBe(0);
  });

  it('5. a stored zero is a value, null is unknown, included counts separately', () => {
    const tenant = summarizeFigures(
      [
        complete('user', { internet: 0 }),
        complete('user', { internet: null }),
        complete('user', { internetIncluded: true }),
      ],
      building,
    ).groups.tenant!;

    expect(tenant.utilities.internet).toEqual({
      value: { median: 0, p25: 0, p75: 0, n: 1 },
      includedCount: 1,
      unknownCount: 1,
    });
  });

  it('6. rooms and flats: the filter applies before anything is computed', () => {
    const mixed = [
      complete('user', { rentalType: 'room', totalMonthlyAvg: 2200 }),
      complete('user', { rentalType: 'apartment', totalMonthlyAvg: 4300 }),
      complete('user', { rentalType: 'apartment', totalMonthlyAvg: 4500 }),
    ];

    const room = summarizeFigures(mixed, { level: 'building', rentalType: 'room' });
    expect(room.reportCount).toBe(1);
    expect(room.groups.tenant!.completeTotal).toMatchObject({ median: 2200, n: 1 });
    expect(room.groups.tenant!.observation).toBe('one');

    const apartment = summarizeFigures(mixed, { level: 'building', rentalType: 'apartment' });
    expect(apartment.groups.tenant!.completeTotal).toMatchObject({ median: 4400, n: 2 });

    const all = summarizeFigures(mixed, { level: 'building', rentalType: 'all' });
    expect(all.groups.tenant!.completeTotal).toMatchObject({ median: 4300, n: 3 });
    expect(all.groups.tenant!.rentalTypeCounts).toEqual({ apartment: 2, room: 1, unknown: 0 });
  });

  it('6. a type filter drops reports whose rental type is null', () => {
    const summary = summarizeFigures(
      [
        complete('user', { rentalType: null, totalMonthlyAvg: 3000 }),
        complete('user', { rentalType: 'room', totalMonthlyAvg: 2000 }),
      ],
      { level: 'district', rentalType: 'room' },
    );
    expect(summary.reportCount).toBe(1);
    expect(summary.groups.tenant!.rentalTypeCounts).toEqual({ apartment: 0, room: 1, unknown: 0 });

    const all = summarizeFigures(
      [complete('user', { rentalType: null, totalMonthlyAvg: 3000 })],
      building,
    );
    expect(all.groups.tenant!.rentalTypeCounts).toEqual({ apartment: 0, room: 0, unknown: 1 });
  });

  it('7. no usable observations: both groups null', () => {
    const summary = summarizeFigures([], building);
    expect(summary).toEqual({
      level: 'building',
      rentalType: 'all',
      reportCount: 0,
      sourceCounts: { user: 0, import: 0, scraped: 0 },
      groups: { tenant: null, asking: null },
    });
  });

  it('8. only asking prices: no tenant group', () => {
    const summary = summarizeFigures(
      [
        report('scraped', { rent: 3000, totalMonthlyAvg: 3600, utilitiesComplete: false }),
        report('scraped', { rent: 3200, totalMonthlyAvg: 3800, utilitiesComplete: false }),
      ],
      building,
    );
    expect(summary.groups.tenant).toBeNull();
    expect(summary.groups.asking!.observation).toBe('several');
    expect(summary.groups.asking!.reportCount).toBe(2);
  });

  it('9. dates: recorded month and tenancy years, null when the period is unknown', () => {
    const r1 = complete('user', {
      totalMonthlyAvg: 4000,
      createdAt: new Date('2026-03-10T12:00:00Z'),
      confirmedAt: new Date('2026-09-01T08:00:00Z'),
      livedFrom: new Date('2025-01-01'),
      livedUntil: new Date('2026-06-30'),
    });
    const r2 = complete('user', {
      totalMonthlyAvg: 4100,
      createdAt: new Date('2026-05-02T12:00:00Z'),
      confirmedAt: null,
    });

    const both = summarizeFigures([r1, r2], building).groups.tenant!;
    expect(both.latestRecordedAt).toBe('2026-09');
    expect(both.tenancy).toEqual({ from: '2025', to: '2026' });

    const withoutR1 = summarizeFigures([r2], building).groups.tenant!;
    expect(withoutR1.tenancy).toBeNull();
    expect(withoutR1.latestRecordedAt).toBe('2026-05');
  });

  it('9. a current tenant keeps the period open', () => {
    const tenant = summarizeFigures(
      [
        complete('user', { livedFrom: '2024-04-01', livedUntil: '2025-03-31' }),
        complete('user', { livedFrom: '2025-05-01', isCurrentTenant: true }),
      ],
      building,
    ).groups.tenant!;
    expect(tenant.tenancy).toEqual({ from: '2024', to: TENANCY_ONGOING });
  });
});

describe('summarizeFigures — rules', () => {
  it('counts only usable values per metric: rent and totals above zero, fees from zero', () => {
    const tenant = summarizeFigures(
      [
        complete('user', { rent: 0, totalMonthlyAvg: 0, adminFee: 0 }),
        complete('user', { rent: null, totalMonthlyAvg: null, adminFee: null }),
        complete('user', { rent: 3000, totalMonthlyAvg: 3600, adminFee: 400 }),
      ],
      building,
    ).groups.tenant!;

    expect(tenant.reportCount).toBe(3);
    expect(tenant.rent).toMatchObject({ median: 3000, n: 1 });
    expect(tenant.completeTotal).toMatchObject({ median: 3600, n: 1 });
    expect(tenant.adminFee).toMatchObject({ median: 200, n: 2 });
  });

  it('never counts null as 0 and never lets an included utility count as 0', () => {
    const tenant = summarizeFigures(
      [
        complete('user', { water: 100, waterIncluded: true }),
        complete('user', { water: null }),
        complete('user', { water: 80 }),
        complete('user', { electricityIncluded: true, heatingIncluded: true }),
      ],
      building,
    ).groups.tenant!;

    expect(tenant.utilities.water).toEqual({
      value: { median: 80, p25: 80, p75: 80, n: 1 },
      includedCount: 1,
      unknownCount: 2,
    });
    expect(tenant.utilities.electricity).toMatchObject({ includedCount: 1, unknownCount: 3 });
    expect(tenant.utilities.electricity.value.n).toBe(0);
    expect(tenant.utilities.heating.includedCount).toBe(1);
    expect(tenant.utilities.gas).toMatchObject({ includedCount: 0, unknownCount: 4 });
    expect(tenant.utilities.other.value.median).toBeNull();
  });

  it('uses untrimmed medians: an outlier is not dropped', () => {
    const tenant = summarizeFigures(
      [1000, 3000, 3100, 3200, 30000].map((rent) => complete('user', { rent })),
      building,
    ).groups.tenant!;
    expect(tenant.rent).toEqual({ median: 3100, p25: 3000, p75: 3200, n: 5 });
  });

  it('clamps expenses at zero and takes them from complete reports with rent only', () => {
    const tenant = summarizeFigures(
      [
        complete('user', { rent: 3000, totalMonthlyAvg: 2900 }),
        complete('user', { rent: 3000, totalMonthlyAvg: 3500 }),
        complete('user', { totalMonthlyAvg: 3500 }),
        report('user', { rent: 3000, totalMonthlyAvg: 4000, utilitiesComplete: false }),
      ],
      building,
    ).groups.tenant!;
    expect(tenant.expenses).toEqual({ median: 250, p25: 125, p75: 375, n: 2 });
  });

  it('computes per-m² figures per report and skips missing areas', () => {
    const tenant = summarizeFigures(
      [
        complete('user', { rent: 3000, totalMonthlyAvg: 4000, areaM2: 50 }),
        complete('user', { rent: 2000, totalMonthlyAvg: 2400, areaM2: 40 }),
        complete('user', { rent: 5000, totalMonthlyAvg: 6000, areaM2: null }),
        report('user', { rent: 3500, totalMonthlyAvg: 4200, areaM2: 70, utilitiesComplete: false }),
      ],
      building,
    ).groups.tenant!;
    expect(tenant.rentPerM2).toMatchObject({ median: 50, n: 3 });
    expect(tenant.completeTotalPerM2).toMatchObject({ median: 70, n: 2 });
  });

  it('reads Decimal-like values and leaves out reports of an unknown source', () => {
    const decimal = (value: string) => ({ valueOf: () => value });
    const summary = summarizeFigures(
      [
        complete('user', { rent: decimal('3200.50'), totalMonthlyAvg: decimal('4000') }),
        complete('partner', { rent: 9999, totalMonthlyAvg: 9999 }),
      ],
      building,
    );
    expect(summary.reportCount).toBe(1);
    expect(summary.groups.tenant!.rent).toMatchObject({ median: 3201, n: 1 });
    expect(summary.groups.tenant!.completeTotal).toMatchObject({ median: 4000, n: 1 });
  });

  it('rounds a one-observation area to 5 m² and keeps unknown characteristics null', () => {
    const tenant = summarizeFigures([complete('user', { areaM2: 53 })], building).groups.tenant!;
    expect(tenant.characteristics).toEqual({ rentalType: null, rooms: null, areaM2: 55 });
  });
});

describe('summarizeDepositReturns', () => {
  it('10. counts ended tenancies that answered, partial returns as got back', () => {
    expect(
      summarizeDepositReturns([
        report('user', { depositAmount: 4000, depositReturned: true, depositReturnedAmount: 4000 }),
        report('user', { depositAmount: 4000, depositReturned: true, depositReturnedAmount: 2500 }),
        report('user', { depositAmount: 4000, depositReturned: false, depositReturnedAmount: 0 }),
        report('user', { depositAmount: 4000, depositReturned: null, isCurrentTenant: true }),
      ]),
    ).toEqual({ answered: 3, gotBack: 2, full: 1, medianDeposit: 4000 });
  });

  it('leaves out a current tenant who answered and a full return without amounts', () => {
    expect(
      summarizeDepositReturns([
        report('user', { depositReturned: true, isCurrentTenant: true }),
        report('user', { depositReturned: true, isCurrentTenant: false }),
        report('user', { depositAmount: 0, depositReturned: false, depositReturnedAmount: 0 }),
      ]),
    ).toEqual({ answered: 2, gotBack: 1, full: 0, medianDeposit: null });
  });
});

describe('areaReferenceLevel', () => {
  it('11. district from MIN_AREA_REPORTS reports, else the city, else nothing', () => {
    const area = (level: 'district' | 'city', count: number) =>
      summarizeFigures(reports(count), { level, rentalType: 'all' });

    expect(summarizeFigures([], building).reportCount).toBe(0);
    expect(areaReferenceLevel(area('district', 4), area('city', 40))).toBe('city');
    expect(areaReferenceLevel(area('district', 5), area('city', 40))).toBe('district');
    expect(areaReferenceLevel(area('district', 0), area('city', 0))).toBeNull();
    expect(areaReferenceLevel(null, null)).toBeNull();
  });

  it('11. counts the district after the rental-type filter', () => {
    const district = [
      ...reports(4),
      complete('user', { rentalType: 'room', rent: 1800, totalMonthlyAvg: 2200 }),
    ];
    const city = [...district, ...reports(30)];
    const level = (rentalType: 'all' | 'apartment') =>
      areaReferenceLevel(
        summarizeFigures(district, { level: 'district', rentalType }),
        summarizeFigures(city, { level: 'city', rentalType }),
      );

    expect(level('all')).toBe('district');
    expect(level('apartment')).toBe('city');
  });
});

describe('isComparable (FR-29)', () => {
  const side = (fields: Partial<ComparisonSide> = {}): ComparisonSide => ({
    group: 'tenant',
    rentalType: 'apartment',
    n: MIN_COMPARABLE_N,
    ...fields,
  });

  it('gates every comparative statement at N ≥ 5 on both sides', () => {
    expect(MIN_COMPARABLE_N).toBe(5);
  });

  it('compares one group of one rental type with N 5 on both sides', () => {
    expect(isComparable(side(), side())).toBe(true);
    expect(isComparable(side({ rentalType: 'room', n: 40 }), side({ rentalType: 'room' }))).toBe(
      true,
    );
  });

  it('never compares mixed rental types', () => {
    expect(
      isComparable(side({ rentalType: 'all', n: 40 }), side({ rentalType: 'all', n: 40 })),
    ).toBe(false);
    expect(isComparable(side({ rentalType: 'apartment' }), side({ rentalType: 'room' }))).toBe(
      false,
    );
    expect(isComparable(side({ rentalType: 'apartment' }), side({ rentalType: 'all' }))).toBe(
      false,
    );
  });

  it('needs N 5 on each side: 4 vs 5 is not comparable', () => {
    expect(isComparable(side({ n: 4 }), side({ n: 5 }))).toBe(false);
    expect(isComparable(side({ n: 5 }), side({ n: 4 }))).toBe(false);
    expect(isComparable(side({ n: 5 }), side({ n: 5 }))).toBe(true);
  });

  it('never sets tenant reports against asking prices', () => {
    expect(isComparable(side({ group: 'tenant', n: 40 }), side({ group: 'asking', n: 40 }))).toBe(
      false,
    );
    expect(isComparable(side({ group: 'asking' }), side({ group: 'asking' }))).toBe(true);
  });
});

describe('answerProperties', () => {
  const reference = (summary: FigureSummary, level: 'district' | 'city' = 'district') => ({
    level,
    summary,
  });

  it('describes a building answer by its tenant headline', () => {
    const summary = summarizeFigures(
      [
        complete('user', { rent: 3200, totalMonthlyAvg: 4000 }),
        complete('import', { rent: 3000, totalMonthlyAvg: 3700 }),
        report('scraped', { rent: 3500, totalMonthlyAvg: 4100, utilitiesComplete: false }),
      ],
      building,
    );
    const district = summarizeFigures(reports(10), { level: 'district', rentalType: 'all' });

    expect(answerProperties(summary, reference(district))).toEqual({
      answer_level: 'building',
      source_kind: 'mixed',
      n: 2,
      incomplete: false,
    });
  });

  it('flags a known-part headline as incomplete', () => {
    const summary = summarizeFigures(
      [report('user', { rent: 2800, totalMonthlyAvg: 3100, utilitiesComplete: false })],
      building,
    );
    expect(answerProperties(summary, null)).toEqual({
      answer_level: 'building',
      source_kind: 'tenant',
      n: 1,
      incomplete: true,
    });
  });

  it('describes a district reference when the building has no report', () => {
    const district = summarizeFigures(
      [
        ...reports(3),
        report('user', { rent: 3000, totalMonthlyAvg: 3600, utilitiesComplete: false }),
        report('scraped', { rent: 3000, totalMonthlyAvg: 3600, utilitiesComplete: false }),
      ],
      { level: 'district', rentalType: 'all' },
    );
    expect(answerProperties(summarizeFigures([], building), reference(district))).toEqual({
      answer_level: 'district',
      source_kind: 'mixed',
      n: 3,
      incomplete: false,
    });
  });

  it('uses the asking group when there is no tenant group', () => {
    const city = summarizeFigures(
      [report('scraped', { rent: 3000, totalMonthlyAvg: 3600, utilitiesComplete: false })],
      { level: 'city', rentalType: 'all' },
    );
    expect(answerProperties(null, reference(city, 'city'))).toEqual({
      answer_level: 'city',
      source_kind: 'asking',
      n: 1,
      incomplete: true,
    });
  });

  it('falls back to rent when no total is known', () => {
    const summary = summarizeFigures([complete('user', { rent: 3000 })], building);
    expect(answerProperties(summary, null)).toMatchObject({ n: 1, incomplete: false });
  });

  it('reports no data', () => {
    const empty = summarizeFigures([], building);
    expect(answerProperties(empty, null)).toEqual({
      answer_level: 'none',
      source_kind: 'none',
      n: 0,
      incomplete: false,
    });
    expect(
      answerProperties(
        empty,
        reference(summarizeFigures([], { level: 'city', rentalType: 'all' }), 'city'),
      ),
    ).toEqual({ answer_level: 'none', source_kind: 'none', n: 0, incomplete: false });
  });
});

const en = createTranslator({
  locale: 'en',
  messages: JSON.parse(
    readFileSync(join(process.cwd(), 'src/i18n/messages/en.json'), 'utf8'),
  ) as never,
}) as unknown as (key: string, values?: Record<string, string | number>) => string;

/** The label a single-number surface renders, in English. */
function label(figure: SingleNumberFigure): string {
  return singleNumberLabel(figure)
    .map((message) => en(message.key, message.values))
    .join(', ');
}

// Golden example 1's building: 2 user + 1 import tenant reports, 2 scraped asking prices.
const EXAMPLE_1: FigureReport[] = [
  complete('user', { rentalType: 'apartment', rent: 3200, totalMonthlyAvg: 4000 }),
  complete('import', { rentalType: 'apartment', rent: 3000, totalMonthlyAvg: 3700 }),
  report('user', {
    rentalType: 'apartment',
    rent: 3400,
    totalMonthlyAvg: 3900,
    utilitiesComplete: false,
  }),
  report('scraped', {
    rentalType: 'apartment',
    rent: 3500,
    totalMonthlyAvg: 4100,
    utilitiesComplete: false,
  }),
  report('scraped', {
    rentalType: 'apartment',
    rent: 3300,
    totalMonthlyAvg: 3900,
    utilitiesComplete: false,
  }),
];

describe('singleNumberFigure — golden examples (spec 03 §Single-number surfaces)', () => {
  it('12. tenant wins: example 1 → tenant complete total 3,850 (n 2), "tenant reports (2)"', () => {
    const figure = singleNumberFigure(summarizeFigures(EXAMPLE_1, building))!;

    expect(figure).toMatchObject({
      group: 'tenant',
      metric: 'completeTotal',
      value: 3850,
      n: 2,
      reportCount: 3,
    });
    expect(label(figure)).toBe('Tenant reports (2)');
    // Every number of the item comes from the tenant group, none from the asking prices.
    expect(figure.rent).toEqual({ value: 3200, n: 3 });
    expect(figure.expenses).toEqual({ value: 750, n: 2 });
  });

  it('13. asking fallback: two scraped known parts → 4,000 (n 2), "asking prices (2), known part"', () => {
    const figure = singleNumberFigure(
      summarizeFigures(
        [
          report('scraped', { totalMonthlyAvg: 4100, utilitiesComplete: false }),
          report('scraped', { totalMonthlyAvg: 3900, utilitiesComplete: false }),
        ],
        building,
      ),
    )!;

    expect(figure).toMatchObject({ group: 'asking', metric: 'knownPartTotal', value: 4000, n: 2 });
    expect(label(figure)).toBe('Asking prices (2), known part');
  });

  it('14. tenant with fewer reports still wins: one user known part 3,100 (n 1) over 3 scraped', () => {
    const figure = singleNumberFigure(
      summarizeFigures(
        [
          report('user', { totalMonthlyAvg: 3100, utilitiesComplete: false }),
          ...reports(3, 'scraped'),
        ],
        building,
      ),
    )!;

    expect(figure).toMatchObject({ group: 'tenant', metric: 'knownPartTotal', value: 3100, n: 1 });
    expect(label(figure)).toBe('Tenant reports (1), known part');
  });

  it("15. area: 3 tenant and 40 asking reports → the tenant group with N 3, the reference's headline", () => {
    const district = summarizeFigures([...reports(3, 'user'), ...reports(40, 'scraped')], {
      level: 'district',
      rentalType: 'all',
    });
    const figure = singleNumberFigure(district)!;
    const headline = groupFigureRows(district.groups.tenant!).headline!;

    expect(figure).toMatchObject({ group: 'tenant', n: 3 });
    expect(figure.metric).toBe(headline.key);
    expect(figure.value).toBe(headline.figure.median);
    expect(figure.n).toBe(headline.figure.n);
  });

  it('16. no rank without comparability; under apartment only A and B are ranked, B first', () => {
    const district = (
      slug: string,
      group: 'tenant' | 'asking',
      value: number,
      n: number,
      rentalType: RankCandidate['rentalType'],
    ) => ({ slug, rentalType, figure: { group, metric: 'completeTotal' as const, value, n } });
    const items = (rentalType: RankCandidate['rentalType']) => [
      district('A', 'tenant', 3900, 37, rentalType),
      district('B', 'tenant', 3500, 6, rentalType),
      district('C', 'asking', 3200, 12, rentalType),
      district('D', 'tenant', 3000, 2, rentalType),
    ];

    expect(comparableRanks(items('all'))).toEqual([]);
    expect(comparableRanks(items('apartment')).map((rank) => rank.map((d) => d.slug))).toEqual([
      ['B', 'A'],
    ]);
  });
});

describe('singleNumberFigure — rules', () => {
  it('uses a usable value from one headline value on (Assumption)', () => {
    expect(SINGLE_NUMBER_MIN_N).toBe(1);
  });

  it('falls back to asking prices when the tenant group has no usable value', () => {
    const figure = singleNumberFigure(
      summarizeFigures(
        [report('user', { utilitiesComplete: true }), ...reports(2, 'scraped')],
        building,
      ),
    )!;
    expect(figure).toMatchObject({ group: 'asking', metric: 'completeTotal', n: 2 });
  });

  it('is null when neither group has a usable value, or without reports', () => {
    expect(singleNumberFigure(summarizeFigures([report('user')], building))).toBeNull();
    expect(singleNumberFigure(summarizeFigures([], building))).toBeNull();
  });

  it('shows rent alone when no total is known, labelled "rent only"', () => {
    const figure = singleNumberFigure(
      summarizeFigures([complete('user', { rent: 3000 })], building),
    )!;
    expect(figure).toMatchObject({ metric: 'rent', value: 3000, n: 1 });
    expect(label(figure)).toBe('Tenant reports (1), rent only');
  });

  it('applies the rental-type filter before choosing the group', () => {
    const mixed = [
      complete('user', { rentalType: 'room', totalMonthlyAvg: 2200 }),
      report('scraped', { rentalType: 'apartment', totalMonthlyAvg: 4300 }),
    ];
    expect(
      singleNumberFigure(summarizeFigures(mixed, { level: 'building', rentalType: 'room' })),
    ).toMatchObject({ group: 'tenant', value: 2200 });
    expect(
      singleNumberFigure(summarizeFigures(mixed, { level: 'building', rentalType: 'apartment' })),
    ).toMatchObject({ group: 'asking', metric: 'knownPartTotal', value: 4300 });
  });

  it('never ranks a known part against an all-in total', () => {
    const item = (slug: string, metric: 'completeTotal' | 'knownPartTotal', value: number) => ({
      slug,
      rentalType: 'room' as const,
      figure: { group: 'tenant' as const, metric, value, n: 9 },
    });
    expect(
      comparableRanks([item('a', 'completeTotal', 2000), item('b', 'knownPartTotal', 1800)]),
    ).toEqual([]);
  });
});
