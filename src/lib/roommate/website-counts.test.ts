import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { cacheCalls, findMany, revalidateTag } = vi.hoisted(() => ({
  cacheCalls: [] as { keyParts: unknown; options: unknown }[],
  findMany: vi.fn(),
  revalidateTag: vi.fn(),
}));

// A pass-through cache that records how it was configured, and a recorded `revalidateTag`.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown, keyParts: unknown, options: unknown) => {
    cacheCalls.push({ keyParts, options });
    return fn;
  },
  revalidateTag,
}));
vi.mock('@/lib/prisma', () => ({ prisma: { roommateProfile: { findMany } } }));

import { activeProfilesWhere } from './counts';
import {
  FLATMATE_COUNTS_REVALIDATE_SECONDS,
  loadFlatmateBlockCounts,
  revalidateRoommateCounts,
} from './website-counts';

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

  it('is cached for one hour (Assumption, D68) under the v2 key with the roommate-counts tag', () => {
    expect(FLATMATE_COUNTS_REVALIDATE_SECONDS).toBe(3600);
    expect(cacheCalls).toEqual([
      {
        keyParts: ['roommate-website-counts-v2'],
        options: { revalidate: 3600, tags: ['roommate-counts'] },
      },
    ]);
  });

  it('reads the active profiles once and returns the Warsaw total, the top five and every named district', async () => {
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
      // Żoliborz is below the top five and still has its own count; "any" (5) is in none.
      byDistrict: { mokotow: 3, wola: 2, bemowo: 1, bielany: 1, ochota: 1, zoliborz: 1 },
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    const [{ where, select }] = findMany.mock.calls[0] as [{ where: unknown; select: unknown }];
    expect(select).toEqual({ id: true, districtSlugs: true, anyDistrict: true });
    expect(where).toEqual(activeProfilesWhere((where as { expiresAt: { gt: Date } }).expiresAt.gt));
  });

  it('PRD 4 §5 example 4: total 5, byDistrict { mokotow: 2, ochota: 2, wola: 1 }, the top list unchanged', async () => {
    // The active rows of the example (P5 hidden, P6 expired and P9 blocked are filtered by the query).
    findMany.mockResolvedValue([
      profile('P1', ['mokotow', 'ochota']),
      profile('P2', ['mokotow']),
      profile('P3', [], true),
      profile('P4', ['wola']),
      profile('P7', ['ochota']),
    ]);
    await expect(loadFlatmateBlockCounts()).resolves.toEqual({
      status: 'counts',
      total: 5,
      top: [
        { slug: 'mokotow', count: 2 },
        { slug: 'ochota', count: 2 },
        { slug: 'wola', count: 1 },
      ],
      byDistrict: { mokotow: 2, ochota: 2, wola: 1 },
    });
  });

  it('zero profiles: total 0 and no districts', async () => {
    findMany.mockResolvedValue([]);
    await expect(loadFlatmateBlockCounts()).resolves.toEqual({
      status: 'counts',
      total: 0,
      top: [],
      byDistrict: {},
    });
  });

  it('a database error: unavailable, only the message logged', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    findMany.mockRejectedValue(new Error('connection refused'));
    await expect(loadFlatmateBlockCounts()).resolves.toEqual({ status: 'unavailable' });
    expect(error).toHaveBeenCalledWith('[roommate] website counts failed', 'connection refused');
  });
});

describe('revalidateRoommateCounts', () => {
  beforeEach(() => {
    revalidateTag.mockReset();
  });

  it('expires the roommate-counts tag now ({ expire: 0 }), once per call', () => {
    revalidateRoommateCounts();
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith('roommate-counts', { expire: 0 });
  });

  it('never throws: outside a Next request (bot:dev) the throw is swallowed and nothing is logged', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    revalidateTag.mockImplementation(() => {
      throw new Error(
        'Invariant: static generation store missing in revalidateTag roommate-counts',
      );
    });
    expect(() => revalidateRoommateCounts()).not.toThrow();
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
