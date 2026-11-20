// The honesty rules of the copy (spec 03 §Marketing copy, spec 09 §Honesty keys under test, D25,
// CLAUDE.md "Cost data honesty"): claim words that a rewritten message key, a guide's frontmatter
// or a guide's link line may not hold. The honesty tests import these lists from here so they
// share one set. The lists only grow: a legitimate match in another sense goes into a test's
// allow list with a reason, never into a looser pattern.

export type HonestyLocale = 'pl' | 'en' | 'ru' | 'uk';

/**
 * Claim words per locale: "verified", "checked", "actually / really", "in full", the "real"
 * family, "the truth" and "market". "Fully or partly" in any language is allowed (the deposit
 * answers). No `g` flag: the patterns are shared and `test` must not keep a `lastIndex`.
 */
export const FORBIDDEN: Record<HonestyLocale, RegExp> = {
  en: /verified|checked|actually|really|in full|\breal\b|market|truth/i,
  pl: /zweryfikow|sprawdzon|naprawdę|realn|faktycznie|w całości(?! lub)|rzeczywist|prawdziw|rynk/i,
  ru: /проверенн|на самом деле|реальн|по факту|полностью(?! или)|настоящ|рыночн/i,
  uk: /перевірен|насправді|реальн|за фактом|повністю(?! або)|справжн|ринков/i,
};
