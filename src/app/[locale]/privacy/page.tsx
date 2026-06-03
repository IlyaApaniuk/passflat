import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { Footer } from '@/components/landing/footer';
import { PrivacyClient } from './client';
import { getAlternates, getOgImage } from '@/lib/seo';
import { JsonLd, breadcrumbJsonLd } from '@/lib/json-ld';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('privacy');
  const m = await getTranslations('meta');
  return {
    title: t('title'),
    description: m('privacyDescription'),
    alternates: getAlternates('/privacy'),
    openGraph: {
      title: t('title'),
      description: m('privacyDescription'),
      images: [getOgImage(t('title'), t('subtitle'))],
    },
  };
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={breadcrumbJsonLd([{ name: 'Privacy', path: '/privacy' }])} />
      <main className="flex-1 pt-24">
        <PrivacyClient />
      </main>
      <Footer />
    </div>
  );
}
