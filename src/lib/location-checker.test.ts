import { beforeEach, describe, expect, it } from 'vitest';

import { singleNumberFigure, summarizeFigures, type FigureReport } from './cost-figures';
import {
  NEIGHBOUR_REPORT_SELECT,
  neighbourFigure,
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

describe('neighbourFigure (D23 single number of a neighbour pin)', () => {
  type Amount = number | string | null;
  const row = (source: string, total: Amount, rent: Amount, complete = true): FigureReport => ({
    source,
    utilitiesComplete: complete,
    totalMonthlyAvg: total,
    rent,
  });
  const asReports = (rows: FigureReport[]) => rows;

  it('takes the tenant group, never a blend with the asking prices', () => {
    const reports = asReports([
      row('user', 4_000, 3_200),
      row('import', '4200', '3300'),
      row('scraped', 9_000, 8_000),
    ]);
    expect(neighbourFigure(reports)).toEqual({
      group: 'tenant',
      metric: 'completeTotal',
      value: 4_100,
      n: 2,
    });
  });

  it('equals the headline the building page shows (the full contract)', () => {
    const reports = asReports([
      row('user', 3_100, 2_500, false),
      ...[1, 2, 3].map(() => row('scraped', 4_000, 3_500)),
    ]);
    const page = singleNumberFigure(
      summarizeFigures(reports, { level: 'building', rentalType: 'all' }),
    );
    expect(neighbourFigure(reports)).toEqual({
      group: page!.group,
      metric: page!.metric,
      value: page!.value,
      n: page!.n,
    });
    // Golden example 14: one tenant report, known part, still wins over three asking prices.
    expect(neighbourFigure(reports)).toEqual({
      group: 'tenant',
      metric: 'knownPartTotal',
      value: 3_100,
      n: 1,
    });
  });

  it('falls back to the asking prices, labelled as a known part (golden example 13)', () => {
    expect(
      neighbourFigure(
        asReports([row('scraped', 4_100, 3_000, false), row('scraped', 3_900, 3_000, false)]),
      ),
    ).toEqual({ group: 'asking', metric: 'knownPartTotal', value: 4_000, n: 2 });
  });

  it('shows rent alone when no report has a total', () => {
    expect(neighbourFigure(asReports([row('user', null, 3_200)]))).toEqual({
      group: 'tenant',
      metric: 'rent',
      value: 3_200,
      n: 1,
    });
  });

  it('returns null without a usable value in either group', () => {
    expect(neighbourFigure([])).toBeNull();
    expect(
      neighbourFigure(asReports([row('user', null, null), row('scraped', 0, null)])),
    ).toBeNull();
  });

  it('selects exactly the fields the headline reads', () => {
    expect(NEIGHBOUR_REPORT_SELECT).toEqual({
      source: true,
      utilitiesComplete: true,
      totalMonthlyAvg: true,
      rent: true,
    });
  });
});

it('builds a stable short slug suffix from a Places id', () => {
  expect(placeIdSlugSuffix('ChIJ-test')).toBe(placeIdSlugSuffix('ChIJ-test'));
  expect(placeIdSlugSuffix('ChIJ-test')).not.toBe(placeIdSlugSuffix('ChIJ-other'));
  expect(placeIdSlugSuffix('ChIJ-test').length).toBeLessThanOrEqual(6);
});
