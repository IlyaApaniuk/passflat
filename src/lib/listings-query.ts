import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import type { ListingType, Listing } from '@/lib/listings-data';

/**
 * City + districts lookup used by the listing pages. Cities/districts are
 * effectively static configuration, so this is cached to avoid re-hitting the
 * database on every navigation to a city page. Only the fields the pages
 * consume are selected, keeping the cached value plainly serializable.
 */
export const getCityWithDistricts = unstable_cache(
  async (slug: string) => {
    return prisma.city.findUnique({
      where: { slug },
      select: {
        id: true,
        bounds: true,
        districts: { select: { slug: true, nameKey: true } },
      },
    });
  },
  ['city-with-districts'],
  { revalidate: 3600 },
);

interface QueryParams {
  cityId: string;
  type: ListingType;
  district?: string;
  priceMin?: number;
  priceMax?: number;
  rooms?: number;
  areaMin?: number;
  areaMax?: number;
  amenities?: string[];
  sort?: string;
}

function priceField(type: ListingType): string {
  switch (type) {
    case 'roommate':
      return 'pricePerPerson';
    case 'sublet':
      return 'priceTotal';
    default:
      return 'totalMonthly';
  }
}

export async function queryListings({
  cityId,
  type,
  district,
  priceMin,
  priceMax,
  rooms,
  areaMin,
  areaMax,
  amenities,
  sort = 'newest',
}: QueryParams) {
  const pField = priceField(type);

  const where: Record<string, unknown> = {
    building: { cityId },
    status: 'active',
    type,
  };

  if (district) {
    (where.building as Record<string, unknown>).district = { slug: district };
  }
  if (priceMin !== undefined || priceMax !== undefined) {
    where[pField] = {};
    if (priceMin) (where[pField] as Record<string, unknown>).gte = priceMin;
    if (priceMax) (where[pField] as Record<string, unknown>).lte = priceMax;
  }
  if (rooms) {
    where.rooms = { gte: rooms };
  }
  if (areaMin !== undefined || areaMax !== undefined) {
    where.areaM2 = {};
    if (areaMin) (where.areaM2 as Record<string, unknown>).gte = areaMin;
    if (areaMax) (where.areaM2 as Record<string, unknown>).lte = areaMax;
  }
  if (amenities?.length) {
    where.amenities = { hasEvery: amenities };
  }

  let orderBy: Record<string, string>[] = [];
  switch (sort) {
    case 'price-asc':
      orderBy = [{ [pField]: 'asc' }];
      break;
    case 'price-desc':
      orderBy = [{ [pField]: 'desc' }];
      break;
    case 'area-desc':
      orderBy = [{ areaM2: 'desc' }];
      break;
    default:
      orderBy = [{ isPromoted: 'desc' }, { createdAt: 'desc' }];
  }

  const listings = await prisma.listing.findMany({
    where,
    orderBy,
    take: 50,
    include: {
      building: { include: { district: true } },
    },
  });

  return listings;
}

export function serializeListing(l: Awaited<ReturnType<typeof queryListings>>[number]): Listing {
  const type = l.type as ListingType;

  const base: Listing = {
    id: l.id,
    slug: l.slug ?? l.id,
    type,
    title: l.title,
    address: l.building.addressFull,
    district: l.building.district?.nameKey ?? '',
    price: Number(l.rent ?? 0),
    adminFee: Number(l.adminFee ?? 0),
    utilities: Number(l.utilitiesAvg ?? 0),
    totalCost: Number(l.totalMonthly ?? 0),
    bedrooms: l.rooms ?? 0,
    bathrooms: 1,
    area: Number(l.areaM2 ?? 0),
    floor: l.floor ?? 0,
    totalFloors: 0,
    images: l.photos,
    photoCount: l.photos.length,
    lat: Number(l.building.lat ?? 52.23),
    lng: Number(l.building.lng ?? 21.01),
    promoted: l.isPromoted,
    availableFrom: l.availableFrom?.toISOString() ?? '',
    features: l.amenities ?? [],
    thingsToKnow: l.thingsToKnow ?? [],
    registrationPossible: l.registrationPossible ?? undefined,
    description: l.description ?? '',
    createdAt: l.createdAt.toISOString(),
    furnished: (l.amenities ?? []).includes('furnished'),
    petsAllowed: (l.thingsToKnow ?? []).includes('petsAllowed'),
  };

  if (type === 'roommate') {
    base.pricePerPerson = l.pricePerPerson ? Number(l.pricePerPerson) : undefined;
    base.currentRoommates = l.currentRoommates ?? undefined;
    base.roomType = (l.roomType as 'private' | 'shared') ?? undefined;
    base.preferredGender = (l.preferredGender as 'any' | 'male' | 'female') ?? undefined;
  }

  if (type === 'sublet') {
    base.availableTo = l.availableTo?.toISOString() ?? undefined;
    base.priceTotal = l.priceTotal ? Number(l.priceTotal) : undefined;
    base.utilitiesIncluded = l.utilitiesIncluded ?? undefined;
    base.internetIncluded = l.internetIncluded ?? undefined;
    if (l.availableFrom && l.availableTo) {
      base.durationDays = Math.ceil(
        (l.availableTo.getTime() - l.availableFrom.getTime()) / (1000 * 60 * 60 * 24),
      );
    }
  }

  return base;
}

export function parseSearchParams(search: Record<string, string | string[] | undefined>) {
  const amenitiesRaw = typeof search.amenities === 'string' ? search.amenities : undefined;
  return {
    district: typeof search.district === 'string' ? search.district : undefined,
    priceMin: typeof search.priceMin === 'string' ? parseFloat(search.priceMin) : undefined,
    priceMax: typeof search.priceMax === 'string' ? parseFloat(search.priceMax) : undefined,
    rooms: typeof search.rooms === 'string' ? parseInt(search.rooms, 10) : undefined,
    areaMin: typeof search.areaMin === 'string' ? parseFloat(search.areaMin) : undefined,
    areaMax: typeof search.areaMax === 'string' ? parseFloat(search.areaMax) : undefined,
    amenities: amenitiesRaw ? amenitiesRaw.split(',').filter(Boolean) : undefined,
    sort: typeof search.sort === 'string' ? search.sort : 'newest',
  };
}
