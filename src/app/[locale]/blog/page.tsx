import { getTranslations } from 'next-intl/server';
import { getLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Header } from '@/components/landing/header';
import { Footer } from '@/components/landing/footer';
import { BlogClient } from './client';
import { getAlternates, getOgImage } from '@/lib/seo';
import { getAllPosts } from '@/lib/blog';
import { JsonLd, breadcrumbJsonLd } from '@/lib/json-ld';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('blog');
  const m = await getTranslations('meta');
  return {
    title: t('title'),
    description: m('blogDescription'),
    alternates: getAlternates('/blog'),
    openGraph: {
      title: t('title'),
      description: m('blogDescription'),
      images: [getOgImage(t('title'), t('subtitle'))],
    },
  };
}

export default async function BlogPage() {
  const locale = await getLocale();
  const posts = getAllPosts(locale);

  const serialized = posts.map(({ content: _content, ...rest }) => rest);

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={breadcrumbJsonLd([{ name: 'Blog', path: '/blog' }])} />
      <Header />
      <main className="flex-1 pt-24">
        <BlogClient posts={serialized} />
      </main>
      <Footer />
    </div>
  );
}
