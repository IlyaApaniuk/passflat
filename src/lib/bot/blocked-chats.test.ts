import type { Bot } from 'grammy';
import type { Update } from 'grammy/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBot } from './bot';

/**
 * Spec 06 §Blocked chats (FR-16 "the chat not blocked"): a `my_chat_member`
 * update runs through the real bot, from the update to the Prisma write, with
 * every Telegram API call captured instead of sent.
 */

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  findUnique: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    telegramChat: {
      updateMany: mocks.updateMany,
      update: mocks.update,
      create: mocks.create,
      findUnique: mocks.findUnique,
    },
  },
}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('./analytics', () => ({ track: mocks.track }));
// Geocoding is a paid Google call: never made from a test.
vi.mock('./geocode', () => ({ geocodeAddress: vi.fn(), transliterateToPolish: (s: string) => s }));

const CHAT_ID = 4242;
const NOW = new Date('2026-11-19T12:00:00Z');
const BOT_USER = { id: 1, is_bot: true, first_name: 'Passflat' };

type Status = 'member' | 'kicked' | 'left' | 'administrator';
type ChatKind = 'private' | 'group' | 'supergroup' | 'channel';

function chatOf(kind: ChatKind) {
  if (kind === 'private') return { id: CHAT_ID, type: kind, first_name: 'Anna' };
  return { id: -100_200_300, type: kind, title: 'Warsaw flats' };
}

function memberOf(status: Status) {
  if (status === 'kicked') return { user: BOT_USER, status, until_date: 0 };
  return { user: BOT_USER, status };
}

function myChatMember(kind: ChatKind, from: Status, to: Status): Update {
  return {
    update_id: 7,
    my_chat_member: {
      chat: chatOf(kind),
      from: { id: CHAT_ID, is_bot: false, first_name: 'Anna' },
      date: Math.floor(NOW.getTime() / 1000),
      old_chat_member: memberOf(from),
      new_chat_member: memberOf(to),
    },
  } as unknown as Update;
}

let bot: Bot;
let apiCalls: string[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mocks.updateMany.mockResolvedValue({ count: 1 });

  bot = createBot('123:test-token');
  bot.botInfo = { ...BOT_USER, username: 'passflat_test_bot' } as Bot['botInfo'];
  apiCalls = [];
  bot.api.config.use(async (_prev, method) => {
    apiCalls.push(method);
    return { ok: true, result: true } as never;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Nothing else happens: no event, no reply or other API call, no other write. */
function expectNothingElse() {
  expect(mocks.track).not.toHaveBeenCalled();
  expect(apiCalls).toEqual([]);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
}

describe('my_chat_member (spec 06 §Blocked chats)', () => {
  it('marks a private chat blocked when the person blocks the bot (member → kicked)', async () => {
    await bot.handleUpdate(myChatMember('private', 'member', 'kicked'));

    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { chatId: BigInt(CHAT_ID) },
      data: { blockedAt: NOW },
    });
    expectNothingElse();
  });

  it('clears blocked_at when the person unblocks the bot (kicked → member)', async () => {
    await bot.handleUpdate(myChatMember('private', 'kicked', 'member'));

    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { chatId: BigInt(CHAT_ID) },
      data: { blockedAt: null },
    });
    expectNothingElse();
  });

  it('creates no row for a chat it never saw (the update changes nothing)', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await bot.handleUpdate(myChatMember('private', 'member', 'kicked'));

    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expectNothingElse();
  });

  it.each([
    ['group', 'member', 'kicked'],
    ['group', 'left', 'member'],
    ['supergroup', 'administrator', 'kicked'],
    ['supergroup', 'kicked', 'member'],
    ['channel', 'administrator', 'left'],
  ] as const)('ignores a %s chat (%s → %s)', async (kind, from, to) => {
    await bot.handleUpdate(myChatMember(kind, from, to));

    expect(mocks.updateMany).not.toHaveBeenCalled();
    expectNothingElse();
  });

  it('ignores any other new status in a private chat', async () => {
    await bot.handleUpdate(myChatMember('private', 'member', 'left'));

    expect(mocks.updateMany).not.toHaveBeenCalled();
    expectNothingElse();
  });
});
