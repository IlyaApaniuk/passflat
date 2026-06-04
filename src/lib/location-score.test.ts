import { describe, expect, it } from 'vitest';

import {
  CATEGORIES,
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
    // ~111.2 m per 0.001 deg of latitude near the equator.
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
    // Midpoint between ideal (300) and max (1500) is 900 -> ~50.
    expect(scoreFromDistance(900, 300, 1500)).toBe(50);
  });
});

describe('scorePois', () => {
  const origin = { lat: 52.23, lng: 21.01 };

  it('scores every category 0 with an empty POI list', () => {
    const result = scorePois(origin, []);
    expect(result.overall).toBe(0);
    expect(result.categories).toHaveLength(CATEGORIES.length);
    for (const c of result.categories) {
      expect(c.score).toBe(0);
      expect(c.nearestM).toBeNull();
    }
  });

  it('picks the nearest matching POI per category and gives a perfect overall when all are close', () => {
    const pois = CATEGORIES.map((category) => {
      const sampleTag: Record<string, string> = category.match({ shop: 'supermarket' })
        ? { shop: 'supermarket' }
        : category.match({ highway: 'bus_stop' })
          ? { highway: 'bus_stop' }
          : category.match({ amenity: 'pharmacy' })
            ? { amenity: 'pharmacy' }
            : category.match({ amenity: 'cafe' })
              ? { amenity: 'cafe' }
              : category.match({ amenity: 'school' })
                ? { amenity: 'school' }
                : { leisure: 'park' };
      return { ...origin, tags: { ...sampleTag, name: category.key } };
    });

    const result = scorePois(origin, pois);
    expect(result.overall).toBe(100);
    for (const c of result.categories) {
      expect(c.score).toBe(100);
      expect(c.nearestM).toBe(0);
      expect(c.name).toBe(c.key);
    }
  });
});

describe('buildOverpassQuery', () => {
  it('includes the coordinates, a radius and every category filter', () => {
    const query = buildOverpassQuery({ lat: 52.23, lng: 21.01 }, 1500);
    expect(query).toContain('52.23');
    expect(query).toContain('21.01');
    expect(query).toContain('around:1500');
    expect(query).toContain('out:json');
    const filterCount = CATEGORIES.flatMap((c) => c.filters).length;
    expect(query.match(/nwr/g)).toHaveLength(filterCount);
  });
});
