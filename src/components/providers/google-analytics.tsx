'use client';

import { GoogleAnalytics as NextGoogleAnalytics } from '@next/third-parties/google';
import { useAnalyticsConsent } from '@/lib/consent';

/**
 * GDPR-compliant Google Analytics 4 loader.
 *
 * GA only loads once BOTH conditions hold:
 *   1. `NEXT_PUBLIC_GA_ID` is set (so dev/CI without an ID never load GA), and
 *   2. the user has granted analytics consent via the cookie-consent banner.
 *
 * This mirrors the PostHog gating (which keys off the same
 * `passflat-cookie-consent` localStorage value): nothing is requested from
 * Google and no gtag.js script is injected until consent is given. Because the
 * consent banner broadcasts changes through `@/lib/consent`, accepting mounts
 * `<GoogleAnalytics>` immediately — gtag.js loads without a page reload.
 */
export function GoogleAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const hasConsent = useAnalyticsConsent();

  if (!gaId || !hasConsent) return null;

  return <NextGoogleAnalytics gaId={gaId} />;
}
