import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Footer } from '@/components/landing/footer';
import { getPostBySlug, getPostSlugs } from '@/lib/blog';
import { getAlternates, getOgImage } from '@/lib/seo';
import { JsonLd, articleJsonLd, breadcrumbJsonLd } from '@/lib/json-ld';
import { SITE_URL } from '@/lib/site-url';
import { BlogArticle } from './client';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getPostSlugs().map(({ slug, locale }) => ({ slug, locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const post = getPostBySlug(slug, locale);
  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
    alternates: getAlternates(`/blog/${slug}`, await getLocale()),
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      tags: post.tags,
      images: [getOgImage(post.title, post.description)],
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const locale = await getLocale();
  const post = getPostBySlug(slug, locale);

  if (!post) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Blog', path: '/blog' },
          { name: post.title, path: `/blog/${slug}` },
        ])}
      />
      <JsonLd
        data={articleJsonLd({
          title: post.title,
          description: post.description,
          url: `${SITE_URL}/blog/${slug}`,
          datePublished: post.date,
          locale: post.locale,
        })}
      />
      <main className="flex-1 pt-24">
        <BlogArticle post={post} />
      </main>
      <Footer />
    </div>
  );
}
