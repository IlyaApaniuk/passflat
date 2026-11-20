import type { RentalTypeFilter, SingleNumberFigure } from '@/lib/cost-figures';

interface OverviewBuilding {
  /** The dominant rental type of the building's reports. */
  rentalType: string | null;
  /** The building's single number under each rental-type filter (`getBuildingsData`). */
  figures: Record<RentalTypeFilter, SingleNumberFigure | null>;
}

/**
 * The `/[city]/costs` room / flat filter (spec 03 §Costs overview, FR-30) over the single
 * numbers (§Single-number surfaces, D23). Each building carries the figure of the selected
 * filter, computed over that type's reports only; a building without a usable figure under it
 * drops out, so every count, card and map pin downstream follows the filter. Under a type the
 * building is tagged with that type, not with its dominant one.
 */
export function buildingsForRentalType<T extends OverviewBuilding>(
  buildings: T[],
  type: RentalTypeFilter,
): Array<T & { figure: SingleNumberFigure }> {
  return buildings.flatMap((building) => {
    const figure = building.figures[type];
    if (!figure) return [];
    return [{ ...building, rentalType: type === 'all' ? building.rentalType : type, figure }];
  });
}
