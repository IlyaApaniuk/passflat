'use client';

import { motion } from 'framer-motion';
import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useReveal } from '@/hooks/use-reveal';
import { useHasContributed } from '@/hooks/use-has-contributed';
import { Button } from '@/components/ui/button';
import { BuyAccessDialog } from '@/components/costs/buy-access-dialog';
import { ArrowRight, Lock, Eye, CheckCircle2, ShieldCheck, ShoppingCart } from 'lucide-react';

const DEFAULT_CITY = 'warsaw';

interface CostTransparencyProps {
  citySlug?: string;
  hasContributed?: boolean;
  buildingData?: {
    address: string;
    district: string;
    reportsCount: number;
    avgRent: number;
    avgAdminFee: number;
    avgElectricity: number;
    avgInternet: number;
    avgGasHeating: number;
    totalMonthly: number;
  };
}

export function CostTransparency({
  citySlug = DEFAULT_CITY,
  hasContributed: hasContributedInitial = false,
  buildingData,
}: CostTransparencyProps) {
  const t = useTranslations();
  const format = useFormatter();
  const reveal = useReveal();
  // Resolved on the client so the landing page can render statically. Defaults
  // to `false` (blurred values + "contribute" CTA) until/unless the user is
  // confirmed to have access — never reveals gated UI optimistically.
  const hasContributed = useHasContributed(hasContributedInitial);

  const costData = [
    {
      label: t('common.rent'),
      value: `${format.number(buildingData?.avgRent ?? 3200)} PLN`,
      visible: true,
    },
    {
      label: t('common.adminFee'),
      value: `${format.number(buildingData?.avgAdminFee ?? 450)} PLN`,
      visible: true,
    },
    {
      label: t('landing.costTransparency.electricity'),
      value: `${format.number(buildingData?.avgElectricity ?? 280)} PLN`,
      visible: hasContributed,
    },
    {
      label: t('landing.costTransparency.internet'),
      value: `${format.number(buildingData?.avgInternet ?? 89)} PLN`,
      visible: hasContributed,
    },
    {
      label: t('landing.costTransparency.gasHeating'),
      value: `${format.number(buildingData?.avgGasHeating ?? 180)} PLN`,
      visible: hasContributed,
    },
  ];

  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/5 to-transparent" />

      <div className="relative z-10 container mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Content */}
          <motion.div {...reveal({ opacity: 0, x: -20 })}>
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
          <motion.div {...reveal({ opacity: 0, x: 20 })} className="relative">
            <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/80 p-6 backdrop-blur-xl sm:p-8">
              <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-accent/20 blur-[80px]" />

              {/* Header */}
              <div className="relative mb-6">
                <h3 className="text-lg font-semibold">
                  {buildingData?.address ?? 'ul. Puławska 45'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {buildingData?.district ?? 'Mokotów'}, Warsaw
                </p>
              </div>

              {/* Cost Breakdown */}
              <div className="relative space-y-3">
                {costData.map((item, i) => (
                  <motion.div
                    key={item.label}
                    {...reveal({ opacity: 0, y: 10 }, { delay: i * 0.1 })}
                    className={`flex items-center justify-between rounded-xl p-3 ${
                      item.visible ? 'bg-secondary/50' : 'bg-secondary/30'
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
                <div className="relative mt-6 rounded-xl border border-accent/30 bg-accent/5 p-4 text-center">
                  <div className="mb-1 flex items-center justify-center gap-1.5 text-sm font-medium text-accent">
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
                  <div className="flex flex-col items-center gap-2">
                    <Link
                      href={`/${citySlug}/costs/submit`}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      {t('landing.costTransparency.submitCosts')}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {t('landing.costTransparency.orBuyAccess')}{' '}
                      <BuyAccessDialog citySlug={citySlug}>
                        <button className="inline font-medium text-accent hover:underline">
                          <ShoppingCart className="mr-0.5 inline h-3 w-3" />
                          {t('costs.overview.buyAccessBtn')}
                        </button>
                      </BuyAccessDialog>
                    </span>
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="relative mt-6 flex items-center justify-between border-t border-border/50 pt-4">
                <span className="text-muted-foreground">{t('common.totalMonthly')}</span>
                <span className="text-2xl font-bold text-accent">
                  ~{format.number(buildingData?.totalMonthly ?? 4199)} PLN
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 rounded-full border border-border/50 bg-card/80 px-4 py-2 text-sm backdrop-blur-sm">
              <ShieldCheck className="h-4 w-4 text-accent" />
              <span className="text-muted-foreground">
                {t('landing.costTransparency.anonymousVerified')}
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
