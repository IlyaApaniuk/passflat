import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';
import { SITE_URL as baseUrl } from '@/lib/site-url';

/**
 * Site-wide indexability switch.
 *
 * Controlled by `NEXT_PUBLIC_SITE_INDEXABLE` (build-time, NEXT_PUBLIC_ → read on
 * both server and client). Fail-safe: only the exact string "true" allows search
 * engines to index the site. Anything else (unset, "false", typos) keeps the
 * whole site blocked, so a pre-launch deploy can never be accidentally indexed.
 * Flipping this requires a redeploy because the value is inlined at build time.
 */
export const isIndexable = process.env.NEXT_PUBLIC_SITE_INDEXABLE === 'true';

/**
 * Robots directive applied at the highest shared metadata level so every page
 * inherits it. Returns `undefined` when indexable (Next.js default: index,
 * follow); otherwise a full noindex/nofollow directive (incl. googleBot).
 */
export const robotsMeta: Metadata['robots'] = isIndexable
  ? undefined
  : {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    };

/** The absolute URL a path is served at in one locale. `localePrefix:
 *  'as-needed'` means the default locale carries no prefix. */
function localeUrl(locale: string, pathname: string): string {
  return locale === routing.defaultLocale
    ? `${baseUrl}${pathname}`
    : `${baseUrl}/${locale}${pathname}`;
}

/**
 * `canonical` + `hreflang` for one page.
 *
 * The canonical MUST be the caller's own locale. Returning the default-locale
 * URL for every locale — as this did — tells Google that the Polish page is the
 * original and the ru/uk/en ones are duplicates of it, so it indexes only the
 * Polish URL and drops the rest. That contradicted the hreflang set emitted
 * right next to it, and it suppressed exactly the RU/UA pages the product is
 * built around.
 *
 * `locale` is required on purpose: an optional one would silently fall back to
 * the default locale, which is the bug this replaces.
 */
export function getAlternates(pathname: string, locale: string) {
  const languages: Record<string, string> = {};

  for (const l of routing.locales) {
    languages[l] = localeUrl(l, pathname);
  }

  languages['x-default'] = localeUrl(routing.defaultLocale, pathname);

  return { canonical: localeUrl(locale, pathname), languages };
}

export function getOgImage(title: string, subtitle?: string) {
  const params = new URLSearchParams({ title });
  if (subtitle) params.set('subtitle', subtitle);
  return {
    url: `${baseUrl}/api/og?${params.toString()}`,
    width: 1200,
    height: 630,
    type: 'image/png',
  };
}

/**
 * Rich cost share-card OG image (building / district / city). The caller passes
 * already-localized, already-formatted strings — `stat` is the headline median
 * (e.g. "≈ 4 200 zł"), `split` the rent/expenses breakdown — so the edge OG
 * route does no formatting. This is the viral artifact people drop into chats.
 */
export function getCostOgImage(opts: {
  title: string;
  subtitle?: string;
  stat: string;
  statLabel?: string;
  split?: string;
}) {
  const params = new URLSearchParams({ title: opts.title, stat: opts.stat });
  if (opts.subtitle) params.set('subtitle', opts.subtitle);
  if (opts.statLabel) params.set('statLabel', opts.statLabel);
  if (opts.split) params.set('split', opts.split);
  return {
    url: `${baseUrl}/api/og?${params.toString()}`,
    width: 1200,
    height: 630,
    type: 'image/png',
  };
}

/** Dynamic checker share-card. The score is already cached in Postgres before
 * a share URL is produced, so metadata rendering never calls Overpass. */
export function getScoreOgImage(opts: {
  title: string;
  subtitle?: string;
  score: number;
  scoreLabel: string;
}) {
  const params = new URLSearchParams({
    title: opts.title,
    score: String(Math.max(0, Math.min(100, Math.round(opts.score)))),
    scoreLabel: opts.scoreLabel,
  });
  if (opts.subtitle) params.set('subtitle', opts.subtitle);
  return {
    url: `${baseUrl}/api/og?${params.toString()}`,
    width: 1200,
    height: 630,
    type: 'image/png',
  };
}
