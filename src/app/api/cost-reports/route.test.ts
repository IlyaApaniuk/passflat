import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Shared mock state, hoisted so the vi.mock factories can read it.
const h = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  count: vi.fn(),
  findProfile: vi.fn(),
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
  prisma: { costReport: { count: h.count }, profile: { findUnique: h.findProfile } },
}));

vi.mock('@/lib/posthog-server', () => ({
  trackServerEvent: vi.fn(),
  flushPostHog: vi.fn(),
  captureServerException: vi.fn(),
}));

// Imported after the mocks are registered.
import { POST } from './route';

function req(body?: unknown): NextRequest {
  return { json: async () => body ?? {}, headers: new Headers() } as unknown as NextRequest;
}

beforeEach(() => {
  h.user = null;
  h.count.mockReset();
  // Live account by default; the soft-deleted case is asserted separately.
  h.findProfile.mockReset().mockResolvedValue({ deletedAt: null });
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
    await expect(res.json()).resolves.toMatchObject({ code: 'ACCOUNT_DELETED' });
    expect(h.count).not.toHaveBeenCalled();
  });
});
