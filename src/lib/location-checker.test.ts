import { beforeEach, describe, expect, it } from 'vitest';

import { metricFigure } from './cost-figures';
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

describe('aggregateLocationCheckerCosts (Q-2 blended number)', () => {
  it('blends every source into one number per building, as the neighbour pins show it', () => {
    expect(
      aggregateLocationCheckerCosts([
        { source: 'user', totalMonthlyAvg: 4_000, rent: 3_200 },
        { source: 'import', totalMonthlyAvg: '4200', rent: '3300' },
        { source: 'scraped', totalMonthlyAvg: 4_400, rent: 3_400 },
      ]),
    ).toEqual({
      totalMedian: 4_200,
      totalCount: 3,
      rentMedian: 3_300,
      expensesMedian: 900,
      reportCount: 3,
    });
  });

  it('computes its medians with the contract (untrimmed, same rounding, values above zero)', () => {
    const reports = [
      { source: 'user', totalMonthlyAvg: 3_000, rent: 2_500 },
      { source: 'user', totalMonthlyAvg: 3_101, rent: 2_600 },
      { source: 'scraped', totalMonthlyAvg: 40_000, rent: 39_000 },
      { source: 'scraped', totalMonthlyAvg: 0, rent: null },
    ];
    const totals = [3_000, 3_101, 40_000];
    expect(aggregateLocationCheckerCosts(reports)).toEqual({
      totalMedian: metricFigure(totals).median,
      totalCount: 3,
      rentMedian: metricFigure([2_500, 2_600, 39_000]).median,
      expensesMedian: metricFigure([500, 501, 1_000]).median,
      reportCount: 4,
    });
    // The outlier is kept (no trimming) and the zero total is not a value.
    expect(aggregateLocationCheckerCosts(reports)?.totalMedian).toBe(3_101);
  });

  it('clamps a rent above the total at zero expenses', () => {
    expect(
      aggregateLocationCheckerCosts([{ source: 'user', totalMonthlyAvg: 3_000, rent: 3_200 }]),
    ).toMatchObject({ expensesMedian: 0 });
  });

  it('returns null for no reports and null medians without usable values', () => {
    expect(aggregateLocationCheckerCosts([])).toBeNull();
    expect(
      aggregateLocationCheckerCosts([{ source: 'user', totalMonthlyAvg: null, rent: null }]),
    ).toEqual({
      totalMedian: null,
      totalCount: 0,
      rentMedian: null,
      expensesMedian: null,
      reportCount: 1,
    });
  });
});

it('builds a stable short slug suffix from a Places id', () => {
  expect(placeIdSlugSuffix('ChIJ-test')).toBe(placeIdSlugSuffix('ChIJ-test'));
  expect(placeIdSlugSuffix('ChIJ-test')).not.toBe(placeIdSlugSuffix('ChIJ-other'));
  expect(placeIdSlugSuffix('ChIJ-test').length).toBeLessThanOrEqual(6);
});
