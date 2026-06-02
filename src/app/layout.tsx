import type { Metadata } from 'next';
import { Manrope, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { getLocale } from 'next-intl/server';
import { PostHogProvider } from '@/components/providers/posthog-provider';
import { GoogleAnalytics } from '@/components/providers/google-analytics';
import { CookieConsent } from '@/components/cookie-consent';
import { Toaster } from '@/components/ui/sonner';
import { PublishSnackbar } from '@/components/publish-snackbar';
import { JsonLd, organizationJsonLd, webSiteJsonLd } from '@/lib/json-ld';
import { robotsMeta } from '@/lib/seo';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'],
  variable: '--font-manrope',
});
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin', 'cyrillic'], variable: '--font-mono' });

export const metadata: Metadata = {
  icons: {
    icon: { url: '/icon.svg', type: 'image/svg+xml' },
    apple: '/icon.svg',
  },
  robots: robotsMeta,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${manrope.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans antialiased min-h-screen bg-background text-foreground">
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={webSiteJsonLd()} />
        <PostHogProvider>
          {children}
          <CookieConsent />
          <Toaster />
          <PublishSnackbar />
        </PostHogProvider>
        <GoogleAnalytics />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  );
}
