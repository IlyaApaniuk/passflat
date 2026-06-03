import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { Footer } from '@/components/landing/footer';
import { ResourcesClient } from './client';
import { getAlternates, getOgImage } from '@/lib/seo';
import { JsonLd, breadcrumbJsonLd } from '@/lib/json-ld';
import { isDocumentTemplatesEnabled } from '@/lib/feature-flags';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('documents');
  return {
    title: t('resources.metaTitle'),
    description: t('resources.metaDescription'),
    alternates: getAlternates('/resources'),
    openGraph: {
      title: t('resources.metaTitle'),
      description: t('resources.metaDescription'),
      images: [getOgImage(t('resources.title'), t('resources.subtitle'))],
    },
  };
}

export default async function ResourcesPage() {
  if (!isDocumentTemplatesEnabled()) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={breadcrumbJsonLd([{ name: 'Resources', path: '/resources' }])} />
      <main className="flex-1 pt-24">
        <ResourcesClient />
      </main>
      <Footer />
    </div>
  );
}
