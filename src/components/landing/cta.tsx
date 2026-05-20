'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from "@/components/ui/button";
import { ArrowRight, Plus, Users, CalendarRange, Repeat } from "lucide-react";

const DEFAULT_CITY = 'warsaw';

const quickLinks = [
  { type: 'replacement' as const, href: `/${DEFAULT_CITY}/replacement`, icon: Repeat, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  { type: 'roommate' as const, href: `/${DEFAULT_CITY}/roommate`, icon: Users, color: 'bg-violet-500/10 text-violet-500 border-violet-500/20' },
  { type: 'sublet' as const, href: `/${DEFAULT_CITY}/sublet`, icon: CalendarRange, color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
] as const;

export function CTA() {
  const t = useTranslations();

  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative mx-auto max-w-4xl"
        >
          <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/50 p-8 backdrop-blur-xl sm:p-12 md:p-16">
            {/* Background Glow */}
            <div className="absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/20 blur-[120px]" />
            <div className="absolute bottom-0 right-0 h-64 w-64 translate-x-1/4 translate-y-1/4 rounded-full bg-accent/10 blur-[80px]" />

            {/* Grid Pattern */}
            <div className="absolute inset-0 grid-pattern rounded-3xl opacity-30" />

            {/* Content */}
            <div className="relative z-10 text-center">
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl"
              >
                {t('landing.cta.title')}{' '}
                <span className="gradient-text">{t('landing.cta.titleHighlight')}</span>
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="mx-auto mb-8 max-w-xl text-lg text-muted-foreground sm:text-xl"
              >
                {t('landing.cta.subtitle')}
              </motion.p>

              {/* Listing type quick-links */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15 }}
                className="mx-auto mb-8 flex max-w-lg flex-col gap-3 sm:flex-row sm:justify-center"
              >
                {quickLinks.map(({ type, href, icon: Icon, color }) => (
                  <Link
                    key={type}
                    href={href}
                    className={`group flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all hover:scale-[1.02] ${color}`}
                  >
                    <Icon className="h-4 w-4" />
                    {t(`listings.types.${type}`)}
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </Link>
                ))}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.25 }}
                className="flex flex-col items-center justify-center gap-4 sm:flex-row"
              >
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-border px-8 text-base hover:bg-secondary"
                  asChild
                >
                  <Link href="/create-listing">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('landing.cta.listCta')}
                  </Link>
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
