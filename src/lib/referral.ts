import { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';

/**
 * First-touch referral attribution.
 *
 * A `?ref=` query param on any visit is captured into a cookie by the middleware
 * and consumed once, at profile creation, into `Profile.referredBy`. The value is
 * either a referrer's user id (peer share — share links carry `?ref=<userId>`) or
 * a free-form campaign code an influencer/channel is given (e.g. `?ref=dezhyty`).
 *
 * Phase 1 has NO functional reward (the cost data is open). The whole point is
 * attribution: PostHog cohorts that show which chat/influencer drives actual
 * *contributors* (not just clicks), to aim the September budget. See the growth
 * plan's referral section.
 *
 * First-touch (not last-touch): the cookie is only set when absent, so the first
 * channel that ever brought a visitor wins — that's the acquisition source we
 * want to credit, not whatever link they happened to click last.
 */
export const REFERRAL_COOKIE = 'pf_ref';

// 30 days: long enough to bridge "clicked a share link" → "came back and signed
// up + contributed" without holding stale attribution forever.
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// A ref is either a UUID (peer userId) or a campaign slug. Restrict to a safe
// charset so a hostile `?ref=` can't smuggle anything into the cookie; UUIDs fit
// (hex + dashes) and campaign codes are alphanumeric/dash/underscore.
const REF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate/normalize a raw `?ref=` (or cookie) value; null if unusable. */
export function sanitizeRef(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return REF_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * 'peer' when the ref is a user id (a friend's share link), 'campaign' otherwise
 * (an influencer/channel code). Lets PostHog split peer virality from paid/seeded
 * channels.
 */
export function classifyRef(ref: string): 'peer' | 'campaign' {
  return UUID_PATTERN.test(ref) ? 'peer' : 'campaign';
}

/**
 * Middleware hook: if the request carries a valid `?ref=` and no referral cookie
 * is set yet, persist it (first-touch). Mutates `response` cookies in place.
 */
export function captureReferralFromRequest(request: NextRequest, response: NextResponse): void {
  if (request.cookies.has(REFERRAL_COOKIE)) return;
  const ref = sanitizeRef(request.nextUrl.searchParams.get('ref'));
  if (!ref) return;
  response.cookies.set(REFERRAL_COOKIE, ref, {
    maxAge: REFERRAL_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * Read the captured referral cookie from a request scope (route handler / server
 * action / server component). Guarded so it returns null instead of throwing when
 * called outside a request (e.g. unit tests).
 */
export async function readReferralCookie(): Promise<string | null> {
  try {
    const store = await cookies();
    return sanitizeRef(store.get(REFERRAL_COOKIE)?.value);
  } catch {
    return null;
  }
}
