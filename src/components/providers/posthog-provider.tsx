'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog, useFeatureFlagEnabled } from 'posthog-js/react';
import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { MotionConfig } from 'framer-motion';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import {
  ANONYMOUS_PERSISTENCE,
  CONSENTED_PERSISTENCE,
  analyticsPersistence,
  readConsent,
  useAnalyticsConsent,
} from '@/lib/consent';

/**
 * Analytics before consent, storage only after it.
 *
 * Counting anonymous page views runs on legitimate interest (GDPR art. 6(1)(f));
 * what art. 5(3) ePrivacy actually requires consent for is *writing to the
 * device*. So until the user accepts, PostHog runs on `persistence: 'memory'` —
 * capturing is on, but no cookie and no localStorage entry is created. Accepting
 * upgrades the same instance to `localStorage+cookie`; declining keeps the
 * memory mode, i.e. "don't store", not "don't count".
 *
 * Honest caveat: the banner copy still says "we use cookies and analytics",
 * which does not describe this split. That is a deliberate debt the founder
 * owns, flagged for a copy revision.
 */
function PersistenceUpgrade() {
  const ph = usePostHog();
  const consent = useAnalyticsConsent();

  useEffect(() => {
    if (!ph || !consent || ph.config.persistence === CONSENTED_PERSISTENCE) {
      return;
    }
    // `set_config` re-points the store and carries the props already registered
    // in memory (distinct_id, $device_id, $sesid, and the `ref`/utm_* super
    // properties registered below) into the new one, so the accepting visitor
    // keeps one identity across the consent boundary instead of splitting in
    // two. It also re-runs the survey/recording gates, so no reload is needed.
    ph.set_config({ persistence: CONSENTED_PERSISTENCE, disable_surveys: false });
  }, [ph, consent]);

  return null;
}

function SessionRecordingGate() {
  const ph = usePostHog();
  const consent = useAnalyticsConsent();
  const sampled = useFeatureFlagEnabled(FEATURE_FLAGS.SESSION_RECORDING_SAMPLE);

  useEffect(() => {
    if (!ph) {
      return;
    }
    if (consent && sampled) {
      ph.startSessionRecording();
    } else {
      ph.stopSessionRecording();
    }
  }, [ph, consent, sampled]);

  return null;
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (pathname && ph) {
      // First-touch channel attribution. The `pf_ref` cookie is httpOnly (the
      // server uses it for signup attribution), so the client reads `?ref=` from
      // the URL instead and registers it as a super-property. register_once keeps
      // the first channel that ever brought this browser (matching the cookie's
      // first-touch semantics) and persists it, so funnel events fired on later
      // pages (cost_form_started, …) carry the acquisition channel. Mirrors
      // REF_PATTERN / classifyRef in lib/referral.ts (can't import — server-only).
      const rawRef = searchParams.get('ref');
      if (rawRef && /^[A-Za-z0-9_-]{1,64}$/.test(rawRef)) {
        const ref_type = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          rawRef,
        )
          ? 'peer'
          : 'campaign';
        ph.register_once({ ref: rawRef, ref_type });
      }

      // Persist first-touch campaign parameters as super-properties as well.
      // A checker ad lands on /check, while the conversion happens on the cost
      // form after a navigation; keeping the UTM values on the PostHog client
      // makes the later `cost_form_started` event attributable without copying
      // every query parameter into every internal link.
      const campaignProperties: Record<string, string> = {};
      for (const key of [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_content',
        'utm_term',
      ] as const) {
        const value = searchParams.get(key)?.trim();
        if (value && value.length <= 200) campaignProperties[key] = value;
      }
      if (Object.keys(campaignProperties).length > 0) {
        ph.register_once(campaignProperties);
      }

      let url = window.origin + pathname;
      if (searchParams.toString()) {
        url = url + '?' + searchParams.toString();
      }
      ph.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams, ph]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || typeof window === 'undefined') {
      return;
    }

    const consent = readConsent();
    const persistence = analyticsPersistence(consent);

    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
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
      // Capturing is deliberately NOT gated on consent (see the docblock above);
      // gating it here is what made every un-consented visit invisible. Leaving
      // it `false` also keeps posthog-js from ever calling `optInOut()`, which is
      // the only thing that writes its `__ph_opt_in_out_<token>` localStorage key
      // — so the memory mode really is write-free.
      opt_out_capturing_by_default: false,
      // Surveys write `seenSurvey_<id>` to localStorage directly, bypassing the
      // persistence setting. None are configured today, but a survey enabled
      // server-side would silently break the no-storage promise, so they stay off
      // until consent. `PersistenceUpgrade` turns them back on when it arrives.
      disable_surveys: persistence === ANONYMOUS_PERSISTENCE,
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
          // Writes a `ph_debug` localStorage key. Development only, so it never
          // touches a visitor's device in production.
          ph.debug();
        }
        if (persistence === ANONYMOUS_PERSISTENCE && ph.has_opted_out_capturing()) {
          // Visitors who declined under the previous capture-gated build still
          // carry posthog-js's own `__ph_opt_in_out_<token>` flag, which would
          // keep them silent forever regardless of the config above. Clearing it
          // only *removes* that key — it never writes one — and hands the
          // decision back to the persistence switch.
          ph.clear_opt_in_out_capturing();
        }
        // Providing `bootstrap.featureFlags` makes posthog-js mark flags as
        // already loaded, so it skips its automatic first-load fetch. Flags not
        // listed in the bootstrap object (e.g. cost-report-delete-enabled) would
        // then stay `undefined` until a much later refresh. Force one fetch so
        // every flag resolves to its server value on initial page load.
        ph.reloadFeatureFlags();
      },
    });
  }, []);

  // `reducedMotion="user"` makes every framer-motion animation app-wide honor
  // the OS "reduce motion" setting (transform/layout animations are skipped),
  // which the CSS-only media query in globals.css cannot do for JS-driven
  // animations. Visuals are unchanged for users without the preference.
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
  }

  return (
    <MotionConfig reducedMotion="user">
      <PHProvider client={posthog}>
        <Suspense fallback={null}>
          <PostHogPageView />
        </Suspense>
        <PersistenceUpgrade />
        <SessionRecordingGate />
        {children}
      </PHProvider>
    </MotionConfig>
  );
}
