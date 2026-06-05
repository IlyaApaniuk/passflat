import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { robotsMeta } from '@/lib/seo';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: { url: '/icon.svg', type: 'image/svg+xml' },
    apple: '/icon.svg',
  },
  robots: robotsMeta,
};

/**
 * Pass-through root layout. The real `<html>`/`<body>` shell (fonts, providers,
 * analytics) lives in `app/[locale]/layout.tsx` so the locale can be resolved
 * statically from the route segment via `setRequestLocale`, instead of through
 * a request-bound `getLocale()` call here — which would opt the entire tree
 * into dynamic rendering and prevent the locale landing routes from being
 * prerendered/CDN-cached.
 *
 * `app/global-error.tsx` and `app/not-found.tsx` render their own `<html>` for
 * the rare routes that fall outside the `[locale]` segment.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
