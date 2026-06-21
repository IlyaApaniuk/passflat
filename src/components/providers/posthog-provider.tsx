'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog, useFeatureFlagEnabled } from 'posthog-js/react';
import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { MotionConfig } from 'framer-motion';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { useAnalyticsConsent } from '@/lib/consent';

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

    const consent = localStorage.getItem('passflat-cookie-consent');

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
      persistence: 'localStorage+cookie',
      opt_out_capturing_by_default: consent !== 'accepted',
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
          ph.debug();
        }
        if (consent === 'declined') {
          ph.opt_out_capturing();
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
        <SessionRecordingGate />
        {children}
      </PHProvider>
    </MotionConfig>
  );
}
