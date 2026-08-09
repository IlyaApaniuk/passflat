import { transliterate } from './slugify';

const STREET_PREFIXES = /^(ul\.|ul |al\.|al |pl\.|pl |os\.|os )/i;
const CITY_SUFFIX = /,?\s*(warszawa|warsaw|варшава)$/i;

export function cleanStreet(raw: string): string {
  return raw.trim().replace(STREET_PREFIXES, '').replace(CITY_SUFFIX, '').trim();
}

/**
 * An address as a heading: the scraped import stored some rows fully
 * lower-cased ("siedmiogrodzka 3"), and those same strings are the <h1> and the
 * SERP title of a building page.
 *
 * Only strings without a single capital are touched, so an address that already
 * carries its own casing — "al. Jana Pawła II", "Osiedle Za Żelazną Bramą" —
 * is returned untouched rather than re-cased into something wrong.
 */
export function formatAddressDisplay(address: string): string {
  if (/\p{Lu}/u.test(address)) return address;
  // The lookbehind keeps a building number whole: the "a" of "12a" follows a
  // digit and is part of the number, not a word of its own.
  return address.replace(
    /(?<![\p{L}\p{N}])\p{L}[\p{L}\p{M}'’-]*/gu,
    (word) => word.charAt(0).toLocaleUpperCase('pl-PL') + word.slice(1),
  );
}

export function normalizeAddress(street: string, buildingNumber: string): string {
  let s = cleanStreet(street);
  s = transliterate(s);
  s = s.toLowerCase().replace(/\s+/g, ' ');
  const n = buildingNumber.trim().toLowerCase();
  return `${s} ${n}`;
}
