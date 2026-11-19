import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The counting rule of PRD 3 FR-16 (spec 06 §Counts): `countRoommates` (pure) and
 * `loadRoommateCounts` over an in-memory Prisma fake that applies the query's `where` (status,
 * `expires_at > now`, the chat relation), so the golden case of PRD 3 §5 example 1 runs with its
 * hidden, expired and blocked profiles in the table. Nothing reaches a database.
 */

type Chat = { blockedAt: Date | null; roommateBannedAt: Date | null };
type Row = {
  id: string;
  status: string;
  expiresAt: Date | null;
  districtSlugs: string[];
  anyDistrict: boolean;
  chat: Chat;
};
type Where = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = {
    rows: [] as Row[],
    reports: [] as { reporterProfileId: string; targetProfileId: string }[],
    fail: null as Error | null,
  };
  /** `relation: { none: {...} }` over the reports: the field that points at the profile. */
  const REPORTS = { reportsReceived: 'targetProfileId', reportsMade: 'reporterProfileId' } as const;

  function matches(row: Record<string, unknown>, where: Where): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (key in REPORTS) {
        const { none, ...rest } = cond as { none?: Record<string, string> };
        if (!none || Object.keys(rest).length) throw new Error(`only none on ${key}`);
        const own = REPORTS[key as keyof typeof REPORTS];
        return !state.reports.some(
          (report) =>
            report[own] === row.id &&
            Object.entries(none).every(([field, id]) => report[field as typeof own] === id),
        );
      }
      const value = row[key];
      if (cond === null) return value === null;
      if (cond instanceof Date || typeof cond !== 'object') return value === cond;
      if (key === 'chat') return matches(value as Record<string, unknown>, cond as Where);
      const { gt } = cond as { gt?: Date };
      if (!gt) throw new Error(`unsupported filter on ${key}`);
      return value instanceof Date && value.getTime() > gt.getTime();
    });
  }

  return {
    state,
    prisma: {
      roommateProfile: {
        findMany: vi.fn(async ({ where }: { where: Where; select: Record<string, true> }) => {
          if (state.fail) throw state.fail;
          return state.rows
            .filter((row) => matches(row, where))
            .map(({ id, districtSlugs, anyDistrict }) => ({
              id,
              districtSlugs: [...districtSlugs],
              anyDistrict,
            }));
        }),
      },
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }));

import {
  TOP_DISTRICTS_FOR_ANY,
  TOP_DISTRICTS_ON_WEBSITE,
  countRoommates,
  loadRoommateCounts,
  type CountedProfile,
} from './counts';

const NOW = new Date('2026-12-05T10:00:00Z');
const LATER = new Date('2027-01-04T10:00:00Z');
const OPEN: Chat = { blockedAt: null, roommateBannedAt: null };

function row(
  id: string,
  districts: string[] | 'any',
  fields: Partial<Omit<Row, 'id' | 'districtSlugs' | 'anyDistrict'>> = {},
): Row {
  return {
    id,
    status: 'active',
    expiresAt: LATER,
    districtSlugs: districts === 'any' ? [] : districts,
    anyDistrict: districts === 'any',
    chat: OPEN,
    ...fields,
  };
}

const counted = (id: string, districts: string[] | 'any'): CountedProfile => ({
  id,
  districtSlugs: districts === 'any' ? [] : districts,
  anyDistrict: districts === 'any',
});

/** PRD 3 §5 example 1: P8 is the viewer, P5 hidden, P6 expired, P9's chat blocked the bot. */
const EXAMPLE_1: Row[] = [
  row('P1', ['mokotow', 'ochota']),
  row('P2', ['mokotow']),
  row('P3', 'any'),
  row('P4', ['wola']),
  row('P5', ['mokotow'], { status: 'hidden' }),
  row('P6', ['mokotow'], { status: 'expired', expiresAt: new Date('2026-12-01T10:00:00Z') }),
  row('P7', ['ochota']),
  row('P8', ['mokotow', 'wola']),
  row('P9', ['mokotow'], {
    chat: { blockedAt: new Date('2026-12-02T10:00:00Z'), roommateBannedAt: null },
  }),
];

const P8 = counted('P8', ['mokotow', 'wola']);
const P8_ANY = counted('P8', 'any');

beforeEach(() => {
  vi.clearAllMocks();
  db.state.rows = structuredClone(EXAMPLE_1);
  db.state.reports = [];
  db.state.fail = null;
});

describe('golden case: PRD 3 §5 example 1', () => {
  it('a viewer with Mokotów + Wola: Mokotów 2, Wola 1, open to any district 1, Warsaw 5 besides you', async () => {
    expect(await loadRoommateCounts(P8, NOW)).toEqual({
      kind: 'districts',
      districts: [
        { slug: 'mokotow', count: 2 },
        { slug: 'wola', count: 1 },
      ],
      anyDistrict: 1,
      total: 5,
    });
  });

  it('a viewer with "any": Warsaw 5 besides you and Mokotów 2, Ochota 2, Wola 1 (ties by slug)', async () => {
    expect(await loadRoommateCounts(P8_ANY, NOW)).toEqual({
      kind: 'top',
      total: 5,
      top: [
        { slug: 'mokotow', count: 2 },
        { slug: 'ochota', count: 2 },
        { slug: 'wola', count: 1 },
      ],
    });
  });

  it("the pure rule over the counted profiles gives the same, the viewer's own row left out", () => {
    const active = [
      counted('P1', ['mokotow', 'ochota']),
      counted('P2', ['mokotow']),
      counted('P3', 'any'),
      counted('P4', ['wola']),
      counted('P7', ['ochota']),
      P8,
    ];
    expect(countRoommates(P8, active)).toEqual({
      kind: 'districts',
      districts: [
        { slug: 'mokotow', count: 2 },
        { slug: 'wola', count: 1 },
      ],
      anyDistrict: 1,
      total: 5,
    });
    expect(countRoommates(P8_ANY, active)).toMatchObject({ kind: 'top', total: 5 });
  });

  it('no result holds a sum of district numbers or a combined count', async () => {
    const result = await loadRoommateCounts(P8, NOW);
    expect(Object.keys(result).sort()).toEqual(['anyDistrict', 'districts', 'kind', 'total']);
    for (const district of result.kind === 'districts' ? result.districts : []) {
      expect(Object.keys(district)).toEqual(['slug', 'count']);
    }
    expect(Object.keys(await loadRoommateCounts(P8_ANY, NOW)).sort()).toEqual([
      'kind',
      'top',
      'total',
    ]);
  });
});

describe('loadRoommateCounts', () => {
  it('reads only the district fields of active, unexpired profiles of open chats in one query', async () => {
    await loadRoommateCounts(P8, NOW);

    expect(db.prisma.roommateProfile.findMany).toHaveBeenCalledTimes(1);
    expect(db.prisma.roommateProfile.findMany).toHaveBeenCalledWith({
      where: {
        status: 'active',
        expiresAt: { gt: NOW },
        chat: { blockedAt: null, roommateBannedAt: null },
        reportsReceived: { none: { reporterProfileId: 'P8' } },
        reportsMade: { none: { targetProfileId: 'P8' } },
      },
      select: { id: true, districtSlugs: true, anyDistrict: true },
    });
  });

  it('leaves out the profiles the viewer reported or was reported by (spec 07 §Report)', async () => {
    db.state.reports = [
      { reporterProfileId: 'P8', targetProfileId: 'P1' },
      { reporterProfileId: 'P4', targetProfileId: 'P8' },
      { reporterProfileId: 'P2', targetProfileId: 'P3' },
    ];
    expect(await loadRoommateCounts(P8, NOW)).toEqual({
      kind: 'districts',
      districts: [
        { slug: 'mokotow', count: 1 },
        { slug: 'wola', count: 0 },
      ],
      anyDistrict: 1,
      total: 3,
    });
    // The website has no viewer: every active profile counts, reported or not.
    expect(await loadRoommateCounts(null, NOW)).toMatchObject({ total: 6 });
    expect(db.prisma.roommateProfile.findMany.mock.calls[1][0].where).toEqual({
      status: 'active',
      expiresAt: { gt: NOW },
      chat: { blockedAt: null, roommateBannedAt: null },
    });
  });

  it('counts by time: an active row at or past expires_at is not counted before the cron marks it', async () => {
    db.state.rows = [
      row('at-now', ['mokotow'], { expiresAt: NOW }),
      row('past', ['mokotow'], { expiresAt: new Date(NOW.getTime() - 1) }),
      row('next-second', ['mokotow'], { expiresAt: new Date(NOW.getTime() + 1000) }),
    ];
    expect(await loadRoommateCounts(P8, NOW)).toMatchObject({
      districts: [
        { slug: 'mokotow', count: 1 },
        { slug: 'wola', count: 0 },
      ],
      total: 1,
    });
  });

  it('leaves out a banned chat, a blocked chat, drafts, expired and hidden profiles', async () => {
    db.state.rows = [
      row('banned', ['wola'], { chat: { blockedAt: null, roommateBannedAt: NOW } }),
      row('blocked', ['wola'], { chat: { blockedAt: NOW, roommateBannedAt: null } }),
      row('draft', ['wola'], { status: 'draft', expiresAt: null }),
      row('expired', ['wola'], { status: 'expired' }),
      row('hidden', ['wola'], { status: 'hidden' }),
      row('counted', ['wola']),
    ];
    expect(await loadRoommateCounts(P8, NOW)).toMatchObject({ total: 1, anyDistrict: 0 });
  });

  it('without a viewer (the website) gives the Warsaw total and the top 5 districts', async () => {
    db.state.rows = [
      ...EXAMPLE_1,
      row('W1', ['bielany', 'zoliborz']),
      row('W2', ['bielany', 'srodmiescie']),
      row('W3', ['praga-polnoc']),
      row('W4', ['zoliborz', 'ursus']),
    ];
    expect(TOP_DISTRICTS_ON_WEBSITE).toBe(5);
    expect(await loadRoommateCounts()).toEqual({
      kind: 'top',
      total: 10,
      top: [
        { slug: 'mokotow', count: 3 },
        { slug: 'bielany', count: 2 },
        { slug: 'ochota', count: 2 },
        { slug: 'wola', count: 2 },
        { slug: 'zoliborz', count: 2 },
      ],
    });
  });

  it('the default `now` is the current time', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    try {
      await loadRoommateCounts();
    } finally {
      vi.useRealTimers();
    }
    const [{ where }] = db.prisma.roommateProfile.findMany.mock.calls[0];
    expect((where as { expiresAt: { gt: Date } }).expiresAt.gt.toISOString()).toBe(
      NOW.toISOString(),
    );
  });

  it('passes a database error on to the caller', async () => {
    db.state.fail = new Error('connection refused');
    await expect(loadRoommateCounts(P8, NOW)).rejects.toThrow('connection refused');
  });
});

describe('countRoommates', () => {
  it('counts a profile naming several districts in each of them', () => {
    const viewer = counted('me', ['mokotow', 'ochota', 'wola']);
    expect(countRoommates(viewer, [counted('a', ['mokotow', 'ochota', 'wola'])])).toEqual({
      kind: 'districts',
      districts: [
        { slug: 'mokotow', count: 1 },
        { slug: 'ochota', count: 1 },
        { slug: 'wola', count: 1 },
      ],
      anyDistrict: 0,
      total: 1,
    });
  });

  it('never adds an "any" profile to a district, even one holding slugs', () => {
    const others = [
      counted('a', 'any'),
      { id: 'b', districtSlugs: ['mokotow'], anyDistrict: true },
      counted('c', ['mokotow']),
    ];
    expect(countRoommates(P8, others)).toEqual({
      kind: 'districts',
      districts: [
        { slug: 'mokotow', count: 1 },
        { slug: 'wola', count: 0 },
      ],
      anyDistrict: 2,
      total: 3,
    });
    expect(countRoommates(P8_ANY, others)).toEqual({
      kind: 'top',
      total: 3,
      top: [{ slug: 'mokotow', count: 1 }],
    });
  });

  it("keeps the viewer's order and gives 0 for a district nobody else named", () => {
    const viewer = counted('me', ['wola', 'bielany', 'mokotow']);
    expect(countRoommates(viewer, [counted('a', ['mokotow'])])).toMatchObject({
      districts: [
        { slug: 'wola', count: 0 },
        { slug: 'bielany', count: 0 },
        { slug: 'mokotow', count: 1 },
      ],
    });
  });

  it('counts a slug repeated in one profile once, and a repeated viewer slug once', () => {
    const viewer = counted('me', ['mokotow', 'mokotow']);
    expect(countRoommates(viewer, [counted('a', ['mokotow', 'mokotow'])])).toMatchObject({
      districts: [{ slug: 'mokotow', count: 1 }],
      total: 1,
    });
  });

  it('excludes the viewer wherever its row appears, and only the viewer', () => {
    const others = [counted('P8', ['mokotow']), counted('x', ['mokotow']), counted('P8', 'any')];
    expect(countRoommates(P8, others)).toMatchObject({
      districts: [
        { slug: 'mokotow', count: 1 },
        { slug: 'wola', count: 0 },
      ],
      anyDistrict: 0,
      total: 1,
    });
  });

  it('gives zeros when nobody else has a profile', () => {
    expect(countRoommates(P8, [P8])).toEqual({
      kind: 'districts',
      districts: [
        { slug: 'mokotow', count: 0 },
        { slug: 'wola', count: 0 },
      ],
      anyDistrict: 0,
      total: 0,
    });
    expect(countRoommates(P8_ANY, [])).toEqual({ kind: 'top', total: 0, top: [] });
    expect(countRoommates(null, [])).toEqual({ kind: 'top', total: 0, top: [] });
  });

  it('an "any" viewer gets at most the three most named districts, only districts named at all', () => {
    expect(TOP_DISTRICTS_FOR_ANY).toBe(3);
    const others = [
      counted('a', ['wola', 'bemowo']),
      counted('b', ['wola', 'ursus']),
      counted('c', ['zoliborz']),
      counted('d', ['bemowo']),
    ];
    expect(countRoommates(P8_ANY, others)).toEqual({
      kind: 'top',
      total: 4,
      top: [
        { slug: 'bemowo', count: 2 },
        { slug: 'wola', count: 2 },
        { slug: 'ursus', count: 1 },
      ],
    });
    expect(countRoommates(P8_ANY, [counted('a', ['wola']), counted('b', 'any')])).toEqual({
      kind: 'top',
      total: 2,
      top: [{ slug: 'wola', count: 1 }],
    });
  });

  it('orders ties by slug, not by the order the profiles come in', () => {
    const forward = [counted('a', ['wola']), counted('b', ['bielany']), counted('c', ['ochota'])];
    const expected = ['bielany', 'ochota', 'wola'];
    expect(countRoommates(null, forward)).toMatchObject({
      top: expected.map((slug) => ({ slug, count: 1 })),
    });
    expect(countRoommates(null, [...forward].reverse())).toMatchObject({
      top: expected.map((slug) => ({ slug, count: 1 })),
    });
  });
});
