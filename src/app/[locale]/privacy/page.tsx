import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Footer } from '@/components/landing/footer';
import { PrivacyClient } from './client';
import { getAlternates, getOgImage } from '@/lib/seo';
import { pickMessages } from '@/i18n/messages';
import { JsonLd, breadcrumbJsonLd } from '@/lib/json-ld';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('privacy');
  const m = await getTranslations('meta');
  return {
    title: t('title'),
    description: m('privacyDescription'),
    alternates: getAlternates('/privacy', await getLocale()),
    openGraph: {
      title: t('title'),
      description: m('privacyDescription'),
      images: [getOgImage(t('title'), t('subtitle'))],
    },
  };
}

export default async function PrivacyPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Scoped provider: only the `privacy` namespace reaches the client here, so
  // this large content namespace stays out of the shared layout payload.
  const messages = await getMessages();

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={breadcrumbJsonLd([{ name: 'Privacy', path: '/privacy' }])} />
      <main className="flex-1 pt-24">
        <NextIntlClientProvider messages={pickMessages(messages, ['privacy', 'common'])}>
          <PrivacyClient />
        </NextIntlClientProvider>
      </main>
      <Footer />
    </div>
  );
}
