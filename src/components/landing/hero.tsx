'use client';

import { useTranslations } from 'next-intl';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { Link } from '@/i18n/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { useIsTouch, useReveal } from '@/hooks/use-reveal';
import { Plus, Sparkles } from 'lucide-react';

const DEFAULT_CITY = 'warsaw';
const MIN_STAT_THRESHOLD = 5;

interface HeroProps {
  stats?: {
    listings: number;
    costReports: number;
    districts: number;
  };
}

export function Hero({ stats: liveStats }: HeroProps) {
  const t = useTranslations('landing.hero');
  const showStats = useFeatureFlagEnabled(FEATURE_FLAGS.SHOW_STATS);
  const reveal = useReveal();
  const isTouch = useIsTouch();

  const formatStat = (n: number) => (n > 100 ? `${n.toLocaleString()}+` : n.toString());

  const allStats = [
    {
      raw: liveStats?.listings ?? 0,
      value: liveStats ? formatStat(liveStats.listings) : '0',
      labelKey: 'statsListings' as const,
    },
    {
      raw: liveStats?.costReports ?? 0,
      value: liveStats ? formatStat(liveStats.costReports) : '0',
      labelKey: 'statsCostReports' as const,
    },
    {
      raw: liveStats?.districts ?? 0,
      value: liveStats ? liveStats.districts.toString() : '0',
      labelKey: 'statsDistricts' as const,
    },
  ];
  const stats = allStats.filter((s) => s.raw >= MIN_STAT_THRESHOLD);

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-24">
      <div className="absolute inset-0 grid-pattern opacity-50" />

      <div
        className={`absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-accent/20 blur-[120px] ${
          isTouch ? '' : 'animate-pulse'
        }`}
      />
      <div
        className={`absolute -right-32 bottom-1/4 h-96 w-96 rounded-full bg-accent/10 blur-[120px] ${
          isTouch ? '' : 'animate-pulse'
        }`}
        style={{ animationDelay: '1s' }}
      />

      <div className="relative z-10 container mx-auto px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm text-accent">
            <Sparkles className="h-4 w-4" />
            <span>{t('badge')}</span>
          </div>

          <h1 className="mb-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-7xl lg:text-8xl">
            <span className="block">{t('title')}</span>
            <span className="gradient-text block">{t('titleHighlight')}</span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            {t('subtitle')}
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="group h-12 rounded-full px-8 text-base" asChild>
              <Link href="/create-listing">
                <Plus className="mr-2 h-4 w-4" />
                {t('addCta')}
              </Link>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Link
              href={`/${DEFAULT_CITY}/replacement`}
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-500/20 dark:text-blue-400"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              {t('trustLeaseTakeovers')}
            </Link>
            <Link
              href={`/${DEFAULT_CITY}/roommate`}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-500/20 dark:text-violet-400"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              {t('trustRoommate')}
            </Link>
            <Link
              href={`/${DEFAULT_CITY}/sublet`}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {t('trustSublet')}
            </Link>
          </div>

          {showStats && stats.length > 0 && (
            <motion.div
              {...reveal({ opacity: 0, y: 20 }, { duration: 0.5 })}
              className={`mx-auto mt-20 grid max-w-3xl gap-4 sm:gap-8 ${stats.length === 1 ? 'grid-cols-1 max-w-xs' : stats.length === 2 ? 'grid-cols-2 max-w-lg' : 'grid-cols-2 md:grid-cols-3'}`}
            >
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.labelKey}
                  {...reveal({ opacity: 0, scale: 0.9 }, { duration: 0.3, delay: i * 0.1 })}
                  className="rounded-2xl border border-border/50 bg-card/50 p-4 text-center backdrop-blur-sm"
                >
                  <div className="text-2xl font-bold text-accent sm:text-3xl">{stat.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
                    {t(stat.labelKey)}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <motion.div
          animate={isTouch ? undefined : { y: [0, 8, 0] }}
          transition={isTouch ? undefined : { duration: 1.5, repeat: Infinity }}
          className="flex h-10 w-6 items-start justify-center rounded-full border-2 border-muted-foreground/30 p-2"
        >
          <div className="h-2 w-1 rounded-full bg-muted-foreground/50" />
        </motion.div>
      </div>
    </section>
  );
}
