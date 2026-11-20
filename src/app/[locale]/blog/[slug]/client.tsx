'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { Link } from '@/i18n/navigation';
import { ArrowLeft, Calendar, Tag } from 'lucide-react';
import { MDXRemote } from 'next-mdx-remote';
import type { BlogPost } from '@/lib/blog';
import { TemplateDownload } from '@/components/documents/template-download';
import { isDocumentTemplatesEnabled } from '@/lib/feature-flags';
import { affiliateHost, markdownToHtml } from '@/lib/blog-markdown';

// Articles that end with a matching document-template download block.
const SLUG_TO_DOC: Record<string, 'cesja' | 'protokol'> = {
  'cesja-najmu-guide': 'cesja',
  'protokol-zdawczo-odbiorczy-warsaw': 'protokol',
};

const DEFAULT_CITY = 'warsaw';

export function BlogArticle({
  post,
  flatmateCallout,
}: {
  post: BlogPost & { mdxSource?: unknown };
  /** `<FlatmateCallout surface="guide" />` from the server page (PRD 4 FR-12). */
  flatmateCallout: ReactNode;
}) {
  const t = useTranslations('blog');
  const tDocs = useTranslations('documents');
  const tListings = useTranslations('listings');
  const posthog = usePostHog();

  // Markdown links render as plain <a>, so affiliate clicks are caught here by
  // delegation instead of per-link components.
  const onArticleClick = (e: React.MouseEvent<HTMLElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor?.href) return;
    const partner = affiliateHost(anchor.href);
    if (partner) {
      posthog?.capture('affiliate_link_clicked', {
        partner,
        article: post.slug,
        href: anchor.href,
      });
    }
  };

  return (
    <>
      <section className="border-b bg-muted/30 py-12 md:py-16">
        <div className="container mx-auto px-4">
          <Link
            href="/blog"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('backToBlog')}
          </Link>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
            {post.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{post.description}</p>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {new Date(post.date).toLocaleDateString(post.locale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
            {/* flex-wrap: six localized tags overflow a 390px viewport and drag
                the whole page into horizontal scroll without it. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag className="h-4 w-4 shrink-0" />
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <article
            className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl"
            onClick={onArticleClick}
          >
            {post.mdxSource ? (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <MDXRemote {...(post.mdxSource as any)} />
            ) : (
              <MarkdownContent content={post.content} />
            )}
          </article>

          {SLUG_TO_DOC[post.slug] && isDocumentTemplatesEnabled() && (
            <div className="mx-auto mt-10 max-w-3xl">
              <p className="mb-3 text-sm font-medium">{tDocs('blog.subtitle')}</p>
              <TemplateDownload
                documentKey={SLUG_TO_DOC[post.slug]}
                source="blog"
                showDescription
              />
            </div>
          )}

          {/* PRD 4 FR-12: the end of every guide. The bridge line is the roommate page's, without
              its cost_data_cta_clicked event (that one belongs to the roommate bridge). */}
          <div className="mx-auto mt-10 max-w-3xl space-y-4">
            <p className="text-sm">
              <Link
                href={`/${DEFAULT_CITY}/check`}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {tListings('roommateCostsBridge')}{' '}
                <span className="font-medium text-primary underline-offset-4 hover:underline">
                  {tListings('roommateCostsBridgeCta')}
                </span>
              </Link>
            </p>
            {flatmateCallout}
          </div>
        </div>
      </section>
    </>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const html = markdownToHtml(content);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
