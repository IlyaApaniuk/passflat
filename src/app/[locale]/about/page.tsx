import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { Footer } from '@/components/landing/footer';
import { AboutClient } from './client';
import { getAlternates, getOgImage } from '@/lib/seo';
import { prisma } from '@/lib/prisma';
import { JsonLd, organizationJsonLd, breadcrumbJsonLd } from '@/lib/json-ld';

// Display-only counts, cached so this page renders statically (no per-request
// DB hit). The `hasContributed` personalization is resolved on the client.
const getAboutStats = unstable_cache(
  async () => {
    const [listings, costReports] = await Promise.all([
      prisma.listing.count({ where: { status: 'active' } }),
      prisma.costReport.count(),
    ]);
    return { listings, costReports };
  },
  ['about-stats'],
  { revalidate: 300 },
);
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('about');
  const m = await getTranslations('meta');
  return {
    title: t('title'),
    description: m('aboutDescription'),
    alternates: getAlternates('/about'),
    openGraph: {
      title: t('title'),
      description: m('aboutDescription'),
      images: [getOgImage(t('title'), t('subtitle'))],
    },
  };
}

export default async function AboutPage() {
  let stats: { listings: number; costReports: number } | undefined;

  try {
    stats = await getAboutStats();
  } catch {
    // DB unavailable — use defaults
  }

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={breadcrumbJsonLd([{ name: 'About', path: '/about' }])} />
      <main className="flex-1 pt-24">
        <AboutClient stats={stats} />
      </main>
      <Footer />
    </div>
  );
}
