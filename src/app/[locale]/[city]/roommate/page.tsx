import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
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
import { canLoadFlatmateCounts, pageHasFlatmateBlock } from '@/lib/roommate/flatmate-block';
import { loadFlatmateBlockCounts } from '@/lib/roommate/website-counts';
import { loadRoomMoneyReference, pageHasRoomMoneyBlock } from '@/lib/roommate/room-money';
import { loadWarsawPerPersonSplit } from '@/lib/roommate/room-costs';
import { perPersonSplitArea } from '@/lib/roommate/per-person-line';
import type { RoomMoneyFigures } from '@/components/listings/room-money-block';

interface PageProps {
  params: Promise<{ locale: string; city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city } = await params;
  const t = await getTranslations();
  // Spec 08 §Roommate page shell and metadata (PRD 4 FR-3): the title and the description name
  // Warsaw themselves (appendix seo.md table A), and the layout's template adds " — Passflat".
  const title = t('listings.titleRoommate');
  const description = t('listings.roommateMetaDescription');

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
  // (spec 02 §Find a flatmate) are loaded only with a bot to join (the block itself renders
  // without them, spec 08 §Roommate page default view), and the room money block's city room
  // reference (spec 02 §Room money block) only where that block can show. The flatmate block's
  // per-person line (spec 08 §Per-person line) is the bot's Warsaw split, on the block's page.
  const [listings, cityOfferCount, flatmateCounts, roomReference, perPersonSplit] =
    await Promise.all([
      queryListings({ cityId: city.id, type: 'roommate', ...parsed }),
      countCityListings({ cityId: city.id, type: 'roommate' }),
      canLoadFlatmateCounts(citySlug) ? loadFlatmateBlockCounts() : undefined,
      pageHasRoomMoneyBlock(citySlug) ? loadRoomMoneyReference(city.id) : undefined,
      pageHasFlatmateBlock(citySlug) ? loadWarsawPerPersonSplit().catch(() => null) : null,
    ]);
  const serialized = listings.map(serializeListing);

  // Absent → no block; null → the block without its figures line. The reference's name is the
  // city's `nameKey`, rendered here because the `city` namespace never reaches the client; so
  // is the split's own area.
  const t = await getTranslations();
  const roomMoney: RoomMoneyFigures | null | undefined =
    roomReference === undefined
      ? undefined
      : roomReference && { reference: roomReference, areaName: t(roomReference.name) };
  const perPersonArea = perPersonSplit ? perPersonSplitArea(perPersonSplit, t) : undefined;

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
      perPersonSplit={perPersonSplit}
      perPersonArea={perPersonArea}
      isLoggedIn={!!user}
    />
  );
}
