"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { useTranslations } from "next-intl";
import { usePostHog } from "posthog-js/react";
import { motion } from "framer-motion";
import { Link, useRouter } from "@/i18n/navigation";
import { Header } from "@/components/landing/header";
import { Footer } from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";

const CostsMap = lazy(() =>
  import("@/components/map/CostsMap").then((m) => ({ default: m.CostsMap })),
);

interface BuildingData {
  id: string;
  slug: string;
  address: string;
  district: string;
  districtSlug: string;
  reports: number;
  avgTotal: number;
  avgRent: number;
  avgUtilities: number;
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
  avgTotal: number;
  avgRent: number;
  avgUtilities: number;
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
  hasContributed: boolean;
  isFlagged?: boolean;
  citySlug: string;
  cityBounds?: CityBounds;
  initialSearch: string;
  initialDistrict: string | null;
}

function stripDiacritics(str: string) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0142/g, "l").replace(/\u0141/g, "L");
}

const PAGE_SIZE = 20;

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: (i % PAGE_SIZE) * 0.08, ease: "easeOut" as const },
  }),
};

export function CostsOverviewClient({
  buildings,
  districts,
  districtStats,
  hasContributed,
  isFlagged = false,
  citySlug,
  cityBounds,
  initialSearch,
  initialDistrict,
}: CostsOverviewClientProps) {
  const t = useTranslations();
  const posthog = usePostHog();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [rentalTypeFilter, setRentalTypeFilter] = useState<"all" | "apartment" | "room">("all");
  const [expandedDistrict, setExpandedDistrict] = useState<string | null>(initialDistrict);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!hasContributed) {
      posthog?.capture("cost_unlock_prompted", { city: citySlug });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(
    initialDistrict
  );

  const searchAndTypeFiltered = buildings.filter((building) => {
    const q = stripDiacritics(searchQuery.toLowerCase());
    const matchesSearch =
      q === "" ||
      stripDiacritics(building.address.toLowerCase()).includes(q) ||
      stripDiacritics(building.district.toLowerCase()).includes(q);
    const matchesRentalType =
      rentalTypeFilter === "all" || building.rentalType === rentalTypeFilter;
    return matchesSearch && matchesRentalType;
  });

  const filteredBuildings = searchAndTypeFiltered.filter(
    (building) => selectedDistrict === null || building.districtSlug === selectedDistrict,
  );

  const computedDistrictStats = districtStats.map((ds) => {
    if (rentalTypeFilter === "all") return ds;
    const dBuildings = searchAndTypeFiltered.filter((b) => b.districtSlug === ds.slug);
    if (dBuildings.length === 0) return { ...ds, buildingCount: 0, reportCount: 0, avgTotal: 0, avgRent: 0, avgUtilities: 0 };
    const avgOf = (vals: number[]) => {
      const nums = vals.filter((v) => v > 0);
      return nums.length === 0 ? 0 : Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
    };
    return {
      ...ds,
      buildingCount: dBuildings.length,
      reportCount: dBuildings.reduce((s, b) => s + b.reports, 0),
      avgTotal: avgOf(dBuildings.map((b) => b.avgTotal)),
      avgRent: avgOf(dBuildings.map((b) => b.avgRent)),
      avgUtilities: avgOf(dBuildings.map((b) => b.avgUtilities)),
    };
  });

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, selectedDistrict, rentalTypeFilter]);

  const handleDistrictSelect = (slug: string | null) => {
    setSelectedDistrict(slug);
    const params = new URLSearchParams();
    if (slug) params.set("district", slug);
    if (searchQuery) params.set("q", searchQuery);
    const qs = params.toString();
    window.history.replaceState(null, "", `/${citySlug}/costs${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 pt-20">
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
                {t("costs.overview.badge")}
              </div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                {t("costs.overview.title")}
              </h1>
              <p className="mt-4 text-muted-foreground">
                {t("costs.overview.subtitle")}
              </p>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="mt-8 flex gap-2"
              >
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t("costs.overview.searchPlaceholder")}
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                {hasContributed ? (
                  <Button variant="outline" asChild>
                    <Link href={`/${citySlug}/costs/submit?edit=true`}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {t("costs.submit.editReport")}
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" asChild>
                    <Link href={`/${citySlug}/costs/submit`}>
                      {t("costs.overview.submitCosts")}
                    </Link>
                  </Button>
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
                <CardHeader>
                  <CardTitle className="text-lg">
                    {t("costs.overview.districts")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    <button
                      onClick={() => handleDistrictSelect(null)}
                      className={`flex w-full items-center justify-between px-6 py-3 text-left text-sm transition-colors hover:bg-muted/50 ${
                        selectedDistrict === null
                          ? "bg-primary/5 font-medium text-primary"
                          : ""
                      }`}
                    >
                      <span>{t("costs.overview.allDistricts")}</span>
                      <span className="text-muted-foreground">
                        {searchAndTypeFiltered.length}
                      </span>
                    </button>
                    {districts
                      .filter((d) => d.count > 0)
                      .map((district) => {
                        const isActive = selectedDistrict === district.slug;
                        const isExpanded = expandedDistrict === district.slug;
                        const stats = computedDistrictStats.find((s) => s.slug === district.slug);
                        const hasStats = stats && stats.buildingCount > 0;
                        return (
                          <div key={district.slug}>
                            <div
                              className={`flex w-full items-center justify-between px-6 py-3 text-sm transition-colors ${
                                isActive ? "bg-primary/5 font-medium text-primary" : ""
                              }`}
                            >
                              <button
                                onClick={() => {
                                  handleDistrictSelect(isActive ? null : district.slug);
                                  if (!isActive) setExpandedDistrict(district.slug);
                                }}
                                className="flex-1 text-left hover:text-primary transition-colors"
                              >
                                {district.name}
                              </button>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">
                                  {searchAndTypeFiltered.filter((b) => b.districtSlug === district.slug).length}
                                </span>
                                {hasStats && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedDistrict(isExpanded ? null : district.slug);
                                    }}
                                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                  >
                                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                  </button>
                                )}
                              </div>
                            </div>
                            {isExpanded && hasStats && (
                              <div className="border-t bg-muted/30 px-6 py-3">
                                {hasContributed ? (
                                  <div className="grid grid-cols-3 gap-2 text-center">
                                    <div>
                                      <p className="text-[10px] text-muted-foreground">{t("costs.overview.districtAvgRent")}</p>
                                      <p className="text-sm font-bold">{stats.avgRent.toLocaleString()}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-muted-foreground">{t("costs.overview.districtAvgUtilities")}</p>
                                      <p className="text-sm font-bold">{stats.avgUtilities.toLocaleString()}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-muted-foreground">{t("costs.overview.districtAvgTotal")}</p>
                                      <p className="text-sm font-bold text-primary">{stats.avgTotal.toLocaleString()}</p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Lock className="h-3.5 w-3.5" />
                                    {t("costs.overview.submitToUnlock")}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>

              {isFlagged && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Card className="mt-4 border-destructive/50 bg-destructive/5">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
                        <div>
                          <p className="font-medium">
                            {t("costs.overview.flaggedTitle")}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t("costs.overview.flaggedDesc")}
                          </p>
                          <div className="mt-3 flex flex-col gap-2">
                            <Button size="sm" asChild>
                              <Link href={`/${citySlug}/costs/submit?edit=true`}>
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                {t("costs.submit.editReport")}
                              </Link>
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                              <a href="mailto:contact@passflat.eu?subject=Cost report review">
                                <Mail className="mr-2 h-3.5 w-3.5" />
                                {t("costs.submit.contactUs")}
                              </a>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {!hasContributed && !isFlagged && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Card className="mt-4 border-primary/50 bg-primary/5">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Lock className="mt-0.5 h-5 w-5 text-primary" />
                        <div>
                          <p className="font-medium">
                            {t("costs.overview.unlockFullData")}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t("costs.overview.unlockDesc")}
                          </p>
                          <Button size="sm" className="mt-3" asChild>
                            <Link href={`/${citySlug}/costs/submit`}>
                              {t("costs.overview.submitMyCosts")}
                            </Link>
                          </Button>
                        </div>
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
                  <span className="font-medium text-foreground">
                    {filteredBuildings.length}
                  </span>{" "}
                  {t("costs.overview.buildingsWithReports")}
                </p>
                <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
                  {(["all", "apartment", "room"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setRentalTypeFilter(type)}
                      className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                        rentalTypeFilter === type
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {type === "apartment" && <Home className="h-3.5 w-3.5" />}
                      {type === "room" && <DoorOpen className="h-3.5 w-3.5" />}
                      {type === "all"
                        ? t("costs.overview.filterAll")
                        : type === "apartment"
                          ? t("costs.overview.filterApartment")
                          : t("costs.overview.filterRoom")}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                      viewMode === "list"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <List className="h-4 w-4" />
                    {t("costs.overview.listView")}
                  </button>
                  <button
                    onClick={() => setViewMode("map")}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                      viewMode === "map"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Map className="h-4 w-4" />
                    {t("costs.overview.mapView")}
                  </button>
                </div>
              </motion.div>

              {viewMode === "map" && (
                <Suspense
                  fallback={
                    <div className="flex h-[500px] items-center justify-center rounded-lg border bg-muted/30">
                      <p className="text-sm text-muted-foreground">
                        {t("costs.overview.loadingMap")}
                      </p>
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
                          avgTotal: b.avgTotal,
                          hasContributed,
                        }))}
                      citySlug={citySlug}
                      bounds={cityBounds}
                    />
                  </div>
                </Suspense>
              )}

              {viewMode === "list" && (
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
                                        {building.reports}{" "}
                                        {t("costs.overview.reports")}
                                      </span>
                                      {building.rentalType && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                                          {building.rentalType === "apartment" ? (
                                            <Home className="h-3 w-3" />
                                          ) : (
                                            <DoorOpen className="h-3 w-3" />
                                          )}
                                          {building.rentalType === "apartment"
                                            ? t("costs.overview.filterApartment")
                                            : t("costs.overview.filterRoom")}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-6">
                                  {hasContributed ? (
                                    <div className="text-right">
                                      <p className="text-xs text-muted-foreground">
                                        {t("costs.overview.avgMonthlyTotal")}
                                      </p>
                                      <p className="text-lg font-bold text-primary">
                                        {building.avgTotal.toLocaleString()} PLN
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                      <Lock className="h-4 w-4" />
                                      <span className="text-sm">
                                        {t("costs.overview.submitToUnlock")}
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
                        {t("costs.overview.showMore", {
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
                            {t("costs.overview.noBuildingsFound")}
                          </h3>
                          <p className="mt-1 text-muted-foreground">
                            {t("costs.overview.noBuildingsDesc")}
                          </p>
                          <Button className="mt-6" asChild>
                            <Link href={`/${citySlug}/costs/submit`}>
                              {t("costs.overview.submitCostReport")}
                            </Link>
                          </Button>
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
