import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  RENTAL_TYPE_FILTERS,
  singleNumberFigure,
  summarizeFigures,
  type RentalTypeFilter,
  type SingleNumberFigure,
} from '@/lib/cost-figures';

/**
 * The buildings of a city with their single numbers, for the costs overview, the
 * district pages and the blog report. Every figure is the contract's (spec 03
 * §Single-number surfaces, D23): no blended median over the sources is carried.
 * Values are reduced to plain, JSON-serializable figures inside the cache so the
 * nested joins are not re-run on every request.
 */
export type BuildingCostData = {
  id: string;
  slug: string;
  address: string;
  district: string;
  districtSlug: string;
  lat: number | null;
  lng: number | null;
  rentalType: string | null;
  /** The building's single number under each rental-type filter: the tenant group, else the
   *  asking prices, with its metric and N; null = no usable value. */
  figures: Record<RentalTypeFilter, SingleNumberFigure | null>;
};

// v3: the blended per-building medians removed (T054).
const BUILDINGS_DATA_CACHE_KEY = 'cost-aggregates-buildings-figures-v3';

// Buildings + their visible cost reports, reduced to per-building figures.
// Keyed by the arguments (city + filters). Only visible reports count.
export const getBuildingsData = unstable_cache(
  async (
    cityId: string,
    districtFilter: string | null,
    searchQuery: string | null,
  ): Promise<BuildingCostData[]> => {
    const buildingWhere: Record<string, unknown> = { cityId };
    if (districtFilter) buildingWhere.district = { slug: districtFilter };
    if (searchQuery) buildingWhere.addressFull = { contains: searchQuery, mode: 'insensitive' };

    const buildings = await prisma.building.findMany({
      where: { ...buildingWhere, costReports: { some: { isVisible: true } } },
      include: {
        district: true,
        costReports: {
          where: { isVisible: true },
          select: {
            source: true,
            utilitiesComplete: true,
            rent: true,
            adminFee: true,
            totalMonthlyAvg: true,
            areaM2: true,
            rentalType: true,
            // FUTURE (paid utility analytics): add electricityAvg, gas, heating,
            // water here, then compute per-building medians in the .map() below.
          },
        },
      },
      orderBy: { costReports: { _count: 'desc' } },
    });

    return buildings.map((b) => {
      const reports = b.costReports;

      const rentalTypes = reports.map((r) => r.rentalType).filter((v): v is string => v !== null);
      const dominantRentalType =
        rentalTypes.length > 0
          ? Object.entries(
              rentalTypes.reduce<Record<string, number>>((acc, t) => {
                acc[t] = (acc[t] || 0) + 1;
                return acc;
              }, {}),
            ).sort((a, b) => b[1] - a[1])[0][0]
          : null;

      // The contract over this building's reports, the same rule as the building page.
      const figures = Object.fromEntries(
        RENTAL_TYPE_FILTERS.map((rentalType) => [
          rentalType,
          singleNumberFigure(summarizeFigures(reports, { level: 'building', rentalType })),
        ]),
      ) as Record<RentalTypeFilter, SingleNumberFigure | null>;

      return {
        id: b.id,
        slug: b.slug,
        address: b.addressFull,
        district: b.district?.nameKey ?? '',
        districtSlug: b.district?.slug ?? '',
        lat: b.lat ? Number(b.lat) : null,
        lng: b.lng ? Number(b.lng) : null,
        rentalType: dominantRentalType,
        figures,
      };
    });
  },
  // Renamed whenever the shape changes, so entries of the old shape are not served after deploy.
  [BUILDINGS_DATA_CACHE_KEY],
  { revalidate: 300, tags: ['costs'] },
);
