import { Prisma } from '@prisma/client';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

import { normalizeAddress } from '@/lib/address';
import { resolveDistrictByPoint } from '@/lib/geo/district';
import {
  aggregateLocationCheckerCosts,
  getLocationCheckIp,
  isInsideCityBounds,
  isLocationCheckRateLimited,
  isPrismaUniqueConstraintError,
  localityMatchesCity,
  LOCATION_CHECKER_CITY_SLUG,
  LOCATION_CHECK_GLOBAL_CREATE_LIMIT,
  LOCATION_CHECK_GLOBAL_CREATE_WINDOW_MS,
  parseCityBounds,
  parseLocationCheckerInput,
  placeIdSlugSuffix,
  type LocationCheckerInput,
  type LocationCheckerResponse,
} from '@/lib/location-checker';
import { SCORE_VERSION, type LocationScoreResult } from '@/lib/location-score';
import { computeLocationScoreFromDb } from '@/lib/poi-lookup';
import { prisma } from '@/lib/prisma';
import { generateBuildingSlug } from '@/lib/slugify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const checkerBuildingSelect = {
  id: true,
  slug: true,
  cityId: true,
  districtId: true,
  street: true,
  buildingNumber: true,
  addressFull: true,
  addressNormalized: true,
  lat: true,
  lng: true,
  placeId: true,
  postalCode: true,
  checksCount: true,
  lastCheckedAt: true,
  city: { select: { slug: true, lat: true, lng: true } },
  district: { select: { slug: true, nameKey: true } },
  locationScore: {
    select: { overall: true, categories: true, computedAt: true, version: true },
  },
  costReports: {
    where: { isVisible: true },
    select: { source: true, totalMonthlyAvg: true, rent: true },
  },
} satisfies Prisma.BuildingSelect;

type CheckerBuilding = Prisma.BuildingGetPayload<{ select: typeof checkerBuildingSelect }>;
type CheckerScore = {
  overall: number;
  categories: Prisma.JsonValue;
  computedAt: Date;
  version: number;
};

type CheckerCity = {
  id: string;
  slug: string;
  nameKey: string;
  lat: Prisma.Decimal | null;
  lng: Prisma.Decimal | null;
  districts: Array<{ id: string; slug: string; nameKey: string }>;
};

class GlobalCreateLimitError extends Error {}

// The selected v1 rate-limit is deliberately per-instance. Match that model
// for cache misses too: requests for the same uncached building share one
// Overpass computation instead of causing a local thundering herd.
const inFlightScoreComputations = new Map<string, Promise<CheckerScore | null>>();
const scoreFailureCooldowns = new Map<string, number>();
const SCORE_FAILURE_COOLDOWN_MS = 30_000;
const SCORE_FAILURE_COOLDOWN_MAX_BUILDINGS = 1_000;

function rememberScoreFailure(buildingId: string, now = Date.now()) {
  if (
    !scoreFailureCooldowns.has(buildingId) &&
    scoreFailureCooldowns.size >= SCORE_FAILURE_COOLDOWN_MAX_BUILDINGS
  ) {
    const oldestBuildingId = scoreFailureCooldowns.keys().next().value as string | undefined;
    if (oldestBuildingId) scoreFailureCooldowns.delete(oldestBuildingId);
  }
  scoreFailureCooldowns.set(buildingId, now + SCORE_FAILURE_COOLDOWN_MS);
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: code, message }, { status });
}

async function findExistingBuilding(
  cityId: string,
  placeId: string,
  addressNormalized: string,
): Promise<CheckerBuilding | null> {
  const byPlaceId = await prisma.building.findFirst({
    where: { cityId, placeId },
    select: checkerBuildingSelect,
  });
  if (byPlaceId) return byPlaceId;

  return prisma.building.findUnique({
    where: { cityId_addressNormalized: { cityId, addressNormalized } },
    select: checkerBuildingSelect,
  });
}

function matchDistrict(city: CheckerCity, input: LocationCheckerInput): string | null {
  const resolvedSlug = resolveDistrictByPoint(city.slug, input.place.lat, input.place.lng);
  const byPoint = resolvedSlug
    ? city.districts.find((district) => district.slug === resolvedSlug)
    : null;
  if (byPoint) return byPoint.id;

  const supplied = input.place.district.toLowerCase();
  return (
    city.districts.find(
      (district) =>
        district.slug.toLowerCase() === supplied || district.nameKey.toLowerCase() === supplied,
    )?.id ?? null
  );
}

async function incrementExistingBuildingCheck(
  building: CheckerBuilding,
  input: LocationCheckerInput,
  districtId: string | null,
  checkedAt: Date,
): Promise<CheckerBuilding> {
  return prisma.building.update({
    where: { id: building.id },
    data: {
      // Public input may fill gaps but must never rewrite canonical data already
      // attached by a listing/report. Otherwise a crafted POST could move a real
      // building and poison its cached score.
      ...(building.placeId == null ? { placeId: input.place.placeId } : {}),
      ...(building.lat == null ? { lat: input.place.lat } : {}),
      ...(building.lng == null ? { lng: input.place.lng } : {}),
      ...(building.postalCode == null && input.place.postalCode
        ? { postalCode: input.place.postalCode }
        : {}),
      ...(building.districtId == null && districtId ? { districtId } : {}),
      checksCount: { increment: 1 },
      lastCheckedAt: checkedAt,
    },
    select: checkerBuildingSelect,
  });
}

async function createBuildingWithSlug(
  city: CheckerCity,
  input: LocationCheckerInput,
  addressNormalized: string,
  districtId: string | null,
  checkedAt: Date,
  slug: string,
): Promise<CheckerBuilding> {
  const addressFull = `${input.place.street} ${input.place.buildingNumber}`;
  return prisma.building.create({
    data: {
      cityId: city.id,
      slug,
      districtId,
      street: input.place.street,
      buildingNumber: input.place.buildingNumber,
      addressFull,
      addressNormalized,
      lat: input.place.lat,
      lng: input.place.lng,
      placeId: input.place.placeId,
      postalCode: input.place.postalCode || null,
      checksCount: 1,
      lastCheckedAt: checkedAt,
    },
    select: checkerBuildingSelect,
  });
}

/**
 * Find-or-create after the IP limiter. New rows start at one check atomically;
 * a P2002 loser re-reads the winner and records this request as another check.
 */
async function findOrCreateCheckedBuilding(
  city: CheckerCity,
  input: LocationCheckerInput,
): Promise<CheckerBuilding> {
  const addressNormalized = normalizeAddress(input.place.street, input.place.buildingNumber);
  const districtId = matchDistrict(city, input);
  const checkedAt = new Date();

  const existing = await findExistingBuilding(city.id, input.place.placeId, addressNormalized);
  if (existing) {
    return incrementExistingBuildingCheck(existing, input, districtId, checkedAt);
  }

  // Count only recent rows that the checker has actually touched. Never-checked
  // listing/report buildings stay at checksCount=0; a very recently created row
  // that is then checked counts conservatively. Existing rows bypass the breaker
  // above, cached or not.
  const recentCheckerBuildings = await prisma.building.count({
    where: {
      createdAt: { gt: new Date(checkedAt.getTime() - LOCATION_CHECK_GLOBAL_CREATE_WINDOW_MS) },
      checksCount: { gt: 0 },
    },
  });

  if (recentCheckerBuildings >= LOCATION_CHECK_GLOBAL_CREATE_LIMIT) {
    // A concurrent request may have created this exact address between our read
    // and the breaker count. Let that now-existing building through.
    const raced = await findExistingBuilding(city.id, input.place.placeId, addressNormalized);
    if (raced) {
      return incrementExistingBuildingCheck(raced, input, districtId, checkedAt);
    }
    throw new GlobalCreateLimitError();
  }

  const baseSlug = generateBuildingSlug(input.place.street, input.place.buildingNumber);
  try {
    return await createBuildingWithSlug(
      city,
      input,
      addressNormalized,
      districtId,
      checkedAt,
      baseSlug,
    );
  } catch (error) {
    if (!isPrismaUniqueConstraintError(error)) throw error;
  }

  const raced = await findExistingBuilding(city.id, input.place.placeId, addressNormalized);
  if (raced) {
    return incrementExistingBuildingCheck(raced, input, districtId, checkedAt);
  }

  // The conflict was a slug collision with a different normalized address.
  // Retry once with a stable Places-derived suffix, retaining race recovery.
  const suffixedSlug = `${baseSlug}-${placeIdSlugSuffix(input.place.placeId)}`;
  try {
    return await createBuildingWithSlug(
      city,
      input,
      addressNormalized,
      districtId,
      checkedAt,
      suffixedSlug,
    );
  } catch (error) {
    if (!isPrismaUniqueConstraintError(error)) throw error;
    const secondRace = await findExistingBuilding(city.id, input.place.placeId, addressNormalized);
    if (!secondRace) throw error;
    return incrementExistingBuildingCheck(secondRace, input, districtId, checkedAt);
  }
}

function centerCoordinate(building: CheckerBuilding) {
  if (building.city.lat == null || building.city.lng == null) return undefined;
  const lat = Number(building.city.lat);
  const lng = Number(building.city.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
}

async function computeAndCacheScore(building: CheckerBuilding): Promise<CheckerScore | null> {
  if (building.lat == null || building.lng == null) return null;
  const origin = { lat: Number(building.lat), lng: Number(building.lng) };
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return null;

  let result: LocationScoreResult | null;
  try {
    result = await computeLocationScoreFromDb(
      building.city.slug,
      origin,
      centerCoordinate(building),
    );
  } catch {
    return null;
  }
  if (!result) return null;

  return prisma.buildingLocationScore.upsert({
    where: { buildingId: building.id },
    create: {
      buildingId: building.id,
      overall: result.overall,
      categories: result.categories as unknown as Prisma.InputJsonValue,
      version: SCORE_VERSION,
    },
    update: {
      overall: result.overall,
      categories: result.categories as unknown as Prisma.InputJsonValue,
      computedAt: new Date(),
      version: SCORE_VERSION,
    },
  });
}

async function getOrComputeScore(building: CheckerBuilding): Promise<CheckerScore | null> {
  if (building.locationScore && building.locationScore.version >= SCORE_VERSION) {
    return building.locationScore;
  }

  const retryAfter = scoreFailureCooldowns.get(building.id);
  if (retryAfter != null) {
    if (retryAfter > Date.now()) return null;
    scoreFailureCooldowns.delete(building.id);
  }

  const inFlight = inFlightScoreComputations.get(building.id);
  if (inFlight) return inFlight;

  const computation = computeAndCacheScore(building);
  inFlightScoreComputations.set(building.id, computation);
  try {
    const score = await computation;
    if (score) scoreFailureCooldowns.delete(building.id);
    else rememberScoreFailure(building.id);
    return score;
  } finally {
    if (inFlightScoreComputations.get(building.id) === computation) {
      inFlightScoreComputations.delete(building.id);
    }
  }
}

function toResponse(
  building: CheckerBuilding,
  score: { overall: number; categories: Prisma.JsonValue; computedAt: Date },
): LocationCheckerResponse {
  return {
    building: {
      id: building.id,
      slug: building.slug,
      address: building.addressFull,
      district: building.district?.nameKey ?? null,
      citySlug: building.city.slug,
      placeId: building.placeId,
    },
    score: {
      overall: score.overall,
      categories: score.categories,
      computedAt: score.computedAt,
    },
    costs: aggregateLocationCheckerCosts(building.costReports),
  };
}

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('INVALID_REQUEST', 'Invalid JSON.', 400);
  }

  const parsed = parseLocationCheckerInput(rawBody);
  if (!parsed.ok) return jsonError('INVALID_REQUEST', parsed.message, 400);
  if (parsed.data.citySlug !== LOCATION_CHECKER_CITY_SLUG) {
    return jsonError('CITY_NOT_FOUND', 'This city is not available.', 404);
  }

  const ip = getLocationCheckIp(request.headers);
  if (isLocationCheckRateLimited(ip)) {
    return jsonError('RATE_LIMITED', 'Too many checks. Please try again later.', 429);
  }

  const cityRecord = await prisma.city.findUnique({
    where: { slug: parsed.data.citySlug },
    include: { country: true, districts: true },
  });
  if (!cityRecord || !cityRecord.isActive) {
    return jsonError('CITY_NOT_FOUND', 'This city is not available.', 404);
  }

  const bounds = parseCityBounds(cityRecord.bounds);
  if (!bounds) {
    console.error(`[location-score] active city "${cityRecord.slug}" has invalid bounds`);
    return jsonError('CITY_UNAVAILABLE', 'This city is temporarily unavailable.', 503);
  }

  const canonicalTranslations = await getTranslations({
    locale: cityRecord.country.defaultLocale,
  });
  const canonicalCityName = canonicalTranslations(cityRecord.nameKey);
  const { place } = parsed.data;
  if (
    !isInsideCityBounds(place.lat, place.lng, bounds) ||
    !localityMatchesCity(place.city, cityRecord.slug, canonicalCityName)
  ) {
    return jsonError('ADDRESS_OUTSIDE_CITY', 'The selected address is outside this city.', 400);
  }

  let building: CheckerBuilding;
  try {
    building = await findOrCreateCheckedBuilding(cityRecord, parsed.data);
  } catch (error) {
    if (error instanceof GlobalCreateLimitError) {
      return jsonError('RATE_LIMITED', 'New address checks are temporarily limited.', 429);
    }
    console.error('[location-score] failed to persist checker building', error);
    return jsonError('INTERNAL_ERROR', 'Could not check this address.', 500);
  }

  const score = await getOrComputeScore(building);
  if (!score) {
    return jsonError('LOCATION_SCORE_UNAVAILABLE', 'Location score unavailable.', 503);
  }

  return NextResponse.json(toResponse(building, score));
}

/**
 * Read path for share links and dynamic OG metadata. It deliberately never
 * creates a building, increments checks, or calls Overpass.
 */
export async function GET(request: NextRequest) {
  const citySlug = request.nextUrl.searchParams.get('city')?.trim().toLowerCase();
  const placeId = request.nextUrl.searchParams.get('p')?.trim();
  if (!citySlug || !placeId || citySlug.length > 80 || placeId.length > 300) {
    return jsonError('INVALID_REQUEST', 'city and p are required.', 400);
  }
  if (citySlug !== LOCATION_CHECKER_CITY_SLUG) {
    return jsonError('CITY_NOT_FOUND', 'This city is not available.', 404);
  }

  const city = await prisma.city.findUnique({
    where: { slug: citySlug },
    select: { id: true, isActive: true },
  });
  if (!city || !city.isActive) {
    return jsonError('CITY_NOT_FOUND', 'This city is not available.', 404);
  }

  const building = await prisma.building.findFirst({
    where: { cityId: city.id, placeId },
    select: checkerBuildingSelect,
  });
  if (!building) {
    return jsonError('NOT_FOUND', 'No checked address was found.', 404);
  }
  if (!building.locationScore || building.locationScore.version < SCORE_VERSION) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(toResponse(building, building.locationScore));
}
