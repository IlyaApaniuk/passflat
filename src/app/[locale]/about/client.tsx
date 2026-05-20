'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  Search,
  Eye,
  Users,
  Globe,
  ArrowRight,
  Repeat,
  BarChart3,
  CalendarRange,
} from 'lucide-react';

const DEFAULT_CITY = 'warsaw';

export function AboutClient() {
  const t = useTranslations('about');

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

      {/* The Problem */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 inline-flex items-center rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
              {t('problem.label')}
            </div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {t('problem.title')}
            </h2>
            <div className="mt-6 space-y-4 text-lg text-muted-foreground">
              <p>{t('problem.p1')}</p>
              <p>{t('problem.p2')}</p>
              <p>{t('problem.p3')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Solution */}
      <section className="border-t bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              {t('solution.label')}
            </div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {t('solution.title')}
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div className="rounded-xl border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
                  <Repeat className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold">
                  {t('solution.pillar1Title')}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('solution.pillar1Desc')}
                </p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10">
                  <Users className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                </div>
                <h3 className="text-lg font-semibold">
                  {t('solution.pillar2Title')}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('solution.pillar2Desc')}
                </p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
                  <CalendarRange className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold">
                  {t('solution.pillar3Title')}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('solution.pillar3Desc')}
                </p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                  <BarChart3 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold">
                  {t('solution.pillar4Title')}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('solution.pillar4Desc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Who We Are */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              {t('team.label')}
            </div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {t('team.title')}
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              {t('team.description')}
            </p>
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="border-t bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              {t('values.label')}
            </div>
            <h2 className="mb-8 text-3xl font-bold tracking-tight md:text-4xl">
              {t('values.title')}
            </h2>
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="flex flex-col items-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Eye className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">{t('values.transparency')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('values.transparencyDesc')}
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">{t('values.community')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('values.communityDesc')}
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Globe className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">{t('values.accessibility')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('values.accessibilityDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Where We're Headed */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              {t('vision.label')}
            </div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {t('vision.title')}
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              {t('vision.description')}
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            {t('ctaTitle')}
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" className="gap-2" asChild>
              <Link href={`/${DEFAULT_CITY}/replacement`}>
                <Search className="h-4 w-4" />
                {t('ctaBrowse')}
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="gap-2" asChild>
              <Link href={`/${DEFAULT_CITY}/roommate`}>
                <Users className="h-4 w-4" />
                {t('ctaRoommate')}
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="gap-2" asChild>
              <Link href={`/${DEFAULT_CITY}/sublet`}>
                <CalendarRange className="h-4 w-4" />
                {t('ctaSublet')}
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="gap-2" asChild>
              <Link href={`/${DEFAULT_CITY}/costs/submit`}>
                <ArrowRight className="h-4 w-4" />
                {t('ctaCosts')}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
