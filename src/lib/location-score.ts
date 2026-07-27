/**
 * Location score: rates how convenient a building's surroundings are based on
 * proximity to everyday infrastructure (shops, transit, pharmacies, etc.).
 *
 * POIs come from OpenStreetMap, imported into our own `pois` table by
 * `prisma/import-osm-pois.ts`. Scoring therefore runs as a local bounding-box
 * query rather than a request-time call to a public Overpass instance: those
 * answer in 15-20s when they answer at all, allow two concurrent slots per IP,
 * and are explicitly not meant for production traffic. Overpass is still the
 * import source, but only offline, where slowness and retries are free.
 *
 * Distances are straight-line (haversine); results are cached per building.
 */

/** 4: `nearby` carries coordinates so the result can be drawn on a map. */
export const SCORE_VERSION = 4;

/** How many named neighbours each category keeps for the human-readable summary. */
export const NEARBY_LIMIT = 3;

/**
 * Share of a category's score that comes from density rather than proximity.
 * Warsaw is dense enough that proximity alone put 88% of addresses above 80,
 * which tells a visitor nothing about whether one address beats another.
 */
export const DENSITY_WEIGHT = 0.45;

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
  /** Distance (m) at or below which proximity scores 100. */
  idealM: number;
  /** Distance (m) at or above which proximity scores 0. */
  maxM: number;
  /**
   * Optional density component. Proximity alone cannot tell a street with one
   * lone shop from one with ten, and in a dense city almost every address has
   * *something* close by — which is what flattened the old scores. Where these
   * are set, `densityTarget` POIs within `densityRadiusM` earn full marks.
   */
  densityRadiusM?: number;
  densityTarget?: number;
}

export interface NearbyPoi extends Coord {
  name: string;
  distanceM: number;
}

export interface CategoryResult {
  key: string;
  score: number;
  nearestM: number | null;
  name: string | null;
  /**
   * Closest named neighbours, for the human-readable summary ("Żabka 42 m,
   * Biedronka 210 m"). Unnamed POIs still drive the score but cannot be
   * mentioned by name, so they never appear here.
   */
  nearby?: NearbyPoi[];
}

export interface LocationScoreResult {
  overall: number;
  categories: CategoryResult[];
}

const has = (tags: Record<string, string>, key: string, values: string[]) =>
  tags[key] != null && values.includes(tags[key]);

export const CATEGORIES: CategoryConfig[] = [
  {
    key: 'supermarket',
    filters: ['["shop"="supermarket"]'],
    match: (t) => has(t, 'shop', ['supermarket']),
    weight: 20,
    idealM: 150,
    maxM: 1000,
    densityRadiusM: 1000,
    densityTarget: 5,
  },
  {
    key: 'transitRail',
    filters: ['["railway"~"^(station|halt)$"]', '["station"="subway"]'],
    match: (t) => has(t, 'railway', ['station', 'halt']) || has(t, 'station', ['subway']),
    weight: 15,
    idealM: 250,
    maxM: 1500,
  },
  {
    key: 'pharmacy',
    filters: ['["amenity"="pharmacy"]'],
    match: (t) => has(t, 'amenity', ['pharmacy']),
    weight: 12,
    idealM: 150,
    maxM: 900,
    densityRadiusM: 800,
    densityTarget: 5,
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
    idealM: 80,
    maxM: 400,
    densityRadiusM: 500,
    densityTarget: 12,
  },
  {
    key: 'convenience',
    filters: ['["shop"~"^(convenience|grocery|greengrocer)$"]'],
    match: (t) => has(t, 'shop', ['convenience', 'grocery', 'greengrocer']),
    weight: 10,
    idealM: 100,
    maxM: 500,
    densityRadiusM: 600,
    densityTarget: 10,
  },
  {
    key: 'dining',
    filters: ['["amenity"~"^(cafe|restaurant|bar|fast_food)$"]'],
    match: (t) => has(t, 'amenity', ['cafe', 'restaurant', 'bar', 'fast_food']),
    weight: 8,
    idealM: 100,
    maxM: 600,
    densityRadiusM: 800,
    densityTarget: 30,
  },
  {
    key: 'education',
    filters: ['["amenity"~"^(school|kindergarten)$"]'],
    match: (t) => has(t, 'amenity', ['school', 'kindergarten']),
    weight: 8,
    idealM: 250,
    maxM: 1500,
    densityRadiusM: 1200,
    densityTarget: 6,
  },
  {
    key: 'parks',
    filters: ['["leisure"~"^(park|garden)$"]'],
    match: (t) => has(t, 'leisure', ['park', 'garden']),
    weight: 7,
    idealM: 150,
    maxM: 800,
    densityRadiusM: 1000,
    densityTarget: 6,
  },
];

/** Weight for the "center" virtual category (not in CATEGORIES because it has no Overpass query). */
export const CENTER_WEIGHT = 10;
export const CENTER_IDEAL_M = 1000;
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

/** Every category an OSM object belongs to — a rail station is also transit. */
export function categorizeTags(tags: Record<string, string>): string[] {
  return CATEGORIES.filter((category) => category.match(tags)).map((category) => category.key);
}

/** A POI already resolved to one of our categories (the shape stored in `pois`). */
export interface CategorizedPoi extends Coord {
  category: string;
  name: string | null;
}

/** Mixes the density component into a category's proximity score. */
function blendDensity(
  category: CategoryConfig,
  proximity: number,
  matches: Array<{ distanceM: number }>,
): number {
  const { densityRadiusM, densityTarget } = category;
  if (!densityRadiusM || !densityTarget) return proximity;

  const within = matches.filter((match) => match.distanceM <= densityRadiusM).length;
  const density = Math.min(100, (within / densityTarget) * 100);
  return Math.round(proximity * (1 - DENSITY_WEIGHT) + density * DENSITY_WEIGHT);
}

function scoreOneCategory(
  origin: Coord,
  category: CategoryConfig,
  pois: CategorizedPoi[],
): CategoryResult {
  const matches = pois
    .filter((poi) => poi.category === category.key)
    .map((poi) => ({
      name: poi.name,
      lat: poi.lat,
      lng: poi.lng,
      distanceM: haversineMeters(origin, poi),
    }))
    .sort((a, b) => a.distanceM - b.distanceM);

  const nearest = matches[0];
  const proximity =
    nearest === undefined
      ? 0
      : scoreFromDistance(nearest.distanceM, category.idealM, category.maxM);

  return {
    key: category.key,
    score: blendDensity(category, proximity, matches),
    nearestM: nearest === undefined ? null : Math.round(nearest.distanceM),
    name: nearest?.name ?? null,
    nearby: matches
      .filter((match): match is NearbyPoi & { name: string } => Boolean(match.name))
      .slice(0, NEARBY_LIMIT)
      .map((match) => ({
        name: match.name,
        lat: match.lat,
        lng: match.lng,
        distanceM: Math.round(match.distanceM),
      })),
  };
}

/**
 * Computes per-category scores and a weighted overall from already-categorized
 * POIs (the local `pois` table). If `centerCoord` is provided, an additional
 * "center" category is included based on distance to the city center.
 */
export function scoreCategorizedPois(
  origin: Coord,
  pois: CategorizedPoi[],
  centerCoord?: Coord,
): LocationScoreResult {
  return finalizeScore(
    origin,
    CATEGORIES.map((category) => scoreOneCategory(origin, category, pois)),
    centerCoord,
  );
}

function finalizeScore(
  origin: Coord,
  categories: CategoryResult[],
  centerCoord?: Coord,
): LocationScoreResult {
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

/** Rectangle covering a city, used to import that city's POIs in one pass. */
export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * An Overpass query over a whole city, for the given tag filters (all category
 * filters by default). Only the offline import runs this.
 *
 * The import splits filters across separate requests: asking for every category
 * over the Warsaw bbox in one go makes the public instances time out with a
 * 504, while one filter at a time answers comfortably.
 */
export function buildOverpassBboxQuery(
  bbox: BoundingBox,
  filters: string[] = CATEGORIES.flatMap((c) => c.filters),
  timeoutS = 180,
): string {
  const area = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
  const parts = filters.map((filter) => `nwr${filter}${area};`);
  return `[out:json][timeout:${timeoutS}];(${parts.join('')});out center tags;`;
}
