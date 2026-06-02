// Client-side price config — FOR DISPLAY ONLY.
// The actual charge is driven by Stripe Price IDs server-side (see src/lib/stripe.ts).
// These numbers MUST match the amounts the owner configures on the corresponding
// Stripe Prices, otherwise the displayed total will differ from what is charged.
//
// All amounts are in PLN (whole złoty).
export const PRICES_PLN = {
  // Extra (paid) listing fee, charged once a user is over the free-listing limit.
  // PLACEHOLDER — confirm against the Stripe Price for STRIPE_PRICE_EXTRA_LISTING.
  EXTRA_LISTING: 19,
  // Promotion tiers (7 / 14 / 30 days). Match the i18n promote labels.
  PROMOTE_7: 39,
  PROMOTE_14: 59,
  PROMOTE_30: 89,
  // Cost-data access tiers (7 / 30 / 90 days).
  // PLACEHOLDERS — confirm against the matching Stripe Prices.
  COST_ACCESS_7: 19,
  COST_ACCESS_30: 39,
  COST_ACCESS_90: 79,
} as const;

const PROMOTE_PRICE_BY_DAYS: Record<number, number> = {
  7: PRICES_PLN.PROMOTE_7,
  14: PRICES_PLN.PROMOTE_14,
  30: PRICES_PLN.PROMOTE_30,
};

export function promotePrice(days: number): number {
  return PROMOTE_PRICE_BY_DAYS[days] ?? 0;
}

// Total for the create-listing order summary (display only).
export function listingOrderTotal(opts: { paidListing: boolean; promoteDays: number }): number {
  let total = 0;
  if (opts.paidListing) total += PRICES_PLN.EXTRA_LISTING;
  total += promotePrice(opts.promoteDays);
  return total;
}
