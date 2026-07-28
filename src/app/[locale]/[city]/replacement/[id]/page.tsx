import { notFound, redirect } from 'next/navigation';
import { ListingDetailClient } from './client';
import { createClient } from '@/lib/supabase/server';
import {
  queryListingDetail,
  serializeListingDetail,
  generateListingMetadata,
  canViewListing,
} from '@/lib/listing-detail-query';
import { isCostImportAdmin } from '@/lib/import-constants';
import { trackView } from '@/lib/track-view';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ locale: string; city: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, city } = await params;
  return generateListingMetadata(id, city);
}

export default async function ListingDetailPage({ params }: PageProps) {
  const { id: slugOrId, city } = await params;

  const listing = await queryListingDetail(slugOrId);
  if (!listing) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !canViewListing(listing, user ? { id: user.id, isAdmin: isCostImportAdmin(user.email) } : null)
  )
    notFound();

  // Canonicalise: old UUID links (and wrong-type URLs) 301 to the slug URL.
  const canonical = listing.slug ?? listing.id;
  if (slugOrId !== canonical) redirect(`/${city}/${listing.type}/${canonical}`);

  await trackView(listing.id, user?.id);

  const serialized = serializeListingDetail(listing, city);
  const isOwner = !!user && listing.authorId === user.id;

  return <ListingDetailClient listing={serialized} isLoggedIn={!!user} isOwner={isOwner} />;
}
