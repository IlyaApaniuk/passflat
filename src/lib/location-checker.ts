import { cleanStreet } from '@/lib/address';
import { median } from '@/lib/cost-stats';
import { transliterate } from '@/lib/slugify';

export const LOCATION_CHECK_RATE_LIMIT_WINDOW_MS = 60_000;
export const LOCATION_CHECK_RATE_LIMIT_MAX = 10;
export const LOCATION_CHECK_GLOBAL_CREATE_LIMIT = 200;
export const LOCATION_CHECK_GLOBAL_CREATE_WINDOW_MS = 60 * 60 * 1000;
export const LOCATION_CHECKER_CITY_SLUG = 'warsaw';
const LOCATION_CHECK_RATE_LIMIT_MAX_IPS = 10_000;

export interface LocationCheckerPlace {
  street: string;
  buildingNumber: string;
  district: string;
  city: string;
  postalCode: string;
  lat: number;
  lng: number;
  placeId: string;
  formattedAddress: string;
}

export interface LocationCheckerInput {
  citySlug: string;
  place: LocationCheckerPlace;
}

export interface CityBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface LocationCheckerCostReport {
  source: string;
  totalMonthlyAvg: unknown;
  rent: unknown;
}

export interface LocationCheckerCosts {
  totalMedian: number | null;
  rentMedian: number | null;
  expensesMedian: number | null;
  reportCount: number;
  tenantReportCount: number;
  sourceKind: 'tenant' | 'mixed' | 'scraped';
}

/** A neighbour with known costs, for the map layer only its own pages can show. */
export interface LocationCheckerNeighbour {
  id: string;
  slug: string;
  address: string;
  lat: number;
  lng: number;
  distanceM: number;
  totalMedian: number | null;
  reportCount: number;
}

export interface LocationCheckerResponse {
  building: {
    id: string;
    slug: string;
    address: string;
    district: string | null;
    citySlug: string;
    placeId: string | null;
    lat: number | null;
    lng: number | null;
  };
  score: {
    overall: number;
    categories: unknown;
    computedAt: Date;
  };
  costs: LocationCheckerCosts | null;
  /**
   * Buildings nearby that already have cost reports. Almost every checked
   * address has none of its own, so without these the result would end on a
   * dead "nobody has shared yet" — with them it still answers "what do people
   * pay around here".
   */
  neighbours: LocationCheckerNeighbour[];
}

export type LocationCheckerValidation =
  | { ok: true; data: LocationCheckerInput }
  | { ok: false; message: string };

const ipTimestamps = new Map<string, number[]>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringWithin(value: unknown, maxLength: number, allowEmpty = true): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    (allowEmpty || value.trim().length > 0)
  );
}

/** Validate and trim the public checker request before it reaches the database. */
export function parseLocationCheckerInput(value: unknown): LocationCheckerValidation {
  if (!isRecord(value) || !isStringWithin(value.citySlug, 80, false) || !isRecord(value.place)) {
    return { ok: false, message: 'Invalid checker request.' };
  }
  if (!/^[a-z0-9-]+$/i.test(value.citySlug.trim())) {
    return { ok: false, message: 'Invalid city slug.' };
  }

  const place = value.place;
  const stringFields = [
    ['street', 200, false],
    ['buildingNumber', 40, false],
    ['district', 120, true],
    ['city', 120, false],
    ['postalCode', 32, true],
    ['placeId', 300, false],
    ['formattedAddress', 500, true],
  ] as const;

  for (const [field, maxLength, allowEmpty] of stringFields) {
    if (!isStringWithin(place[field], maxLength, allowEmpty)) {
      return { ok: false, message: `Invalid place.${field}.` };
    }
  }

  if (
    typeof place.lat !== 'number' ||
    !Number.isFinite(place.lat) ||
    place.lat < -90 ||
    place.lat > 90 ||
    typeof place.lng !== 'number' ||
    !Number.isFinite(place.lng) ||
    place.lng < -180 ||
    place.lng > 180
  ) {
    return { ok: false, message: 'Invalid place coordinates.' };
  }

  // All fields have been narrowed by the loop + numeric checks above. TypeScript
  // cannot carry that narrowing through a computed-key loop, so make it explicit.
  const validatedPlace = place as unknown as LocationCheckerPlace;
  const street = cleanStreet(validatedPlace.street);
  const buildingNumber = validatedPlace.buildingNumber.trim();
  if (!street || !buildingNumber) {
    return { ok: false, message: 'A street and building number are required.' };
  }

  return {
    ok: true,
    data: {
      citySlug: value.citySlug.trim().toLowerCase(),
      place: {
        street,
        buildingNumber,
        district: validatedPlace.district.trim(),
        city: validatedPlace.city.trim(),
        postalCode: validatedPlace.postalCode.trim(),
        lat: validatedPlace.lat,
        lng: validatedPlace.lng,
        placeId: validatedPlace.placeId.trim(),
        formattedAddress: validatedPlace.formattedAddress.trim(),
      },
    },
  };
}

/** Parse the JSON bounds stored on City and reject malformed active-city config. */
export function parseCityBounds(value: unknown): CityBounds | null {
  if (!isRecord(value)) return null;
  const { north, south, east, west } = value;
  if (
    typeof north !== 'number' ||
    !Number.isFinite(north) ||
    typeof south !== 'number' ||
    !Number.isFinite(south) ||
    typeof east !== 'number' ||
    !Number.isFinite(east) ||
    typeof west !== 'number' ||
    !Number.isFinite(west) ||
    north < south ||
    east < west ||
    north > 90 ||
    south < -90 ||
    east > 180 ||
    west < -180
  ) {
    return null;
  }
  return { north, south, east, west };
}

export function isInsideCityBounds(lat: number, lng: number, bounds: CityBounds): boolean {
  return lat <= bounds.north && lat >= bounds.south && lng <= bounds.east && lng >= bounds.west;
}

function normalizeLocality(value: string): string {
  return transliterate(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Compare the Places locality to route slug + the city's name in its canonical
 * locale. Bounds alone are not enough because Warsaw's box includes suburbs.
 */
export function localityMatchesCity(
  locality: string,
  citySlug: string,
  canonicalCityName: string,
): boolean {
  const normalized = normalizeLocality(locality);
  if (!normalized) return false;
  return [citySlug, canonicalCityName].map(normalizeLocality).includes(normalized);
}

export function getLocationCheckIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

/** First-line, per-instance protection; the durable database breaker is separate. */
export function isLocationCheckRateLimited(ip: string, now = Date.now()): boolean {
  // A rotating-IP bot must not grow a serverless instance's module Map without
  // bound. First prune expired buckets; if all remaining buckets are hot, evict
  // the oldest insertion before adding a new IP. The durable DB breaker still
  // caps new-building writes across instances.
  if (!ipTimestamps.has(ip) && ipTimestamps.size >= LOCATION_CHECK_RATE_LIMIT_MAX_IPS) {
    for (const [knownIp, knownTimestamps] of ipTimestamps) {
      if (
        knownTimestamps.every((timestamp) => now - timestamp >= LOCATION_CHECK_RATE_LIMIT_WINDOW_MS)
      ) {
        ipTimestamps.delete(knownIp);
      }
    }
    while (ipTimestamps.size >= LOCATION_CHECK_RATE_LIMIT_MAX_IPS) {
      const oldestIp = ipTimestamps.keys().next().value as string | undefined;
      if (!oldestIp) break;
      ipTimestamps.delete(oldestIp);
    }
  }

  const timestamps = ipTimestamps.get(ip) ?? [];
  const recent = timestamps.filter(
    (timestamp) => now - timestamp < LOCATION_CHECK_RATE_LIMIT_WINDOW_MS,
  );

  if (recent.length >= LOCATION_CHECK_RATE_LIMIT_MAX) {
    ipTimestamps.set(ip, recent);
    return true;
  }

  recent.push(now);
  ipTimestamps.set(ip, recent);
  return false;
}

/** Test isolation for the module-scoped in-memory limiter. */
export function resetLocationCheckRateLimit(): void {
  ipTimestamps.clear();
}

function finiteNumber(value: unknown): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Public, source-aware cost teaser derived only from already-visible reports. */
export function aggregateLocationCheckerCosts(
  reports: LocationCheckerCostReport[],
): LocationCheckerCosts | null {
  if (reports.length === 0) return null;

  const tenantReportCount = reports.filter(
    (report) => report.source === 'user' || report.source === 'import',
  ).length;
  const scrapedCount = reports.filter((report) => report.source === 'scraped').length;

  const sourceKind: LocationCheckerCosts['sourceKind'] =
    scrapedCount === reports.length ? 'scraped' : scrapedCount > 0 ? 'mixed' : 'tenant';

  return {
    totalMedian: median(reports.map((report) => finiteNumber(report.totalMonthlyAvg))),
    rentMedian: median(reports.map((report) => finiteNumber(report.rent))),
    expensesMedian: median(
      reports.map((report) => {
        const total = finiteNumber(report.totalMonthlyAvg);
        const rent = finiteNumber(report.rent);
        return total != null && rent != null ? Math.max(0, total - rent) : null;
      }),
    ),
    reportCount: reports.length,
    tenantReportCount,
    sourceKind,
  };
}

/** Stable suffix for the rare case where two normalized addresses map to one slug. */
export function placeIdSlugSuffix(placeId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < placeId.length; i += 1) {
    hash ^= placeId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return isRecord(error) && error.code === 'P2002';
}
