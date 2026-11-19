import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { ListingsPageClient } from '@/components/listings/listings-page-client';
import { getAlternates, getOgImage } from '@/lib/seo';
import {
  countCityListings,
  queryListings,
  serializeListing,
  parseSearchParams,
  getCityWithDistricts,
} from '@/lib/listings-query';
import type { CityBounds } from '@/lib/listings-data';
import { loadFlatmateBlockCounts, pageHasFlatmateBlock } from '@/lib/roommate/website-counts';
import { loadRoomMoneyReference, pageHasRoomMoneyBlock } from '@/lib/roommate/room-money';
import type { RoomMoneyFigures } from '@/components/listings/room-money-block';

interface PageProps {
  params: Promise<{ locale: string; city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city } = await params;
  const cityRecord = await prisma.city.findUnique({
    where: { slug: city },
    select: { nameKey: true },
  });
  const t = await getTranslations();
  const cityName = cityRecord ? t(cityRecord.nameKey) : city;
  const title = `${t('listings.titleRoommate')} — ${cityName}`;
  // The one query cluster that already clicks. Its description carried neither
  // the city nor the reason to stay, so the click landed and ended here.
  const description = t('listings.roommateMetaDescription', { city: cityName });

  return {
    title,
    description,
    alternates: getAlternates(`/${city}/roommate`, await getLocale()),
    openGraph: {
      title,
      description,
      images: [getOgImage(title, description)],
    },
  };
}

export default async function RoommatePage({ params, searchParams }: PageProps) {
  const { city: citySlug } = await params;
  const search = await searchParams;

  const city = await getCityWithDistricts(citySlug);

  if (!city) notFound();

  const parsed = parseSearchParams(search);
  // The count ignores the URL filters, so a reload with strict filters never reads as an
  // empty city (spec 02 §Empty states). The "Looking for someone to rent with" block's counts
  // (spec 02 §Find a flatmate) and the room money block's city room reference (spec 02 §Room
  // money block) are loaded only where those blocks can show.
  const [listings, cityOfferCount, flatmateCounts, roomReference] = await Promise.all([
    queryListings({ cityId: city.id, type: 'roommate', ...parsed }),
    countCityListings({ cityId: city.id, type: 'roommate' }),
    pageHasFlatmateBlock(citySlug) ? loadFlatmateBlockCounts() : undefined,
    pageHasRoomMoneyBlock(citySlug) ? loadRoomMoneyReference(city.id) : undefined,
  ]);
  const serialized = listings.map(serializeListing);

  // Absent → no block; null → the block without its figures line. The reference's name is the
  // city's `nameKey`, rendered here because the `city` namespace never reaches the client.
  let roomMoney: RoomMoneyFigures | null | undefined;
  if (roomReference !== undefined) {
    const t = await getTranslations();
    roomMoney = roomReference && { reference: roomReference, areaName: t(roomReference.name) };
  }

  const districts = city.districts.map((d) => ({
    slug: d.slug,
    name: d.nameKey,
  }));

  const cityBounds = city.bounds as CityBounds | null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <ListingsPageClient
      listings={serialized}
      districts={districts}
      citySlug={citySlug}
      cityBounds={cityBounds ?? undefined}
      listingType="roommate"
      cityOfferCount={cityOfferCount}
      flatmateCounts={flatmateCounts}
      roomMoney={roomMoney}
      isLoggedIn={!!user}
    />
  );
}
