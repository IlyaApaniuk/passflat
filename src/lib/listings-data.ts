export type ListingType = 'replacement' | 'roommate' | 'sublet';

// Shared types for listings
export interface Listing {
  id: string;
  type: ListingType;
  title: string;
  address: string;
  district: string;
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
  photoCount: number;
  lat: number;
  lng: number;
  promoted: boolean;
  availableFrom: string;
  features: string[];
  description: string;
  createdAt: string;
  furnished: boolean;
  petsAllowed: boolean;
  isVerified: boolean;

  // Roommate-specific
  pricePerPerson?: number;
  currentRoommates?: number;
  roomType?: 'private' | 'shared';
  preferredGender?: 'any' | 'male' | 'female';

  // Sublet-specific
  availableTo?: string;
  priceTotal?: number;
  durationDays?: number;
  utilitiesIncluded?: boolean;
  internetIncluded?: boolean;
}

export interface CityBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface ListingFilters {
  type?: ListingType;
  priceMin?: number;
  priceMax?: number;
  bedrooms?: number[];
  districts?: string[];
  areaMin?: number;
  areaMax?: number;
  availableFrom?: string;
  availableTo?: string;
  furnished?: boolean;
  petsAllowed?: boolean;
  floorMin?: number;
  floorMax?: number;
  roomType?: 'private' | 'shared';
  preferredGender?: 'any' | 'male' | 'female';
  utilitiesIncluded?: boolean;
  internetIncluded?: boolean;
  isVerified?: boolean;
  hasPhotos?: boolean;
}

