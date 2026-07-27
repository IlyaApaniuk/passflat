import { prisma } from '@/lib/prisma';
import { haversineMeters, type Coord } from '@/lib/location-score';
import { boundingBoxAround } from '@/lib/poi-lookup';

/**
 * Things nearby that a listing will never mention: sirens, rail, late-night
 * crowds.
 *
 * These deliberately sit *beside* the location score rather than inside it.
 * Folding them into the number would both invalidate its calibration and
 * average away the point — a fire station is a dealbreaker for a light sleeper
 * and irrelevant to someone who works nights. We state the fact and the
 * distance; the reader decides.
 *
 * Only categories that OpenStreetMap maps consistently are included. Where
 * coverage is patchy (industrial land, bar closing times), a missing signal
 * would read as "there is none" when it actually means "we don't know".
 *
 * Roads are absent on purpose: a way's `out center` is the centroid of the
 * whole street, which for a long avenue lands kilometres from the address.
 * Distance to the nearest point of a line needs geometry we don't do yet.
 */
export interface NuisanceConfig {
  key: string;
  /** Overpass QL filter fragments, mirroring CategoryConfig.filters. */
  filters: string[];
  match: (tags: Record<string, string>) => boolean;
  /** How far out this is still worth mentioning. */
  radiusM: number;
  /**
   * 'nearest' reports the closest one; 'count' reports how many are around,
   * because one bar down the street is nothing and six is a party street.
   */
  report: 'nearest' | 'count';
}

const has = (tags: Record<string, string>, key: string, values: string[]) =>
  tags[key] != null && values.includes(tags[key]);

export const NUISANCES: NuisanceConfig[] = [
  {
    key: 'fireStation',
    filters: ['["amenity"="fire_station"]'],
    match: (t) => has(t, 'amenity', ['fire_station']),
    radiusM: 700,
    report: 'nearest',
  },
  {
    key: 'hospital',
    filters: ['["amenity"="hospital"]'],
    match: (t) => has(t, 'amenity', ['hospital']),
    radiusM: 700,
    report: 'nearest',
  },
  {
    key: 'railway',
    filters: ['["railway"~"^(rail|light_rail)$"]'],
    match: (t) => has(t, 'railway', ['rail', 'light_rail']),
    radiusM: 400,
    report: 'nearest',
  },
  {
    key: 'nightclub',
    filters: ['["amenity"="nightclub"]'],
    match: (t) => has(t, 'amenity', ['nightclub']),
    radiusM: 300,
    report: 'nearest',
  },
  {
    key: 'bars',
    filters: ['["amenity"~"^(bar|pub)$"]'],
    match: (t) => has(t, 'amenity', ['bar', 'pub']),
    radiusM: 150,
    report: 'count',
  },
];

const NUISANCE_KEYS = new Set(NUISANCES.map((n) => n.key));
const MAX_NUISANCE_RADIUS_M = Math.max(...NUISANCES.map((n) => n.radiusM));

export interface NuisanceResult {
  key: string;
  /** Distance to the closest one, in metres. */
  nearestM: number;
  name: string | null;
  /** How many sit within the category's radius — the point of the 'count' kind. */
  count: number;
  report: NuisanceConfig['report'];
}

/** Every category an OSM object belongs to, for the import to store. */
export function categorizeNuisanceTags(tags: Record<string, string>): string[] {
  return NUISANCES.filter((nuisance) => nuisance.match(tags)).map((nuisance) => nuisance.key);
}

/**
 * Nuisances around a point, read from the locally imported `pois` table.
 * Categories with nothing in range are omitted rather than reported as zero:
 * the block lists what is there, not what is absent.
 */
export async function findNuisances(citySlug: string, origin: Coord): Promise<NuisanceResult[]> {
  const box = boundingBoxAround(origin, MAX_NUISANCE_RADIUS_M);

  const rows = await prisma.poi.findMany({
    where: {
      citySlug,
      category: { in: [...NUISANCE_KEYS] },
      lat: { gte: box.minLat, lte: box.maxLat },
      lng: { gte: box.minLng, lte: box.maxLng },
    },
    select: { category: true, name: true, lat: true, lng: true },
  });

  return NUISANCES.flatMap((nuisance) => {
    const matches = rows
      .filter((row) => row.category === nuisance.key)
      .map((row) => ({
        name: row.name,
        distanceM: haversineMeters(origin, { lat: Number(row.lat), lng: Number(row.lng) }),
      }))
      // The box is a superset of the circle, so trim the corners.
      .filter((match) => match.distanceM <= nuisance.radiusM)
      .sort((a, b) => a.distanceM - b.distanceM);

    const nearest = matches[0];
    if (!nearest) return [];

    return [
      {
        key: nuisance.key,
        nearestM: Math.round(nearest.distanceM),
        name: nearest.name,
        count: matches.length,
        report: nuisance.report,
      },
    ];
  });
}
