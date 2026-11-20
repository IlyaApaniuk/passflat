import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { isIndexable } from '@/lib/seo';
import { routing } from '@/i18n/routing';

/** Private areas, closed to crawlers in every locale (PRD 4 FR-28, spec 09). */
const PRIVATE_PATHS = [
  '/api/',
  '/dashboard/',
  '/messages/',
  '/create-listing/',
  '/auth/',
  '/admin/',
];

/**
 * Each path bare (the default locale has no prefix) and under every other locale's prefix
 * (`/en`, `/ru`, `/uk`): without the prefixes `/en/dashboard/` stayed open.
 */
function inEveryLocale(paths: readonly string[]): string[] {
  const prefixes = [
    '',
    ...routing.locales
      .filter((locale) => locale !== routing.defaultLocale)
      .map((locale) => `/${locale}`),
  ];
  return paths.flatMap((path) => prefixes.map((prefix) => `${prefix}${path}`));
}

export default function robots(): MetadataRoute.Robots {
  if (!isIndexable) {
    return {
      rules: { userAgent: '*', disallow: '/' },
    };
  }

  return {
    rules: {
      userAgent: '*',
      // `/api/og` renders link-preview images: the longer allow wins over `/api/`.
      allow: ['/', '/api/og'],
      disallow: inEveryLocale(PRIVATE_PATHS),
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
