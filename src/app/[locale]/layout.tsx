import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { getAlternates, getOgImage } from '@/lib/seo';
import { Header } from '@/components/landing/header';

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

  setRequestLocale(locale);

  // No auth is read here: keeping the layout free of cookies()/auth lets the
  // public/content routes render statically. The Header resolves auth on the
  // client (it still mounts once at this level, so it does not remount or
  // re-subscribe on navigation).
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Header />
      {children}
    </NextIntlClientProvider>
  );
}
