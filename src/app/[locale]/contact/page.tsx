import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { Header } from '@/components/landing/header';
import { Footer } from '@/components/landing/footer';
import { ContactClient } from './client';
import { getAlternates } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contact');
  return {
    title: `${t('title')} — Passflat`,
    description: t('subtitle'),
    alternates: getAlternates('/contact'),
  };
}

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 pt-20">
        <ContactClient />
      </main>
      <Footer />
    </div>
  );
}
