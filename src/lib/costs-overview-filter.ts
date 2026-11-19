import type { RentalTypeFilter } from '@/lib/cost-figures';

/**
 * One rental type's reports in a building (spec 03 §Costs overview, FR-30): the same blend of
 * sources as the building's other figures, restricted to reports of that type.
 */
export type BuildingTypeFigures = {
  medianTotal: number | null;
  medianRent: number | null;
  reports: number;
};

interface OverviewBuilding {
  reports: number;
  medianTotal: number;
  medianRent: number;
  medianAdminFee: number;
  medianRentPerM2: number | null;
  medianTotalPerM2: number | null;
  medianAdminFeePerM2: number | null;
  medianExpenses: number | null;
  rentalType: string | null;
  byType: { apartment: BuildingTypeFigures; room: BuildingTypeFigures };
}

/**
 * The `/[city]/costs` room / flat filter. `all` returns the buildings unchanged. A type keeps only
 * the buildings with a report of that type and swaps in that type's total, rent and report count,
 * so every count and roll-up downstream follows the filter. Metrics `byType` does not carry
 * (expenses, admin fee, per m²) are cleared, never shown over all types beside a type's total.
 */
export function buildingsForRentalType<T extends OverviewBuilding>(
  buildings: T[],
  type: RentalTypeFilter,
): T[] {
  if (type === 'all') return buildings;
  return buildings
    .filter((b) => b.byType[type].reports > 0)
    .map((b) => {
      const figures = b.byType[type];
      return {
        ...b,
        reports: figures.reports,
        medianTotal: figures.medianTotal ?? 0,
        medianRent: figures.medianRent ?? 0,
        medianAdminFee: 0,
        medianRentPerM2: null,
        medianTotalPerM2: null,
        medianAdminFeePerM2: null,
        medianExpenses: null,
        rentalType: type,
      };
    });
}
