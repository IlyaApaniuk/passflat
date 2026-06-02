import { describe, expect, it } from 'vitest';

import { PRICES_PLN, listingOrderTotal, promotePrice } from './pricing';

describe('promotePrice', () => {
  it('returns the configured price for each valid tier', () => {
    expect(promotePrice(7)).toBe(PRICES_PLN.PROMOTE_7);
    expect(promotePrice(14)).toBe(PRICES_PLN.PROMOTE_14);
    expect(promotePrice(30)).toBe(PRICES_PLN.PROMOTE_30);
  });

  it('returns 0 for an unknown number of days', () => {
    expect(promotePrice(0)).toBe(0);
    expect(promotePrice(99)).toBe(0);
  });
});

describe('listingOrderTotal', () => {
  it('is 0 for a free listing without promotion', () => {
    expect(listingOrderTotal({ paidListing: false, promoteDays: 0 })).toBe(0);
  });

  it('adds only the extra-listing fee when paid without promotion', () => {
    expect(listingOrderTotal({ paidListing: true, promoteDays: 0 })).toBe(PRICES_PLN.EXTRA_LISTING);
  });

  it('adds only the promotion fee when free but promoted', () => {
    expect(listingOrderTotal({ paidListing: false, promoteDays: 14 })).toBe(PRICES_PLN.PROMOTE_14);
  });

  it('sums the extra-listing fee and the promotion fee', () => {
    expect(listingOrderTotal({ paidListing: true, promoteDays: 30 })).toBe(
      PRICES_PLN.EXTRA_LISTING + PRICES_PLN.PROMOTE_30,
    );
  });
});
