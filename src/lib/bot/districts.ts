import { transliterateToPolish } from './geocode';

/**
 * Recognising a district name typed instead of an address.
 *
 * "Мокотов" or "wola" is the most natural first message to a rent bot, and
 * Google has no single point to geocode it to, so without this the bot answered
 * a district name with "address not found" — the exact dead end the fallback
 * design exists to prevent.
 */

// Spellings that transliteration plus a small edit distance cannot reach,
// mostly where Russian follows the sound rather than the Polish letters
// (Żoliborz → Жолибож, Śródmieście → Средместье).
const ALIASES: Record<string, string[]> = {
  srodmiescie: ['средместье', 'сьродмесьце', 'сьрудмесьце', 'шрудместье', 'центр', 'центр города'],
  zoliborz: ['жолибож', 'жолібож'],
  'praga-poludnie': ['прага южная', 'прага юг', 'прага-юг'],
  'praga-polnoc': ['прага северная', 'прага север', 'прага-север', 'старая прага'],
  bialoleka: ['бялоленка', 'бялолэнка'],
  wilanow: ['вилянов', 'вилянув', 'віланув'],
  ursynow: ['урсинов', 'урсинув'],
};

// Words people wrap a district name in: "район Мокотов", "dzielnica Wola".
const FILLER = /\b(?:rajon|raion|dzielnica|district|osiedle|w|na|v|u)\b/g;

function normalizeDistrictQuery(value: string): string {
  const latin = /[\u0400-\u04FF]/.test(value) ? transliterateToPolish(value) : value;
  return latin
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z]+/g, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = current;
    }
  }
  return row[b.length];
}

/**
 * The district slug a message names, or null when it reads as an address.
 *
 * Anything with a digit is an address ("Wolska 12" must not become Wola), and
 * the edit-distance tolerance is kept tight on short names so "wola" does not
 * swallow unrelated words.
 */
export function matchDistrict(
  query: string,
  districts: Array<{ slug: string; nameKey: string }>,
): string | null {
  if (/\d/.test(query) || query.length > 40) return null;

  const normalized = normalizeDistrictQuery(query);
  if (normalized.length < 3) return null;

  let best: { slug: string; distance: number } | null = null;
  for (const district of districts) {
    const candidates = [
      normalizeDistrictQuery(district.nameKey),
      district.slug.replace(/-/g, ' '),
      ...(ALIASES[district.slug] ?? []).map(normalizeDistrictQuery),
    ];
    for (const candidate of candidates) {
      const distance = levenshtein(normalized, candidate);
      const tolerance = candidate.length <= 5 ? 1 : 2;
      if (distance <= tolerance && (!best || distance < best.distance)) {
        best = { slug: district.slug, distance };
      }
    }
  }

  return best?.slug ?? null;
}
