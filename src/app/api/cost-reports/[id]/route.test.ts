import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Shared mock state, hoisted so the vi.mock factories can read it.
const h = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  findFirst: vi.fn(),
  update: vi.fn(),
  count: vi.fn(),
  findProfile: vi.fn(),
  updateProfile: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: h.user } })) },
  })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    costReport: { findFirst: h.findFirst, update: h.update, count: h.count },
    profile: { findUnique: h.findProfile, update: h.updateProfile },
  },
}));

vi.mock('next/cache', () => ({
  revalidateTag: h.revalidateTag,
  revalidatePath: h.revalidatePath,
}));

// Imported after the mocks are registered.
import { PATCH } from './route';

const BUILDING = { slug: 'grzybowska-4', city: { slug: 'warsaw' } };

/** A body that passes validation and is never flagged. */
const CLEAN_BODY = { rent: '3000', areaM2: '50', rentalType: 'apartment' };
/** Valid, but the implausible internet figure trips the soft flag. */
const FLAGGED_BODY = { ...CLEAN_BODY, internet: '5000' };

function patch(body: unknown, id = 'r1') {
  return PATCH({ json: async () => body } as unknown as NextRequest, {
    params: Promise.resolve({ id }),
  });
}

/** The `data` object handed to prisma.costReport.update. */
function updateData(): Record<string, unknown> {
  return h.update.mock.calls[0][0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: 'u1', email: 'tenant@example.com' };
  h.findProfile.mockResolvedValue({ deletedAt: null });
  h.findFirst.mockResolvedValue({
    id: 'r1',
    isVisible: true,
    verificationStatus: 'unverified',
    building: BUILDING,
  });
  h.update.mockResolvedValue({ id: 'r1' });
  h.updateProfile.mockResolvedValue({});
  // [visible reports, flagged-and-hidden reports]
  h.count.mockResolvedValue(0);
});

describe('PATCH /api/cost-reports/[id] — fields the edit must persist', () => {
  it('saves leaseType (the form requires it; the route used to drop it silently)', async () => {
    h.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const res = await patch({ ...CLEAN_BODY, leaseType: 'okazjonalny' });

    expect(res.status).toBe(200);
    expect(updateData().leaseType).toBe('okazjonalny');
  });

  it('clears leaseType to null when the edit sends none', async () => {
    h.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await patch(CLEAN_BODY);

    expect(updateData().leaseType).toBeNull();
  });
});

describe('PATCH /api/cost-reports/[id] — moderation survives an author edit', () => {
  it('keeps a report an admin hid out of the public data', async () => {
    // Admin hiding flips isVisible only, leaving verificationStatus alone.
    h.findFirst.mockResolvedValue({
      id: 'r1',
      isVisible: false,
      verificationStatus: 'unverified',
      building: BUILDING,
    });

    await patch(CLEAN_BODY);

    expect(updateData().isVisible).toBe(false);
    expect(updateData().verificationStatus).toBe('unverified');
  });

  it('does not stamp "flagged" on a moderator-hidden report, so a later clean edit cannot free it', async () => {
    h.findFirst.mockResolvedValue({
      id: 'r1',
      isVisible: false,
      verificationStatus: 'unverified',
      building: BUILDING,
    });

    await patch(FLAGGED_BODY);

    expect(updateData().isVisible).toBe(false);
    expect(updateData().verificationStatus).toBe('unverified');
  });

  it('still republishes a report the validator auto-flagged once the numbers are fixed', async () => {
    h.findFirst.mockResolvedValue({
      id: 'r1',
      isVisible: false,
      verificationStatus: 'flagged',
      building: BUILDING,
    });
    h.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await patch(CLEAN_BODY);

    expect(updateData().isVisible).toBe(true);
    expect(updateData().verificationStatus).toBe('unverified');
  });
});

describe('PATCH /api/cost-reports/[id] — contributor status', () => {
  it('survives a flagged edit while another report of the author is still visible', async () => {
    // Two other visible reports; this edit is flagged.
    h.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const res = await patch(FLAGGED_BODY);

    await expect(res.json()).resolves.toMatchObject({ wasFlagged: true });
    expect(h.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ data: { hasContributedCost: true } }),
    );
  });

  it('is revoked when the author has no visible report left', async () => {
    h.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    await patch(FLAGGED_BODY);

    expect(h.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ data: { hasContributedCost: false } }),
    );
  });
});

describe('PATCH /api/cost-reports/[id] — cache invalidation', () => {
  it('drops the costs caches and the building page in every locale', async () => {
    h.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await patch(CLEAN_BODY);

    expect(h.revalidateTag).toHaveBeenCalledWith('costs', { expire: 0 });
    const paths = h.revalidatePath.mock.calls.map((c) => c[0]);
    // Unprefixed default locale (localePrefix: 'as-needed') + every prefixed URL.
    expect(paths).toEqual(
      expect.arrayContaining([
        '/warsaw/building/grzybowska-4',
        '/pl/warsaw/building/grzybowska-4',
        '/en/warsaw/building/grzybowska-4',
        '/ru/warsaw/building/grzybowska-4',
        '/uk/warsaw/building/grzybowska-4',
      ]),
    );
  });

  it('still returns the saved report when revalidation throws', async () => {
    h.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    h.revalidateTag.mockImplementation(() => {
      throw new Error('static generation store missing');
    });

    const res = await patch(CLEAN_BODY);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ costReport: { id: 'r1' } });
  });
});
