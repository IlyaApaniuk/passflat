import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { Header } from '@/components/landing/header';
import { Footer } from '@/components/landing/footer';
import { BlogClient } from './client';
import { getAlternates } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('blog');
  return {
    title: `${t('title')} — Passflat`,
    description: t('subtitle'),
    alternates: getAlternates('/blog'),
  };
}

export default function BlogPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 pt-20">
        <BlogClient />
      </main>
      <Footer />
    </div>
  );
}
