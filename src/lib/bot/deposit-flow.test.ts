import { GrammyError, type Api, type Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deposit reminders over an in-memory DepositCase table: the claim before a
 * follow-up is sent, the restore after a failed send, and /cancel. Telegram is
 * a fake `api.sendMessage`; nothing reaches a real API.
 */

type CaseRow = {
  id: string;
  chatId: string;
  status: string;
  followUpAt: Date | null;
  followUpKind: string | null;
};

type ChatRow = { id: string; chatId: bigint; locale: string; blockedAt: Date | null };

type Where = Record<string, unknown>;

const h = vi.hoisted(() => ({
  cases: [] as CaseRow[],
  chats: [] as ChatRow[],
}));

/** The subset of Prisma's `where` the deposit flow uses on these two tables. */
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
  depositCase: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  telegramChat: { updateMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaFake }));
vi.mock('./analytics', () => ({ track: vi.fn() }));
vi.mock('./contract', () => ({ readContract: vi.fn() }));
vi.mock('./store', () => ({ touchChat: vi.fn() }));

import { cancelDepositFlow, sendDueFollowUps } from './deposit-flow';

const NOW = new Date('2026-11-20T09:00:00Z');
const DUE = new Date('2026-11-20T00:00:00Z');
const LATER = new Date('2026-11-28T00:00:00Z');
const TG_CHAT_ID = 777000111;

function seedChat(id: string, locale = 'ru', chatId = BigInt(TG_CHAT_ID)) {
  h.chats.push({ id, chatId, locale, blockedAt: null });
}

function seedCase(row: Partial<CaseRow> & { id: string }): CaseRow {
  const full: CaseRow = {
    chatId: 'chat-db-1',
    status: 'verdict',
    followUpAt: DUE,
    followUpKind: 'deadline',
    ...row,
  };
  h.cases.push(full);
  return full;
}

function caseById(id: string): CaseRow {
  return h.cases.find((row) => row.id === id)!;
}

function fakeApi() {
  const sendMessage = vi.fn(async () => ({}));
  return { api: { sendMessage } as unknown as Api, sendMessage };
}

function fakeCtx() {
  const reply = vi.fn(async () => ({}));
  return { ctx: { reply } as unknown as Context, reply };
}

function telegramError(code: number, description: string) {
  return new GrammyError(
    "Call to 'sendMessage' failed!",
    { ok: false, error_code: code, description },
    'sendMessage',
    { chat_id: TG_CHAT_ID, text: 'follow-up' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.cases.length = 0;
  h.chats.length = 0;

  // Rows are copied out, like a database read: a later write does not change a
  // snapshot a run already holds.
  prismaFake.depositCase.findMany.mockImplementation(async ({ where }: { where: Where }) => {
    const { chat: chatWhere, ...caseWhere } = where as { chat?: Where } & Where;
    return h.cases
      .filter((row) => matches(row, caseWhere))
      .map((row) => ({ row, chat: h.chats.find((chat) => chat.id === row.chatId)! }))
      .filter(({ chat }) => !chatWhere || matches(chat, chatWhere))
      .map(({ row, chat }) => ({
        ...row,
        chat: { chatId: chat.chatId, locale: chat.locale },
      }));
  });
  prismaFake.depositCase.updateMany.mockImplementation(
    async ({ where, data }: { where: Where; data: Partial<CaseRow> }) => {
      const hit = h.cases.filter((row) => matches(row, where));
      for (const row of hit) Object.assign(row, data);
      return { count: hit.length };
    },
  );
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

describe('sendDueFollowUps', () => {
  it('claims the row with a conditional update on the date it read, then sends', async () => {
    seedChat('chat-db-1');
    seedCase({ id: 'case-1' });
    const { api, sendMessage } = fakeApi();

    const result = await sendDueFollowUps(api, NOW);

    expect(result).toEqual({ due: 1, sent: 1, blocked: 0 });
    expect(prismaFake.depositCase.updateMany).toHaveBeenCalledWith({
      where: { id: 'case-1', followUpAt: DUE },
      data: { followUpAt: null },
    });
    // The claim comes before the send.
    expect(prismaFake.depositCase.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      sendMessage.mock.invocationCallOrder[0],
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(TG_CHAT_ID, expect.any(String), expect.any(Object));
    expect(caseById('case-1')).toMatchObject({ followUpAt: null, followUpKind: 'deadline' });
  });

  it('sends a due follow-up once when two runs overlap', async () => {
    seedChat('chat-db-1');
    seedCase({ id: 'case-1' });
    const { api, sendMessage } = fakeApi();

    // Both runs read the row before either claims it.
    const [first, second] = await Promise.all([
      sendDueFollowUps(api, NOW),
      sendDueFollowUps(api, NOW),
    ]);

    expect(first.due + second.due).toBe(2);
    expect(first.sent + second.sent).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // A later run finds nothing due.
    expect(await sendDueFollowUps(api, NOW)).toEqual({ due: 0, sent: 0, blocked: 0 });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('skips a row it can no longer claim', async () => {
    seedChat('chat-db-1');
    seedCase({ id: 'case-1' });
    const { api, sendMessage } = fakeApi();
    // Between the read and the claim, another run (or /cancel) cleared the date.
    prismaFake.depositCase.findMany.mockImplementationOnce(async () => {
      const snapshot = h.cases.map((row) => ({
        ...row,
        chat: { chatId: BigInt(TG_CHAT_ID), locale: 'ru' },
      }));
      caseById('case-1').followUpAt = null;
      return snapshot;
    });

    expect(await sendDueFollowUps(api, NOW)).toEqual({ due: 1, sent: 0, blocked: 0 });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('restores the date after a failed send, so the next run retries', async () => {
    seedChat('chat-db-1');
    seedCase({ id: 'case-1', status: 'letter_sent', followUpKind: 'letter' });
    const { api, sendMessage } = fakeApi();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMessage.mockRejectedValueOnce(telegramError(429, 'Too Many Requests: retry after 5'));

    expect(await sendDueFollowUps(api, NOW)).toEqual({ due: 1, sent: 0, blocked: 0 });
    expect(caseById('case-1')).toMatchObject({ followUpAt: DUE, followUpKind: 'letter' });
    expect(h.chats[0].blockedAt).toBeNull();
    // The log carries the error message, not the payload with the chat id.
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(String(TG_CHAT_ID));

    expect(await sendDueFollowUps(api, NOW)).toEqual({ due: 1, sent: 1, blocked: 0 });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(caseById('case-1').followUpAt).toBeNull();
  });

  it('restores the date after a network error too', async () => {
    seedChat('chat-db-1');
    seedCase({ id: 'case-1' });
    const { api, sendMessage } = fakeApi();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMessage.mockRejectedValueOnce(new Error('socket hang up'));

    await sendDueFollowUps(api, NOW);

    expect(caseById('case-1').followUpAt).toEqual(DUE);
  });

  it('does not overwrite a newer date set while the send was failing', async () => {
    seedChat('chat-db-1');
    seedCase({ id: 'case-1' });
    const { api, sendMessage } = fakeApi();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMessage.mockImplementationOnce(async () => {
      // The person taps "I sent the letter" meanwhile: a new date is set.
      Object.assign(caseById('case-1'), { followUpAt: LATER, followUpKind: 'letter' });
      throw new Error('socket hang up');
    });

    await sendDueFollowUps(api, NOW);

    expect(caseById('case-1')).toMatchObject({ followUpAt: LATER, followUpKind: 'letter' });
  });

  it('marks the chat blocked on 403 and leaves the follow-up cleared', async () => {
    seedChat('chat-db-1');
    seedCase({ id: 'case-1' });
    const { api, sendMessage } = fakeApi();
    sendMessage.mockRejectedValueOnce(telegramError(403, 'Forbidden: bot was blocked by the user'));

    expect(await sendDueFollowUps(api, NOW)).toEqual({ due: 1, sent: 0, blocked: 1 });
    expect(prismaFake.telegramChat.updateMany).toHaveBeenCalledWith({
      where: { chatId: BigInt(TG_CHAT_ID) },
      data: { blockedAt: NOW },
    });
    expect(h.chats[0].blockedAt).toEqual(NOW);
    expect(caseById('case-1').followUpAt).toBeNull();

    expect(await sendDueFollowUps(api, NOW)).toEqual({ due: 0, sent: 0, blocked: 0 });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('leaves rows that are not due, or not open, alone', async () => {
    seedChat('chat-db-1');
    seedCase({ id: 'future', followUpAt: LATER });
    seedCase({ id: 'resolved', status: 'resolved' });
    seedCase({ id: 'none', followUpAt: null });
    const { api, sendMessage } = fakeApi();

    expect(await sendDueFollowUps(api, NOW)).toEqual({ due: 0, sent: 0, blocked: 0 });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(prismaFake.depositCase.updateMany).not.toHaveBeenCalled();
  });
});

describe('cancelDepositFlow', () => {
  it('turns off a pending reminder but keeps its kind', async () => {
    seedChat('chat-db-1');
    seedCase({ id: 'case-1', status: 'verdict', followUpKind: 'deadline' });
    const { ctx, reply } = fakeCtx();

    await cancelDepositFlow(ctx, 'chat-db-1', 'ru');

    expect(caseById('case-1')).toMatchObject({
      status: 'verdict',
      followUpAt: null,
      followUpKind: 'deadline',
    });
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith('Напоминания отключены.');
  });

  it('turns off the reminder after a letter, and the next run sends nothing', async () => {
    seedChat('chat-db-1');
    seedCase({ id: 'case-1', status: 'letter_sent', followUpKind: 'letter' });
    const { ctx, reply } = fakeCtx();
    const { api, sendMessage } = fakeApi();

    await cancelDepositFlow(ctx, 'chat-db-1', 'ru');

    expect(caseById('case-1')).toMatchObject({
      status: 'letter_sent',
      followUpAt: null,
      followUpKind: 'letter',
    });
    expect(reply).toHaveBeenCalledWith('Напоминания отключены.');
    expect(await sendDueFollowUps(api, NOW)).toEqual({ due: 0, sent: 0, blocked: 0 });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('replies in Ukrainian', async () => {
    seedChat('chat-db-1', 'uk');
    seedCase({ id: 'case-1' });
    const { ctx, reply } = fakeCtx();

    await cancelDepositFlow(ctx, 'chat-db-1', 'uk');

    expect(reply).toHaveBeenCalledWith('Нагадування вимкнено.');
  });

  it('still leaves the intake questions with the existing reply', async () => {
    seedChat('chat-db-1');
    seedCase({ id: 'case-1', status: 'intake', followUpAt: null, followUpKind: null });
    const { ctx, reply } = fakeCtx();

    await cancelDepositFlow(ctx, 'chat-db-1', 'ru');

    expect(caseById('case-1').status).toBe('abandoned');
    expect(reply).toHaveBeenCalledWith('Ок, отменил. Если понадобится — напиши «залог».');
  });

  it('with nothing to cancel, gives the existing reply and changes nothing', async () => {
    seedChat('chat-db-1');
    seedChat('chat-db-2', 'ru', BigInt(888000222));
    seedCase({ id: 'no-reminder', status: 'verdict', followUpAt: null });
    seedCase({ id: 'resolved', status: 'resolved', followUpAt: null, followUpKind: 'letter' });
    seedCase({ id: 'other-chat', chatId: 'chat-db-2' });
    const { ctx, reply } = fakeCtx();

    await cancelDepositFlow(ctx, 'chat-db-1', 'ru');

    expect(reply).toHaveBeenCalledWith('Сейчас нечего отменять 🙂');
    expect(caseById('other-chat').followUpAt).toEqual(DUE);
    expect(caseById('resolved').status).toBe('resolved');
  });
});
