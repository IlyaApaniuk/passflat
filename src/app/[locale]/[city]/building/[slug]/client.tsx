"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { usePostHog } from "posthog-js/react";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/landing/header";
import { Footer } from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Users,
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
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.1, ease: "easeOut" as const },
  }),
};

interface CostStats {
  avg: number;
  min: number;
  max: number;
  count: number;
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
    totalMonthlyAvg: CostStats | null;
    deposit: CostStats | null;
  } | null;
  includedCounts: IncludedCounts | null;
  comparison: {
    thisBuilding: number | null;
    districtAvg: number | null;
    cityAvg: number | null;
  };
  hasContributed: boolean;
  citySlug: string;
}

export function BuildingCostsClient({
  building,
  reports,
  lastUpdated,
  costs,
  includedCounts,
  comparison,
  hasContributed,
  citySlug,
}: BuildingCostsClientProps) {
  const t = useTranslations();
  const posthog = usePostHog();

  useEffect(() => {
    posthog?.capture("building_detail_viewed", {
      building_id: building.id,
      building_slug: building.slug,
      city: citySlug,
    });
  }, [building.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOftenIncluded = (count: number) =>
    includedCounts && includedCounts.total > 0 && count / includedCounts.total >= 0.5;

  const costItems = costs
    ? [
        {
          label: t("costs.building.rent"),
          icon: Home,
          color: "text-primary",
          bgColor: "bg-primary/10",
          data: costs.rent,
        },
        {
          label: t("costs.building.adminFee"),
          icon: Building2,
          color: "text-muted-foreground",
          bgColor: "bg-muted",
          data: costs.adminFee,
        },
        {
          label: t("costs.building.electricity"),
          icon: Zap,
          color: "text-yellow-500",
          bgColor: "bg-yellow-500/10",
          data: costs.electricity,
          winter: costs.electricityWinter,
          summer: costs.electricitySummer,
          oftenIncluded: isOftenIncluded(includedCounts?.electricity ?? 0),
        },
        {
          label: t("costs.building.gas"),
          icon: Flame,
          color: "text-orange-500",
          bgColor: "bg-orange-500/10",
          data: costs.gas,
        },
        {
          label: t("costs.building.heating"),
          icon: Flame,
          color: "text-red-500",
          bgColor: "bg-red-500/10",
          data: costs.heating,
          winter: costs.heatingWinter,
          summer: costs.heatingSummer,
          oftenIncluded: isOftenIncluded(includedCounts?.heating ?? 0),
        },
        {
          label: t("costs.building.water"),
          icon: Droplets,
          color: "text-blue-500",
          bgColor: "bg-blue-500/10",
          data: costs.water,
          oftenIncluded: isOftenIncluded(includedCounts?.water ?? 0),
        },
        {
          label: t("costs.building.internet"),
          icon: Wifi,
          color: "text-primary",
          bgColor: "bg-primary/10",
          data: costs.internet,
        },
        ...(costs.otherCosts
          ? [
              {
                label: t("costs.building.otherCosts"),
                icon: Home,
                color: "text-muted-foreground",
                bgColor: "bg-muted",
                data: costs.otherCosts,
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 bg-muted/30 pt-20">
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
                {t("costs.submit.backToCosts")}
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
                <h1 className="text-2xl font-bold md:text-3xl">
                  {building.address}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {building.district}, {t(building.city)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {reports} {t("costs.overview.reports")}
                  </span>
                </div>
              </div>
              {lastUpdated && (
                <Badge variant="secondary" className="w-fit">
                  {t("costs.building.updated", {
                    date: new Date(lastUpdated).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                    }),
                  })}
                </Badge>
              )}
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
          ) : !hasContributed ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="relative overflow-hidden">
                <CardContent className="p-8">
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {costItems.slice(0, 6).map((item) => (
                      <div
                        key={item.label}
                        className="rounded-lg bg-muted/50 p-4"
                      >
                        <div className="flex items-center gap-2">
                          <item.icon className={`h-4 w-4 ${item.color}`} />
                          <span className="text-sm text-muted-foreground">
                            {item.label}
                          </span>
                        </div>
                        <div className="mt-2 h-6 w-24 animate-pulse rounded bg-muted" />
                      </div>
                    ))}
                  </div>

                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3, type: "spring" }}
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
                    >
                      <Lock className="h-8 w-8 text-primary" />
                    </motion.div>
                    <h3 className="mt-4 text-xl font-semibold">
                      {t("costs.building.unlockTitle")}
                    </h3>
                    <p className="mt-2 max-w-sm text-center text-muted-foreground">
                      {t("costs.building.unlockDesc")}
                    </p>
                    <Button className="mt-6" asChild>
                      <Link href={`/${citySlug}/costs/submit`}>
                        {t("costs.overview.submitMyCosts")}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <div className="space-y-8">
              {costs?.totalMonthlyAvg && (
                <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
                  <Card className="overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary" />
                    <CardHeader>
                      <CardTitle>{t("costs.building.avgMonthlyTotal")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <motion.p
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3, type: "spring", bounce: 0.4 }}
                        className="text-4xl font-bold text-primary"
                      >
                        {costs.totalMonthlyAvg.avg.toLocaleString()} PLN
                      </motion.p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("costs.building.basedOnReports", { count: reports })}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp}>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("costs.building.costBreakdown")}</CardTitle>
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
                                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.bgColor}`}>
                                  <item.icon
                                    className={`h-5 w-5 ${item.color}`}
                                  />
                                </div>
                                <div>
                                  <span className="font-medium">{item.label}</span>
                                  {"oftenIncluded" in item && item.oftenIncluded && (
                                    <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                                      {t("costs.building.oftenIncluded")}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold">
                                  {item.data!.avg} PLN
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {item.data!.min} - {item.data!.max} PLN
                                </p>
                              </div>
                            </div>
                            {"winter" in item && item.winter && item.summer && (
                              <p className="mt-1 pl-[52px] text-xs text-muted-foreground">
                                {t("costs.building.winterSummer", {
                                  winter: `${item.winter.avg} PLN`,
                                  summer: `${item.summer.avg} PLN`,
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
                    <CardContent className="flex items-center justify-between p-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Shield className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{t("costs.building.deposit")}</p>
                          <p className="text-xs text-muted-foreground">
                            {t("costs.building.depositDesc")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold">
                          {costs.deposit.avg.toLocaleString()} PLN
                        </p>
                        {costs.deposit.count > 1 && (
                          <p className="text-xs text-muted-foreground">
                            {costs.deposit.min.toLocaleString()} - {costs.deposit.max.toLocaleString()} PLN
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {(comparison.districtAvg || comparison.cityAvg) && (
                <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp}>
                  <Card>
                    <CardHeader>
                      <CardTitle>{t("costs.building.comparison")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {comparison.thisBuilding && (
                        <div className="mb-5 text-center">
                          <p className="text-sm text-muted-foreground">{t("costs.building.thisBuilding")}</p>
                          <p className="text-3xl font-bold text-primary">
                            {comparison.thisBuilding.toLocaleString()} PLN
                          </p>
                        </div>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2">
                        {comparison.districtAvg && comparison.thisBuilding && (() => {
                          const pct = Math.round(
                            ((comparison.thisBuilding - comparison.districtAvg) /
                              comparison.districtAvg) *
                              100,
                          );
                          const borderColor = pct === 0 ? "border-muted-foreground" : pct < 0 ? "border-green-500" : "border-red-500";
                          return (
                            <div className={`rounded-lg border-l-4 ${borderColor} bg-muted/50 p-4`}>
                              <p className="text-sm text-muted-foreground">
                                {t("costs.building.districtAvg", { district: building.district })}
                              </p>
                              <p className="mt-1 text-lg font-semibold">
                                {comparison.districtAvg.toLocaleString()} PLN
                              </p>
                              <div className="mt-2">
                                {pct === 0 ? (
                                  <Badge className="gap-1 bg-muted text-muted-foreground">
                                    <Equal className="h-3 w-3" />
                                    {t("costs.building.matchesAverage")}
                                  </Badge>
                                ) : pct < 0 ? (
                                  <Badge className="gap-1 bg-green-500/10 text-green-600">
                                    <TrendingDown className="h-3 w-3" />
                                    {t("costs.building.percentLower", { percent: Math.abs(pct) })}
                                  </Badge>
                                ) : (
                                  <Badge className="gap-1 bg-red-500/10 text-red-600">
                                    <TrendingUp className="h-3 w-3" />
                                    {t("costs.building.percentHigher", { percent: pct })}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        {comparison.cityAvg && comparison.thisBuilding && (() => {
                          const pct = Math.round(
                            ((comparison.thisBuilding - comparison.cityAvg) /
                              comparison.cityAvg) *
                              100,
                          );
                          const borderColor = pct === 0 ? "border-muted-foreground" : pct < 0 ? "border-green-500" : "border-red-500";
                          return (
                            <div className={`rounded-lg border-l-4 ${borderColor} bg-muted/50 p-4`}>
                              <p className="text-sm text-muted-foreground">
                                {t("costs.building.warsawAvg")}
                              </p>
                              <p className="mt-1 text-lg font-semibold">
                                {comparison.cityAvg.toLocaleString()} PLN
                              </p>
                              <div className="mt-2">
                                {pct === 0 ? (
                                  <Badge className="gap-1 bg-muted text-muted-foreground">
                                    <Equal className="h-3 w-3" />
                                    {t("costs.building.matchesAverage")}
                                  </Badge>
                                ) : pct < 0 ? (
                                  <Badge className="gap-1 bg-green-500/10 text-green-600">
                                    <TrendingDown className="h-3 w-3" />
                                    {t("costs.building.percentLower", { percent: Math.abs(pct) })}
                                  </Badge>
                                ) : (
                                  <Badge className="gap-1 bg-red-500/10 text-red-600">
                                    <TrendingUp className="h-3 w-3" />
                                    {t("costs.building.percentHigher", { percent: pct })}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              <motion.div custom={3} initial="hidden" animate="visible" variants={fadeUp}>
                <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardContent className="flex flex-col items-center py-8 text-center">
                    <h3 className="text-lg font-semibold">
                      {t("costs.building.lookingForApartment")}
                    </h3>
                    <p className="mt-2 text-muted-foreground">
                      {t("costs.building.lookingForApartmentDesc")}
                    </p>
                    {building.districtSlug && (
                      <Button className="mt-4 transition-transform hover:scale-[1.02]" asChild>
                        <Link
                          href={`/${citySlug}/replacement?district=${building.districtSlug}`}
                        >
                          {t("costs.building.viewListingsIn", {
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
