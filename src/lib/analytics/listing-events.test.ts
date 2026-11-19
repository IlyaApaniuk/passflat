import { describe, expect, it } from 'vitest';
import { listingEventProperties } from './listing-events';

describe('listingEventProperties', () => {
  it.each(['roommate', 'sublet', 'replacement'] as const)(
    'sends listing_type with the same value as type for %s',
    (listingType) => {
      expect(listingEventProperties('listing-1', listingType)).toEqual({
        listing_id: 'listing-1',
        type: listingType,
        listing_type: listingType,
      });
    },
  );

  it('keeps the event-specific properties', () => {
    expect(
      listingEventProperties('listing-2', 'roommate', { channel: 'telegram', source: 'cta' }),
    ).toEqual({
      listing_id: 'listing-2',
      type: 'roommate',
      listing_type: 'roommate',
      channel: 'telegram',
      source: 'cta',
    });
  });

  it('does not let an extra property override the base fields', () => {
    expect(
      listingEventProperties('listing-3', 'sublet', {
        listing_id: 'other',
        type: 'replacement',
        listing_type: 'replacement',
      }),
    ).toEqual({ listing_id: 'listing-3', type: 'sublet', listing_type: 'sublet' });
  });
});
