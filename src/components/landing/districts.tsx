'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useReveal } from '@/hooks/use-reveal';
import { MapPin, ArrowRight } from 'lucide-react';

const DEFAULT_CITY = 'warsaw';

interface DistrictConfig {
  key: string;
  nameKey: string;
  vibeKey: string;
  color: string;
  pinColor: string;
}

const districts: DistrictConfig[] = [
  {
    key: 'srodmiescie',
    nameKey: 'Śródmieście',
    vibeKey: 'vibeUrban',
    color: 'from-rose-500/10 to-orange-500/10 hover:border-rose-500/30',
    pinColor: 'text-rose-500',
  },
  {
    key: 'mokotow',
    nameKey: 'Mokotów',
    vibeKey: 'vibeGreen',
    color: 'from-emerald-500/10 to-teal-500/10 hover:border-emerald-500/30',
    pinColor: 'text-emerald-600',
  },
  {
    key: 'wola',
    nameKey: 'Wola',
    vibeKey: 'vibeModern',
    color: 'from-blue-500/10 to-cyan-500/10 hover:border-blue-500/30',
    pinColor: 'text-blue-500',
  },
  {
    key: 'pragaPolnoc',
    nameKey: 'Praga-Północ',
    vibeKey: 'vibeArtsy',
    color: 'from-violet-500/10 to-purple-500/10 hover:border-violet-500/30',
    pinColor: 'text-violet-500',
  },
  {
    key: 'pragaPoludnie',
    nameKey: 'Praga-Południe',
    vibeKey: 'vibeFamily',
    color: 'from-sky-500/10 to-blue-500/10 hover:border-sky-500/30',
    pinColor: 'text-sky-500',
  },
  {
    key: 'zoliborz',
    nameKey: 'Żoliborz',
    vibeKey: 'vibeQuiet',
    color: 'from-green-500/10 to-emerald-500/10 hover:border-green-500/30',
    pinColor: 'text-green-600',
  },
  {
    key: 'ochota',
    nameKey: 'Ochota',
    vibeKey: 'vibeStudent',
    color: 'from-amber-500/10 to-yellow-500/10 hover:border-amber-500/30',
    pinColor: 'text-amber-500',
  },
  {
    key: 'ursynow',
    nameKey: 'Ursynów',
    vibeKey: 'vibeConnected',
    color: 'from-indigo-500/10 to-blue-500/10 hover:border-indigo-500/30',
    pinColor: 'text-indigo-500',
  },
  {
    key: 'bielany',
    nameKey: 'Bielany',
    vibeKey: 'vibeNature',
    color: 'from-lime-500/10 to-green-500/10 hover:border-lime-500/30',
    pinColor: 'text-lime-600',
  },
  {
    key: 'wilanow',
    nameKey: 'Wilanów',
    vibeKey: 'vibePremium',
    color: 'from-fuchsia-500/10 to-pink-500/10 hover:border-fuchsia-500/30',
    pinColor: 'text-fuchsia-500',
  },
  {
    key: 'bemowo',
    nameKey: 'Bemowo',
    vibeKey: 'vibeAffordable',
    color: 'from-teal-500/10 to-cyan-500/10 hover:border-teal-500/30',
    pinColor: 'text-teal-600',
  },
  {
    key: 'targowek',
    nameKey: 'Targówek',
    vibeKey: 'vibeUpcoming',
    color: 'from-orange-500/10 to-amber-500/10 hover:border-orange-500/30',
    pinColor: 'text-orange-500',
  },
];

export function Districts() {
  const t = useTranslations('landing.districts');
  const reveal = useReveal();

  return (
    <section className="relative overflow-hidden border-y border-border/50 py-24 sm:py-32">
      <div className="absolute inset-0 dot-pattern opacity-30" />

      <div className="relative z-10 container mx-auto px-4 sm:px-6">
        <motion.div {...reveal({ opacity: 0, y: 20 })} className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {t('title')} <span className="gradient-text">{t('titleHighlight')}</span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">{t('subtitle')}</p>
        </motion.div>

        <div className="mx-auto grid max-w-6xl grid-cols-2 items-stretch gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {districts.map((district, i) => (
            <motion.div
              key={district.key}
              {...reveal({ opacity: 0, y: 20 }, { delay: i * 0.05 })}
              className="h-full"
            >
              <Link
                href={`/${DEFAULT_CITY}/replacement?districts=${district.nameKey}`}
                className={`group relative flex h-full flex-col gap-2 overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br p-4 backdrop-blur-sm transition-all hover:scale-[1.02] sm:p-5 ${district.color}`}
              >
                <div className="flex items-center gap-2">
                  <MapPin className={`h-4 w-4 ${district.pinColor}`} />
                  <h3 className="text-sm font-semibold sm:text-base">{t(district.key)}</h3>
                </div>
                <p className="text-xs text-muted-foreground sm:text-sm">{t(district.vibeKey)}</p>
                <div
                  className={`mt-auto flex items-center gap-1 pt-1 text-xs font-medium ${district.pinColor} opacity-0 transition-opacity group-hover:opacity-100`}
                >
                  {t('explore')}
                  <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
