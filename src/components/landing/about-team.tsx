'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useReveal } from '@/hooks/use-reveal';
import { Heart, ArrowRight } from 'lucide-react';

export function AboutTeam() {
  const t = useTranslations('landing.aboutTeam');
  const reveal = useReveal();

  return (
    <section className="py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div
          {...reveal({ opacity: 0, y: 20 })}
          className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
            <Heart className="h-5 w-5 text-accent" />
          </div>
          <p className="text-lg text-muted-foreground">{t('text')}</p>
          <Link
            href="/about"
            className="group inline-flex items-center text-sm font-medium text-accent hover:underline"
          >
            {t('link')}
            <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
