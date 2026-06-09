/**
 * PostHog feature-flag keys, read per-user via `useFeatureFlagEnabled`.
 *
 * Wired/used: SHOW_STATS, SHOW_TESTIMONIALS.
 * Declared-for-future (not yet consumed): PROMOTED_LISTINGS_ENABLED,
 * SESSION_RECORDING_SAMPLE.
 */
export const FEATURE_FLAGS = {
  SHOW_STATS: 'show_stats',
  SHOW_TESTIMONIALS: 'show_testimonials',
  PROMOTED_LISTINGS_ENABLED: 'promoted-listings-enabled',
  SESSION_RECORDING_SAMPLE: 'session-recording-sample',
} as const;

/**
 * Static, env-based feature flags.
 *
 * Unlike the PostHog flags above (per-user / experiment driven), these are
 * build-time toggles read from `NEXT_PUBLIC_*` environment variables, so they
 * resolve identically on the server and the client (no hydration mismatch).
 *
 * Convention: a feature is treated as ENABLED by default and is only switched
 * off when its env var is explicitly set to the string "false". This means an
 * unset/empty var keeps the feature on, which is the safe default for features
 * that are already live.
 */
function isEnabledByDefault(value: string | undefined): boolean {
  return value !== 'false';
}

/**
 * Master switch for the downloadable legal-document templates feature.
 *
 * Controlled by `NEXT_PUBLIC_FEATURE_DOCUMENT_TEMPLATES`:
 *   - unset / "true" (or anything other than "false") → ENABLED (default)
 *   - "false" → DISABLED (the feature leaves no visible trace: components
 *     render nothing, the chat hint is hidden, `/resources` 404s, and the
 *     footer/sitemap entries are removed)
 */
export function isDocumentTemplatesEnabled(): boolean {
  return isEnabledByDefault(process.env.NEXT_PUBLIC_FEATURE_DOCUMENT_TEMPLATES);
}

/**
 * Master switch that OPENS all crowdsourced cost data to everyone — anonymous
 * visitors and search-engine crawlers — bypassing the contribute-/pay-to-unlock
 * gate. Phase 1 of the growth plan runs fully open to power SEO, social sharing
 * and proof-of-value; the gate is reinstated later for monetization.
 *
 * Controlled by `NEXT_PUBLIC_FEATURE_COST_DATA_OPEN`:
 *   - unset / "true" (anything other than "false") → OPEN (default)
 *   - "false" → gated (contribute a report or buy access to see the numbers)
 *
 * NOT a security boundary: the cost figures are already shipped to the client,
 * so this only flips the client-side blur/CTA. Truly sensitive depth can be
 * withheld server-side later if monetization needs it.
 */
export function isCostDataOpenToAll(): boolean {
  return isEnabledByDefault(process.env.NEXT_PUBLIC_FEATURE_COST_DATA_OPEN);
}
