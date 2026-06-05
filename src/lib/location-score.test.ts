import { describe, expect, it } from 'vitest';

import {
  CATEGORIES,
  CENTER_IDEAL_M,
  CENTER_MAX_M,
  CENTER_WEIGHT,
  buildOverpassQuery,
  haversineMeters,
  scoreFromDistance,
  scorePois,
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

describe('scorePois', () => {
  const origin = { lat: 52.23, lng: 21.01 };

  it('scores every category 0 with an empty POI list (no center)', () => {
    const result = scorePois(origin, []);
    expect(result.overall).toBe(0);
    expect(result.categories).toHaveLength(CATEGORIES.length);
    for (const c of result.categories) {
      expect(c.score).toBe(0);
      expect(c.nearestM).toBeNull();
    }
  });

  it('picks the nearest POI per category and gives perfect score when all are at origin (no center)', () => {
    const pois = CATEGORIES.map((category) => ({
      ...origin,
      tags: { ...sampleTagForCategory(category), name: category.key },
    }));

    const result = scorePois(origin, pois);
    expect(result.overall).toBe(100);
    for (const c of result.categories) {
      expect(c.score).toBe(100);
      expect(c.nearestM).toBe(0);
      expect(c.name).toBe(c.key);
    }
  });

  it('includes center category when centerCoord is provided', () => {
    const pois = CATEGORIES.map((category) => ({
      ...origin,
      tags: sampleTagForCategory(category),
    }));
    const centerCoord = origin;

    const result = scorePois(origin, pois, centerCoord);
    expect(result.categories).toHaveLength(CATEGORIES.length + 1);
    const centerCat = result.categories.find((c) => c.key === 'center');
    expect(centerCat).toBeDefined();
    expect(centerCat!.score).toBe(100);
    expect(centerCat!.nearestM).toBe(0);
  });

  it('scores center ~62 at 5 km from city center', () => {
    const centerCoord = { lat: 52.2297, lng: 21.0122 };
    const fiveKmNorth = { lat: centerCoord.lat + 0.045, lng: centerCoord.lng };

    const result = scorePois(fiveKmNorth, [], centerCoord);
    const centerCat = result.categories.find((c) => c.key === 'center');
    expect(centerCat).toBeDefined();
    expect(centerCat!.score).toBeGreaterThan(55);
    expect(centerCat!.score).toBeLessThan(70);
  });

  it('scores center 0 at 10+ km from city center', () => {
    const centerCoord = { lat: 52.2297, lng: 21.0122 };
    const tenKmNorth = { lat: centerCoord.lat + 0.09, lng: centerCoord.lng };

    const result = scorePois(tenKmNorth, [], centerCoord);
    const centerCat = result.categories.find((c) => c.key === 'center');
    expect(centerCat).toBeDefined();
    expect(centerCat!.score).toBe(0);
  });

  it('center category weight affects overall score', () => {
    const pois = CATEGORIES.map((category) => ({
      ...origin,
      tags: sampleTagForCategory(category),
    }));

    const farCenter = { lat: origin.lat + 0.2, lng: origin.lng };
    const result = scorePois(origin, pois, farCenter);

    const totalWeight = CATEGORIES.reduce((s, c) => s + c.weight, 0) + CENTER_WEIGHT;
    const poiWeight = CATEGORIES.reduce((s, c) => s + c.weight, 0);
    const expectedMax = Math.round((100 * poiWeight) / totalWeight);
    expect(result.overall).toBeLessThanOrEqual(expectedMax);
    expect(result.overall).toBeGreaterThan(expectedMax - 2);
  });
});

describe('center scoring constants', () => {
  it('has expected ideal and max distances', () => {
    expect(CENTER_IDEAL_M).toBe(2000);
    expect(CENTER_MAX_M).toBe(10000);
    expect(CENTER_WEIGHT).toBe(10);
  });
});

describe('buildOverpassQuery', () => {
  it('includes the coordinates, a radius and every category filter', () => {
    const query = buildOverpassQuery({ lat: 52.23, lng: 21.01 }, 2000);
    expect(query).toContain('52.23');
    expect(query).toContain('21.01');
    expect(query).toContain('around:2000');
    expect(query).toContain('out:json');
    const filterCount = CATEGORIES.flatMap((c) => c.filters).length;
    expect(query.match(/nwr/g)).toHaveLength(filterCount);
  });
});
