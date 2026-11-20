'use client';

import { useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/ui/reveal';
import { useIsTouch } from '@/hooks/use-reveal';
import type { SingleNumberFigure } from '@/lib/cost-figures';
import type { DepositClaim } from '@/lib/deposit-claim';
import { singleNumberGroupLabel } from '@/lib/single-number-view';
import { BarChart3, MapPinned, Sparkles } from 'lucide-react';

const DEFAULT_CITY = 'warsaw';
const MIN_STAT_THRESHOLD = 5;

interface HeroProps {
  stats?: {
    buildingsWithCosts: number;
    /** The city's single number (D23): the per m² and expenses tiles come from its group. */
    cityFigure: Pick<SingleNumberFigure, 'group' | 'completeTotalPerM2' | 'expenses'> | null;
    deposit: DepositClaim | null;
  };
}

interface HeroStat {
  value: string;
  label: string;
  /** The group and N of the value ("Tenant reports (57)"), for cost figures. */
  source?: string;
}

export function Hero({ stats: liveStats }: HeroProps) {
  const t = useTranslations('landing.hero');
  const tRoot = useTranslations();
  const posthog = usePostHog();
  const isTouch = useIsTouch();

  // Top-of-funnel instrumentation: which hero CTA gets clicked. (The hero headline
  // A/B is parked — the `hero-variant-b` flag stays declared but dormant until
  // there's enough traffic to reach significance; wire variant rendering back in
  // then. The current headline is the loss-aversion framing.)
  const onCtaClick = (cta: 'view_costs' | 'check_address') =>
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
  // top of rent) are values, not counts, so they show whenever present. Both come
  // from the city's single-number group (tenant reports, else asking prices) and
  // say which, with the N of that value; they exist only for all-in totals.
  const cityFigure = liveStats?.cityFigure ?? null;
  const sourceOf = (n: number) => {
    if (!cityFigure) return undefined;
    const label = singleNumberGroupLabel({ group: cityFigure.group, n });
    return tRoot(label.key, label.values);
  };

  const perM2 = cityFigure?.completeTotalPerM2 ?? null;
  const priceStat: HeroStat | null =
    perM2 && perM2.value > 0
      ? {
          value: `≈${Math.round(perM2.value)} ${t('statsPriceUnit')}`,
          label: t('statsPricePerM2'),
          source: sourceOf(perM2.n),
        }
      : null;

  const expenses = cityFigure?.expenses ?? null;
  const expensesStat: HeroStat | null =
    expenses && expenses.value > 0
      ? {
          value: `≈${Math.round(expenses.value)} ${t('statsExpensesUnit')}`,
          label: t('statsExpenses'),
          source: sourceOf(expenses.n),
        }
      : null;

  // Deposit (upfront cash) + "X of N who answered got it back, fully or
  // partly", in one block — the last piece of the "full cost of moving in"
  // picture. `depositClaim` withholds it below MIN_DEPOSIT_ANSWERS answers.
  const deposit = liveStats?.deposit ?? null;
  const depositStat = deposit
    ? {
        value: `≈${deposit.medianDeposit} zł`,
        label: t('statsDeposit', { gotBack: deposit.gotBack, answered: deposit.answered }),
      }
    : null;

  // Per-m² value, coverage, then the two hidden costs (monthly extras + deposit).
  const stats: HeroStat[] = [priceStat, buildingsStat, expensesStat, depositStat].flatMap((s) =>
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

          {/* Two actions, two intents: browse the data or probe one address.
              Everything else the hero used to ask for (reviews, the listing
              types) lives in the nav and its own sections — one screen,
              one verb. */}
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            {/* Primary CTA — the cost data itself. Deliberately NOT a submit
                link: dropping a cold visitor onto a blank form made them
                bounce. The landing sells the data, /costs shows it, and the
                ask to contribute lives there (access card up top + the sticky
                pill), where the visitor can see what they'd be adding to. */}
            <Button size="lg" className="group h-12 rounded-full px-8 text-base" asChild>
              <Link href={`/${DEFAULT_CITY}/costs`} onClick={() => onCtaClick('view_costs')}>
                <BarChart3 className="mr-2 h-4 w-4" />
                {t('costsCta')}
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

          {stats.length > 0 && (
            <Reveal
              // mt-10 on mobile so the first row of real medians peeks above
              // the fold — a visitor arriving from a post about hidden costs
              // came for numbers, and mt-20 put them entirely off-screen.
              className={`mx-auto mt-10 grid gap-4 sm:mt-20 sm:gap-8 ${stats.length === 1 ? 'grid-cols-1 max-w-xs' : stats.length === 2 ? 'grid-cols-2 max-w-lg' : stats.length === 4 ? 'grid-cols-2 lg:grid-cols-4 max-w-6xl' : 'grid-cols-2 md:grid-cols-3 max-w-3xl'}`}
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
                  {stat.source && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground/80 sm:text-xs">
                      {stat.source}
                    </div>
                  )}
                </Reveal>
              ))}
            </Reveal>
          )}

          {/* The roommate entry (PRD 4 FR-6): one chip after the medians. The
              frozen listing types (D5) are no longer promoted here. */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <Link
              href={`/${DEFAULT_CITY}/roommate`}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-500/20 dark:text-violet-400"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              {tRoot('listings.roommateRoles.findFlatmate')}
            </Link>
          </div>
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
