import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  cityFindUnique: vi.fn(),
  buildingFindFirst: vi.fn(),
  buildingFindUnique: vi.fn(),
  buildingUpdate: vi.fn(),
  buildingCreate: vi.fn(),
  buildingCount: vi.fn(),
  scoreUpsert: vi.fn(),
  computeScore: vi.fn(),
  buildingFindMany: vi.fn(),
  getTranslations: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: { findUnique: h.cityFindUnique },
    building: {
      findFirst: h.buildingFindFirst,
      findMany: h.buildingFindMany,
      findUnique: h.buildingFindUnique,
      update: h.buildingUpdate,
      create: h.buildingCreate,
      count: h.buildingCount,
    },
    buildingLocationScore: { upsert: h.scoreUpsert },
  },
}));

// Only the scoring source is faked; the category table and math stay real so a
// change to either still has to keep this route's contract working.
vi.mock('@/lib/poi-lookup', async (importOriginal) => ({
  // Only the scoring source is faked. boundingBoxAround is pure geometry and
  // the neighbours query depends on it, so it stays real.
  ...(await importOriginal<typeof import('@/lib/poi-lookup')>()),
  computeLocationScoreFromDb: h.computeScore,
}));

vi.mock('@/lib/geo/district', () => ({
  resolveDistrictByPoint: vi.fn(() => 'srodmiescie'),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: h.getTranslations,
}));

import { isLocationCheckRateLimited, resetLocationCheckRateLimit } from '@/lib/location-checker';
import { SCORE_VERSION } from '@/lib/location-score';
import { GET, POST } from './route';

const input = {
  citySlug: 'warsaw',
  place: {
    street: 'Marszałkowska',
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

const activeCity = {
  id: 'city-1',
  slug: 'warsaw',
  nameKey: 'city.warsaw',
  lat: 52.2297,
  lng: 21.0122,
  bounds: { north: 52.4, south: 52.0, east: 21.3, west: 20.7 },
  isActive: true,
  country: { defaultLocale: 'pl' },
  districts: [{ id: 'district-1', slug: 'srodmiescie', nameKey: 'Śródmieście' }],
};

const cachedScore = {
  overall: 78,
  categories: [{ key: 'supermarket', score: 90, nearestM: 120, name: 'Shop' }],
  computedAt: new Date('2026-07-26T10:00:00.000Z'),
  version: SCORE_VERSION,
};

function building(overrides: Record<string, unknown> = {}) {
  return {
    id: 'building-1',
    slug: 'marszalkowska-1',
    cityId: 'city-1',
    districtId: 'district-1',
    street: 'Marszałkowska',
    buildingNumber: '1',
    addressFull: 'Marszałkowska 1',
    addressNormalized: 'marszalkowska 1',
    lat: 52.23,
    lng: 21.01,
    placeId: 'ChIJ-test',
    postalCode: '00-001',
    checksCount: 4,
    lastCheckedAt: new Date('2026-07-25T10:00:00.000Z'),
    city: { slug: 'warsaw', lat: 52.2297, lng: 21.0122 },
    district: { slug: 'srodmiescie', nameKey: 'Śródmieście' },
    locationScore: cachedScore,
    costReports: [],
    ...overrides,
  };
}

function postRequest(body: unknown = input, ip = '203.0.113.10') {
  return new NextRequest('http://localhost/api/location-score', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetLocationCheckRateLimit();
  for (const mock of Object.values(h)) mock.mockReset();
  h.cityFindUnique.mockResolvedValue(activeCity);
  h.buildingFindFirst.mockResolvedValue(null);
  h.buildingFindUnique.mockResolvedValue(null);
  // No neighbours with costs unless a test says otherwise.
  h.buildingFindMany.mockResolvedValue([]);
  h.buildingCount.mockResolvedValue(0);
  h.getTranslations.mockResolvedValue((key: string) => (key === 'city.warsaw' ? 'Warszawa' : key));
  h.computeScore.mockResolvedValue({
    overall: 81,
    categories: [{ key: 'supermarket', score: 100, nearestM: 50, name: null }],
  });
  h.scoreUpsert.mockResolvedValue({
    overall: 81,
    categories: [{ key: 'supermarket', score: 100, nearestM: 50, name: null }],
    computedAt: new Date('2026-07-26T11:00:00.000Z'),
    version: SCORE_VERSION,
  });
});

describe('POST /api/location-score', () => {
  it('rejects malformed input before touching the database', async () => {
    const response = await POST(postRequest({ citySlug: 'warsaw', place: {} }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'INVALID_REQUEST' });
    expect(h.cityFindUnique).not.toHaveBeenCalled();
  });

  it('keeps v1 explicitly limited to Warsaw', async () => {
    const response = await POST(postRequest({ ...input, citySlug: 'krakow' }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: 'CITY_NOT_FOUND' });
    expect(h.cityFindUnique).not.toHaveBeenCalled();
  });

  it('rejects an address outside the active city bounds or canonical locality', async () => {
    const response = await POST(
      postRequest({ ...input, place: { ...input.place, city: 'Pruszków' } }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'ADDRESS_OUTSIDE_CITY' });
    expect(h.buildingFindFirst).not.toHaveBeenCalled();
  });

  it('enforces the ten-per-minute IP limiter', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect(isLocationCheckRateLimited('203.0.113.10')).toBe(false);
    }
    const response = await POST(postRequest());
    expect(response.status).toBe(429);
    expect(h.cityFindUnique).not.toHaveBeenCalled();
  });

  it('returns nearby buildings with costs, trimmed to the radius and nearest first', async () => {
    const existing = building();
    h.buildingFindFirst.mockResolvedValue(existing);
    h.buildingUpdate.mockResolvedValue(existing);
    h.buildingFindMany.mockResolvedValue([
      // ~780m east — inside the 1km circle.
      {
        id: 'b-far',
        slug: 'far',
        addressFull: 'Far 2',
        lat: 52.23,
        lng: 21.0215,
        costReports: [{ source: 'user', totalMonthlyAvg: 5_000, rent: 4_000 }],
      },
      // ~110m north — nearest, so it must come first.
      {
        id: 'b-near',
        slug: 'near',
        addressFull: 'Near 1',
        lat: 52.231,
        lng: 21.01,
        costReports: [{ source: 'user', totalMonthlyAvg: 4_000, rent: 3_100 }],
      },
      // Inside the bounding box corner but ~1.2km away, so outside the circle.
      {
        id: 'b-corner',
        slug: 'corner',
        addressFull: 'Corner 3',
        lat: 52.2375,
        lng: 21.0195,
        costReports: [{ source: 'user', totalMonthlyAvg: 9_000, rent: 8_000 }],
      },
      // No usable median — nothing to show on a pin.
      {
        id: 'b-empty',
        slug: 'empty',
        addressFull: 'Empty 4',
        lat: 52.2305,
        lng: 21.0105,
        costReports: [{ source: 'user', totalMonthlyAvg: null, rent: null }],
      },
    ]);

    const response = await POST(postRequest());
    const body = await response.json();

    expect(body.neighbours.map((n: { id: string }) => n.id)).toEqual(['b-near', 'b-far']);
    expect(body.neighbours[0]).toMatchObject({
      slug: 'near',
      address: 'Near 1',
      totalMedian: 4_000,
      reportCount: 1,
    });
    expect(body.neighbours[0].distanceM).toBeLessThan(body.neighbours[1].distanceM);
  });

  it('uses a fresh cache, increments the check and returns source-aware costs', async () => {
    const existing = building({
      costReports: [
        { source: 'user', totalMonthlyAvg: 4_000, rent: 3_200 },
        { source: 'scraped', totalMonthlyAvg: 4_400, rent: 3_400 },
      ],
    });
    const updated = building({ ...existing, checksCount: 5 });
    h.buildingFindFirst.mockResolvedValue(existing);
    h.buildingUpdate.mockResolvedValue(updated);

    const response = await POST(postRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      building: { id: 'building-1', address: 'Marszałkowska 1', citySlug: 'warsaw' },
      score: { overall: 78 },
      costs: {
        totalMedian: 4_200,
        rentMedian: 3_300,
        expensesMedian: 900,
        reportCount: 2,
        tenantReportCount: 1,
        sourceKind: 'mixed',
      },
    });
    expect(h.buildingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'building-1' },
        data: expect.objectContaining({ checksCount: { increment: 1 } }),
      }),
    );
    const updateData = h.buildingUpdate.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty('placeId');
    expect(updateData).not.toHaveProperty('lat');
    expect(updateData).not.toHaveProperty('lng');
    expect(updateData).not.toHaveProperty('postalCode');
    expect(updateData).not.toHaveProperty('districtId');
    expect(h.buildingCount).not.toHaveBeenCalled();
    expect(h.computeScore).not.toHaveBeenCalled();
  });

  it('creates a tracked building under the durable breaker and caches a computed score', async () => {
    const created = building({
      checksCount: 1,
      locationScore: null,
      costReports: [],
    });
    h.buildingCreate.mockResolvedValue(created);

    const response = await POST(postRequest());
    expect(response.status).toBe(200);
    expect(h.buildingCount).toHaveBeenCalledWith({
      where: {
        createdAt: { gt: expect.any(Date) },
        checksCount: { gt: 0 },
      },
    });
    expect(h.buildingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cityId: 'city-1',
          placeId: 'ChIJ-test',
          checksCount: 1,
          lastCheckedAt: expect.any(Date),
        }),
      }),
    );
    expect(h.computeScore).toHaveBeenCalledOnce();
    expect(h.scoreUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { buildingId: 'building-1' },
        create: expect.objectContaining({ version: SCORE_VERSION }),
        update: expect.objectContaining({ version: SCORE_VERSION }),
      }),
    );
  });

  it('deduplicates simultaneous Overpass work for the same uncached building', async () => {
    const uncached = building({ locationScore: null });
    h.buildingFindFirst.mockResolvedValue(uncached);
    h.buildingUpdate.mockResolvedValue(uncached);

    let resolveScore!: (value: {
      overall: number;
      categories: Array<{ key: string; score: number; nearestM: number; name: null }>;
    }) => void;
    h.computeScore.mockReturnValue(
      new Promise((resolve) => {
        resolveScore = resolve;
      }),
    );

    const first = POST(postRequest(input, '203.0.113.11'));
    const second = POST(postRequest(input, '203.0.113.12'));

    await vi.waitFor(() => expect(h.computeScore).toHaveBeenCalledOnce());
    resolveScore({
      overall: 81,
      categories: [{ key: 'supermarket', score: 100, nearestM: 50, name: null }],
    });

    const responses = await Promise.all([first, second]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(h.computeScore).toHaveBeenCalledOnce();
    expect(h.scoreUpsert).toHaveBeenCalledOnce();
  });

  it('trips the durable breaker only on a genuinely new address', async () => {
    h.buildingCount.mockResolvedValue(200);
    const response = await POST(postRequest());
    expect(response.status).toBe(429);
    expect(h.buildingCreate).not.toHaveBeenCalled();
    expect(h.computeScore).not.toHaveBeenCalled();
  });

  it('recovers a same-address create race after P2002 and records both checks', async () => {
    const raced = building();
    h.buildingFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(raced);
    h.buildingCreate.mockRejectedValueOnce({ code: 'P2002' });
    h.buildingUpdate.mockResolvedValue(building({ checksCount: 2 }));

    const response = await POST(postRequest());
    expect(response.status).toBe(200);
    expect(h.buildingCreate).toHaveBeenCalledOnce();
    expect(h.buildingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'building-1' },
        data: expect.objectContaining({ checksCount: { increment: 1 } }),
      }),
    );
    expect(h.computeScore).not.toHaveBeenCalled();
  });

  it('briefly cools down retries when Overpass fails', async () => {
    const uncached = building({ locationScore: null });
    h.buildingFindFirst.mockResolvedValue(uncached);
    h.buildingUpdate.mockResolvedValue(uncached);
    h.computeScore.mockRejectedValue(new Error('Overpass unavailable'));

    const first = await POST(postRequest(input, '203.0.113.21'));
    const second = await POST(postRequest(input, '203.0.113.22'));

    expect(first.status).toBe(503);
    expect(second.status).toBe(503);
    expect(h.computeScore).toHaveBeenCalledOnce();
    expect(h.scoreUpsert).not.toHaveBeenCalled();
  });
});

describe('GET /api/location-score', () => {
  it('does not expose the v1 read endpoint for other active cities', async () => {
    const request = new NextRequest('http://localhost/api/location-score?city=krakow&p=ChIJ-test');
    const response = await GET(request);
    expect(response.status).toBe(404);
    expect(h.cityFindUnique).not.toHaveBeenCalled();
  });

  it('returns a known fresh cached result without writes, increments or Overpass', async () => {
    h.buildingFindFirst.mockResolvedValue(building());
    const request = new NextRequest('http://localhost/api/location-score?city=warsaw&p=ChIJ-test');
    const response = await GET(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ score: { overall: 78 } });
    expect(h.buildingUpdate).not.toHaveBeenCalled();
    expect(h.computeScore).not.toHaveBeenCalled();
    expect(h.scoreUpsert).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown address and 204 for a known missing cache', async () => {
    h.buildingFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(building({ locationScore: null }));
    const request = () =>
      new NextRequest('http://localhost/api/location-score?city=warsaw&p=ChIJ-test');

    expect((await GET(request())).status).toBe(404);
    expect((await GET(request())).status).toBe(204);
    expect(h.computeScore).not.toHaveBeenCalled();
  });
});
