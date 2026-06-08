'use client';

import { useEffect, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { motion } from 'framer-motion';
import { format, type Locale } from 'date-fns';
import { enUS, pl, ru, uk } from 'date-fns/locale';
import { Link } from '@/i18n/navigation';
import { Footer } from '@/components/landing/footer';
import { BuyAccessDialog } from '@/components/costs/buy-access-dialog';
import { LocationScore } from '@/components/listings/location-score';
import { DistrictPositionBar } from '@/components/costs/district-position-bar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { type CostStats, monthsSince, TRUST_THRESHOLDS } from '@/lib/cost-stats';
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
  ShoppingCart,
  CalendarClock,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';

const DATE_LOCALE_MAP: Record<string, Locale> = { en: enUS, pl, ru, uk };

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.1, ease: 'easeOut' as const },
  }),
};

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

interface IncludedCounts {
  electricity: number;
  heating: number;
  water: number;
  total: number;
}

interface BuildingCostsClientProps {
  building: {
    id: string;
    slug: string;
    address: string;
    district: string;
    districtSlug: string;
    city: string;
  };
  reports: number;
  lastUpdated: string | null;
  costs: {
    rent: CostStats | null;
    adminFee: CostStats | null;
    electricity: CostStats | null;
    electricityWinter: CostStats | null;
    electricitySummer: CostStats | null;
    gas: CostStats | null;
    heating: CostStats | null;
    heatingWinter: CostStats | null;
    heatingSummer: CostStats | null;
    water: CostStats | null;
    internet: CostStats | null;
    otherCosts: CostStats | null;
    periodic: CostStats | null;
    totalMonthlyAvg: CostStats | null;
    deposit: CostStats | null;
    expenses: CostStats | null;
  } | null;
  includedCounts: IncludedCounts | null;
  depositReturn: {
    sampleSize: number;
    returnedRate: number;
    medianDays: number | null;
  } | null;
  tenure: {
    sampleSize: number;
    medianMonths: number | null;
  } | null;
  comparison: {
    thisBuilding: number | null;
    thisBuildingRentPerM2: number | null;
    thisBuildingTotalPerM2: number | null;
    thisBuildingExpenses: number | null;
    district: Baseline | null;
    city: Baseline | null;
  };
  hasContributedData: boolean;
  costAccessUntil: string | null;
  citySlug: string;
  initialLocationScore: {
    overall: number;
    categories: Array<{
      key: string;
      score: number;
      nearestM: number | null;
      name: string | null;
    }>;
  } | null;
}

export function BuildingCostsClient({
  building,
  reports,
  lastUpdated,
  costs,
  includedCounts,
  depositReturn,
  tenure,
  comparison,
  hasContributedData,
  costAccessUntil,
  citySlug,
  initialLocationScore,
}: BuildingCostsClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const posthog = usePostHog();

  // Data-confidence (trust) signals derived from existing data only. Thin
  // per-building data is the norm (long tail), so we don't flag "few reports" as
  // a warning — we anchor trust on the district and reward dense buildings with a
  // positive badge instead.
  const ageMonths = monthsSince(lastUpdated);
  const trust = {
    reliable: reports >= TRUST_THRESHOLDS.reliableMin,
    outdated: ageMonths !== null && ageMonths > TRUST_THRESHOLDS.staleMonths,
  };

  const accessGranted = useMemo(
    () => hasContributedData || (!!costAccessUntil && new Date(costAccessUntil) > new Date()),
    [hasContributedData, costAccessUntil],
  );
  const paidActive =
    !hasContributedData && !!costAccessUntil && new Date(costAccessUntil) > new Date();
  const paidExpired =
    !hasContributedData && !!costAccessUntil && new Date(costAccessUntil) <= new Date();
  const dateFmtLocale = DATE_LOCALE_MAP[locale] ?? enUS;

  useEffect(() => {
    posthog?.capture('building_detail_viewed', {
      building_id: building.id,
      building_slug: building.slug,
      city: citySlug,
    });
  }, [building.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOftenIncluded = (count: number) =>
    includedCounts && includedCounts.total > 0 && count / includedCounts.total >= 0.5;

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
        <Badge className="gap-1 bg-green-500/10 text-green-600">
          <TrendingDown className="h-3 w-3" />
          {t('costs.building.percentLower', { percent: Math.abs(pct) })}
        </Badge>
      );
    return (
      <Badge className="gap-1 bg-red-500/10 text-red-500">
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

  const costItems = costs
    ? [
        {
          label: t('costs.building.rent'),
          icon: Home,
          color: 'text-primary',
          bgColor: 'bg-primary/10',
          data: costs.rent,
        },
        {
          label: t('costs.building.adminFee'),
          icon: Building2,
          color: 'text-muted-foreground',
          bgColor: 'bg-muted',
          data: costs.adminFee,
        },
        {
          label: t('costs.building.electricity'),
          icon: Zap,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          data: costs.electricity,
          winter: costs.electricityWinter,
          summer: costs.electricitySummer,
          oftenIncluded: isOftenIncluded(includedCounts?.electricity ?? 0),
        },
        {
          label: t('costs.building.gas'),
          icon: Flame,
          color: 'text-orange-500',
          bgColor: 'bg-orange-500/10',
          data: costs.gas,
        },
        {
          label: t('costs.building.heating'),
          icon: Flame,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          data: costs.heating,
          winter: costs.heatingWinter,
          summer: costs.heatingSummer,
          oftenIncluded: isOftenIncluded(includedCounts?.heating ?? 0),
        },
        {
          label: t('costs.building.water'),
          icon: Droplets,
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10',
          data: costs.water,
          oftenIncluded: isOftenIncluded(includedCounts?.water ?? 0),
        },
        {
          label: t('costs.building.internet'),
          icon: Wifi,
          color: 'text-primary',
          bgColor: 'bg-primary/10',
          data: costs.internet,
        },
        ...(costs.otherCosts
          ? [
              {
                label: t('costs.building.otherCosts'),
                icon: Home,
                color: 'text-muted-foreground',
                bgColor: 'bg-muted',
                data: costs.otherCosts,
              },
            ]
          : []),
        ...(costs.periodic
          ? [
              {
                label: t('costs.building.periodic'),
                icon: RefreshCw,
                color: 'text-violet-500',
                bgColor: 'bg-violet-500/10',
                data: costs.periodic,
              },
            ]
          : []),
      ]
    : [];

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
                <h1 className="text-2xl font-bold md:text-3xl">{building.address}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {building.district}, {building.city}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {reports > 0 && trust.reliable && (
                  <Badge className="w-fit gap-1 bg-green-500/10 text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    {t('costs.trust.reliable')}
                  </Badge>
                )}
                {trust.outdated && (
                  <Badge variant="secondary" className="w-fit gap-1 text-amber-600">
                    <CalendarClock className="h-3 w-3" />
                    {t('costs.trust.outdated')}
                  </Badge>
                )}
                {lastUpdated && (
                  <Badge variant="secondary" className="w-fit">
                    {t('costs.building.updated', {
                      date: format(new Date(lastUpdated), 'd MMMM', {
                        locale: dateFmtLocale,
                      }),
                    })}
                  </Badge>
                )}
              </div>
            </div>
          </motion.div>

          {reports === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <Card>
                <CardContent className="flex flex-col items-center py-16 text-center">
                  <Building2 className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">{t('costs.overview.noBuildingsFound')}</h3>
                  <p className="mt-1 text-muted-foreground">
                    {t('costs.overview.noBuildingsDesc')}
                  </p>
                  <Button className="mt-6" asChild>
                    <Link href={`/${citySlug}/costs/submit`}>
                      {t('costs.overview.submitCostReport')}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ) : !accessGranted ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="relative overflow-hidden">
                <CardContent className="p-8">
                  <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
                    {costItems.slice(0, 6).map((item) => (
                      <div key={item.label} className="rounded-lg bg-muted/50 p-4">
                        <div className="flex items-center gap-2">
                          <item.icon className={`h-4 w-4 ${item.color}`} />
                          <span className="text-sm text-muted-foreground">{item.label}</span>
                        </div>
                        <div className="mt-2 h-6 w-24 animate-pulse rounded bg-muted" />
                      </div>
                    ))}
                  </div>

                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3, type: 'spring' }}
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
                    >
                      <Lock className="h-8 w-8 text-primary" />
                    </motion.div>
                    {paidExpired ? (
                      <>
                        <h3 className="mt-4 text-xl font-semibold">
                          {t('costs.access.expiredOn', {
                            date: format(new Date(costAccessUntil!), 'PP', {
                              locale: dateFmtLocale,
                            }),
                          })}
                        </h3>
                        <p className="mt-2 max-w-sm text-center text-muted-foreground">
                          {t('costs.access.expiredCta')}
                        </p>
                      </>
                    ) : (
                      <>
                        <h3 className="mt-4 text-xl font-semibold">
                          {t('costs.building.unlockTitle')}
                        </h3>
                        <p className="mt-2 max-w-sm text-center text-muted-foreground">
                          {t('costs.building.unlockDesc')}
                        </p>
                      </>
                    )}
                    <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row">
                      <Button asChild>
                        <Link href={`/${citySlug}/costs/submit`}>
                          {t('costs.overview.submitMyCosts')}
                        </Link>
                      </Button>
                      <BuyAccessDialog citySlug={citySlug}>
                        <Button variant="outline" className="gap-2">
                          <ShoppingCart className="h-4 w-4" />
                          {t('costs.overview.buyAccessBtn')}
                        </Button>
                      </BuyAccessDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <div className="space-y-8">
              {paidActive && (
                <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
                  <Card className="border-accent/50 bg-accent/5">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <CalendarClock className="h-5 w-5 text-accent" />
                        <p className="font-medium">
                          {t('costs.access.activeUntil', {
                            date: format(new Date(costAccessUntil!), 'PP', {
                              locale: dateFmtLocale,
                            }),
                          })}
                        </p>
                      </div>
                      <BuyAccessDialog citySlug={citySlug}>
                        <Button size="sm" variant="outline" className="gap-2">
                          <RefreshCw className="h-3.5 w-3.5" />
                          {t('costs.access.renew')}
                        </Button>
                      </BuyAccessDialog>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {costs?.totalMonthlyAvg && (
                <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
                  <Card className="overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary" />
                    <CardHeader>
                      <CardTitle>{t('costs.building.medianMonthlyTotal')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <motion.p
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3, type: 'spring', bounce: 0.4 }}
                        className="text-4xl font-bold text-primary"
                      >
                        ≈ {costs.totalMonthlyAvg.median.toLocaleString()} PLN
                      </motion.p>

                      {/* Rent vs Expenses split — what makes up the total. */}
                      {(costs.rent || costs.expenses) && (
                        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t pt-4">
                          {costs.rent && (
                            <div className="flex items-center gap-2">
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                                <Home className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  {t('costs.building.rent')}
                                </p>
                                <p className="text-lg font-semibold">
                                  ≈ {costs.rent.median.toLocaleString()} PLN
                                </p>
                              </div>
                            </div>
                          )}
                          {costs.expenses && (
                            <div className="flex items-center gap-2">
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  {t('costs.building.expenses')}
                                </p>
                                <p className="text-lg font-semibold">
                                  ≈ {costs.expenses.median.toLocaleString()} PLN
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <p className="mt-4 text-xs text-muted-foreground">
                        {comparison.district
                          ? t('costs.building.estimateCaptionDistrict', {
                              count: reports,
                              districtCount: comparison.district.count,
                              district: building.district,
                            })
                          : t('costs.building.estimateCaption', { count: reports })}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              <motion.div custom={0.5} initial="hidden" animate="visible" variants={fadeUp}>
                <LocationScore buildingId={building.id} initialData={initialLocationScore} />
              </motion.div>

              <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp}>
                <Card>
                  <CardHeader>
                    <CardTitle>{t('costs.building.costBreakdown')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {costItems
                        .filter((item) => item.data !== null)
                        .map((item, i) => (
                          <motion.div
                            key={item.label}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + i * 0.05 }}
                            className="border-b pb-4 last:border-0 last:pb-0"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.bgColor}`}
                                >
                                  <item.icon className={`h-5 w-5 ${item.color}`} />
                                </div>
                                <div>
                                  <span className="font-medium">{item.label}</span>
                                  {'oftenIncluded' in item && item.oftenIncluded && (
                                    <Badge
                                      variant="secondary"
                                      className="ml-2 text-[10px] px-1.5 py-0"
                                    >
                                      {t('costs.building.oftenIncluded')}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold">≈ {item.data!.median} PLN</p>
                              </div>
                            </div>
                            {'winter' in item && item.winter && item.summer && (
                              <p className="mt-1 pl-[52px] text-xs text-muted-foreground">
                                {t('costs.building.winterSummer', {
                                  winter: `${item.winter.median} PLN`,
                                  summer: `${item.summer.median} PLN`,
                                })}
                              </p>
                            )}
                          </motion.div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {costs?.deposit && (
                <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp}>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
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
                        <div className="text-right">
                          <p className="text-lg font-semibold">
                            ≈ {costs.deposit.median.toLocaleString()} PLN
                          </p>
                        </div>
                      </div>

                      {/* Trust signals from move-out data: deposit-return rate + tenure. */}
                      {(depositReturn || tenure?.medianMonths != null) && (
                        <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
                          {depositReturn && (
                            <div className="flex items-start gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold">
                                  {t('costs.building.depositReturnedRate', {
                                    percent: depositReturn.returnedRate,
                                  })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {depositReturn.medianDays != null
                                    ? t('costs.building.depositReturnedDays', {
                                        days: depositReturn.medianDays,
                                      })
                                    : t('costs.building.basedOnReports', {
                                        count: depositReturn.sampleSize,
                                      })}
                                </p>
                              </div>
                            </div>
                          )}
                          {tenure?.medianMonths != null && (
                            <div className="flex items-start gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                <CalendarClock className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold">
                                  ≈ {Math.round(tenure.medianMonths)}{' '}
                                  {t('costs.building.monthsShort')}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {t('costs.building.tenureLabel')}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {(comparison.district || comparison.city) && comparison.thisBuilding && (
                <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp}>
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
                          range, per metric — leans on the denser district sample. */}
                      {comparison.district &&
                        (() => {
                          const d = comparison.district!;
                          const unit = t('costs.building.perM2');
                          const bars = [
                            costs?.rent && d.rent
                              ? {
                                  key: 'rent',
                                  label: t('costs.building.rent'),
                                  value: costs.rent.median,
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
                              {bars.map((bar) => (
                                <DistrictPositionBar
                                  key={bar.key}
                                  label={bar.label}
                                  value={bar.value}
                                  median={bar.range.median}
                                  p25={bar.range.p25}
                                  p75={bar.range.p75}
                                  unit={bar.unit}
                                  district={building.district}
                                  sampleSize={comparison.district!.count}
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

                      <p className="mt-4 text-xs text-muted-foreground">
                        {t('costs.building.comparisonCaption')}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              <motion.div custom={3} initial="hidden" animate="visible" variants={fadeUp}>
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
