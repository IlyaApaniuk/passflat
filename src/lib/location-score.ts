/**
 * Location score: rates how convenient a building's surroundings are based on
 * proximity to everyday infrastructure (shops, transit, pharmacies, etc.).
 *
 * POIs come from OpenStreetMap via the public Overpass API. Distances are
 * straight-line (haversine). The result is cached per building in the DB, so
 * this only runs once per building (Overpass is not hit on every page view).
 */

export const SCORE_VERSION = 2;

export interface Coord {
  lat: number;
  lng: number;
}

export interface CategoryConfig {
  key: string;
  /** Overpass QL filter fragments, e.g. `["amenity"="pharmacy"]`. */
  filters: string[];
  /** Predicate that decides whether a POI's tags belong to this category. */
  match: (tags: Record<string, string>) => boolean;
  weight: number;
  /** Distance (m) at or below which the category scores 100. */
  idealM: number;
  /** Distance (m) at or above which the category scores 0. */
  maxM: number;
}

export interface CategoryResult {
  key: string;
  score: number;
  nearestM: number | null;
  name: string | null;
}

export interface LocationScoreResult {
  overall: number;
  categories: CategoryResult[];
}

interface Poi extends Coord {
  tags: Record<string, string>;
}

const has = (tags: Record<string, string>, key: string, values: string[]) =>
  tags[key] != null && values.includes(tags[key]);

export const CATEGORIES: CategoryConfig[] = [
  {
    key: 'supermarket',
    filters: ['["shop"="supermarket"]'],
    match: (t) => has(t, 'shop', ['supermarket']),
    weight: 20,
    idealM: 300,
    maxM: 1500,
  },
  {
    key: 'transitRail',
    filters: ['["railway"~"^(station|halt)$"]', '["station"="subway"]'],
    match: (t) => has(t, 'railway', ['station', 'halt']) || has(t, 'station', ['subway']),
    weight: 15,
    idealM: 400,
    maxM: 2000,
  },
  {
    key: 'pharmacy',
    filters: ['["amenity"="pharmacy"]'],
    match: (t) => has(t, 'amenity', ['pharmacy']),
    weight: 12,
    idealM: 300,
    maxM: 1200,
  },
  {
    key: 'transitBasic',
    filters: [
      '["highway"="bus_stop"]',
      '["railway"="tram_stop"]',
      '["public_transport"="station"]',
    ],
    match: (t) =>
      has(t, 'highway', ['bus_stop']) ||
      has(t, 'railway', ['tram_stop']) ||
      has(t, 'public_transport', ['station']),
    weight: 10,
    idealM: 150,
    maxM: 600,
  },
  {
    key: 'convenience',
    filters: ['["shop"~"^(convenience|grocery|greengrocer)$"]'],
    match: (t) => has(t, 'shop', ['convenience', 'grocery', 'greengrocer']),
    weight: 10,
    idealM: 200,
    maxM: 800,
  },
  {
    key: 'dining',
    filters: ['["amenity"~"^(cafe|restaurant|bar|fast_food)$"]'],
    match: (t) => has(t, 'amenity', ['cafe', 'restaurant', 'bar', 'fast_food']),
    weight: 8,
    idealM: 250,
    maxM: 1000,
  },
  {
    key: 'education',
    filters: ['["amenity"~"^(school|kindergarten)$"]'],
    match: (t) => has(t, 'amenity', ['school', 'kindergarten']),
    weight: 8,
    idealM: 500,
    maxM: 2000,
  },
  {
    key: 'parks',
    filters: ['["leisure"~"^(park|garden)$"]'],
    match: (t) => has(t, 'leisure', ['park', 'garden']),
    weight: 7,
    idealM: 300,
    maxM: 1200,
  },
];

/** Weight for the "center" virtual category (not in CATEGORIES because it has no Overpass query). */
export const CENTER_WEIGHT = 10;
export const CENTER_IDEAL_M = 2000;
export const CENTER_MAX_M = 10000;

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two coordinates, in meters. */
export function haversineMeters(a: Coord, b: Coord): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Maps a distance to a 0-100 score: full score within `idealM`, zero at/after
 * `maxM`, linear in between.
 */
export function scoreFromDistance(meters: number, idealM: number, maxM: number): number {
  if (meters <= idealM) return 100;
  if (meters >= maxM) return 0;
  return Math.round((100 * (maxM - meters)) / (maxM - idealM));
}

/**
 * Computes per-category scores and a weighted overall from nearby POIs.
 * If `centerCoord` is provided, an additional "center" category is included
 * based on straight-line distance to the city center.
 */
export function scorePois(origin: Coord, pois: Poi[], centerCoord?: Coord): LocationScoreResult {
  const categories = CATEGORIES.map<CategoryResult>((category) => {
    let nearestM: number | null = null;
    let name: string | null = null;

    for (const poi of pois) {
      if (!category.match(poi.tags)) continue;
      const d = haversineMeters(origin, poi);
      if (nearestM === null || d < nearestM) {
        nearestM = d;
        name = poi.tags.name ?? null;
      }
    }

    const score =
      nearestM === null ? 0 : scoreFromDistance(nearestM, category.idealM, category.maxM);

    return {
      key: category.key,
      score,
      nearestM: nearestM === null ? null : Math.round(nearestM),
      name,
    };
  });

  let totalWeight = CATEGORIES.reduce((sum, c) => sum + c.weight, 0);
  let weighted = categories.reduce(
    (sum, result, i) => sum + result.score * CATEGORIES[i].weight,
    0,
  );

  if (centerCoord) {
    const centerDistM = haversineMeters(origin, centerCoord);
    const centerScore = scoreFromDistance(centerDistM, CENTER_IDEAL_M, CENTER_MAX_M);
    categories.push({
      key: 'center',
      score: centerScore,
      nearestM: Math.round(centerDistM),
      name: null,
    });
    totalWeight += CENTER_WEIGHT;
    weighted += centerScore * CENTER_WEIGHT;
  }

  const overall = Math.round(weighted / totalWeight);

  return { overall, categories };
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const SEARCH_RADIUS_M = Math.max(...CATEGORIES.map((c) => c.maxM));

export function buildOverpassQuery(origin: Coord, radiusM = SEARCH_RADIUS_M): string {
  const around = `(around:${radiusM},${origin.lat},${origin.lng})`;
  const parts = CATEGORIES.flatMap((c) => c.filters).map((filter) => `nwr${filter}${around};`);
  return `[out:json][timeout:25];(${parts.join('')});out center tags;`;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function toPois(elements: OverpassElement[]): Poi[] {
  const pois: Poi[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    pois.push({ lat, lng, tags: el.tags ?? {} });
  }
  return pois;
}

async function fetchOverpass(query: string): Promise<Poi[]> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Passflat/1.0 (location-score)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!res.ok) {
        lastError = new Error(`Overpass ${endpoint} responded ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { elements?: OverpassElement[] };
      return toPois(json.elements ?? []);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Overpass request failed');
}

/**
 * Fetches nearby POIs and computes the location score for a coordinate.
 * Pass `centerCoord` (the city center) for the center-distance category.
 */
export async function computeLocationScore(
  origin: Coord,
  centerCoord?: Coord,
): Promise<LocationScoreResult> {
  const pois = await fetchOverpass(buildOverpassQuery(origin));
  return scorePois(origin, pois, centerCoord);
}
