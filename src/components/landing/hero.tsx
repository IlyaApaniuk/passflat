'use client';

import { useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/ui/reveal';
import { useIsTouch } from '@/hooks/use-reveal';
import { MapPinned, Receipt, Sparkles } from 'lucide-react';

const DEFAULT_CITY = 'warsaw';
const MIN_STAT_THRESHOLD = 5;

interface HeroProps {
  stats?: {
    buildingsWithCosts: number;
    pricePerM2: number | null;
    expensesMonthly: number | null;
    depositMedian: number | null;
    depositReturnedPct: number | null;
  };
}

export function Hero({ stats: liveStats }: HeroProps) {
  const t = useTranslations('landing.hero');
  const posthog = usePostHog();
  const isTouch = useIsTouch();

  // Top-of-funnel instrumentation: which hero CTA gets clicked. (The hero headline
  // A/B is parked — the `hero-variant-b` flag stays declared but dormant until
  // there's enough traffic to reach significance; wire variant rendering back in
  // then. The current headline is the loss-aversion framing.)
  const onCtaClick = (cta: 'submit_costs' | 'check_address') =>
    posthog?.capture('hero_cta_clicked', { cta });

  const formatStat = (n: number) => (n > 100 ? `${n.toLocaleString()}+` : n.toString());

  // Buildings coverage — floor to tens so the "N+" suffix stays truthful, and
  // pluralise the label to agree with the (floored) count.
  const buildingsCount = liveStats?.buildingsWithCosts ?? 0;
  const buildingsRounded = Math.floor(buildingsCount / 10) * 10;
  const buildingsStat =
    buildingsCount >= MIN_STAT_THRESHOLD
      ? {
          value: formatStat(buildingsRounded),
          label: t('statsBuildings', { count: buildingsRounded }),
        }
      : null;

  // Per-m² median (the product wedge) and the monthly "Расходы" (komunalka on
  // top of rent) are values, not counts, so they show whenever present.
  const pricePerM2 = liveStats?.pricePerM2 ?? null;
  const priceStat =
    pricePerM2 && pricePerM2 > 0
      ? { value: `≈${pricePerM2} ${t('statsPriceUnit')}`, label: t('statsPricePerM2') }
      : null;

  const expensesMonthly = liveStats?.expensesMonthly ?? null;
  const expensesStat =
    expensesMonthly && expensesMonthly > 0
      ? { value: `≈${expensesMonthly} ${t('statsExpensesUnit')}`, label: t('statsExpenses') }
      : null;

  // Deposit (upfront cash) + the share who got it back, in one block — the last
  // piece of the "full cost of moving in" picture.
  const depositMedian = liveStats?.depositMedian ?? null;
  const depositReturnedPct = liveStats?.depositReturnedPct ?? null;
  const depositStat =
    depositMedian && depositMedian > 0 && depositReturnedPct != null
      ? { value: `≈${depositMedian} zł`, label: t('statsDeposit', { pct: depositReturnedPct }) }
      : null;

  // Per-m² value, coverage, then the two hidden costs (monthly extras + deposit).
  const stats = [priceStat, buildingsStat, expensesStat, depositStat].flatMap((s) =>
    s ? [s] : [],
  );

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-24">
      <div className="absolute inset-0 grid-pattern opacity-50" />

      <div
        className={`absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-accent/20 blur-[120px] ${
          isTouch ? '' : 'animate-pulse'
        }`}
      />
      <div
        className={`absolute -right-32 bottom-1/4 h-96 w-96 rounded-full bg-accent/10 blur-[120px] ${
          isTouch ? '' : 'animate-pulse'
        }`}
        style={{ animationDelay: '1s' }}
      />

      <div className="relative z-10 container mx-auto px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm text-accent">
            <Sparkles className="h-4 w-4" />
            <span>{t('badge')}</span>
          </div>

          <h1 className="mb-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-7xl lg:text-8xl">
            <span className="block whitespace-pre-line">{t('title')}</span>
            {/* pb keeps descenders (y, g) from being clipped: -webkit-background-clip:text
                paints the gradient only inside the box, so the box must extend below the
                baseline for the tight leading-[1.05] line. */}
            <span className="gradient-text block pb-[0.18em]">{t('titleHighlight')}</span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            {t('subtitle')}
          </p>

          {/* Two of the three transparency actions. Reviews (pillar 2) take the
              third slot once built; the calculator and document templates moved
              to their own section so the hero states actions, not the toolbox. */}
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            {/* Primary CTA — the contribution that powers the whole dataset. */}
            <Button size="lg" className="group h-12 rounded-full px-8 text-base" asChild>
              <Link
                href={`/${DEFAULT_CITY}/costs/submit`}
                onClick={() => onCtaClick('submit_costs')}
              >
                <Receipt className="mr-2 h-4 w-4" />
                {t('submitCostsCta')}
              </Link>
            </Button>
            {/* Secondary CTA — the free probe: instant value before any ask. */}
            <Button
              size="lg"
              variant="outline"
              className="group h-12 rounded-full px-8 text-base"
              asChild
            >
              <Link href={`/${DEFAULT_CITY}/check`} onClick={() => onCtaClick('check_address')}>
                <MapPinned className="mr-2 h-4 w-4" />
                {t('checkAddressCta')}
              </Link>
            </Button>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">{t('trustLine')}</p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
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
          </div>

          {stats.length > 0 && (
            <Reveal
              className={`mx-auto mt-20 grid gap-4 sm:gap-8 ${stats.length === 1 ? 'grid-cols-1 max-w-xs' : stats.length === 2 ? 'grid-cols-2 max-w-lg' : stats.length === 4 ? 'grid-cols-2 lg:grid-cols-4 max-w-6xl' : 'grid-cols-2 md:grid-cols-3 max-w-3xl'}`}
            >
              {stats.map((stat, i) => (
                <Reveal
                  key={stat.label}
                  variant="scale"
                  delay={i * 0.1}
                  className="rounded-2xl border border-border/50 bg-card/50 p-4 text-center backdrop-blur-sm"
                >
                  <div className="text-2xl font-bold text-accent sm:whitespace-nowrap sm:text-3xl">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{stat.label}</div>
                </Reveal>
              ))}
            </Reveal>
          )}
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <div
          className={`flex h-10 w-6 items-start justify-center rounded-full border-2 border-muted-foreground/30 p-2 ${
            isTouch ? '' : 'animate-scroll-hint'
          }`}
        >
          <div className="h-2 w-1 rounded-full bg-muted-foreground/50" />
        </div>
      </div>
    </section>
  );
}
