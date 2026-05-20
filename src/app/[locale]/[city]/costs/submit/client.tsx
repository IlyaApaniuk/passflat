"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { useRouter } from "next/navigation";
import { Header } from "@/components/landing/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Check,
  Building2,
  Zap,
  Flame,
  Wifi,
  Droplets,
  Home,
  Lock,
  Loader2,
} from "lucide-react";
import {
  AddressAutocomplete,
  type PlaceResult,
} from "@/components/listings/address-autocomplete";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.1, ease: "easeOut" },
  }),
};

interface CostSubmitClientProps {
  citySlug: string;
}

export function CostSubmitClient({ citySlug }: CostSubmitClientProps) {
  const t = useTranslations();
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    street: "",
    buildingNumber: "",
    district: "",
    placeId: "",
    lat: 0,
    lng: 0,
    areaM2: "",
    rooms: "",
    rent: "",
    adminFee: "",
    electricity: "",
    gas: "",
    heating: "",
    water: "",
    internet: "",
    other: "",
  });

  const updateFormData = (updates: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handlePlaceSelect = (place: PlaceResult) => {
    updateFormData({
      street: place.street,
      buildingNumber: place.buildingNumber,
      district: place.district,
      placeId: place.placeId,
      lat: place.lat,
      lng: place.lng,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/cost-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          street: formData.street,
          buildingNumber: formData.buildingNumber,
          district: formData.district,
          placeId: formData.placeId || undefined,
          lat: formData.lat || undefined,
          lng: formData.lng || undefined,
          citySlug,
          rent: formData.rent || undefined,
          adminFee: formData.adminFee || undefined,
          electricity: formData.electricity || undefined,
          gas: formData.gas || undefined,
          heating: formData.heating || undefined,
          water: formData.water || undefined,
          internet: formData.internet || undefined,
          otherCosts: formData.other || undefined,
          rooms: formData.rooms || undefined,
          areaM2: formData.areaM2 || undefined,
          isCurrentTenant: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const totalUtilities =
    (parseInt(formData.electricity) || 0) +
    (parseInt(formData.gas) || 0) +
    (parseInt(formData.heating) || 0) +
    (parseInt(formData.water) || 0) +
    (parseInt(formData.internet) || 0) +
    (parseInt(formData.other) || 0);

  const totalMonthly =
    (parseInt(formData.rent) || 0) +
    (parseInt(formData.adminFee) || 0) +
    totalUtilities;

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 items-center justify-center p-8 pt-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: "spring", bounce: 0.3 }}
          >
            <Card className="w-full max-w-md text-center">
              <CardContent className="pt-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", bounce: 0.5 }}
                  className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
                >
                  <Check className="h-8 w-8 text-primary" />
                </motion.div>
                <h1 className="text-2xl font-bold">
                  {t("costs.submit.thankYou")}
                </h1>
                <p className="mt-2 text-muted-foreground">
                  {t("costs.submit.thankYouDesc")}
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <Button asChild>
                    <Link href={`/${citySlug}/costs`}>
                      {t("costs.submit.viewCostReports")}
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href={`/${citySlug}/replacement`}>
                      {t("costs.submit.browseListings")}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </main>
      </div>
    );
  }

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

          <div className="mx-auto max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-8 text-center"
            >
              <h1 className="text-2xl font-bold md:text-3xl">
                {t("costs.submit.pageTitle")}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {t("costs.submit.pageSubtitle")}
              </p>
            </motion.div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Card className="mb-6 border-destructive bg-destructive/5">
                    <CardContent className="p-4 text-sm text-destructive">
                      {error}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-6">
              <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
                <Card className="transition-shadow hover:shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Building2 className="h-5 w-5" />
                      {t("costs.submit.yourAddress")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t("listings.create.searchAddress")}</Label>
                      <AddressAutocomplete
                        onPlaceSelect={handlePlaceSelect}
                        placeholder={t("listings.create.addressPlaceholder")}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("listings.create.addressHint")}
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="street">
                          {t("costs.submit.street")} *
                        </Label>
                        <Input
                          id="street"
                          required
                          placeholder="e.g., ul. Marszalkowska"
                          value={formData.street}
                          onChange={(e) =>
                            updateFormData({ street: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="buildingNumber">
                          {t("costs.submit.buildingNo")} *
                        </Label>
                        <Input
                          id="buildingNumber"
                          required
                          placeholder="e.g., 45"
                          value={formData.buildingNumber}
                          onChange={(e) =>
                            updateFormData({ buildingNumber: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="areaM2">{t("costs.submit.size")}</Label>
                        <Input
                          id="areaM2"
                          type="number"
                          placeholder="e.g., 45"
                          value={formData.areaM2}
                          onChange={(e) =>
                            updateFormData({ areaM2: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp}>
                <Card className="transition-shadow hover:shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Home className="h-5 w-5" />
                      {t("costs.submit.baseCosts")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="rent">
                          {t("costs.submit.rent")} *
                        </Label>
                        <Input
                          id="rent"
                          type="number"
                          required
                          placeholder="e.g., 3200"
                          value={formData.rent}
                          onChange={(e) =>
                            updateFormData({ rent: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="adminFee">
                          {t("costs.submit.adminFeeCzynsz")}
                        </Label>
                        <Input
                          id="adminFee"
                          type="number"
                          placeholder="e.g., 350"
                          value={formData.adminFee}
                          onChange={(e) =>
                            updateFormData({ adminFee: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp}>
                <Card className="transition-shadow hover:shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Zap className="h-5 w-5" />
                      {t("costs.submit.utilitiesTitle")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label
                          htmlFor="electricity"
                          className="flex items-center gap-2"
                        >
                          <Zap className="h-4 w-4 text-yellow-500" />
                          {t("costs.submit.electricity")}
                        </Label>
                        <Input
                          id="electricity"
                          type="number"
                          placeholder="e.g., 150"
                          value={formData.electricity}
                          onChange={(e) =>
                            updateFormData({ electricity: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gas" className="flex items-center gap-2">
                          <Flame className="h-4 w-4 text-orange-500" />
                          {t("costs.submit.gas")}
                        </Label>
                        <Input
                          id="gas"
                          type="number"
                          placeholder="e.g., 80"
                          value={formData.gas}
                          onChange={(e) =>
                            updateFormData({ gas: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label
                          htmlFor="heating"
                          className="flex items-center gap-2"
                        >
                          <Flame className="h-4 w-4 text-red-500" />
                          {t("costs.submit.heating")}
                        </Label>
                        <Input
                          id="heating"
                          type="number"
                          placeholder="e.g., 200"
                          value={formData.heating}
                          onChange={(e) =>
                            updateFormData({ heating: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label
                          htmlFor="water"
                          className="flex items-center gap-2"
                        >
                          <Droplets className="h-4 w-4 text-blue-500" />
                          {t("costs.submit.water")}
                        </Label>
                        <Input
                          id="water"
                          type="number"
                          placeholder="e.g., 50"
                          value={formData.water}
                          onChange={(e) =>
                            updateFormData({ water: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label
                          htmlFor="internet"
                          className="flex items-center gap-2"
                        >
                          <Wifi className="h-4 w-4 text-primary" />
                          {t("costs.submit.internet")}
                        </Label>
                        <Input
                          id="internet"
                          type="number"
                          placeholder="e.g., 79"
                          value={formData.internet}
                          onChange={(e) =>
                            updateFormData({ internet: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="other">{t("costs.submit.other")}</Label>
                        <Input
                          id="other"
                          type="number"
                          placeholder="e.g., 30"
                          value={formData.other}
                          onChange={(e) =>
                            updateFormData({ other: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <AnimatePresence>
                {totalMonthly > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card className="bg-muted/50">
                      <CardContent className="pt-6">
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {t("costs.submit.baseRentAdmin")}
                            </span>
                            <span>
                              {(
                                (parseInt(formData.rent) || 0) +
                                (parseInt(formData.adminFee) || 0)
                              ).toLocaleString()}{" "}
                              PLN
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {t("costs.submit.utilitiesLabel")}
                            </span>
                            <span>{totalUtilities.toLocaleString()} PLN</span>
                          </div>
                          <div className="flex justify-between border-t pt-2">
                            <span className="font-semibold">
                              {t("common.totalMonthly")}
                            </span>
                            <span className="text-xl font-bold text-primary">
                              {totalMonthly.toLocaleString()} PLN
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div custom={3} initial="hidden" animate="visible" variants={fadeUp}>
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="flex items-start gap-3 pt-6">
                    <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div className="text-sm">
                      <p className="font-medium">
                        {t("costs.submit.privacyTitle")}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {t("costs.submit.privacyDesc")}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Button
                  type="submit"
                  size="lg"
                  className="w-full transition-transform hover:scale-[1.01] active:scale-[0.99]"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("common.loading")}
                    </>
                  ) : (
                    t("costs.submit.submitButton")
                  )}
                </Button>
              </motion.div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
