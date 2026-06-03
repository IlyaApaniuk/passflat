'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useReveal } from '@/hooks/use-reveal';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export function CTA() {
  const t = useTranslations();
  const reveal = useReveal();

  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div {...reveal({ opacity: 0, y: 20 })} className="relative mx-auto max-w-4xl">
          <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/50 p-8 backdrop-blur-xl sm:p-12 md:p-16">
            {/* Background Glow */}
            <div className="absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/20 blur-[120px]" />
            <div className="absolute bottom-0 right-0 h-64 w-64 translate-x-1/4 translate-y-1/4 rounded-full bg-accent/10 blur-[80px]" />

            {/* Grid Pattern */}
            <div className="absolute inset-0 grid-pattern rounded-3xl opacity-30" />

            {/* Content */}
            <div className="relative z-10 text-center">
              <motion.h2
                {...reveal({ opacity: 0, y: 10 })}
                className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl"
              >
                {t('landing.cta.title')}{' '}
                <span className="gradient-text">{t('landing.cta.titleHighlight')}</span>
              </motion.h2>

              <motion.p
                {...reveal({ opacity: 0, y: 10 }, { delay: 0.1 })}
                className="mx-auto mb-8 max-w-xl text-lg text-muted-foreground sm:text-xl"
              >
                {t('landing.cta.subtitle')}
              </motion.p>

              <motion.div
                {...reveal({ opacity: 0, y: 10 }, { delay: 0.25 })}
                className="flex flex-col items-center justify-center"
              >
                <Button size="lg" className="h-12 rounded-full px-8 text-base" asChild>
                  <Link href="/create-listing">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('landing.cta.listCta')}
                  </Link>
                </Button>
                <p className="mt-4 text-sm text-muted-foreground">{t('landing.cta.freeNote')}</p>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
