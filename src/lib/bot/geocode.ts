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

const CYRILLIC = /[\u0400-\u04FF]/;
const VOWELS = 'аеёиоуыэюяєіїАЕЁИОУЫЭЮЯЄІЇ';
const SOFT_OR_HARD = 'ьъЬЪ';

// Cyrillic → Polish spelling, not the English-style "Grujetskaya". The diaspora
// types Polish street names by ear, and Google resolves "Grujecka" to Grójecka
// but returns only a city-level guess for "Груецкая".
const BASE: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'w',
  г: 'g',
  ґ: 'g',
  д: 'd',
  ж: 'ż',
  з: 'z',
  и: 'i',
  і: 'i',
  й: 'j',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'ch',
  ц: 'c',
  ч: 'cz',
  ш: 'sz',
  щ: 'szcz',
  ы: 'y',
  э: 'e',
  ь: '',
  ъ: '',
};
// Iotated vowels: "je/ja/ju" at the start of a word or after a vowel or a soft
// sign, "ie/ia/iu" after a consonant (Пулавская → Puławska, Груецкая → Grujecka).
const IOTATED: Record<string, [string, string]> = {
  е: ['je', 'e'],
  ё: ['jo', 'io'],
  ю: ['ju', 'iu'],
  я: ['ja', 'ia'],
  є: ['je', 'ie'],
  ї: ['ji', 'ji'],
};

/**
 * Polish-style transliteration of a Cyrillic address.
 *
 * Endings are folded afterwards, on the Latin output (JS `\b` does not see
 * Cyrillic letters): Polish street names are adjectives — Puławska, Nowy Świat,
 * Krasińskiego — and "Pulawskaja" or "Krasinskogo" match worse than the
 * Polish form.
 */
export function transliterateToPolish(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const lower = ch.toLowerCase();
    const isUpper = ch !== lower;
    const prev = i > 0 ? input[i - 1] : '';
    let mapped: string;

    if (lower in IOTATED) {
      const afterVowelOrStart =
        !prev || !CYRILLIC.test(prev) || VOWELS.includes(prev) || SOFT_OR_HARD.includes(prev);
      mapped = IOTATED[lower][afterVowelOrStart ? 0 : 1];
    } else if (lower in BASE) {
      mapped = BASE[lower];
    } else {
      out += ch;
      continue;
    }

    out += isUpper && mapped ? mapped[0].toUpperCase() + mapped.slice(1) : mapped;
  }

  return out
    .replace(/aja\b/g, 'a')
    .replace(/(?:yj|ij|oj)\b/g, 'y')
    .replace(/([sc])kogo\b/g, '$1kiego');
}

async function requestGeocode(
  address: string,
  apiKey: string,
  citySlug: string,
): Promise<GeocodedAddress | null> {
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

  // No street means Google fell back to the city itself ("Warszawa, Polska") —
  // a guess, not an answer, so it is treated as not found.
  const street = component(components, 'route');
  if (!street) return null;
  const buildingNumber = component(components, 'street_number');

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
    // A returned house number is a house, whatever the location_type: Google
    // reports real buildings as GEOMETRIC_CENTER as well as ROOFTOP.
    isPrecise: buildingNumber != null,
  };
}

const [SOUTH, WEST, NORTH, EAST] = WARSAW_BOUNDS.split(/[,|]/).map(Number);

function insideWarsaw(geo: GeocodedAddress): boolean {
  return geo.lat >= SOUTH && geo.lat <= NORTH && geo.lng >= WEST && geo.lng <= EAST;
}

export async function geocodeAddress(
  query: string,
  citySlug: string = LOCATION_CHECKER_CITY_SLUG,
): Promise<GeocodedAddress | null> {
  const apiKey = process.env.GEOCODING_API_SERVER_KEY;
  if (!apiKey) {
    console.error('[bot/geocode] missing GEOCODING_API_SERVER_KEY');
    return null;
  }

  const trimmed = query.trim();
  if (!trimmed || trimmed.length > 200) return null;

  // Cyrillic goes transliterated first: raw "Пулавская 10" resolves to a street
  // in Kharkiv, and `bounds` is only a bias, not a filter.
  const attempts = CYRILLIC.test(trimmed) ? [transliterateToPolish(trimmed), trimmed] : [trimmed];

  // The query is sent as typed, not with ", Warszawa" appended, which turned
  // "Kraków Floriańska 10" into a Warsaw street and answered about the wrong
  // city. A result outside Warsaw is kept as a fallback so that case still gets
  // an honest "only Warsaw for now" rather than "not found".
  let outside: GeocodedAddress | null = null;
  for (const attempt of attempts) {
    const result = await requestGeocode(attempt, apiKey, citySlug);
    if (!result) continue;
    if (citySlug !== LOCATION_CHECKER_CITY_SLUG || insideWarsaw(result)) return result;
    outside ??= result;
  }
  if (outside) return outside;

  // Last resort for a bare street name ("Puławska", "Zlota 44") that Google
  // could not place at all: only now is the city named explicitly.
  if (citySlug !== LOCATION_CHECKER_CITY_SLUG) return null;
  return requestGeocode(`${attempts[0]}, Warszawa`, apiKey, citySlug);
}
