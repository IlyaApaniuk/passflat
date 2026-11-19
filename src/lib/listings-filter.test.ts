import { describe, expect, it } from 'vitest';
import type { Listing } from '@/lib/listings-data';
import { filterListings } from './listings-filter';

function listing(id: string, overrides: Partial<Listing> = {}): Listing {
  return {
    id,
    slug: id,
    type: 'roommate',
    title: `Listing ${id}`,
    address: 'Marszałkowska 1',
    district: 'Śródmieście',
    price: 2000,
    adminFee: 300,
    utilities: 200,
    totalCost: 2500,
    bedrooms: 2,
    area: 50,
    floor: 3,
    totalFloors: 6,
    images: ['a.jpg'],
    photoCount: 1,
    lat: 52.23,
    lng: 21.01,
    promoted: false,
    availableFrom: '2026-12-01',
    features: [],
    thingsToKnow: [],
    description: '',
    createdAt: '2026-11-01T00:00:00.000Z',
    furnished: true,
    petsAllowed: false,
    ...overrides,
  };
}

const ids = (listings: Listing[]) => listings.map((l) => l.id);

describe('filterListings', () => {
  const tenListings = Array.from({ length: 10 }, (_, i) =>
    listing(`l${i}`, { totalCost: 1000 + i * 500 }),
  );

  it('counts 3 of 10 listings when a filter leaves 3', () => {
    // totalCost 1000, 1500, ..., 5500; ≤ 2000 leaves 1000, 1500, 2000.
    const result = filterListings(tenListings, { priceMax: 2000 });
    expect(result).toHaveLength(3);
    expect(ids(result)).toEqual(['l0', 'l1', 'l2']);
  });

  it('counts 0 when a filter leaves nothing', () => {
    expect(filterListings(tenListings, { priceMin: 10000 })).toHaveLength(0);
  });

  it('keeps every listing without active filters', () => {
    expect(filterListings(tenListings, {})).toHaveLength(10);
  });

  it('filters price on totalCost, not on the base price', () => {
    const listings = [
      listing('cheap-base', { price: 1500, totalCost: 2600 }),
      listing('in-range', { price: 2400, totalCost: 2400 }),
    ];
    expect(ids(filterListings(listings, { priceMin: 2000, priceMax: 2500 }))).toEqual(['in-range']);
  });

  it('filters districts by display name', () => {
    const listings = [
      listing('a', { district: 'Mokotów' }),
      listing('b', { district: 'Wola' }),
      listing('c', { district: 'Praga-Południe' }),
    ];
    expect(ids(filterListings(listings, { districts: ['Mokotów', 'Praga-Południe'] }))).toEqual([
      'a',
      'c',
    ]);
    expect(filterListings(listings, { districts: ['mokotow'] })).toHaveLength(0);
  });

  it('filters roomType exactly', () => {
    const listings = [
      listing('private', { roomType: 'private' }),
      listing('shared', { roomType: 'shared' }),
      listing('unset'),
    ];
    expect(ids(filterListings(listings, { roomType: 'private' }))).toEqual(['private']);
  });

  it('keeps listings open to any gender when a preferred gender is chosen', () => {
    const listings = [
      listing('male', { preferredGender: 'male' }),
      listing('female', { preferredGender: 'female' }),
      listing('any', { preferredGender: 'any' }),
    ];
    expect(ids(filterListings(listings, { preferredGender: 'female' }))).toEqual(['female', 'any']);
    expect(filterListings(listings, { preferredGender: 'any' })).toHaveLength(3);
  });

  it('keeps only listings with registration possible', () => {
    const listings = [
      listing('yes', { registrationPossible: true }),
      listing('no', { registrationPossible: false }),
      listing('unset'),
    ];
    expect(ids(filterListings(listings, { registrationPossible: true }))).toEqual(['yes']);
  });

  it('requires every selected amenity', () => {
    const listings = [
      listing('both', { features: ['balcony', 'dishwasher', 'elevator'] }),
      listing('one', { features: ['balcony'] }),
      listing('none'),
    ];
    expect(ids(filterListings(listings, { amenities: ['balcony', 'dishwasher'] }))).toEqual([
      'both',
    ]);
  });

  it('keeps listings with at least the selected number of bedrooms', () => {
    const listings = [
      listing('one', { bedrooms: 1 }),
      listing('two', { bedrooms: 2 }),
      listing('four', { bedrooms: 4 }),
    ];
    expect(ids(filterListings(listings, { bedrooms: [3] }))).toEqual(['four']);
    expect(ids(filterListings(listings, { bedrooms: [2, 4] }))).toEqual(['two', 'four']);
  });

  it('filters area and floor ranges, floor 0 included', () => {
    const listings = [
      listing('small-ground', { area: 30, floor: 0 }),
      listing('mid', { area: 55, floor: 2 }),
      listing('large-high', { area: 90, floor: 8 }),
    ];
    expect(ids(filterListings(listings, { areaMin: 40, areaMax: 60 }))).toEqual(['mid']);
    expect(ids(filterListings(listings, { floorMin: 0, floorMax: 2 }))).toEqual([
      'small-ground',
      'mid',
    ]);
  });

  it('filters availability dates', () => {
    const listings = [
      listing('early-long', { availableFrom: '2026-11-15', availableTo: '2027-06-30' }),
      listing('late', { availableFrom: '2027-02-01', availableTo: '2027-06-30' }),
      listing('early-short', { availableFrom: '2026-11-15', availableTo: '2027-01-31' }),
      listing('open-ended', { availableFrom: '2026-11-15' }),
    ];
    expect(ids(filterListings(listings, { availableFrom: '2026-12-01' }))).toEqual([
      'early-long',
      'early-short',
      'open-ended',
    ]);
    expect(ids(filterListings(listings, { availableTo: '2027-03-31' }))).toEqual([
      'early-long',
      'late',
    ]);
  });

  it('filters utilities, internet and photos flags', () => {
    const listings = [
      listing('all', { utilitiesIncluded: true, internetIncluded: true, photoCount: 3 }),
      listing('no-photos', { utilitiesIncluded: true, internetIncluded: true, photoCount: 0 }),
      listing('bare', { photoCount: 2 }),
    ];
    expect(
      ids(filterListings(listings, { utilitiesIncluded: true, internetIncluded: true })),
    ).toEqual(['all', 'no-photos']);
    expect(ids(filterListings(listings, { hasPhotos: true }))).toEqual(['all', 'bare']);
  });

  it('does not mutate the input list', () => {
    const listings = [listing('a', { totalCost: 1000 }), listing('b', { totalCost: 3000 })];
    filterListings(listings, { priceMax: 2000 });
    expect(ids(listings)).toEqual(['a', 'b']);
  });
});
