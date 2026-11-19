// What the building page still computes from its own reports (spec 03 §Building
// page, the "What else the page computes today" table): winter and summer
// electricity and heating, periodic charges, the deposit, deposit months, tenure
// and lease type. Everything else comes from the figure contract.
//
// Pure. Every item is computed over the tenant group's reports only (user +
// import, `figureGroupOf`), untrimmed (`metricFigure`), and carries its own N.
// The deposit statistic goes through the contract's `summarizeDepositReturns`
// and is withheld below MIN_DEPOSIT_ANSWERS answers.

import {
  figureGroupOf,
  metricFigure,
  MIN_DEPOSIT_ANSWERS,
  summarizeDepositReturns,
  type DepositReturns,
  type MetricFigure,
} from '@/lib/cost-figures';
import { median, monthsSince } from '@/lib/cost-stats';
import {
  periodicChargesMonthlyTotal,
  PERIODIC_CATEGORIES,
  type PeriodicChargeLike,
} from '@/lib/periodic-charges';

type NumericInput = number | string | { valueOf(): number | string } | null | undefined;
type DateInput = Date | string | null | undefined;

/** A visible report as the building page selects it. Missing fields count as unknown. */
export interface BuildingDetailReport {
  source: string;
  electricityWinter?: NumericInput;
  electricitySummer?: NumericInput;
  heatingWinter?: NumericInput;
  heatingSummer?: NumericInput;
  depositAmount?: NumericInput;
  depositReturned?: boolean | null;
  depositReturnedAmount?: NumericInput;
  isCurrentTenant?: boolean | null;
  leaseType?: string | null;
  livedFrom?: DateInput;
  livedUntil?: DateInput;
  periodicCharges?: Array<PeriodicChargeLike & { category: string }>;
}

export interface PeriodicBreakdownRow {
  category: string;
  amount: number;
  frequency: string | null;
  /** Charges of this category behind the amount. */
  count: number;
}

export interface TenantDetails {
  electricityWinter: MetricFigure;
  electricitySummer: MetricFigure;
  heatingWinter: MetricFigure;
  heatingSummer: MetricFigure;
  /** Monthly equivalent of each report's periodic charges. */
  periodic: MetricFigure;
  periodicBreakdown: PeriodicBreakdownRow[] | null;
  deposit: MetricFigure;
  /** Typical deposit ÷ the tenant group's typical rent; unrounded. */
  depositMonths: number | null;
  tenure: { medianMonths: number; n: number } | null;
  /** The most common known lease type, of `answered` reports that named one. */
  leaseType: { dominant: string; count: number; answered: number } | null;
  /** null below MIN_DEPOSIT_ANSWERS answers. */
  depositReturns: DepositReturns | null;
}

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

function finite(value: NumericInput): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Utilities: a stored 0 is a confirmed zero, as in the contract. */
function nonNegative(value: NumericInput): number | null {
  const number = finite(value);
  return number != null && number >= 0 ? number : null;
}

function positive(value: NumericInput): number | null {
  const number = finite(value);
  return number != null && number > 0 ? number : null;
}

function tenureMonths(report: BuildingDetailReport): number | null {
  if (!report.livedFrom) return null;
  // Past tenant: move-in → move-out. Current tenant (no livedUntil): move-in →
  // now, via monthsSince.
  if (report.livedUntil) {
    const from = new Date(report.livedFrom).getTime();
    const to = new Date(report.livedUntil).getTime();
    if (Number.isNaN(from) || Number.isNaN(to)) return null;
    const months = (to - from) / MS_PER_MONTH;
    return months > 0 ? months : null;
  }
  const months = monthsSince(report.livedFrom);
  return months != null && months > 0 ? months : null;
}

function periodicBreakdown(reports: BuildingDetailReport[]): PeriodicBreakdownRow[] | null {
  const charges = reports.flatMap((report) => report.periodicCharges ?? []);
  if (charges.length === 0) return null;
  const rows: PeriodicBreakdownRow[] = [];
  for (const category of PERIODIC_CATEGORIES) {
    const ofCategory = charges.filter((charge) => charge.category === category);
    if (ofCategory.length === 0) continue;
    const amount = median(
      ofCategory.map((charge) => (charge.amount == null ? null : Number(charge.amount))),
    );
    if (amount == null) continue;
    const frequencyCounts: Record<string, number> = {};
    for (const charge of ofCategory) {
      if (charge.frequency) {
        frequencyCounts[charge.frequency] = (frequencyCounts[charge.frequency] ?? 0) + 1;
      }
    }
    const frequency = Object.entries(frequencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    rows.push({ category, amount, frequency, count: ofCategory.length });
  }
  return rows.length ? rows.sort((a, b) => b.count - a.count) : null;
}

function leaseType(reports: BuildingDetailReport[]): TenantDetails['leaseType'] {
  const named = reports
    .map((report) => report.leaseType)
    .filter((value): value is string => value != null && value !== '' && value !== 'unknown');
  if (named.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const value of named) counts[value] = (counts[value] ?? 0) + 1;
  const [dominant, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return { dominant, count, answered: named.length };
}

/**
 * The building page's own items over the tenant group's reports. Pass every
 * visible report of the building: asking prices (`scraped`) and unknown
 * sources are dropped here. `tenantRentMedian` is the contract's tenant rent.
 */
export function buildingTenantDetails(
  reports: BuildingDetailReport[],
  { tenantRentMedian }: { tenantRentMedian: number | null },
): TenantDetails {
  const tenant = reports.filter((report) => figureGroupOf(report.source) === 'tenant');

  const deposit = metricFigure(tenant.map((report) => positive(report.depositAmount)));
  const depositMonths =
    deposit.median != null && tenantRentMedian != null && tenantRentMedian > 0
      ? deposit.median / tenantRentMedian
      : null;

  const months = tenant.map(tenureMonths).filter((value): value is number => value != null);
  const tenureMedian = median(months);

  const depositReturns = summarizeDepositReturns(tenant);

  return {
    electricityWinter: metricFigure(tenant.map((r) => nonNegative(r.electricityWinter))),
    electricitySummer: metricFigure(tenant.map((r) => nonNegative(r.electricitySummer))),
    heatingWinter: metricFigure(tenant.map((r) => nonNegative(r.heatingWinter))),
    heatingSummer: metricFigure(tenant.map((r) => nonNegative(r.heatingSummer))),
    periodic: metricFigure(
      tenant.map((report) => {
        const total = periodicChargesMonthlyTotal(report.periodicCharges ?? []);
        return total > 0 ? total : null;
      }),
    ),
    periodicBreakdown: periodicBreakdown(tenant),
    deposit,
    depositMonths,
    tenure: tenureMedian == null ? null : { medianMonths: tenureMedian, n: months.length },
    leaseType: leaseType(tenant),
    depositReturns: depositReturns.answered >= MIN_DEPOSIT_ANSWERS ? depositReturns : null,
  };
}
