import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  deletedAt: null as string | null,
  getUser: vi.fn(),
}));

// next-intl's ESM build cannot be loaded by Vitest (`next/server` without an
// extension); every path in these tests carries no locale redirect, so the
// intl step is a pass-through.
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

// Supabase is never called for real: the session and the profile row are stubs.
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: h.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { deleted_at: h.deletedAt } }) }),
      }),
    }),
  })),
}));

import middleware from './middleware';

function run(path: string) {
  return middleware(new NextRequest(`http://localhost${path}`));
}

function loginNext(location: string | null): string | null {
  expect(location).not.toBeNull();
  const url = new URL(location!);
  expect(url.pathname).toMatch(/\/auth\/login$/);
  return url.searchParams.get('next');
}

beforeEach(() => {
  h.user = null;
  h.deletedAt = null;
  h.getUser.mockReset();
  h.getUser.mockImplementation(async () => ({ data: { user: h.user } }));
});

describe('middleware sign-in redirect', () => {
  it('keeps the query string of /create-listing in next', async () => {
    const res = await run('/ru/create-listing?type=roommate');
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(new URL(location!).pathname).toBe('/ru/auth/login');
    expect(loginNext(location)).toBe('/ru/create-listing?type=roommate');
  });

  it('keeps the query string for the default locale without a prefix', async () => {
    const res = await run('/create-listing?type=roommate');
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(new URL(location!).pathname).toBe('/pl/auth/login');
    expect(loginNext(location)).toBe('/create-listing?type=roommate');
  });

  it.each(['/en/dashboard', '/ru/messages', '/uk/create-listing'])(
    'redirects %s without a query with next unchanged',
    async (path) => {
      const res = await run(path);
      expect(res.status).toBe(307);
      expect(loginNext(res.headers.get('location'))).toBe(path);
    },
  );

  it('keeps the query string of other protected paths', async () => {
    const res = await run('/en/dashboard?tab=costs');
    expect(loginNext(res.headers.get('location'))).toBe('/en/dashboard?tab=costs');
  });

  it('drops a query that fails safeNextPath and keeps the path', async () => {
    const res = await run('/ru/create-listing?type=%0Abad');
    expect(loginNext(res.headers.get('location'))).toBe('/ru/create-listing');
  });

  it('lets a signed-in user through to /create-listing', async () => {
    h.user = { id: 'user-1' };
    const res = await run('/ru/create-listing?type=roommate');
    expect(res.headers.get('location')).toBeNull();
    expect(res.status).toBe(200);
  });

  it('serves the direct sign-in link of the empty state without an auth check', async () => {
    const next = encodeURIComponent('/ru/create-listing?type=roommate');
    const res = await run(`/ru/auth/login?next=${next}`);
    expect(res.headers.get('location')).toBeNull();
    expect(res.status).toBe(200);
    expect(h.getUser).not.toHaveBeenCalled();
  });
});
