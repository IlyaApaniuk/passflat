import { describe, expect, it } from 'vitest';
import { listingsEmptyKind, serverListNarrowed } from './listings-empty-kind';

describe('listingsEmptyKind', () => {
  it('returns no_offers_in_city when the city has no offers', () => {
    expect(
      listingsEmptyKind({ cityOfferCount: 0, filteredCount: 0, hasActiveFilters: false }),
    ).toBe('no_offers_in_city');
    expect(listingsEmptyKind({ cityOfferCount: 0, filteredCount: 0, hasActiveFilters: true })).toBe(
      'no_offers_in_city',
    );
  });

  it('returns no_match_for_filters when 4 offers are in the city and the filter leaves 0', () => {
    expect(listingsEmptyKind({ cityOfferCount: 4, filteredCount: 0, hasActiveFilters: true })).toBe(
      'no_match_for_filters',
    );
  });

  it('returns none when 4 offers are in the city and 2 are left', () => {
    expect(listingsEmptyKind({ cityOfferCount: 4, filteredCount: 2, hasActiveFilters: true })).toBe(
      'none',
    );
    expect(
      listingsEmptyKind({ cityOfferCount: 4, filteredCount: 4, hasActiveFilters: false }),
    ).toBe('none');
  });

  it('never says the city is empty while it has offers, also when only URL params filtered', () => {
    // A reload with strict server-side URL params: the server sent 0, no client filter is set.
    expect(
      listingsEmptyKind({ cityOfferCount: 4, filteredCount: 0, hasActiveFilters: false }),
    ).toBe('no_match_for_filters');
  });
});

describe('serverListNarrowed', () => {
  it('is true when the server sent fewer offers than the city has', () => {
    expect(serverListNarrowed({ serverCount: 0, cityOfferCount: 4 })).toBe(true);
  });

  it('is false when the server sent the whole city', () => {
    expect(serverListNarrowed({ serverCount: 4, cityOfferCount: 4 })).toBe(false);
    expect(serverListNarrowed({ serverCount: 0, cityOfferCount: 0 })).toBe(false);
  });
});
