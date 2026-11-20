import { GrammyError, type Api } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The manual closing run (FR-20, D64; spec 06 §Closing route) through the real
 * `createCronSender`, over an in-memory Prisma fake whose `deleteMany` applies its `where` and the
 * foreign keys (reactions cascade, report references are nulled), and whose `findMany` returns
 * copies. Telegram is a fake `api.sendMessage`; the clock is fake; nothing reaches Telegram,
 * PostHog or a database.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = {
    profiles: [] as Row[],
    chats: [] as Row[],
    reactions: [] as Row[],
    reports: [] as Row[],
    /** Runs after the profile read, before the run deletes anything one by one. */
    afterRead: null as (() => void) | null,
  };
  const chatOf = (row: Row) => state.chats.find((chat) => chat.id === row.chatId) ?? {};

  function matches(row: Row, where: Where): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
        const { not, ...rest } = cond as { not?: unknown };
        if (Object.keys(rest).length || !('not' in cond)) throw new Error(`filter on ${key}`);
        return row[key] !== not;
      }
      return row[key] === cond;
    });
  }

  /** What Postgres does on a profile delete: reactions cascade, report references go null. */
  function removeProfiles(where: Where): number {
    const hits = state.profiles.filter((row) => matches(row, where));
    const ids = new Set(hits.map((row) => row.id));
    state.profiles = state.profiles.filter((row) => !ids.has(row.id));
    state.reactions = state.reactions.filter(
      (reaction) => !ids.has(reaction.fromProfileId) && !ids.has(reaction.toProfileId),
    );
    for (const report of state.reports) {
      if (ids.has(report.reporterProfileId)) report.reporterProfileId = null;
      if (ids.has(report.targetProfileId)) report.targetProfileId = null;
    }
    return hits.length;
  }

  const time = (value: unknown) => (value as Date).getTime();

  return {
    state,
    prisma: {
      telegramChat: {
        updateMany: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
          const hits = state.chats.filter((chat) => matches(chat, where));
          for (const chat of hits) Object.assign(chat, data);
          return { count: hits.length };
        }),
      },
      roommateProfile: {
        findMany: vi.fn(
          async ({
            where,
            select,
            orderBy,
          }: {
            where: Where;
            select: { id: true; chat: { select: Record<string, true> } };
            orderBy: { createdAt: 'asc' };
          }) => {
            if (Object.keys(orderBy).join() !== 'createdAt') throw new Error('orderBy');
            const rows = state.profiles
              .filter((row) => matches(row, where))
              .sort((a, b) => time(a.createdAt) - time(b.createdAt))
              .map((row) => ({
                id: row.id,
                chat: Object.fromEntries(
                  Object.keys(select.chat.select).map((key) => [key, chatOf(row)[key]]),
                ),
              }));
            state.afterRead?.();
            return rows;
          },
        ),
        deleteMany: vi.fn(async ({ where }: { where: Where }) => ({
          count: removeProfiles(where),
        })),
        count: vi.fn(async () => state.profiles.length),
      },
      roommateReport: {
        deleteMany: vi.fn(async ({ where = {} }: { where?: Where }) => {
          const hits = state.reports.filter((row) => matches(row, where));
          state.reports = state.reports.filter((row) => !hits.includes(row));
          return { count: hits.length };
        }),
      },
    },
  };
});
const mocks = vi.hoisted(() => ({ track: vi.fn(), revalidateRoommateCounts: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }));
vi.mock('./analytics', () => ({ track: mocks.track }));
vi.mock('@/lib/roommate/website-counts', () => ({
  revalidateRoommateCounts: mocks.revalidateRoommateCounts,
}));

import { runRoommateClose } from './roommate-close';
import { MAX_MESSAGES_PER_RUN, SEND_BUDGET_MS, type CronClock } from './roommate-daily';

const NOW = new Date('2027-01-21T11:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** PRD 3 §8 "Closing message (FR-20, D64)", verbatim. */
const CLOSING = {
  ru: 'Подбор так и не откроется. Твоя анкета уже удалена. Спасибо, что попробовал(а) Passflat.',
  uk: 'Підбір так і не відкриється. Твою анкету вже видалено. Дякуємо, що спробував(-ла) Passflat.',
  en: 'Matching will not open after all. Your profile is deleted now. Thanks for trying Passflat.',
};

type ChatFields = { blockedAt?: Date | null; roommateBannedAt?: Date | null; locale?: string };

let seeded = 0;

/** A chat with its one profile; profiles are read in the order they were seeded. */
function seed(id: string, status: string, chat: ChatFields = {}) {
  seeded += 1;
  const chatRow = {
    id: `chat-${id}`,
    chatId: BigInt(700_000_000 + seeded),
    blockedAt: null,
    roommateBannedAt: null,
    locale: 'ru',
    ...chat,
  };
  db.state.chats.push(chatRow);
  db.state.profiles.push({
    id,
    chatId: chatRow.id,
    status,
    createdAt: new Date(NOW.getTime() - (100 - seeded) * DAY),
  });
  return { id, tgId: Number(chatRow.chatId), chat: chatRow };
}

function seedReport(id: string, reporter: string | null, target: string | null) {
  db.state.reports.push({ id, reporterProfileId: reporter, targetProfileId: target });
}

function fakeApi() {
  const sendMessage = vi.fn(async (..._args: unknown[]) => ({}));
  return { api: { sendMessage } as unknown as Api, sendMessage };
}

function fakeClock(start = 1_000_000): CronClock & { advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function close(api: Api, clock: CronClock = fakeClock()) {
  return runRoommateClose(api, NOW, { clock });
}

function telegramError(code: number, description: string) {
  return new GrammyError(
    "Call to 'sendMessage' failed!",
    { ok: false, error_code: code, description },
    'sendMessage',
    { chat_id: 700_000_001, text: 'closing' },
  );
}

const sentTo = (sendMessage: ReturnType<typeof fakeApi>['sendMessage']) =>
  sendMessage.mock.calls.map(([tgId, text]) => [tgId, text]);

const deletedEvents = () =>
  mocks.track.mock.calls.filter(([, event]) => event === 'tg_roommate_profile_deleted');

const NOTHING = {
  draftsDeleted: 0,
  profilesDeleted: 0,
  messages: { sent: 0, blocked: 0, failed: 0, skipped: 0, stopped: null },
  remaining: 0,
  reportsDeleted: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.state.profiles = [];
  db.state.chats = [];
  db.state.reactions = [];
  db.state.reports = [];
  db.state.afterRead = null;
  seeded = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the closing run: one message and one event per profile', () => {
  function seedEveryKind() {
    const draft = seed('draft', 'draft');
    const blockedDraft = seed('draft-blocked', 'draft', {
      blockedAt: new Date(NOW.getTime() - DAY),
    });
    const active = seed('active', 'active', { locale: 'ru' });
    const expired = seed('expired', 'expired', { locale: 'uk' });
    const hidden = seed('hidden', 'hidden', { locale: 'en' });
    db.state.reactions.push(
      { id: 'r1', fromProfileId: 'active', toProfileId: 'expired' },
      { id: 'r2', fromProfileId: 'hidden', toProfileId: 'active' },
    );
    seedReport('rep1', 'active', 'hidden');
    seedReport('rep2', null, 'expired');
    return { draft, blockedDraft, active, expired, hidden };
  }

  it('deletes drafts silently; active, expired and hidden each get the closing message in the chat locale and one event', async () => {
    const { active, expired, hidden } = seedEveryKind();
    const { api, sendMessage } = fakeApi();

    const result = await close(api);

    expect(sentTo(sendMessage)).toEqual([
      [active.tgId, CLOSING.ru],
      [expired.tgId, CLOSING.uk],
      [hidden.tgId, CLOSING.en],
    ]);
    for (const [, , options] of sendMessage.mock.calls) {
      expect(options).toEqual({ parse_mode: 'HTML' }); // no buttons: nothing is left to tap
    }
    expect(mocks.track.mock.calls).toEqual([
      [active.tgId, 'tg_roommate_profile_deleted', { reason: 'closed' }],
      [expired.tgId, 'tg_roommate_profile_deleted', { reason: 'closed' }],
      [hidden.tgId, 'tg_roommate_profile_deleted', { reason: 'closed' }],
    ]);
    expect(result).toEqual({
      draftsDeleted: 2,
      profilesDeleted: 3,
      messages: { sent: 3, blocked: 0, failed: 0, skipped: 0, stopped: null },
      remaining: 0,
      reportsDeleted: 2,
    });
    expect(db.state.profiles).toEqual([]);
    expect(db.state.reactions).toEqual([]);
    expect(db.state.reports).toEqual([]);
  });

  it('per profile: the delete (the claim) first, then the event, then the message', async () => {
    seed('active', 'active');
    const { api, sendMessage } = fakeApi();

    await close(api);

    const deleteById = db.prisma.roommateProfile.deleteMany.mock.calls.findIndex(
      ([args]) => (args as { where: Where }).where.id === 'active',
    );
    const order = [
      db.prisma.roommateProfile.deleteMany.mock.invocationCallOrder[deleteById],
      mocks.track.mock.invocationCallOrder[0],
      sendMessage.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(db.prisma.roommateProfile.deleteMany).toHaveBeenCalledWith({ where: { id: 'active' } });
  });

  it('drafts are deleted in one statement, before any profile is read, and get no message or event', async () => {
    seed('d1', 'draft');
    seed('d2', 'draft');
    const { api, sendMessage } = fakeApi();

    const result = await close(api);

    expect(db.prisma.roommateProfile.deleteMany.mock.calls[0]).toEqual([
      { where: { status: 'draft' } },
    ]);
    expect(db.prisma.roommateProfile.findMany).toHaveBeenCalledWith({
      where: { status: { not: 'draft' } },
      select: { id: true, chat: { select: { chatId: true, blockedAt: true, locale: true } } },
      orderBy: { createdAt: 'asc' },
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(result).toEqual({ ...NOTHING, draftsDeleted: 2 });
  });

  it('a blocked chat: the profile is deleted with its event, but no message is sent', async () => {
    const blocked = seed('blocked', 'active', { blockedAt: new Date(NOW.getTime() - DAY) });
    const open = seed('open', 'expired');
    const { api, sendMessage } = fakeApi();

    const result = await close(api);

    expect(sentTo(sendMessage)).toEqual([[open.tgId, CLOSING.ru]]);
    expect(deletedEvents().map(([tgId]) => tgId)).toEqual([blocked.tgId, open.tgId]);
    expect(result.messages).toEqual({ sent: 1, blocked: 0, failed: 0, skipped: 1, stopped: null });
    expect(result.profilesDeleted).toBe(2);
    expect(db.state.profiles).toEqual([]);
  });

  it('keeps the ban markers and the chats; a banned chat that is not blocked still gets the message', async () => {
    const banned = seed('banned', 'hidden', { roommateBannedAt: new Date('2026-12-20T10:00:00Z') });
    const { api, sendMessage } = fakeApi();

    await close(api);

    expect(sentTo(sendMessage)).toEqual([[banned.tgId, CLOSING.ru]]);
    expect(db.state.chats).toHaveLength(1);
    expect(db.state.chats[0].roommateBannedAt).toEqual(new Date('2026-12-20T10:00:00Z'));
    expect(db.prisma.telegramChat.updateMany).not.toHaveBeenCalled();
  });

  it('a chat with another stored language gets the Russian text, like the daily cron', async () => {
    const other = seed('other', 'active', { locale: 'pl' });
    const { api, sendMessage } = fakeApi();

    await close(api);

    expect(sentTo(sendMessage)).toEqual([[other.tgId, CLOSING.ru]]);
  });

  it('events carry the reason only, and the result holds counts only (no chat id)', async () => {
    const { active, expired, hidden } = seedEveryKind();
    const { api } = fakeApi();

    const result = await close(api);

    for (const [, , properties] of mocks.track.mock.calls) {
      expect(Object.keys(properties)).toEqual(['reason']);
    }
    const json = JSON.stringify(result);
    for (const { tgId } of [active, expired, hidden]) expect(json).not.toContain(String(tgId));
    expect(json).not.toMatch(/active|expired|hidden|chat-/);
  });
});

describe('the closing run: run twice', () => {
  it('a second run finds nothing: no message, no event, no delete of anything', async () => {
    seed('draft', 'draft');
    seed('active', 'active');
    seed('hidden', 'hidden', { locale: 'uk' });
    seedReport('rep', 'active', 'hidden');
    const { api, sendMessage } = fakeApi();

    await close(api);
    vi.clearAllMocks();
    const second = await close(api);

    expect(second).toEqual(NOTHING);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('two overlapping runs send one message and one event per profile', async () => {
    const a = seed('a', 'active');
    const b = seed('b', 'expired', { locale: 'uk' });
    const c = seed('c', 'hidden', { locale: 'en' });
    const { api, sendMessage } = fakeApi();

    const [first, second] = await Promise.all([close(api), close(api)]);

    expect(sentTo(sendMessage).sort()).toEqual(
      [
        [a.tgId, CLOSING.ru],
        [b.tgId, CLOSING.uk],
        [c.tgId, CLOSING.en],
      ].sort(),
    );
    expect(
      deletedEvents()
        .map(([tgId]) => tgId)
        .sort(),
    ).toEqual([a.tgId, b.tgId, c.tgId].sort());
    expect(first.profilesDeleted + second.profilesDeleted).toBe(3);
    expect(first.messages.sent + second.messages.sent).toBe(3);
  });

  it('a profile the person deleted between the read and the claim gets nothing', async () => {
    seed('gone', 'active');
    const kept = seed('kept', 'active');
    db.state.afterRead = () => {
      db.state.profiles = db.state.profiles.filter((row) => row.id !== 'gone');
    };
    const { api, sendMessage } = fakeApi();

    const result = await close(api);

    expect(sentTo(sendMessage)).toEqual([[kept.tgId, CLOSING.ru]]);
    expect(deletedEvents().map(([tgId]) => tgId)).toEqual([kept.tgId]);
    expect(result.profilesDeleted).toBe(1);
  });
});

describe('the closing run: reports go only when no profile is left', () => {
  it('a profile row left at the end (a draft started during the run) keeps every report; the next run deletes them', async () => {
    seed('active', 'active');
    seedReport('rep1', 'active', null);
    seedReport('rep2', null, null);
    db.state.afterRead = () => {
      db.state.afterRead = null;
      seed('late-draft', 'draft');
    };
    const { api } = fakeApi();

    const first = await close(api);

    expect(first.remaining).toBe(1);
    expect(first.reportsDeleted).toBe(0);
    expect(db.prisma.roommateReport.deleteMany).not.toHaveBeenCalled();
    expect(db.state.reports.map((report) => report.id)).toEqual(['rep1', 'rep2']);
    expect(db.state.reports[0].reporterProfileId).toBeNull(); // the FK nulled it

    const second = await close(api);

    expect(second).toEqual({ ...NOTHING, draftsDeleted: 1, reportsDeleted: 2 });
    expect(db.prisma.roommateReport.deleteMany).toHaveBeenCalledWith({});
    expect(db.state.reports).toEqual([]);
  });
});

describe('the closing run: send failures, the cap and the time budget', () => {
  it('a 403 marks the chat blocked; the profile stays deleted with its event, and the run goes on', async () => {
    const first = seed('first', 'active');
    const second = seed('second', 'active');
    const { api, sendMessage } = fakeApi();
    sendMessage.mockRejectedValueOnce(telegramError(403, 'Forbidden: bot was blocked by the user'));

    const result = await close(api);

    expect(db.state.chats.find((chat) => chat.id === first.chat.id)?.blockedAt).toEqual(NOW);
    expect(sentTo(sendMessage)).toEqual([
      [first.tgId, CLOSING.ru],
      [second.tgId, CLOSING.ru],
    ]);
    expect(deletedEvents()).toHaveLength(2);
    expect(result).toEqual({
      ...NOTHING,
      profilesDeleted: 2,
      messages: { sent: 1, blocked: 1, failed: 0, skipped: 0, stopped: null },
    });
  });

  it('another error logs the message only; the deleted profile is not retried, and the run goes on', async () => {
    const first = seed('first', 'active');
    const second = seed('second', 'hidden');
    const { api, sendMessage } = fakeApi();
    sendMessage.mockRejectedValueOnce(telegramError(400, 'Bad Request: chat not found'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await close(api);
    const again = await close(api);

    expect(sentTo(sendMessage)).toEqual([
      [first.tgId, CLOSING.ru],
      [second.tgId, CLOSING.ru],
    ]);
    expect(result.messages).toEqual({ sent: 1, blocked: 0, failed: 1, skipped: 0, stopped: null });
    expect(result.remaining).toBe(0);
    expect(again).toEqual(NOTHING);
    const logged = errors.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('Bad Request');
    expect(logged).not.toContain(String(first.tgId));
    expect(logged).not.toContain('700000001');
    expect(logged).not.toContain('Passflat');
  });

  it('a 429 stops the run: the rest stay with the reports and the response says how many remain', async () => {
    const first = seed('first', 'active');
    seed('second', 'active');
    seed('third-blocked', 'expired', { blockedAt: new Date(NOW.getTime() - DAY) });
    seedReport('rep', 'second', 'first');
    const { api, sendMessage } = fakeApi();
    sendMessage.mockRejectedValueOnce(telegramError(429, 'Too Many Requests: retry after 5'));

    const result = await close(api);

    expect(sentTo(sendMessage)).toEqual([[first.tgId, CLOSING.ru]]);
    expect(deletedEvents().map(([tgId]) => tgId)).toEqual([first.tgId]);
    expect(result).toEqual({
      ...NOTHING,
      profilesDeleted: 1,
      messages: { sent: 0, blocked: 0, failed: 1, skipped: 0, stopped: 'rate_limited' },
      remaining: 2,
    });
    expect(db.state.profiles.map((row) => row.id)).toEqual(['second', 'third-blocked']);
    expect(db.state.reports).toHaveLength(1);

    const next = await close(api);

    expect(next).toEqual({
      ...NOTHING,
      profilesDeleted: 2,
      messages: { sent: 1, blocked: 0, failed: 0, skipped: 1, stopped: null },
      reportsDeleted: 1,
    });
    expect(deletedEvents()).toHaveLength(3);
  });

  it('the time budget stops the run, blocked chats included; the next run finishes it', async () => {
    const clock = fakeClock();
    const first = seed('first', 'active');
    seed('blocked', 'active', { blockedAt: new Date(NOW.getTime() - DAY) });
    seed('third', 'hidden');
    const { api, sendMessage } = fakeApi();
    sendMessage.mockImplementationOnce(async () => {
      clock.advance(SEND_BUDGET_MS);
      return {};
    });

    const result = await close(api, clock);

    expect(sentTo(sendMessage)).toEqual([[first.tgId, CLOSING.ru]]);
    expect(result).toEqual({
      ...NOTHING,
      profilesDeleted: 1,
      messages: { sent: 1, blocked: 0, failed: 0, skipped: 0, stopped: 'time_budget' },
      remaining: 2,
    });
    expect(deletedEvents()).toHaveLength(1);

    const next = await close(api);

    expect(next.profilesDeleted).toBe(2);
    expect(next.remaining).toBe(0);
    expect(deletedEvents()).toHaveLength(3);
  });

  it(`sends at most MAX_MESSAGES_PER_RUN (${MAX_MESSAGES_PER_RUN}) messages; the rest wait`, async () => {
    for (let i = 0; i < MAX_MESSAGES_PER_RUN + 2; i += 1) seed(`p${i}`, 'active');
    seedReport('rep', null, null);
    const { api, sendMessage } = fakeApi();

    const result = await close(api);

    expect(sendMessage).toHaveBeenCalledTimes(MAX_MESSAGES_PER_RUN);
    expect(result.messages.stopped).toBe('message_cap');
    expect(result.profilesDeleted).toBe(MAX_MESSAGES_PER_RUN);
    expect(result.remaining).toBe(2);
    expect(result.reportsDeleted).toBe(0);
    expect(deletedEvents()).toHaveLength(MAX_MESSAGES_PER_RUN);
  });
});

describe("the website's counts (spec 09 §District section)", () => {
  it('expire once after the run deleted profiles', async () => {
    seed('active', 'active');
    seed('expired', 'expired');
    await close(fakeApi().api);
    expect(mocks.revalidateRoommateCounts).toHaveBeenCalledTimes(1);
  });

  it('stay when only drafts (never counted) or nothing were deleted', async () => {
    seed('draft', 'draft');
    await close(fakeApi().api);
    await close(fakeApi().api);
    expect(mocks.revalidateRoommateCounts).not.toHaveBeenCalled();
  });
});
