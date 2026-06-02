import { useEffect, useState } from 'react';

/**
 * Shared cookie-consent state.
 *
 * Consent is persisted in `localStorage` under {@link CONSENT_KEY} by the
 * cookie-consent banner. PostHog already reads this exact key to decide whether
 * to opt the user in/out of capturing, and analytics integrations (Google
 * Analytics) gate on the same signal so the codebase stays consistent and there
 * is a single source of truth for "did the user allow analytics?".
 *
 * To let analytics start/stop the moment the user clicks accept/decline (no full
 * page reload required — mirroring PostHog's live `opt_in_capturing()` behaviour)
 * writes go through {@link setConsent}, which broadcasts a {@link CONSENT_EVENT}
 * on `window`. The {@link useAnalyticsConsent} hook subscribes to that event (and
 * cross-tab `storage` events) and re-renders consumers accordingly.
 */
export const CONSENT_KEY = 'passflat-cookie-consent';

/** Custom DOM event dispatched on `window` whenever consent changes in this tab. */
export const CONSENT_EVENT = 'passflat:consent-change';

export type ConsentValue = 'accepted' | 'declined';

/** Reads the stored consent value. SSR-safe (returns `null` on the server). */
export function readConsent(): ConsentValue | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(CONSENT_KEY);
  return value === 'accepted' || value === 'declined' ? value : null;
}

/** Whether the user has explicitly granted analytics consent. */
export function hasAnalyticsConsent(): boolean {
  return readConsent() === 'accepted';
}

/**
 * Persists the consent value and notifies same-tab listeners synchronously so
 * analytics can react immediately (without waiting for a navigation/reload).
 */
export function setConsent(value: ConsentValue): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONSENT_KEY, value);
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
}

/**
 * React hook returning whether analytics consent is currently granted. Updates
 * live on accept/decline (via {@link CONSENT_EVENT}) and across tabs (via the
 * native `storage` event). Starts as `false` on the server and the first client
 * render to stay hydration-safe, then syncs from `localStorage` in an effect.
 */
export function useAnalyticsConsent(): boolean {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    const sync = () => setGranted(hasAnalyticsConsent());
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CONSENT_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return granted;
}
