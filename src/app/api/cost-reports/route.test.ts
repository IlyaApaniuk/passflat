import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Shared mock state, hoisted so the vi.mock factories can read it.
const h = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  count: vi.fn(),
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
  prisma: { costReport: { count: h.count } },
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
});

describe('POST /api/cost-reports — auth & rate-limit guards', () => {
  it('returns 401 when the request is unauthenticated', async () => {
    h.user = null;
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(h.count).not.toHaveBeenCalled();
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
});
