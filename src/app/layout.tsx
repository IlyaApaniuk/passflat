import type { Metadata } from 'next';
import { Manrope, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { getLocale } from 'next-intl/server';
import { PostHogProvider } from '@/components/providers/posthog-provider';
import { CookieConsent } from '@/components/cookie-consent';
import { Toaster } from '@/components/ui/sonner';
import { PublishSnackbar } from '@/components/publish-snackbar';
import './globals.css';

const manrope = Manrope({ subsets: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'], variable: '--font-manrope' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin', 'cyrillic'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Passflat - Find Your Next Home in Warsaw',
  description:
    'European rental marketplace with transparent costs. Find lease takeovers, compare real rental expenses, and discover your perfect apartment.',
  icons: {
    icon: { url: '/icon.svg', type: 'image/svg+xml' },
    apple: '/icon.svg',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning className={`${manrope.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased min-h-screen bg-background text-foreground">
        <PostHogProvider>
          {children}
          <CookieConsent />
          <Toaster />
          <PublishSnackbar />
        </PostHogProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  );
}
