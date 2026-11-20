// The calculator's data anchors (spec 03 §Single-number surfaces, D23; tariffs
// unchanged). Each district, and the city fallback, takes its rent per m² and its
// czynsz per m² from the one group `singleNumberFigure` chose for that area (the
// tenant group, else the asking prices), never from a blend, and carries that
// group's label with the N of the number used.

import type { RentalTypeFilter, SingleNumberFigure } from '@/lib/cost-figures';
import { TRUST_THRESHOLDS } from '@/lib/cost-stats';
import { singleNumberGroupLabel } from '@/lib/single-number-view';

/** A translator as `getTranslations()` returns it. */
type Translate = (key: string, values?: Record<string, string | number>) => string;

export interface DistrictCalcData {
  slug: string;
  name: string;
  /** Median rent per m² of the district's chosen group (0 when none). */
  rentPerM2: number;
  /** "Tenant reports (12)": the group and the N of `rentPerM2`; null when none. */
  rentLabel: string | null;
  /** Median czynsz (admin fee) per m² of the same group, 0 below the reliable gate. */
  czynszPerM2: number;
  /** The group and the N of `czynszPerM2`; null when it is not used. */
  czynszLabel: string | null;
  /** Whether the district has a single number at all (its page then shows data). */
  hasData: boolean;
  /** Whether the czynsz per m² rests on enough values to anchor the estimate. */
  reliable: boolean;
}

export interface CalculatorBaseline {
  districts: DistrictCalcData[];
  /** Median rent per m² of the city's chosen group (0 when none). */
  cityRentPerM2: number;
  cityRentLabel: string | null;
}

function groupLabel(
  t: Translate,
  figure: SingleNumberFigure,
  value: { n: number } | null,
): string | null {
  if (!value) return null;
  const label = singleNumberGroupLabel({ group: figure.group, n: value.n });
  return t(label.key, label.values);
}

/**
 * Every district of the city (districts without data fall back to the city or
 * to norms in the calculator), sorted by name. The czynsz anchor is used only
 * from TRUST_THRESHOLDS.reliableMin values of the group's czynsz per m², the
 * gate the calculator applied to the district's report count before.
 */
export function calculatorBaseline({
  districts,
  districtFigures,
  cityFigure,
  t,
  rentalType = 'all',
}: {
  districts: Array<{ slug: string; nameKey: string }>;
  districtFigures: Array<{
    slug: string;
    figures: Record<RentalTypeFilter, SingleNumberFigure | null>;
  }>;
  cityFigure: SingleNumberFigure | null;
  t: Translate;
  rentalType?: RentalTypeFilter;
}): CalculatorBaseline {
  const figureBySlug = new Map(districtFigures.map((d) => [d.slug, d.figures[rentalType]]));

  const rows = districts
    .map((district): DistrictCalcData => {
      const figure = figureBySlug.get(district.slug) ?? null;
      const rent = figure?.rentPerM2 ?? null;
      const czynsz =
        figure?.adminFeePerM2 && figure.adminFeePerM2.n >= TRUST_THRESHOLDS.reliableMin
          ? figure.adminFeePerM2
          : null;
      return {
        slug: district.slug,
        name: district.nameKey,
        rentPerM2: rent?.value ?? 0,
        rentLabel: figure ? groupLabel(t, figure, rent) : null,
        czynszPerM2: czynsz?.value ?? 0,
        czynszLabel: figure ? groupLabel(t, figure, czynsz) : null,
        hasData: figure != null,
        reliable: czynsz != null && czynsz.value > 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const cityRent = cityFigure?.rentPerM2 ?? null;
  return {
    districts: rows,
    cityRentPerM2: cityRent?.value ?? 0,
    cityRentLabel: cityFigure ? groupLabel(t, cityFigure, cityRent) : null,
  };
}
