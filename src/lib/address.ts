import { transliterate } from "./slugify";

const STREET_PREFIXES = /^(ul\.|ul |al\.|al |pl\.|pl |os\.|os )/i;
const CITY_SUFFIX = /,?\s*(warszawa|warsaw|варшава)$/i;

export function cleanStreet(raw: string): string {
  return raw
    .trim()
    .replace(STREET_PREFIXES, "")
    .replace(CITY_SUFFIX, "")
    .trim();
}

export function normalizeAddress(
  street: string,
  buildingNumber: string,
): string {
  let s = cleanStreet(street);
  s = transliterate(s);
  s = s.toLowerCase().replace(/\s+/g, " ");
  const n = buildingNumber.trim().toLowerCase();
  return `${s} ${n}`;
}
