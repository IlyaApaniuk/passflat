import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import type { ListingType } from '@/lib/listings-data';
import { monthlyEquivalent, isPeriodicFrequency } from '@/lib/periodic-charges';
import { getAlternates } from '@/lib/seo';
import { getLocale } from 'next-intl/server';

// A listing is addressed by slug; old UUID links still resolve (the page then
// 301s them to the canonical slug URL).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const listingWhere = (slugOrId: string) =>
  UUID_RE.test(slugOrId) ? { OR: [{ slug: slugOrId }, { id: slugOrId }] } : { slug: slugOrId };

/**
 * Only active listings are public. A listing goes non-active when an admin acts
 * on an abuse report (`removed`), when its author deletes their account
 * (`deleted`), or when it is over the free limit and unpaid (`pending_payment`)
 * — in every case the canonical URL must stop serving it, since that URL is
 * exactly what gets shared. The author and moderation admins still see their own.
 */
export function canViewListing(
  listing: { status: string; authorId: string },
  viewer: { id: string; isAdmin: boolean } | null,
): boolean {
  if (listing.status === 'active') return true;
  if (!viewer) return false;
  return viewer.isAdmin || listing.authorId === viewer.id;
}

export async function queryListingDetail(slugOrId: string) {
  return prisma.listing.findFirst({
    where: listingWhere(slugOrId),
    include: {
      building: {
        include: { district: true, city: true, _count: { select: { costReports: true } } },
      },
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
    districtSlug: listing.building.district?.slug ?? '',
    citySlug,
    buildingId: listing.building.id,
    buildingSlug: listing.building.slug,
    buildingHasCosts: (listing.building._count?.costReports ?? 0) > 0,
    price: Number(listing.rent ?? 0),
    adminFee: Number(listing.adminFee ?? 0),
    utilities: Number(listing.utilitiesAvg ?? 0),
    totalCost: Number(listing.totalMonthly ?? 0),
    bedrooms: listing.rooms ?? 0,
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
    contactTelegram: listing.contactTelegram ?? null,
    contactPhone: listing.contactPhone ?? null,
    contactFacebook: listing.contactFacebook ?? null,

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

  // Metadata is generated even when the page itself 404s the viewer, so a
  // non-active listing must not leak its title/photo into <head>.
  if (listing.status !== 'active') {
    return { title: 'Not Found', robots: { index: false, follow: false } };
  }

  return {
    // No brand suffix: the locale layout's title template appends one, and two
    // of them ("… — Passflat — Passflat") is what the SERP was showing.
    title: listing.title,
    description:
      listing.description?.slice(0, 160) ??
      `${listing.title} in ${listing.building.district?.nameKey ?? 'Warsaw'}`,
    alternates: getAlternates(
      `/${citySlug}/${listing.type}/${listing.slug ?? listing.id}`,
      await getLocale(),
    ),
    openGraph: {
      title: listing.title,
      description: listing.description?.slice(0, 160) ?? undefined,
      images: listing.photos[0] ? [listing.photos[0]] : undefined,
    },
  };
}
