import { useEffect, useState } from 'react';

/**
 * Shared cookie-consent state.
 *
 * Consent is persisted in `localStorage` under {@link CONSENT_KEY} by the
 * cookie-consent banner. It answers one question only: **may we write analytics
 * state to this device?** Google Analytics loads only on `accepted` (gtag.js is
 * cookie-based by nature), and PostHog switches storage backends on it — see
 * {@link analyticsPersistence} and the docblock in
 * `components/providers/posthog-provider.tsx`.
 *
 * To let analytics react the moment the user clicks accept/decline (no full page
 * reload required) writes go through {@link setConsent}, which broadcasts a
 * {@link CONSENT_EVENT} on `window`. The {@link useAnalyticsConsent} hook
 * subscribes to that event (and cross-tab `storage` events) and re-renders
 * consumers accordingly.
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

/** PostHog storage backend used once the user has accepted cookies. */
export const CONSENTED_PERSISTENCE = 'localStorage+cookie' as const;

/**
 * PostHog storage backend used before consent and after a decline: an
 * in-process JS object. posthog-js selects `memoryStore` for this exact
 * lowercase string, and `SessionIdManager._canUseSessionStorage()` is gated on
 * `config.persistence !== 'memory'`, so nothing reaches the device.
 */
export const ANONYMOUS_PERSISTENCE = 'memory' as const;

export type AnalyticsPersistence = typeof CONSENTED_PERSISTENCE | typeof ANONYMOUS_PERSISTENCE;

/**
 * Maps a consent value to the PostHog storage backend. Only an explicit
 * `accepted` unlocks device storage; `declined` and "not answered yet" both get
 * the memory store, because a decline means "do not store", not "do not count".
 */
export function analyticsPersistence(consent: ConsentValue | null): AnalyticsPersistence {
  return consent === 'accepted' ? CONSENTED_PERSISTENCE : ANONYMOUS_PERSISTENCE;
}

/**
 * Routes whose primary action lives at the very bottom of the page: the cost
 * form pins a `sticky bottom-0` summary bar holding its submit button, and
 * /review ends with the save button. A full-width banner at `bottom-0` covered
 * both on mobile, so the banner lifts itself clear on these paths. Lives here
 * (rather than in the banner component) so it stays unit-testable without a DOM.
 */
export function hasBottomActionBar(pathname: string): boolean {
  return /\/(?:costs\/submit|review)(?:\/|$)/.test(pathname);
}
