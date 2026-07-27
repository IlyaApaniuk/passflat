import { beforeEach, describe, expect, it } from 'vitest';

import {
  aggregateLocationCheckerCosts,
  isInsideCityBounds,
  isLocationCheckRateLimited,
  localityMatchesCity,
  parseCityBounds,
  parseLocationCheckerInput,
  placeIdSlugSuffix,
  resetLocationCheckRateLimit,
} from './location-checker';

const validInput = {
  citySlug: 'warsaw',
  place: {
    street: 'ul. Marszałkowska',
    buildingNumber: '1',
    district: 'Śródmieście',
    city: 'Warszawa',
    postalCode: '00-001',
    lat: 52.23,
    lng: 21.01,
    placeId: 'ChIJ-test',
    formattedAddress: 'Marszałkowska 1, Warszawa, Polska',
  },
};

beforeEach(() => resetLocationCheckRateLimit());

describe('parseLocationCheckerInput', () => {
  it('accepts a complete Places payload and canonicalizes simple strings', () => {
    const parsed = parseLocationCheckerInput(validInput);
    expect(parsed).toEqual({
      ok: true,
      data: {
        ...validInput,
        place: {
          ...validInput.place,
          street: 'Marszałkowska',
        },
      },
    });
  });

  it('requires a street, building number, locality, place id and finite coordinates', () => {
    expect(
      parseLocationCheckerInput({
        ...validInput,
        place: { ...validInput.place, buildingNumber: '' },
      }).ok,
    ).toBe(false);
    expect(
      parseLocationCheckerInput({
        ...validInput,
        place: { ...validInput.place, city: '' },
      }).ok,
    ).toBe(false);
    expect(
      parseLocationCheckerInput({
        ...validInput,
        place: { ...validInput.place, placeId: '' },
      }).ok,
    ).toBe(false);
    expect(
      parseLocationCheckerInput({
        ...validInput,
        place: { ...validInput.place, lat: Number.NaN },
      }).ok,
    ).toBe(false);
  });
});

describe('city validation', () => {
  it('parses valid bounds and checks points on both sides of the boundary', () => {
    const bounds = parseCityBounds({ north: 53, south: 52, east: 22, west: 20 });
    expect(bounds).not.toBeNull();
    expect(isInsideCityBounds(52.5, 21, bounds!)).toBe(true);
    expect(isInsideCityBounds(51.9, 21, bounds!)).toBe(false);
  });

  it('rejects malformed bounds and non-canonical neighbouring localities', () => {
    expect(parseCityBounds({ north: 52, south: 53, east: 22, west: 20 })).toBeNull();
    expect(localityMatchesCity('Warszawa', 'warsaw', 'Warszawa')).toBe(true);
    expect(localityMatchesCity('Warsaw', 'warsaw', 'Warszawa')).toBe(true);
    expect(localityMatchesCity('Pruszków', 'warsaw', 'Warszawa')).toBe(false);
  });
});

describe('location checker rate limiter', () => {
  it('allows ten checks per IP per minute and rejects the eleventh', () => {
    for (let i = 0; i < 10; i += 1) {
      expect(isLocationCheckRateLimited('203.0.113.1', 1_000 + i)).toBe(false);
    }
    expect(isLocationCheckRateLimited('203.0.113.1', 2_000)).toBe(true);
  });

  it('opens a new window after old timestamps expire', () => {
    expect(isLocationCheckRateLimited('203.0.113.1', 0)).toBe(false);
    expect(isLocationCheckRateLimited('203.0.113.1', 60_001)).toBe(false);
  });
});

describe('aggregateLocationCheckerCosts', () => {
  it('counts deposit outcomes only where the tenancy actually ended', () => {
    // A running tenancy says nothing either way, so it must not dilute the ratio.
    expect(
      aggregateLocationCheckerCosts([
        { source: 'user', totalMonthlyAvg: 4_000, rent: 3_000, depositReturned: true },
        { source: 'user', totalMonthlyAvg: 4_000, rent: 3_000, depositReturned: false },
        { source: 'user', totalMonthlyAvg: 4_000, rent: 3_000, depositReturned: null },
        { source: 'user', totalMonthlyAvg: 4_000, rent: 3_000 },
      ]),
    ).toMatchObject({ depositReturned: 1, depositAnswered: 2 });
  });

  it('returns source-aware medians from visible reports supplied by the caller', () => {
    expect(
      aggregateLocationCheckerCosts([
        { source: 'user', totalMonthlyAvg: 4_000, rent: 3_200 },
        { source: 'import', totalMonthlyAvg: '4200', rent: '3300' },
        { source: 'scraped', totalMonthlyAvg: 4_400, rent: 3_400 },
      ]),
    ).toEqual({
      totalMedian: 4_200,
      // Filled in by the route, which knows the building's district.
      districtMedian: null,
      districtName: null,
      rentMedian: 3_300,
      expensesMedian: 900,
      reportCount: 3,
      tenantReportCount: 2,
      sourceKind: 'mixed',
      depositReturned: 0,
      depositAnswered: 0,
    });
  });

  it('distinguishes scraped-only data and returns null for no reports', () => {
    expect(
      aggregateLocationCheckerCosts([{ source: 'scraped', totalMonthlyAvg: 4_000, rent: 3_200 }]),
    ).toMatchObject({ sourceKind: 'scraped', tenantReportCount: 0 });
    expect(aggregateLocationCheckerCosts([])).toBeNull();
  });
});

it('builds a stable short slug suffix from a Places id', () => {
  expect(placeIdSlugSuffix('ChIJ-test')).toBe(placeIdSlugSuffix('ChIJ-test'));
  expect(placeIdSlugSuffix('ChIJ-test')).not.toBe(placeIdSlugSuffix('ChIJ-other'));
  expect(placeIdSlugSuffix('ChIJ-test').length).toBeLessThanOrEqual(6);
});
