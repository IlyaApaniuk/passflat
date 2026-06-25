'use client';

import { use, useCallback, useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { Link } from '@/i18n/navigation';
import { Footer } from '@/components/landing/footer';
import { CostAccessCard } from '@/components/costs/cost-access-card';
import type { CostAccess } from '@/components/costs/cost-access-card';
import { DistrictComparison, type DistrictStatsData } from '@/components/costs/district-comparison';
import { MapSkeleton } from '@/components/map/map-skeleton';
import { median } from '@/lib/cost-stats';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Building2,
  Search,
  TrendingUp,
  MapPin,
  Users,
  ArrowRight,
  List,
  Map,
  Home,
  DoorOpen,
  BarChart3,
  Calculator,
} from 'lucide-react';

export type { CostAccess };

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
  medianTotalPerM2: number | null;
  medianAdminFeePerM2: number | null;
  medianExpenses: number | null;
  lat: number | null;
  lng: number | null;
  rentalType: string | null;
}

interface DistrictData {
  slug: string;
  name: string;
  count: number;
}

interface CityBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface CostsOverviewClientProps {
  buildings: BuildingData[];
  districts: DistrictData[];
  districtStats: DistrictStatsData[];
  /** Pre-resolved access for anonymous users (no session cookie). */
  initialAccess: CostAccess | null;
  /** Streamed auth promise for logged-in users; omitted for anons. */
  accessPromise?: Promise<CostAccess>;
  citySlug: string;
  cityBounds?: CityBounds;
  initialSearch: string;
  initialDistrict: string | null;
}

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

function stripDiacritics(str: string) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l')
    .replace(/\u0141/g, 'L');
}

const PAGE_SIZE = 20;

const fadeUp = {
  hidden: { opacity: 0 },
  visible: (i: number) => ({
    opacity: 1,
    transition: { duration: 0.4, delay: (i % PAGE_SIZE) * 0.08, ease: 'easeOut' as const },
  }),
};

export function CostsOverviewClient({
  buildings,
  districts,
  districtStats,
  initialAccess,
  accessPromise,
  citySlug,
  cityBounds,
  initialSearch,
  initialDistrict,
}: CostsOverviewClientProps) {
  const t = useTranslations();
  const searchParams = useSearchParams();

  // `null` while the streamed auth promise resolves; once resolved it drives the
  // CostAccessCard's contribution nudge / "your access" status. The cost table
  // never waits on it — the summary ("база") is public, so the numbers render
  // immediately for everyone. The deeper per-utility detail is gated, but that
  // lives on the building page (useHasContributed), not here.
  const [access, setAccess] = useState<CostAccess | null>(initialAccess);
  const handleAccessResolved = useCallback((next: CostAccess) => setAccess(next), []);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [mainTab, setMainTab] = useState<'buildings' | 'compare'>('buildings');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [rentalTypeFilter, setRentalTypeFilter] = useState<'all' | 'apartment' | 'room'>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(initialDistrict);

  const searchAndTypeFiltered = useMemo(
    () =>
      buildings.filter((building) => {
        const q = stripDiacritics(searchQuery.toLowerCase());
        const matchesSearch =
          q === '' ||
          stripDiacritics(building.address.toLowerCase()).includes(q) ||
          stripDiacritics(building.district.toLowerCase()).includes(q);
        const matchesRentalType =
          rentalTypeFilter === 'all' || building.rentalType === rentalTypeFilter;
        return matchesSearch && matchesRentalType;
      }),
    [buildings, searchQuery, rentalTypeFilter],
  );

  const filteredBuildings = useMemo(
    () =>
      searchAndTypeFiltered.filter(
        (building) => selectedDistrict === null || building.districtSlug === selectedDistrict,
      ),
    [searchAndTypeFiltered, selectedDistrict],
  );

  // Total cost reports across the currently filtered buildings — shown next to
  // the building count so the header reflects both supply dimensions.
  const totalReports = useMemo(
    () => filteredBuildings.reduce((sum, b) => sum + b.reports, 0),
    [filteredBuildings],
  );

  const computedDistrictStats = useMemo(
    () =>
      districtStats.map((ds) => {
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
            medianTotalPerM2: 0,
            medianExpenses: 0,
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
          medianTotalPerM2: medianOf(dBuildings.map((b) => b.medianTotalPerM2 ?? 0)),
          medianExpenses: medianOf(dBuildings.map((b) => b.medianExpenses ?? 0)),
        };
      }),
    [districtStats, rentalTypeFilter, searchAndTypeFiltered],
  );

  // Sidebar is now a plain filter: districts with reports, in server order.
  // Rich per-district medians live in the "District comparison" tab.
  const visibleDistricts = useMemo(() => districts.filter((d) => d.count > 0), [districts]);

  useEffect(() => {
    // Reset pagination back to the first page whenever the active filters change
    // (external-sync of derived UI state); a cascading render here is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      {accessPromise && (
        <Suspense fallback={null}>
          <AccessResolver promise={accessPromise} onResolve={handleAccessResolved} />
        </Suspense>
      )}
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
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t('costs.overview.searchPlaceholder')}
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Single source of truth for the access affordance — full
                    width, matching the search field above. */}
                <CostAccessCard access={access} citySlug={citySlug} />
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Calculator teaser — a separate entry block into the full tool, carrying
            the active district filter through as a deep-link. */}
        <div className="container mx-auto px-4 pt-6">
          <Link
            href={`/${citySlug}/calculator${selectedDistrict ? `?district=${selectedDistrict}` : ''}`}
            className="block"
          >
            <Card className="group border-primary/20 bg-primary/5 transition-colors hover:border-primary/40">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Calculator className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">
                      {t('costs.calculatorTeaser.title')}
                    </p>
                    <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
                      {t('costs.calculatorTeaser.desc')}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  tabIndex={-1}
                  className="w-full shrink-0 gap-1.5 sm:w-auto"
                >
                  {t('costs.calculatorTeaser.cta')}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col lg:flex-row">
            {/* Filter only applies to the buildings list — animate it out on the
                comparison tab so the content reflows smoothly to full width
                (flex) instead of snapping the way a grid col-span would. */}
            <AnimatePresence initial={false}>
              {mainTab === 'buildings' && (
                <motion.aside
                  key="district-sidebar"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="hidden shrink-0 overflow-hidden lg:block"
                >
                  <div className="w-80 pr-8">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">{t('costs.overview.districts')}</CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="divide-y">
                          <button
                            onClick={() => handleDistrictSelect(null)}
                            className={`flex w-full items-center justify-between px-6 py-3 text-left text-sm transition-colors hover:bg-muted/50 ${
                              selectedDistrict === null
                                ? 'bg-primary/5 font-medium text-primary'
                                : ''
                            }`}
                          >
                            <span>{t('costs.overview.allDistricts')}</span>
                            <span className="text-muted-foreground">
                              {searchAndTypeFiltered.length}
                            </span>
                          </button>
                          {visibleDistricts.map((district) => {
                            const isActive = selectedDistrict === district.slug;
                            const count = searchAndTypeFiltered.filter(
                              (b) => b.districtSlug === district.slug,
                            ).length;
                            return (
                              <button
                                key={district.slug}
                                onClick={() =>
                                  handleDistrictSelect(isActive ? null : district.slug)
                                }
                                className={`flex w-full items-center justify-between gap-2 px-6 py-3 text-left text-sm transition-colors hover:bg-muted/50 ${
                                  isActive ? 'bg-primary/5 font-medium text-primary' : ''
                                }`}
                              >
                                <span className="min-w-0 flex-1 truncate">{district.name}</span>
                                <span className="text-muted-foreground">{count}</span>
                              </button>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>

            <div className="min-w-0 flex-1">
              {/* Mobile: compact district picker in place of the desktop sidebar
                  list — only on the buildings tab, where filtering applies. */}
              {mainTab === 'buildings' && (
                <div className="mb-6 lg:hidden">
                  <Select
                    value={selectedDistrict ?? 'all'}
                    onValueChange={(v) => handleDistrictSelect(v === 'all' ? null : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t('costs.overview.allDistricts')} ({searchAndTypeFiltered.length})
                      </SelectItem>
                      {visibleDistricts.map((district) => (
                        <SelectItem key={district.slug} value={district.slug}>
                          {district.name} (
                          {
                            searchAndTypeFiltered.filter((b) => b.districtSlug === district.slug)
                              .length
                          }
                          )
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'buildings' | 'compare')}>
                <TabsList className="mb-6 w-full max-w-full justify-start overflow-x-auto">
                  <TabsTrigger value="buildings" className="shrink-0 gap-2">
                    <Building2 className="h-4 w-4" />
                    {t('costs.compare.tabBuildings')}
                  </TabsTrigger>
                  <TabsTrigger value="compare" className="shrink-0 gap-2">
                    <BarChart3 className="h-4 w-4" />
                    {t('costs.compare.tabDistricts')}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="buildings">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="mb-6 flex flex-wrap items-center gap-3"
                  >
                    <p className="text-sm text-muted-foreground sm:mr-auto">
                      <span className="font-medium text-foreground">
                        {filteredBuildings.length}
                      </span>{' '}
                      {t('costs.overview.buildingsWithReports')}
                      {' · '}
                      <span className="font-medium text-foreground">{totalReports}</span>{' '}
                      {t('costs.overview.nReportsUnit', { count: totalReports })}
                    </p>
                    <div className="flex w-full items-center gap-1 rounded-lg border bg-background p-1 sm:w-auto">
                      {(['all', 'apartment', 'room'] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => setRentalTypeFilter(type)}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:flex-none sm:px-3 sm:text-sm ${
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
                    <div className="flex w-full items-center gap-1 rounded-lg border bg-background p-1 sm:w-auto">
                      <button
                        onClick={() => setViewMode('list')}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:flex-none sm:px-3 sm:text-sm ${
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
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:flex-none sm:px-3 sm:text-sm ${
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
                              perM2: b.medianTotalPerM2,
                              hasContributed: true,
                            }))}
                          citySlug={citySlug}
                          bounds={cityBounds}
                          cityMedianTotal={
                            median(
                              filteredBuildings.map((b) => b.medianTotal).filter((v) => v > 0),
                            ) ?? 0
                          }
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
                                            {t('costs.overview.nReports', {
                                              count: building.reports,
                                            })}
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
                                      <div className="text-left tabular-nums sm:text-right">
                                        <p className="text-xs text-muted-foreground">
                                          {t('costs.overview.medianMonthlyTotal')}
                                        </p>
                                        <p className="text-lg font-bold text-primary">
                                          ≈ {building.medianTotal.toLocaleString()} PLN
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {t('costs.overview.rent')} ≈{' '}
                                          {building.medianRent.toLocaleString()}
                                          {building.medianExpenses != null && (
                                            <>
                                              {' · '}
                                              {t('costs.overview.expenses')} ≈{' '}
                                              {building.medianExpenses.toLocaleString()}
                                            </>
                                          )}
                                        </p>
                                        {building.medianTotalPerM2 ? (
                                          <p className="text-xs text-muted-foreground">
                                            ≈ {building.medianTotalPerM2.toLocaleString()}{' '}
                                            {t('costs.overview.perM2')}
                                          </p>
                                        ) : null}
                                      </div>
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
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="compare">
                  <DistrictComparison stats={computedDistrictStats} citySlug={citySlug} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
