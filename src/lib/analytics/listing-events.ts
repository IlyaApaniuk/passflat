import type { ListingType } from '@/lib/listings-data';

/**
 * Properties of the listing detail events (`listing_detail_viewed`, `interest_modal_opened`,
 * `listing_external_contact_clicked`). `type` is the original property and stays for existing
 * insights; `listing_type` carries the same value under the name the other events use
 * (spec 01, FR-4). The base fields are applied last, so an extra cannot make them disagree.
 */
export function listingEventProperties(
  listingId: string,
  listingType: ListingType,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...extra, listing_id: listingId, type: listingType, listing_type: listingType };
}
