import { LOCATION_CHECKER_CITY_SLUG } from '@/lib/location-checker';

/**
 * Free-text address resolution for the bot.
 *
 * The website never needs this: its checker makes the user pick from Places
 * autocomplete, so it already holds a placeId. In a chat the user types
 * "Grójecka 45" (or "Груецкая 45"), so the bot has to resolve the string
 * itself before any of the checker logic can run.
 */

export interface GeocodedAddress {
  placeId: string;
  formatted: string;
  street: string;
  buildingNumber: string;
  lat: number;
  lng: number;
  city: string | null;
  postalCode: string | null;
  /** False when Google matched only a street/area, not a specific house. */
  isPrecise: boolean;
}

const ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';

// Warsaw viewport, biasing "Grójecka 45" to the right city without hard-filtering
// (the caller still checks city bounds, which is the actual guard).
const WARSAW_BOUNDS = '52.0978,20.8512|52.3681,21.2711';

type GoogleComponent = { long_name: string; short_name: string; types: string[] };
type GoogleResult = {
  place_id?: string;
  formatted_address?: string;
  address_components?: GoogleComponent[];
  geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
  types?: string[];
};

function component(components: GoogleComponent[], type: string): string | null {
  return components.find((c) => c.types.includes(type))?.long_name ?? null;
}

/**
 * Google returns a street-level match for "Grójecka" just as happily as a
 * rooftop match for "Grójecka 45", and the two mean very different things to a
 * tenant asking about their building — so precision is reported, not assumed.
 */
function isPreciseMatch(result: GoogleResult, buildingNumber: string | null): boolean {
  if (!buildingNumber) return false;
  const locationType = result.geometry?.location_type;
  return locationType === 'ROOFTOP' || locationType === 'RANGE_INTERPOLATED';
}

export async function geocodeAddress(
  query: string,
  citySlug: string = LOCATION_CHECKER_CITY_SLUG,
): Promise<GeocodedAddress | null> {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error('[bot/geocode] missing GOOGLE_GEOCODING_API_KEY');
    return null;
  }

  const trimmed = query.trim();
  if (!trimmed || trimmed.length > 200) return null;

  // The city name is appended rather than passed as a component filter so that
  // "Grójecka 45, Warszawa" (already qualified) still resolves cleanly.
  const address = /warsza|варша|warsaw/i.test(trimmed) ? trimmed : `${trimmed}, Warszawa`;

  const url = new URL(ENDPOINT);
  url.searchParams.set('address', address);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('language', 'pl');
  url.searchParams.set('region', 'pl');
  if (citySlug === LOCATION_CHECKER_CITY_SLUG) url.searchParams.set('bounds', WARSAW_BOUNDS);

  let payload: { status?: string; results?: GoogleResult[] };
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      console.error(`[bot/geocode] http ${response.status}`);
      return null;
    }
    payload = await response.json();
  } catch (error) {
    console.error('[bot/geocode] request failed', error);
    return null;
  }

  if (payload.status !== 'OK' || !payload.results?.length) return null;

  const result = payload.results[0];
  const components = result.address_components ?? [];
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  const placeId = result.place_id;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !placeId) return null;

  const street = component(components, 'route');
  const buildingNumber = component(components, 'street_number');
  if (!street) return null;

  return {
    placeId,
    formatted: result.formatted_address ?? address,
    street,
    buildingNumber: buildingNumber ?? '',
    lat,
    lng,
    city:
      component(components, 'locality') ??
      component(components, 'administrative_area_level_2') ??
      null,
    postalCode: component(components, 'postal_code'),
    isPrecise: isPreciseMatch(result, buildingNumber),
  };
}
