// The shared figure contract (spec 03 §The contract, FR-21).
//
// Pure: no Prisma import, no I/O. The website and the Telegram bot read cost
// figures only through this module and its server loaders, so a building, a
// district and a city answer the same way everywhere (CLAUDE.md: never a second
// aggregation for the bot). Raw reports go in; only aggregates and counts come
// out.

import { computeStats, median, perAreaValues } from '@/lib/cost-stats';

export type SourceKind = 'user' | 'import' | 'scraped';
export type FigureGroupKey = 'tenant' | 'asking';
export type RentalTypeFilter = 'all' | 'apartment' | 'room';
/** Every rental-type filter, in the order a surface offers them. */
export const RENTAL_TYPE_FILTERS: RentalTypeFilter[] = ['all', 'apartment', 'room'];
type FigureLevel = 'building' | 'district' | 'city';
type UtilityKey = 'electricity' | 'gas' | 'heating' | 'water' | 'internet' | 'other';

export interface MetricFigure {
  median: number | null;
  p25: number | null;
  p75: number | null;
  /** Usable values of this metric only, never the group's report count. */
  n: number;
}

export interface UtilityFigure {
  value: MetricFigure;
  includedCount: number;
  unknownCount: number;
}

export interface FigureGroup {
  key: FigureGroupKey;
  /** Reports in the group: the size of the group, never the N of a metric. */
  reportCount: number;
  sourceCounts: Record<SourceKind, number>;
  observation: 'none' | 'one' | 'several';
  /** All-in totals of complete reports only. */
  completeTotal: MetricFigure;
  /** Totals of reports whose utilities are not established. */
  knownPartTotal: MetricFigure;
  rent: MetricFigure;
  rentPerM2: MetricFigure;
  completeTotalPerM2: MetricFigure;
  /** Complete reports with rent: max(0, total − rent). */
  expenses: MetricFigure;
  /** Only for a one-observation group; area rounded to AREA_STEP_M2. */
  characteristics: {
    rentalType: string | null;
    rooms: number | null;
    areaM2: number | null;
  } | null;
  adminFee: MetricFigure;
  utilities: Record<UtilityKey, UtilityFigure>;
  rentalTypeCounts: { apartment: number; room: number; unknown: number };
  /** max(confirmedAt ?? createdAt) at RECORDED_AT_PRECISION; when added or confirmed, not paid. */
  latestRecordedAt: string | null;
  /** Earliest livedFrom – latest livedUntil (TENANCY_ONGOING for a current tenant); null = unknown. */
  tenancy: { from: string | null; to: string | null } | null;
}

export interface FigureSummary {
  level: FigureLevel;
  rentalType: RentalTypeFilter;
  reportCount: number;
  sourceCounts: Record<SourceKind, number>;
  /** null = no report of that kind. */
  groups: { tenant: FigureGroup | null; asking: FigureGroup | null };
}

/** An area figure a building is set against: district or city, rendered in each surface's locale. */
export interface AreaReference {
  level: 'district' | 'city';
  slug: string;
  /** Display name source: the district's `districtName`, the city's `nameKey`. */
  name: string;
  summary: FigureSummary;
}

export interface DepositReturns {
  answered: number;
  gotBack: number;
  full: number;
  medianDeposit: number | null;
}

export interface AnswerProperties {
  answer_level: 'building' | 'district' | 'city' | 'none';
  source_kind: 'tenant' | 'mixed' | 'asking' | 'none';
  n: number;
  incomplete: boolean;
}

/** Decimal-like values as Prisma returns them (`Number()` reads them through `valueOf`). */
type NumericInput = number | string | { valueOf(): number | string } | null | undefined;
type DateInput = Date | string | null | undefined;

/** A visible cost report as the loaders select it. Missing fields count as unknown. */
export interface FigureReport {
  source: string;
  rentalType?: string | null;
  rent?: NumericInput;
  adminFee?: NumericInput;
  electricityAvg?: NumericInput;
  electricityIncluded?: boolean | null;
  gas?: NumericInput;
  heating?: NumericInput;
  heatingIncluded?: boolean | null;
  water?: NumericInput;
  waterIncluded?: boolean | null;
  internet?: NumericInput;
  /** CostReport has no such column today; accepted so the contract covers every utility. */
  internetIncluded?: boolean | null;
  otherCosts?: NumericInput;
  utilitiesComplete?: boolean | null;
  totalMonthlyAvg?: NumericInput;
  rooms?: number | null;
  areaM2?: NumericInput;
  depositAmount?: NumericInput;
  depositReturned?: boolean | null;
  depositReturnedAmount?: NumericInput;
  isCurrentTenant?: boolean | null;
  livedFrom?: DateInput;
  livedUntil?: DateInput;
  createdAt?: DateInput;
  confirmedAt?: DateInput;
}

// --- Thresholds (Decided: the bot's existing gates, now shared) ---

/** Below this, a district median says more about the sample than the district. */
export const MIN_AREA_REPORTS = 5;
/** A deposit statistic is shown only from this many answers, for an area or a building. */
export const MIN_DEPOSIT_ANSWERS = 3;

// --- Q-3 parameters (Assumption: the cautious defaults until the owner confirms) ---

/** Which group each source belongs to: tenant = user + import, asking = scraped. */
export const SOURCE_GROUP: Record<SourceKind, FigureGroupKey> = {
  user: 'tenant',
  import: 'tenant',
  scraped: 'asking',
};
/** A legacy report (`utilitiesComplete === null`) counts as not established. */
export const LEGACY_NULL_IS_COMPLETE = false;
/** Medians are untrimmed everywhere (no 2.5·MAD outlier trimming). */
export const TRIM_OUTLIERS = false;
/** Expenses are max(0, total − rent); false would keep negative differences. */
export const CLAMP_EXPENSES_AT_ZERO = true;
/** A group of at most this many reports is one observation (and shows its characteristics). */
export const ONE_OBSERVATION_REPORTS = 1;
/** `latestRecordedAt` as month and year (`YYYY-MM`). */
export const RECORDED_AT_PRECISION: DatePrecision = 'month';
/** `tenancy` as years only (`YYYY`). */
export const TENANCY_PRECISION: DatePrecision = 'year';
/** A one-observation area is rounded to this step. */
export const AREA_STEP_M2 = 5;
/** `tenancy.to` of a group with a current tenant. */
export const TENANCY_ONGOING = 'now';

// --- Comparability (Assumption: spec 03 §Comparisons; CLAUDE.md gates percentages at N ≥ 5) ---

/** Each side of a percentage, a position bar or a percentile needs at least this many values. */
export const MIN_COMPARABLE_N = 5;

type DatePrecision = 'year' | 'month' | 'day';
const DATE_PRECISION_LENGTH: Record<DatePrecision, number> = { year: 4, month: 7, day: 10 };

const SOURCES: SourceKind[] = ['user', 'import', 'scraped'];
const UTILITY_FIELDS: Record<
  UtilityKey,
  {
    value: 'electricityAvg' | 'gas' | 'heating' | 'water' | 'internet' | 'otherCosts';
    included:
      | 'electricityIncluded'
      | 'heatingIncluded'
      | 'waterIncluded'
      | 'internetIncluded'
      | null;
  }
> = {
  electricity: { value: 'electricityAvg', included: 'electricityIncluded' },
  gas: { value: 'gas', included: null },
  heating: { value: 'heating', included: 'heatingIncluded' },
  water: { value: 'water', included: 'waterIncluded' },
  internet: { value: 'internet', included: 'internetIncluded' },
  other: { value: 'otherCosts', included: null },
};

function finite(value: NumericInput): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Rent and totals: only a value above zero is usable. */
function positive(value: NumericInput): number | null {
  const number = finite(value);
  return number != null && number > 0 ? number : null;
}

/** Fees and utilities: a stored 0 is a confirmed zero; negatives are not usable. */
function nonNegative(value: NumericInput): number | null {
  const number = finite(value);
  return number != null && number >= 0 ? number : null;
}

function toIso(value: DateInput): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : date.toISOString();
}

function truncate(iso: string, precision: DatePrecision): string {
  return iso.slice(0, DATE_PRECISION_LENGTH[precision]);
}

/**
 * Median and range of a metric with its own N, as every figure of the contract
 * (untrimmed: TRIM_OUTLIERS). Callers pass only usable values; null is unknown.
 */
export function metricFigure(values: Array<number | null>): MetricFigure {
  const stats = computeStats(values, { trimOutliers: TRIM_OUTLIERS });
  if (!stats) return { median: null, p25: null, p75: null, n: 0 };
  return { median: stats.median, p25: stats.p25, p75: stats.p75, n: stats.count };
}

function emptySourceCounts(): Record<SourceKind, number> {
  return { user: 0, import: 0, scraped: 0 };
}

function countSources(reports: Array<{ source: SourceKind }>): Record<SourceKind, number> {
  const counts = emptySourceCounts();
  for (const report of reports) counts[report.source] += 1;
  return counts;
}

function isSourceKind(source: string): source is SourceKind {
  return (SOURCES as string[]).includes(source);
}

/** The group a report's source belongs to (SOURCE_GROUP), or null for an unknown source. */
export function figureGroupOf(source: string): FigureGroupKey | null {
  return isSourceKind(source) ? SOURCE_GROUP[source] : null;
}

/** A report's total is all-in only when its utilities are established (LEGACY_NULL_IS_COMPLETE). */
export function isCompleteReport(report: Pick<FigureReport, 'utilitiesComplete'>): boolean {
  if (report.utilitiesComplete === true) return true;
  return report.utilitiesComplete == null && LEGACY_NULL_IS_COMPLETE;
}

function utilityFigure(reports: FigureReport[], key: UtilityKey): UtilityFigure {
  const fields = UTILITY_FIELDS[key];
  let includedCount = 0;
  let unknownCount = 0;
  const values: number[] = [];
  for (const report of reports) {
    if (fields.included && report[fields.included] === true) {
      includedCount += 1;
      continue;
    }
    const value = nonNegative(report[fields.value]);
    if (value == null) unknownCount += 1;
    else values.push(value);
  }
  return { value: metricFigure(values), includedCount, unknownCount };
}

function roundedArea(value: NumericInput): number | null {
  const area = positive(value);
  if (area == null) return null;
  const rounded = Math.round(area / AREA_STEP_M2) * AREA_STEP_M2;
  return rounded > 0 ? rounded : null;
}

function latestRecordedAt(reports: FigureReport[]): string | null {
  let latest: string | null = null;
  for (const report of reports) {
    const iso = toIso(report.confirmedAt) ?? toIso(report.createdAt);
    if (iso && (latest == null || iso > latest)) latest = iso;
  }
  return latest == null ? null : truncate(latest, RECORDED_AT_PRECISION);
}

function tenancy(reports: FigureReport[]): FigureGroup['tenancy'] {
  let from: string | null = null;
  let to: string | null = null;
  let ongoing = false;
  let hasDates = false;
  for (const report of reports) {
    const start = toIso(report.livedFrom);
    const end = toIso(report.livedUntil);
    if (start || end) hasDates = true;
    if (start && (from == null || start < from)) from = start;
    if (report.isCurrentTenant === true) ongoing = true;
    else if (end && (to == null || end > to)) to = end;
  }
  if (!hasDates) return null;
  return {
    from: from == null ? null : truncate(from, TENANCY_PRECISION),
    to: ongoing ? TENANCY_ONGOING : to == null ? null : truncate(to, TENANCY_PRECISION),
  };
}

function summarizeGroup(
  key: FigureGroupKey,
  reports: Array<FigureReport & { source: SourceKind }>,
): FigureGroup | null {
  if (reports.length === 0) return null;

  const complete = reports.filter(isCompleteReport);
  const notComplete = reports.filter((report) => !isCompleteReport(report));
  const one = reports.length <= ONE_OBSERVATION_REPORTS;

  const utilities = {} as Record<UtilityKey, UtilityFigure>;
  for (const utility of Object.keys(UTILITY_FIELDS) as UtilityKey[]) {
    utilities[utility] = utilityFigure(reports, utility);
  }

  const rentalTypeCounts = { apartment: 0, room: 0, unknown: 0 };
  for (const report of reports) {
    if (report.rentalType === 'apartment') rentalTypeCounts.apartment += 1;
    else if (report.rentalType === 'room') rentalTypeCounts.room += 1;
    else rentalTypeCounts.unknown += 1;
  }

  return {
    key,
    reportCount: reports.length,
    sourceCounts: countSources(reports),
    // 'none' stays in the type for a headline-based rule; a group exists only with a report.
    observation: one ? 'one' : 'several',
    completeTotal: metricFigure(complete.map((report) => positive(report.totalMonthlyAvg))),
    knownPartTotal: metricFigure(notComplete.map((report) => positive(report.totalMonthlyAvg))),
    rent: metricFigure(reports.map((report) => positive(report.rent))),
    rentPerM2: metricFigure(
      perAreaValues(
        reports.map((report) => ({
          value: positive(report.rent),
          areaM2: positive(report.areaM2),
        })),
      ),
    ),
    completeTotalPerM2: metricFigure(
      perAreaValues(
        complete.map((report) => ({
          value: positive(report.totalMonthlyAvg),
          areaM2: positive(report.areaM2),
        })),
      ),
    ),
    expenses: metricFigure(
      complete.map((report) => {
        const total = positive(report.totalMonthlyAvg);
        const rent = positive(report.rent);
        if (total == null || rent == null) return null;
        return CLAMP_EXPENSES_AT_ZERO ? Math.max(0, total - rent) : total - rent;
      }),
    ),
    characteristics: one
      ? {
          rentalType: reports[0].rentalType ?? null,
          rooms: finite(reports[0].rooms),
          areaM2: roundedArea(reports[0].areaM2),
        }
      : null,
    adminFee: metricFigure(reports.map((report) => nonNegative(report.adminFee))),
    utilities,
    rentalTypeCounts,
    latestRecordedAt: latestRecordedAt(reports),
    tenancy: tenancy(reports),
  };
}

/**
 * Figures for one building, district or city. The rental-type filter applies
 * before anything is computed; a report whose source is not `user`, `import` or
 * `scraped` belongs to no group and is left out.
 */
export function summarizeFigures(
  reports: FigureReport[],
  options: { level: FigureLevel; rentalType: RentalTypeFilter },
): FigureSummary {
  const kept = reports
    .filter((report) => options.rentalType === 'all' || report.rentalType === options.rentalType)
    .filter((report): report is FigureReport & { source: SourceKind } =>
      isSourceKind(report.source),
    );

  return {
    level: options.level,
    rentalType: options.rentalType,
    reportCount: kept.length,
    sourceCounts: countSources(kept),
    groups: {
      tenant: summarizeGroup(
        'tenant',
        kept.filter((report) => SOURCE_GROUP[report.source] === 'tenant'),
      ),
      asking: summarizeGroup(
        'asking',
        kept.filter((report) => SOURCE_GROUP[report.source] === 'asking'),
      ),
    },
  };
}

/**
 * The deposit statistic: of the reports that answered (ended tenancies only),
 * how many got the deposit back fully or partly, and how many in full. Shown
 * only when `answered >= MIN_DEPOSIT_ANSWERS`; `full` only with its own N.
 */
export function summarizeDepositReturns(
  reports: Array<
    Pick<
      FigureReport,
      'depositAmount' | 'depositReturned' | 'depositReturnedAmount' | 'isCurrentTenant'
    >
  >,
): DepositReturns {
  const answered = reports.filter(
    (report) => report.depositReturned != null && report.isCurrentTenant !== true,
  );
  const gotBack = answered.filter((report) => report.depositReturned === true);
  const full = gotBack.filter((report) => {
    const amount = positive(report.depositAmount);
    const returned = nonNegative(report.depositReturnedAmount);
    return amount != null && returned != null && returned >= amount;
  });

  return {
    answered: answered.length,
    gotBack: gotBack.length,
    full: full.length,
    medianDeposit: median(reports.map((report) => positive(report.depositAmount))),
  };
}

/**
 * The level a building is set against: its district when the district holds
 * at least MIN_AREA_REPORTS reports (after the rental-type filter), otherwise
 * the city, and nothing when the city has no report either.
 */
export function areaReferenceLevel(
  district: FigureSummary | null,
  city: FigureSummary | null,
): AreaReference['level'] | null {
  if (district && district.reportCount >= MIN_AREA_REPORTS) return 'district';
  if (city && city.reportCount > 0) return 'city';
  return null;
}

/** One side of a comparison: the group a figure comes from, its rental-type filter and its N. */
export interface ComparisonSide {
  group: FigureGroupKey;
  rentalType: RentalTypeFilter;
  /** The usable values of the compared metric (`MetricFigure.n`). */
  n: number;
}

/**
 * Whether two figures may be set against each other with a comparative
 * statement: a percentage, a position bar or a percentile (FR-29). Only when
 * both come from the same group, both are restricted to the same single rental
 * type (`all` mixes rooms and flats) and both rest on at least
 * MIN_COMPARABLE_N values. Otherwise the figures are shown side by side with
 * their labels and N, and no conclusion is drawn. Never an overpay or saving
 * verdict, comparable or not.
 */
export function isComparable(a: ComparisonSide, b: ComparisonSide): boolean {
  return (
    a.group === b.group &&
    a.rentalType !== 'all' &&
    a.rentalType === b.rentalType &&
    a.n >= MIN_COMPARABLE_N &&
    b.n >= MIN_COMPARABLE_N
  );
}

/** The metrics a group's headline is picked from, in the contract's order (§Rules). */
type HeadlineMetric = 'completeTotal' | 'knownPartTotal' | 'rent';
const HEADLINE_METRICS: HeadlineMetric[] = ['completeTotal', 'knownPartTotal', 'rent'];

/** The headline metric: complete total when it has values, else the known part, else rent. */
function headlineMetric(group: FigureGroup): HeadlineMetric | null {
  return HEADLINE_METRICS.find((metric) => group[metric].n >= 1) ?? null;
}

function headline(group: FigureGroup): { figure: MetricFigure; incomplete: boolean } {
  const metric = headlineMetric(group) ?? 'rent';
  return { figure: group[metric], incomplete: metric === 'knownPartTotal' };
}

// --- Single-number surfaces (spec 03 §Single-number surfaces, FR-23) ---

/** Decided (D23): the tenant group when it has a usable value, otherwise the asking prices. */
const SINGLE_NUMBER_GROUP_ORDER: FigureGroupKey[] = ['tenant', 'asking'];
/** Assumption: a group's value is usable from this many values of its headline metric. */
export const SINGLE_NUMBER_MIN_N = 1;

/** A median with its own N. */
interface FigureValue {
  value: number;
  n: number;
}

/**
 * The one number a map pin, a card or an area row shows for a building or an
 * area: one group's headline with its N, and that same group's other figures.
 * Never a blend of the tenant and the asking group.
 */
export interface SingleNumberFigure {
  group: FigureGroupKey;
  metric: HeadlineMetric;
  value: number;
  n: number;
  /** Reports in the chosen group: its size, never the N of a metric. */
  reportCount: number;
  rent: FigureValue | null;
  expenses: FigureValue | null;
  rentPerM2: FigureValue | null;
  completeTotalPerM2: FigureValue | null;
}

function figureValue(figure: MetricFigure): FigureValue | null {
  return figure.n >= 1 && figure.median != null ? { value: figure.median, n: figure.n } : null;
}

/**
 * The single number of a building or an area (D23, golden examples 12–15): the
 * tenant group (`user` + `import`) when its headline metric has at least
 * SINGLE_NUMBER_MIN_N values, otherwise the asking-price group (`scraped`),
 * otherwise nothing. The group is chosen once and every figure of the item
 * comes from it, so a card never sets tenant rent beside an asking total.
 */
export function singleNumberFigure(
  summary: Pick<FigureSummary, 'groups'>,
): SingleNumberFigure | null {
  for (const key of SINGLE_NUMBER_GROUP_ORDER) {
    const group = summary.groups[key];
    const metric = group ? headlineMetric(group) : null;
    if (!group || !metric || group[metric].n < SINGLE_NUMBER_MIN_N) continue;
    const shown = figureValue(group[metric]);
    if (!shown) continue;
    return {
      group: group.key,
      metric,
      value: shown.value,
      n: shown.n,
      reportCount: group.reportCount,
      rent: figureValue(group.rent),
      expenses: figureValue(group.expenses),
      rentPerM2: figureValue(group.rentPerM2),
      completeTotalPerM2: figureValue(group.completeTotalPerM2),
    };
  }
  return null;
}

/** An item a rank may place: its single number and the rental-type filter it was computed under. */
export interface RankCandidate {
  figure: Pick<SingleNumberFigure, 'group' | 'metric' | 'value' | 'n'>;
  rentalType: RentalTypeFilter;
}

/**
 * The ranks a surface may state ("cheapest", a position, a bar against the
 * others), golden example 16: only items whose figures pass `isComparable`
 * (same group, same single rental type, N ≥ MIN_COMPARABLE_N) and show the same
 * metric are ranked together, cheapest first. A rank needs two items; under
 * `all` there is none. Items in no rank are listed with their own label and N.
 */
export function comparableRanks<T extends RankCandidate>(items: T[]): T[][] {
  const ranks = new Map<string, T[]>();
  for (const item of items) {
    const side: ComparisonSide = {
      group: item.figure.group,
      rentalType: item.rentalType,
      n: item.figure.n,
    };
    if (!isComparable(side, side)) continue;
    const key = `${item.figure.group}:${item.rentalType}:${item.figure.metric}`;
    ranks.set(key, [...(ranks.get(key) ?? []), item]);
  }
  return [...ranks.values()]
    .filter((rank) => rank.length >= 2)
    .map((rank) => [...rank].sort((a, b) => a.figure.value - b.figure.value));
}

/**
 * Answer quality for check events on the website and in the bot (spec 01
 * §Answer quality): which level answered, from which groups, the N of the
 * headline metric shown (tenant group first) and whether it is a known part.
 */
export function answerProperties(
  summary: FigureSummary | null,
  reference: Pick<AreaReference, 'level' | 'summary'> | null,
): AnswerProperties {
  const answer =
    summary && summary.reportCount > 0
      ? { level: 'building' as const, summary }
      : reference && reference.summary.reportCount > 0
        ? { level: reference.level, summary: reference.summary }
        : null;

  if (!answer) return { answer_level: 'none', source_kind: 'none', n: 0, incomplete: false };

  const { tenant, asking } = answer.summary.groups;
  const source_kind = tenant && asking ? 'mixed' : tenant ? 'tenant' : asking ? 'asking' : 'none';
  const group = tenant ?? asking;
  const shown = group ? headline(group) : null;

  return {
    answer_level: answer.level,
    source_kind,
    n: shown?.figure.n ?? 0,
    incomplete: shown?.incomplete ?? false,
  };
}
