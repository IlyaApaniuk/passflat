'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, ArrowRight, Calendar, Tag } from 'lucide-react';

interface PostSummary {
  slug: string;
  locale: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
}

const DEFAULT_CITY = 'warsaw';

export function BlogClient({ posts }: { posts: PostSummary[] }) {
  const t = useTranslations('blog');

  if (posts.length === 0) {
    return <BlogComingSoon />;
  }

  return (
    <>
      <section className="border-b bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{t('title')}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">{t('subtitle')}</p>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto grid max-w-4xl gap-8">
            {posts.map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="group">
                <Card className="transition-shadow hover:shadow-lg">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-2">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(post.date).toLocaleDateString(post.locale, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <CardTitle className="text-xl leading-snug group-hover:text-primary transition-colors">
                      {post.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{post.description}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <p className="text-lg text-muted-foreground">{t('ctaText')}</p>
          <Button size="lg" className="mt-6 gap-2" asChild>
            <Link href={`/${DEFAULT_CITY}/costs`}>
              {t('ctaButton')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}

function BlogComingSoon() {
  const t = useTranslations('blog');

  return (
    <>
      <section className="border-b bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{t('title')}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">{t('subtitle')}</p>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-xl text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <FileText className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">{t('comingSoon')}</h2>
            <p className="mt-3 text-muted-foreground">{t('comingSoonDesc')}</p>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <p className="text-lg text-muted-foreground">{t('ctaText')}</p>
          <Button size="lg" className="mt-6 gap-2" asChild>
            <Link href={`/warsaw/costs`}>
              {t('ctaButton')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
