import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Manrope, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { getAlternates, getOgImage } from '@/lib/seo';
import { pickMessages, SHARED_CLIENT_NAMESPACES } from '@/i18n/messages';
import { Header } from '@/components/landing/header';
import { PostHogProvider } from '@/components/providers/posthog-provider';
import { GoogleAnalytics } from '@/components/providers/google-analytics';
import { CookieConsent } from '@/components/cookie-consent';
import { Toaster } from '@/components/ui/sonner';
import { PublishSnackbar } from '@/components/publish-snackbar';
import { JsonLd, organizationJsonLd, webSiteJsonLd } from '@/lib/json-ld';

// Manrope (UI/headings) drives the LCP heading. Latin + latin-ext cover en/pl,
// cyrillic covers ru/uk; cyrillic-ext is not needed for these locales. next/font
// keeps its size-adjusted automatic fallback ("Manrope Fallback") so CLS stays
// 0 — do not disable it.
const manrope = Manrope({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-manrope',
});
// Mono is only used for code/figures, never on the LCP path — latin is enough.
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: {
      default: t('homeTitle'),
      template: '%s — Passflat',
    },
    description: t('homeDescription'),
    alternates: getAlternates('/'),
    openGraph: {
      title: t('homeTitle'),
      description: t('homeDescription'),
      images: [getOgImage(t('homeTitle'), t('homeDescription'))],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Resolve the locale from the route segment (not a request-bound API) so the
  // public/content routes can be prerendered statically.
  setRequestLocale(locale);

  // Only ship the namespaces actually used by client components rendered under
  // this shared layout. Heavy single-page content namespaces (privacy, terms,
  // help, how-it-works, about) are provided by a scoped provider on their own
  // page; purely server-rendered namespaces are dropped entirely. This roughly
  // halves the JSON payload inlined into the client bundle on every route.
  const messages = await getMessages();
  const clientMessages = pickMessages(messages, SHARED_CLIENT_NAMESPACES);

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
          <NextIntlClientProvider locale={locale} messages={clientMessages}>
            <Header />
            {children}
            <CookieConsent />
            <Toaster />
            <PublishSnackbar />
          </NextIntlClientProvider>
        </PostHogProvider>
        <GoogleAnalytics />
        {process.env.NODE_ENV === 'production' && (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
      </body>
    </html>
  );
}
