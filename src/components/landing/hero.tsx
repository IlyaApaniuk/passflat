'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { motion, useAnimation } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';

const DEFAULT_CITY = 'warsaw';

const stats = [
  { value: '2,400+', labelKey: 'statsListings' },
  { value: '890', labelKey: 'statsCostReports' },
  { value: '12', labelKey: 'statsDistricts' },
  { value: '4.9', labelKey: 'statsAvgRating' },
] as const;

export function Hero() {
  const t = useTranslations('landing.hero');
  const controls = useAnimation();

  useEffect(() => {
    controls.start('visible');
  }, [controls]);

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-24">
      <div className="absolute inset-0 grid-pattern opacity-50" />

      <div className="absolute -left-32 top-1/4 h-96 w-96 animate-pulse rounded-full bg-accent/20 blur-[120px]" />
      <div
        className="absolute -right-32 bottom-1/4 h-96 w-96 animate-pulse rounded-full bg-accent/10 blur-[120px]"
        style={{ animationDelay: '1s' }}
      />

      <div className="relative z-10 container mx-auto px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={controls}
            variants={{ visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.5 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm text-accent"
          >
            <Sparkles className="h-4 w-4" />
            <span>{t('badge')}</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={controls}
            variants={{ visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-7xl lg:text-8xl"
          >
            <span className="block">{t('title')}</span>
            <span className="gradient-text block">{t('titleHighlight')}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={controls}
            variants={{ visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl"
          >
            {t('subtitle')}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={controls}
            variants={{ visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button
              size="lg"
              className="group h-12 rounded-full px-8 text-base"
              asChild
            >
              <Link href={`/${DEFAULT_CITY}/replacement`}>
                {t('browseCta')}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 rounded-full border-border px-8 text-base hover:bg-secondary"
              asChild
            >
              <Link href={`/${DEFAULT_CITY}/costs`}>
                {t('costsCta')}
              </Link>
            </Button>
          </motion.div>

          {/* Listing type pills */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={controls}
            variants={{ visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-2"
          >
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
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={controls}
            variants={{ visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mx-auto mt-20 grid max-w-3xl grid-cols-2 gap-4 sm:gap-8 md:grid-cols-4"
          >
            {stats.map((stat, i) => (
              <motion.div
                key={stat.labelKey}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={controls}
                variants={{ visible: { opacity: 1, scale: 1 } }}
                transition={{ duration: 0.3, delay: 0.5 + i * 0.1 }}
                className="rounded-2xl border border-border/50 bg-card/50 p-4 text-center backdrop-blur-sm"
              >
                <div className="text-2xl font-bold text-accent sm:text-3xl">
                  {stat.value}
                </div>
                <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
                  {t(stat.labelKey)}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={controls}
        variants={{ visible: { opacity: 1 } }}
        transition={{ delay: 1, duration: 0.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="flex h-10 w-6 items-start justify-center rounded-full border-2 border-muted-foreground/30 p-2"
        >
          <motion.div className="h-2 w-1 rounded-full bg-muted-foreground/50" />
        </motion.div>
      </motion.div>
    </section>
  );
}
