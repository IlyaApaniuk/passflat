import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { Header } from '@/components/landing/header';
import { Footer } from '@/components/landing/footer';
import { PricingClient } from './client';
import { getAlternates, getOgImage } from '@/lib/seo';
import { JsonLd, breadcrumbJsonLd } from '@/lib/json-ld';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pricing');
  const m = await getTranslations('meta');
  return {
    title: t('title'),
    description: m('pricingDescription'),
    alternates: getAlternates('/pricing'),
    openGraph: {
      title: t('title'),
      description: m('pricingDescription'),
      images: [getOgImage(t('title'), t('subtitle'))],
    },
  };
}

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={breadcrumbJsonLd([{ name: 'Pricing', path: '/pricing' }])} />
      <Header />
      <main className="flex-1 pt-20">
        <PricingClient />
      </main>
      <Footer />
    </div>
  );
}
