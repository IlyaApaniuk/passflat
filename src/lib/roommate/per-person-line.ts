import type { PerPersonSplit } from '@/lib/roommate/room-costs';

/**
 * The website's per-person line (spec 08 §Per-person line, PRD 4 FR-13): the values of
 * `listings.flatmateCallout.perPerson`, the bot's `roomSplit` sentence. The figure is the bot's
 * split (D61, D71: tenant group, all-in median of flats with 2 or more rooms, halved, N ≥ 2);
 * this module only words it, so it adds no aggregation. Pure: client components import it.
 */

/** The ICU values of the line; `area` is the split's own area, already a display string. */
export interface PerPersonLineValues {
  value: number;
  count: number;
  area: string;
}

/**
 * The line's values, or null when the rule has no figure (no split) or the server passed no
 * area name. `areaName` must name the split's own area (`perPersonSplitArea`): the split has its
 * own level, so a district page can show a Warsaw split, named Warsaw.
 */
export function perPersonLineValues(
  split: PerPersonSplit | null | undefined,
  areaName: string | null | undefined,
): PerPersonLineValues | null {
  if (!split || !areaName) return null;
  return { value: split.value, count: split.n, area: areaName };
}

/**
 * The split's own area as a display string, resolved on the server: a district's `nameKey` is
 * its display name as is, the city's `nameKey` is a message key (the `city` namespace never
 * reaches a client component).
 */
export function perPersonSplitArea(
  split: PerPersonSplit,
  translate: (key: string) => string,
): string {
  return split.level === 'district' ? split.name : translate(split.name);
}

/**
 * The amount as the room money block writes amounts (`toLocaleString`), in the page's locale so
 * the server and the browser agree, with "zł" as the bot writes it: "2,450 zł" in English.
 */
export function perPersonAmount(value: number, locale: string): string {
  return `${value.toLocaleString(locale)} zł`;
}
