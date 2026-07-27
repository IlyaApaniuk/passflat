import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Shared mock state, hoisted so the vi.mock factories can read it.
const h = vi.hoisted(() => ({
  user: { id: '11111111-1111-4111-8111-111111111111' } as null | { id: string },
  createMany: vi.fn(),
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
  prisma: { savedListing: { createMany: h.createMany } },
}));

// Imported after the mocks are registered.
import { POST } from './route';

const uuid = (n: number) => `1111111${n % 10}-1111-4111-8111-11111111111${n % 10}`;

function req(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

beforeEach(() => {
  h.user = { id: '11111111-1111-4111-8111-111111111111' };
  h.createMany.mockReset().mockResolvedValue({ count: 0 });
});

describe('POST /api/favorites/sync', () => {
  it('syncs a normal batch of ids', async () => {
    const res = await POST(req({ listingIds: [uuid(1), uuid(2)] }));
    expect(res.status).toBe(200);
    expect(h.createMany).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized batch instead of inserting it', async () => {
    const res = await POST(req({ listingIds: Array.from({ length: 201 }, (_, i) => uuid(i)) }));
    expect(res.status).toBe(400);
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it('rejects non-UUID ids with a 400 rather than a foreign-key 500', async () => {
    const res = await POST(req({ listingIds: [uuid(1), 'not-a-uuid'] }));
    expect(res.status).toBe(400);
    expect(h.createMany).not.toHaveBeenCalled();
  });
});
