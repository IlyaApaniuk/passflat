'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { TrackedLink } from '@/components/analytics/tracked-link';
import { useHasContributed } from '@/hooks/use-has-contributed';
import { Reveal } from '@/components/ui/reveal';
import { Button } from '@/components/ui/button';
import { Lock, CheckCircle2 } from 'lucide-react';
import type { FeaturedBuilding } from '@/lib/home-figures';
import { singleNumberHeadingKey, singleNumberLabelText } from '@/lib/single-number-view';

/** The featured building (`loadFeaturedBuilding`): one group's single number and breakdown. */
export type CostBuildingData = FeaturedBuilding;

const DEFAULT_CITY = 'warsaw';

/**
 * Personalized secondary CTA. Isolated as a tiny client island so the rest of
 * the cost-transparency section can stay a Server Component — only the
 * per-user "contributed" state needs the client.
 */
export function SubmitCostsButton({
  citySlug = DEFAULT_CITY,
  hasContributedInitial = false,
}: {
  citySlug?: string;
  hasContributedInitial?: boolean;
}) {
  const t = useTranslations();
  const hasContributed = useHasContributed(hasContributedInitial);

  return (
    <Button size="lg" variant="outline" className="rounded-full" asChild>
      <TrackedLink placement="landing_cost_card_submit" href={`/${citySlug}/costs/submit`}>
        {hasContributed
          ? t('landing.costTransparency.addMoreCosts')
          : t('landing.costTransparency.submitCosts')}
      </TrackedLink>
    </Button>
  );
}

export function CostTransparencyCard({
  citySlug = DEFAULT_CITY,
  buildingData,
  hasContributedInitial = false,
}: {
  citySlug?: string;
  buildingData?: CostBuildingData;
  hasContributedInitial?: boolean;
}) {
  const t = useTranslations();
  const format = useFormatter();
  // Resolved on the client so the landing page can render statically. Defaults
  // to `false` (blurred values + "contribute" CTA) until/unless the user is
  // confirmed to have access — never reveals gated UI optimistically.
  const hasContributed = useHasContributed(hasContributedInitial);

  // With a featured building every line is that building's chosen group (D23) and
  // an unknown line shows "—"; the sample numbers appear only without any building.
  const figure = buildingData?.figure ?? null;
  const line = (value: number | null | undefined, sample: number) =>
    buildingData
      ? value == null
        ? '—'
        : `${format.number(value)} PLN`
      : `${format.number(sample)} PLN`;

  const costData = [
    {
      label: t('common.rent'),
      value: line(figure?.rent?.value, 3200),
      visible: true,
    },
    {
      label: t('common.adminFee'),
      value: line(buildingData?.adminFee, 450),
      visible: true,
    },
    {
      label: t('landing.costTransparency.electricity'),
      value: line(buildingData?.electricity, 280),
      visible: hasContributed,
    },
    {
      label: t('landing.costTransparency.internet'),
      value: line(buildingData?.internet, 89),
      visible: hasContributed,
    },
    {
      label: t('landing.costTransparency.gasHeating'),
      value: line(buildingData?.gasHeating, 180),
      visible: hasContributed,
    },
  ];

  return (
    <Reveal variant="right" className="relative">
      <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card p-6 sm:p-8">
        <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-accent/20 blur-[80px]" />

        {/* Header */}
        <div className="relative mb-6">
          <h3 className="text-lg font-semibold">{buildingData?.address ?? 'ul. Puławska 45'}</h3>
          <p className="text-sm text-muted-foreground">
            {buildingData?.district ?? 'Mokotów'}, Warsaw
          </p>
        </div>

        {/* Cost Breakdown */}
        <div className="relative space-y-3">
          {costData.map((item, i) => (
            <Reveal
              key={item.label}
              delay={i * 0.1}
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
            </Reveal>
          ))}
        </div>

        {hasContributed ? (
          <div className="relative mt-6 rounded-xl border border-accent/30 bg-accent/5 p-4 text-center">
            <div className="mb-1 flex items-center justify-center gap-1.5 text-sm font-medium text-accent">
              <CheckCircle2 className="h-4 w-4" />
              {t('landing.costTransparency.alreadyContributedDesc')}
            </div>
            <TrackedLink
              placement="landing_cost_card_all"
              href={`/${citySlug}/costs`}
              className="text-sm font-medium text-accent hover:underline"
            >
              {t('landing.costTransparency.exploreCosts')}
            </TrackedLink>
          </div>
        ) : (
          <div className="relative mt-6 rounded-xl border border-dashed border-accent/30 bg-accent/5 p-4 text-center">
            <p className="mb-2 text-sm text-muted-foreground">
              {t('landing.costTransparency.contributeUnlockDesc')}
            </p>
            <div className="flex flex-col items-center gap-2">
              <TrackedLink
                placement="landing_cost_card_submit_secondary"
                href={`/${citySlug}/costs/submit`}
                className="text-sm font-medium text-accent hover:underline"
              >
                {t('landing.costTransparency.submitCosts')}
              </TrackedLink>
            </div>
          </div>
        )}

        {/* Total */}
        <div className="relative mt-6 flex items-center justify-between gap-3 border-t border-border/50 pt-4">
          <div className="min-w-0">
            <span className="text-muted-foreground">
              {figure ? t(singleNumberHeadingKey(figure)) : t('common.totalMonthly')}
            </span>
            {figure && (
              <p className="text-xs text-muted-foreground">{singleNumberLabelText(t, figure)}</p>
            )}
          </div>
          <span className="shrink-0 text-2xl font-bold text-accent">
            ~{format.number(figure?.value ?? 4199)} PLN
          </span>
        </div>
      </div>
    </Reveal>
  );
}
