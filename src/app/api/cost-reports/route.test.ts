import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Shared mock state, hoisted so the vi.mock factories can read it.
const h = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  count: vi.fn(),
  findProfile: vi.fn(),
  profileUpsert: vi.fn(),
  profileUpdate: vi.fn(),
  cityFindUnique: vi.fn(),
  buildingFindFirst: vi.fn(),
  buildingFindUnique: vi.fn(),
  buildingCreate: vi.fn(),
  buildingUpdate: vi.fn(),
  reportFindFirst: vi.fn(),
  reportCreate: vi.fn(),
  reportFindMany: vi.fn(),
  districtFindUnique: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    // Stable anonymous id so an anonymous submission is deterministic.
    get: () => ({ value: '11111111-1111-1111-1111-111111111111' }),
    set: () => {},
  })),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: h.user } })) },
  })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    costReport: {
      count: h.count,
      findFirst: h.reportFindFirst,
      create: h.reportCreate,
      findMany: h.reportFindMany,
    },
    profile: { findUnique: h.findProfile, upsert: h.profileUpsert, update: h.profileUpdate },
    city: { findUnique: h.cityFindUnique },
    building: {
      findFirst: h.buildingFindFirst,
      findUnique: h.buildingFindUnique,
      create: h.buildingCreate,
      update: h.buildingUpdate,
    },
    district: { findUnique: h.districtFindUnique },
  },
}));

vi.mock('@/lib/posthog-server', () => ({
  trackServerEvent: vi.fn(),
  flushPostHog: vi.fn(),
  captureServerException: vi.fn(),
}));

// Cache purging and district polygons are irrelevant to the contract under test.
vi.mock('@/lib/revalidate-costs', () => ({ revalidateCostSurfaces: vi.fn() }));
vi.mock('@/lib/geo/district', () => ({ resolveDistrictByPoint: vi.fn(() => null) }));

// Imported after the mocks are registered.
import { POST } from './route';

function req(body?: unknown): NextRequest {
  return { json: async () => body ?? {}, headers: new Headers() } as unknown as NextRequest;
}

/** A submission that clears every required-field and range check. */
const validBody = {
  street: 'Marszałkowska',
  buildingNumber: '1',
  citySlug: 'warsaw',
  rent: '3000',
  areaM2: '50',
  rentalType: 'apartment',
};

const city = {
  id: 'city-1',
  slug: 'warsaw',
  nameKey: 'city.warsaw',
  isActive: true,
  // A wide box: the request carries no coordinates, so the bounds check is
  // skipped either way — this just keeps the "active city has no bounds" warning
  // out of the test output.
  bounds: { north: 90, south: -90, east: 180, west: -180 },
  districts: [],
  country: { defaultLocale: 'pl' },
};

const building = { id: 'b-1', slug: 'marszalkowska-1', districtId: null };
/** The row a concurrent request inserted first. */
const racedBuilding = { id: 'b-winner', slug: 'marszalkowska-1', districtId: null };

function p2002() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

type FindUniqueArgs = { where?: Record<string, unknown> };

/**
 * `building.findUnique` serves both the address lookup and the slug pre-check.
 * `byAddress` is a queue so a race can be expressed (first read empty, re-read
 * after P2002 finds the winner); its last value repeats.
 */
function mockBuildingLookup(opts: { byAddress: unknown[]; bySlug?: unknown }) {
  const queue = [...opts.byAddress];
  h.buildingFindUnique.mockImplementation(async (args: FindUniqueArgs) => {
    if (args?.where?.cityId_slug) return opts.bySlug ?? null;
    return queue.length > 1 ? queue.shift() : (queue[0] ?? null);
  });
}

beforeEach(() => {
  h.user = null;
  h.count.mockReset().mockResolvedValue(0);
  // Live account by default; the soft-deleted case is asserted separately.
  h.findProfile.mockReset().mockResolvedValue({ deletedAt: null });
  h.profileUpsert.mockReset().mockResolvedValue({});
  h.profileUpdate.mockReset().mockResolvedValue({});
  h.cityFindUnique.mockReset().mockResolvedValue(city);
  h.buildingFindFirst.mockReset().mockResolvedValue(null);
  h.buildingFindUnique.mockReset().mockResolvedValue(null);
  h.buildingCreate.mockReset().mockResolvedValue(building);
  h.buildingUpdate.mockReset().mockResolvedValue(building);
  h.reportFindFirst.mockReset().mockResolvedValue(null);
  h.reportCreate.mockReset().mockResolvedValue({ id: 'r-1', building });
  h.reportFindMany.mockReset().mockResolvedValue([]);
  h.districtFindUnique.mockReset().mockResolvedValue(null);
});

describe('POST /api/cost-reports — auth & rate-limit guards', () => {
  it('allows an unauthenticated request through as anonymous (no 401 auth wall)', async () => {
    h.user = null;
    h.count.mockResolvedValue(0);
    const res = await POST(req());
    // The login wall before the form is gone: an anonymous submit is NOT
    // rejected with 401. With an empty body it falls through to field
    // validation (400) instead of an auth error.
    expect(res.status).toBe(400);
    // Anonymous submitters are still rate-limited (per anonymousId), not exempt.
    expect(h.count).toHaveBeenCalled();
  });

  it('returns 429 when the per-account hourly cap is reached', async () => {
    h.user = { id: 'u1', email: 'tenant@example.com' };
    // Promise.all order: [per-user count, platform-wide count].
    h.count.mockResolvedValueOnce(10).mockResolvedValueOnce(0);
    const res = await POST(req());
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({ error: 'rate_limited' });
  });

  it('returns 429 when the platform-wide circuit breaker trips', async () => {
    h.user = { id: 'u1', email: 'tenant@example.com' };
    // Per-user well under its cap, but total user submissions/hour at the ceiling.
    h.count.mockResolvedValueOnce(0).mockResolvedValueOnce(200);
    const res = await POST(req());
    expect(res.status).toBe(429);
  });

  it('does not rate-limit when both counters are under their ceilings', async () => {
    h.user = { id: 'u1', email: 'tenant@example.com' };
    h.count.mockResolvedValueOnce(1).mockResolvedValueOnce(5);
    // Empty body fails downstream required-field validation, so this won't be a
    // 201 — but it must get PAST the rate-limit guards (i.e. not a 429).
    const res = await POST(req({}));
    expect(res.status).not.toBe(429);
    expect(h.count).toHaveBeenCalledTimes(2);
  });

  it('refuses a soft-deleted account before any rate-limit work', async () => {
    // The session survives the 30-day soft delete, so the route — not just the
    // middleware, which only guards page navigations — has to say no.
    h.user = { id: 'u1', email: 'tenant@example.com' };
    h.findProfile.mockResolvedValue({ deletedAt: new Date() });
    const res = await POST(req({}));
    expect(res.status).toBe(403);
    // The code moved into `error` (the client translates from it); `code` stays
    // for the older client build.
    await expect(res.json()).resolves.toMatchObject({
      error: 'ACCOUNT_DELETED',
      code: 'ACCOUNT_DELETED',
    });
    expect(h.count).not.toHaveBeenCalled();
  });
});

// Visitors filling this form read ru/uk/pl. Every rejection must carry a stable
// code the client can translate — never an English sentence in `error`.
describe('POST /api/cost-reports — stable error codes', () => {
  it('returns MISSING_FIELDS with the fields that are actually missing', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('MISSING_FIELDS');
    expect(body.fields).toEqual(['street', 'buildingNumber', 'rent', 'rentalType', 'areaM2']);
    // English text is debug-only, never the code.
    expect(body.message).toContain('Missing required fields');
  });

  it('names only the missing field, and skips areaM2 for a room', async () => {
    const res = await POST(
      req({ ...validBody, rentalType: 'room', areaM2: undefined, rent: undefined }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'MISSING_FIELDS',
      fields: ['rent'],
    });
  });

  it('returns VALIDATION_FAILED with structured bounds instead of an English sentence', async () => {
    const res = await POST(req({ ...validBody, rent: '10' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    // The client builds its own translated phrase out of field + min + max.
    expect(body.errors).toEqual([
      expect.objectContaining({ field: 'rent', min: 100, max: 30_000 }),
    ]);
  });

  it('rejects a negative utility with the same {field, min, max} shape', async () => {
    const res = await POST(req({ ...validBody, water: '-5' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.errors).toEqual([expect.objectContaining({ field: 'water', min: 0, max: 2_000 })]);
  });

  it('returns ALREADY_EXISTS in `error` with the report id to edit', async () => {
    mockBuildingLookup({ byAddress: [building] });
    h.reportFindFirst.mockResolvedValue({ id: 'r-existing' });
    const res = await POST(req(validBody));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: 'ALREADY_EXISTS',
      code: 'ALREADY_EXISTS',
      reportId: 'r-existing',
    });
  });

  it('returns CITY_NOT_FOUND for an unknown city slug', async () => {
    h.cityFindUnique.mockResolvedValue(null);
    const res = await POST(req(validBody));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: 'CITY_NOT_FOUND' });
  });

  it('returns MISSING_CITY when the body carries no city slug', async () => {
    const res = await POST(req({ ...validBody, citySlug: '' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: 'MISSING_CITY' });
  });

  it('returns INTERNAL_ERROR as a code on an unexpected failure', async () => {
    h.cityFindUnique.mockRejectedValue(new Error('db down'));
    const res = await POST(req(validBody));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: 'INTERNAL_ERROR' });
  });
});

// Two people filling the form for the same new address at once (the link in a
// building's chat) used to cost one of them the whole form: their insert lost on
// a unique index and the P2002 surfaced as a 500.
describe('POST /api/cost-reports — concurrent building creation', () => {
  it('recovers from P2002 by re-reading the building the winner created', async () => {
    mockBuildingLookup({ byAddress: [null, racedBuilding] });
    h.buildingCreate.mockRejectedValueOnce(p2002());

    const res = await POST(req(validBody));

    expect(res.status).toBe(201);
    // No second insert attempt: the address already exists, so the report joins it.
    expect(h.buildingCreate).toHaveBeenCalledTimes(1);
    expect(h.reportCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ buildingId: 'b-winner' }) }),
    );
  });

  it('retries once with a stable suffixed slug when a different address owns the slug', async () => {
    // The address is genuinely new (both reads empty) — the conflict is the slug.
    mockBuildingLookup({ byAddress: [null] });
    h.buildingCreate.mockRejectedValueOnce(p2002()).mockResolvedValueOnce(building);

    const res = await POST(req(validBody));

    expect(res.status).toBe(201);
    expect(h.buildingCreate).toHaveBeenCalledTimes(2);
    const firstSlug = h.buildingCreate.mock.calls[0][0].data.slug;
    const secondSlug = h.buildingCreate.mock.calls[1][0].data.slug;
    expect(secondSlug).not.toBe(firstSlug);
    expect(secondSlug.startsWith(`${firstSlug}-`)).toBe(true);

    // Stable, not `Date.now()`: two racing requests must derive the SAME slug,
    // so one loses on the unique index and recovers — rather than both
    // succeeding and splitting one building's reports across two rows.
    h.buildingCreate.mockClear();
    h.buildingCreate.mockRejectedValueOnce(p2002()).mockResolvedValueOnce(building);
    mockBuildingLookup({ byAddress: [null] });
    await POST(req(validBody));
    expect(h.buildingCreate.mock.calls[1][0].data.slug).toBe(secondSlug);
  });

  it('takes the suffixed slug straight away when the pre-check sees it taken', async () => {
    mockBuildingLookup({ byAddress: [null], bySlug: { id: 'other-building' } });

    const res = await POST(req(validBody));

    expect(res.status).toBe(201);
    expect(h.buildingCreate).toHaveBeenCalledTimes(1);
    expect(h.buildingCreate.mock.calls[0][0].data.slug).toMatch(/^marszalkowska-1-[a-z0-9]+$/);
  });

  it('still fails loudly on a non-P2002 database error', async () => {
    mockBuildingLookup({ byAddress: [null] });
    h.buildingCreate.mockRejectedValue(new Error('connection reset'));
    const res = await POST(req(validBody));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: 'INTERNAL_ERROR' });
  });
});

describe('POST /api/cost-reports — duplicate-report races', () => {
  it('catches a duplicate created between the first check and the insert', async () => {
    mockBuildingLookup({ byAddress: [building] });
    // Clear on the pre-flight read, taken by the time we are about to insert.
    h.reportFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'r-raced' });

    const res = await POST(req(validBody));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: 'ALREADY_EXISTS',
      reportId: 'r-raced',
    });
    expect(h.reportCreate).not.toHaveBeenCalled();
  });

  it('answers a P2002 on the report insert with 409, not 500', async () => {
    // Reachable once a unique index backs one-report-per-building; handled now
    // so adding that index never turns a finished form into a server error.
    mockBuildingLookup({ byAddress: [building] });
    h.reportFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'r-duplicate' });
    h.reportCreate.mockRejectedValue(p2002());

    const res = await POST(req(validBody));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: 'ALREADY_EXISTS',
      reportId: 'r-duplicate',
    });
  });
});
