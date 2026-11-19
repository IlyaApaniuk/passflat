import { describe, expect, it } from 'vitest';

import { buildingTenantDetails, type BuildingDetailReport } from './building-tenant-details';
import { figureGroupOf, MIN_DEPOSIT_ANSWERS } from './cost-figures';

const report = (source: string, fields: Partial<BuildingDetailReport> = {}) => ({
  source,
  ...fields,
});

const noRent = { tenantRentMedian: null };

describe('figureGroupOf', () => {
  it('maps user and import to the tenant group, scraped to asking, anything else to none', () => {
    expect(figureGroupOf('user')).toBe('tenant');
    expect(figureGroupOf('import')).toBe('tenant');
    expect(figureGroupOf('scraped')).toBe('asking');
    expect(figureGroupOf('legacy')).toBeNull();
  });
});

describe('buildingTenantDetails', () => {
  it('reads only the tenant group: asking prices and unknown sources are dropped', () => {
    const details = buildingTenantDetails(
      [
        report('user', { depositAmount: 4000, electricityWinter: 300, leaseType: 'standard' }),
        report('import', { depositAmount: 3000, electricityWinter: 200 }),
        report('scraped', {
          depositAmount: 9000,
          electricityWinter: 900,
          leaseType: 'okazjonalny',
        }),
        report('legacy', { depositAmount: 9000 }),
      ],
      noRent,
    );
    expect(details.deposit).toMatchObject({ median: 3500, n: 2 });
    expect(details.electricityWinter).toMatchObject({ median: 250, n: 2 });
    expect(details.leaseType).toEqual({ dominant: 'standard', count: 1, answered: 1 });
  });

  it('keeps an outlier: medians are untrimmed', () => {
    const deposits = [3000, 3100, 3200, 3300, 30000];
    const details = buildingTenantDetails(
      deposits.map((depositAmount) => report('user', { depositAmount })),
      noRent,
    );
    // 2.5·MAD trimming would drop 30,000 and leave p75 at 3,225.
    expect(details.deposit).toEqual({ median: 3200, p25: 3100, p75: 3300, n: 5 });
  });

  it('counts a stored 0 for winter and summer as a value and null as unknown', () => {
    const details = buildingTenantDetails(
      [
        report('user', { heatingSummer: 0, heatingWinter: 400 }),
        report('user', { heatingSummer: null, heatingWinter: 500 }),
      ],
      noRent,
    );
    expect(details.heatingSummer).toMatchObject({ median: 0, n: 1 });
    expect(details.heatingWinter).toMatchObject({ median: 450, n: 2 });
    expect(details.electricitySummer).toMatchObject({ median: null, n: 0 });
  });

  it('withholds the deposit statistic below MIN_DEPOSIT_ANSWERS answers', () => {
    const answers = [
      report('user', { depositAmount: 4000, depositReturned: true, depositReturnedAmount: 4000 }),
      report('user', { depositAmount: 4000, depositReturned: true, depositReturnedAmount: 2500 }),
    ];
    expect(MIN_DEPOSIT_ANSWERS).toBe(3);
    expect(buildingTenantDetails(answers, noRent).depositReturns).toBeNull();
  });

  it('shows the deposit statistic from three answers (golden example 10)', () => {
    const details = buildingTenantDetails(
      [
        report('user', { depositAmount: 4000, depositReturned: true, depositReturnedAmount: 4000 }),
        report('user', { depositAmount: 4000, depositReturned: true, depositReturnedAmount: 2500 }),
        report('import', { depositAmount: 4000, depositReturned: false, depositReturnedAmount: 0 }),
        report('user', { depositAmount: 4000, depositReturned: null, isCurrentTenant: true }),
        // An asking price never answers for tenants.
        report('scraped', { depositAmount: 4000, depositReturned: false }),
      ],
      noRent,
    );
    expect(details.depositReturns).toEqual({
      answered: 3,
      gotBack: 2,
      full: 1,
      medianDeposit: 4000,
    });
  });

  it('divides the typical deposit by the tenant rent for deposit months', () => {
    const reports = [report('user', { depositAmount: 6000 })];
    expect(buildingTenantDetails(reports, { tenantRentMedian: 4000 }).depositMonths).toBe(1.5);
    expect(buildingTenantDetails(reports, { tenantRentMedian: 0 }).depositMonths).toBeNull();
    expect(buildingTenantDetails(reports, noRent).depositMonths).toBeNull();
  });

  it('gives tenure its own N and skips reports without a move-in date', () => {
    const details = buildingTenantDetails(
      [
        report('user', { livedFrom: '2024-01-01', livedUntil: '2025-01-01' }),
        report('user', { livedFrom: '2024-01-01', livedUntil: '2024-07-01' }),
        report('user', { livedUntil: '2025-01-01' }),
        report('scraped', { livedFrom: '2010-01-01', livedUntil: '2025-01-01' }),
      ],
      noRent,
    );
    expect(details.tenure).toEqual({ medianMonths: 9, n: 2 });
  });

  it('computes periodic charges over the tenant group with their counts', () => {
    const details = buildingTenantDetails(
      [
        report('user', {
          periodicCharges: [{ category: 'water', amount: 300, frequency: 'quarterly' }],
        }),
        report('user', {
          periodicCharges: [{ category: 'water', amount: 360, frequency: 'quarterly' }],
        }),
        report('scraped', {
          periodicCharges: [{ category: 'heating', amount: 1200, frequency: 'annual' }],
        }),
      ],
      noRent,
    );
    expect(details.periodic).toMatchObject({ median: 110, n: 2 });
    expect(details.periodicBreakdown).toEqual([
      { category: 'water', amount: 330, frequency: 'quarterly', count: 2 },
    ]);
  });

  it('has no items for a building without tenant reports', () => {
    const details = buildingTenantDetails([report('scraped', { depositAmount: 4000 })], noRent);
    expect(details.deposit.n).toBe(0);
    expect(details.tenure).toBeNull();
    expect(details.leaseType).toBeNull();
    expect(details.periodicBreakdown).toBeNull();
    expect(details.depositReturns).toBeNull();
  });
});
