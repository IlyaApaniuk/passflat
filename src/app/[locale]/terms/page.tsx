import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { Footer } from '@/components/landing/footer';
import { TermsClient } from './client';
import { getAlternates, getOgImage } from '@/lib/seo';
import { JsonLd, breadcrumbJsonLd } from '@/lib/json-ld';
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

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={breadcrumbJsonLd([{ name: 'Terms', path: '/terms' }])} />
      <main className="flex-1 pt-24">
        <TermsClient />
      </main>
      <Footer />
    </div>
  );
}
