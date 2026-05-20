"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/landing/header";
import {
  ListingFiltersDesktop,
  ListingFiltersMobile,
  ActiveFilters,
} from "@/components/listings/listing-filters";
import { ListingGrid } from "@/components/listings/listing-card";
import { ListingsMap } from "@/components/listings/listings-map";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Map, List } from "lucide-react";
import type { Listing, ListingFilters, ListingType, CityBounds } from "@/lib/listings-data";

type SortOption = "newest" | "price-asc" | "price-desc" | "area-desc";

interface Props {
  listings: Listing[];
  districts: { slug: string; name: string }[];
  citySlug: string;
  cityBounds?: CityBounds;
  listingType: ListingType;
}

export function ListingsPageClient({
  listings,
  districts,
  citySlug,
  cityBounds,
  listingType,
}: Props) {
  const t = useTranslations();
  const [filters, setFilters] = useState<ListingFilters>({ type: listingType });
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);

  const districtNames = useMemo(() => districts.map((d) => d.name), [districts]);

  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      if (filters.type && listing.type !== filters.type) return false;
      if (filters.priceMin && listing.totalCost < filters.priceMin) return false;
      if (filters.priceMax && listing.totalCost > filters.priceMax) return false;
      if (
        filters.bedrooms?.length &&
        !filters.bedrooms.some((b) => listing.bedrooms >= b)
      )
        return false;
      if (
        filters.districts?.length &&
        !filters.districts.includes(listing.district)
      )
        return false;
      if (filters.areaMin && listing.area < filters.areaMin) return false;
      if (filters.areaMax && listing.area > filters.areaMax) return false;
      return true;
    });
  }, [listings, filters]);

  const sortedListings = useMemo(() => {
    const sorted = [...filteredListings];
    switch (sortBy) {
      case "price-asc":
        return sorted.sort((a, b) => a.totalCost - b.totalCost);
      case "price-desc":
        return sorted.sort((a, b) => b.totalCost - a.totalCost);
      case "area-desc":
        return sorted.sort((a, b) => b.area - a.area);
      case "newest":
      default:
        return sorted.sort((a, b) => {
          if (a.promoted && !b.promoted) return -1;
          if (!a.promoted && b.promoted) return 1;
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
    }
  }, [filteredListings, sortBy]);

  return (
    <div className="flex h-screen flex-col overflow-hidden pt-20">
      <Header />

      <div className="flex min-h-0 flex-1">
        <ListingFiltersDesktop filters={filters} onFiltersChange={setFilters} districts={districtNames} />

        <div className="flex min-h-0 flex-1 flex-col">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-between border-b bg-card px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <ListingFiltersMobile
                filters={filters}
                onFiltersChange={setFilters}
                districts={districtNames}
              />
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {sortedListings.length}
                </span>{" "}
                {t("listings.listingsInCity", { count: sortedListings.length })}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={sortBy}
                onValueChange={(v) => setSortBy(v as SortOption)}
              >
                <SelectTrigger className="w-[140px] sm:w-[180px]">
                  <SelectValue placeholder={t("listings.sort.sortBy")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">
                    {t("listings.sort.newest")}
                  </SelectItem>
                  <SelectItem value="price-asc">
                    {t("listings.sort.priceAsc")}
                  </SelectItem>
                  <SelectItem value="price-desc">
                    {t("listings.sort.priceDesc")}
                  </SelectItem>
                  <SelectItem value="area-desc">
                    {t("listings.sort.largestFirst")}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                className="lg:hidden"
                onClick={() => setShowMap(!showMap)}
              >
                {showMap ? (
                  <List className="h-4 w-4" />
                ) : (
                  <Map className="h-4 w-4" />
                )}
              </Button>
            </div>
          </motion.div>

          <div className="border-b bg-card px-4 py-2">
            <ActiveFilters filters={filters} onFiltersChange={setFilters} />
          </div>

          <div className="flex min-h-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={showMap ? "list-compact" : "list-full"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex-1 overflow-y-auto p-4 ${
                  showMap ? "hidden lg:block lg:max-w-xl" : ""
                }`}
              >
                <ListingGrid
                  listings={sortedListings}
                  citySlug={citySlug}
                  hoveredId={hoveredId}
                  onHover={setHoveredId}
                />
              </motion.div>
            </AnimatePresence>

            <div
              className={`relative flex-1 border-l ${showMap ? "" : "hidden lg:block"}`}
            >
              <div className="absolute inset-0">
                <ListingsMap
                  listings={sortedListings}
                  hoveredId={hoveredId}
                  onHover={setHoveredId}
                  bounds={cityBounds}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
