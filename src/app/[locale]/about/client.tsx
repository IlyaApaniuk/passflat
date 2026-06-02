'use client';

import { useTranslations } from 'next-intl';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import {
  Search,
  EyeOff,
  Users,
  Unlock,
  ArrowRight,
  Repeat,
  BarChart3,
  CalendarRange,
  Database,
  Heart,
} from 'lucide-react';

const DEFAULT_CITY = 'warsaw';

interface AboutStats {
  listings: number;
  costReports: number;
}

export function AboutClient({
  hasContributed = false,
  stats,
}: {
  hasContributed?: boolean;
  stats?: AboutStats;
}) {
  const t = useTranslations('about');
  const showStats = useFeatureFlagEnabled(FEATURE_FLAGS.SHOW_STATS);

  return (
    <>
      {/* Hero */}
      <section className="border-b bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{t('title')}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">{t('subtitle')}</p>
        </div>
      </section>

      {/* The Problem */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 inline-flex items-center rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
              {t('problem.label')}
            </div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('problem.title')}</h2>
            <div className="mt-6 space-y-4 text-lg text-muted-foreground">
              <p>
                {t.rich('problem.p1', {
                  howItWorksLink: (chunks) => (
                    <Link href="/how-it-works" className="text-primary hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
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
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('solution.title')}</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div className="rounded-xl border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Repeat className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">{t('solution.pillar1Title')}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t('solution.pillar1Desc')}</p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">{t('solution.pillar2Title')}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t('solution.pillar2Desc')}</p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <CalendarRange className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">{t('solution.pillar3Title')}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t('solution.pillar3Desc')}</p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">
                  <Link
                    href={`/${DEFAULT_CITY}/costs`}
                    className="hover:text-primary hover:underline"
                  >
                    {t('solution.pillar4Title')}
                  </Link>
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{t('solution.pillar4Desc')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      {showStats && stats && (stats.listings > 0 || stats.costReports > 0) && (
        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto grid max-w-3xl gap-8 sm:grid-cols-2">
              <div className="text-center">
                <p className="text-3xl font-bold tracking-tight text-primary md:text-4xl">
                  {stats.listings}+
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{t('stats.listings')}</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold tracking-tight text-primary md:text-4xl">
                  {stats.costReports}+
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{t('stats.costReports')}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Who We Are */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              {t('team.label')}
            </div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('team.title')}</h2>
            <div className="mt-4 space-y-4 text-lg text-muted-foreground">
              <p>{t('team.description')}</p>
              <p>{t('team.description2')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Principles */}
      <section className="border-t bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              {t('values.label')}
            </div>
            <h2 className="mb-8 text-3xl font-bold tracking-tight md:text-4xl">
              {t('values.title')}
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-xl border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <EyeOff className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">{t('values.principle1')}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t('values.principle1Desc')}</p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Database className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">{t('values.principle2')}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t('values.principle2Desc')}</p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Unlock className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">{t('values.principle3')}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t('values.principle3Desc')}</p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Heart className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">{t('values.principle4')}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t('values.principle4Desc')}</p>
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
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('vision.title')}</h2>
            <p className="mt-4 text-lg text-muted-foreground">{t('vision.description')}</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('ctaTitle')}</h2>
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
            {hasContributed ? (
              <Button size="lg" variant="outline" className="gap-2" asChild>
                <Link href={`/${DEFAULT_CITY}/costs`}>
                  <BarChart3 className="h-4 w-4" />
                  {t('ctaCostsExplore')}
                </Link>
              </Button>
            ) : (
              <Button size="lg" variant="outline" className="gap-2" asChild>
                <Link href={`/${DEFAULT_CITY}/costs/submit`}>
                  <ArrowRight className="h-4 w-4" />
                  {t('ctaCosts')}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
