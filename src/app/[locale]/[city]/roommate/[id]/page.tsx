import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ListingDetailClient } from "../../replacement/[id]/client";
import { createClient } from "@/lib/supabase/server";
import { queryListingDetail, serializeListingDetail, generateListingMetadata } from "@/lib/listing-detail-query";
import { getAlternates } from "@/lib/seo";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ locale: string; city: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, city } = await params;
  const metadata = await generateListingMetadata(id);
  return {
    ...metadata,
    alternates: getAlternates(`/${city}/roommate/${id}`),
  };
}

export default async function RoommateDetailPage({ params }: PageProps) {
  const { id, city } = await params;

  const listing = await queryListingDetail(id);
  if (!listing) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await prisma.listing.update({
    where: { id },
    data: { viewsCount: { increment: 1 } },
  });

  const serialized = serializeListingDetail(listing, city);

  return <ListingDetailClient listing={serialized} isLoggedIn={!!user} />;
}
