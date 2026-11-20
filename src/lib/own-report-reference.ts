// The user's own report beside the area reference (spec 03 §Comparisons, FR-29): the
// post-submit screen and the dashboard's cost-reports panel. Pure, client-safe. The user's
// values are set beside the district's or the city's tenant reports, metric by metric, each
// area figure with its own N. No overpay, saving, percentage or position is stated: one report
// never reaches MIN_COMPARABLE_N, so `isComparable` can never hold here.

import {
  isCompleteReport,
  type AreaReference,
  type FigureGroup,
  type MetricFigure,
} from '@/lib/cost-figures';
import { GROUP_FIGURE_LABEL_KEY, isOneObservation } from '@/lib/building-figures-view';

/** What leaves the server: the area's level, its name source and its tenant group's figures. */
export interface OwnReportReference {
  level: AreaReference['level'];
  slug: string;
  /** Display name source: the district's name as is, the city's `nameKey` (a message key). */
  name: string;
  tenant: Pick<
    FigureGroup,
    'key' | 'reportCount' | 'completeTotal' | 'rentPerM2' | 'completeTotalPerM2'
  >;
}

/**
 * The reference an own report is shown beside: the tenant group of the area
 * `loadAreaReference` chose. None without a reference, without tenant reports in
 * the area (asking prices are not what tenants pay) or for one observation,
 * which is never set beside anything (FR-24).
 */
export function ownReportReference(reference: AreaReference | null): OwnReportReference | null {
  const tenant = reference?.summary.groups.tenant;
  if (!reference || !tenant || isOneObservation(tenant)) return null;
  return {
    level: reference.level,
    slug: reference.slug,
    name: reference.name,
    tenant: {
      key: tenant.key,
      reportCount: tenant.reportCount,
      completeTotal: tenant.completeTotal,
      rentPerM2: tenant.rentPerM2,
      completeTotalPerM2: tenant.completeTotalPerM2,
    },
  };
}

/** The user's own report as stored. */
export interface OwnReportFigures {
  total: number | null;
  rent: number | null;
  areaM2: number | null;
  utilitiesComplete: boolean | null;
}

type OwnReportKey = 'completeTotal' | 'knownPartTotal' | 'rentPerM2' | 'completeTotalPerM2';

export interface OwnReportRow {
  key: OwnReportKey;
  labelKey: string;
  /** The user's own value, rounded. */
  own: number;
  /** The reference's tenant figure of the same metric; null when there is none. */
  area: MetricFigure | null;
  perM2: boolean;
}

/** One report has a value, not a typical one; a known part is never the monthly cost (FR-25). */
const OWN_LABEL_KEY: Record<OwnReportKey, string> = {
  completeTotal: 'costs.compare.colTotal',
  knownPartTotal: GROUP_FIGURE_LABEL_KEY.knownPartTotal,
  rentPerM2: 'costs.building.rentPerM2Compare',
  completeTotalPerM2: GROUP_FIGURE_LABEL_KEY.completeTotalPerM2,
};

function positive(value: number | null): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

function usable(figure: MetricFigure | undefined): MetricFigure | null {
  return figure && figure.n >= 1 && figure.median != null ? figure : null;
}

function row(
  key: OwnReportKey,
  own: number,
  area: MetricFigure | null,
  perM2: boolean,
): OwnReportRow {
  return { key, labelKey: OWN_LABEL_KEY[key], own: Math.round(own), area, perM2 };
}

/**
 * The rows of the "your costs beside the area" block: the monthly total (or the
 * known part, when the report's utilities are not established, by the contract's
 * completeness rule), rent per m² and the total per m², each with the area's
 * tenant figure of the same metric. A known part is set beside nothing, and the
 * total per m² is left out for it. `knownPart` asks the caller for the hint.
 */
export function ownReportRows(
  own: OwnReportFigures,
  reference: OwnReportReference | null,
): { rows: OwnReportRow[]; knownPart: boolean } {
  const tenant = reference?.tenant;
  const complete = isCompleteReport(own);
  const total = positive(own.total);
  const rent = positive(own.rent);
  const area = positive(own.areaM2);

  const rows: OwnReportRow[] = [];
  if (total != null) {
    rows.push(
      complete
        ? row('completeTotal', total, usable(tenant?.completeTotal), false)
        : row('knownPartTotal', total, null, false),
    );
  }
  if (rent != null && area != null) {
    rows.push(row('rentPerM2', rent / area, usable(tenant?.rentPerM2), true));
  }
  if (complete && total != null && area != null) {
    rows.push(row('completeTotalPerM2', total / area, usable(tenant?.completeTotalPerM2), true));
  }
  return { rows, knownPart: total != null && !complete };
}
