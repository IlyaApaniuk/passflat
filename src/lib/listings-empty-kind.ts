/**
 * Which empty state the roommate list shows (spec 02 §Empty states, FR-20). "No offers in the
 * city yet" is only true when the city has no active offer of this type at all; when it has some
 * and the filters (client state or URL params already applied on the server) leave none, the
 * visitor is told that nothing matches the filters instead.
 */
export type ListingsEmptyKind = 'none' | 'no_offers_in_city' | 'no_match_for_filters';

export interface ListingsEmptyInput {
  /** Active offers of this type in the city without any URL filter (one server `count`). */
  cityOfferCount: number;
  /** Offers left after the filters, before the map viewport is applied. */
  filteredCount: number;
  /**
   * Whether the visitor has filters set. It does not change the kind: with offers in the city
   * and nothing left, the URL can still carry server-side params (for example after a reload),
   * so the answer stays "nothing matches your filters" and clearing them helps.
   */
  hasActiveFilters: boolean;
}

export function listingsEmptyKind(input: ListingsEmptyInput): ListingsEmptyKind {
  if (input.filteredCount > 0) return 'none';
  if (input.cityOfferCount === 0) return 'no_offers_in_city';
  return 'no_match_for_filters';
}

/**
 * After a reload with URL filters the server sends only the matching offers, so clearing the
 * filters on the client alone would still show none: the page must fetch the list again.
 */
export function serverListNarrowed({
  serverCount,
  cityOfferCount,
}: {
  /** Offers the server sent (URL filters applied, at most 50). */
  serverCount: number;
  cityOfferCount: number;
}): boolean {
  return serverCount < cityOfferCount;
}
