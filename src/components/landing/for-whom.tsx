'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ArrowRight, CalendarRange, Search, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const DEFAULT_CITY = 'warsaw';

interface PersonaConfig {
  key: string;
  icon: LucideIcon;
  href: string;
  color: string;
  iconBg: string;
}

const personas: PersonaConfig[] = [
  {
    key: 'findHome',
    icon: Search,
    href: `/${DEFAULT_CITY}/replacement`,
    color: 'from-blue-500/10 via-transparent to-transparent hover:border-blue-500/30',
    iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  {
    key: 'findRoommate',
    icon: Users,
    href: `/${DEFAULT_CITY}/roommate`,
    color: 'from-violet-500/10 via-transparent to-transparent hover:border-violet-500/30',
    iconBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  {
    key: 'sublet',
    icon: CalendarRange,
    href: `/${DEFAULT_CITY}/sublet`,
    color: 'from-amber-500/10 via-transparent to-transparent hover:border-amber-500/30',
    iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
];

export function ForWhom() {
  const t = useTranslations('landing');

  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="relative z-10 container mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-5xl"
        >
          <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/50 p-8 backdrop-blur-xl sm:p-12 md:p-16">
            <div className="absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/20 blur-[120px]" />
            <div className="absolute bottom-0 right-0 h-64 w-64 translate-x-1/4 translate-y-1/4 rounded-full bg-accent/10 blur-[80px]" />
            <div className="absolute inset-0 grid-pattern rounded-3xl opacity-30" />

            <div className="relative z-10">
              <div className="mb-12 text-center">
                <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
                  {t('cta.title')} <span className="gradient-text">{t('cta.titleHighlight')}</span>
                </h2>
                <p className="mx-auto max-w-xl text-lg text-muted-foreground sm:text-xl">
                  {t('cta.subtitle')}
                </p>
              </div>

              <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {personas.map((persona, i) => (
                  <motion.div
                    key={persona.key}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className={`group relative flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br bg-background/50 p-6 backdrop-blur-sm transition-colors ${persona.color}`}
                  >
                    <div
                      className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${persona.iconBg}`}
                    >
                      <persona.icon className="h-5 w-5" />
                    </div>

                    <h3 className="mb-2 text-lg font-semibold">
                      {t(`forWhom.${persona.key}.title`)}
                    </h3>
                    <p className="mb-5 flex-1 text-sm text-muted-foreground">
                      {t(`forWhom.${persona.key}.description`)}
                    </p>

                    <Button variant="outline" className="group/btn w-full rounded-full" asChild>
                      <Link href={persona.href}>
                        {t(`forWhom.${persona.key}.cta`)}
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                      </Link>
                    </Button>
                  </motion.div>
                ))}
              </div>

              <p className="mt-8 text-center text-sm text-muted-foreground">{t('cta.freeNote')}</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
