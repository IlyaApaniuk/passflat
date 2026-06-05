import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Footer } from '@/components/landing/footer';
import { TermsClient } from './client';
import { getAlternates, getOgImage } from '@/lib/seo';
import { pickMessages } from '@/i18n/messages';
import { JsonLd, breadcrumbJsonLd } from '@/lib/json-ld';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('termsPage');
  const m = await getTranslations('meta');
  return {
    title: t('title'),
    description: m('termsDescription'),
    alternates: getAlternates('/terms'),
    openGraph: {
      title: t('title'),
      description: m('termsDescription'),
      images: [getOgImage(t('title'), t('subtitle'))],
    },
  };
}

export default async function TermsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Scoped provider keeps the large `termsPage` namespace out of the shared
  // layout client payload.
  const messages = await getMessages();

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={breadcrumbJsonLd([{ name: 'Terms', path: '/terms' }])} />
      <main className="flex-1 pt-24">
        <NextIntlClientProvider messages={pickMessages(messages, ['termsPage', 'common'])}>
          <TermsClient />
        </NextIntlClientProvider>
      </main>
      <Footer />
    </div>
  );
}
