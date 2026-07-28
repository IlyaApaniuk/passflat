import { beforeEach, describe, expect, it } from 'vitest';

import { checkRateLimit, getClientIp, rateLimitKeyCount, resetRateLimits } from './rate-limit';

beforeEach(() => {
  resetRateLimits();
});

describe('checkRateLimit', () => {
  it('allows up to the limit and then reports when the window resets', () => {
    const options = { key: 'contact:1.1.1.1', limit: 3, windowMs: 60_000, now: 1_000 };

    for (let i = 0; i < 3; i += 1) {
      expect(checkRateLimit({ ...options, now: 1_000 + i })).toEqual({
        allowed: true,
        retryAfterSeconds: 0,
      });
    }

    expect(checkRateLimit({ ...options, now: 30_000 })).toEqual({
      allowed: false,
      retryAfterSeconds: 31,
    });
  });

  it('keeps buckets independent per key', () => {
    const options = { limit: 1, windowMs: 60_000, now: 1_000 };

    expect(checkRateLimit({ ...options, key: 'contact:1.1.1.1' }).allowed).toBe(true);
    expect(checkRateLimit({ ...options, key: 'contact:1.1.1.1' }).allowed).toBe(false);
    // Same IP, different flow — its own budget.
    expect(checkRateLimit({ ...options, key: 'city-notify:1.1.1.1' }).allowed).toBe(true);
  });

  it('starts a fresh window once the old one expires', () => {
    const options = { key: 'auth:reset:email:a@b.c', limit: 1, windowMs: 60_000 };

    expect(checkRateLimit({ ...options, now: 1_000 }).allowed).toBe(true);
    expect(checkRateLimit({ ...options, now: 60_000 }).allowed).toBe(false);
    expect(checkRateLimit({ ...options, now: 61_000 }).allowed).toBe(true);
  });

  it('drops expired buckets instead of leaking a key per caller', () => {
    for (let i = 0; i < 500; i += 1) {
      checkRateLimit({ key: `translate:203.0.113.${i}`, limit: 1, windowMs: 60_000, now: 1_000 });
    }
    expect(rateLimitKeyCount()).toBe(500);

    checkRateLimit({ key: 'translate:198.51.100.1', limit: 1, windowMs: 60_000, now: 61_001 });
    expect(rateLimitKeyCount()).toBe(1);
  });

  it('caps the map so a rotating-IP flood cannot grow it without bound', () => {
    const windowMs = 60 * 60 * 1000;
    const victim = { key: 'auth:email:ip:203.0.113.7', limit: 1, windowMs, now: 1_000 };

    expect(checkRateLimit(victim).allowed).toBe(true);
    expect(checkRateLimit(victim).allowed).toBe(false);

    // All still inside their window, so only the hard cap can shed them.
    for (let i = 0; i < 10_000; i += 1) {
      checkRateLimit({ key: `flood:${i}`, limit: 1, windowMs, now: 1_000 });
    }

    expect(rateLimitKeyCount()).toBeLessThanOrEqual(10_000);
    // The oldest bucket was evicted, so it starts over rather than being kept
    // forever — the trade the cap buys.
    expect(checkRateLimit(victim).allowed).toBe(true);
  });
});

describe('getClientIp', () => {
  it('takes the first x-forwarded-for hop, falls back to x-real-ip', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': ' 1.2.3.4 , 5.6.7.8' }))).toBe('1.2.3.4');
    expect(getClientIp(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
    expect(getClientIp(new Headers())).toBe('unknown');
  });
});
