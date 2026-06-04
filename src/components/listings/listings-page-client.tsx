'use client';

import { useState, useMemo, useCallback, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ListingFiltersDesktop,
  ListingFiltersMobile,
  ActiveFilters,
} from '@/components/listings/listing-filters';
import { ListingGrid } from '@/components/listings/listing-card';
import { ListingsPageSkeleton } from '@/components/listings/listings-page-skeleton';
import { MapSkeleton } from '@/components/map/map-skeleton';

// Mapbox GL + react-map-gl is a large, WebGL-only dependency. Code-split it so
// it loads as its own chunk after hydration instead of bloating the listings
// page's initial JS. ssr:false because the map needs `window`.
const ListingsMap = dynamic(
  () => import('@/components/listings/listings-map').then((m) => m.ListingsMap),
  {
    ssr: false,
    loading: () => <MapSkeleton className="rounded-none border-0" />,
  },
);
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Map, List } from 'lucide-react';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useFavorites } from '@/hooks/use-favorites';
import type { Listing, ListingType, CityBounds, MapBounds } from '@/lib/listings-data';

type SortOption = 'newest' | 'price-asc' | 'price-desc' | 'area-desc';

interface Props {
  listings: Listing[];
  districts: { slug: string; name: string }[];
  citySlug: string;
  cityBounds?: CityBounds;
  listingType: ListingType;
  isLoggedIn?: boolean;
}

export function ListingsPageClient(props: Props) {
  return (
    <Suspense fallback={<ListingsPageSkeleton />}>
      <ListingsPageInner {...props} />
    </Suspense>
  );
}

function ListingsPageInner({
  listings,
  districts,
  citySlug,
  cityBounds,
  listingType,
  isLoggedIn = false,
}: Props) {
  const t = useTranslations();
  const posthog = usePostHog();
  const { filters, setFilters, sortBy, setSortBy } = useUrlFilters();
  const { isFavorite, toggleFavorite } = useFavorites(isLoggedIn);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const searchTrackedRef = useRef(false);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const handleFiltersChange = useCallback(
    (newFilters: typeof filters) => {
      setFilters(newFilters);

      const activeFilters: string[] = [];
      if (newFilters.priceMin || newFilters.priceMax) activeFilters.push('price');
      if (newFilters.bedrooms?.length) activeFilters.push('rooms');
      if (newFilters.districts?.length) activeFilters.push('district');
      if (newFilters.availableFrom) activeFilters.push('availableFrom');
      if (newFilters.availableTo) activeFilters.push('availableTo');
      if (newFilters.areaMin || newFilters.areaMax) activeFilters.push('area');
      if (newFilters.amenities?.length) activeFilters.push('amenities');
      if (newFilters.roomType) activeFilters.push('roomType');
      if (newFilters.preferredGender) activeFilters.push('preferredGender');
      if (newFilters.registrationPossible) activeFilters.push('registration');

      if (activeFilters.length > 0) {
        posthog?.capture('search_performed', {
          type: listingType,
          city: citySlug,
          filters_used: activeFilters,
          results_count: listings.length,
        });
      }
    },
    [setFilters, posthog, listingType, citySlug, listings.length],
  );

  const districtNames = useMemo(() => districts.map((d) => d.name), [districts]);

  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      if (filters.priceMin && listing.totalCost < filters.priceMin) return false;
      if (filters.priceMax && listing.totalCost > filters.priceMax) return false;
      if (filters.bedrooms?.length && !filters.bedrooms.some((b) => listing.bedrooms >= b))
        return false;
      if (filters.districts?.length && !filters.districts.includes(listing.district)) return false;
      if (filters.areaMin && listing.area < filters.areaMin) return false;
      if (filters.areaMax && listing.area > filters.areaMax) return false;
      if (filters.availableFrom) {
        const filterDate = new Date(filters.availableFrom);
        const listingDate = new Date(listing.availableFrom);
        if (listingDate > filterDate) return false;
      }
      if (
        filters.amenities?.length &&
        !filters.amenities.every((a) => listing.features.includes(a))
      )
        return false;
      if (filters.roomType && listing.roomType !== filters.roomType) return false;
      if (
        filters.preferredGender &&
        filters.preferredGender !== 'any' &&
        listing.preferredGender !== filters.preferredGender &&
        listing.preferredGender !== 'any'
      )
        return false;
      if (filters.availableTo) {
        const filterDate = new Date(filters.availableTo);
        if (!listing.availableTo) return false;
        const listingDate = new Date(listing.availableTo);
        if (listingDate < filterDate) return false;
      }
      if (filters.utilitiesIncluded && !listing.utilitiesIncluded) return false;
      if (filters.internetIncluded && !listing.internetIncluded) return false;
      if (filters.floorMin != null && listing.floor < filters.floorMin) return false;
      if (filters.floorMax != null && listing.floor > filters.floorMax) return false;
      if (filters.hasPhotos && listing.photoCount === 0) return false;
      if (filters.registrationPossible && !listing.registrationPossible) return false;
      return true;
    });
  }, [listings, filters]);

  const sortedListings = useMemo(() => {
    const sorted = [...filteredListings];
    switch (sortBy) {
      case 'price-asc':
        return sorted.sort((a, b) => a.totalCost - b.totalCost);
      case 'price-desc':
        return sorted.sort((a, b) => b.totalCost - a.totalCost);
      case 'area-desc':
        return sorted.sort((a, b) => b.area - a.area);
      case 'newest':
      default:
        return sorted.sort((a, b) => {
          if (a.promoted && !b.promoted) return -1;
          if (!a.promoted && b.promoted) return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }
  }, [filteredListings, sortBy]);

  const visibleListings = useMemo(() => {
    if (!mapBounds) return sortedListings;
    return sortedListings.filter(
      (l) =>
        l.lat >= mapBounds.south &&
        l.lat <= mapBounds.north &&
        l.lng >= mapBounds.west &&
        l.lng <= mapBounds.east,
    );
  }, [sortedListings, mapBounds]);

  const handleBoundsChange = useCallback((b: MapBounds) => {
    setMapBounds(b);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden pt-24">
      <div className="flex min-h-0 flex-1">
        <ListingFiltersDesktop
          filters={filters}
          onFiltersChange={handleFiltersChange}
          districts={districtNames}
          citySlug={citySlug}
          listingType={listingType}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="border-b bg-card px-4 py-3"
          >
            <p className="mb-2 text-sm text-muted-foreground">
              {t.rich('listings.listingsInCity', {
                count: visibleListings.length,
                b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
              })}
            </p>
            <div className="flex items-center justify-between">
              <ListingFiltersMobile
                filters={filters}
                onFiltersChange={handleFiltersChange}
                districts={districtNames}
                citySlug={citySlug}
                listingType={listingType}
                resultCount={filteredListings.length}
              />

              <div className="flex items-center gap-2">
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-[140px] sm:w-[180px]">
                    <SelectValue placeholder={t('listings.sort.sortBy')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">{t('listings.sort.newest')}</SelectItem>
                    <SelectItem value="price-asc">{t('listings.sort.priceAsc')}</SelectItem>
                    <SelectItem value="price-desc">{t('listings.sort.priceDesc')}</SelectItem>
                    <SelectItem value="area-desc">{t('listings.sort.largestFirst')}</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="icon"
                  className="xl:hidden"
                  onClick={() => setShowMap(!showMap)}
                >
                  {showMap ? <List className="h-4 w-4" /> : <Map className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </motion.div>

          <div className="border-b bg-card px-4 py-2">
            <ActiveFilters
              filters={filters}
              onFiltersChange={handleFiltersChange}
              listingType={listingType}
            />
          </div>

          <div className="flex min-h-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={showMap ? 'list-compact' : 'list-full'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex-1 overflow-y-auto p-4 ${
                  showMap ? 'hidden xl:block xl:max-w-xl' : ''
                }`}
              >
                <ListingGrid
                  listings={visibleListings}
                  citySlug={citySlug}
                  hoveredId={hoveredId}
                  onHover={setHoveredId}
                  isFavorite={isFavorite}
                  onToggleFavorite={toggleFavorite}
                />
              </motion.div>
            </AnimatePresence>

            <div className={`relative flex-1 border-l ${showMap ? '' : 'hidden xl:block'}`}>
              <div className="absolute inset-0">
                <ListingsMap
                  listings={sortedListings}
                  hoveredId={hoveredId}
                  onHover={setHoveredId}
                  bounds={cityBounds}
                  onBoundsChange={handleBoundsChange}
                  citySlug={citySlug}
                  listingType={listingType}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
