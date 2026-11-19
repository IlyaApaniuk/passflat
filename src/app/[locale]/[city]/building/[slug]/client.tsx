'use client';

import { useEffect, type ReactNode } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { motion } from 'framer-motion';
import { format, type Locale } from 'date-fns';
import { enUS, pl, ru, uk } from 'date-fns/locale';
import { Link } from '@/i18n/navigation';
import { Footer } from '@/components/landing/footer';
import { ShareButton } from '@/components/costs/share-button';
import { FollowBuildingButton } from '@/components/costs/follow-building-button';
import { LocationScore } from '@/components/listings/location-score';
import { DistrictPositionBar } from '@/components/costs/district-position-bar';
import { TenantTags, type TenantTagsSummary } from '@/components/buildings/tenant-tags';
import { TrackedLink } from '@/components/analytics/tracked-link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { monthsSince, TRUST_THRESHOLDS } from '@/lib/cost-stats';
import type { FigureGroup, FigureGroupKey, FigureSummary, MetricFigure } from '@/lib/cost-figures';
import type { PeriodicBreakdownRow, TenantDetails } from '@/lib/building-tenant-details';
import {
  breakdownHasFigures,
  breakdownNotes,
  breakdownRows,
  characteristicMessages,
  FIGURE_GROUP_N_KEY,
  FIGURE_GROUP_TITLE_KEY,
  groupDateMessages,
  groupFigureRows,
  isOneObservation,
  KNOWN_PART_HINT_KEY,
  ONE_OBSERVATION_KEY,
  orderedFigureGroups,
  sourceLineMessages,
  type BreakdownKey,
  type BreakdownRow,
  type BreakdownState,
  type FigureMessage,
  type GroupFigureRow,
} from '@/lib/building-figures-view';
import { useHasContributed } from '@/hooks/use-has-contributed';
import {
  buildingDetailViewedProperties,
  reportSourceCounts,
} from '@/lib/analytics/building-events';
import {
  ArrowLeft,
  Building2,
  MapPin,
  TrendingUp,
  TrendingDown,
  Lock,
  Zap,
  Flame,
  Wifi,
  Droplets,
  Home,
  Shield,
  Equal,
  CalendarClock,
  RefreshCw,
  Ruler,
  CheckCircle2,
  Info,
  FileText,
  BarChart3,
  MessageSquarePlus,
  type LucideIcon,
} from 'lucide-react';
import { relativeCostStyle } from '@/lib/cost-color';

const DATE_LOCALE_MAP: Record<string, Locale> = { en: enUS, pl, ru, uk };

// i18n key maps for the periodic-charge detail sub-list.
const PERIODIC_CAT_LABEL: Record<string, string> = {
  water: 'costs.building.water',
  electricity: 'costs.building.electricity',
  gas: 'costs.building.gas',
  heating: 'costs.building.heating',
  other: 'costs.building.otherCosts',
};
const FREQ_LABEL: Record<string, string> = {
  bimonthly: 'costs.building.freqBimonthly',
  quarterly: 'costs.building.freqQuarterly',
  semiannual: 'costs.building.freqSemiannual',
  annual: 'costs.building.freqAnnual',
};

// Label, icon and colours of each breakdown row.
const BREAKDOWN_ROW: Record<
  BreakdownKey,
  { label: string; icon: LucideIcon; color: string; bgColor: string }
> = {
  rent: {
    label: 'costs.building.rent',
    icon: Home,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  adminFee: {
    label: 'costs.building.adminFee',
    icon: Building2,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
  electricity: {
    label: 'costs.building.electricity',
    icon: Zap,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  gas: {
    label: 'costs.building.gas',
    icon: Flame,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  heating: {
    label: 'costs.building.heating',
    icon: Flame,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  water: {
    label: 'costs.building.water',
    icon: Droplets,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  internet: {
    label: 'costs.building.internet',
    icon: Wifi,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  other: {
    label: 'costs.building.otherCosts',
    icon: Home,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
};

// Icon of each figure in a group card's split row.
const GROUP_FIGURE_ICON: Record<GroupFigureRow['key'], { icon: LucideIcon; tint: string }> = {
  completeTotal: { icon: Home, tint: 'bg-primary/10 text-primary' },
  knownPartTotal: { icon: Info, tint: 'bg-muted text-muted-foreground' },
  rent: { icon: Home, tint: 'bg-primary/10 text-primary' },
  expenses: { icon: RefreshCw, tint: 'bg-muted text-muted-foreground' },
  completeTotalPerM2: { icon: Ruler, tint: 'bg-muted text-muted-foreground' },
};

/** One row of a group's breakdown, with the tenant group's kept items attached. */
interface CostItem {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  figure: MetricFigure;
  /** A value, a confirmed zero, "included in rent" or "unknown" (FR-26). */
  state: BreakdownState;
  /** The N under the row: its values, or the reports behind its state. */
  n: number;
  /** The other answers behind the row, e.g. "included in rent: 1". */
  notes: FigureMessage[];
  winter?: MetricFigure;
  summer?: MetricFigure;
  periodicBreakdown?: PeriodicBreakdownRow[] | null;
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.1, ease: 'easeOut' as const },
  }),
};

/**
 * Wraps a "deep" sub-section. When `show` is false the content renders blurred
 * behind a register/submit prompt on top — the contribution hook. The data is
 * still in the HTML (soft gate, keeps the page static); a hard paywall would
 * withhold it server-side instead.
 */
function GatedSection({
  show,
  submitHref,
  children,
}: {
  show: boolean;
  submitHref: string;
  children: ReactNode;
}) {
  const t = useTranslations();
  const posthog = usePostHog();
  if (show) return <>{children}</>;
  return (
    // The prompt is the in-flow layer — it defines the wrapper's height, so it is
    // never clipped even when the gated rows are short (the bug that prompted
    // this). The blurred teaser sits behind it as `absolute inset-0`. An earlier
    // pass used `grid` to stack the two, but stretching the `filter: blur()`
    // layer to the grid cell re-rasterized it during the card's fade-in and
    // shimmered on desktop; a plain absolute (static-size) blur layer doesn't.
    <div className="relative overflow-hidden rounded-xl">
      <div className="pointer-events-none absolute inset-0 select-none blur-[6px]" aria-hidden>
        {children}
      </div>
      {/* Plain opaque scrim — deliberately NO backdrop-blur here. A
          backdrop-filter forces the fixed header and this overlay to
          re-rasterize on scroll, which flickers on desktop (Chrome/Safari).
          The content underneath is already blurred (blur-[6px] above), so the
          scrim alone gives the same frosted look without the compositing cost. */}
      <div className="relative flex flex-col items-center justify-center gap-2 bg-background/75 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-6 w-6 text-primary" />
        </div>
        <p className="font-semibold">{t('costs.building.gateTitle')}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t('costs.building.gateDesc')}</p>
        <Button asChild className="mt-1">
          <Link
            href={submitHref}
            onClick={() => posthog?.capture('cost_submit_cta_clicked', { source: 'building_gate' })}
          >
            {t('costs.overview.submitMyCosts')}
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * The dashed "white spot" card this page uses wherever a section has nothing to
 * show. Shared so an invitation to contribute always looks the same, whatever it
 * asks for — the button is the caller's, because the asks differ (a cost report,
 * a description of the building) and so does what each one is worth tracking as.
 */
function PromptShell({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <p className="font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{desc}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/**
 * Empty-state contribution nudge for "thin" buildings. The blur teaser
 * (GatedSection) only fires when there IS hidden data to tease; on a building
 * with no per-utility breakdown — or too little data to compare against the
 * district — that left the strongest contribution moment (a near-empty
 * building) with no call to action at all. This fills those gaps. Shown to
 * everyone: it's a data-coverage prompt, not an access gate.
 */
function ContributePrompt({
  icon,
  title,
  desc,
  submitHref,
  source,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  submitHref: string;
  source: string;
}) {
  const t = useTranslations();
  const posthog = usePostHog();
  return (
    <PromptShell icon={icon} title={title} desc={desc}>
      <Button asChild>
        <Link
          href={submitHref}
          onClick={() => posthog?.capture('cost_submit_cta_clicked', { source })}
        >
          {t('costs.overview.submitMyCosts')}
        </Link>
      </Button>
    </PromptShell>
  );
}

/**
 * What tenants said about the building itself — the qualitative half of the
 * page, next to the numbers rather than on a page of its own: "warm in winter"
 * and "repairs ignored" transfer to the next tenant exactly the way the median
 * bill does.
 *
 * Renders even with nothing to show, which is the opposite of what TenantTags
 * does on the review page — there an empty shelf sits next to a picker that
 * fixes it, here the slot IS the ask. Describing a building is a minute of
 * checkboxes with no account, so it is the cheapest contribution this page can
 * request, and the reader with an opinion about this address is the likeliest
 * person on the site to have one.
 */
function TenantTagsCard({
  summary,
  reviewHref,
  buildingId,
  citySlug,
}: {
  summary: TenantTagsSummary | null;
  reviewHref: string;
  buildingId: string;
  citySlug: string;
}) {
  const t = useTranslations();
  const properties = { building_id: buildingId, city: citySlug };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('buildingTags.summary.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {summary ? (
          <>
            <TenantTags summary={summary} />
            <TrackedLink
              placement="building_tags_add"
              properties={properties}
              href={reviewHref}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <MessageSquarePlus className="h-4 w-4" />
              {t('costs.building.tagsAddCta')}
            </TrackedLink>
          </>
        ) : (
          <PromptShell
            icon={MessageSquarePlus}
            title={t('costs.building.emptyTagsTitle')}
            desc={t('costs.building.emptyTagsDesc')}
          >
            <Button asChild>
              <TrackedLink
                placement="building_tags_empty"
                properties={properties}
                href={reviewHref}
              >
                {t('costs.building.tagsCta')}
              </TrackedLink>
            </Button>
          </PromptShell>
        )}
      </CardContent>
    </Card>
  );
}

interface StatRange {
  median: number;
  p25: number;
  p75: number;
}

interface Baseline {
  median: number;
  p25: number;
  p75: number;
  count: number;
  rent: StatRange | null;
  expenses: StatRange | null;
  rentPerM2: StatRange | null;
  totalPerM2: StatRange | null;
  percentile: number | null;
}

interface BuildingCostsClientProps {
  building: {
    id: string;
    slug: string;
    address: string;
    district: string;
    districtSlug: string;
    city: string;
    /** Google Places id, when the building was ever resolved from one. */
    placeId: string | null;
  };
  /** The figure contract's summary of the building's visible reports (tenant and asking groups). */
  figures: FigureSummary;
  /** The items the page keeps computing, over the tenant group only; null without one. */
  tenantDetails: TenantDetails | null;
  lastUpdated: string | null;
  comparison: {
    thisBuilding: number | null;
    thisBuildingRent: number | null;
    thisBuildingRentPerM2: number | null;
    thisBuildingTotalPerM2: number | null;
    thisBuildingExpenses: number | null;
    district: Baseline | null;
    city: Baseline | null;
  };
  citySlug: string;
  /** Published tenant tags, or null when nothing clears the publishing rules. */
  tenantTags: TenantTagsSummary | null;
  initialLocationScore: {
    overall: number;
    categories: Array<{
      key: string;
      score: number;
      nearestM: number | null;
      name: string | null;
      nearby?: Array<{ name: string; lat: number; lng: number; distanceM: number }>;
    }>;
    /** The building's own coordinates — the map tab centres on them. */
    lat: number | null;
    lng: number | null;
  } | null;
}

export function BuildingCostsClient({
  building,
  figures,
  tenantDetails,
  lastUpdated,
  comparison,
  citySlug,
  tenantTags,
  initialLocationScore,
}: BuildingCostsClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const posthog = usePostHog();
  const reports = figures.reportCount;
  const groups = orderedFigureGroups(figures);

  // Data-confidence (trust) signals derived from existing data only. Thin
  // per-building data is the norm (long tail), so we don't flag "few reports" as
  // a warning — we anchor trust on the district and reward dense buildings with a
  // positive badge instead.
  const ageMonths = monthsSince(lastUpdated);
  const trust = {
    reliable: reports >= TRUST_THRESHOLDS.reliableMin,
    outdated: ageMonths !== null && ageMonths > TRUST_THRESHOLDS.staleMonths,
  };

  // Public (SEO + teaser): the summary (total, split, deposit/return/tenure),
  // rent + komunalka in the breakdown, and the location score. Gated behind a
  // contribution (soft blur overlay + CTA on top): the detailed per-utility
  // figures and the district position-bar graphs. Access is resolved on the
  // client (useHasContributed) so the page stays static/ISR — not a hard paywall.
  const showDetails = useHasContributed();
  const dateFmtLocale = DATE_LOCALE_MAP[locale] ?? enUS;
  // Dates are shown as month and year only (FR-28); standalone month names.
  const formatMonth = (month: Date) => format(month, 'LLLL yyyy', { locale: dateFmtLocale });
  const renderMessage = (message: FigureMessage) => t(message.key, message.values);

  useEffect(() => {
    posthog?.capture(
      'building_detail_viewed',
      buildingDetailViewedProperties(building, citySlug, reportSourceCounts(figures)),
    );
  }, [building.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // /review resolves an address through Places, so the place id skips that step
  // entirely — one tap from here to the checkboxes. Buildings that never came
  // from a Places result (the scraped import, mainly) have none, and then the
  // link still lands on /review with the address left to type.
  const reviewHref = building.placeId
    ? `/${citySlug}/review?p=${encodeURIComponent(building.placeId)}`
    : `/${citySlug}/review`;

  const tenantTagsCard = (
    <TenantTagsCard
      summary={tenantTags}
      reviewHref={reviewHref}
      buildingId={building.id}
      citySlug={citySlug}
    />
  );

  const groupTitle = (key: FigureGroupKey) => t(FIGURE_GROUP_TITLE_KEY[key]);
  // Every figure carries the N of its own values: reports or listings.
  const metricN = (key: FigureGroupKey, n: number) => t(FIGURE_GROUP_N_KEY[key], { count: n });
  // One observation is a value, never a median: no "≈" in front of it (FR-24).
  const tenantOne = figures.groups.tenant ? isOneObservation(figures.groups.tenant) : false;
  const approx = (one: boolean) => (one ? '' : '≈ ');
  const formatFigure = (row: GroupFigureRow) =>
    row.key === 'completeTotalPerM2'
      ? `${Math.round(row.figure.median!).toLocaleString()} ${t('costs.building.perM2')}`
      : `${row.figure.median!.toLocaleString()} PLN`;

  const renderDeltaBadge = (pct: number) => {
    if (pct === 0)
      return (
        <Badge className="gap-1 bg-muted text-muted-foreground">
          <Equal className="h-3 w-3" />
          {t('costs.building.matchesMedian')}
        </Badge>
      );
    if (pct < 0)
      return (
        <Badge className="gap-1" style={relativeCostStyle(pct)}>
          <TrendingDown className="h-3 w-3" />
          {t('costs.building.percentLower', { percent: Math.abs(pct) })}
        </Badge>
      );
    return (
      <Badge className="gap-1" style={relativeCostStyle(pct)}>
        <TrendingUp className="h-3 w-3" />
        {t('costs.building.percentHigher', { percent: pct })}
      </Badge>
    );
  };

  // A single median baseline card (district or city) with a p25–p75 range,
  // a directional delta badge and the sample size it is based on.
  const renderBaseline = (label: string, baseline: Baseline) => {
    const building = comparison.thisBuilding!;
    const pct = Math.round(((building - baseline.median) / baseline.median) * 100);
    return (
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          {renderDeltaBadge(pct)}
        </div>
        <p className="mt-2 text-xl font-semibold">≈ {baseline.median.toLocaleString()} PLN</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('costs.building.baselineSampleSize', { count: baseline.count })}
        </p>
      </div>
    );
  };

  // The breakdown, one section per group. Winter/summer and periodic charges are
  // the page's own items and exist for the tenant group only.
  const toCostItem = (row: BreakdownRow, details: TenantDetails | null): CostItem => {
    const style = BREAKDOWN_ROW[row.key];
    const seasons =
      details && row.key === 'electricity'
        ? { winter: details.electricityWinter, summer: details.electricitySummer }
        : details && row.key === 'heating'
          ? { winter: details.heatingWinter, summer: details.heatingSummer }
          : {};
    return {
      key: row.key,
      label: t(style.label),
      icon: style.icon,
      color: style.color,
      bgColor: style.bgColor,
      figure: row.figure,
      state: row.state,
      n: row.n,
      notes: breakdownNotes(row),
      ...seasons,
    };
  };

  const breakdownFor = (group: FigureGroup) => {
    const details = group.key === 'tenant' ? tenantDetails : null;
    const { basic, detail } = breakdownRows(group);
    const detailItems = detail.map((row) => toCostItem(row, details));
    // Only figures are worth a contribution gate; a section of unknowns is shown as it is.
    let detailHasFigures = breakdownHasFigures(detail);
    if (details && details.periodic.n > 0) {
      detailHasFigures = true;
      detailItems.push({
        key: 'periodic',
        label: t('costs.building.periodic'),
        icon: RefreshCw,
        color: 'text-violet-500',
        bgColor: 'bg-violet-500/10',
        figure: details.periodic,
        state: 'value',
        n: details.periodic.n,
        notes: [],
        periodicBreakdown: details.periodicBreakdown,
      });
    }
    return {
      group,
      one: isOneObservation(group),
      basic: basic.map((row) => toCostItem(row, details)),
      detail: detailItems,
      detailHasFigures,
    };
  };

  const breakdowns = groups.map(breakdownFor);

  const seasonText = (figure: MetricFigure) => `${figure.median} PLN (${figure.n})`;

  // A value, a confirmed zero, "included in rent" and "unknown" read differently (FR-26).
  const costValueText = (item: CostItem, one: boolean) => {
    if (item.state === 'zero') return '0 PLN';
    if (item.state === 'included') return t('costs.building.figures.valueIncluded');
    if (item.state === 'unknown') return t('costs.building.figures.valueUnknown');
    return `${approx(one)}${item.figure.median!.toLocaleString()} PLN`;
  };

  const renderCostRow = (groupKey: FigureGroupKey, one: boolean, item: CostItem, i: number) => (
    <motion.div
      key={`${groupKey}-${item.key}`}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3 + i * 0.05 }}
      className="border-b pb-3 last:border-0 last:pb-0"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${item.bgColor}`}>
            <item.icon className={`h-[18px] w-[18px] ${item.color}`} />
          </div>
          <span className="font-medium">{item.label}</span>
        </div>
        <div className="text-right">
          <p
            className={
              item.state === 'value' || item.state === 'zero'
                ? 'font-semibold'
                : 'text-sm font-medium text-muted-foreground'
            }
          >
            {costValueText(item, one)}
          </p>
          <p className="text-xs text-muted-foreground">{metricN(groupKey, item.n)}</p>
          {item.notes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {item.notes.map(renderMessage).join(' · ')}
            </p>
          )}
        </div>
      </div>
      {item.winter && item.summer && item.winter.n > 0 && item.summer.n > 0 && (
        <p className="mt-1 pl-[48px] text-xs text-muted-foreground">
          {t('costs.building.winterSummer', {
            winter: seasonText(item.winter),
            summer: seasonText(item.summer),
          })}
        </p>
      )}
      {item.periodicBreakdown && (
        <div className="mt-1 space-y-0.5 pl-[48px]">
          {item.periodicBreakdown.map((p) => (
            <p key={p.category} className="text-xs text-muted-foreground">
              {t(PERIODIC_CAT_LABEL[p.category] ?? 'costs.building.otherCosts')}
              {p.frequency ? ` — ${t(FREQ_LABEL[p.frequency] ?? '')}` : ''} ≈{' '}
              {p.amount.toLocaleString()} zł ({p.count})
            </p>
          ))}
        </div>
      )}
    </motion.div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 bg-muted/30 pt-24">
        <div className="container mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-6"
          >
            <Button variant="ghost" size="sm" className="gap-2" asChild>
              <Link href={`/${citySlug}/costs`}>
                <ArrowLeft className="h-4 w-4" />
                {t('costs.submit.backToCosts')}
              </Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-8"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                {/* City in the heading, not only in the line under it: these
                    pages are searched for as "<street> <city>", and the URL
                    carries the English slug (/warsaw/). */}
                <h1 className="text-2xl font-bold md:text-3xl">
                  {building.address}, {building.city}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    <span>
                      {building.districtSlug ? (
                        <Link
                          href={`/${citySlug}/${building.districtSlug}`}
                          className="transition-colors hover:text-primary"
                        >
                          {building.district}
                        </Link>
                      ) : (
                        building.district
                      )}
                      {', '}
                      <Link href={`/${citySlug}`} className="transition-colors hover:text-primary">
                        {building.city}
                      </Link>
                    </span>
                  </span>
                </div>
                {/* What exists and where it comes from — never behind the
                    contribution gate. */}
                {groups.length > 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {sourceLineMessages(figures)
                      .map((message) => t(message.key, message.values))
                      .join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ShareButton path={`/${citySlug}/building/${building.slug}`} source="building" />
                <FollowBuildingButton buildingId={building.id} citySlug={citySlug} />
                {reports > 0 && trust.reliable && (
                  <Badge className="w-fit gap-1 bg-green-500/10 text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    {t('costs.trust.reliable')}
                  </Badge>
                )}
                {reports > 0 && !trust.reliable && (
                  <Badge variant="secondary" className="w-fit gap-1 text-muted-foreground">
                    <Info className="h-3 w-3" />
                    {t('costs.trust.earlyData', { count: reports })}
                  </Badge>
                )}
                {trust.outdated && (
                  <Badge variant="secondary" className="w-fit gap-1 text-amber-600">
                    <CalendarClock className="h-3 w-3" />
                    {t('costs.trust.outdated')}
                  </Badge>
                )}
                {/* No day-precision "Updated" badge: each group card says when
                    its latest report was added or confirmed, as month and
                    year (FR-28), so asking prices never date tenant reports. */}
              </div>
            </div>
          </motion.div>

          {reports === 0 ? (
            <div className="space-y-8">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <Card>
                  <CardContent className="flex flex-col items-center py-16 text-center">
                    <Building2 className="mb-4 h-12 w-12 text-muted-foreground" />
                    <h3 className="text-lg font-semibold">
                      {t('costs.overview.noBuildingsFound')}
                    </h3>
                    <p className="mt-1 text-muted-foreground">
                      {t('costs.overview.noBuildingsDesc')}
                    </p>
                    <Button className="mt-6" asChild>
                      <Link href={`/${citySlug}/costs/submit?b=${building.id}&source=building`}>
                        {t('costs.overview.submitCostReport')}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Tags arrive without a cost report — /review and the checker
                  collect them on their own — so a building can hold what its
                  tenants said while having no numbers at all. Skipping this
                  branch would answer such a visitor with "no data" while their
                  neighbours' answers sat in the database. */}
              <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp}>
                {tenantTagsCard}
              </motion.div>
            </div>
          ) : (
            <div className="space-y-8">
              {!trust.reliable && (
                <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-semibold">{t('costs.building.whiteSpotTitle')}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('costs.building.whiteSpotDesc', { count: reports })}
                        </p>
                      </div>
                      <Button className="shrink-0" asChild>
                        <Link href={`/${citySlug}/costs/submit?b=${building.id}&source=building`}>
                          {t('costs.overview.submitCostReport')}
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
              {/* One card per group, tenant reports first, then asking prices:
                  each with its own figures and N, never one number over both. */}
              {groups.map((group) => {
                const { headline, rows, knownPart } = groupFigureRows(group);
                if (!headline) return null;
                const isTenant = group.key === 'tenant';
                // One observation: its values and characteristics, no median,
                // range or N per figure (the group is one report).
                const one = isOneObservation(group);
                const characteristics = characteristicMessages(group);
                const dates = groupDateMessages(group, formatMonth);
                return (
                  <motion.div
                    key={group.key}
                    custom={0}
                    initial="hidden"
                    animate="visible"
                    variants={fadeUp}
                  >
                    <Card className="overflow-hidden">
                      {isTenant && (
                        <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary" />
                      )}
                      <CardHeader>
                        <CardTitle>{groupTitle(group.key)}</CardTitle>
                        {one && (
                          <div className="space-y-1 pt-1 text-sm text-muted-foreground">
                            <p className="font-medium text-foreground">{t(ONE_OBSERVATION_KEY)}</p>
                            {characteristics.length > 0 && (
                              <p>{characteristics.map(renderMessage).join(' · ')}</p>
                            )}
                          </div>
                        )}
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">{t(headline.labelKey)}</p>
                        <motion.p
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.3, type: 'spring', bounce: 0.4 }}
                          className={`text-4xl font-bold ${isTenant ? 'text-primary' : ''}`}
                        >
                          {approx(one)}
                          {formatFigure(headline)}
                        </motion.p>
                        {!one && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {metricN(group.key, headline.figure.n)}
                          </p>
                        )}

                        {rows.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t pt-4">
                            {rows.map((row) => {
                              const { icon: Icon, tint } = GROUP_FIGURE_ICON[row.key];
                              return (
                                <div key={row.key} className="flex items-center gap-2">
                                  <div
                                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${tint}`}
                                  >
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">
                                      {t(row.labelKey)}
                                    </p>
                                    <p className="text-lg font-semibold">
                                      {approx(one)}
                                      {formatFigure(row)}
                                    </p>
                                    {!one && (
                                      <p className="text-xs text-muted-foreground">
                                        {metricN(group.key, row.figure.n)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* The known part is never the full monthly cost (FR-25). */}
                        {knownPart && (
                          <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {t(KNOWN_PART_HINT_KEY)}
                          </p>
                        )}

                        {isTenant && !one && (
                          <p className="mt-4 text-xs text-muted-foreground">
                            {t('costs.building.estimateCaption', { count: group.reportCount })}
                          </p>
                        )}

                        {dates.length > 0 && (
                          <div className="mt-4 space-y-1 border-t pt-4 text-xs text-muted-foreground">
                            {dates.map((message) => (
                              <p key={message.key} className="flex items-start gap-1.5">
                                <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                {renderMessage(message)}
                              </p>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}

              {tenantDetails && tenantDetails.deposit.n > 0 && (
                <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp}>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <Shield className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{t('costs.building.deposit')}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('costs.building.depositDesc')}
                            </p>
                          </div>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-lg font-semibold">
                            {approx(tenantOne)}
                            {tenantDetails.deposit.median!.toLocaleString()} PLN
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {metricN('tenant', tenantDetails.deposit.n)}
                          </p>
                          {tenantDetails.depositMonths != null && (
                            <p className="text-xs text-muted-foreground">
                              {t('costs.building.depositMonths', {
                                months: Math.round(tenantDetails.depositMonths * 2) / 2,
                              })}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Move-out signals as a clean vertical list: return · tenure · lease.
                          Tenant group only, each with its own N; the deposit
                          statistic only from MIN_DEPOSIT_ANSWERS answers. */}
                      {(tenantDetails.depositReturns ||
                        tenantDetails.tenure ||
                        tenantDetails.leaseType) && (
                        <div className="mt-4 space-y-2.5 border-t pt-4">
                          {tenantDetails.depositReturns && (
                            <div className="flex items-start gap-2.5">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <p className="text-sm">
                                {t('costs.building.figures.depositReturned', {
                                  gotBack: tenantDetails.depositReturns.gotBack,
                                  answered: tenantDetails.depositReturns.answered,
                                })}
                              </p>
                            </div>
                          )}
                          {tenantDetails.tenure && (
                            <div className="flex items-start gap-2.5">
                              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <p className="text-sm">
                                <span className="font-semibold">
                                  {approx(tenantOne)}
                                  {Math.round(tenantDetails.tenure.medianMonths)}{' '}
                                  {t('costs.building.monthsShort')}
                                </span>
                                <span className="text-muted-foreground">
                                  {' · '}
                                  {t('costs.building.tenureLabel')}
                                  {' · '}
                                  {metricN('tenant', tenantDetails.tenure.n)}
                                </span>
                              </p>
                            </div>
                          )}
                          {tenantDetails.leaseType && (
                            <div className="flex items-start gap-2.5">
                              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <p className="text-sm">
                                <span className="font-semibold">
                                  {t(
                                    tenantDetails.leaseType.dominant === 'okazjonalny'
                                      ? 'costs.building.leaseOccasionalShort'
                                      : 'costs.building.leaseStandardShort',
                                  )}
                                </span>
                                <span className="text-muted-foreground">
                                  {' · '}
                                  {t('costs.building.leaseTypeLabel')}
                                  {' · '}
                                  {t('costs.building.figures.countOfTotal', {
                                    count: tenantDetails.leaseType.count,
                                    total: tenantDetails.leaseType.answered,
                                  })}
                                </span>
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Placed right after the money — the deposit/tenure card already
                  reads as "what living here was like", and the location score
                  below it steps outside the front door. Above the gated
                  breakdown on purpose: this is the half of the page that needs
                  no contribution to read and is what makes the address worth
                  sending to someone. */}
              <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp}>
                {tenantTagsCard}
              </motion.div>

              <motion.div custom={3} initial="hidden" animate="visible" variants={fadeUp}>
                <LocationScore
                  buildingId={building.id}
                  citySlug={citySlug}
                  initialData={initialLocationScore}
                  surface="building"
                />
              </motion.div>

              <motion.div custom={4} initial="hidden" animate="visible" variants={fadeUp}>
                <Card>
                  <CardHeader>
                    <CardTitle>{t('costs.building.costBreakdown')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* One section per group, tenant reports first. Rent + the
                        admin fee stay public; the per-utility detail is gated. */}
                    {breakdowns.map(({ group, one, basic, detail, detailHasFigures }) =>
                      basic.length > 0 || detail.length > 0 ? (
                        <div key={group.key} className="space-y-3">
                          <p className="text-sm font-medium text-muted-foreground">
                            {groupTitle(group.key)}
                          </p>
                          {basic.length > 0 && (
                            <div className="space-y-3">
                              {basic.map((item, i) => renderCostRow(group.key, one, item, i))}
                            </div>
                          )}
                          {detail.length > 0 && (
                            <GatedSection
                              show={showDetails || !detailHasFigures}
                              submitHref={`/${citySlug}/costs/submit?b=${building.id}&source=building`}
                            >
                              <div className="space-y-3">
                                {detail.map((item, i) => renderCostRow(group.key, one, item, i))}
                              </div>
                            </GatedSection>
                          )}
                        </div>
                      ) : null,
                    )}
                    {breakdowns.every(({ detailHasFigures }) => !detailHasFigures) && (
                      <ContributePrompt
                        icon={FileText}
                        title={t('costs.building.emptyBreakdownTitle')}
                        desc={t('costs.building.emptyBreakdownDesc')}
                        submitHref={`/${citySlug}/costs/submit?b=${building.id}&source=building`}
                        source="building_breakdown_empty"
                      />
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {(comparison.district || comparison.city) && comparison.thisBuilding != null ? (
                <motion.div custom={5} initial="hidden" animate="visible" variants={fadeUp}>
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('costs.building.comparison')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-5 rounded-xl border border-primary/15 bg-primary/5 px-4 py-5 text-center">
                        <p className="text-sm text-muted-foreground">
                          {t('costs.building.thisBuilding')}
                        </p>
                        <p className="text-3xl font-bold text-primary">
                          ≈ {comparison.thisBuilding.toLocaleString()} PLN
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {comparison.district &&
                          renderBaseline(
                            t('costs.building.districtMedian', { district: building.district }),
                            comparison.district,
                          )}
                        {comparison.city &&
                          renderBaseline(t('costs.building.cityMedian'), comparison.city)}
                      </div>

                      {/* Where this building sits within the district's typical
                          range, per metric — leans on the denser district sample.
                          Hidden until the district has enough reports for the
                          percentile position to mean something. */}
                      {comparison.district &&
                      comparison.district.count >= TRUST_THRESHOLDS.reliableMin ? (
                        <GatedSection
                          show={showDetails}
                          submitHref={`/${citySlug}/costs/submit?b=${building.id}&source=building`}
                        >
                          {(() => {
                            const d = comparison.district!;
                            const unit = t('costs.building.perM2');
                            const bars = [
                              comparison.thisBuildingRent != null && d.rent
                                ? {
                                    key: 'rent',
                                    label: t('costs.building.rent'),
                                    value: comparison.thisBuildingRent,
                                    range: d.rent,
                                    unit: 'PLN',
                                  }
                                : null,
                              comparison.thisBuildingExpenses != null && d.expenses
                                ? {
                                    key: 'expenses',
                                    label: t('costs.building.expenses'),
                                    value: comparison.thisBuildingExpenses,
                                    range: d.expenses,
                                    unit: 'PLN',
                                  }
                                : null,
                              comparison.thisBuildingTotalPerM2 && d.totalPerM2
                                ? {
                                    key: 'total-m2',
                                    label: t('costs.building.totalPerM2Compare'),
                                    value: comparison.thisBuildingTotalPerM2,
                                    range: d.totalPerM2,
                                    unit,
                                  }
                                : null,
                              comparison.thisBuildingRentPerM2 && d.rentPerM2
                                ? {
                                    key: 'rent-m2',
                                    label: t('costs.building.rentPerM2Compare'),
                                    value: comparison.thisBuildingRentPerM2,
                                    range: d.rentPerM2,
                                    unit,
                                  }
                                : null,
                            ].filter(Boolean) as Array<{
                              key: string;
                              label: string;
                              value: number;
                              range: StatRange;
                              unit: string;
                            }>;
                            if (bars.length === 0) return null;
                            return (
                              <div className="mt-4 space-y-6 border-t pt-4">
                                {/* Legend */}
                                <div className="space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                                    <span className="flex items-center gap-1.5">
                                      <span className="h-2 w-4 rounded-sm bg-muted-foreground/20" />
                                      {t('costs.building.legendBand')}
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                      <span className="h-3 w-px bg-muted-foreground/60" />
                                      {t('costs.building.legendMedian')}
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                      <span className="h-2.5 w-2.5 rounded-full border-2 border-background bg-foreground" />
                                      {t('costs.building.legendBuilding')}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    {building.district} ·{' '}
                                    {t('costs.overview.nReports', {
                                      count: comparison.district!.count,
                                    })}
                                  </p>
                                </div>
                                {bars.map((bar) => (
                                  <DistrictPositionBar
                                    key={bar.key}
                                    label={bar.label}
                                    value={bar.value}
                                    median={bar.range.median}
                                    p25={bar.range.p25}
                                    p75={bar.range.p75}
                                    unit={bar.unit}
                                  />
                                ))}
                              </div>
                            );
                          })()}
                          {comparison.district?.percentile != null && (
                            <p className="mt-3 text-sm text-muted-foreground">
                              {comparison.district.percentile >= 50
                                ? t('costs.building.cheaperThanPct', {
                                    percent: comparison.district.percentile,
                                    district: building.district,
                                  })
                                : t('costs.building.pricierThanPct', {
                                    percent: 100 - comparison.district.percentile,
                                    district: building.district,
                                  })}
                            </p>
                          )}
                        </GatedSection>
                      ) : (
                        // District too thin for position bars (< reliableMin
                        // reports): nudge to fill the district + invite neighbors
                        // instead of silently hiding the comparison.
                        <div className="mt-4">
                          <ContributePrompt
                            icon={BarChart3}
                            title={t('costs.building.emptyDistrictTitle')}
                            desc={t('costs.building.emptyDistrictDesc')}
                            submitHref={`/${citySlug}/costs/submit?b=${building.id}&source=building`}
                            source="building_district_thin"
                          />
                        </div>
                      )}

                      <p className="mt-4 text-xs text-muted-foreground">
                        {t('costs.building.comparisonCaption')}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : (
                <motion.div custom={5} initial="hidden" animate="visible" variants={fadeUp}>
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('costs.building.comparison')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ContributePrompt
                        icon={BarChart3}
                        title={t('costs.building.emptyCompareTitle')}
                        desc={t('costs.building.emptyCompareDesc')}
                        submitHref={`/${citySlug}/costs/submit?b=${building.id}&source=building`}
                        source="building_comparison_empty"
                      />
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              <motion.div custom={6} initial="hidden" animate="visible" variants={fadeUp}>
                <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardContent className="flex flex-col items-center py-8 text-center">
                    <h3 className="text-lg font-semibold">
                      {t('costs.building.lookingForApartment')}
                    </h3>
                    <p className="mt-2 text-muted-foreground">
                      {t('costs.building.lookingForApartmentDesc')}
                    </p>
                    {building.districtSlug && (
                      <Button className="mt-4 transition-transform hover:scale-[1.02]" asChild>
                        <Link href={`/${citySlug}/replacement?district=${building.districtSlug}`}>
                          {t('costs.building.viewListingsIn', {
                            district: building.district,
                          })}
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
