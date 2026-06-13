import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import type { ListingType } from '@/lib/listings-data';
import { monthlyEquivalent, isPeriodicFrequency } from '@/lib/periodic-charges';
import { getAlternates } from '@/lib/seo';

// A listing is addressed by slug; old UUID links still resolve (the page then
// 301s them to the canonical slug URL).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const listingWhere = (slugOrId: string) =>
  UUID_RE.test(slugOrId) ? { OR: [{ slug: slugOrId }, { id: slugOrId }] } : { slug: slugOrId };

export async function queryListingDetail(slugOrId: string) {
  return prisma.listing.findFirst({
    where: listingWhere(slugOrId),
    include: {
      building: { include: { district: true, city: true } },
      author: { select: { displayName: true, createdAt: true } },
      periodicCharges: { orderBy: { createdAt: 'asc' } },
    },
  });
}

export function serializeListingDetail(
  listing: NonNullable<Awaited<ReturnType<typeof queryListingDetail>>>,
  citySlug: string,
) {
  const type = listing.type as ListingType;

  const base = {
    id: listing.id,
    slug: listing.slug ?? listing.id,
    type,
    title: listing.title,
    address: listing.building.addressFull,
    district: listing.building.district?.nameKey ?? '',
    citySlug,
    buildingId: listing.building.id,
    buildingSlug: listing.building.slug,
    price: Number(listing.rent ?? 0),
    adminFee: Number(listing.adminFee ?? 0),
    utilities: Number(listing.utilitiesAvg ?? 0),
    totalCost: Number(listing.totalMonthly ?? 0),
    bedrooms: listing.rooms ?? 0,
    bathrooms: 1,
    area: Number(listing.areaM2 ?? 0),
    floor: listing.floor ?? 0,
    totalFloors: 0,
    images: listing.photos,
    lat: Number(listing.building.lat ?? 52.23),
    lng: Number(listing.building.lng ?? 21.01),
    promoted: listing.isPromoted,
    availableFrom: listing.availableFrom?.toISOString() ?? '',
    features: listing.amenities ?? [],
    thingsToKnow: listing.thingsToKnow ?? [],
    registrationPossible: listing.registrationPossible ?? undefined,
    description: listing.description ?? '',
    locale: listing.locale ?? null,
    createdAt: listing.createdAt.toISOString(),
    author: listing.author?.displayName ?? null,

    // Roommate-specific
    pricePerPerson: listing.pricePerPerson ? Number(listing.pricePerPerson) : undefined,
    totalApartmentRent: listing.totalApartmentRent ? Number(listing.totalApartmentRent) : undefined,
    currentRoommates: listing.currentRoommates ?? undefined,
    totalRooms: listing.totalRooms ?? undefined,
    roomType: (listing.roomType as 'private' | 'shared') ?? undefined,
    preferredGender: (listing.preferredGender as 'any' | 'male' | 'female') ?? undefined,
    preferredAgeMin: listing.preferredAgeMin ?? undefined,
    preferredAgeMax: listing.preferredAgeMax ?? undefined,
    roommateDescription: listing.roommateDescription ?? undefined,

    // Sublet-specific
    availableTo: listing.availableTo?.toISOString() ?? undefined,
    priceTotal: listing.priceTotal ? Number(listing.priceTotal) : undefined,
    durationDays:
      listing.availableFrom && listing.availableTo
        ? Math.ceil(
            (listing.availableTo.getTime() - listing.availableFrom.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : undefined,
    utilitiesIncluded: listing.utilitiesIncluded ?? undefined,
    internetIncluded: listing.internetIncluded ?? undefined,
    subletRules: listing.subletRules ?? undefined,
    depositAmount: listing.depositAmount ? Number(listing.depositAmount) : undefined,

    // Flexible recurring charges (replacement + sublet)
    periodicCharges: (listing.periodicCharges ?? []).map((c) => {
      const amount = Number(c.amount);
      return {
        id: c.id,
        category: c.category,
        amount,
        frequency: c.frequency,
        note: c.note ?? undefined,
        monthlyEquivalent: isPeriodicFrequency(c.frequency)
          ? Math.round(monthlyEquivalent(amount, c.frequency))
          : 0,
      };
    }),
  };

  return base;
}

export async function generateListingMetadata(
  slugOrId: string,
  citySlug: string,
): Promise<Metadata> {
  const listing = await prisma.listing.findFirst({
    where: listingWhere(slugOrId),
    include: { building: { include: { district: true } } },
  });

  if (!listing) return { title: 'Not Found' };

  return {
    title: `${listing.title} — Passflat`,
    description:
      listing.description?.slice(0, 160) ??
      `${listing.title} in ${listing.building.district?.nameKey ?? 'Warsaw'}`,
    alternates: getAlternates(`/${citySlug}/${listing.type}/${listing.slug ?? listing.id}`),
    openGraph: {
      title: listing.title,
      description: listing.description?.slice(0, 160) ?? undefined,
      images: listing.photos[0] ? [listing.photos[0]] : undefined,
    },
  };
}
