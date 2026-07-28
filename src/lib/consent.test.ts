import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_PERSISTENCE,
  CONSENTED_PERSISTENCE,
  analyticsPersistence,
  hasAnalyticsConsent,
  hasBottomActionBar,
  readConsent,
} from './consent';

describe('analyticsPersistence', () => {
  it('unlocks device storage only on an explicit accept', () => {
    expect(analyticsPersistence('accepted')).toBe(CONSENTED_PERSISTENCE);
  });

  it('keeps the write-free memory store before any answer', () => {
    expect(analyticsPersistence(null)).toBe(ANONYMOUS_PERSISTENCE);
  });

  it('treats a decline as "do not store", not "do not count"', () => {
    // The value posthog-js matches on is case-sensitive: `SessionIdManager`
    // compares `config.persistence !== 'memory'` before touching sessionStorage,
    // while the store lookup lowercases. Anything but this exact string would
    // silently re-enable sessionStorage writes.
    expect(analyticsPersistence('declined')).toBe('memory');
  });
});

describe('hasBottomActionBar', () => {
  it.each([
    '/ru/warszawa/costs/submit',
    '/warszawa/costs/submit',
    '/pl/warszawa/review',
    '/uk/krakow/review',
    '/en/warszawa/costs/submit/',
  ])('lifts the banner on %s', (pathname) => {
    expect(hasBottomActionBar(pathname)).toBe(true);
  });

  it.each([
    '/',
    '/ru',
    '/ru/warszawa/costs',
    '/ru/warszawa/check',
    '/ru/blog/reviews-guide',
    '/ru/warszawa/reviewers',
    '/ru/dashboard',
  ])('leaves the banner at the bottom on %s', (pathname) => {
    expect(hasBottomActionBar(pathname)).toBe(false);
  });
});

describe('readConsent', () => {
  it('is SSR-safe and reports no consent without a window', () => {
    expect(typeof window).toBe('undefined');
    expect(readConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });
});
