"use client";

import { useState, useCallback, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MapPin, Bed, Bath, Maximize2, Zap, Users, CalendarRange,
  ChevronLeft, ChevronRight, Image as ImageIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import useEmblaCarousel from "embla-carousel-react";
import { FavoriteButton } from "@/components/listings/favorite-button";
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

function CardCarousel({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, dragFree: false });
  const [currentIndex, setCurrentIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCurrentIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    onSelect();
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      emblaApi?.scrollPrev();
    },
    [emblaApi],
  );

  const scrollNext = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      emblaApi?.scrollNext();
    },
    [emblaApi],
  );

  if (!images.length) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/50">
        <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
      </div>
    );
  }

  if (images.length === 1) {
    return (
      <>
        <img
          src={images[0]}
          alt={alt}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </>
    );
  }

  return (
    <>
      <div ref={emblaRef} className="h-full overflow-hidden">
        <div className="flex h-full">
          {images.map((src, i) => (
            <div key={i} className="h-full min-w-0 shrink-0 grow-0 basis-full">
              <img
                src={src}
                alt={`${alt} ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <button
        onClick={scrollPrev}
        className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow-sm backdrop-blur-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/95"
        aria-label="Previous photo"
      >
        <ChevronLeft className="h-4 w-4 text-gray-800" />
      </button>
      <button
        onClick={scrollNext}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow-sm backdrop-blur-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/95"
        aria-label="Next photo"
      >
        <ChevronRight className="h-4 w-4 text-gray-800" />
      </button>

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
        {images.slice(0, 5).map((_, i) => (
          <span
            key={i}
            className={`block h-1.5 w-1.5 rounded-full transition-colors ${
              i === currentIndex ? "bg-white" : "bg-white/50"
            }`}
          />
        ))}
        {images.length > 5 && (
          <span className="block h-1.5 w-1.5 rounded-full bg-white/30" />
        )}
      </div>
    </>
  );
}

interface ListingCardProps {
  listing: Listing;
  citySlug: string;
  isHovered?: boolean;
  onHover?: (id: string | null) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
}

export function ListingCard({ listing, citySlug, isHovered, onHover, isFavorite, onToggleFavorite }: ListingCardProps) {
  const t = useTranslations();
  const listingType = listing.type ?? "replacement";
  const route = TYPE_ROUTE[listingType];

  const highlights: { key: string; label: string; green?: boolean }[] = [];
  if (listing.registrationPossible)
    highlights.push({ key: "reg", label: t("listings.registrationPossible"), green: true });
  if (listing.petsAllowed)
    highlights.push({ key: "pets", label: t("listings.thingsToKnow.petsAllowed") });
  if (listing.features.includes("ac"))
    highlights.push({ key: "ac", label: t("listings.features.ac") });
  if (listing.furnished)
    highlights.push({ key: "furnished", label: t("listings.features.furnished") });
  if (listing.features.includes("balcony"))
    highlights.push({ key: "balcony", label: t("listings.features.balcony") });
  if (listing.features.includes("wifi"))
    highlights.push({ key: "wifi", label: t("listings.features.wifi") });
  const topHighlights = highlights.slice(0, 3);

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
        <div className="rounded-2xl bg-gradient-to-br from-primary/20 via-border/50 to-primary/10 p-[1px]">
        <Card
          className={`group overflow-hidden rounded-2xl border-0 py-0 gap-0 transition-all duration-300 ${
            isHovered
              ? "ring-2 ring-primary shadow-lg shadow-primary/10 scale-[1.01]"
              : "hover:shadow-lg hover:shadow-primary/5"
          }`}
        >
          <div className="flex flex-col sm:flex-row">
            <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-t-2xl bg-muted/30 sm:aspect-auto sm:min-h-36 sm:w-48 sm:rounded-l-2xl sm:rounded-tr-none">
              <CardCarousel images={listing.images} alt={listing.title} />

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

              {listing.photoCount > 1 && (
                <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-xs text-white backdrop-blur-sm">
                  <ImageIcon className="h-3 w-3" />
                  {listing.photoCount}
                </div>
              )}

              {onToggleFavorite && (
                <div className="absolute right-2.5 top-2.5">
                  <FavoriteButton
                    isFavorite={!!isFavorite}
                    onToggle={() => onToggleFavorite(listing.id)}
                    size="sm"
                    className="bg-white/80 backdrop-blur-sm hover:bg-white/90 border-0 shadow-sm"
                  />
                </div>
              )}
            </div>

            <CardContent className="flex flex-1 flex-col p-5 sm:px-7 sm:py-6">
              <div className="flex-1">
                <h3 className="line-clamp-1 font-semibold leading-tight transition-colors duration-200 group-hover:text-primary">
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
                    <Maximize2 className="h-3.5 w-3.5" />
                    {listing.area}m²
                  </span>
                  {listing.floor > 0 && (
                    <span className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-0.5">
                      {listing.floor} {t("listings.card.floorShort")}
                    </span>
                  )}
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

                <div className="mt-2 flex h-9 flex-wrap items-center gap-1.5">
                  {topHighlights.map((h) => (
                    <span
                      key={h.key}
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        h.green
                          ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {h.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between border-t border-border/50 pt-3">
                <ListingPrice listing={listing} type={listingType} t={t} />
                <ListingDateInfo listing={listing} type={listingType} t={t} />
              </div>
            </CardContent>
          </div>
        </Card>
        </div>
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
  isFavorite?: (id: string) => boolean;
  onToggleFavorite?: (id: string) => void;
}

export function ListingGrid({ listings, citySlug, hoveredId, onHover, isFavorite, onToggleFavorite }: ListingGridProps) {
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
            isFavorite={isFavorite?.(listing.id)}
            onToggleFavorite={onToggleFavorite}
          />
        </motion.div>
      ))}
    </div>
  );
}
