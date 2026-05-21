"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { usePostHog } from "posthog-js/react";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/landing/header";
import { Footer } from "@/components/landing/footer";
import { PhotoGallery } from "@/components/listings/photo-gallery";
import { InterestModal } from "@/components/listings/interest-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  MapPin,
  Bed,
  Bath,
  Square,
  Building2,
  Calendar,
  CalendarRange,
  Share2,
  Heart,
  Sparkles,
  CheckCircle,
  Info,
  Users,
  Wifi,
  Zap as ZapIcon,
} from "lucide-react";
import type { ListingType } from "@/lib/listings-data";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.1, ease: "easeOut" as const },
  }),
};

const TYPE_BADGE_STYLES: Record<ListingType, string> = {
  replacement: "bg-blue-500/90 text-white",
  roommate: "bg-violet-500/90 text-white",
  sublet: "bg-amber-500/90 text-white",
};

const TYPE_ROUTE: Record<ListingType, string> = {
  replacement: "replacement",
  roommate: "roommate",
  sublet: "sublet",
};

export interface ListingDetailData {
  id: string;
  type: ListingType;
  title: string;
  address: string;
  district: string;
  citySlug: string;
  buildingId: string;
  buildingSlug: string;
  price: number;
  adminFee: number;
  utilities: number;
  totalCost: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  floor: number;
  totalFloors: number;
  images: string[];
  lat: number;
  lng: number;
  promoted: boolean;
  availableFrom: string;
  features: string[];
  description: string;
  createdAt: string;
  author: string | null;
  // Roommate-specific
  pricePerPerson?: number;
  totalApartmentRent?: number;
  currentRoommates?: number;
  totalRooms?: number;
  roomType?: "private" | "shared";
  preferredGender?: "any" | "male" | "female";
  preferredAgeMin?: number;
  preferredAgeMax?: number;
  roommateDescription?: string;
  // Sublet-specific
  availableTo?: string;
  priceTotal?: number;
  durationDays?: number;
  utilitiesIncluded?: boolean;
  internetIncluded?: boolean;
  subletRules?: string;
  depositAmount?: number;
}

interface Props {
  listing: ListingDetailData;
  isLoggedIn: boolean;
}

export function ListingDetailClient({ listing, isLoggedIn }: Props) {
  const t = useTranslations();
  const posthog = usePostHog();
  const [interestModalOpen, setInterestModalOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const listingType = listing.type ?? "replacement";
  const backRoute = TYPE_ROUTE[listingType];

  useEffect(() => {
    posthog?.capture("listing_detail_viewed", {
      listing_id: listing.id,
      type: listingType,
      city: listing.citySlug,
      source: document.referrer.includes("/replacement") ||
              document.referrer.includes("/roommate") ||
              document.referrer.includes("/sublet")
        ? "search"
        : "direct",
    });
  }, [listing.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 pt-20">
        <div className="container mx-auto px-4 py-6">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-4"
          >
            <Button variant="ghost" size="sm" className="gap-2" asChild>
              <Link href={`/${listing.citySlug}/${backRoute}`}>
                <ArrowLeft className="h-4 w-4" />
                {t("listings.detail.backToListings")}
              </Link>
            </Button>
          </motion.div>

          {listing.images.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <PhotoGallery images={listing.images} title={listing.title} />
            </motion.div>
          )}

          <div className="mt-8 grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <motion.div
                custom={0}
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                className="flex flex-wrap items-start justify-between gap-4"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {listing.promoted && (
                      <Badge className="gap-1 bg-primary">
                        <Sparkles className="h-3 w-3" />
                        {t("common.promoted")}
                      </Badge>
                    )}
                    {listingType !== "replacement" && (
                      <Badge className={`border-0 ${TYPE_BADGE_STYLES[listingType]}`}>
                        {t(`listings.types.${listingType}`)}
                      </Badge>
                    )}
                    {listing.district && (
                      <Badge variant="secondary">{listing.district}</Badge>
                    )}
                  </div>
                  <h1 className="mt-2 text-2xl font-bold md:text-3xl">
                    {listing.title}
                  </h1>
                  <div className="mt-2 flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {listing.address}
                    {listing.district && `, ${listing.district}`}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="transition-transform hover:scale-105"
                    onClick={() => {
                      navigator.share?.({
                        title: listing.title,
                        url: window.location.href,
                      });
                    }}
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={saved ? "default" : "outline"}
                    size="icon"
                    className="transition-transform hover:scale-105"
                    onClick={() => setSaved(!saved)}
                  >
                    <Heart
                      className={`h-4 w-4 transition-all ${saved ? "fill-current scale-110" : ""}`}
                    />
                  </Button>
                </div>
              </motion.div>

              <motion.div
                custom={1}
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                className="mt-6 flex flex-wrap gap-6 rounded-lg border bg-card p-4"
              >
                {listing.bedrooms > 0 && (
                  <div className="flex items-center gap-2">
                    <Bed className="h-5 w-5 text-muted-foreground" />
                    <span>
                      <span className="font-semibold">{listing.bedrooms}</span>{" "}
                      {listing.bedrooms !== 1
                        ? t("listings.detail.bedrooms")
                        : t("listings.detail.bedroom")}
                    </span>
                  </div>
                )}
                {listing.bathrooms > 0 && (
                  <div className="flex items-center gap-2">
                    <Bath className="h-5 w-5 text-muted-foreground" />
                    <span>
                      <span className="font-semibold">
                        {listing.bathrooms}
                      </span>{" "}
                      {listing.bathrooms !== 1
                        ? t("listings.detail.bathrooms")
                        : t("listings.detail.bathroom")}
                    </span>
                  </div>
                )}
                {listing.area > 0 && (
                  <div className="flex items-center gap-2">
                    <Square className="h-5 w-5 text-muted-foreground" />
                    <span>
                      <span className="font-semibold">{listing.area}</span> m²
                    </span>
                  </div>
                )}
                {listing.floor > 0 && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <span>
                      {t("listings.detail.floor")}{" "}
                      <span className="font-semibold">{listing.floor}</span>
                      {listing.totalFloors > 0 && (
                        <>
                          {" "}
                          {t("listings.detail.floorOf")} {listing.totalFloors}
                        </>
                      )}
                    </span>
                  </div>
                )}
                {listingType === "roommate" && listing.roomType && (
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <span className="font-semibold">
                      {listing.roomType === "private"
                        ? t("listings.card.privateRoom")
                        : t("listings.card.sharedRoom")}
                    </span>
                  </div>
                )}
                {listingType === "roommate" && listing.currentRoommates != null && (
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <span>
                      <span className="font-semibold">{listing.currentRoommates}</span>{" "}
                      {t("listings.detail.roommatesLiving")}
                    </span>
                  </div>
                )}
                {listingType === "sublet" && listing.availableFrom && listing.availableTo ? (
                  <div className="flex items-center gap-2">
                    <CalendarRange className="h-5 w-5 text-muted-foreground" />
                    <span>
                      <span className="font-semibold">
                        {new Date(listing.availableFrom).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        {" – "}
                        {new Date(listing.availableTo).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      {listing.durationDays != null && (
                        <span className="text-muted-foreground">
                          {" "}({t("listings.detail.daysCount", { count: listing.durationDays })})
                        </span>
                      )}
                    </span>
                  </div>
                ) : listing.availableFrom ? (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <span>
                      {t("common.available")}{" "}
                      <span className="font-semibold">
                        {new Date(listing.availableFrom).toLocaleDateString(
                          "en-GB",
                          { day: "numeric", month: "long", year: "numeric" },
                        )}
                      </span>
                    </span>
                  </div>
                ) : null}
                {listingType === "sublet" && (
                  <>
                    {listing.utilitiesIncluded && (
                      <div className="flex items-center gap-2">
                        <ZapIcon className="h-5 w-5 text-green-500" />
                        <span className="text-sm font-medium">{t("listings.detail.utilitiesIncluded")}</span>
                      </div>
                    )}
                    {listing.internetIncluded && (
                      <div className="flex items-center gap-2">
                        <Wifi className="h-5 w-5 text-green-500" />
                        <span className="text-sm font-medium">{t("listings.detail.internetIncluded")}</span>
                      </div>
                    )}
                  </>
                )}
              </motion.div>

              {listing.description && (
                <motion.div
                  custom={2}
                  initial="hidden"
                  animate="visible"
                  variants={fadeUp}
                  className="mt-8"
                >
                  <h2 className="text-lg font-semibold">
                    {listingType === "roommate"
                      ? t("listings.detail.aboutRoom")
                      : listingType === "sublet"
                        ? t("listings.detail.aboutSublet")
                        : t("listings.detail.aboutApartment")}
                  </h2>
                  <p className="mt-3 leading-relaxed text-muted-foreground">
                    {listing.description}
                  </p>
                </motion.div>
              )}

              {listing.features.length > 0 && (
                <motion.div
                  custom={3}
                  initial="hidden"
                  animate="visible"
                  variants={fadeUp}
                  className="mt-8"
                >
                  <h2 className="text-lg font-semibold">
                    {t("listings.detail.featuresAmenities")}
                  </h2>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {listing.features.map((feature, i) => (
                      <motion.div
                        key={feature}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + i * 0.03 }}
                        className="flex items-center gap-2"
                      >
                        <CheckCircle className="h-4 w-4 text-primary" />
                        <span className="text-sm">{feature}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {listingType === "roommate" && (
                <motion.div
                  custom={3.5}
                  initial="hidden"
                  animate="visible"
                  variants={fadeUp}
                  className="mt-8"
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Users className="h-5 w-5" />
                        {t("listings.detail.roommateInfo")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {listing.currentRoommates != null && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t("listings.detail.currentRoommates")}</span>
                          <span className="font-medium">{listing.currentRoommates}</span>
                        </div>
                      )}
                      {listing.totalRooms != null && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t("listings.detail.totalRooms")}</span>
                          <span className="font-medium">{listing.totalRooms}</span>
                        </div>
                      )}
                      {listing.roomType && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t("listings.detail.roomType")}</span>
                          <span className="font-medium">
                            {listing.roomType === "private"
                              ? t("listings.card.privateRoom")
                              : t("listings.card.sharedRoom")}
                          </span>
                        </div>
                      )}
                      {listing.preferredGender && listing.preferredGender !== "any" && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t("listings.detail.preferredGender")}</span>
                          <span className="font-medium">{t(`listings.detail.gender_${listing.preferredGender}`)}</span>
                        </div>
                      )}
                      {(listing.preferredAgeMin != null || listing.preferredAgeMax != null) && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t("listings.detail.preferredAge")}</span>
                          <span className="font-medium">
                            {listing.preferredAgeMin ?? "—"} – {listing.preferredAgeMax ?? "—"}
                          </span>
                        </div>
                      )}
                      {listing.roommateDescription && (
                        <div className="mt-2 rounded-lg bg-muted/50 p-3">
                          <p className="text-sm text-muted-foreground">{listing.roommateDescription}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {listingType === "sublet" && (
                <motion.div
                  custom={3.5}
                  initial="hidden"
                  animate="visible"
                  variants={fadeUp}
                  className="mt-8"
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <CalendarRange className="h-5 w-5" />
                        {t("listings.detail.subletInfo")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {listing.availableFrom && listing.availableTo && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t("listings.detail.subletPeriod")}</span>
                          <span className="font-medium">
                            {new Date(listing.availableFrom).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            {" – "}
                            {new Date(listing.availableTo).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        </div>
                      )}
                      {listing.durationDays != null && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t("listings.detail.duration")}</span>
                          <span className="font-medium">{t("listings.detail.daysCount", { count: listing.durationDays })}</span>
                        </div>
                      )}
                      {listing.utilitiesIncluded != null && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <ZapIcon className="h-3.5 w-3.5" />
                            {t("listings.detail.utilitiesIncluded")}
                          </span>
                          <span className="font-medium">
                            {listing.utilitiesIncluded ? t("common.yes") : t("common.no")}
                          </span>
                        </div>
                      )}
                      {listing.internetIncluded != null && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <Wifi className="h-3.5 w-3.5" />
                            {t("listings.detail.internetIncluded")}
                          </span>
                          <span className="font-medium">
                            {listing.internetIncluded ? t("common.yes") : t("common.no")}
                          </span>
                        </div>
                      )}
                      {listing.subletRules && (
                        <div className="mt-2 rounded-lg bg-muted/50 p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-1">{t("listings.detail.houseRules")}</p>
                          <p className="text-sm">{listing.subletRules}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              <motion.div
                custom={4}
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                className="mt-8"
              >
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Building2 className="h-5 w-5" />
                      {t("listings.detail.buildingInfo")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4">
                      <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {t("listings.detail.buildingCostHint")}
                        </p>
                        <Button
                          variant="link"
                          className="mt-1 h-auto p-0 text-primary"
                          asChild
                        >
                          <Link
                            href={`/${listing.citySlug}/building/${listing.buildingSlug}`}
                          >
                            {t("listings.detail.viewBuildingCosts")}
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="lg:sticky lg:top-24 lg:self-start"
            >
              <Card className="overflow-hidden shadow-lg">
                <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent">
                  <CardTitle className="text-lg">
                    {listingType === "sublet"
                      ? t("listings.detail.subletCosts")
                      : listingType === "roommate"
                        ? t("listings.detail.costPerPerson")
                        : t("listings.detail.monthlyCosts")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {listingType === "sublet" ? (
                      <>
                        <div className="flex items-center justify-between bg-primary/5 px-6 py-4">
                          <span className="font-semibold">
                            {listing.durationDays
                              ? t("listings.card.forDays", { days: listing.durationDays })
                              : t("listings.detail.totalPrice")}
                          </span>
                          <span className="text-xl font-bold text-primary">
                            {(listing.priceTotal ?? listing.totalCost).toLocaleString()} PLN
                          </span>
                        </div>
                        {listing.durationDays && listing.priceTotal ? (
                          <div className="flex items-center justify-between px-6 py-3">
                            <span className="text-muted-foreground">
                              {t("listings.detail.perDay")}
                            </span>
                            <span className="font-medium">
                              ~{Math.round(listing.priceTotal / listing.durationDays).toLocaleString()} PLN
                            </span>
                          </div>
                        ) : null}
                        {listing.depositAmount ? (
                          <div className="flex items-center justify-between px-6 py-3">
                            <span className="text-muted-foreground">
                              {t("listings.detail.deposit")}
                            </span>
                            <span className="font-medium">
                              {listing.depositAmount.toLocaleString()} PLN
                            </span>
                          </div>
                        ) : null}
                      </>
                    ) : listingType === "roommate" ? (
                      <>
                        <div className="flex items-center justify-between px-6 py-3">
                          <span className="text-muted-foreground">
                            {t("listings.detail.pricePerPerson")}
                          </span>
                          <span className="font-medium">
                            {(listing.pricePerPerson ?? listing.totalCost).toLocaleString()} PLN
                          </span>
                        </div>
                        {listing.totalApartmentRent ? (
                          <div className="flex items-center justify-between px-6 py-3">
                            <span className="text-muted-foreground">
                              {t("listings.detail.totalApartmentRent")}
                            </span>
                            <span className="font-medium">
                              {listing.totalApartmentRent.toLocaleString()} PLN
                            </span>
                          </div>
                        ) : null}
                        {listing.depositAmount ? (
                          <div className="flex items-center justify-between px-6 py-3">
                            <span className="text-muted-foreground">
                              {t("listings.detail.deposit")}
                            </span>
                            <span className="font-medium">
                              {listing.depositAmount.toLocaleString()} PLN
                            </span>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between bg-primary/5 px-6 py-4">
                          <span className="font-semibold">
                            {t("listings.detail.yourShare")}
                          </span>
                          <span className="text-xl font-bold text-primary">
                            ~{(listing.pricePerPerson ?? listing.totalCost).toLocaleString()} PLN{t("common.perMonth")}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between px-6 py-3">
                          <span className="text-muted-foreground">
                            {t("common.rent")}
                          </span>
                          <span className="font-medium">
                            {listing.price.toLocaleString()} PLN
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-6 py-3">
                          <span className="text-muted-foreground">
                            {t("common.adminFee")}
                          </span>
                          <span className="font-medium">
                            {listing.adminFee.toLocaleString()} PLN
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-6 py-3">
                          <span className="text-muted-foreground">
                            {t("common.utilitiesAvg")}
                          </span>
                          <span className="font-medium">
                            ~{listing.utilities.toLocaleString()} PLN
                          </span>
                        </div>
                        <div className="flex items-center justify-between bg-primary/5 px-6 py-4">
                          <span className="font-semibold">
                            {t("common.totalMonthly")}
                          </span>
                          <span className="text-xl font-bold text-primary">
                            ~{listing.totalCost.toLocaleString()} PLN
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Button
                size="lg"
                className="mt-4 w-full transition-transform hover:scale-[1.02] active:scale-[0.98]"
                onClick={() => {
                  setInterestModalOpen(true);
                  posthog?.capture("interest_modal_opened", {
                    listing_id: listing.id,
                    type: listingType,
                  });
                }}
              >
                {listingType === "roommate"
                  ? t("listings.detail.imInterestedRoom")
                  : listingType === "sublet"
                    ? t("listings.detail.imInterestedSublet")
                    : t("listings.detail.imInterested")}
              </Button>

              <p className="mt-3 text-center text-xs text-muted-foreground">
                {listingType === "roommate"
                  ? t("listings.detail.contactHintRoommate")
                  : listingType === "sublet"
                    ? t("listings.detail.contactHintSublet")
                    : t("listings.detail.contactHint")}
              </p>
            </motion.div>
          </div>
        </div>
      </main>

      <Footer />

      <InterestModal
        open={interestModalOpen}
        onOpenChange={setInterestModalOpen}
        listingTitle={listing.title}
        listingId={listing.id}
        isLoggedIn={isLoggedIn}
      />
    </div>
  );
}
