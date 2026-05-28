import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { Header } from '@/components/landing/header';
import { Footer } from '@/components/landing/footer';
import { AboutClient } from './client';
import { getAlternates } from '@/lib/seo';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('about');
  return {
    title: `${t('title')} — Passflat`,
    description: t('subtitle'),
    alternates: getAlternates('/about'),
  };
}

export default async function AboutPage() {
  let hasContributed = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
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

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 pt-20">
        <AboutClient hasContributed={hasContributed} />
      </main>
      <Footer />
    </div>
  );
}
