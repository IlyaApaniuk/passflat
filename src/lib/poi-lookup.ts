import { prisma } from '@/lib/prisma';
import {
  CATEGORIES,
  scoreCategorizedPois,
  type CategorizedPoi,
  type Coord,
  type LocationScoreResult,
} from '@/lib/location-score';

/** Nothing beyond the widest category radius can affect any category's score. */
const SEARCH_RADIUS_M = Math.max(...CATEGORIES.map((category) => category.maxM));

/**
 * Metres per degree on the same sphere `haversineMeters` uses (R·π/180). The
 * equatorial 111_320 would make the window marginally *smaller* than the
 * radius and clip POIs sitting right on the edge.
 */
const METERS_PER_DEGREE_LAT = 111_194.93;
/** Absorbs floating-point error so the window never lands just inside. */
const BOX_MARGIN = 1.001;
const MIN_COS_LAT = 0.01;

/**
 * Latitude/longitude window covering `radiusM` around a point. The window is a
 * superset of the circle — exact distances are still filtered by haversine
 * during scoring — which is what lets the query use the plain btree index on
 * (city_slug, lat, lng) instead of requiring PostGIS.
 */
export function boundingBoxAround(origin: Coord, radiusM = SEARCH_RADIUS_M) {
  const reach = radiusM * BOX_MARGIN;
  const latDelta = reach / METERS_PER_DEGREE_LAT;
  const cosLat = Math.max(Math.abs(Math.cos((origin.lat * Math.PI) / 180)), MIN_COS_LAT);
  const lngDelta = reach / (METERS_PER_DEGREE_LAT * cosLat);

  return {
    minLat: origin.lat - latDelta,
    maxLat: origin.lat + latDelta,
    minLng: origin.lng - lngDelta,
    maxLng: origin.lng + lngDelta,
  };
}

/** POIs near a point, read from the locally imported `pois` table. */
export async function findNearbyPois(
  citySlug: string,
  origin: Coord,
  radiusM = SEARCH_RADIUS_M,
): Promise<CategorizedPoi[]> {
  const box = boundingBoxAround(origin, radiusM);

  const rows = await prisma.poi.findMany({
    where: {
      citySlug,
      lat: { gte: box.minLat, lte: box.maxLat },
      lng: { gte: box.minLng, lte: box.maxLng },
    },
    select: { category: true, name: true, lat: true, lng: true },
  });

  return rows.map((row) => ({
    category: row.category,
    name: row.name,
    lat: Number(row.lat),
    lng: Number(row.lng),
  }));
}

/**
 * Location score for a coordinate, computed entirely from local data.
 *
 * Returns null when the city has no imported POIs at all: that means the
 * import has not run yet, and a "nothing is nearby" score of 0 would be a lie
 * rather than a measurement.
 */
export async function computeLocationScoreFromDb(
  citySlug: string,
  origin: Coord,
  centerCoord?: Coord,
): Promise<LocationScoreResult | null> {
  const pois = await findNearbyPois(citySlug, origin);

  if (pois.length === 0) {
    const cityHasPois = await prisma.poi.count({ where: { citySlug }, take: 1 });
    if (cityHasPois === 0) return null;
  }

  return scoreCategorizedPois(origin, pois, centerCoord);
}
