// The home page's figures (spec 03 §Single-number surfaces, D23): the hero's city
// figures, the district cards and the featured "top building" each show one
// group's numbers (the tenant group, else the asking prices) through the
// contract's loaders, so they equal the district pages, the overview and the
// building page for the same area or building (FR-34). Never a blend.

import { singleNumberFigure, type SingleNumberFigure } from '@/lib/cost-figures';
import { loadBuildingFigures, loadCityFigure, loadDistrictFigures } from '@/lib/cost-figures-query';
import { prisma } from '@/lib/prisma';

/** The buildings with the most reports the featured one rotates through, one per day. */
const FEATURED_BUILDING_POOL_SIZE = 20;

export interface HomeDistrictFigure {
  slug: string;
  figure: SingleNumberFigure;
}

/** The featured building's card: its single number and that same group's breakdown medians. */
export interface FeaturedBuilding {
  address: string;
  district: string;
  figure: SingleNumberFigure;
  adminFee: number | null;
  electricity: number | null;
  internet: number | null;
  /** Gas median plus heating median of the group; null when both are unknown. */
  gasHeating: number | null;
}

function findCityId(citySlug: string) {
  return prisma.city.findUnique({ where: { slug: citySlug }, select: { id: true } });
}

/** The city's single number under `all` (the hero's per m² and expenses tiles). */
export async function loadHomeCityFigure(citySlug: string): Promise<SingleNumberFigure | null> {
  const city = await findCityId(citySlug);
  return city ? loadCityFigure(city.id) : null;
}

/** Every district of the city with a single number under `all` (the district cards). */
export async function loadHomeDistrictFigures(citySlug: string): Promise<HomeDistrictFigure[]> {
  const city = await findCityId(citySlug);
  if (!city) return [];
  return (await loadDistrictFigures(city.id)).flatMap((district) =>
    district.figures.all ? [{ slug: district.slug, figure: district.figures.all }] : [],
  );
}

/**
 * The featured building of the day: the pool of most-reported buildings is
 * rotated by `dayBucket` (days since epoch), skipping a building without a
 * usable figure. Every number on the card comes from the group its single
 * number was taken from.
 */
export async function loadFeaturedBuilding(
  dayBucket: number,
): Promise<FeaturedBuilding | undefined> {
  const pool = await prisma.building.findMany({
    orderBy: { costReports: { _count: 'desc' } },
    where: { costReports: { some: { isVisible: true } } },
    take: FEATURED_BUILDING_POOL_SIZE,
    select: { id: true, addressFull: true, district: { select: { nameKey: true } } },
  });

  for (let offset = 0; offset < pool.length; offset += 1) {
    const building = pool[(dayBucket + offset) % pool.length];
    const summary = await loadBuildingFigures(building.id);
    const figure = singleNumberFigure(summary);
    const group = figure ? summary.groups[figure.group] : null;
    if (!figure || !group) continue;

    const gas = group.utilities.gas.value.median;
    const heating = group.utilities.heating.value.median;
    return {
      address: building.addressFull,
      district: building.district?.nameKey ?? '',
      figure,
      adminFee: group.adminFee.median,
      electricity: group.utilities.electricity.value.median,
      internet: group.utilities.internet.value.median,
      gasHeating: gas == null && heating == null ? null : (gas ?? 0) + (heating ?? 0),
    };
  }
  return undefined;
}
