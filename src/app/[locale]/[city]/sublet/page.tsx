import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ListingsPageClient } from "@/components/listings/listings-page-client";
import { queryListings, serializeListing, parseSearchParams } from "@/lib/listings-query";
import type { CityBounds } from "@/lib/listings-data";

interface PageProps {
  params: Promise<{ locale: string; city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SubletPage({ params, searchParams }: PageProps) {
  const { city: citySlug } = await params;
  const search = await searchParams;

  const city = await prisma.city.findUnique({
    where: { slug: citySlug },
    include: { districts: true },
  });

  if (!city) notFound();

  const parsed = parseSearchParams(search);
  const listings = await queryListings({ cityId: city.id, type: "sublet", ...parsed });
  const serialized = listings.map(serializeListing);

  const districts = city.districts.map((d) => ({
    slug: d.slug,
    name: d.nameKey,
  }));

  const cityBounds = city.bounds as CityBounds | null;

  return (
    <ListingsPageClient
      listings={serialized}
      districts={districts}
      citySlug={citySlug}
      cityBounds={cityBounds ?? undefined}
      listingType="sublet"
    />
  );
}
