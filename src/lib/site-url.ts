/**
 * Single source of truth for the site origin.
 *
 * Read from `NEXT_PUBLIC_APP_URL` and falls back to localhost for dev. The
 * value is normalized with no trailing slash so callers can always build URLs
 * as `${SITE_URL}${path}` (path beginning with `/`). SSR/edge-safe: never
 * touches `window`.
 *
 * Production MUST set `NEXT_PUBLIC_APP_URL` (e.g. https://passflat.com) — it
 * drives canonical URLs, the sitemap, robots, Stripe redirects, auth callbacks
 * and outgoing email links.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
  /\/+$/,
  '',
);
