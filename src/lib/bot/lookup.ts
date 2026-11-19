import type { Prisma } from '@prisma/client';

import { normalizeAddress } from '@/lib/address';
import { getDistrictCostStats } from '@/lib/cost-baselines';
import type { AreaReference, DepositReturns, FigureSummary } from '@/lib/cost-figures';
import {
  loadAreaReference,
  loadBuildingFigures,
  loadDepositReturns,
} from '@/lib/cost-figures-query';
import { resolveDistrictByPoint } from '@/lib/geo/district';
import {
  aggregateLocationCheckerCosts,
  isInsideCityBounds,
  LOCATION_CHECKER_CITY_SLUG,
  parseCityBounds,
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
 *
 * Figures come from the shared contract's loaders (`cost-figures-query.ts`),
 * the ones the website's checker and building page read, so the bot never
 * aggregates reports itself (CLAUDE.md). The one exception is the neighbours'
 * single blended number, frozen by Q-2 (spec 03 §Single-number surfaces).
 */

type LookupLevel = 'building' | 'district' | 'city';

interface NeighbourSummary {
  address: string;
  slug: string;
  distanceM: number;
  totalMedian: number | null;
  /** The N of `totalMedian`, shown next to it. */
  totalCount: number;
  reportCount: number;
}

export interface AddressLookup {
  /**
   * 'building' when the building has a visible report; otherwise the level of
   * `reference`: 'district' from MIN_AREA_REPORTS reports, else 'city'.
   */
  level: LookupLevel;
  address: string;
  citySlug: string;
  /** Present once the address resolved to a persisted building (any level). */
  buildingId: string | null;
  buildingSlug: string | null;
  placeId: string | null;
  districtSlug: string | null;
  districtName: string | null;
  /** The building's own figures (`reportCount` 0 when nobody reported); null without a building row. */
  building: FigureSummary | null;
  /**
   * The labelled area the address is set against: its district from
   * MIN_AREA_REPORTS reports, otherwise the city; null when the city has none.
   */
  reference: AreaReference | null;
  /** Nearest buildings that do have reports — the substance of a district-level answer. */
  neighbours: NeighbourSummary[];
  /** The deposit statistic of the reference's area (the city without a district reference). */
  deposit: DepositReturns;
  /** True when Google matched a street but not a specific house number. */
  imprecise: boolean;
}

const NEIGHBOUR_RADIUS_M = 1500;
const NEIGHBOUR_LIMIT = 3;
const NEIGHBOUR_BBOX_DEG = 0.02; // ~2.2 km latitude, a cheap prefilter before haversine

/** The fields the neighbours' blended number reads (Q-2), nothing else. */
const neighbourReportSelect = {
  source: true,
  totalMonthlyAvg: true,
  rent: true,
} as const;

/** The building fields an answer reads, whichever way the building was found. */
const buildingSelect = {
  id: true,
  slug: true,
  placeId: true,
  addressFull: true,
  districtId: true,
  district: { select: { slug: true, nameKey: true } },
} as const;

type BuildingRow = Prisma.BuildingGetPayload<{ select: typeof buildingSelect }>;

interface DistrictRef {
  id: string;
  slug: string;
  nameKey: string;
}

export async function getCity(citySlug = LOCATION_CHECKER_CITY_SLUG) {
  return prisma.city.findUnique({
    where: { slug: citySlug },
    include: { districts: { select: { id: true, slug: true, nameKey: true } } },
  });
}

type CheckerCity = NonNullable<Awaited<ReturnType<typeof getCity>>>;

/** The checker city when it is live, else null: both lookups answer only there. */
async function getActiveCity(): Promise<CheckerCity | null> {
  const city = await getCity();
  return city && city.isActive ? city : null;
}

/**
 * The area reference and the deposit statistic of the same area: the district
 * when the district answers on its own (MIN_AREA_REPORTS), otherwise the city.
 */
async function loadAreaFacts(
  districtId: string | null,
  cityId: string,
): Promise<{ reference: AreaReference | null; deposit: DepositReturns }> {
  const reference = await loadAreaReference({ districtId, cityId });
  const deposit = await loadDepositReturns(
    reference?.level === 'district' && districtId ? { districtId } : { cityId },
  );
  return { reference, deposit };
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
      costReports: { where: { isVisible: true }, select: neighbourReportSelect },
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
        totalCount: costs?.totalCount ?? 0,
        reportCount: building.costReports.length,
      };
    })
    .filter((n): n is NeighbourSummary => n != null && n.distanceM <= NEIGHBOUR_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, NEIGHBOUR_LIMIT);
}

/** The district a point lies in, among the city's districts. */
function districtOfPoint(city: CheckerCity, lat: number, lng: number): DistrictRef | null {
  const slug = resolveDistrictByPoint(city.slug, lat, lng);
  return (slug && city.districts.find((d) => d.slug === slug)) || null;
}

/**
 * The one place an answer is put together, so a typed address and a building
 * link to the same building render identically (spec 04 §Building deep link).
 */
async function assembleLookup(input: {
  city: CheckerCity;
  building: BuildingRow | null;
  /** The district of the point; the building's own district wins over it. */
  pointDistrict: DistrictRef | null;
  /** Where neighbours are searched from; null finds none. */
  point: { lat: number; lng: number } | null;
  /** Shown and used when there is no building row. */
  address: string;
  placeId: string | null;
  imprecise: boolean;
}): Promise<AddressLookup> {
  const { city, building, pointDistrict, point } = input;

  // Two districts (Rembertów, Wesoła) hold no reports at all, and a thin one
  // would answer with a median drawn from a couple of flats. The reference
  // falls back to the city below MIN_AREA_REPORTS district reports (spec 03),
  // which keeps the reply worth reading rather than technically correct and
  // empty — the message says which level it is speaking at.
  const districtId = building?.districtId ?? pointDistrict?.id ?? null;
  const [figures, area, neighbours] = await Promise.all([
    building ? loadBuildingFigures(building.id) : Promise.resolve(null),
    loadAreaFacts(districtId, city.id),
    point
      ? findNeighbours(city.id, point.lat, point.lng, building?.id ?? null)
      : Promise.resolve([]),
  ]);

  const level: LookupLevel =
    figures && figures.reportCount > 0
      ? 'building'
      : area.reference?.level === 'district'
        ? 'district'
        : 'city';

  return {
    level,
    address: building?.addressFull ?? input.address,
    citySlug: city.slug,
    buildingId: building?.id ?? null,
    buildingSlug: building?.slug ?? null,
    placeId: building?.placeId ?? input.placeId,
    districtSlug: building?.district?.slug ?? pointDistrict?.slug ?? null,
    districtName: building?.district?.nameKey ?? pointDistrict?.nameKey ?? null,
    building: figures,
    reference: area.reference,
    neighbours,
    deposit: area.deposit,
    imprecise: input.imprecise,
  };
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
  const city = await getActiveCity();
  if (!city) return null;

  const bounds = parseCityBounds(city.bounds);
  if (bounds && !isInsideCityBounds(geo.lat, geo.lng, bounds)) return null;

  const addressNormalized = geo.buildingNumber
    ? normalizeAddress(geo.street, geo.buildingNumber)
    : null;

  const building = await prisma.building.findFirst({
    where: {
      cityId: city.id,
      OR: [{ placeId: geo.placeId }, ...(addressNormalized ? [{ addressNormalized }] : [])],
    },
    select: buildingSelect,
  });

  return assembleLookup({
    city,
    building,
    pointDistrict: districtOfPoint(city, geo.lat, geo.lng),
    point: { lat: geo.lat, lng: geo.lng },
    address: geo.formatted,
    placeId: geo.placeId,
    imprecise: !geo.isPrecise,
  });
}

/**
 * The answer for a building opened by its id (the website's `b_<id>` link):
 * the same answer as typing that building's address. Read-only, like
 * `lookupAddress`: it never creates a building.
 *
 * Null when the building does not exist (or was deleted), lies in another city
 * or outside the checker city's bounds, or the city is not live. A building
 * without coordinates cannot be placed in a district or checked against the
 * bounds, so it answers with the city reference and no neighbours (spec 04).
 */
export async function lookupBuilding(buildingId: string): Promise<AddressLookup | null> {
  const city = await getActiveCity();
  if (!city) return null;

  const building = await prisma.building.findUnique({
    where: { id: buildingId },
    select: { ...buildingSelect, cityId: true, lat: true, lng: true },
  });
  if (!building) return null;

  const { cityId, lat, lng, ...row } = building;
  if (cityId !== city.id) return null;

  const point = lat != null && lng != null ? { lat: Number(lat), lng: Number(lng) } : null;
  const bounds = parseCityBounds(city.bounds);
  if (point && bounds && !isInsideCityBounds(point.lat, point.lng, bounds)) return null;

  return assembleLookup({
    city,
    // Unplaced (no coordinates): no district either, so the city reference.
    building: point ? row : { ...row, districtId: null, district: null },
    pointDistrict: point ? districtOfPoint(city, point.lat, point.lng) : null,
    point,
    address: row.addressFull,
    placeId: row.placeId,
    // A building row always has a house number.
    imprecise: false,
  });
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
    loadDepositReturns({ districtId: district.id }),
  ]);

  return { citySlug: city.slug, slug: district.slug, name: district.nameKey, stats, deposit };
}

/** City-wide deposit statistic, for the standalone /deposit answer. */
export async function getCityDepositFacts(citySlug = LOCATION_CHECKER_CITY_SLUG) {
  const city = await getCity(citySlug);
  if (!city) return null;
  return { deposit: await loadDepositReturns({ cityId: city.id }) };
}
