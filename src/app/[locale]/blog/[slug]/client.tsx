'use client';

import { useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { Link } from '@/i18n/navigation';
import { ArrowLeft, Calendar, Tag } from 'lucide-react';
import { MDXRemote } from 'next-mdx-remote';
import type { BlogPost } from '@/lib/blog';
import { TemplateDownload } from '@/components/documents/template-download';
import { isDocumentTemplatesEnabled } from '@/lib/feature-flags';

const CESJA_SLUG = 'cesja-najmu-guide';

// Hosts whose links earn a commission. Drives both the rel="sponsored"
// annotation (Google requires it on paid links) and the click event.
const AFFILIATE_HOSTS = ['connectorlink.online'];

function affiliateHost(href: string): string | null {
  try {
    const host = new URL(href).hostname.replace(/^www\./, '');
    return AFFILIATE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? host : null;
  } catch {
    return null;
  }
}

export function BlogArticle({ post }: { post: BlogPost & { mdxSource?: unknown } }) {
  const t = useTranslations('blog');
  const tDocs = useTranslations('documents');
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
            <div className="flex items-center gap-1.5">
              <Tag className="h-4 w-4" />
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

          {post.slug === CESJA_SLUG && isDocumentTemplatesEnabled() && (
            <div className="mx-auto mt-10 max-w-3xl">
              <p className="mb-3 text-sm font-medium">{tDocs('blog.subtitle')}</p>
              <TemplateDownload documentKey="cesja" source="blog" showDescription />
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const html = markdownToHtml(content);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function markdownToHtml(md: string): string {
  let html = md;

  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // External links open in a new tab; affiliate links additionally carry
  // rel="sponsored" (required for paid links) on top of the safety rel.
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, href: string) => {
    if (!/^https?:\/\//.test(href)) return `<a href="${href}">${text}</a>`;
    const rel = affiliateHost(href) ? 'sponsored nofollow noopener' : 'noopener';
    return `<a href="${href}" target="_blank" rel="${rel}">${text}</a>`;
  });

  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      result.push(`<li>${trimmed.slice(2)}</li>`);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      if (
        trimmed &&
        !trimmed.startsWith('<h') &&
        !trimmed.startsWith('<ul') &&
        !trimmed.startsWith('<li') &&
        !trimmed.startsWith('</') &&
        !trimmed.startsWith('<ol')
      ) {
        result.push(`<p>${trimmed}</p>`);
      } else if (trimmed) {
        result.push(trimmed);
      }
    }
  }
  if (inList) result.push('</ul>');

  return result.join('\n');
}
