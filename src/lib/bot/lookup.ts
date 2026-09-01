import { normalizeAddress } from '@/lib/address';
import { getCityCostStats, getDistrictCostStats, type AreaStats } from '@/lib/cost-baselines';
import { resolveDistrictByPoint } from '@/lib/geo/district';
import {
  aggregateLocationCheckerCosts,
  isInsideCityBounds,
  LOCATION_CHECKER_CITY_SLUG,
  parseCityBounds,
  type LocationCheckerCosts,
} from '@/lib/location-checker';
import { haversineMeters } from '@/lib/location-score';
import { prisma } from '@/lib/prisma';

import type { GeocodedAddress } from './geocode';

/**
 * The bot's data layer.
 *
 * The design constraint that shapes this whole file: an address lookup must
 * never bottom out at "no data". Coverage is ~300 buildings out of ~200k in
 * Warsaw, so an exact-building hit is the exception, not the rule. Every answer
 * therefore falls back a level — building → district → city — and the level it
 * landed on is reported so the message can be honest about it.
 */

export type LookupLevel = 'building' | 'district' | 'city';

export interface NeighbourSummary {
  address: string;
  slug: string;
  distanceM: number;
  totalMedian: number | null;
  reportCount: number;
}

export interface DepositFacts {
  returned: number;
  answered: number;
  medianDeposit: number | null;
}

export interface AddressLookup {
  level: LookupLevel;
  address: string;
  citySlug: string;
  /** Present once the address resolved to a persisted building (any level). */
  buildingId: string | null;
  buildingSlug: string | null;
  placeId: string | null;
  districtSlug: string | null;
  districtName: string | null;
  /** Costs of the building itself; null unless level === 'building'. */
  building: LocationCheckerCosts | null;
  area: AreaStats;
  /** True when `area` had to widen from the district to the whole city. */
  areaIsCity: boolean;
  /** Nearest buildings that do have reports — the substance of a district-level answer. */
  neighbours: NeighbourSummary[];
  deposit: DepositFacts;
  /** True when Google matched a street but not a specific house number. */
  imprecise: boolean;
}

/** Below this, a district median says more about the sample than the district. */
const MIN_AREA_REPORTS = 5;

const NEIGHBOUR_RADIUS_M = 1500;
const NEIGHBOUR_LIMIT = 3;
const NEIGHBOUR_BBOX_DEG = 0.02; // ~2.2 km latitude, a cheap prefilter before haversine

const costReportSelect = {
  source: true,
  totalMonthlyAvg: true,
  rent: true,
  depositReturned: true,
} as const;

export async function getCity(citySlug = LOCATION_CHECKER_CITY_SLUG) {
  return prisma.city.findUnique({
    where: { slug: citySlug },
    include: { districts: { select: { id: true, slug: true, nameKey: true } } },
  });
}

/** Deposit figures — the statistic nobody else in this market publishes. */
async function getDepositFacts(where: Record<string, unknown>): Promise<DepositFacts> {
  const reports = await prisma.costReport.findMany({
    where: { ...where, isVisible: true },
    select: { depositReturned: true, depositAmount: true },
    take: 5000,
  });

  const deposits = reports
    .map((report) => (report.depositAmount == null ? null : Number(report.depositAmount)))
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  return {
    returned: reports.filter((report) => report.depositReturned === true).length,
    answered: reports.filter((report) => report.depositReturned != null).length,
    medianDeposit: deposits.length
      ? deposits.length % 2
        ? deposits[(deposits.length - 1) / 2]
        : Math.round((deposits[deposits.length / 2 - 1] + deposits[deposits.length / 2]) / 2)
      : null,
  };
}

async function findNeighbours(
  cityId: string,
  lat: number,
  lng: number,
  excludeBuildingId: string | null,
): Promise<NeighbourSummary[]> {
  const candidates = await prisma.building.findMany({
    where: {
      cityId,
      id: excludeBuildingId ? { not: excludeBuildingId } : undefined,
      lat: { gte: lat - NEIGHBOUR_BBOX_DEG, lte: lat + NEIGHBOUR_BBOX_DEG },
      lng: { gte: lng - NEIGHBOUR_BBOX_DEG, lte: lng + NEIGHBOUR_BBOX_DEG },
      costReports: { some: { isVisible: true } },
    },
    select: {
      slug: true,
      addressFull: true,
      lat: true,
      lng: true,
      costReports: { where: { isVisible: true }, select: costReportSelect },
    },
    take: 60,
  });

  return candidates
    .map((building) => {
      const bLat = building.lat == null ? null : Number(building.lat);
      const bLng = building.lng == null ? null : Number(building.lng);
      if (bLat == null || bLng == null) return null;
      const costs = aggregateLocationCheckerCosts(building.costReports);
      return {
        address: building.addressFull,
        slug: building.slug,
        distanceM: Math.round(haversineMeters({ lat, lng }, { lat: bLat, lng: bLng })),
        totalMedian: costs?.totalMedian ?? null,
        reportCount: building.costReports.length,
      };
    })
    .filter((n): n is NeighbourSummary => n != null && n.distanceM <= NEIGHBOUR_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, NEIGHBOUR_LIMIT);
}

/**
 * Resolve a geocoded address into the richest answer the data supports.
 *
 * Read-only on purpose: unlike the website's checker this never creates a
 * building row. A chat message is a much cheaper action than a deliberate
 * search on the site, so persisting every typo would pollute the buildings
 * table that the map and SEO pages read from.
 */
export async function lookupAddress(geo: GeocodedAddress): Promise<AddressLookup | null> {
  const city = await getCity();
  if (!city || !city.isActive) return null;

  const bounds = parseCityBounds(city.bounds);
  if (bounds && !isInsideCityBounds(geo.lat, geo.lng, bounds)) return null;

  const districtSlug = resolveDistrictByPoint(city.slug, geo.lat, geo.lng);
  const district = districtSlug ? city.districts.find((d) => d.slug === districtSlug) : null;

  const addressNormalized = geo.buildingNumber
    ? normalizeAddress(geo.street, geo.buildingNumber)
    : null;

  const building = await prisma.building.findFirst({
    where: {
      cityId: city.id,
      OR: [{ placeId: geo.placeId }, ...(addressNormalized ? [{ addressNormalized }] : [])],
    },
    select: {
      id: true,
      slug: true,
      placeId: true,
      addressFull: true,
      districtId: true,
      district: { select: { slug: true, nameKey: true } },
      costReports: { where: { isVisible: true }, select: costReportSelect },
    },
  });

  const buildingCosts = building ? aggregateLocationCheckerCosts(building.costReports) : null;

  const districtId = building?.districtId ?? district?.id ?? null;
  const [districtStats, neighbours] = await Promise.all([
    districtId ? getDistrictCostStats(districtId) : null,
    findNeighbours(city.id, geo.lat, geo.lng, building?.id ?? null),
  ]);

  // Two districts (Rembertów, Wesoła) hold no reports at all, and a thin one
  // would answer with a median drawn from a couple of flats. Falling back to
  // the city keeps the reply worth reading rather than technically correct and
  // empty — the message says which level it is speaking at.
  const useCityStats = !districtStats || districtStats.count < MIN_AREA_REPORTS;
  const [area, deposit] = await Promise.all([
    useCityStats ? getCityCostStats(city.id) : Promise.resolve(districtStats),
    getDepositFacts(
      useCityStats || !districtId
        ? { building: { cityId: city.id } }
        : { building: { districtId } },
    ),
  ]);

  const level: LookupLevel = buildingCosts ? 'building' : useCityStats ? 'city' : 'district';

  return {
    level,
    address: building?.addressFull ?? geo.formatted,
    citySlug: city.slug,
    buildingId: building?.id ?? null,
    buildingSlug: building?.slug ?? null,
    placeId: building?.placeId ?? geo.placeId,
    districtSlug: building?.district?.slug ?? district?.slug ?? null,
    districtName: building?.district?.nameKey ?? district?.nameKey ?? null,
    building: buildingCosts,
    area,
    areaIsCity: useCityStats,
    neighbours,
    deposit,
    imprecise: !geo.isPrecise,
  };
}

export interface DistrictRow {
  slug: string;
  name: string;
  median: number | null;
  rentMedian: number | null;
  expensesMedian: number | null;
  count: number;
}

/**
 * District league table. This is the bot's second reason to exist: it answers
 * "where is it cheaper?" without needing the user's own address to be covered.
 */
export async function getDistrictTable(
  citySlug = LOCATION_CHECKER_CITY_SLUG,
): Promise<DistrictRow[]> {
  const city = await getCity(citySlug);
  if (!city) return [];

  const rows = await Promise.all(
    city.districts.map(async (district) => {
      const stats = await getDistrictCostStats(district.id);
      return {
        slug: district.slug,
        name: district.nameKey,
        median: stats.total.median,
        rentMedian: stats.rentMedian,
        expensesMedian: stats.expensesMedian,
        count: stats.count,
      };
    }),
  );

  return rows.filter((row) => row.median != null).sort((a, b) => (a.median ?? 0) - (b.median ?? 0));
}

export async function getDistrictBySlug(slug: string, citySlug = LOCATION_CHECKER_CITY_SLUG) {
  const city = await getCity(citySlug);
  const district = city?.districts.find((d) => d.slug === slug);
  if (!city || !district) return null;

  const [stats, deposit] = await Promise.all([
    getDistrictCostStats(district.id),
    getDepositFacts({ building: { districtId: district.id } }),
  ]);

  return { citySlug: city.slug, slug: district.slug, name: district.nameKey, stats, deposit };
}

/** City-wide deposit facts, for the standalone /deposit answer. */
export async function getCityDepositFacts(citySlug = LOCATION_CHECKER_CITY_SLUG) {
  const city = await getCity(citySlug);
  if (!city) return null;
  const [deposit, stats] = await Promise.all([
    getDepositFacts({ building: { cityId: city.id } }),
    getCityCostStats(city.id),
  ]);
  return { deposit, stats };
}
