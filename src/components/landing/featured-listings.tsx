'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { motion } from 'framer-motion';
import { ArrowUpRight, MapPin, Bed, Maximize2, Zap, Users, CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ListingType } from "@/lib/listings-data";

export interface FeaturedListingData {
  id: string;
  type?: ListingType;
  title: string;
  address: string;
  totalCost: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  image: string;
  promoted: boolean;
  availableFrom: string;
  // Roommate-specific
  pricePerPerson?: number;
  currentRoommates?: number;
  roomType?: 'private' | 'shared';
  // Sublet-specific
  availableTo?: string;
  priceTotal?: number;
  durationDays?: number;
}

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

const fallbackListings: FeaturedListingData[] = [
  {
    id: "1",
    type: "replacement",
    title: "Sunny Studio in Mokotow",
    address: "ul. Pulawska 45, Mokotow",
    totalCost: 3850,
    bedrooms: 1,
    bathrooms: 1,
    area: 35,
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&auto=format&fit=crop&q=60",
    promoted: true,
    availableFrom: "June 1, 2026",
  },
  {
    id: "2",
    type: "roommate",
    title: "Room in Shared Flat near Metro",
    address: "ul. Marszalkowska 120, Srodmiescie",
    totalCost: 6200,
    pricePerPerson: 2100,
    currentRoommates: 2,
    roomType: "private",
    bedrooms: 3,
    bathrooms: 1,
    area: 75,
    image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&auto=format&fit=crop&q=60",
    promoted: false,
    availableFrom: "July 15, 2026",
  },
  {
    id: "3",
    type: "sublet",
    title: "Cozy Flat in Praga — 30 day sublet",
    address: "ul. Targowa 78, Praga-Polnoc",
    totalCost: 3300,
    priceTotal: 3300,
    durationDays: 30,
    bedrooms: 1,
    bathrooms: 1,
    area: 40,
    image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&auto=format&fit=crop&q=60",
    promoted: false,
    availableFrom: "June 10, 2026",
    availableTo: "July 10, 2026",
  },
];

interface FeaturedListingsProps {
  listings?: FeaturedListingData[];
  citySlug?: string;
}

export function FeaturedListings({ listings, citySlug = 'warsaw' }: FeaturedListingsProps) {
  const t = useTranslations();
  const displayListings = listings && listings.length > 0 ? listings : fallbackListings;

  return (
    <section className="relative py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <h2 className="mb-2 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {t('landing.featured.title')}
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
            <p className="text-lg text-muted-foreground">
              {t('landing.featured.subtitle')}
            </p>
            <div className="flex shrink-0 items-center gap-3">
            {(["replacement", "roommate", "sublet"] as const).map((type) => (
              <Link
                key={type}
                href={`/${citySlug}/${type}`}
                className="group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-accent"
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    type === "replacement"
                      ? "bg-blue-500"
                      : type === "roommate"
                        ? "bg-violet-500"
                        : "bg-amber-500"
                  }`}
                />
                {t(`listings.types.${type}`)}
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            ))}
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {displayListings.map((listing, index) => (
            <motion.div
              key={listing.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <FeaturedCard listing={listing} citySlug={citySlug} t={t} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedCard({
  listing,
  citySlug,
  t,
}: {
  listing: FeaturedListingData;
  citySlug: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const listingType = listing.type ?? "replacement";
  const route = TYPE_ROUTE[listingType];

  const formatShort = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });

  const priceDisplay = () => {
    switch (listingType) {
      case "roommate": {
        const price = listing.pricePerPerson ?? listing.totalCost;
        return (
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">{price.toLocaleString()}</span>
            <span className="text-sm text-muted-foreground">
              PLN{t("listings.card.perPerson")}
            </span>
          </div>
        );
      }
      case "sublet": {
        const price = listing.priceTotal ?? listing.totalCost;
        return (
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">{price.toLocaleString()}</span>
            <span className="text-sm text-muted-foreground">
              PLN
              {listing.durationDays
                ? ` / ${listing.durationDays} ${t("listings.create.days")}`
                : t("common.perMonth")}
            </span>
          </div>
        );
      }
      default:
        return (
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">
              {listing.totalCost.toLocaleString()}
            </span>
            <span className="text-sm text-muted-foreground">
              PLN{t("common.perMonth")}
            </span>
          </div>
        );
    }
  };

  const dateDisplay = () => {
    if (listingType === "sublet" && listing.availableFrom && listing.availableTo) {
      return (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarRange className="h-3 w-3" />
          {formatShort(listing.availableFrom)} – {formatShort(listing.availableTo)}
        </p>
      );
    }
    return (
      <p className="text-xs text-muted-foreground">
        {t("landing.featured.from", { date: listing.availableFrom })}
      </p>
    );
  };

  return (
    <Link href={`/${citySlug}/${route}/${listing.id}`} className="group block">
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card transition-all duration-300 hover:border-accent/30 hover:shadow-xl hover:shadow-accent/5">
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={listing.image}
            alt={listing.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />

          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {listing.promoted && (
              <div className="flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
                <Zap className="h-3 w-3" />
                {t("common.promoted")}
              </div>
            )}
            <Badge className={`border-0 text-xs backdrop-blur-sm ${TYPE_BADGE_STYLES[listingType]}`}>
              {t(`listings.types.${listingType}`)}
            </Badge>
          </div>

          <div className="absolute bottom-3 left-3 right-3">
            {priceDisplay()}
          </div>
        </div>

        <div className="p-4">
          <h3 className="mb-1 line-clamp-1 text-base font-semibold transition-colors group-hover:text-accent">
            {listing.title}
          </h3>

          <div className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {listing.address}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Bed className="h-3.5 w-3.5" />
                {listing.bedrooms}
              </span>
              <span className="flex items-center gap-1">
                <Maximize2 className="h-3.5 w-3.5" />
                {listing.area}m²
              </span>
              {listingType === "roommate" && listing.currentRoommates != null && (
                <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
                  <Users className="h-3.5 w-3.5" />
                  {listing.currentRoommates}
                </span>
              )}
            </div>
            {dateDisplay()}
          </div>
        </div>
      </div>
    </Link>
  );
}
