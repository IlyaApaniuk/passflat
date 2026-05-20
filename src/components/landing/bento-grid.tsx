'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  TrendingDown,
  Shield,
  Eye,
  Zap,
  Building2,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const DEFAULT_CITY = 'warsaw';

interface BentoItem {
  titleKey: string;
  descKey: string;
  icon: LucideIcon;
  className: string;
  gradient: string;
  featured?: boolean;
}

const bentoItems: BentoItem[] = [
  {
    titleKey: 'realCostTitle',
    descKey: 'realCostDesc',
    icon: Eye,
    className: 'md:col-span-2 md:row-span-2',
    gradient: 'from-accent/20 via-transparent to-transparent',
    featured: true,
  },
  {
    titleKey: 'saveDepositTitle',
    descKey: 'saveDepositDesc',
    icon: TrendingDown,
    className: 'md:col-span-1',
    gradient: 'from-blue-500/10 via-transparent to-transparent',
  },
  {
    titleKey: 'verifiedTitle',
    descKey: 'verifiedDesc',
    icon: Shield,
    className: 'md:col-span-1',
    gradient: 'from-emerald-500/10 via-transparent to-transparent',
  },
  {
    titleKey: 'buildingsTitle',
    descKey: 'buildingsDesc',
    icon: Building2,
    className: 'md:col-span-1',
    gradient: 'from-orange-500/10 via-transparent to-transparent',
  },
  {
    titleKey: 'matchingTitle',
    descKey: 'matchingDesc',
    icon: Zap,
    className: 'md:col-span-1',
    gradient: 'from-yellow-500/10 via-transparent to-transparent',
  },
  {
    titleKey: 'communityTitle',
    descKey: 'communityDesc',
    icon: Users,
    className: 'md:col-span-2',
    gradient: 'from-pink-500/10 via-transparent to-transparent',
  },
];

export function BentoGrid() {
  const t = useTranslations('landing.bentoGrid');

  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="absolute inset-0 dot-pattern opacity-30" />

      <div className="relative z-10 container mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16 text-center"
        >
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {t('titleBefore')}{' '}
            <span className="gradient-text">{t('titleHighlight')}</span>
            {t('titleAfter')}
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            {t('subtitle')}
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-4">
          {bentoItems.map((item, index) => (
            <motion.div
              key={item.titleKey}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className={`group relative overflow-hidden rounded-3xl border border-border/50 bg-card/50 backdrop-blur-sm ${item.className}`}
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
              />

              <div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
              </div>

              <div
                className={`relative z-10 flex h-full flex-col p-6 sm:p-8 ${item.featured ? 'min-h-[300px] justify-between md:min-h-[400px]' : 'min-h-[180px]'}`}
              >
                <div
                  className={`mb-4 flex items-center justify-center rounded-2xl bg-secondary transition-transform group-hover:scale-110 ${item.featured ? 'h-14 w-14' : 'h-12 w-12'}`}
                >
                  <item.icon
                    className={`text-accent ${item.featured ? 'h-7 w-7' : 'h-5 w-5'}`}
                  />
                </div>

                <div>
                  <h3
                    className={`mb-2 font-semibold ${item.featured ? 'text-2xl sm:text-3xl' : 'text-lg'}`}
                  >
                    {t(item.titleKey)}
                  </h3>
                  <p
                    className={`text-muted-foreground ${item.featured ? 'text-base sm:text-lg' : 'text-sm'}`}
                  >
                    {t(item.descKey)}
                  </p>
                </div>

                {item.featured && (
                  <Link
                    href={`/${DEFAULT_CITY}/costs`}
                    className="group/link mt-4 inline-flex items-center text-accent hover:underline"
                  >
                    {t('exploreCta')}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/link:translate-x-1" />
                  </Link>
                )}
              </div>

              <div className="pointer-events-none absolute inset-0 rounded-3xl border border-accent/0 transition-colors duration-300 group-hover:border-accent/30" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
