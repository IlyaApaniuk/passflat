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

export function getAlternates(pathname: string) {
  const languages: Record<string, string> = {};

  for (const locale of routing.locales) {
    languages[locale] =
      locale === routing.defaultLocale
        ? `${baseUrl}${pathname}`
        : `${baseUrl}/${locale}${pathname}`;
  }

  languages['x-default'] = `${baseUrl}${pathname}`;

  return { canonical: `${baseUrl}${pathname}`, languages };
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
