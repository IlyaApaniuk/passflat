'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from "@/components/ui/button";
import { ArrowRight, Lock, Eye, CheckCircle2 } from "lucide-react";

const DEFAULT_CITY = 'warsaw';

interface CostTransparencyProps {
  citySlug?: string;
  hasContributed?: boolean;
}

export function CostTransparency({ citySlug = DEFAULT_CITY, hasContributed = false }: CostTransparencyProps) {
  const t = useTranslations();

  const costData = [
    { label: t('common.rent'), value: "3,200 PLN", visible: true },
    { label: t('common.adminFee'), value: "450 PLN", visible: true },
    { label: t('landing.costTransparency.electricity'), value: "280 PLN", visible: false },
    { label: t('landing.costTransparency.internet'), value: "89 PLN", visible: false },
    { label: t('landing.costTransparency.gasHeating'), value: "180 PLN", visible: false },
  ];

  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/5 to-transparent" />

      <div className="relative z-10 container mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-sm text-accent">
              <Eye className="h-4 w-4" />
              {t('landing.costTransparency.badge')}
            </div>

            <h2 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              {t('landing.costTransparency.title')}{' '}
              <span className="gradient-text">{t('landing.costTransparency.titleHighlight')}</span>
            </h2>

            <p className="mb-8 text-lg text-muted-foreground">
              {t('landing.costTransparency.subtitle')}
            </p>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Button size="lg" className="group rounded-full" asChild>
                <Link href={`/${citySlug}/costs`}>
                  {t('landing.costTransparency.viewReports')}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              {hasContributed ? (
                <Button size="lg" variant="outline" className="rounded-full" asChild>
                  <Link href={`/${citySlug}/costs`}>
                    {t('landing.costTransparency.exploreCosts')}
                  </Link>
                </Button>
              ) : (
                <Button size="lg" variant="outline" className="rounded-full" asChild>
                  <Link href={`/${citySlug}/costs/submit`}>
                    {t('landing.costTransparency.submitCosts')}
                  </Link>
                </Button>
              )}
            </div>
          </motion.div>

          {/* Interactive Card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/80 p-6 backdrop-blur-xl sm:p-8">
              <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-accent/20 blur-[80px]" />

              {/* Header */}
              <div className="relative mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">ul. Pulawska 45</h3>
                  <p className="text-sm text-muted-foreground">Mokotow, Warsaw</p>
                </div>
                <div className="rounded-full bg-accent/20 px-3 py-1 text-sm text-accent">
                  12 {t('landing.costTransparency.reports')}
                </div>
              </div>

              {/* Cost Breakdown */}
              <div className="relative space-y-3">
                {costData.map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className={`flex items-center justify-between rounded-xl p-3 ${
                      item.visible ? "bg-secondary/50" : "bg-secondary/30"
                    }`}
                  >
                    <span className="text-sm">{item.label}</span>
                    {item.visible ? (
                      <span className="font-medium">{item.value}</span>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" />
                        <span className="select-none text-sm blur-sm">{item.value}</span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>

              {hasContributed ? (
                <div className="relative mt-6 rounded-xl border border-green-500/30 bg-green-500/5 p-4 text-center">
                  <div className="mb-1 flex items-center justify-center gap-1.5 text-sm font-medium text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    {t('landing.costTransparency.alreadyContributedDesc')}
                  </div>
                  <Link
                    href={`/${citySlug}/costs`}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    {t('landing.costTransparency.exploreCosts')}
                  </Link>
                </div>
              ) : (
                <div className="relative mt-6 rounded-xl border border-dashed border-accent/30 bg-accent/5 p-4 text-center">
                  <p className="mb-2 text-sm text-muted-foreground">
                    {t('landing.costTransparency.contributeUnlockDesc')}
                  </p>
                  <Link
                    href={`/${citySlug}/costs/submit`}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    {t('landing.costTransparency.submitCosts')}
                  </Link>
                </div>
              )}

              {/* Total */}
              <div className="relative mt-6 flex items-center justify-between border-t border-border/50 pt-4">
                <span className="text-muted-foreground">{t('common.totalMonthly')}</span>
                <span className="text-2xl font-bold text-accent">~4,199 PLN</span>
              </div>
            </div>

            {/* Floating elements */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
              className="absolute -right-4 -top-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 backdrop-blur-sm"
            >
              <span className="text-2xl font-bold text-accent">89%</span>
            </motion.div>
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 5, repeat: Infinity }}
              className="absolute -bottom-4 -left-4 rounded-full border border-border/50 bg-card px-4 py-2 text-sm backdrop-blur-sm"
            >
              {t('landing.costTransparency.accuracyScore')}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
