import { describe, expect, it } from 'vitest';

import { boundingBoxAround } from './poi-lookup';
import { CATEGORIES, haversineMeters } from './location-score';

const WARSAW = { lat: 52.2297, lng: 21.0122 };
const WIDEST_RADIUS_M = Math.max(...CATEGORIES.map((c) => c.maxM));

describe('boundingBoxAround', () => {
  it('brackets the origin', () => {
    const box = boundingBoxAround(WARSAW, 1000);
    expect(box.minLat).toBeLessThan(WARSAW.lat);
    expect(box.maxLat).toBeGreaterThan(WARSAW.lat);
    expect(box.minLng).toBeLessThan(WARSAW.lng);
    expect(box.maxLng).toBeGreaterThan(WARSAW.lng);
  });

  it('contains every point within the radius', () => {
    // The box must never clip a POI that scoring would still count, so its
    // edges have to sit at or beyond the radius in both axes.
    const radiusM = 1500;
    const box = boundingBoxAround(WARSAW, radiusM);

    expect(haversineMeters(WARSAW, { lat: box.maxLat, lng: WARSAW.lng })).toBeGreaterThanOrEqual(
      radiusM,
    );
    expect(haversineMeters(WARSAW, { lat: WARSAW.lat, lng: box.maxLng })).toBeGreaterThanOrEqual(
      radiusM,
    );
    expect(haversineMeters(WARSAW, { lat: box.minLat, lng: WARSAW.lng })).toBeGreaterThanOrEqual(
      radiusM,
    );
    expect(haversineMeters(WARSAW, { lat: WARSAW.lat, lng: box.minLng })).toBeGreaterThanOrEqual(
      radiusM,
    );
  });

  it('widens longitude faster than latitude away from the equator', () => {
    const box = boundingBoxAround(WARSAW, 1000);
    expect(box.maxLng - box.minLng).toBeGreaterThan(box.maxLat - box.minLat);
  });

  it('defaults to the widest category radius', () => {
    expect(boundingBoxAround(WARSAW)).toEqual(boundingBoxAround(WARSAW, WIDEST_RADIUS_M));
  });

  it('stays finite near the poles', () => {
    // cos(lat) collapses to 0 at the pole; without a floor the longitude delta
    // would be Infinity and the query would scan the table.
    const box = boundingBoxAround({ lat: 89.999, lng: 0 }, 1000);
    expect(Number.isFinite(box.minLng)).toBe(true);
    expect(Number.isFinite(box.maxLng)).toBe(true);
  });
});
