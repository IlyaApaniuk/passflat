import { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';

/**
 * Anonymous-submission identity.
 *
 * The cost form is open to logged-out visitors (removing the login wall before
 * data entry was a supply-killer on cold-start traffic). A report submitted
 * anonymously is owned by the system `ANON_AUTHOR_ID` profile and tagged with a
 * per-browser `anonymousId` captured here. On the visitor's first login, the
 * auth flow claims any reports carrying this id and re-points them at the real
 * account (see `claimAnonymousReports`), mirroring the `importedEmail` claim
 * used for Google-Form imports.
 *
 * Cookie-based, single-device by design: no cross-device linking (a deliberate
 * scope decision — the report data is captured regardless; account attribution
 * is best-effort for whoever logs in from the same browser).
 *
 * httpOnly: the id never needs to be read by client JS — the submit route and
 * the auth callback both read it server-side from the cookie, so it isn't sent
 * in the request body and can't be tampered with from the page.
 */
export const ANON_COOKIE = 'pf_anon';

// 1 year: long enough that a visitor who submits today and creates an account
// weeks later still gets their report claimed.
export const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeAnonId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

const COOKIE_OPTIONS = {
  maxAge: ANON_COOKIE_MAX_AGE,
  httpOnly: true,
  sameSite: 'lax' as const,
  // HTTPS-only in production; off locally so `next dev` over http still sets it.
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

/**
 * Middleware hook: ensure every visitor carries a stable anonymous id so an
 * anonymous submission can be claimed later. Sets the cookie when absent.
 * Mutates `response` cookies in place. Runs on page navigations (the matcher
 * excludes `/api`), so the cookie is already present by the time the visitor
 * POSTs the form.
 */
export function captureAnonIdFromRequest(request: NextRequest, response: NextResponse): void {
  if (request.cookies.has(ANON_COOKIE)) return;
  response.cookies.set(ANON_COOKIE, crypto.randomUUID(), COOKIE_OPTIONS);
}

/**
 * Read the anonymous id from a request scope (route handler / server action /
 * server component). Returns null when absent/invalid or called outside a
 * request.
 */
export async function readAnonId(): Promise<string | null> {
  try {
    const store = await cookies();
    return sanitizeAnonId(store.get(ANON_COOKIE)?.value);
  } catch {
    return null;
  }
}

/**
 * Route-handler fallback: return the anonymous id, generating and persisting one
 * if the middleware cookie somehow isn't present yet (e.g. a direct POST with no
 * prior page load). Setting it here keeps the same id available to the later
 * claim step. Best-effort: if the cookie store is read-only in this context the
 * generated id is still returned and used for the report.
 */
export async function ensureAnonId(): Promise<string> {
  const existing = await readAnonId();
  if (existing) return existing;
  const id = crypto.randomUUID();
  try {
    const store = await cookies();
    store.set(ANON_COOKIE, id, COOKIE_OPTIONS);
  } catch {
    // read-only cookie context — the id is still used for this report.
  }
  return id;
}
