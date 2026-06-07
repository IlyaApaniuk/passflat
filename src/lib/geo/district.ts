import warsawDistricts from './warsaw-districts.json';

// A ring is a closed list of [lng, lat] coordinate pairs (GeoJSON order).
type Ring = [number, number][];
// A polygon is an outer ring followed by zero or more hole rings.
type Polygon = Ring[];
// A district shape is a MultiPolygon: a list of polygons.
type MultiPolygon = Polygon[];

// City slug -> district slug -> polygon geometry. Bundled, server-side only:
// used purely as a fallback when we cannot resolve a district by name, so it
// never touches the request hot path or the database.
const DISTRICT_SHAPES: Record<string, Record<string, MultiPolygon>> = {
  warsaw: warsawDistricts as unknown as Record<string, MultiPolygon>,
};

// Standard ray-casting test for a point against a single ring.
function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// A point is inside a polygon when it is inside the outer ring and outside all holes.
function pointInPolygon(lng: number, lat: number, polygon: Polygon): boolean {
  if (!pointInRing(lng, lat, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) {
    if (pointInRing(lng, lat, polygon[h])) return false;
  }
  return true;
}

function pointInMultiPolygon(lng: number, lat: number, shape: MultiPolygon): boolean {
  return shape.some((polygon) => pointInPolygon(lng, lat, polygon));
}

/**
 * Resolve a district slug from a geographic point, by testing the point against
 * each district's boundary polygon. Returns null when the city has no bundled
 * shapes or the point falls outside every district. Used as a fallback when the
 * Google Places component name does not match a known district.
 */
export function resolveDistrictByPoint(citySlug: string, lat: number, lng: number): string | null {
  const shapes = DISTRICT_SHAPES[citySlug];
  if (!shapes) return null;
  for (const [slug, shape] of Object.entries(shapes)) {
    if (pointInMultiPolygon(lng, lat, shape)) return slug;
  }
  return null;
}
