"use client";

import { Link } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Bed, Bath, Square, Zap, Users, CalendarRange } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import type { Listing, ListingType } from "@/lib/listings-data";

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

interface ListingCardProps {
  listing: Listing;
  citySlug: string;
  isHovered?: boolean;
  onHover?: (id: string | null) => void;
}

export function ListingCard({ listing, citySlug, isHovered, onHover }: ListingCardProps) {
  const t = useTranslations();
  const listingType = listing.type ?? "replacement";
  const route = TYPE_ROUTE[listingType];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Link
        href={`/${citySlug}/${route}/${listing.id}`}
        onMouseEnter={() => onHover?.(listing.id)}
        onMouseLeave={() => onHover?.(null)}
      >
        <Card
          className={`group overflow-hidden transition-all duration-300 ${
            isHovered
              ? "ring-2 ring-primary shadow-lg shadow-primary/10 scale-[1.01]"
              : "hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20"
          }`}
        >
          <div className="flex flex-col sm:flex-row">
            <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden sm:aspect-[4/3] sm:w-48">
              <img
                src={listing.images[0]}
                alt={listing.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

              <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
                {listing.promoted && (
                  <Badge className="gap-1 border-0 bg-primary/90 text-xs backdrop-blur-sm">
                    <Zap className="h-3 w-3" />
                    {t("common.promoted")}
                  </Badge>
                )}
                {listingType !== "replacement" && (
                  <Badge className={`border-0 text-xs backdrop-blur-sm ${TYPE_BADGE_STYLES[listingType]}`}>
                    {t(`listings.types.${listingType}`)}
                  </Badge>
                )}
              </div>
            </div>

            <CardContent className="flex flex-1 flex-col p-4 sm:p-5">
              <div className="flex-1">
                <h3 className="font-semibold leading-tight transition-colors duration-200 group-hover:text-primary">
                  {listing.title}
                </h3>

                <div className="mt-1.5 flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/60" />
                  <span className="truncate">
                    {listing.address}, {listing.district}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-0.5">
                    <Bed className="h-3.5 w-3.5" />
                    {listing.bedrooms}
                  </span>
                  <span className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-0.5">
                    <Bath className="h-3.5 w-3.5" />
                    {listing.bathrooms}
                  </span>
                  <span className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-0.5">
                    <Square className="h-3.5 w-3.5" />
                    {listing.area}m²
                  </span>
                  {listingType === "roommate" && listing.currentRoommates != null && (
                    <span className="flex items-center gap-1.5 rounded-md bg-violet-500/10 px-2 py-0.5 text-violet-700 dark:text-violet-300">
                      <Users className="h-3.5 w-3.5" />
                      {t("listings.card.roommatesCount", { count: listing.currentRoommates })}
                      {listing.roomType && (
                        <span className="text-xs">
                          · {listing.roomType === "private"
                            ? t("listings.card.privateRoom")
                            : t("listings.card.sharedRoom")}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between border-t border-border/50 pt-3">
                <ListingPrice listing={listing} type={listingType} t={t} />
                <ListingDateInfo listing={listing} type={listingType} t={t} />
              </div>
            </CardContent>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}

function ListingPrice({
  listing,
  type,
  t,
}: {
  listing: Listing;
  type: ListingType;
  t: ReturnType<typeof useTranslations>;
}) {
  switch (type) {
    case "roommate": {
      const price = listing.pricePerPerson ?? listing.totalCost;
      return (
        <div>
          <p className="text-xs text-muted-foreground">
            {t("listings.card.totalMonthly")}
          </p>
          <p className="text-lg font-bold text-primary">
            {price.toLocaleString()} PLN
            <span className="text-sm font-normal text-muted-foreground">
              {t("listings.card.perPerson")}
            </span>
          </p>
        </div>
      );
    }
    case "sublet": {
      const price = listing.priceTotal ?? listing.totalCost;
      const days = listing.durationDays;
      return (
        <div>
          <p className="text-xs text-muted-foreground">
            {days
              ? t("listings.card.forDays", { days })
              : t("listings.card.totalMonthly")}
          </p>
          <p className="text-lg font-bold text-primary">
            {price.toLocaleString()} PLN
          </p>
        </div>
      );
    }
    default:
      return (
        <div>
          <p className="text-xs text-muted-foreground">
            {t("listings.card.totalMonthly")}
          </p>
          <p className="text-lg font-bold text-primary">
            {listing.totalCost.toLocaleString()} PLN
          </p>
        </div>
      );
  }
}

function ListingDateInfo({
  listing,
  type,
  t,
}: {
  listing: Listing;
  type: ListingType;
  t: ReturnType<typeof useTranslations>;
}) {
  const formatShort = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });

  if (type === "sublet" && listing.availableFrom && listing.availableTo) {
    return (
      <div className="text-right">
        <p className="text-xs text-muted-foreground">
          <CalendarRange className="mr-0.5 inline h-3 w-3" />
          {t("listings.card.available")}
        </p>
        <p className="text-sm font-medium">
          {formatShort(listing.availableFrom)} – {formatShort(listing.availableTo)}
        </p>
      </div>
    );
  }

  return (
    <div className="text-right">
      <p className="text-xs text-muted-foreground">{t("listings.card.available")}</p>
      <p className="text-sm font-medium">{formatShort(listing.availableFrom)}</p>
    </div>
  );
}

interface ListingGridProps {
  listings: Listing[];
  citySlug: string;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
}

export function ListingGrid({ listings, citySlug, hoveredId, onHover }: ListingGridProps) {
  const t = useTranslations();
  if (listings.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <div className="mb-4 rounded-full bg-muted/50 p-4">
          <MapPin className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">{t('listings.empty')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('listings.emptyDesc')}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      {listings.map((listing, index) => (
        <motion.div
          key={listing.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.05 }}
        >
          <ListingCard
            listing={listing}
            citySlug={citySlug}
            isHovered={hoveredId === listing.id}
            onHover={onHover}
          />
        </motion.div>
      ))}
    </div>
  );
}
