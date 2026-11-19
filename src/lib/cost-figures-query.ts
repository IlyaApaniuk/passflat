// Server loaders of the figure contract (spec 03 §Loaders, FR-21, FR-30, FR-34).
//
// The website and the Telegram bot read cost figures through these loaders and
// the pure contract in `cost-figures.ts` (CLAUDE.md: never a second aggregation
// for the bot). Raw reports stay inside this module: every loader returns
// aggregates and counts only.

import type { Prisma } from '@prisma/client';
import { unstable_cache } from 'next/cache';

import {
  areaReferenceLevel,
  RENTAL_TYPE_FILTERS,
  singleNumberFigure,
  summarizeDepositReturns,
  summarizeFigures,
  type AreaReference,
  type DepositReturns,
  type FigureSummary,
  type RentalTypeFilter,
  type SingleNumberFigure,
} from '@/lib/cost-figures';
import { prisma } from '@/lib/prisma';

/** The tag `revalidateCostSurfaces()` (`revalidate-costs.ts`) expires after a report changes. */
const COSTS_TAG = 'costs';
/** Seconds a cached figure lives without a revalidation, as the other cost caches. */
const REVALIDATE_SECONDS = 300;
/** Reports read per query, as the existing baselines read them. */
const REPORT_LIMIT = 5000;

/** The fields `summarizeFigures` reads, nothing else (no ids, authors or emails). */
const FIGURE_REPORT_SELECT = {
  source: true,
  rentalType: true,
  rent: true,
  adminFee: true,
  electricityAvg: true,
  electricityIncluded: true,
  gas: true,
  heating: true,
  heatingIncluded: true,
  water: true,
  waterIncluded: true,
  internet: true,
  otherCosts: true,
  utilitiesComplete: true,
  totalMonthlyAvg: true,
  rooms: true,
  areaM2: true,
  isCurrentTenant: true,
  livedFrom: true,
  livedUntil: true,
  createdAt: true,
  confirmedAt: true,
} satisfies Prisma.CostReportSelect;

/** The fields `summarizeDepositReturns` reads. */
const DEPOSIT_REPORT_SELECT = {
  depositAmount: true,
  depositReturned: true,
  depositReturnedAmount: true,
  isCurrentTenant: true,
} satisfies Prisma.CostReportSelect;

function isIncrementalCacheMissing(error: unknown): boolean {
  return error instanceof Error && error.message.includes('incrementalCache missing');
}

/**
 * `unstable_cache` with the `costs` tag, or a direct call where Next has no
 * incremental cache. `npm run bot:dev` runs the bot with tsx, outside Next, and
 * there `unstable_cache` rejects with "Invariant: incrementalCache missing"
 * before it calls the loader, so the fallback never runs a query twice. The
 * cache key holds the key name and the arguments: give a loader a new key name
 * (bump the suffix) whenever its result shape changes, so entries of the old
 * shape are not served after a deploy.
 */
function cachedCostLoader<Args extends unknown[], Result>(
  loader: (...args: Args) => Promise<Result>,
  keyName: string,
): (...args: Args) => Promise<Result> {
  const cached = unstable_cache(loader, [keyName], {
    revalidate: REVALIDATE_SECONDS,
    tags: [COSTS_TAG],
  });
  return async (...args) => {
    try {
      return await cached(...args);
    } catch (error) {
      if (isIncrementalCacheMissing(error)) return loader(...args);
      throw error;
    }
  };
}

/** `room` and `apartment` drop other and unknown (`null`) rental types; `all` keeps every report. */
function rentalTypeWhere(rentalType: RentalTypeFilter): Prisma.CostReportWhereInput {
  return rentalType === 'all' ? {} : { rentalType };
}

function findFigureReports(where: Prisma.CostReportWhereInput, rentalType: RentalTypeFilter) {
  return prisma.costReport.findMany({
    where: { ...where, isVisible: true, ...rentalTypeWhere(rentalType) },
    select: FIGURE_REPORT_SELECT,
    take: REPORT_LIMIT,
  });
}

const loadBuildingFiguresCached = cachedCostLoader(
  async (buildingId: string, rentalType: RentalTypeFilter): Promise<FigureSummary> =>
    summarizeFigures(await findFigureReports({ buildingId }, rentalType), {
      level: 'building',
      rentalType,
    }),
  // v2: `adminFeePerM2` added to every group (T052).
  'cost-figures-building-v2',
);

/** Figures of one building's visible reports. */
export function loadBuildingFigures(
  buildingId: string,
  rentalType: RentalTypeFilter = 'all',
): Promise<FigureSummary> {
  return loadBuildingFiguresCached(buildingId, rentalType);
}

const loadAreaReferenceCached = cachedCostLoader(
  async (
    districtId: string | null,
    cityId: string,
    rentalType: RentalTypeFilter,
  ): Promise<AreaReference | null> => {
    if (districtId) {
      const [district, reports] = await Promise.all([
        prisma.district.findUnique({
          where: { id: districtId },
          select: { slug: true, nameKey: true },
        }),
        findFigureReports({ building: { districtId } }, rentalType),
      ]);
      const summary = summarizeFigures(reports, { level: 'district', rentalType });
      // The city is read only when the district cannot answer on its own.
      if (district && areaReferenceLevel(summary, null) === 'district') {
        return { level: 'district', slug: district.slug, name: district.nameKey, summary };
      }
    }

    const [city, reports] = await Promise.all([
      prisma.city.findUnique({ where: { id: cityId }, select: { slug: true, nameKey: true } }),
      findFigureReports({ building: { cityId } }, rentalType),
    ]);
    const summary = summarizeFigures(reports, { level: 'city', rentalType });
    // The district is ruled out above, so the rule decides between the city and nothing.
    if (!city || areaReferenceLevel(null, summary) !== 'city') return null;
    return { level: 'city', slug: city.slug, name: city.nameKey, summary };
  },
  // v2: `adminFeePerM2` added to every group (T052).
  'cost-figures-area-reference-v2',
);

/**
 * The area a building is set against (spec 03 §Rules, golden example 11): its
 * district when the district holds at least MIN_AREA_REPORTS visible reports
 * after the rental-type filter, otherwise the city, and null when the city has
 * no report either. `name` is the display name source (the district's or the
 * city's `nameKey`); each surface renders it in its own locale and grammar.
 */
export function loadAreaReference({
  districtId,
  cityId,
  rentalType = 'all',
}: {
  districtId: string | null;
  cityId: string;
  rentalType?: RentalTypeFilter;
}): Promise<AreaReference | null> {
  return loadAreaReferenceCached(districtId, cityId, rentalType);
}

/**
 * A city's single number (spec 03 §Single-number surfaces): the city-level
 * `loadAreaReference` summary through `singleNumberFigure`, so the home hero
 * and the calculator's city fallback show that headline's value and N (FR-34).
 */
export async function loadCityFigure(
  cityId: string,
  rentalType: RentalTypeFilter = 'all',
): Promise<SingleNumberFigure | null> {
  const reference = await loadAreaReference({ districtId: null, cityId, rentalType });
  return reference ? singleNumberFigure(reference.summary) : null;
}

/** One district's single number under each rental-type filter; null = no usable value. */
export interface DistrictFigures {
  slug: string;
  /** Display name source: the district's `nameKey`. */
  name: string;
  figures: Record<RentalTypeFilter, SingleNumberFigure | null>;
}

const loadDistrictFiguresCached = cachedCostLoader(
  async (cityId: string): Promise<DistrictFigures[]> => {
    const [districts, reports] = await Promise.all([
      prisma.district.findMany({
        where: { cityId },
        select: { id: true, slug: true, nameKey: true },
      }),
      prisma.costReport.findMany({
        where: { isVisible: true, building: { cityId } },
        select: { ...FIGURE_REPORT_SELECT, building: { select: { districtId: true } } },
        take: REPORT_LIMIT,
      }),
    ]);
    return districts.map((district) => {
      const own = reports.filter((report) => report.building.districtId === district.id);
      const figures = Object.fromEntries(
        RENTAL_TYPE_FILTERS.map((rentalType) => [
          rentalType,
          singleNumberFigure(summarizeFigures(own, { level: 'district', rentalType })),
        ]),
      ) as Record<RentalTypeFilter, SingleNumberFigure | null>;
      return { slug: district.slug, name: district.nameKey, figures };
    });
  },
  // v2: `adminFeePerM2` added to every figure (T052).
  'cost-figures-district-figures-v2',
);

/**
 * The single number of every district of a city under each rental-type filter
 * (spec 03 §Single-number surfaces): `summarizeFigures` over the district's
 * visible reports, a median of reports and not of building medians, so a
 * district shows the value and N `loadAreaReference` gives it (FR-34).
 */
export function loadDistrictFigures(cityId: string): Promise<DistrictFigures[]> {
  return loadDistrictFiguresCached(cityId);
}

const loadDepositReturnsCached = cachedCostLoader(
  async (level: 'district' | 'city', areaId: string): Promise<DepositReturns> => {
    const reports = await prisma.costReport.findMany({
      where: {
        isVisible: true,
        building: level === 'district' ? { districtId: areaId } : { cityId: areaId },
      },
      select: DEPOSIT_REPORT_SELECT,
      take: REPORT_LIMIT,
    });
    return summarizeDepositReturns(reports);
  },
  'cost-figures-deposit-returns-v1',
);

/**
 * The deposit statistic of a district or a city. Callers pass the level of the
 * cost reference and show it only when `answered >= MIN_DEPOSIT_ANSWERS`.
 */
export function loadDepositReturns(
  area: { districtId: string } | { cityId: string },
): Promise<DepositReturns> {
  return 'districtId' in area
    ? loadDepositReturnsCached('district', area.districtId)
    : loadDepositReturnsCached('city', area.cityId);
}
