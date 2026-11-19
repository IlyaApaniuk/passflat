import { describe, expect, it } from 'vitest';

import {
  answerProperties,
  areaReferenceLevel,
  LEGACY_NULL_IS_COMPLETE,
  MIN_AREA_REPORTS,
  MIN_DEPOSIT_ANSWERS,
  summarizeDepositReturns,
  summarizeFigures,
  TENANCY_ONGOING,
  type FigureReport,
  type FigureSummary,
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
