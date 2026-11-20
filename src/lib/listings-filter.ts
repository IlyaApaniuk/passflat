import type { Listing, ListingFilters } from '@/lib/listings-data';

/**
 * The client-side filters of the listings page (roommate, sublet, replacement).
 * Pure so the visible list and `search_performed.results_count` count the same
 * listings. Map bounds are not a filter here.
 */
export function filterListings(listings: Listing[], filters: ListingFilters): Listing[] {
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
    if (filters.amenities?.length && !filters.amenities.every((a) => listing.features.includes(a)))
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
}
