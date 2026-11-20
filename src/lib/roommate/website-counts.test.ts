import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { cacheCalls, findMany } = vi.hoisted(() => ({
  cacheCalls: [] as { keyParts: unknown; options: unknown }[],
  findMany: vi.fn(),
}));

// A pass-through cache that records how it was configured.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown, keyParts: unknown, options: unknown) => {
    cacheCalls.push({ keyParts, options });
    return fn;
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma: { roommateProfile: { findMany } } }));

import { activeProfilesWhere } from './counts';
import { FLATMATE_COUNTS_REVALIDATE_SECONDS, loadFlatmateBlockCounts } from './website-counts';

const profile = (id: string, districtSlugs: string[], anyDistrict = false) => ({
  id,
  districtSlugs,
  anyDistrict,
});

describe('loadFlatmateBlockCounts', () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is cached for one hour (Assumption, D68)', () => {
    expect(FLATMATE_COUNTS_REVALIDATE_SECONDS).toBe(3600);
    expect(cacheCalls).toContainEqual({
      keyParts: ['roommate-website-counts-v1'],
      options: { revalidate: 3600 },
    });
  });

  it('reads the active profiles once and returns the Warsaw total and the top five districts', async () => {
    findMany.mockResolvedValue([
      profile('1', ['mokotow', 'wola']),
      profile('2', ['mokotow']),
      profile('3', ['wola']),
      profile('4', ['mokotow']),
      profile('5', [], true),
      profile('6', ['bemowo']),
      profile('7', ['bielany']),
      profile('8', ['ochota']),
      profile('9', ['zoliborz']),
    ]);
    await expect(loadFlatmateBlockCounts()).resolves.toEqual({
      status: 'counts',
      total: 9,
      top: [
        { slug: 'mokotow', count: 3 },
        { slug: 'wola', count: 2 },
        { slug: 'bemowo', count: 1 },
        { slug: 'bielany', count: 1 },
        { slug: 'ochota', count: 1 },
      ],
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    const [{ where, select }] = findMany.mock.calls[0] as [{ where: unknown; select: unknown }];
    expect(select).toEqual({ id: true, districtSlugs: true, anyDistrict: true });
    expect(where).toEqual(activeProfilesWhere((where as { expiresAt: { gt: Date } }).expiresAt.gt));
  });

  it('zero profiles: total 0 and no districts', async () => {
    findMany.mockResolvedValue([]);
    await expect(loadFlatmateBlockCounts()).resolves.toEqual({
      status: 'counts',
      total: 0,
      top: [],
    });
  });

  it('a database error: unavailable, only the message logged', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    findMany.mockRejectedValue(new Error('connection refused'));
    await expect(loadFlatmateBlockCounts()).resolves.toEqual({ status: 'unavailable' });
    expect(error).toHaveBeenCalledWith('[roommate] website counts failed', 'connection refused');
  });
});
