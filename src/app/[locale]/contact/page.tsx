import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { Footer } from '@/components/landing/footer';
import { ContactClient } from './client';
import { ContactSkeleton } from './contact-skeleton';
import { getAlternates, getOgImage } from '@/lib/seo';
import { JsonLd, breadcrumbJsonLd } from '@/lib/json-ld';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contact');
  const m = await getTranslations('meta');
  return {
    title: t('title'),
    description: m('contactDescription'),
    alternates: getAlternates('/contact'),
    openGraph: {
      title: t('title'),
      description: m('contactDescription'),
      images: [getOgImage(t('title'), t('subtitle'))],
    },
  };
}

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={breadcrumbJsonLd([{ name: 'Contact', path: '/contact' }])} />
      <main className="flex-1 pt-24">
        <Suspense fallback={<ContactSkeleton />}>
          <ContactClient />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
