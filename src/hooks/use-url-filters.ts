"use client";

import { useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { ListingFilters } from "@/lib/listings-data";

type SortOption = "newest" | "price-asc" | "price-desc" | "area-desc";

const SORT_OPTIONS = new Set<string>(["newest", "price-asc", "price-desc", "area-desc"]);

function parseFiltersFromParams(
  params: URLSearchParams,
): ListingFilters {
  const filters: ListingFilters = {};

  const priceMin = params.get("priceMin");
  if (priceMin) filters.priceMin = Number(priceMin);

  const priceMax = params.get("priceMax");
  if (priceMax) filters.priceMax = Number(priceMax);

  const bedrooms = params.get("bedrooms");
  if (bedrooms) {
    const parsed = bedrooms.split(",").map(Number).filter((n) => !isNaN(n) && n > 0);
    if (parsed.length) filters.bedrooms = parsed;
  }

  const districts = params.get("districts");
  if (districts) {
    const parsed = districts.split(",").filter(Boolean);
    if (parsed.length) filters.districts = parsed;
  }

  const areaMin = params.get("areaMin");
  if (areaMin) filters.areaMin = Number(areaMin);

  const areaMax = params.get("areaMax");
  if (areaMax) filters.areaMax = Number(areaMax);

  const availableFrom = params.get("availableFrom");
  if (availableFrom) filters.availableFrom = availableFrom;

  const availableTo = params.get("availableTo");
  if (availableTo) filters.availableTo = availableTo;

  const amenities = params.get("amenities");
  if (amenities) {
    const parsed = amenities.split(",").filter(Boolean);
    if (parsed.length) filters.amenities = parsed;
  }

  const floorMin = params.get("floorMin");
  if (floorMin) filters.floorMin = Number(floorMin);

  const floorMax = params.get("floorMax");
  if (floorMax) filters.floorMax = Number(floorMax);

  const roomType = params.get("roomType");
  if (roomType === "private" || roomType === "shared") filters.roomType = roomType;

  const preferredGender = params.get("preferredGender");
  if (preferredGender === "any" || preferredGender === "male" || preferredGender === "female")
    filters.preferredGender = preferredGender;

  if (params.get("utilitiesIncluded") === "1") filters.utilitiesIncluded = true;
  if (params.get("internetIncluded") === "1") filters.internetIncluded = true;
  if (params.get("hasPhotos") === "1") filters.hasPhotos = true;
  if (params.get("registration") === "1") filters.registrationPossible = true;

  return filters;
}

function filtersToParams(
  filters: ListingFilters,
  sortBy: SortOption,
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.priceMin != null) params.set("priceMin", String(filters.priceMin));
  if (filters.priceMax != null) params.set("priceMax", String(filters.priceMax));

  if (filters.bedrooms?.length) params.set("bedrooms", filters.bedrooms.join(","));
  if (filters.districts?.length) params.set("districts", filters.districts.join(","));

  if (filters.areaMin != null) params.set("areaMin", String(filters.areaMin));
  if (filters.areaMax != null) params.set("areaMax", String(filters.areaMax));

  if (filters.availableFrom) params.set("availableFrom", filters.availableFrom);
  if (filters.availableTo) params.set("availableTo", filters.availableTo);

  if (filters.amenities?.length) params.set("amenities", filters.amenities.join(","));

  if (filters.floorMin != null) params.set("floorMin", String(filters.floorMin));
  if (filters.floorMax != null) params.set("floorMax", String(filters.floorMax));

  if (filters.roomType) params.set("roomType", filters.roomType);
  if (filters.preferredGender) params.set("preferredGender", filters.preferredGender);

  if (filters.utilitiesIncluded) params.set("utilitiesIncluded", "1");
  if (filters.internetIncluded) params.set("internetIncluded", "1");
  if (filters.hasPhotos) params.set("hasPhotos", "1");
  if (filters.registrationPossible) params.set("registration", "1");

  if (sortBy !== "newest") params.set("sort", sortBy);

  return params;
}

function pushUrl(params: URLSearchParams) {
  const search = params.toString();
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
  window.history.replaceState(null, "", url);
}

export function useUrlFilters() {
  const searchParams = useSearchParams();

  const [filters, setFiltersInternal] = useState<ListingFilters>(() =>
    parseFiltersFromParams(searchParams),
  );
  const [sortBy, setSortByInternal] = useState<SortOption>(() => {
    const s = searchParams.get("sort");
    return s && SORT_OPTIONS.has(s) ? (s as SortOption) : "newest";
  });

  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const sortRef = useRef(sortBy);
  sortRef.current = sortBy;

  const setFilters = useCallback(
    (next: ListingFilters) => {
      setFiltersInternal(next);
      pushUrl(filtersToParams(next, sortRef.current));
    },
    [],
  );

  const setSortBy = useCallback(
    (next: SortOption) => {
      setSortByInternal(next);
      pushUrl(filtersToParams(filtersRef.current, next));
    },
    [],
  );

  return { filters, setFilters, sortBy, setSortBy } as const;
}
