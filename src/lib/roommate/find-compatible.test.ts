import type { RoommateProfile } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The candidate loader of spec 07 §Compatibility (FR-24): `findCompatible` over an in-memory
 * Prisma fake whose `findMany` applies the query's `where` (the counts' active definition, not
 * self, the reaction and report relations), so reacted, skipped-by, reported and inactive
 * profiles sit in the table and the test proves they are left out; then the pure rule and the
 * order `coalesce(renewed_at, activated_at)` newest first. A second group feeds a mocked
 * candidate list straight to the filter. Nothing reaches a database.
 */

type Chat = { blockedAt: Date | null; roommateBannedAt: Date | null };
type Row = Pick<
  RoommateProfile,
  | 'id'
  | 'status'
  | 'expiresAt'
  | 'activatedAt'
  | 'renewedAt'
  | 'districtSlugs'
  | 'anyDistrict'
  | 'budgetBand'
  | 'moveInMonth'
  | 'languages'
  | 'gender'
  | 'prefers'
> & { chat: Chat };
type Reaction = { fromProfileId: string; toProfileId: string; kind: 'interest' | 'skip' };
type Report = { reporterProfileId: string | null; targetProfileId: string | null };
type Where = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = {
    rows: [] as Row[],
    reactions: [] as Reaction[],
    reports: [] as Report[],
    fail: null as Error | null,
  };

  const fieldsMatch = (item: Record<string, unknown>, cond: Record<string, unknown>) =>
    Object.entries(cond).every(([key, value]) => item[key] === value);

  /** No related row of `items` (those whose `own` field is the profile's id) matches `cond.none`. */
  function none(items: Record<string, unknown>[], own: string, id: string, cond: unknown): boolean {
    const { none: inner, ...rest } = cond as { none?: Record<string, unknown> };
    if (!inner || Object.keys(rest).length) throw new Error('only `none` is supported');
    return !items.some((item) => item[own] === id && fieldsMatch(item, inner));
  }

  function matches(row: Row, where: Where): boolean {
    return Object.entries(where).every(([key, cond]) => {
      switch (key) {
        case 'status':
          return row.status === cond;
        case 'expiresAt': {
          const { gt, ...rest } = cond as { gt?: Date };
          if (!gt || Object.keys(rest).length) throw new Error('only `gt` on expiresAt');
          return row.expiresAt instanceof Date && row.expiresAt.getTime() > gt.getTime();
        }
        case 'chat':
          return fieldsMatch(row.chat, cond as Record<string, unknown>);
        case 'id': {
          const { not, ...rest } = cond as { not?: string };
          if (not === undefined || Object.keys(rest).length) throw new Error('only `not` on id');
          return row.id !== not;
        }
        case 'reactionsGot':
          return none(state.reactions, 'toProfileId', row.id, cond);
        case 'reactionsGiven':
          return none(state.reactions, 'fromProfileId', row.id, cond);
        case 'reportsReceived':
          return none(state.reports, 'targetProfileId', row.id, cond);
        case 'reportsMade':
          return none(state.reports, 'reporterProfileId', row.id, cond);
        default:
          throw new Error(`unsupported filter on ${key}`);
      }
    });
  }

  return {
    state,
    prisma: {
      roommateProfile: {
        findMany: vi.fn(async ({ where }: { where: Where }) => {
          if (state.fail) throw state.fail;
          // The database's own order is not the result's: hand rows back reversed.
          return state.rows
            .filter((row) => matches(row, where))
            .map(({ chat: _chat, ...profile }) => structuredClone(profile))
            .reverse();
        }),
      },
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }));

import { isCompatible } from './compatibility';
import { findCompatible } from './store';

const NOW = new Date('2026-12-05T10:00:00Z');
const LATER = new Date('2027-01-04T10:00:00Z');
const OPEN: Chat = { blockedAt: null, roommateBannedAt: null };
const month = (year: number, m: number) => new Date(Date.UTC(year, m - 1, 1));
const at = (iso: string) => new Date(iso);

function row(id: string, fields: Partial<Row> = {}): Row {
  return {
    id,
    status: 'active',
    expiresAt: LATER,
    activatedAt: at('2026-11-10T10:00:00Z'),
    renewedAt: null,
    // Golden B of PRD 3 §5 example 3: compatible with A.
    districtSlugs: ['ochota'],
    anyDistrict: false,
    budgetBand: 'b4',
    moveInMonth: month(2027, 3),
    languages: ['en', 'pl'],
    gender: 'woman',
    prefers: 'anyone',
    chat: OPEN,
    ...fields,
  };
}

/** A = Mokotów + Ochota, b3, February 2027, RU + EN, woman, live with women. */
const A = row('A', {
  districtSlugs: ['mokotow', 'ochota'],
  budgetBand: 'b3',
  moveInMonth: month(2027, 2),
  languages: ['ru', 'en'],
  prefers: 'women',
});

const TABLE: Row[] = [
  A,
  // Visible and compatible, in an order unrelated to the expected one.
  row('T2', { activatedAt: at('2026-11-22T10:00:00Z') }),
  row('B', { activatedAt: at('2026-12-01T10:00:00Z') }),
  row('R4', { activatedAt: at('2026-11-25T10:00:00Z') }),
  row('B2', { activatedAt: at('2026-11-20T10:00:00Z'), renewedAt: at('2026-12-04T10:00:00Z') }),
  row('O1', { activatedAt: at('2026-11-23T10:00:00Z') }),
  row('N1', { activatedAt: at('2026-12-05T08:00:00Z') }),
  row('T1', { activatedAt: at('2026-11-22T10:00:00Z') }),
  row('B3', { activatedAt: at('2026-12-02T10:00:00Z') }),
  // Visible, not compatible: golden C – H.
  row('C', {
    districtSlugs: ['wola'],
    budgetBand: 'b3',
    moveInMonth: month(2027, 2),
    languages: ['ru'],
  }),
  row('D', {
    districtSlugs: [],
    anyDistrict: true,
    budgetBand: 'b3',
    moveInMonth: month(2027, 4),
    languages: ['ru'],
  }),
  row('E', {
    districtSlugs: ['mokotow'],
    budgetBand: 'b3',
    moveInMonth: month(2027, 2),
    languages: ['ru'],
    gender: null,
  }),
  row('F', {
    districtSlugs: ['mokotow'],
    budgetBand: 'b1',
    moveInMonth: month(2027, 2),
    languages: ['ru'],
  }),
  row('G', {
    districtSlugs: ['mokotow'],
    budgetBand: 'b3',
    moveInMonth: month(2027, 2),
    languages: ['uk'],
  }),
  row('H', {
    districtSlugs: [],
    anyDistrict: true,
    budgetBand: 'b2',
    moveInMonth: month(2027, 1),
    languages: ['ru', 'uk'],
    prefers: 'men',
  }),
  // Compatible by the rule, left out by the query.
  row('R1'), // A was interested
  row('R2'), // A skipped
  row('R3'), // skipped A
  row('P1'), // A reported
  row('P2'), // reported A
  row('HID', { status: 'hidden' }),
  row('EXP', { status: 'expired', expiresAt: at('2026-12-01T10:00:00Z') }),
  row('DUE', { expiresAt: NOW }), // past expires_at by time, not marked yet
  row('BLK', { chat: { blockedAt: at('2026-12-02T10:00:00Z'), roommateBannedAt: null } }),
  row('BAN', { chat: { blockedAt: null, roommateBannedAt: at('2026-12-02T10:00:00Z') } }),
];

const REACTIONS: Reaction[] = [
  { fromProfileId: 'A', toProfileId: 'R1', kind: 'interest' },
  { fromProfileId: 'A', toProfileId: 'R2', kind: 'skip' },
  { fromProfileId: 'R3', toProfileId: 'A', kind: 'skip' },
  // Interest in A does not hide R4 from A: a match is still possible.
  { fromProfileId: 'R4', toProfileId: 'A', kind: 'interest' },
  // Other pairs change nothing for A.
  { fromProfileId: 'B', toProfileId: 'O1', kind: 'skip' },
  { fromProfileId: 'O1', toProfileId: 'B3', kind: 'interest' },
];

const REPORTS: Report[] = [
  { reporterProfileId: 'A', targetProfileId: 'P1' },
  { reporterProfileId: 'P2', targetProfileId: 'A' },
  { reporterProfileId: 'C', targetProfileId: 'O1' },
  // A deleted reporter nulls the reference (D55): the report no longer ties O1 to anyone.
  { reporterProfileId: null, targetProfileId: 'O1' },
  { reporterProfileId: 'O1', targetProfileId: null },
];

const EXPECTED = ['N1', 'B2', 'B3', 'B', 'R4', 'O1', 'T1', 'T2'];

beforeEach(() => {
  vi.clearAllMocks();
  db.state.rows = structuredClone(TABLE);
  db.state.reactions = structuredClone(REACTIONS);
  db.state.reports = structuredClone(REPORTS);
  db.state.fail = null;
});

const ids = (profiles: { id: string }[]) => profiles.map((profile) => profile.id);

describe('findCompatible over the table', () => {
  it('loads the candidates in one query: active, not self, not reacted to, not skipped by, no report either way', async () => {
    await findCompatible(A, NOW);
    expect(db.prisma.roommateProfile.findMany).toHaveBeenCalledTimes(1);
    expect(db.prisma.roommateProfile.findMany).toHaveBeenCalledWith({
      where: {
        status: 'active',
        expiresAt: { gt: NOW },
        chat: { blockedAt: null, roommateBannedAt: null },
        id: { not: 'A' },
        reactionsGot: { none: { fromProfileId: 'A' } },
        reactionsGiven: { none: { toProfileId: 'A', kind: 'skip' } },
        reportsReceived: { none: { reporterProfileId: 'A' } },
        reportsMade: { none: { targetProfileId: 'A' } },
      },
    });
  });

  it('returns the compatible candidates newest first by coalesce(renewed_at, activated_at), ties by id', async () => {
    expect(ids(await findCompatible(A, NOW))).toEqual(EXPECTED);
  });

  it('equals the pure rule over the loaded candidates', async () => {
    const result = await findCompatible(A, NOW);
    const loaded = (await db.prisma.roommateProfile.findMany.mock.results[0].value) as Row[];
    expect(new Set(ids(result))).toEqual(
      new Set(ids(loaded.filter((candidate) => isCompatible(A, candidate)))),
    );
    expect(ids(loaded).sort()).toEqual([...EXPECTED, 'C', 'D', 'E', 'F', 'G', 'H'].sort());
  });

  it('leaves out every profile A reacted to, every one that skipped A and every report either way', async () => {
    const result = ids(await findCompatible(A, NOW));
    for (const id of ['R1', 'R2', 'R3', 'P1', 'P2']) expect(result).not.toContain(id);
    expect(result).toContain('R4');
    expect(result).toContain('O1');
  });

  it('leaves out the profile itself, hidden, expired, past expires_at, blocked and banned', async () => {
    const result = ids(await findCompatible(A, NOW));
    for (const id of ['A', 'HID', 'EXP', 'DUE', 'BLK', 'BAN']) expect(result).not.toContain(id);
  });

  it('leaves out golden C – H, which the rule refuses', async () => {
    const result = ids(await findCompatible(A, NOW));
    for (const id of ['C', 'D', 'E', 'F', 'G', 'H']) expect(result).not.toContain(id);
  });

  it('a profile at its expires_at is out, a second before it is in', async () => {
    db.state.rows = [A, row('X', { expiresAt: NOW })];
    expect(ids(await findCompatible(A, NOW))).toEqual([]);
    expect(ids(await findCompatible(A, new Date(NOW.getTime() - 1000)))).toEqual(['X']);
  });

  it('a renewal moves a profile to the front, a later activation beats an older renewal', async () => {
    db.state.rows = [
      A,
      row('OLD', {
        activatedAt: at('2026-10-01T10:00:00Z'),
        renewedAt: at('2026-12-03T10:00:00Z'),
      }),
      row('NEW', { activatedAt: at('2026-12-04T10:00:00Z') }),
      row('MID', {
        activatedAt: at('2026-11-01T10:00:00Z'),
        renewedAt: at('2026-11-30T10:00:00Z'),
      }),
    ];
    expect(ids(await findCompatible(A, NOW))).toEqual(['NEW', 'OLD', 'MID']);
  });

  it('nobody compatible gives an empty list', async () => {
    db.state.rows = [A, TABLE.find((r) => r.id === 'C')!];
    expect(await findCompatible(A, NOW)).toEqual([]);
  });

  it('passes a database error on', async () => {
    db.state.fail = new Error('connection lost');
    await expect(findCompatible(A, NOW)).rejects.toThrow('connection lost');
  });

  it('the result does not depend on the time zone of the machine', async () => {
    vi.stubEnv('TZ', 'UTC');
    try {
      expect(ids(await findCompatible(A, NOW))).toEqual(EXPECTED);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('findCompatible over a mocked candidate list', () => {
  it('returns exactly what the pure rule accepts, in the order of the rule', async () => {
    const list = [
      row('C', { districtSlugs: ['wola'] }),
      row('B', { activatedAt: at('2026-12-01T10:00:00Z') }),
      row('F', { budgetBand: 'b1', activatedAt: at('2026-12-04T10:00:00Z') }),
      row('B2', { activatedAt: at('2026-11-20T10:00:00Z'), renewedAt: at('2026-12-04T10:00:00Z') }),
      row('E', { gender: null, activatedAt: at('2026-12-05T09:00:00Z') }),
      row('B3', { activatedAt: at('2026-12-02T10:00:00Z') }),
    ].map(({ chat: _chat, ...profile }) => profile);
    db.prisma.roommateProfile.findMany.mockResolvedValueOnce(list as never);

    const result = await findCompatible(A, NOW);

    expect(ids(result)).toEqual(['B2', 'B3', 'B']);
    expect(new Set(ids(result))).toEqual(new Set(ids(list.filter((p) => isCompatible(A, p)))));
    // The rows come back as loaded, not copies with fields dropped.
    expect(result[0]).toBe(list[3]);
  });
});
