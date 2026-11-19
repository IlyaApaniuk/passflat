// Display decisions of the building page over the figure contract (spec 03
// §Building page, FR-22, FR-24 – FR-28). Pure, client-safe: the page renders what
// these return and never merges the tenant and the asking group into one number.

import {
  TENANCY_ONGOING,
  type AreaReference,
  type FigureGroup,
  type FigureGroupKey,
  type FigureSummary,
  type MetricFigure,
} from '@/lib/cost-figures';
import { TRUST_THRESHOLDS } from '@/lib/cost-stats';

/** A message key with its ICU values, rendered by the caller's `t()`. */
export interface FigureMessage {
  key: string;
  values: Record<string, string | number>;
}

/** The title of a group's card and breakdown section. */
export const FIGURE_GROUP_TITLE_KEY: Record<FigureGroupKey, string> = {
  tenant: 'costs.building.figures.tenantTitle',
  asking: 'costs.building.figures.askingTitle',
};

/** The N under a metric: reports for the tenant group, listings for asking prices. */
export const FIGURE_GROUP_N_KEY: Record<FigureGroupKey, string> = {
  tenant: 'costs.overview.nReports',
  asking: 'costs.building.figures.nListings',
};

/** When the group's latest report was added or confirmed (never when the costs were paid). */
export const FIGURE_GROUP_RECORDED_KEY: Record<FigureGroupKey, string> = {
  tenant: 'costs.building.figures.lastRecorded',
  asking: 'costs.building.figures.lastRecordedAsking',
};

/** Shown on a group of exactly one report instead of any median or range. */
export const ONE_OBSERVATION_KEY = 'costs.building.figures.oneObservation';
/** Shown with a known-part figure: the utilities of those reports are not established. */
export const KNOWN_PART_HINT_KEY = 'costs.building.figures.knownPartHint';

/**
 * The source line: what exists and where it comes from, e.g. "3 reports from
 * tenants (1 entered by Passflat) · 2 asking prices from listings". The tenant
 * label shows the per-source counts only when it holds both `user` and
 * `import` reports; a group without reports is left out.
 */
export function sourceLineMessages(summary: Pick<FigureSummary, 'groups'>): FigureMessage[] {
  const messages: FigureMessage[] = [];
  const { tenant, asking } = summary.groups;
  if (tenant) {
    const count = tenant.reportCount;
    const imported = tenant.sourceCounts.import;
    if (imported === 0) {
      messages.push({ key: 'costs.building.figures.sourceTenant', values: { count } });
    } else if (tenant.sourceCounts.user === 0) {
      messages.push({ key: 'costs.building.figures.sourceImported', values: { count } });
    } else {
      messages.push({
        key: 'costs.building.figures.sourceTenantWithImported',
        values: { count, imported },
      });
    }
  }
  if (asking) {
    messages.push({
      key: 'costs.building.figures.sourceAsking',
      values: { count: asking.reportCount },
    });
  }
  return messages;
}

/** From this many reports the page shows the neutral sample-size badge, below it "early data". */
export const SAMPLE_SIZE_BADGE_MIN = TRUST_THRESHOLDS.reliableMin;

/**
 * The header badge about the size of the sample (FR-31): "5+ observations" or
 * "Early data · N reports". It states a count, never reliability or
 * verification; no badge without reports.
 */
export function sampleSizeBadge(reportCount: number): FigureMessage | null {
  if (reportCount <= 0) return null;
  if (reportCount >= SAMPLE_SIZE_BADGE_MIN) {
    return { key: 'costs.trust.sampleSize', values: { count: SAMPLE_SIZE_BADGE_MIN } };
  }
  return { key: 'costs.trust.earlyData', values: { count: reportCount } };
}

/** Shown first when the building has no visible report. */
export const NO_BUILDING_DATA_KEY = 'costs.building.figures.noBuildingData';
/** Shown when neither the district nor the city has a report to refer to. */
export const NO_AREA_DATA_KEY = 'costs.building.figures.noAreaData';

/**
 * What fills the figure part of the building page (FR-33): the building's own
 * figures when it has a visible report; otherwise the area reference the loader
 * found (district or city); otherwise nothing.
 */
export type BuildingFiguresFallback<R> =
  | { state: 'building' }
  | { state: 'reference'; reference: R }
  | { state: 'none' };

export function buildingFiguresFallback<R extends Pick<AreaReference, 'level' | 'summary'>>(
  summary: Pick<FigureSummary, 'reportCount'>,
  reference: R | null,
): BuildingFiguresFallback<R> {
  if (summary.reportCount > 0) return { state: 'building' };
  if (reference && reference.summary.reportCount > 0) return { state: 'reference', reference };
  return { state: 'none' };
}

const REFERENCE_LABEL_KEY: Record<FigureGroupKey, Record<AreaReference['level'], string>> = {
  tenant: {
    district: 'costs.building.figures.referenceTenantDistrict',
    city: 'costs.building.figures.referenceTenantCity',
  },
  asking: {
    district: 'costs.building.figures.referenceAskingDistrict',
    city: 'costs.building.figures.referenceAskingCity',
  },
};

/**
 * The title of one group of an area reference, with its level, group and N:
 * "Reference: tenant reports in Mokotów (3)". Area figures are never labelled
 * as the building's.
 */
export function referenceGroupLabel(
  level: AreaReference['level'],
  group: Pick<FigureGroup, 'key' | 'reportCount'>,
  area: string,
): FigureMessage {
  return {
    key: REFERENCE_LABEL_KEY[group.key][level],
    values: { area, count: group.reportCount },
  };
}

/** Says that the reference describes the district or the city, not this building. */
export function referenceHintMessage(level: AreaReference['level']): FigureMessage {
  return { key: 'costs.building.figures.referenceHint', values: { level } };
}

/** The groups that have reports, tenant first, then asking prices. */
export function orderedFigureGroups(summary: Pick<FigureSummary, 'groups'>): FigureGroup[] {
  return [summary.groups.tenant, summary.groups.asking].filter(
    (group): group is FigureGroup => group != null,
  );
}

/**
 * One report is one observation: its values are shown as they are, with its
 * characteristics, and never as a median, a range or a comparison (FR-24).
 */
export function isOneObservation(group: Pick<FigureGroup, 'observation'>): boolean {
  return group.observation === 'one';
}

/**
 * The tenant group the comparison may set against the district or the city:
 * none for one observation, which is never compared.
 */
export function comparableTenantGroup(summary: Pick<FigureSummary, 'groups'>): FigureGroup | null {
  const { tenant } = summary.groups;
  return tenant && !isOneObservation(tenant) ? tenant : null;
}

export type GroupFigureKey =
  | 'completeTotal'
  | 'knownPartTotal'
  | 'rent'
  | 'expenses'
  | 'completeTotalPerM2';

export interface GroupFigureRow {
  key: GroupFigureKey;
  figure: MetricFigure;
  labelKey: string;
}

/** Label of each group figure. A known part is never labelled as the monthly cost (FR-25). */
export const GROUP_FIGURE_LABEL_KEY: Record<GroupFigureKey, string> = {
  completeTotal: 'costs.building.medianMonthlyTotal',
  knownPartTotal: 'costs.building.figures.knownPart',
  rent: 'costs.building.rent',
  expenses: 'costs.building.expenses',
  completeTotalPerM2: 'costs.building.totalPerM2Compare',
};

/** One observation has a value, not a typical one: the labels that would claim a median. */
const ONE_OBSERVATION_LABEL_KEY: Partial<Record<GroupFigureKey, string>> = {
  completeTotal: 'costs.compare.colTotal',
};

/** Card order; the headline is the first of these with a value (the contract's rule). */
const GROUP_FIGURE_ORDER: GroupFigureKey[] = [
  'completeTotal',
  'knownPartTotal',
  'rent',
  'expenses',
  'completeTotalPerM2',
];
const HEADLINE_KEYS: GroupFigureKey[] = ['completeTotal', 'knownPartTotal', 'rent'];

function usable(figure: MetricFigure): boolean {
  return figure.n >= 1 && figure.median != null;
}

/**
 * The figures of one group's card, each with its own N: the headline is the
 * all-in total of complete reports when there is one, else the known part of
 * the costs, else rent; the other figures with a value follow. `knownPart` is
 * true when a known-part figure is shown, so the card explains it.
 */
export function groupFigureRows(group: FigureGroup): {
  headline: GroupFigureRow | null;
  rows: GroupFigureRow[];
  knownPart: boolean;
} {
  const labels = isOneObservation(group)
    ? { ...GROUP_FIGURE_LABEL_KEY, ...ONE_OBSERVATION_LABEL_KEY }
    : GROUP_FIGURE_LABEL_KEY;
  const rows = GROUP_FIGURE_ORDER.map((key) => ({
    key,
    figure: group[key],
    labelKey: labels[key],
  })).filter((row) => usable(row.figure));
  const headline = rows.find((row) => HEADLINE_KEYS.includes(row.key)) ?? null;
  return {
    headline,
    rows: rows.filter((row) => row !== headline),
    knownPart: rows.some((row) => row.key === 'knownPartTotal'),
  };
}

/** The known characteristics of a one-observation group: rental type, rooms, area. */
export function characteristicMessages(
  group: Pick<FigureGroup, 'characteristics'>,
): FigureMessage[] {
  const characteristics = group.characteristics;
  if (!characteristics) return [];
  const messages: FigureMessage[] = [];
  if (characteristics.rentalType === 'apartment') {
    messages.push({ key: 'costs.submit.wholeApartment', values: {} });
  } else if (characteristics.rentalType === 'room') {
    messages.push({ key: 'costs.submit.room', values: {} });
  }
  if (characteristics.rooms != null && characteristics.rooms > 0) {
    messages.push({
      key: 'costs.building.figures.roomsValue',
      values: { count: characteristics.rooms },
    });
  }
  if (characteristics.areaM2 != null) {
    messages.push({
      key: 'costs.building.figures.areaValue',
      values: { area: characteristics.areaM2 },
    });
  }
  return messages;
}

export type BreakdownKey =
  | 'rent'
  | 'adminFee'
  | 'electricity'
  | 'gas'
  | 'heating'
  | 'water'
  | 'internet'
  | 'other';

/**
 * What a breakdown row says (FR-26): a value, a confirmed zero, "included in
 * rent" when no report gave an amount but some said it is included, or
 * "unknown" when no report said anything.
 */
export type BreakdownState = 'value' | 'zero' | 'included' | 'unknown';

export interface BreakdownRow {
  key: BreakdownKey;
  state: BreakdownState;
  figure: MetricFigure;
  /** The N under the row: values for a value or zero, else the reports behind the state. */
  n: number;
  includedCount: number;
  unknownCount: number;
}

/** Rent and the admin fee stay public; the per-utility rows are behind the contribution gate. */
const PUBLIC_BREAKDOWN: BreakdownKey[] = ['rent', 'adminFee'];
const UTILITY_ROWS = ['electricity', 'gas', 'heating', 'water', 'internet', 'other'] as const;

function breakdownRow(
  key: BreakdownKey,
  figure: MetricFigure,
  includedCount: number,
  unknownCount: number,
): BreakdownRow {
  const state: BreakdownState = usable(figure)
    ? figure.median === 0
      ? 'zero'
      : 'value'
    : includedCount > 0
      ? 'included'
      : 'unknown';
  const n = state === 'included' ? includedCount : state === 'unknown' ? unknownCount : figure.n;
  return { key, state, figure, n, includedCount, unknownCount };
}

/**
 * One group's breakdown in display order. Every row is present: a metric with
 * no value says "included in rent" or "unknown" instead of disappearing, and a
 * stored 0 stays a zero.
 */
export function breakdownRows(group: FigureGroup): {
  basic: BreakdownRow[];
  detail: BreakdownRow[];
} {
  const { utilities, reportCount } = group;
  const all: BreakdownRow[] = [
    breakdownRow('rent', group.rent, 0, reportCount - group.rent.n),
    breakdownRow('adminFee', group.adminFee, 0, reportCount - group.adminFee.n),
    ...UTILITY_ROWS.map((key) =>
      breakdownRow(
        key,
        utilities[key].value,
        utilities[key].includedCount,
        utilities[key].unknownCount,
      ),
    ),
  ];
  return {
    basic: all.filter((row) => PUBLIC_BREAKDOWN.includes(row.key)),
    detail: all.filter((row) => !PUBLIC_BREAKDOWN.includes(row.key)),
  };
}

/** Whether rows hold anything to show beyond "unknown" (a gate over unknowns teases nothing). */
export function breakdownHasFigures(rows: Pick<BreakdownRow, 'state'>[]): boolean {
  return rows.some((row) => row.state !== 'unknown');
}

/** The other answers behind a row, each with its count: "included in rent: 1 · unknown: 2". */
export function breakdownNotes(row: BreakdownRow): FigureMessage[] {
  const notes: FigureMessage[] = [];
  if ((row.state === 'value' || row.state === 'zero') && row.includedCount > 0) {
    notes.push({
      key: 'costs.building.figures.includedCount',
      values: { count: row.includedCount },
    });
  }
  if (row.state !== 'unknown' && row.unknownCount > 0) {
    notes.push({
      key: 'costs.building.figures.unknownCount',
      values: { count: row.unknownCount },
    });
  }
  return notes;
}

/** `latestRecordedAt` (`YYYY-MM…`) as a local date on the first of that month. */
function recordedMonth(latestRecordedAt: string | null): Date | null {
  const match = latestRecordedAt?.match(/^(\d{4})-(\d{2})/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : null;
}

/** The period the costs were paid, as years only, or that it is not known (FR-28). */
export function tenancyMessage(tenancy: FigureGroup['tenancy']): FigureMessage {
  const from = tenancy?.from ?? null;
  const to = tenancy?.to ?? null;
  const key = (name: string) => `costs.building.figures.${name}`;
  if (to === TENANCY_ONGOING) {
    return from
      ? { key: key('tenancyOngoing'), values: { from } }
      : { key: key('tenancyCurrent'), values: {} };
  }
  if (from && to) {
    return from === to
      ? { key: key('tenancyYear'), values: { year: from } }
      : { key: key('tenancyRange'), values: { from, to } };
  }
  if (from) return { key: key('tenancyFrom'), values: { from } };
  if (to) return { key: key('tenancyUntil'), values: { to } };
  return { key: key('tenancyUnknown'), values: {} };
}

/**
 * The dates of a group (FR-28): when its latest report was added or confirmed,
 * as month and year through the caller's `formatMonth`, and, for tenant
 * reports, the period the costs were paid. Asking prices were never paid, so
 * that line is left out for them.
 */
export function groupDateMessages(
  group: Pick<FigureGroup, 'key' | 'latestRecordedAt' | 'tenancy'>,
  formatMonth: (month: Date) => string,
): FigureMessage[] {
  const messages: FigureMessage[] = [];
  const recorded = recordedMonth(group.latestRecordedAt);
  if (recorded) {
    messages.push({
      key: FIGURE_GROUP_RECORDED_KEY[group.key],
      values: { date: formatMonth(recorded) },
    });
  }
  if (group.key === 'tenant') messages.push(tenancyMessage(group.tenancy));
  return messages;
}
