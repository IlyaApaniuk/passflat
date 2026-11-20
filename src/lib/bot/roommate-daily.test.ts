import { GrammyError, type Api } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The roommate daily cron (spec 06 §Daily cron) over in-memory profile, report and chat tables:
 * each housekeeping kind and its event, a doubled run, the send hour, and the claim-send-release
 * helper every later message job uses. Telegram is a fake `api.sendMessage`; the clock is fake.
 */

type ProfileRow = {
  id: string;
  chatId: string;
  status: string;
  step: string | null;
  updatedAt: Date;
  expiresAt: Date | null;
  expiredAt: Date | null;
  renewalRemindedAt: Date | null;
};

type ReportRow = { id: string; createdAt: Date };
type ChatRow = { id: string; chatId: bigint; blockedAt: Date | null };
type Where = Record<string, unknown>;

const h = vi.hoisted(() => ({
  profiles: [] as ProfileRow[],
  reports: [] as ReportRow[],
  chats: [] as ChatRow[],
}));

/** The subset of Prisma's `where` the cron uses. */
function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond === null) return value === null;
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    if (typeof cond === 'object') {
      const c = cond as { in?: unknown[]; not?: unknown; lte?: Date };
      if (c.in && !c.in.includes(value)) return false;
      if ('not' in c && c.not === null && value === null) return false;
      if (c.lte && !(value instanceof Date && value.getTime() <= c.lte.getTime())) return false;
      return true;
    }
    return value === cond;
  });
}

const prismaFake = vi.hoisted(() => ({
  roommateProfile: { findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  roommateReport: { deleteMany: vi.fn() },
  telegramChat: { updateMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaFake }));
vi.mock('./analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/roommate/website-counts', () => ({ revalidateRoommateCounts: vi.fn() }));

import { revalidateRoommateCounts } from '@/lib/roommate/website-counts';

import { track } from './analytics';
import {
  MAX_MESSAGES_PER_RUN,
  MESSAGES_PER_SECOND,
  SEND_BUDGET_MS,
  createCronSender,
  runRoommateDaily,
  runRoommateHousekeeping,
  type CronClock,
  type CronMessage,
  type CronSender,
  type MessageJob,
} from './roommate-daily';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
/** 10:15 Warsaw in winter: the send hour. */
const NOW = new Date('2026-12-30T09:15:00Z');
/** 09:15 Warsaw: the other run of the day. */
const NOT_SEND_HOUR = new Date('2026-12-30T08:15:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

let nextChat = 0;

function seedChat(blockedAt: Date | null = null): ChatRow {
  nextChat += 1;
  const chat = { id: `chat-${nextChat}`, chatId: BigInt(500_000_000 + nextChat), blockedAt };
  h.chats.push(chat);
  return chat;
}

function seedProfile(row: Partial<ProfileRow> & { id: string }): ProfileRow {
  const chat = seedChat();
  const full: ProfileRow = {
    chatId: chat.id,
    status: 'active',
    step: null,
    updatedAt: ago(HOUR),
    expiresAt: new Date(NOW.getTime() + 10 * DAY),
    expiredAt: null,
    renewalRemindedAt: null,
    ...row,
  };
  h.profiles.push(full);
  return full;
}

function profile(id: string): ProfileRow | undefined {
  return h.profiles.find((row) => row.id === id);
}

function tgIdOf(row: ProfileRow): number {
  return Number(h.chats.find((chat) => chat.id === row.chatId)!.chatId);
}

function fakeApi() {
  const sendMessage = vi.fn(async (..._args: unknown[]) => ({}));
  return { api: { sendMessage } as unknown as Api, sendMessage };
}

/** A clock that only moves when the code sleeps or a test advances it. */
function fakeClock(start = 1_000_000): CronClock & { advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    sleep: vi.fn(async (ms: number) => {
      t += ms;
    }),
    advance: (ms) => {
      t += ms;
    },
  };
}

function telegramError(code: number, description: string) {
  return new GrammyError(
    "Call to 'sendMessage' failed!",
    { ok: false, error_code: code, description },
    'sendMessage',
    { chat_id: 500_000_001, text: 'roommate' },
  );
}

/**
 * A message job shaped like the ones later tasks add (the renewal reminder): due profiles whose
 * chat is not blocked, claimed on `renewal_reminded_at`, released by clearing it again.
 */
function reminderMessage(row: ProfileRow, onSent?: () => void): CronMessage {
  const chat = h.chats.find((c) => c.id === row.chatId)!;
  return {
    chatId: chat.chatId,
    blockedAt: chat.blockedAt,
    claim: async () => {
      const { count } = await prismaFake.roommateProfile.updateMany({
        where: { id: row.id, status: 'active', renewalRemindedAt: null },
        data: { renewalRemindedAt: NOW },
      });
      return count === 1;
    },
    release: async () => {
      await prismaFake.roommateProfile.updateMany({
        where: { id: row.id, renewalRemindedAt: NOW },
        data: { renewalRemindedAt: null },
      });
    },
    text: `reminder ${row.id}`,
    options: { parse_mode: 'HTML' },
    onSent,
  };
}

const reminderJob: MessageJob = async (sender: CronSender) => {
  const due = h.profiles.filter((row) => row.status === 'active' && !row.renewalRemindedAt);
  for (const row of due.map((r) => ({ ...r }))) {
    if (sender.stopped) return;
    await sender.send(reminderMessage(row));
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  h.profiles.length = 0;
  h.reports.length = 0;
  h.chats.length = 0;
  nextChat = 0;

  // Rows are copied out, like a database read: a later write does not change a snapshot a run
  // already holds. A `select` of `{ id, chat: { chatId } }` is answered with exactly that.
  prismaFake.roommateProfile.findMany.mockImplementation(async ({ where }: { where: Where }) =>
    h.profiles
      .filter((row) => matches(row, where))
      .map((row) => ({
        id: row.id,
        chat: { chatId: h.chats.find((chat) => chat.id === row.chatId)!.chatId },
      })),
  );
  prismaFake.roommateProfile.updateMany.mockImplementation(
    async ({ where, data }: { where: Where; data: Partial<ProfileRow> }) => {
      const hit = h.profiles.filter((row) => matches(row, where));
      for (const row of hit) Object.assign(row, data);
      return { count: hit.length };
    },
  );
  prismaFake.roommateProfile.deleteMany.mockImplementation(async ({ where }: { where: Where }) => {
    const hit = h.profiles.filter((row) => matches(row, where));
    h.profiles = h.profiles.filter((row) => !hit.includes(row));
    return { count: hit.length };
  });
  prismaFake.roommateReport.deleteMany.mockImplementation(async ({ where }: { where: Where }) => {
    const hit = h.reports.filter((row) => matches(row, where));
    h.reports = h.reports.filter((row) => !hit.includes(row));
    return { count: hit.length };
  });
  prismaFake.telegramChat.updateMany.mockImplementation(
    async ({ where, data }: { where: Where; data: Partial<ChatRow> }) => {
      const hit = h.chats.filter((chat) => matches(chat, where));
      for (const chat of hit) Object.assign(chat, data);
      return { count: hit.length };
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const NO_HOUSEKEEPING = {
  draftsDeleted: 0,
  openStepsCleared: 0,
  expired: 0,
  deletedExpired: 0,
  deletedModeration: 0,
  reportsDeleted: 0,
};

describe('runRoommateHousekeeping: drafts and open steps', () => {
  it('deletes a draft untouched for 7 days, silently, and keeps a younger one', async () => {
    seedProfile({ id: 'old', status: 'draft', step: 'budget', updatedAt: ago(7 * DAY) });
    seedProfile({ id: 'young', status: 'draft', step: 'budget', updatedAt: ago(7 * DAY - 1000) });

    const counts = await runRoommateHousekeeping(NOW);

    expect(counts).toEqual({ ...NO_HOUSEKEEPING, draftsDeleted: 1 });
    expect(profile('old')).toBeUndefined();
    expect(profile('young')).toBeDefined();
    expect(prismaFake.roommateProfile.deleteMany).toHaveBeenCalledWith({
      where: { status: 'draft', updatedAt: { lte: ago(7 * DAY) } },
    });
    expect(track).not.toHaveBeenCalled();
  });

  it('never deletes a saved profile as a draft, however old', async () => {
    seedProfile({ id: 'active', updatedAt: ago(40 * DAY) });

    await runRoommateHousekeeping(NOW);

    expect(profile('active')?.status).toBe('active');
  });

  it('clears an edit or renewal step left open for 24 hours; the profile stays as it was', async () => {
    seedProfile({ id: 'edit', step: 'edit_budget', updatedAt: ago(24 * HOUR) });
    seedProfile({
      id: 'renew',
      status: 'expired',
      step: 'renew_month',
      updatedAt: ago(30 * HOUR),
      expiresAt: ago(2 * DAY),
      expiredAt: ago(DAY),
    });
    seedProfile({ id: 'fresh', step: 'edit_about', updatedAt: ago(24 * HOUR - 1000) });
    seedProfile({ id: 'draft', status: 'draft', step: 'month', updatedAt: ago(2 * DAY) });

    const counts = await runRoommateHousekeeping(NOW);

    expect(counts.openStepsCleared).toBe(2);
    expect(profile('edit')).toMatchObject({ status: 'active', step: null });
    expect(profile('renew')).toMatchObject({ status: 'expired', step: null });
    expect(profile('fresh')?.step).toBe('edit_about');
    // A draft's step is its intake step: it lives until the 7-day rule deletes the draft.
    expect(profile('draft')?.step).toBe('month');
    expect(prismaFake.roommateProfile.updateMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['active', 'expired'] },
        step: { not: null },
        updatedAt: { lte: ago(24 * HOUR) },
      },
      data: { step: null },
    });
    expect(track).not.toHaveBeenCalled();
  });
});

describe('runRoommateHousekeeping: expiry', () => {
  it('marks an active profile at or past expires_at expired and sends one event', async () => {
    const due = seedProfile({ id: 'due', expiresAt: NOW });
    const past = seedProfile({ id: 'past', expiresAt: ago(HOUR) });
    seedProfile({ id: 'later', expiresAt: new Date(NOW.getTime() + 1000) });

    const counts = await runRoommateHousekeeping(NOW);

    expect(counts).toEqual({ ...NO_HOUSEKEEPING, expired: 2 });
    expect(profile('due')).toMatchObject({ status: 'expired', expiredAt: NOW });
    expect(profile('past')).toMatchObject({ status: 'expired', expiredAt: NOW });
    expect(profile('later')).toMatchObject({ status: 'active', expiredAt: null });
    expect(prismaFake.roommateProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'due', status: 'active', expiresAt: { lte: NOW } },
      data: { status: 'expired', expiredAt: NOW },
    });
    expect(vi.mocked(track).mock.calls).toEqual([
      [tgIdOf(due), 'tg_roommate_profile_expired'],
      [tgIdOf(past), 'tg_roommate_profile_expired'],
    ]);
  });

  it('leaves a hidden or a draft profile with a past date alone', async () => {
    seedProfile({ id: 'hidden', status: 'hidden', expiresAt: ago(DAY) });
    seedProfile({ id: 'draft', status: 'draft', expiresAt: ago(DAY) });

    await runRoommateHousekeeping(NOW);

    expect(profile('hidden')?.status).toBe('hidden');
    expect(profile('draft')?.status).toBe('draft');
    expect(track).not.toHaveBeenCalled();
  });

  it('does not expire a profile renewed between the read and the write', async () => {
    seedProfile({ id: 'renewed', expiresAt: ago(HOUR) });
    prismaFake.roommateProfile.findMany.mockImplementationOnce(async ({ where }) => {
      const rows = h.profiles
        .filter((row) => matches(row, where))
        .map((row) => ({ id: row.id, chat: { chatId: BigInt(1) } }));
      Object.assign(profile('renewed')!, { expiresAt: new Date(NOW.getTime() + 30 * DAY) });
      return rows;
    });

    const counts = await runRoommateHousekeeping(NOW);

    expect(counts.expired).toBe(0);
    expect(profile('renewed')?.status).toBe('active');
    expect(track).not.toHaveBeenCalled();
  });
});

describe("runRoommateHousekeeping: the website's counts expire (spec 09 §District section)", () => {
  it('once after an expiry landed', async () => {
    seedProfile({ id: 'due', expiresAt: NOW });
    seedProfile({ id: 'past', expiresAt: ago(HOUR) });
    await runRoommateHousekeeping(NOW);
    expect(revalidateRoommateCounts).toHaveBeenCalledTimes(1);
  });

  it('once after a deletion landed, also with an expiry in the same run', async () => {
    seedProfile({
      id: 'old',
      status: 'expired',
      expiresAt: ago(15 * DAY),
      expiredAt: ago(14 * DAY),
    });
    seedProfile({ id: 'due', expiresAt: NOW });
    await runRoommateHousekeeping(NOW);
    expect(revalidateRoommateCounts).toHaveBeenCalledTimes(1);

    vi.mocked(revalidateRoommateCounts).mockClear();
    seedProfile({ id: 'hidden', status: 'hidden', expiresAt: ago(15 * DAY) });
    await runRoommateHousekeeping(NOW);
    expect(revalidateRoommateCounts).toHaveBeenCalledTimes(1);
  });

  it('not when the run changed nobody counted (drafts, open steps, nothing due)', async () => {
    seedProfile({ id: 'draft', status: 'draft', updatedAt: ago(30 * DAY), expiresAt: null });
    seedProfile({ id: 'step', step: 'edit_budget', updatedAt: ago(25 * HOUR) });
    seedProfile({ id: 'later', expiresAt: new Date(NOW.getTime() + DAY) });
    const counts = await runRoommateHousekeeping(NOW);
    expect(counts.expired + counts.deletedExpired + counts.deletedModeration).toBe(0);
    expect(revalidateRoommateCounts).not.toHaveBeenCalled();
  });
});

describe('runRoommateHousekeeping: deletions after the grace period', () => {
  it('deletes an expired profile 14 days after it expired with reason=expired', async () => {
    const old = seedProfile({
      id: 'old',
      status: 'expired',
      expiresAt: ago(15 * DAY),
      expiredAt: ago(14 * DAY),
    });
    seedProfile({
      id: 'grace',
      status: 'expired',
      expiresAt: ago(14 * DAY),
      expiredAt: ago(14 * DAY - 1000),
    });

    const counts = await runRoommateHousekeeping(NOW);

    expect(counts).toEqual({ ...NO_HOUSEKEEPING, deletedExpired: 1 });
    expect(profile('old')).toBeUndefined();
    expect(profile('grace')?.status).toBe('expired');
    expect(prismaFake.roommateProfile.deleteMany).toHaveBeenCalledWith({
      where: { id: 'old', status: 'expired' },
    });
    expect(vi.mocked(track).mock.calls).toEqual([
      [tgIdOf(old), 'tg_roommate_profile_deleted', { reason: 'expired' }],
    ]);
  });

  it('deletes a hidden profile once expires_at + 14 days has passed with reason=moderation', async () => {
    const old = seedProfile({ id: 'hidden-old', status: 'hidden', expiresAt: ago(14 * DAY) });
    seedProfile({ id: 'hidden-young', status: 'hidden', expiresAt: ago(13 * DAY) });

    const counts = await runRoommateHousekeeping(NOW);

    expect(counts).toEqual({ ...NO_HOUSEKEEPING, deletedModeration: 1 });
    expect(profile('hidden-old')).toBeUndefined();
    expect(profile('hidden-young')?.status).toBe('hidden');
    expect(prismaFake.roommateProfile.deleteMany).toHaveBeenCalledWith({
      where: { id: 'hidden-old', status: 'hidden' },
    });
    expect(vi.mocked(track).mock.calls).toEqual([
      [tgIdOf(old), 'tg_roommate_profile_deleted', { reason: 'moderation' }],
    ]);
  });

  it('keeps the ban marker: the chat row is never touched by a deletion', async () => {
    const hidden = seedProfile({ id: 'hidden', status: 'hidden', expiresAt: ago(20 * DAY) });
    const chat = h.chats.find((c) => c.id === hidden.chatId)!;

    await runRoommateHousekeeping(NOW);

    expect(profile('hidden')).toBeUndefined();
    expect(h.chats).toContain(chat);
    expect(prismaFake.telegramChat.updateMany).not.toHaveBeenCalled();
  });

  it('a profile renewed (active again) between the read and the delete is kept, no event', async () => {
    seedProfile({
      id: 'back',
      status: 'expired',
      expiresAt: ago(20 * DAY),
      expiredAt: ago(15 * DAY),
    });
    prismaFake.roommateProfile.findMany.mockImplementation(async ({ where }) => {
      const rows = h.profiles
        .filter((row) => matches(row, where))
        .map((row) => ({ id: row.id, chat: { chatId: BigInt(1) } }));
      if (where.status === 'expired') profile('back')!.status = 'active';
      return rows;
    });

    const counts = await runRoommateHousekeeping(NOW);

    expect(counts.deletedExpired).toBe(0);
    expect(profile('back')?.status).toBe('active');
    expect(track).not.toHaveBeenCalled();
  });

  it('deletes reports 6 months old and keeps younger ones', async () => {
    h.reports.push(
      { id: 'old', createdAt: new Date('2026-06-30T09:15:00Z') },
      { id: 'young', createdAt: new Date('2026-06-30T09:15:01Z') },
    );

    const counts = await runRoommateHousekeeping(NOW);

    expect(counts).toEqual({ ...NO_HOUSEKEEPING, reportsDeleted: 1 });
    expect(h.reports.map((r) => r.id)).toEqual(['young']);
    expect(prismaFake.roommateReport.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lte: new Date('2026-06-30T09:15:00Z') } },
    });
  });
});

describe('runRoommateHousekeeping: a doubled run', () => {
  function seedEveryKind() {
    seedProfile({ id: 'draft', status: 'draft', step: 'budget', updatedAt: ago(8 * DAY) });
    seedProfile({ id: 'edit', step: 'edit_budget', updatedAt: ago(2 * DAY) });
    seedProfile({ id: 'expiring', expiresAt: ago(HOUR) });
    seedProfile({
      id: 'grace-over',
      status: 'expired',
      expiresAt: ago(20 * DAY),
      expiredAt: ago(15 * DAY),
    });
    seedProfile({ id: 'hidden-over', status: 'hidden', expiresAt: ago(15 * DAY) });
    h.reports.push({ id: 'report', createdAt: new Date('2026-01-01T00:00:00Z') });
  }

  const EVENTS = [
    'tg_roommate_profile_expired',
    'tg_roommate_profile_deleted',
    'tg_roommate_profile_deleted',
  ];

  it('run twice in a row sends each event once', async () => {
    seedEveryKind();

    const first = await runRoommateHousekeeping(NOW);
    const second = await runRoommateHousekeeping(NOW);

    expect(first).toEqual({
      draftsDeleted: 1,
      openStepsCleared: 1,
      expired: 1,
      deletedExpired: 1,
      deletedModeration: 1,
      reportsDeleted: 1,
    });
    expect(second).toEqual(NO_HOUSEKEEPING);
    expect(vi.mocked(track).mock.calls.map((call) => call[1])).toEqual(EVENTS);
  });

  it('two overlapping runs send each event once', async () => {
    seedEveryKind();

    const [a, b] = await Promise.all([runRoommateHousekeeping(NOW), runRoommateHousekeeping(NOW)]);

    expect(a.expired + b.expired).toBe(1);
    expect(a.deletedExpired + b.deletedExpired).toBe(1);
    expect(a.deletedModeration + b.deletedModeration).toBe(1);
    expect(
      vi
        .mocked(track)
        .mock.calls.map((call) => call[1])
        .sort(),
    ).toEqual([...EVENTS].sort());
    expect(h.profiles.map((row) => [row.id, row.status])).toEqual([
      ['edit', 'active'],
      ['expiring', 'expired'],
    ]);
  });

  it('events carry the reason only (no slug, text or id)', async () => {
    seedEveryKind();

    await runRoommateHousekeeping(NOW);

    expect(
      vi
        .mocked(track)
        .mock.calls.map(([, event, properties]) => [event, Object.keys(properties ?? {})]),
    ).toEqual([
      ['tg_roommate_profile_expired', []],
      ['tg_roommate_profile_deleted', ['reason']],
      ['tg_roommate_profile_deleted', ['reason']],
    ]);
  });
});

describe('createCronSender: claim, send, release', () => {
  function sender(api: Api, clock = fakeClock()) {
    return createCronSender(api, { now: NOW, startedAt: clock.now(), clock });
  }

  it('claims before the send and sends once when the claim lands', async () => {
    const row = seedProfile({ id: 'p' });
    const { api, sendMessage } = fakeApi();
    const onSent = vi.fn();
    const s = sender(api);

    const outcome = await s.send(reminderMessage(row, onSent));

    expect(outcome).toBe('sent');
    expect(sendMessage).toHaveBeenCalledWith(tgIdOf(row), 'reminder p', { parse_mode: 'HTML' });
    expect(prismaFake.roommateProfile.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      sendMessage.mock.invocationCallOrder[0],
    );
    expect(profile('p')?.renewalRemindedAt).toEqual(NOW);
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(s.counts()).toEqual({ sent: 1, blocked: 0, failed: 0, skipped: 0, stopped: null });
  });

  it('claim-once: a second send of the same row, or a second run, sends nothing', async () => {
    const row = seedProfile({ id: 'p' });
    const { api, sendMessage } = fakeApi();
    const onSent = vi.fn();

    expect(await sender(api).send(reminderMessage(row, onSent))).toBe('sent');
    expect(await sender(api).send(reminderMessage(row, onSent))).toBe('taken');

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('two overlapping runs over the same due row send once', async () => {
    seedProfile({ id: 'p' });
    seedProfile({ id: 'q' });
    const { api, sendMessage } = fakeApi();

    await Promise.all([
      runRoommateDaily(api, NOW, { jobs: [reminderJob], clock: fakeClock() }),
      runRoommateDaily(api, NOW, { jobs: [reminderJob], clock: fakeClock() }),
    ]);

    expect(sendMessage.mock.calls.map((call) => call[1]).sort()).toEqual([
      'reminder p',
      'reminder q',
    ]);
  });

  it('skips a chat whose blocked_at is set: no claim, no send', async () => {
    const row = seedProfile({ id: 'p' });
    h.chats.find((c) => c.id === row.chatId)!.blockedAt = ago(DAY);
    const { api, sendMessage } = fakeApi();
    const s = sender(api);

    expect(await s.send(reminderMessage(row))).toBe('skipped');

    expect(sendMessage).not.toHaveBeenCalled();
    expect(profile('p')?.renewalRemindedAt).toBeNull();
    expect(s.counts().skipped).toBe(1);
  });

  it('claimWhenBlocked: a blocked chat is still claimed, only the message is skipped', async () => {
    const row = seedProfile({ id: 'p' });
    h.chats.find((c) => c.id === row.chatId)!.blockedAt = ago(DAY);
    const { api, sendMessage } = fakeApi();
    const onSent = vi.fn();
    const s = sender(api);

    expect(await s.send({ ...reminderMessage(row, onSent), claimWhenBlocked: true })).toBe(
      'skipped',
    );
    // Claimed already: a second send of the same row is taken, not skipped again.
    expect(await s.send({ ...reminderMessage(row, onSent), claimWhenBlocked: true })).toBe('taken');

    expect(sendMessage).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
    expect(profile('p')?.renewalRemindedAt).toEqual(NOW);
    expect(s.counts()).toEqual({ sent: 0, blocked: 0, failed: 0, skipped: 1, stopped: null });
  });

  it('a 403 marks the chat blocked and keeps the claim; that chat gets nothing more this run', async () => {
    const row = seedProfile({ id: 'p' });
    const other = seedProfile({ id: 'q' });
    const { api, sendMessage } = fakeApi();
    sendMessage.mockRejectedValueOnce(telegramError(403, 'Forbidden: bot was blocked by the user'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSent = vi.fn();
    const s = sender(api);

    expect(await s.send(reminderMessage(row, onSent))).toBe('blocked');
    // A second message of the same chat in the same run (another job): skipped.
    expect(await s.send({ ...reminderMessage(other), chatId: BigInt(tgIdOf(row)) })).toBe(
      'skipped',
    );
    expect(await s.send(reminderMessage(other))).toBe('sent');

    const chat = h.chats.find((c) => c.id === row.chatId)!;
    expect(chat.blockedAt).toEqual(NOW);
    expect(prismaFake.telegramChat.updateMany).toHaveBeenCalledWith({
      where: { chatId: chat.chatId },
      data: { blockedAt: NOW },
    });
    expect(profile('p')?.renewalRemindedAt).toEqual(NOW);
    expect(onSent).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(s.counts()).toEqual({ sent: 1, blocked: 1, failed: 0, skipped: 1, stopped: null });
    expect(errors).not.toHaveBeenCalled();
  });

  it('another error releases the claim, logs the message only, and the next run retries', async () => {
    const row = seedProfile({ id: 'p' });
    const { api, sendMessage } = fakeApi();
    sendMessage.mockRejectedValueOnce(telegramError(400, 'Bad Request: something odd'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = sender(api);

    expect(await s.send(reminderMessage(row))).toBe('failed');

    expect(profile('p')?.renewalRemindedAt).toBeNull();
    expect(h.chats.every((c) => c.blockedAt === null)).toBe(true);
    expect(s.counts()).toEqual({ sent: 0, blocked: 0, failed: 1, skipped: 0, stopped: null });
    const logged = errors.mock.calls.flat().map(String).join(' ');
    expect(errors.mock.calls[0]).toEqual([
      '[bot/roommate] cron message failed',
      expect.stringContaining('Bad Request'),
    ]);
    expect(logged).not.toContain(String(tgIdOf(row)));
    expect(logged).not.toContain('500000001');
    expect(logged).not.toContain('reminder p');

    expect(await sender(api).send(reminderMessage(row))).toBe('sent');
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('a network error (not a Telegram answer) releases the claim too', async () => {
    const row = seedProfile({ id: 'p' });
    const { api, sendMessage } = fakeApi();
    sendMessage.mockRejectedValueOnce(new Error('socket hang up'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await sender(api).send(reminderMessage(row))).toBe('failed');
    expect(profile('p')?.renewalRemindedAt).toBeNull();
  });

  it('a 429 releases the claim and stops every later send of the run', async () => {
    const first = seedProfile({ id: 'p' });
    const second = seedProfile({ id: 'q' });
    const { api, sendMessage } = fakeApi();
    sendMessage.mockRejectedValueOnce(telegramError(429, 'Too Many Requests: retry after 5'));
    const s = sender(api);

    expect(await s.send(reminderMessage(first))).toBe('stopped');
    expect(await s.send(reminderMessage(second))).toBe('stopped');

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(profile('p')?.renewalRemindedAt).toBeNull();
    expect(profile('q')?.renewalRemindedAt).toBeNull();
    expect(s.stopped).toBe('rate_limited');
    expect(s.counts()).toEqual({
      sent: 0,
      blocked: 0,
      failed: 1,
      skipped: 0,
      stopped: 'rate_limited',
    });
  });

  it(`sends at most ${MESSAGES_PER_SECOND} messages a second`, async () => {
    const clock = fakeClock();
    const starts: number[] = [];
    const { api, sendMessage } = fakeApi();
    sendMessage.mockImplementation(async () => {
      starts.push(clock.now());
      return {};
    });
    const s = sender(api, clock);

    for (let i = 0; i < 60; i += 1) await s.send(reminderMessage(seedProfile({ id: `p${i}` })));

    expect(starts).toHaveLength(60);
    for (let i = MESSAGES_PER_SECOND; i < starts.length; i += 1) {
      expect(starts[i] - starts[i - MESSAGES_PER_SECOND]).toBeGreaterThanOrEqual(1000);
    }
  });

  it(`sends at most MAX_MESSAGES_PER_RUN (${MAX_MESSAGES_PER_RUN}) messages; the rest stay unclaimed`, async () => {
    const { api, sendMessage } = fakeApi();
    const s = sender(api);
    const rows = Array.from({ length: MAX_MESSAGES_PER_RUN + 2 }, (_, i) =>
      seedProfile({ id: `p${i}` }),
    );

    const outcomes = [];
    for (const row of rows) outcomes.push(await s.send(reminderMessage(row)));

    expect(sendMessage).toHaveBeenCalledTimes(MAX_MESSAGES_PER_RUN);
    expect(outcomes.slice(-2)).toEqual(['stopped', 'stopped']);
    expect(s.stopped).toBe('message_cap');
    expect(h.profiles.filter((row) => row.renewalRemindedAt === null)).toHaveLength(2);
  });

  it('starts no new send once SEND_BUDGET_MS has passed since the run began', async () => {
    const clock = fakeClock();
    const startedAt = clock.now();
    const { api, sendMessage } = fakeApi();
    const s = createCronSender(api, { now: NOW, startedAt, clock });
    const [a, b] = [seedProfile({ id: 'a' }), seedProfile({ id: 'b' })];

    clock.advance(SEND_BUDGET_MS - 1);
    expect(await s.send(reminderMessage(a))).toBe('sent');
    clock.advance(1);
    expect(await s.send(reminderMessage(b))).toBe('stopped');

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(profile('b')?.renewalRemindedAt).toBeNull();
    expect(s.stopped).toBe('time_budget');
  });
});

describe('runRoommateDaily', () => {
  it('outside the send hour: housekeeping only, no job runs and nothing is sent', async () => {
    seedProfile({ id: 'expiring', expiresAt: ago(DAY) });
    const { api, sendMessage } = fakeApi();
    const job = vi.fn(reminderJob);

    const result = await runRoommateDaily(api, NOT_SEND_HOUR, { jobs: [job], clock: fakeClock() });

    expect(result).toEqual({
      housekeeping: { ...NO_HOUSEKEEPING, expired: 1 },
      messages: { skipped: 'not the send hour' },
    });
    expect(job).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('summer time: 08:15 UTC is the send hour, 09:15 UTC is not', async () => {
    const { api } = fakeApi();
    const job = vi.fn(async () => {});

    await runRoommateDaily(api, new Date('2027-04-01T09:15:00Z'), {
      jobs: [job],
      clock: fakeClock(),
    });
    expect(job).not.toHaveBeenCalled();
    await runRoommateDaily(api, new Date('2027-04-01T08:15:00Z'), {
      jobs: [job],
      clock: fakeClock(),
    });
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('without a bot: housekeeping only, and the result says so', async () => {
    seedProfile({ id: 'draft', status: 'draft', updatedAt: ago(8 * DAY) });
    const job = vi.fn(reminderJob);

    const result = await runRoommateDaily(null, NOW, { jobs: [job], clock: fakeClock() });

    expect(result).toEqual({
      housekeeping: { ...NO_HOUSEKEEPING, draftsDeleted: 1 },
      messages: { skipped: 'bot not configured' },
    });
    expect(job).not.toHaveBeenCalled();
  });

  it('in the send hour: housekeeping first, then the jobs in their order; counts only', async () => {
    seedProfile({ id: 'p' });
    const { api } = fakeApi();
    const order: string[] = [];
    const first: MessageJob = async (s) => {
      order.push('first');
      await reminderJob(s, NOW);
    };
    const second: MessageJob = async () => {
      order.push('second');
    };
    prismaFake.roommateReport.deleteMany.mockImplementationOnce(async () => {
      order.push('housekeeping');
      return { count: 0 };
    });

    const result = await runRoommateDaily(api, NOW, { jobs: [first, second], clock: fakeClock() });

    expect(order).toEqual(['housekeeping', 'first', 'second']);
    expect(result).toEqual({
      housekeeping: NO_HOUSEKEEPING,
      messages: { sent: 1, blocked: 0, failed: 0, skipped: 0, stopped: null },
    });
    expect(JSON.stringify(result)).not.toMatch(/50000000|reminder/);
  });

  it('a job that stops the sender (a 429) keeps the later jobs from running', async () => {
    seedProfile({ id: 'p' });
    const { api, sendMessage } = fakeApi();
    sendMessage.mockRejectedValueOnce(telegramError(429, 'Too Many Requests'));
    const later = vi.fn(async () => {});

    const result = await runRoommateDaily(api, NOW, {
      jobs: [reminderJob, later],
      clock: fakeClock(),
    });

    expect(later).not.toHaveBeenCalled();
    expect(result.messages).toMatchObject({ stopped: 'rate_limited', failed: 1 });
  });

  it('the time budget counts from the start of the run, housekeeping included', async () => {
    seedProfile({ id: 'p' });
    const clock = fakeClock();
    const { api, sendMessage } = fakeApi();
    prismaFake.roommateReport.deleteMany.mockImplementationOnce(async () => {
      clock.advance(SEND_BUDGET_MS);
      return { count: 0 };
    });

    const result = await runRoommateDaily(api, NOW, { jobs: [reminderJob], clock });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.messages).toMatchObject({ sent: 0, stopped: 'time_budget' });
    expect(profile('p')?.renewalRemindedAt).toBeNull();
  });

  // The default jobs (the renewal reminder of T078) are tested in `roommate-renewal.test.ts`.
});
