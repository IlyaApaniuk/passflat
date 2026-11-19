import { BUDGET_BANDS } from './rules';
import { monthsApart } from './time';

/**
 * The compatibility rule of PRD 3 FR-24 (spec 07 §Compatibility), pure and symmetric: which
 * active profiles may see each other's cards in stage 2. District, budget and month are Decided
 * (D49, D51), languages too (D54), "live with" is mutual; the two tolerances are an
 * **Assumption** (D68), one constant each.
 *
 * `findCompatible` in `store.ts` filters its candidate query with this function, so the
 * database result and the pure rule agree by construction.
 */

/** **Assumption** (D68): budget bands may differ by at most one step (`b2`–`b3` yes, `b2`–`b4` no). */
export const BUDGET_BAND_TOLERANCE = 1;

/** **Assumption** (D68): move-in months may differ by at most one calendar month. */
export const MOVE_IN_MONTH_TOLERANCE = 1;

/** The fields the rule reads; a `RoommateProfile` row fits. */
export type CompatibilityProfile = {
  districtSlugs: readonly string[];
  anyDistrict: boolean;
  budgetBand: string | null;
  moveInMonth: Date | null;
  languages: readonly string[];
  gender: string | null;
  prefers: string;
};

function bandIndex(band: string | null): number {
  return BUDGET_BANDS.findIndex((entry) => entry.band === band);
}

function sharesOne(a: readonly string[], b: readonly string[]): boolean {
  return a.some((value) => b.includes(value));
}

/** Rule 1: either is open to any district, or the district sets share a slug. */
function districtsFit(a: CompatibilityProfile, b: CompatibilityProfile): boolean {
  return a.anyDistrict || b.anyDistrict || sharesOne(a.districtSlugs, b.districtSlugs);
}

/** Rule 2: band indices differ by at most `BUDGET_BAND_TOLERANCE`; a missing or unknown band fits nothing. */
function budgetsFit(a: CompatibilityProfile, b: CompatibilityProfile): boolean {
  const ia = bandIndex(a.budgetBand);
  const ib = bandIndex(b.budgetBand);
  return ia >= 0 && ib >= 0 && Math.abs(ia - ib) <= BUDGET_BAND_TOLERANCE;
}

/** Rule 3: move-in months at most `MOVE_IN_MONTH_TOLERANCE` calendar months apart. */
function monthsFit(a: CompatibilityProfile, b: CompatibilityProfile): boolean {
  if (!a.moveInMonth || !b.moveInMonth) return false;
  return monthsApart(a.moveInMonth, b.moveInMonth) <= MOVE_IN_MONTH_TOLERANCE;
}

/**
 * Rule 5, one direction: `anyone` accepts every profile, `women` only a stated woman, `men` only
 * a stated man; a profile without a stated gender is accepted only by `anyone`.
 */
function accepts(prefers: string, other: CompatibilityProfile): boolean {
  if (prefers === 'anyone') return true;
  if (prefers === 'women') return other.gender === 'woman';
  if (prefers === 'men') return other.gender === 'man';
  return false;
}

/** True when two different active profiles are compatible: all five rules hold. */
export function isCompatible(a: CompatibilityProfile, b: CompatibilityProfile): boolean {
  return (
    districtsFit(a, b) &&
    budgetsFit(a, b) &&
    monthsFit(a, b) &&
    sharesOne(a.languages, b.languages) &&
    accepts(a.prefers, b) &&
    accepts(b.prefers, a)
  );
}
