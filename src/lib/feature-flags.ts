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
  // Hero headline A/B — DORMANT. The live headline is the loss-aversion framing;
  // this flag is parked (declared, not consumed) until there's enough traffic to
  // reach significance. To run it: render an alternate headline behind this flag +
  // create a PostHog experiment (goal = hero_cta_clicked / cost_form_started).
  HERO_VARIANT_B: 'hero-variant-b',
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
