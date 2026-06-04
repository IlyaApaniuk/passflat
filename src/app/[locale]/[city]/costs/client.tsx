'use client';

import { use, useCallback, useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { format, type Locale } from 'date-fns';
import { enUS, pl, ru, uk } from 'date-fns/locale';
import { Link, useRouter } from '@/i18n/navigation';
import { Footer } from '@/components/landing/footer';
import { BuyAccessDialog } from '@/components/costs/buy-access-dialog';
import { MapSkeleton } from '@/components/map/map-skeleton';
import { PRICES_PLN } from '@/lib/pricing';
import { median, TRUST_THRESHOLDS } from '@/lib/cost-stats';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  Search,
  Lock,
  TrendingUp,
  MapPin,
  Users,
  ArrowRight,
  List,
  Map,
  Home,
  DoorOpen,
  ChevronDown,
  AlertTriangle,
  Pencil,
  Mail,
  ShoppingCart,
  CalendarClock,
  RefreshCw,
  Clock,
  Ruler,
} from 'lucide-react';

const DATE_LOCALE_MAP: Record<string, Locale> = { en: enUS, pl, ru, uk };

const CostsMap = lazy(() =>
  import('@/components/map/CostsMap').then((m) => ({ default: m.CostsMap })),
);

interface BuildingData {
  id: string;
  slug: string;
  address: string;
  district: string;
  districtSlug: string;
  reports: number;
  medianTotal: number;
  medianRent: number;
  medianAdminFee: number;
  medianRentPerM2: number | null;
  medianAdminFeePerM2: number | null;
  lat: number | null;
  lng: number | null;
  rentalType: string | null;
}

interface DistrictData {
  slug: string;
  name: string;
  count: number;
}

interface DistrictStatsData {
  slug: string;
  name: string;
  buildingCount: number;
  reportCount: number;
  medianTotal: number;
  medianRent: number;
  medianAdminFee: number;
  medianRentPerM2: number;
}

interface CityBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface CostAccess {
  hasContributedData: boolean;
  costAccessUntil: string | null;
  isFlagged: boolean;
}

interface CostsOverviewClientProps {
  buildings: BuildingData[];
  districts: DistrictData[];
  districtStats: DistrictStatsData[];
  /** Auth-derived access state, streamed in via Suspense (see page.tsx). */
  accessPromise: Promise<CostAccess>;
  citySlug: string;
  cityBounds?: CityBounds;
  initialSearch: string;
  initialDistrict: string | null;
}

/**
 * Tri-state access status. `pending` is the initial state before the streamed
 * auth promise resolves — used to render neutral skeletons instead of
 * defaulting to the `locked` (Buy/Submit) UI, which would flash for users who
 * already have access.
 */
type AccessStatus = 'pending' | 'locked' | 'unlocked';

/**
 * Unwraps the streamed access promise inside a Suspense boundary and lifts the
 * result into the parent's state, so the (cached) cost table renders
 * immediately while auth resolves in the background. The access-dependent CTA
 * region shows a skeleton until this resolves (see AccessStatus).
 */
function AccessResolver({
  promise,
  onResolve,
}: {
  promise: Promise<CostAccess>;
  onResolve: (access: CostAccess) => void;
}) {
  const resolved = use(promise);
  useEffect(() => {
    onResolve(resolved);
  }, [resolved, onResolve]);
  return null;
}

/**
 * Neutral placeholder for the hero gate while access is pending. Mirrors the
 * gate's footprint (lead line + two bordered cards) so swapping to the real
 * locked CTA produces no layout shift.
 */
function HeroGateSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-4 w-3/4" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col rounded-xl border-2 border-border p-4">
            <Skeleton className="mb-3 h-10 w-10 rounded-lg" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Neutral placeholder for the sidebar access card while access is pending.
 * Mirrors the unlock card's footprint (icon + title, description, two buttons).
 */
function SidebarAccessSkeleton() {
  return (
    <Card className="mt-4" aria-hidden="true">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="mt-2 h-4 w-full" />
        <div className="mt-3 flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

function stripDiacritics(str: string) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l')
    .replace(/\u0141/g, 'L');
}

const PAGE_SIZE = 20;

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: (i % PAGE_SIZE) * 0.08, ease: 'easeOut' as const },
  }),
};

export function CostsOverviewClient({
  buildings,
  districts,
  districtStats,
  accessPromise,
  citySlug,
  cityBounds,
  initialSearch,
  initialDistrict,
}: CostsOverviewClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const posthog = usePostHog();
  const router = useRouter();
  const searchParams = useSearchParams();

  // `null` = pending (auth not yet resolved). We deliberately do NOT default to
  // a locked CostAccess, so the access-dependent CTA region can render a neutral
  // skeleton instead of flashing Buy/Submit CTAs at users who already have access.
  const [access, setAccess] = useState<CostAccess | null>(null);
  const accessResolved = access !== null;
  const { hasContributedData, costAccessUntil, isFlagged } = access ?? {
    hasContributedData: false,
    costAccessUntil: null,
    isFlagged: false,
  };
  const handleAccessResolved = useCallback((next: CostAccess) => setAccess(next), []);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [rentalTypeFilter, setRentalTypeFilter] = useState<'all' | 'apartment' | 'room'>('all');
  const [expandedDistrict, setExpandedDistrict] = useState<string | null>(initialDistrict);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [districtSort, setDistrictSort] = useState<'default' | 'total' | 'perM2' | 'reports'>(
    'default',
  );

  const accessGranted = useMemo(
    () => hasContributedData || (!!costAccessUntil && new Date(costAccessUntil) > new Date()),
    [hasContributedData, costAccessUntil],
  );
  // Tri-state derived from the resolved promise: `pending` until auth resolves,
  // then `unlocked`/`locked`. Drives skeleton-vs-CTA rendering in the access region.
  const accessStatus: AccessStatus = !accessResolved
    ? 'pending'
    : accessGranted
      ? 'unlocked'
      : 'locked';
  const accessPending = accessStatus === 'pending';
  const paidActive =
    !hasContributedData && !!costAccessUntil && new Date(costAccessUntil) > new Date();
  const paidExpired =
    !hasContributedData && !!costAccessUntil && new Date(costAccessUntil) <= new Date();
  const dateFmtLocale = DATE_LOCALE_MAP[locale] ?? enUS;

  useEffect(() => {
    const param = searchParams.get('cost_access');
    if (param === 'success') {
      toast.success(t('costs.buyAccess.successToast'));
    } else if (param === 'cancel') {
      toast.error(t('costs.buyAccess.cancelToast'));
    }
    if (param) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire once, only after auth resolves to a genuinely locked state — not while
  // pending (which would mis-attribute every already-unlocked user as prompted).
  const promptedRef = useRef(false);
  useEffect(() => {
    if (accessStatus === 'locked' && !promptedRef.current) {
      promptedRef.current = true;
      posthog?.capture('cost_unlock_prompted', { city: citySlug });
    }
  }, [accessStatus, posthog, citySlug]);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(initialDistrict);

  const searchAndTypeFiltered = buildings.filter((building) => {
    const q = stripDiacritics(searchQuery.toLowerCase());
    const matchesSearch =
      q === '' ||
      stripDiacritics(building.address.toLowerCase()).includes(q) ||
      stripDiacritics(building.district.toLowerCase()).includes(q);
    const matchesRentalType =
      rentalTypeFilter === 'all' || building.rentalType === rentalTypeFilter;
    return matchesSearch && matchesRentalType;
  });

  const filteredBuildings = searchAndTypeFiltered.filter(
    (building) => selectedDistrict === null || building.districtSlug === selectedDistrict,
  );

  const computedDistrictStats = districtStats.map((ds) => {
    if (rentalTypeFilter === 'all') return ds;
    const dBuildings = searchAndTypeFiltered.filter((b) => b.districtSlug === ds.slug);
    if (dBuildings.length === 0)
      return {
        ...ds,
        buildingCount: 0,
        reportCount: 0,
        medianTotal: 0,
        medianRent: 0,
        medianAdminFee: 0,
        medianRentPerM2: 0,
      };
    const medianOf = (vals: number[]) => median(vals.filter((v) => v > 0)) ?? 0;
    return {
      ...ds,
      buildingCount: dBuildings.length,
      reportCount: dBuildings.reduce((s, b) => s + b.reports, 0),
      medianTotal: medianOf(dBuildings.map((b) => b.medianTotal)),
      medianRent: medianOf(dBuildings.map((b) => b.medianRent)),
      medianAdminFee: medianOf(dBuildings.map((b) => b.medianAdminFee)),
      medianRentPerM2: medianOf(dBuildings.map((b) => b.medianRentPerM2 ?? 0)),
    };
  });

  // District list ordering. "default" preserves the server ordering; the other
  // options sort by a district stat. Cost metrics sort ascending (cheapest
  // first) with empty values pushed to the end; report count sorts descending.
  const visibleDistricts = useMemo(() => {
    const list = districts.filter((d) => d.count > 0);
    if (districtSort === 'default') return list;
    const statOf = (slug: string) => computedDistrictStats.find((s) => s.slug === slug);
    return [...list].sort((a, b) => {
      const sa = statOf(a.slug);
      const sb = statOf(b.slug);
      if (districtSort === 'reports') {
        return (sb?.reportCount ?? 0) - (sa?.reportCount ?? 0);
      }
      const key = districtSort === 'total' ? 'medianTotal' : 'medianRentPerM2';
      return ((sa?.[key] || Infinity) as number) - ((sb?.[key] || Infinity) as number);
    });
  }, [districts, districtSort, computedDistrictStats]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, selectedDistrict, rentalTypeFilter]);

  const handleDistrictSelect = (slug: string | null) => {
    setSelectedDistrict(slug);
    const params = new URLSearchParams();
    if (slug) params.set('district', slug);
    if (searchQuery) params.set('q', searchQuery);
    const qs = params.toString();
    window.history.replaceState(null, '', `/${citySlug}/costs${qs ? `?${qs}` : ''}`);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Suspense fallback={null}>
        <AccessResolver promise={accessPromise} onResolve={handleAccessResolved} />
      </Suspense>
      <main className="flex-1 pt-24">
        <section className="relative overflow-hidden border-b bg-muted/30 py-12 md:py-16">
          <div className="absolute inset-0 grid-pattern opacity-30" />
          <div className="container relative mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mx-auto max-w-2xl text-center"
            >
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-sm font-medium">
                <TrendingUp className="h-4 w-4" />
                {t('costs.overview.badge')}
              </div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                {t('costs.overview.title')}
              </h1>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="mt-8 space-y-4"
              >
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder={t('costs.overview.searchPlaceholder')}
                      className="pl-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  {hasContributedData && (
                    <Button variant="outline" asChild>
                      <Link href={{ pathname: '/dashboard', query: { tab: 'costs' } }}>
                        <List className="mr-2 h-4 w-4" />
                        {t('costs.overview.myReports')}
                      </Link>
                    </Button>
                  )}
                </div>

                {accessPending && <HeroGateSkeleton />}

                {accessStatus === 'locked' && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">{t('costs.overview.gateLead')}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Link
                        href={`/${citySlug}/costs/submit`}
                        className="group relative flex flex-col rounded-xl border-2 border-primary/40 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
                      >
                        <span className="absolute -top-2.5 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          {t('costs.overview.gateRecommended')}
                        </span>
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Pencil className="h-5 w-5 text-primary" />
                        </div>
                        <p className="font-semibold">{t('costs.overview.gateFreeTitle')}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('costs.overview.gateFreeBenefit')}
                        </p>
                        <p className="mt-auto pt-2 text-xs text-muted-foreground">
                          {t('costs.overview.gateFreeNote')}
                        </p>
                      </Link>

                      <BuyAccessDialog citySlug={citySlug}>
                        <button className="group flex flex-col rounded-xl border-2 border-border p-4 text-left transition-colors hover:border-primary/30 hover:bg-muted/50">
                          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <p className="font-semibold">{t('costs.overview.gatePaidTitle')}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t('costs.overview.gatePaidBenefit', {
                              price: PRICES_PLN.COST_ACCESS_7,
                            })}
                          </p>
                          <p className="mt-auto pt-2 text-xs text-muted-foreground">
                            {t('costs.overview.gatePaidNote')}
                          </p>
                        </button>
                      </BuyAccessDialog>
                    </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          </div>
        </section>

        <div className="container mx-auto px-4 py-8">
          <div className="grid gap-8 lg:grid-cols-4">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="lg:col-span-1"
            >
              <Card>
                <CardHeader className="gap-3">
                  <CardTitle className="text-lg">{t('costs.overview.districts')}</CardTitle>
                  <label className="text-sm text-muted-foreground">
                    {t('costs.overview.sortLabel')}
                  </label>
                  <Select
                    value={districtSort}
                    onValueChange={(v) =>
                      setDistrictSort(v as 'default' | 'total' | 'perM2' | 'reports')
                    }
                  >
                    <SelectTrigger size="sm" className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">{t('costs.overview.sortDefault')}</SelectItem>
                      <SelectItem value="total">{t('costs.overview.sortTotal')}</SelectItem>
                      <SelectItem value="perM2">{t('costs.overview.sortPerM2')}</SelectItem>
                      <SelectItem value="reports">{t('costs.overview.sortReports')}</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    <button
                      onClick={() => handleDistrictSelect(null)}
                      className={`flex w-full items-center justify-between px-6 py-3 text-left text-sm transition-colors hover:bg-muted/50 ${
                        selectedDistrict === null ? 'bg-primary/5 font-medium text-primary' : ''
                      }`}
                    >
                      <span>{t('costs.overview.allDistricts')}</span>
                      <span className="text-muted-foreground">{searchAndTypeFiltered.length}</span>
                    </button>
                    {visibleDistricts.map((district) => {
                      const isActive = selectedDistrict === district.slug;
                      const isExpanded = expandedDistrict === district.slug;
                      const stats = computedDistrictStats.find((s) => s.slug === district.slug);
                      const hasStats = stats && stats.buildingCount > 0;
                      const lowData =
                        !!stats &&
                        stats.reportCount > 0 &&
                        stats.reportCount <= TRUST_THRESHOLDS.lowDataMax;
                      return (
                        <div key={district.slug}>
                          <div
                            className={`flex w-full items-center justify-between px-6 py-3 text-sm transition-colors ${
                              isActive ? 'bg-primary/5 font-medium text-primary' : ''
                            }`}
                          >
                            <button
                              onClick={() => {
                                handleDistrictSelect(isActive ? null : district.slug);
                                if (!isActive) setExpandedDistrict(district.slug);
                              }}
                              className="min-w-0 flex-1 text-left hover:text-primary transition-colors"
                            >
                              <span className="block truncate">{district.name}</span>
                              {stats && stats.reportCount > 0 && (
                                <span
                                  className={`mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] font-normal text-muted-foreground ${
                                    lowData ? 'opacity-60' : ''
                                  }`}
                                >
                                  <span>
                                    {t('costs.overview.nReports', { count: stats.reportCount })}
                                  </span>
                                  {accessGranted && stats.medianRentPerM2 > 0 && (
                                    <span className="inline-flex items-center gap-0.5">
                                      <span>·</span>
                                      <Ruler className="h-3 w-3" />≈{' '}
                                      {stats.medianRentPerM2.toLocaleString()}{' '}
                                      {t('costs.overview.perM2')}
                                    </span>
                                  )}
                                </span>
                              )}
                            </button>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">
                                {
                                  searchAndTypeFiltered.filter(
                                    (b) => b.districtSlug === district.slug,
                                  ).length
                                }
                              </span>
                              {hasStats && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedDistrict(isExpanded ? null : district.slug);
                                  }}
                                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                >
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  />
                                </button>
                              )}
                            </div>
                          </div>
                          {isExpanded && hasStats && (
                            <div className="border-t bg-muted/30 px-6 py-3">
                              {accessPending ? (
                                <div className="space-y-2" aria-hidden="true">
                                  <div className="flex min-w-0 gap-2">
                                    <Skeleton className="h-8 flex-1" />
                                    <Skeleton className="h-8 flex-1" />
                                    <Skeleton className="h-8 flex-1" />
                                  </div>
                                </div>
                              ) : accessGranted ? (
                                <div className="space-y-2">
                                  <div className="flex min-w-0 gap-2 text-center">
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-[10px] text-muted-foreground">
                                        {t('costs.overview.districtMedianRent')}
                                      </p>
                                      <p className="text-sm font-bold">
                                        ≈ {stats.medianRent.toLocaleString()}
                                      </p>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-[10px] text-muted-foreground">
                                        {t('costs.overview.districtMedianCzynsz')}
                                      </p>
                                      <p className="text-sm font-bold">
                                        ≈ {stats.medianAdminFee.toLocaleString()}
                                      </p>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-[10px] text-muted-foreground">
                                        {t('costs.overview.districtMedianTotal')}
                                      </p>
                                      <p className="text-sm font-bold text-primary">
                                        ≈ {stats.medianTotal.toLocaleString()}
                                      </p>
                                    </div>
                                  </div>
                                  {stats.medianRentPerM2 > 0 && (
                                    <div className="flex items-center justify-center gap-1.5 border-t pt-2 text-[10px] text-muted-foreground">
                                      <Ruler className="h-3 w-3" />
                                      <span>{t('costs.overview.districtMedianPerM2')}</span>
                                      <span className="font-semibold text-foreground">
                                        ≈ {stats.medianRentPerM2.toLocaleString()}{' '}
                                        {t('costs.overview.perM2')}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Lock className="h-3.5 w-3.5" />
                                  {t('costs.overview.submitToUnlock')}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="border-t px-6 py-3 text-[11px] leading-snug text-muted-foreground">
                    {t('costs.overview.estimateLegend')}
                  </p>
                </CardContent>
              </Card>

              {accessPending && <SidebarAccessSkeleton />}

              {!accessPending && isFlagged && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Card className="mt-4 border-destructive/50 bg-destructive/5">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        <p className="font-medium">{t('costs.overview.flaggedTitle')}</p>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t('costs.overview.flaggedDesc')}
                      </p>
                      <div className="mt-3 flex flex-col gap-2">
                        <Button size="sm" asChild>
                          <Link href={{ pathname: '/dashboard', query: { tab: 'costs' } }}>
                            <List className="mr-2 h-3.5 w-3.5" />
                            {t('costs.overview.myReports')}
                          </Link>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={'/contact?subject=costs' as '/'}>
                            <Mail className="mr-2 h-3.5 w-3.5" />
                            {t('costs.submit.contactUs')}
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {!accessPending && paidActive && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Card className="mt-4 border-accent/50 bg-accent/5">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
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
                        <Button size="sm" variant="outline" className="mt-3 w-full gap-2">
                          <RefreshCw className="h-3.5 w-3.5" />
                          {t('costs.access.renew')}
                        </Button>
                      </BuyAccessDialog>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {accessStatus === 'locked' && !isFlagged && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Card className="mt-4 border-primary/50 bg-primary/5">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Lock className="h-5 w-5 text-primary" />
                        {paidExpired ? (
                          <p className="font-medium">
                            {t('costs.access.expiredOn', {
                              date: format(new Date(costAccessUntil!), 'PP', {
                                locale: dateFmtLocale,
                              }),
                            })}
                          </p>
                        ) : (
                          <p className="font-medium">{t('costs.overview.unlockFullData')}</p>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {paidExpired
                          ? t('costs.access.expiredCta')
                          : t('costs.overview.unlockDesc')}
                      </p>
                      <div className="mt-3 flex flex-col gap-2">
                        <Button size="sm" asChild>
                          <Link href={`/${citySlug}/costs/submit`}>
                            {t('costs.overview.submitMyCosts')}
                          </Link>
                        </Button>
                        <BuyAccessDialog citySlug={citySlug}>
                          <Button size="sm" variant="outline" className="w-full gap-2">
                            <ShoppingCart className="h-3.5 w-3.5" />
                            {t('costs.overview.buyAccessBtn')}
                          </Button>
                        </BuyAccessDialog>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </motion.div>

            <div className="lg:col-span-3">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="mb-6 flex flex-wrap items-center gap-3"
              >
                <p className="text-sm text-muted-foreground sm:mr-auto">
                  <span className="font-medium text-foreground">{filteredBuildings.length}</span>{' '}
                  {t('costs.overview.buildingsWithReports')}
                </p>
                <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
                  {(['all', 'apartment', 'room'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setRentalTypeFilter(type)}
                      className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                        rentalTypeFilter === type
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {type === 'apartment' && <Home className="h-3.5 w-3.5" />}
                      {type === 'room' && <DoorOpen className="h-3.5 w-3.5" />}
                      {type === 'all'
                        ? t('costs.overview.filterAll')
                        : type === 'apartment'
                          ? t('costs.overview.filterApartment')
                          : t('costs.overview.filterRoom')}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                      viewMode === 'list'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <List className="h-4 w-4" />
                    {t('costs.overview.listView')}
                  </button>
                  <button
                    onClick={() => setViewMode('map')}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                      viewMode === 'map'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Map className="h-4 w-4" />
                    {t('costs.overview.mapView')}
                  </button>
                </div>
              </motion.div>

              {viewMode === 'map' && (
                <Suspense
                  fallback={
                    <div className="h-[500px] md:h-[600px]">
                      <MapSkeleton />
                    </div>
                  }
                >
                  <div className="h-[500px] md:h-[600px]">
                    <CostsMap
                      buildings={filteredBuildings
                        .filter((b) => b.lat != null && b.lng != null)
                        .map((b) => ({
                          id: b.id,
                          slug: b.slug,
                          lat: b.lat!,
                          lng: b.lng!,
                          address: b.address,
                          district: b.district,
                          reports: b.reports,
                          avgTotal: b.medianTotal,
                          hasContributed: accessGranted,
                        }))}
                      citySlug={citySlug}
                      bounds={cityBounds}
                    />
                  </div>
                </Suspense>
              )}

              {viewMode === 'list' && (
                <>
                  <div className="space-y-4">
                    {filteredBuildings.slice(0, visibleCount).map((building, i) => (
                      <motion.div
                        key={building.id}
                        custom={i}
                        initial="hidden"
                        animate="visible"
                        variants={fadeUp}
                      >
                        <Link href={`/${citySlug}/building/${building.slug}`}>
                          <Card className="group transition-all duration-200 hover:shadow-md hover:border-primary/30">
                            <CardContent className="p-4">
                              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-4">
                                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                                    <Building2 className="h-6 w-6 text-primary" />
                                  </div>
                                  <div>
                                    <h3 className="font-semibold group-hover:text-primary transition-colors">
                                      {building.address}
                                    </h3>
                                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        <MapPin className="h-3.5 w-3.5" />
                                        {building.district}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <Users className="h-3.5 w-3.5" />
                                        {building.reports} {t('costs.overview.reports')}
                                      </span>
                                      {building.rentalType && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                                          {building.rentalType === 'apartment' ? (
                                            <Home className="h-3 w-3" />
                                          ) : (
                                            <DoorOpen className="h-3 w-3" />
                                          )}
                                          {building.rentalType === 'apartment'
                                            ? t('costs.overview.filterApartment')
                                            : t('costs.overview.filterRoom')}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-6 sm:justify-end">
                                  {accessPending ? (
                                    <div className="text-left sm:text-right" aria-hidden="true">
                                      <Skeleton className="h-3 w-24 sm:ml-auto" />
                                      <Skeleton className="mt-1.5 h-6 w-28 sm:ml-auto" />
                                    </div>
                                  ) : accessGranted ? (
                                    <div className="text-left sm:text-right">
                                      <p className="text-xs text-muted-foreground">
                                        {t('costs.overview.medianMonthlyTotal')}
                                      </p>
                                      <p className="text-lg font-bold text-primary">
                                        ≈ {building.medianTotal.toLocaleString()} PLN
                                      </p>
                                      {building.medianRentPerM2 ? (
                                        <p className="text-xs text-muted-foreground">
                                          ≈ {building.medianRentPerM2.toLocaleString()}{' '}
                                          {t('costs.overview.perM2')}
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                      <Lock className="h-4 w-4" />
                                      <span className="text-sm">
                                        {t('costs.overview.submitToUnlock')}
                                      </span>
                                    </div>
                                  )}
                                  <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      </motion.div>
                    ))}
                  </div>

                  {visibleCount < filteredBuildings.length && (
                    <div className="mt-6 text-center">
                      <Button
                        variant="outline"
                        onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                      >
                        {t('costs.overview.showMore', {
                          remaining: filteredBuildings.length - visibleCount,
                        })}
                      </Button>
                    </div>
                  )}

                  {filteredBuildings.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
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
                          <div className="mt-6 flex flex-col items-center gap-2">
                            <Button asChild>
                              <Link href={`/${citySlug}/costs/submit`}>
                                {t('costs.overview.submitCostReport')}
                              </Link>
                            </Button>
                            <BuyAccessDialog citySlug={citySlug}>
                              <Button variant="outline" className="gap-2">
                                <ShoppingCart className="h-4 w-4" />
                                {t('costs.overview.buyAccessBtn')}
                              </Button>
                            </BuyAccessDialog>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
