"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
} from "lucide-react";

interface BuildingData {
  id: string;
  address: string;
  district: string;
  districtSlug: string;
  reports: number;
  avgTotal: number;
  avgRent: number;
  avgUtilities: number;
}

interface DistrictData {
  slug: string;
  name: string;
  count: number;
}

interface CostsOverviewClientProps {
  buildings: BuildingData[];
  districts: DistrictData[];
  hasContributed: boolean;
  citySlug: string;
  initialSearch: string;
  initialDistrict: string | null;
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.08, ease: "easeOut" },
  }),
};

export function CostsOverviewClient({
  buildings,
  districts,
  hasContributed,
  citySlug,
  initialSearch,
  initialDistrict,
}: CostsOverviewClientProps) {
  const t = useTranslations();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(
    initialDistrict
  );

  const filteredBuildings = buildings.filter((building) => {
    const matchesSearch =
      searchQuery === "" ||
      building.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      building.district.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDistrict =
      selectedDistrict === null || building.districtSlug === selectedDistrict;
    return matchesSearch && matchesDistrict;
  });

  const handleDistrictSelect = (slug: string | null) => {
    setSelectedDistrict(slug);
    const params = new URLSearchParams();
    if (slug) params.set("district", slug);
    if (searchQuery) params.set("q", searchQuery);
    const qs = params.toString();
    router.push(`/${citySlug}/costs${qs ? `?${qs}` : ""}`);
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
                <Button variant="outline" asChild>
                  <Link href={`/${citySlug}/costs/submit`}>
                    {t("costs.overview.submitCosts")}
                  </Link>
                </Button>
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
                        {buildings.length}
                      </span>
                    </button>
                    {districts
                      .filter((d) => d.count > 0)
                      .map((district) => (
                        <button
                          key={district.slug}
                          onClick={() => handleDistrictSelect(district.slug)}
                          className={`flex w-full items-center justify-between px-6 py-3 text-left text-sm transition-colors hover:bg-muted/50 ${
                            selectedDistrict === district.slug
                              ? "bg-primary/5 font-medium text-primary"
                              : ""
                          }`}
                        >
                          <span>{district.name}</span>
                          <span className="text-muted-foreground">
                            {district.count}
                          </span>
                        </button>
                      ))}
                  </div>
                </CardContent>
              </Card>

              {!hasContributed && (
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
                className="mb-6 flex items-center justify-between"
              >
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {filteredBuildings.length}
                  </span>{" "}
                  {t("costs.overview.buildingsWithReports")}
                </p>
              </motion.div>

              <div className="space-y-4">
                {filteredBuildings.map((building, i) => (
                  <motion.div
                    key={building.id}
                    custom={i}
                    initial="hidden"
                    animate="visible"
                    variants={fadeUp}
                  >
                    <Link
                      href={`/${citySlug}/building/${building.id}`}
                    >
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
                                <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5" />
                                    {building.district}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3.5 w-3.5" />
                                    {building.reports}{" "}
                                    {t("costs.overview.reports")}
                                  </span>
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
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
