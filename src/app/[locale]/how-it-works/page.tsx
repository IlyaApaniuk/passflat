import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { Header } from '@/components/landing/header';
import { Footer } from '@/components/landing/footer';
import { HowItWorksClient } from './client';
import { getAlternates } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('howItWorksPage');
  return {
    title: `${t('title')} — Passflat`,
    description: t('subtitle'),
    alternates: getAlternates('/how-it-works'),
  };
}

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 pt-20">
        <HowItWorksClient />
      </main>
      <Footer />
    </div>
  );
}
