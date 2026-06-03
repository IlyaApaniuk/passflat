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
