import { describe, expect, it } from 'vitest';

import {
  CATEGORIES,
  CENTER_IDEAL_M,
  CENTER_MAX_M,
  CENTER_WEIGHT,
  DENSITY_WEIGHT,
  NEARBY_LIMIT,
  buildOverpassBboxQuery,
  categorizeTags,
  haversineMeters,
  scoreCategorizedPois,
  scoreFromDistance,
  type CategorizedPoi,
} from './location-score';

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters({ lat: 52.23, lng: 21.01 }, { lat: 52.23, lng: 21.01 })).toBe(0);
  });

  it('approximates a known short distance', () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 });
    expect(d).toBeGreaterThan(108);
    expect(d).toBeLessThan(114);
  });
});

describe('scoreFromDistance', () => {
  it('returns 100 at or below the ideal distance', () => {
    expect(scoreFromDistance(0, 300, 1500)).toBe(100);
    expect(scoreFromDistance(300, 300, 1500)).toBe(100);
  });

  it('returns 0 at or beyond the max distance', () => {
    expect(scoreFromDistance(1500, 300, 1500)).toBe(0);
    expect(scoreFromDistance(5000, 300, 1500)).toBe(0);
  });

  it('decays linearly in between', () => {
    expect(scoreFromDistance(900, 300, 1500)).toBe(50);
  });
});

function sampleTagForCategory(category: (typeof CATEGORIES)[number]): Record<string, string> {
  if (category.match({ shop: 'supermarket' })) return { shop: 'supermarket' };
  if (category.match({ railway: 'station' })) return { railway: 'station' };
  if (category.match({ amenity: 'pharmacy' })) return { amenity: 'pharmacy' };
  if (category.match({ highway: 'bus_stop' })) return { highway: 'bus_stop' };
  if (category.match({ shop: 'convenience' })) return { shop: 'convenience' };
  if (category.match({ amenity: 'cafe' })) return { amenity: 'cafe' };
  if (category.match({ amenity: 'school' })) return { amenity: 'school' };
  if (category.match({ leisure: 'park' })) return { leisure: 'park' };
  throw new Error(`No sample tag for category ${category.key}`);
}

/** One POI per category, all sitting exactly on the origin. */
function poisAtOrigin(origin: { lat: number; lng: number }, named = false): CategorizedPoi[] {
  return CATEGORIES.map((category) => ({
    ...origin,
    category: category.key,
    name: named ? category.key : null,
  }));
}

describe('scoreCategorizedPois', () => {
  const origin = { lat: 52.23, lng: 21.01 };

  it('scores every category 0 with an empty POI list (no center)', () => {
    const result = scoreCategorizedPois(origin, []);
    expect(result.overall).toBe(0);
    expect(result.categories).toHaveLength(CATEGORIES.length);
    for (const c of result.categories) {
      expect(c.score).toBe(0);
      expect(c.nearestM).toBeNull();
    }
  });

  it('reports the nearest POI per category and full proximity when all sit at the origin', () => {
    const result = scoreCategorizedPois(origin, poisAtOrigin(origin, true));
    for (const c of result.categories) {
      expect(c.nearestM).toBe(0);
      expect(c.name).toBe(c.key);
    }
  });

  it('does not award a perfect category score to a single lone POI at the door', () => {
    // One shop on the doorstep is not the same as a well-served street, so the
    // density share of the score stays unearned.
    const [withDensity] = CATEGORIES.filter((c) => c.densityRadiusM && c.densityTarget);
    const lone = scoreCategorizedPois(origin, [
      { ...origin, category: withDensity.key, name: 'only one' },
    ]).categories.find((c) => c.key === withDensity.key)!;

    expect(lone.score).toBeLessThan(100);
    expect(lone.score).toBeGreaterThan(100 * (1 - DENSITY_WEIGHT) - 1);
  });

  it('reaches 100 for a category once the density target is met at the door', () => {
    const [withDensity] = CATEGORIES.filter((c) => c.densityRadiusM && c.densityTarget);
    const crowded = Array.from({ length: withDensity.densityTarget! }, (_, i) => ({
      ...origin,
      category: withDensity.key,
      name: `poi-${i}`,
    }));

    const result = scoreCategorizedPois(origin, crowded).categories.find(
      (c) => c.key === withDensity.key,
    )!;
    expect(result.score).toBe(100);
  });

  it('includes center category when centerCoord is provided', () => {
    const result = scoreCategorizedPois(origin, poisAtOrigin(origin), origin);
    expect(result.categories).toHaveLength(CATEGORIES.length + 1);
    const centerCat = result.categories.find((c) => c.key === 'center');
    expect(centerCat).toBeDefined();
    expect(centerCat!.score).toBe(100);
    expect(centerCat!.nearestM).toBe(0);
  });

  it('scores center ~62 at 5 km from city center', () => {
    const centerCoord = { lat: 52.2297, lng: 21.0122 };
    const fiveKmNorth = { lat: centerCoord.lat + 0.045, lng: centerCoord.lng };

    const result = scoreCategorizedPois(fiveKmNorth, [], centerCoord);
    const centerCat = result.categories.find((c) => c.key === 'center');
    expect(centerCat).toBeDefined();
    expect(centerCat!.score).toBeGreaterThan(55);
    expect(centerCat!.score).toBeLessThan(70);
  });

  it('scores center 0 at 10+ km from city center', () => {
    const centerCoord = { lat: 52.2297, lng: 21.0122 };
    const tenKmNorth = { lat: centerCoord.lat + 0.09, lng: centerCoord.lng };

    const result = scoreCategorizedPois(tenKmNorth, [], centerCoord);
    const centerCat = result.categories.find((c) => c.key === 'center');
    expect(centerCat).toBeDefined();
    expect(centerCat!.score).toBe(0);
  });

  it('lists the nearest named neighbours per category, capped and sorted', () => {
    const far = { lat: origin.lat + 0.01, lng: origin.lng };
    const pois: CategorizedPoi[] = [
      { ...far, category: 'supermarket', name: 'far' },
      { ...origin, category: 'supermarket', name: 'near' },
      { ...origin, category: 'supermarket', name: null },
      ...Array.from({ length: NEARBY_LIMIT + 2 }, (_, i) => ({
        lat: origin.lat + 0.002 * (i + 1),
        lng: origin.lng,
        category: 'supermarket',
        name: `extra-${i}`,
      })),
    ];

    const supermarket = scoreCategorizedPois(origin, pois).categories.find(
      (c) => c.key === 'supermarket',
    );
    expect(supermarket!.nearby).toHaveLength(NEARBY_LIMIT);
    expect(supermarket!.nearby![0]).toEqual({ name: 'near', distanceM: 0 });
    expect(supermarket!.nearby!.map((n) => n.name)).not.toContain(null);
    const distances = supermarket!.nearby!.map((n) => n.distanceM);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it('a far city center drags the overall below the POI-only ceiling', () => {
    const farCenter = { lat: origin.lat + 0.2, lng: origin.lng };
    const near = scoreCategorizedPois(origin, poisAtOrigin(origin), origin).overall;
    const far = scoreCategorizedPois(origin, poisAtOrigin(origin), farCenter).overall;

    const totalWeight = CATEGORIES.reduce((s, c) => s + c.weight, 0) + CENTER_WEIGHT;
    const poiWeight = CATEGORIES.reduce((s, c) => s + c.weight, 0);
    expect(far).toBeLessThan(near);
    expect(far).toBeLessThanOrEqual(Math.round((100 * poiWeight) / totalWeight));
  });
});

describe('center scoring constants', () => {
  it('has expected ideal and max distances', () => {
    expect(CENTER_IDEAL_M).toBe(1000);
    expect(CENTER_MAX_M).toBe(10000);
    expect(CENTER_WEIGHT).toBe(10);
  });
});

describe('categorizeTags', () => {
  it('maps a sample tag to its category', () => {
    for (const category of CATEGORIES) {
      expect(categorizeTags(sampleTagForCategory(category))).toContain(category.key);
    }
  });

  it('returns every matching category for one object', () => {
    // A rail station is both heavy rail and ordinary public transport.
    expect(categorizeTags({ railway: 'station', public_transport: 'station' })).toEqual(
      expect.arrayContaining(['transitRail', 'transitBasic']),
    );
  });

  it('returns nothing for an unrelated object', () => {
    expect(categorizeTags({ building: 'yes' })).toEqual([]);
  });
});

describe('buildOverpassBboxQuery', () => {
  const bbox = { north: 52.42, south: 52.05, east: 21.35, west: 20.75 };

  it('covers the bbox and every category filter', () => {
    const query = buildOverpassBboxQuery(bbox);
    expect(query).toContain('[out:json]');
    expect(query).toContain('(52.05,20.75,52.42,21.35)');
    expect(query).toContain('out center tags;');
    for (const filter of CATEGORIES.flatMap((c) => c.filters)) {
      expect(query).toContain(`nwr${filter}`);
    }
  });

  it('can query a single filter, which is how the import splits the work', () => {
    const query = buildOverpassBboxQuery(bbox, ['["amenity"="pharmacy"]']);
    expect(query.match(/nwr/g)).toHaveLength(1);
    expect(query).toContain('nwr["amenity"="pharmacy"]');
  });

  it('uses an import-sized timeout', () => {
    expect(buildOverpassBboxQuery(bbox, undefined, 240)).toContain('[timeout:240]');
  });
});
