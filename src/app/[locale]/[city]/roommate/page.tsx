import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { ListingsPageClient } from '@/components/listings/listings-page-client';
import { getAlternates, getOgImage } from '@/lib/seo';
import {
  queryListings,
  serializeListing,
  parseSearchParams,
  getCityWithDistricts,
} from '@/lib/listings-query';
import type { CityBounds } from '@/lib/listings-data';

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
  const description = t('listings.types.roommateDesc');

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
  const listings = await queryListings({ cityId: city.id, type: 'roommate', ...parsed });
  const serialized = listings.map(serializeListing);

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
      isLoggedIn={!!user}
    />
  );
}
