import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Every store write that changes who the website counts expires the website's counts once it
 * landed, and only then (spec 09 §District section, freshness; PRD 4 FR-26). The Prisma fake
 * answers each write with the `count` a test sets: 1 = the write landed, 0 = a stale or repeated
 * tap that changed nothing. Nothing reaches a database or Next's cache.
 */

const h = vi.hoisted(() => {
  const state = { count: 1, hidden: { status: 'hidden' as string } };
  const result = async () => ({ count: state.count });
  const fake = {
    roommateProfile: {
      updateMany: vi.fn(result),
      deleteMany: vi.fn(result),
      findUnique: vi.fn(async () => ({
        chatId: 'chat-1',
        status: state.hidden.status,
        expiresAt: new Date('2027-02-01T00:00:00Z'),
        expiredAt: null,
      })),
    },
    roommateReport: {
      count: vi.fn(async () => 0),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    telegramChat: { updateMany: vi.fn(async () => ({ count: 1 })) },
    $transaction: vi.fn(),
  };
  fake.$transaction.mockImplementation(async (run: (tx: typeof fake) => unknown) => run(fake));
  return { state, fake, revalidateRoommateCounts: vi.fn() };
});

vi.mock('@/lib/prisma', () => ({ prisma: h.fake }));
vi.mock('./website-counts', () => ({ revalidateRoommateCounts: h.revalidateRoommateCounts }));

import {
  clearEditStep,
  deleteDraft,
  deleteProfile,
  hideAfterReport,
  liftHide,
  openEditStep,
  renewProfile,
  saveEdit,
  saveProfile,
  setDistrictPick,
  setPushOff,
} from './store';

const NOW = new Date('2026-12-05T10:00:00Z');
const MONTH = new Date('2027-01-01T00:00:00Z');
const PICK = { districtSlugs: ['mokotow'], anyDistrict: false };

beforeEach(() => {
  vi.clearAllMocks();
  h.state.count = 1;
  h.state.hidden.status = 'hidden';
});

/** The write under test, run once with the write landing and once with it changing nothing. */
const COUNTED_WRITES: [string, () => Promise<unknown>][] = [
  ['saveProfile (a draft saved: active)', () => saveProfile('p1', MONTH, NOW)],
  ['saveEdit (an edit stored)', () => saveEdit('p1', 'edit_budget', { budgetBand: 'b2' })],
  ['setDistrictPick at edit_districts', () => setDistrictPick('p1', 'edit_districts', PICK)],
  ['renewProfile', () => renewProfile({ id: 'p1', renewedAt: null }, MONTH, NOW)],
  ['deleteProfile', () => deleteProfile('p1')],
  ['liftHide (moderation restore)', () => liftHide('p1', NOW)],
];

describe('the writes that change who is counted', () => {
  it.each(COUNTED_WRITES)('%s: expires the counts once when the write landed', async (_, write) => {
    await write();
    expect(h.revalidateRoommateCounts).toHaveBeenCalledTimes(1);
  });

  it.each(COUNTED_WRITES)(
    '%s: nothing expires when the write changed nothing',
    async (_, write) => {
      h.state.count = 0;
      h.state.hidden.status = 'active'; // liftHide reads the profile first
      await write();
      expect(h.revalidateRoommateCounts).not.toHaveBeenCalled();
    },
  );

  it('hideAfterReport (moderation hide): expires once for the request whose hide landed', async () => {
    await expect(hideAfterReport({ id: 'p1', chatId: 'chat-1' }, 'under_18', NOW)).resolves.toBe(
      'under_18',
    );
    expect(h.revalidateRoommateCounts).toHaveBeenCalledTimes(1);
  });

  it('hideAfterReport: no hide (rule not met, or another request hid first) → nothing expires', async () => {
    await expect(hideAfterReport({ id: 'p1', chatId: 'chat-1' }, 'fake', NOW)).resolves.toBeNull();
    h.state.count = 0;
    await hideAfterReport({ id: 'p1', chatId: 'chat-1' }, 'under_18', NOW);
    expect(h.revalidateRoommateCounts).not.toHaveBeenCalled();
  });
});

describe('the writes that change nobody counted', () => {
  it.each<[string, () => Promise<unknown>]>([
    [
      'setDistrictPick at the intake step (a draft)',
      () => setDistrictPick('p1', 'districts', PICK),
    ],
    ['deleteDraft', () => deleteDraft('p1')],
    ['openEditStep', () => openEditStep('p1', 'edit_districts')],
    ['clearEditStep', () => clearEditStep('p1', 'edit_districts')],
    ['setPushOff', () => setPushOff('p1', true)],
  ])('%s: the counts stay', async (_, write) => {
    await write();
    expect(h.revalidateRoommateCounts).not.toHaveBeenCalled();
  });
});
