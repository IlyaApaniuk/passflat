import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { Header } from '@/components/landing/header';
import { Footer } from '@/components/landing/footer';
import { AboutClient } from './client';
import { getAlternates, getOgImage } from '@/lib/seo';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { JsonLd, organizationJsonLd, breadcrumbJsonLd } from '@/lib/json-ld';
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
  let hasContributed = false;
  let stats: { listings: number; costReports: number } | undefined;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const report = await prisma.costReport.findFirst({
        where: { authorId: user.id, isVisible: true },
        select: { id: true },
      });
      if (report) hasContributed = true;
    }
  } catch {
    // Auth/DB unavailable
  }

  try {
    const [listings, costReports] = await Promise.all([
      prisma.listing.count({ where: { status: 'active' } }),
      prisma.costReport.count(),
    ]);
    stats = { listings, costReports };
  } catch {
    // DB unavailable — use defaults
  }

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={breadcrumbJsonLd([{ name: 'About', path: '/about' }])} />
      <Header />
      <main className="flex-1 pt-20">
        <AboutClient hasContributed={hasContributed} stats={stats} />
      </main>
      <Footer />
    </div>
  );
}
