// Display decisions of the building page over the figure contract (spec 03
// §Building page, FR-22, FR-27). Pure, client-safe: the page renders what these
// return and never merges the tenant and the asking group into one number.

import type { FigureGroup, FigureGroupKey, FigureSummary, MetricFigure } from '@/lib/cost-figures';

/** A message key with its ICU values, rendered by the caller's `t()`. */
export interface FigureMessage {
  key: string;
  values: Record<string, number>;
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

/** The groups that have reports, tenant first, then asking prices. */
export function orderedFigureGroups(summary: Pick<FigureSummary, 'groups'>): FigureGroup[] {
  return [summary.groups.tenant, summary.groups.asking].filter(
    (group): group is FigureGroup => group != null,
  );
}

export type GroupFigureKey = 'completeTotal' | 'rent' | 'expenses' | 'completeTotalPerM2';

export interface GroupFigureRow {
  key: GroupFigureKey;
  figure: MetricFigure;
}

/** Label of each group figure (all existing keys). */
export const GROUP_FIGURE_LABEL_KEY: Record<GroupFigureKey, string> = {
  completeTotal: 'costs.building.medianMonthlyTotal',
  rent: 'costs.building.rent',
  expenses: 'costs.building.expenses',
  completeTotalPerM2: 'costs.building.totalPerM2Compare',
};

function usable(figure: MetricFigure): boolean {
  return figure.n >= 1 && figure.median != null;
}

/**
 * The figures of one group's card, each with its own N: the headline is the
 * all-in total of complete reports when there is one, else rent; the other
 * usable figures follow. No headline when the group has neither.
 */
export function groupFigureRows(group: FigureGroup): {
  headline: GroupFigureRow | null;
  rows: GroupFigureRow[];
} {
  const rows: GroupFigureRow[] = [
    { key: 'completeTotal', figure: group.completeTotal },
    { key: 'rent', figure: group.rent },
    { key: 'expenses', figure: group.expenses },
    { key: 'completeTotalPerM2', figure: group.completeTotalPerM2 },
  ].filter((row): row is GroupFigureRow => usable(row.figure));
  const headline = rows.find((row) => row.key === 'completeTotal' || row.key === 'rent') ?? null;
  return { headline, rows: rows.filter((row) => row !== headline) };
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

export interface BreakdownRow {
  key: BreakdownKey;
  figure: MetricFigure;
  /** At least half of the group's reports say it is included in the rent. */
  oftenIncluded: boolean;
}

/** Rent and the admin fee stay public; the per-utility rows are behind the contribution gate. */
const PUBLIC_BREAKDOWN: BreakdownKey[] = ['rent', 'adminFee'];
const OFTEN_INCLUDED_SHARE = 0.5;

/** One group's breakdown rows with a usable value, in display order. */
export function breakdownRows(group: FigureGroup): {
  basic: BreakdownRow[];
  detail: BreakdownRow[];
} {
  const { utilities } = group;
  const oftenIncluded = (includedCount: number) =>
    group.reportCount > 0 && includedCount / group.reportCount >= OFTEN_INCLUDED_SHARE;
  const all: BreakdownRow[] = [
    { key: 'rent', figure: group.rent, oftenIncluded: false },
    { key: 'adminFee', figure: group.adminFee, oftenIncluded: false },
    ...(['electricity', 'gas', 'heating', 'water', 'internet', 'other'] as const).map((key) => ({
      key,
      figure: utilities[key].value,
      oftenIncluded: oftenIncluded(utilities[key].includedCount),
    })),
  ];
  const rows = all.filter((row) => usable(row.figure));
  return {
    basic: rows.filter((row) => PUBLIC_BREAKDOWN.includes(row.key)),
    detail: rows.filter((row) => !PUBLIC_BREAKDOWN.includes(row.key)),
  };
}
