'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { Link } from '@/i18n/navigation';
import { motion } from 'framer-motion';
import { useReveal } from '@/hooks/use-reveal';
import {
  ArrowUpRight,
  MapPin,
  Bed,
  Maximize2,
  Zap,
  Users,
  CalendarRange,
  Plus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import type { ListingType } from '@/lib/listings-data';

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
  replacement: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  roommate: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  sublet: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
};

const TYPE_ROUTE: Record<ListingType, string> = {
  replacement: 'replacement',
  roommate: 'roommate',
  sublet: 'sublet',
};

interface FeaturedListingsProps {
  listings?: FeaturedListingData[];
  citySlug?: string;
}

export function FeaturedListings({ listings, citySlug = 'warsaw' }: FeaturedListingsProps) {
  const t = useTranslations();
  const reveal = useReveal();
  const promotedListingsEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PROMOTED_LISTINGS_ENABLED);

  if (!promotedListingsEnabled) return null;
  if (!listings || listings.length < 3) return null;

  const hasRealListings = true;

  return (
    <section className="relative py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div {...reveal({ opacity: 0, y: 20 })} className="mb-12">
          <h2 className="mb-2 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {t('landing.featured.title')}
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
            <p className="text-lg text-muted-foreground">{t('landing.featured.subtitle')}</p>
            <div className="flex shrink-0 items-center gap-3">
              {(['replacement', 'roommate', 'sublet'] as const).map((type) => (
                <Link
                  key={type}
                  href={`/${citySlug}/${type}`}
                  className="group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-accent"
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      type === 'replacement'
                        ? 'bg-blue-500'
                        : type === 'roommate'
                          ? 'bg-violet-500'
                          : 'bg-amber-500'
                    }`}
                  />
                  {t(`listings.types.${type}`)}
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </div>
        </motion.div>

        {hasRealListings ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {listings.map((listing, index) => (
              <motion.div
                key={listing.id}
                {...reveal({ opacity: 0, y: 20 }, { delay: index * 0.1 })}
              >
                <FeaturedCard listing={listing} citySlug={citySlug} t={t} />
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div
            {...reveal({ opacity: 0, y: 20 })}
            className="mx-auto max-w-md rounded-2xl border border-dashed border-border/80 bg-card/30 p-10 text-center"
          >
            <p className="mb-1 text-lg font-medium">{t('landing.featured.comingSoonTitle')}</p>
            <p className="mb-5 text-sm text-muted-foreground">
              {t('landing.featured.comingSoonDesc')}
            </p>
            <Link
              href="/create-listing"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              {t('landing.featured.postCta')}
            </Link>
          </motion.div>
        )}
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
  const listingType = listing.type ?? 'replacement';
  const route = TYPE_ROUTE[listingType];
  const format = useFormatter();

  const formatShort = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });

  const priceDisplay = () => {
    switch (listingType) {
      case 'roommate': {
        const price = listing.pricePerPerson ?? listing.totalCost;
        return (
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">{format.number(price)}</span>
            <span className="text-sm text-muted-foreground">PLN{t('listings.card.perPerson')}</span>
          </div>
        );
      }
      case 'sublet': {
        const price = listing.priceTotal ?? listing.totalCost;
        return (
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">{format.number(price)}</span>
            <span className="text-sm text-muted-foreground">
              PLN
              {listing.durationDays
                ? ` / ${listing.durationDays} ${t('listings.create.days')}`
                : t('common.perMonth')}
            </span>
          </div>
        );
      }
      default:
        return (
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">{format.number(listing.totalCost)}</span>
            <span className="text-sm text-muted-foreground">PLN{t('common.perMonth')}</span>
          </div>
        );
    }
  };

  const dateDisplay = () => {
    if (listingType === 'sublet' && listing.availableFrom && listing.availableTo) {
      return (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarRange className="h-3 w-3" />
          {formatShort(listing.availableFrom)} – {formatShort(listing.availableTo)}
        </p>
      );
    }
    return (
      <p className="text-xs text-muted-foreground">
        {t('landing.featured.from', { date: listing.availableFrom })}
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
              <div className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/15 px-2.5 py-1.5 text-xs font-medium text-accent">
                <Zap className="h-3 w-3" />
                {t('common.promoted')}
              </div>
            )}
            <Badge
              className={`rounded-full border-0 py-1.5 text-xs backdrop-blur-md ${TYPE_BADGE_STYLES[listingType]}`}
            >
              {t(`listings.types.${listingType}`)}
            </Badge>
          </div>

          <div className="absolute bottom-3 left-3 right-3">{priceDisplay()}</div>
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
              {listingType === 'roommate' && listing.currentRoommates != null && (
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
