'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FileText,
  ArrowRight,
  Scale,
  DollarSign,
  Plane,
  HelpCircle,
} from 'lucide-react';

const DEFAULT_CITY = 'warsaw';

export function BlogClient() {
  const t = useTranslations('blog');

  const topics = [
    { icon: Scale, title: t('topic1'), desc: t('topic1Desc') },
    { icon: DollarSign, title: t('topic2'), desc: t('topic2Desc') },
    { icon: Plane, title: t('topic3'), desc: t('topic3Desc') },
    { icon: HelpCircle, title: t('topic4'), desc: t('topic4Desc') },
  ];

  return (
    <>
      {/* Hero */}
      <section className="border-b bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            {t('title')}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
      </section>

      {/* Coming Soon */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-xl text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <FileText className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">{t('comingSoon')}</h2>
            <p className="mt-3 text-muted-foreground">
              {t('comingSoonDesc')}
            </p>
          </div>
        </div>
      </section>

      {/* Planned Topics */}
      <section className="border-t bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="mb-8 text-center text-2xl font-bold">
            {t('plannedTopics')}
          </h2>
          <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
            {topics.map((topic, i) => (
              <Card key={i} className="opacity-80">
                <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <topic.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-base leading-snug">
                    {topic.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{topic.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24">
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
