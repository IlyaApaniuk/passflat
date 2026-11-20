import posthog from 'posthog-js';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { createPageContextHook } from '@/lib/analytics/page-context';
import { ANONYMOUS_PERSISTENCE, analyticsPersistence, readConsent } from '@/lib/consent';

/**
 * Initialises the browser PostHog client. `src/instrumentation-client.ts` calls it once per
 * full page load, which Next.js runs before React hydrates, so no component's capture can
 * precede it (spec 01 §Landing capture, FR-13). It used to run in the provider's own
 * `useEffect`, after its children's effects, and posthog-js silently drops a `capture` made
 * before `init`: the landing `$pageview` and other mount-time events were lost.
 *
 * Consent model unchanged (D10, see the docblock in `posthog-provider.tsx`): memory
 * persistence until consent, `localStorage+cookie` after it; `PersistenceUpgrade` in the
 * provider upgrades the same instance when the visitor accepts.
 *
 * Returns whether PostHog is initialised. Without `NEXT_PUBLIC_POSTHOG_KEY` nothing runs;
 * an `init` that throws is logged and the page renders without analytics.
 */
export function initPostHog(): boolean {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === 'undefined') {
    return false;
  }
  if (posthog.__loaded) {
    return true;
  }

  try {
    const persistence = analyticsPersistence(readConsent());

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: true,
      capture_exceptions: true,
      disable_session_recording: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '[data-ph-mask]',
      },
      persistence,
      // Capturing is deliberately NOT gated on consent (see the provider's docblock);
      // gating it here is what made every un-consented visit invisible. Leaving it `false`
      // also keeps posthog-js from ever calling `optInOut()`, which is the only thing that
      // writes its `__ph_opt_in_out_<token>` localStorage key, so the memory mode really is
      // write-free.
      opt_out_capturing_by_default: false,
      // Surveys write `seenSurvey_<id>` to localStorage directly, bypassing the persistence
      // setting. None are configured today, but a survey enabled server-side would silently
      // break the no-storage promise, so they stay off until consent. `PersistenceUpgrade`
      // turns them back on when it arrives.
      disable_surveys: persistence === ANONYMOUS_PERSISTENCE,
      // Adds page_type, locale, city, listing_type and entry_page_type to every event at
      // send time, under the event's own properties. It stores nothing.
      before_send: createPageContextHook(() => window.location.pathname),
      bootstrap: {
        featureFlags: {
          [FEATURE_FLAGS.PROMOTED_LISTINGS_ENABLED]: false,
          [FEATURE_FLAGS.SESSION_RECORDING_SAMPLE]: false,
          [FEATURE_FLAGS.SHOW_STATS]: false,
          [FEATURE_FLAGS.SHOW_TESTIMONIALS]: false,
        },
      },
      loaded: (ph) => {
        if (process.env.NODE_ENV === 'development') {
          // Writes a `ph_debug` localStorage key. Development only, so it never touches a
          // visitor's device in production.
          ph.debug();
        }
        if (persistence === ANONYMOUS_PERSISTENCE && ph.has_opted_out_capturing()) {
          // Visitors who declined under the previous capture-gated build still carry
          // posthog-js's own `__ph_opt_in_out_<token>` flag, which would keep them silent
          // forever regardless of the config above. Clearing it only *removes* that key
          // (it never writes one) and hands the decision back to the persistence switch.
          ph.clear_opt_in_out_capturing();
        }
        // Providing `bootstrap.featureFlags` makes posthog-js mark flags as already
        // loaded, so it skips its automatic first-load fetch. Flags not listed in the
        // bootstrap object (e.g. cost-report-delete-enabled) would then stay `undefined`
        // until a much later refresh. Force one fetch so every flag resolves to its server
        // value on initial page load.
        ph.reloadFeatureFlags();
      },
    });
    return true;
  } catch (error) {
    console.error(
      '[posthog] init failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    return false;
  }
}
