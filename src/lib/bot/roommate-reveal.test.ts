import type { RoommateProfile } from '@prisma/client';
import { GrammyError, type Api, type Bot, type Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The reveal of a formed pair (PRD 3 FR-26 criteria 3 – 4, FR-30; spec 07 §Reveal, §Usernames):
 * the two messages (the waiting person first) with the safety lines, the next steps and a Report
 * button for the partner, each claimed on `revealed_at`; the usernames refreshed with `getChat`;
 * the username prompt (context `reveal`) and its Done; a blocked chat, a 403, another send error;
 * `retryPendingReveals` in the send-hour run; the next-step callbacks and their links.
 *
 * Taps go through the handlers `registerRoommateFlow` and `registerRoommateMatching` register,
 * the cron through `runRoommateDaily` with its default jobs, over one in-memory Prisma fake whose
 * reads apply their `where` (relations, `OR`, the reaction's profiles) and return copies.
 * Telegram is a fake `api` (`sendMessage`, `getChat`); nothing reaches Telegram, PostHog or a
 * database.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = {
    profiles: [] as Row[],
    chats: [] as Row[],
    reactions: [] as Row[],
    reports: [] as Row[],
  };
  const chatOf = (row: Row) => state.chats.find((chat) => chat.id === row.chatId) ?? {};
  const profileOf = (id: unknown) => state.profiles.find((row) => row.id === id) ?? {};

  /** `relation: { none: {...} }` on a profile: the table and the field that points at it. */
  const RELATIONS: Record<string, ['reactions' | 'reports', string]> = {
    reactionsGot: ['reactions', 'toProfileId'],
    reactionsGiven: ['reactions', 'fromProfileId'],
    reportsReceived: ['reports', 'targetProfileId'],
    reportsMade: ['reports', 'reporterProfileId'],
  };

  const time = (value: unknown) => (value instanceof Date ? value.getTime() : NaN);

  function matches(row: Row, where: Where): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (key === 'OR') return (cond as Where[]).some((part) => matches(row, part));
      if (key === 'chat') return matches(chatOf(row), cond as Where);
      if (key === 'fromProfile') return matches(profileOf(row.fromProfileId), cond as Where);
      if (key === 'toProfile') return matches(profileOf(row.toProfileId), cond as Where);
      if (key in RELATIONS) {
        const { none, ...rest } = cond as { none?: Where };
        if (!none || Object.keys(rest).length) throw new Error(`only none on ${key}`);
        const [table, own] = RELATIONS[key];
        return !state[table].some((item) => item[own] === row.id && matches(item, none));
      }
      const value = row[key] ?? null;
      if (cond === null) return value === null;
      if (cond instanceof Date) return time(value) === cond.getTime();
      if (typeof cond === 'object') {
        const {
          in: list,
          not,
          gt,
          lte,
          ...rest
        } = cond as {
          in?: unknown[];
          not?: unknown;
          gt?: Date;
          lte?: Date;
        };
        if (Object.keys(rest).length) throw new Error(`unsupported filter on ${key}`);
        if (list && !list.includes(value)) return false;
        if ('not' in (cond as object) && value === not) return false;
        if (gt && !(time(value) > gt.getTime())) return false;
        if (lte && !(time(value) <= lte.getTime())) return false;
        return true;
      }
      return value === cond;
    });
  }

  function project(row: Row, select: Row): Row {
    return Object.fromEntries(
      Object.entries(select).map(([key, part]) => [
        key,
        part === true
          ? structuredClone(row[key])
          : project(key === 'chat' ? chatOf(row) : (row[key] as Row), (part as Row).select as Row),
      ]),
    );
  }

  type Read = { where: Where; select?: Row; include?: Row; orderBy?: Row; take?: number };

  function readMany(
    table: Row[],
    { where, select, orderBy, take }: Read,
    include: (r: Row) => Row,
  ) {
    let hits = table.filter((row) => matches(row, where));
    if (orderBy) {
      const [field] = Object.keys(orderBy);
      hits = [...hits].sort((a, b) => time(a[field]) - time(b[field]));
    }
    if (take !== undefined) hits = hits.slice(0, take);
    return hits.map((row) => (select ? project(row, select) : include(row)));
  }

  function updateMany(table: Row[], { where, data }: { where: Where; data: Row }) {
    const hits = table.filter((row) => matches(row, where));
    for (const row of hits) Object.assign(row, structuredClone(data));
    return { count: hits.length };
  }

  return {
    state,
    prisma: {
      telegramChat: {
        findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select?: Row }) => {
          const chat = state.chats.find((row) => row.id === where.id);
          if (!chat) return null;
          if (select?.chatId) return { chatId: chat.chatId };
          const profile = state.profiles.find((row) => row.chatId === where.id);
          return {
            roommateBannedAt: chat.roommateBannedAt ?? null,
            roommateProfile: profile ? structuredClone(profile) : null,
          };
        }),
        updateMany: vi.fn(async (args: { where: Where; data: Row }) =>
          updateMany(state.chats, args),
        ),
      },
      roommateProfile: {
        findUnique: vi.fn(async ({ where }: { where: { chatId: string } }) => {
          const row = state.profiles.find((profile) => profile.chatId === where.chatId);
          return row ? structuredClone(row) : null;
        }),
        findMany: vi.fn(async (args: Read) =>
          readMany(state.profiles, args, (row) => {
            const copy = structuredClone(row);
            const chat = (args.include?.chat as Row | undefined)?.select as Row | undefined;
            if (chat) copy.chat = project(chatOf(row), chat);
            return copy;
          }),
        ),
        findFirst: vi.fn(async ({ where }: { where: Where }) => {
          const row = state.profiles.find((profile) => matches(profile, where));
          return row ? structuredClone(row) : null;
        }),
        updateMany: vi.fn(async (args: { where: Where; data: Row }) =>
          updateMany(state.profiles, args),
        ),
        deleteMany: vi.fn(async ({ where }: { where: Where }) => {
          const hits = state.profiles.filter((row) => matches(row, where));
          state.profiles = state.profiles.filter((row) => !hits.includes(row));
          return { count: hits.length };
        }),
      },
      roommateReaction: {
        createMany: vi.fn(async ({ data }: { data: Row[] }) => {
          let count = 0;
          for (const item of data) {
            const exists = state.reactions.some(
              (r) => r.fromProfileId === item.fromProfileId && r.toProfileId === item.toProfileId,
            );
            if (exists) continue;
            state.reactions.push({
              id: `r-${state.reactions.length + 1}`,
              matchedAt: null,
              revealedAt: null,
              ...item,
            });
            count += 1;
          }
          return { count };
        }),
        count: vi.fn(
          async ({ where }: { where: Where }) =>
            state.reactions.filter((row) => matches(row, where)).length,
        ),
        findMany: vi.fn(async (args: Read) =>
          readMany(state.reactions, args, (row) => {
            const copy = structuredClone(row);
            if (!args.include) return copy;
            const from = profileOf(row.fromProfileId);
            return { ...copy, fromProfile: { ...structuredClone(from), chat: chatOf(from) } };
          }),
        ),
        updateMany: vi.fn(async (args: { where: Where; data: Row }) =>
          updateMany(state.reactions, args),
        ),
      },
      roommateReport: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      /** `formMutualMatch`'s statement, applied in memory (as in `roommate-cards.test.ts`). */
      $executeRaw: vi.fn(
        async (_sql: TemplateStringsArray, ...values: unknown[]): Promise<number> => {
          const [a, b, , , at] = values as [string, string, string, string, Date];
          const pair = state.reactions.filter(
            (r) =>
              r.kind === 'interest' &&
              r.matchedAt == null &&
              ((r.fromProfileId === a && r.toProfileId === b) ||
                (r.fromProfileId === b && r.toProfileId === a)),
          );
          if (pair.length !== 2) return 0;
          for (const r of pair) r.matchedAt = at;
          return 2;
        },
      ),
    },
  };
});
const mocks = vi.hoisted(() => ({
  touchChat: vi.fn(),
  track: vi.fn(),
  hasOpenIntake: vi.fn(),
  getCity: vi.fn(),
  roomCostsReply: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }));
vi.mock('./store', () => ({ touchChat: mocks.touchChat }));
vi.mock('./analytics', () => ({ track: mocks.track }));
vi.mock('./deposit-flow', () => ({ hasOpenIntake: mocks.hasOpenIntake }));
vi.mock('./lookup', () => ({ getCity: mocks.getCity }));
vi.mock('./roommate-room-costs', () => ({ roomCostsReply: mocks.roomCostsReply }));

import { runRoommateDaily, type CronClock } from './roommate-daily';
import { registerRoommateFlow } from './roommate-flow';
import { registerRoommateMatching, renderRoommateCard } from './roommate-matching';
import { revealKeyboard, revealText } from './roommate-reveal';
import { rt, type RoommateLocale } from './roommate-texts';

/** 10:00 Warsaw in winter: the send hour of the roommate cron. */
const NOW = new Date('2026-12-05T09:00:00Z');
const LATER = new Date('2027-01-04T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const DISTRICTS = [{ slug: 'mokotow', nameKey: 'Mokotów' }];

/** A profile id of the database's shape. */
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const VIEWER = uid(1);
const B = uid(3);
const C = uid(4);

/** The Telegram chat id of the chat of profile `id` (its `tg_<chatId>` identity). */
const tgChatOf = (id: string) => 7000 + Number(id.slice(-4));
const VIEWER_CHAT = tgChatOf(VIEWER);

function profile(id: string, fields: Partial<RoommateProfile> = {}): Row {
  const value: RoommateProfile = {
    id,
    chatId: `chat-${id}`,
    status: 'active',
    step: null,
    entrySource: 'tg',
    districtSlugs: ['mokotow'],
    anyDistrict: false,
    budgetBand: 'b3',
    moveInMonth: new Date('2027-02-01T00:00:00.000Z'),
    languages: ['ru'],
    gender: null,
    prefers: 'anyone',
    about: null,
    smoking: null,
    pets: null,
    adultConfirmedAt: NOW,
    tgUsername: `user_${id.slice(-2)}`,
    activatedAt: new Date(NOW.getTime() - 10 * DAY),
    expiresAt: LATER,
    renewalRemindedAt: null,
    expiredAt: null,
    renewedAt: null,
    notifyOnOpenAt: null,
    notifiedOpenAt: null,
    pushOff: false,
    lastPushAt: null,
    hiddenAt: null,
    hiddenReason: null,
    statementSentAt: null,
    appealedAt: null,
    outcomeAskedAt: null,
    outcome: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...fields,
  };
  return value as unknown as Row;
}

/** What Telegram's `getChat` says each chat's username is now (absent = none). */
let telegramUsernames = new Map<number, string | undefined>();

/** Profiles in their own chats (locale per chat); Telegram knows the stored usernames. */
function seed(rows: Row[], locales: Record<string, RoommateLocale> = {}) {
  db.state.profiles = rows;
  db.state.chats = rows.map((row) => ({
    id: row.chatId,
    chatId: BigInt(tgChatOf(row.id as string)),
    blockedAt: null,
    roommateBannedAt: null,
    locale: locales[row.id as string] ?? 'ru',
  }));
  db.state.reactions = [];
  db.state.reports = [];
  telegramUsernames = new Map(
    rows.map((row) => [tgChatOf(row.id as string), (row.tgUsername as string | null) ?? undefined]),
  );
}

const row = (id: string) => db.state.profiles.find((r) => r.id === id)!;
const chatOfProfile = (id: string) => db.state.chats.find((chat) => chat.id === `chat-${id}`)!;
const reaction = (from: string, to: string) =>
  db.state.reactions.find((r) => r.fromProfileId === from && r.toProfileId === to);

function interest(from: string, to: string, fields: Row = {}): Row {
  return {
    id: `r-${from.slice(-2)}-${to.slice(-2)}`,
    fromProfileId: from,
    toProfileId: to,
    kind: 'interest',
    createdAt: new Date(NOW.getTime() - 3 * DAY),
    matchedAt: null,
    revealedAt: null,
    ...fields,
  };
}

/** A pair formed earlier: B waiting (the earlier interest), the viewer completing it. */
function formedPair(fields: { b?: Row; viewer?: Row } = {}) {
  const matchedAt = new Date(NOW.getTime() - DAY);
  db.state.reactions.push(
    interest(B, VIEWER, { createdAt: new Date(NOW.getTime() - 3 * DAY), matchedAt, ...fields.b }),
    interest(VIEWER, B, { createdAt: matchedAt, matchedAt, ...fields.viewer }),
  );
}

function grammyError(code: number, description: string): GrammyError {
  return new GrammyError(
    "Call to 'sendMessage' failed!",
    { ok: false, error_code: code, description },
    'sendMessage',
    { chat_id: 500_000_001, text: 'roommate' },
  );
}

type Button = { text: string; callback_data?: string };
type Options = {
  reply_markup?: { inline_keyboard: Button[][] };
  parse_mode?: string;
  link_preview_options?: { is_disabled: boolean };
};

const api = {
  sendMessage: vi.fn(async (_chatId: number, _text: string, _options?: Options) => ({})),
  getChat: vi.fn(async (chatId: number) => ({
    id: chatId,
    type: 'private' as const,
    ...(telegramUsernames.get(chatId) ? { username: telegramUsernames.get(chatId) } : {}),
  })),
};

/** Every message sent through `api.sendMessage`, in order, with its buttons' callback data. */
function sent() {
  return api.sendMessage.mock.calls.map(([chatId, text, options]) => ({
    chatId,
    text,
    data: (options?.reply_markup?.inline_keyboard ?? []).map((r) => r.map((b) => b.callback_data)),
  }));
}

const nextStepRows = [['rm:ns:agreement'], ['rm:ns:address'], ['rm:ns:cost']];
const revealButtons = (partner: string) => [...nextStepRows, [`rm:r:${partner}`]];

type Handler = (ctx: Context) => Promise<void>;
type Route = [trigger: string | RegExp, handler: Handler];

function registeredRoutes(): Route[] {
  const routes: Route[] = [];
  const bot = {
    command: vi.fn(),
    callbackQuery: (trigger: string | RegExp, handler: Handler) => {
      routes.push([trigger, handler]);
    },
  } as unknown as Bot;
  registerRoommateFlow(bot);
  registerRoommateMatching(bot);
  return routes;
}

const ROUTES = registeredRoutes();

/** A tap by the person of profile `who` (the viewer by default) on a button with `data`. */
async function tap(
  data: string,
  {
    who = VIEWER,
    locale = 'ru',
    username = row(who)?.tgUsername as string | null,
  }: { who?: string; locale?: RoommateLocale; username?: string | null } = {},
) {
  mocks.touchChat.mockResolvedValue({ id: `chat-${who}`, locale, isNew: false });
  const routes = ROUTES.filter(([trigger]) =>
    typeof trigger === 'string' ? trigger === data : trigger.test(data),
  );
  expect(routes, `routes for ${data}`).toHaveLength(1);
  const [trigger, handler] = routes[0];
  const reply = vi.fn().mockResolvedValue({});
  const ctx = {
    chat: { id: tgChatOf(who) },
    from: username === null ? { id: tgChatOf(who) } : { id: tgChatOf(who), username },
    callbackQuery: { id: 'q', data },
    match: typeof trigger === 'string' ? data : data.match(trigger),
    reply,
    api: api as unknown as Api,
    answerCallbackQuery: vi.fn().mockResolvedValue(true),
  } as unknown as Context;
  await handler(ctx);
  return reply.mock.calls.map(([text, options]) => ({
    text: text as string,
    options: options as Options | undefined,
    data: ((options as Options)?.reply_markup?.inline_keyboard ?? []).map((r) =>
      r.map((b) => b.callback_data),
    ),
  }));
}

function fakeClock(start = 1_000_000): CronClock {
  let t = start;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

const runCron = () => runRoommateDaily(api as unknown as Api, NOW, { clock: fakeClock() });

const cardOf = (id: string) =>
  renderRoommateCard(row(id) as unknown as RoommateProfile, DISTRICTS, 'ru');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://passflat.com');
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.getCity.mockResolvedValue({ districts: DISTRICTS });
  mocks.roomCostsReply.mockResolvedValue(null);
});

describe('the reveal text and buttons (PRD 3 §8 "Reveal with safety lines")', () => {
  it.each<[RoommateLocale, string]>([
    [
      'ru',
      'Интерес взаимный. Напиши @user_03.\n\nPassflat никогда не просит денег. Не плати залог или «бронь» до просмотра квартиры и подписанного договора. Если человек просит деньги или документы — нажми «Пожаловаться».',
    ],
    [
      'uk',
      'Інтерес взаємний. Напиши @user_03.\n\nPassflat ніколи не просить грошей. Не плати заставу чи «бронь» до перегляду квартири й підписаного договору. Якщо людина просить гроші чи документи — натисни «Поскаржитися».',
    ],
    [
      'en',
      "It's mutual. Write to @user_03.\n\nPassflat never asks for money. Don't pay a deposit or a 'reservation' before a viewing and a signed contract. If someone asks for money or documents, tap Report.",
    ],
  ])('%s: the match line, then the safety lines', (locale, text) => {
    expect(revealText(locale, 'user_03')).toBe(text);
  });

  it.each<RoommateLocale>(['ru', 'uk', 'en'])(
    '%s: the safety lines name the Report button it carries',
    (locale) => {
      const keyboard = revealKeyboard(locale, B).inline_keyboard;
      expect(keyboard.map((r) => r.map((b) => (b as Button).callback_data))).toEqual(
        revealButtons(B),
      );
      const report = (keyboard[3][0] as Button).text.replace(/^\S+\s/, '');
      expect(revealText(locale, 'x')).toContain(report);
      expect(keyboard.map((r) => (r[0] as Button).text)).toEqual([
        rt(locale, 'btnNextAgreement'),
        rt(locale, 'btnNextAddress'),
        rt(locale, 'btnNextCost'),
        rt(locale, 'btnReport'),
      ]);
    },
  );
});

describe('a pair formed by "Interested": both usernames present', () => {
  it('reveals B first, then the viewer, each naming the other, claimed on revealed_at', async () => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B)], { [B]: 'uk' });
    db.state.reactions.push(interest(B, VIEWER));

    const replies = await tap(`rm:i:${B}`);

    expect(sent()).toEqual([
      { chatId: tgChatOf(B), text: revealText('uk', 'anna_w'), data: revealButtons(VIEWER) },
      { chatId: VIEWER_CHAT, text: revealText('ru', 'user_03'), data: revealButtons(B) },
    ]);
    expect(reaction(B, VIEWER)?.revealedAt).toEqual(NOW);
    expect(reaction(VIEWER, B)?.revealedAt).toEqual(NOW);
    // The reveal takes the next card's place for the viewer.
    expect(replies).toEqual([]);
    expect(mocks.track.mock.calls).toEqual([
      [VIEWER_CHAT, 'tg_roommate_interest_sent'],
      [VIEWER_CHAT, 'tg_roommate_matched', { role: 'completer' }],
      [tgChatOf(B), 'tg_roommate_matched', { role: 'waiting' }],
      [tgChatOf(B), 'tg_roommate_contact_revealed'],
      [VIEWER_CHAT, 'tg_roommate_contact_revealed'],
    ]);
  });

  it('refreshes each username with getChat before the send and stores the fresh one', async () => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B, { tgUsername: 'old_b' })]);
    telegramUsernames.set(tgChatOf(B), 'new_b');
    db.state.reactions.push(interest(B, VIEWER));

    await tap(`rm:i:${B}`);

    expect(api.getChat.mock.calls.map(([chatId]) => chatId).sort()).toEqual(
      [VIEWER_CHAT, tgChatOf(B)].sort(),
    );
    expect(sent()[1]).toMatchObject({ chatId: VIEWER_CHAT, text: revealText('ru', 'new_b') });
    expect(
      sent()
        .map((m) => m.text)
        .join('\n'),
    ).not.toContain('old_b');
    expect(row(B).tgUsername).toBe('new_b');
  });

  it('a failed getChat uses the stored username', async () => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B, { tgUsername: 'stored_b' })]);
    db.state.reactions.push(interest(B, VIEWER));
    api.getChat.mockRejectedValue(new Error('network down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await tap(`rm:i:${B}`);

    expect(sent().map((m) => m.text)).toEqual([
      revealText('ru', 'anna_w'),
      revealText('ru', 'stored_b'),
    ]);
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/\d{4}/);
    error.mockRestore();
    api.getChat.mockReset();
    api.getChat.mockImplementation(async (chatId: number) => ({
      id: chatId,
      type: 'private' as const,
      ...(telegramUsernames.get(chatId) ? { username: telegramUsernames.get(chatId) } : {}),
    }));
  });

  it('no event carries a username, a profile id, a chat row id or the partner chat id', async () => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B)]);
    db.state.reactions.push(interest(B, VIEWER));
    await tap(`rm:i:${B}`);
    await tap('rm:ns:agreement');

    const calls = mocks.track.mock.calls as [number, string, Record<string, unknown>?][];
    const secrets = [VIEWER, B, `chat-${B}`, `chat-${VIEWER}`, 'anna_w', 'user_03'];
    for (const [chatId, , properties = {}] of calls) {
      const text = JSON.stringify(properties);
      for (const secret of secrets) expect(text).not.toContain(secret);
      for (const other of [VIEWER_CHAT, tgChatOf(B)]) {
        if (other !== chatId) expect(text).not.toContain(String(other));
      }
    }
    expect(calls.filter(([, event]) => event === 'tg_roommate_contact_revealed')).toEqual([
      [tgChatOf(B), 'tg_roommate_contact_revealed'],
      [VIEWER_CHAT, 'tg_roommate_contact_revealed'],
    ]);
  });
});

describe('a missing username holds both reveals until Done', () => {
  it("B without a username: B gets the prompt, nobody is revealed, the viewer's next card follows", async () => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B, { tgUsername: null }), profile(C)]);
    db.state.reactions.push(interest(B, VIEWER));

    const replies = await tap(`rm:i:${B}`);

    expect(sent()).toEqual([
      { chatId: tgChatOf(B), text: rt('ru', 'usernamePromptReveal'), data: [['rm:u:done']] },
    ]);
    expect(reaction(B, VIEWER)?.revealedAt).toBeNull();
    expect(reaction(VIEWER, B)?.revealedAt).toBeNull();
    expect(replies.map((reply) => reply.text)).toEqual([cardOf(C)]);
    expect(mocks.track.mock.calls.slice(3)).toEqual([
      [tgChatOf(B), 'tg_roommate_username_prompted', { context: 'reveal' }],
    ]);
  });

  it('B taps Done with a username set: tg_roommate_username_set and both reveals, B first', async () => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B, { tgUsername: null })]);
    formedPair();
    telegramUsernames.set(tgChatOf(B), 'bob_new');

    const replies = await tap('rm:u:done', { who: B, username: 'bob_new' });

    expect(row(B).tgUsername).toBe('bob_new');
    expect(sent()).toEqual([
      { chatId: tgChatOf(B), text: revealText('ru', 'anna_w'), data: revealButtons(VIEWER) },
      { chatId: VIEWER_CHAT, text: revealText('ru', 'bob_new'), data: revealButtons(B) },
    ]);
    expect(replies).toEqual([]);
    expect(mocks.track.mock.calls).toEqual([
      [tgChatOf(B), 'tg_roommate_username_set', { context: 'reveal' }],
      [tgChatOf(B), 'tg_roommate_contact_revealed'],
      [VIEWER_CHAT, 'tg_roommate_contact_revealed'],
    ]);
  });

  it('Done still without a username asks again (context reveal), nothing revealed', async () => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B, { tgUsername: null })]);
    formedPair();

    const replies = await tap('rm:u:done', { who: B, username: null });

    expect(replies.map((reply) => [reply.text, reply.data])).toEqual([
      [rt('ru', 'usernamePromptReveal'), [['rm:u:done']]],
    ]);
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(mocks.track.mock.calls).toEqual([
      [tgChatOf(B), 'tg_roommate_username_prompted', { context: 'reveal' }],
    ]);
  });

  it('the viewer forms the pair without a username: the viewer is prompted instead of a card', async () => {
    seed([profile(VIEWER, { tgUsername: null }), profile(B), profile(C)]);
    telegramUsernames.delete(VIEWER_CHAT);
    db.state.reactions.push(interest(B, VIEWER));

    const replies = await tap(`rm:i:${B}`, { username: null });

    expect(sent()).toEqual([
      { chatId: VIEWER_CHAT, text: rt('ru', 'usernamePromptReveal'), data: [['rm:u:done']] },
    ]);
    expect(replies).toEqual([]);
    expect(mocks.track.mock.calls.at(-1)).toEqual([
      VIEWER_CHAT,
      'tg_roommate_username_prompted',
      { context: 'reveal' },
    ]);
  });

  it.each<RoommateLocale>(['ru', 'uk', 'en'])(
    '%s: the prompt goes out in the chat language',
    async (locale) => {
      seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B, { tgUsername: null })], {
        [B]: locale,
      });
      db.state.reactions.push(interest(B, VIEWER));
      await tap(`rm:i:${B}`);
      expect(sent()[0].text).toBe(rt(locale, 'usernamePromptReveal'));
    },
  );

  it('a retry does not prompt again someone whose stored username was already missing', async () => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B, { tgUsername: null })]);
    formedPair();

    // The viewer taps Done on an old prompt: B's username is still missing.
    await tap('rm:u:done');

    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('Done without waiting pairs keeps the browse context', async () => {
    seed([profile(VIEWER, { tgUsername: null }), profile(C)]);
    const replies = await tap('rm:u:done', { username: 'anna_w' });

    expect(replies.map((reply) => reply.text)).toEqual([cardOf(C)]);
    expect(mocks.track.mock.calls).toEqual([
      [VIEWER_CHAT, 'tg_roommate_username_set', { context: 'browse' }],
    ]);
  });
});

describe('a blocked chat, a 403 and other send errors', () => {
  it('a 403 to B marks B blocked, keeps its claim, and the viewer gets no reveal', async () => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B), profile(C)]);
    db.state.reactions.push(interest(B, VIEWER));
    api.sendMessage.mockRejectedValueOnce(grammyError(403, 'Forbidden: bot was blocked'));

    const replies = await tap(`rm:i:${B}`);

    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    expect(chatOfProfile(B).blockedAt).toEqual(NOW);
    expect(reaction(B, VIEWER)?.revealedAt).toEqual(NOW);
    expect(reaction(VIEWER, B)?.revealedAt).toBeNull();
    expect(replies.map((reply) => reply.text)).toEqual([cardOf(C)]);
    expect(mocks.track.mock.calls.map(([, event]) => event)).not.toContain(
      'tg_roommate_contact_revealed',
    );

    // Blocked: the send-hour retry reveals nothing either.
    api.sendMessage.mockClear();
    await runCron();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it("another error releases B's claim; the viewer waits; the send-hour retry sends both", async () => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B), profile(C)]);
    db.state.reactions.push(interest(B, VIEWER));
    api.sendMessage.mockRejectedValueOnce(grammyError(400, 'Bad Request: something'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const replies = await tap(`rm:i:${B}`);

    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    expect(reaction(B, VIEWER)?.revealedAt).toBeNull();
    expect(reaction(VIEWER, B)?.revealedAt).toBeNull();
    expect(replies.map((reply) => reply.text)).toEqual([cardOf(C)]);

    api.sendMessage.mockClear();
    mocks.track.mockClear();
    await runCron();

    expect(sent()).toEqual([
      { chatId: tgChatOf(B), text: revealText('ru', 'anna_w'), data: revealButtons(VIEWER) },
      { chatId: VIEWER_CHAT, text: revealText('ru', 'user_03'), data: revealButtons(B) },
    ]);
    expect(mocks.track.mock.calls).toEqual([
      [tgChatOf(B), 'tg_roommate_contact_revealed'],
      [VIEWER_CHAT, 'tg_roommate_contact_revealed'],
    ]);
    // Done: a second run sends nothing.
    api.sendMessage.mockClear();
    await runCron();
    expect(api.sendMessage).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('a failed send to the viewer after B got it: the retry sends only the viewer', async () => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B), profile(C)]);
    db.state.reactions.push(interest(B, VIEWER));
    api.sendMessage
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(grammyError(500, 'Internal Server Error'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await tap(`rm:i:${B}`);
    expect(reaction(B, VIEWER)?.revealedAt).toEqual(NOW);
    expect(reaction(VIEWER, B)?.revealedAt).toBeNull();

    api.sendMessage.mockClear();
    await runCron();
    expect(sent()).toEqual([
      { chatId: VIEWER_CHAT, text: revealText('ru', 'user_03'), data: revealButtons(B) },
    ]);
    error.mockRestore();
  });
});

describe('retryPendingReveals in the send-hour run', () => {
  it('reveals a waiting pair B first, with the switch on or off', async () => {
    for (const switchValue of ['true', '']) {
      vi.stubEnv('ROOMMATE_MATCHING_ENABLED', switchValue);
      seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B)]);
      formedPair();
      api.sendMessage.mockClear();

      await runCron();

      expect(
        sent().map((m) => m.chatId),
        switchValue,
      ).toEqual([tgChatOf(B), VIEWER_CHAT]);
    }
  });

  it.each<[string, () => void]>([
    ['a blocked chat', () => (chatOfProfile(B).blockedAt = NOW)],
    ['a banned chat', () => (chatOfProfile(B).roommateBannedAt = NOW)],
    ['an expired profile', () => Object.assign(row(B), { status: 'expired' })],
    ['a profile past its hide date', () => Object.assign(row(B), { expiresAt: NOW })],
    ['a hidden profile', () => Object.assign(row(VIEWER), { status: 'hidden' })],
    ['a username missing', () => Object.assign(row(B), { tgUsername: null })],
    ['both already revealed', () => db.state.reactions.forEach((r) => (r.revealedAt = NOW))],
  ])('sends nothing for %s', async (_case, change) => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B)]);
    formedPair();
    change();

    await runCron();

    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(api.getChat).not.toHaveBeenCalled();
  });

  it('a pair not matched yet is not revealed', async () => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B)]);
    db.state.reactions.push(interest(B, VIEWER), interest(VIEWER, B));

    await runCron();

    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('two overlapping runs send each reveal once', async () => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B)]);
    formedPair();

    await Promise.all([runCron(), runCron()]);

    expect(sent().map((m) => m.chatId)).toEqual([tgChatOf(B), VIEWER_CHAT]);
  });

  it('a username released since the match: getChat finds none, that person is prompted once', async () => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B)]);
    formedPair();
    telegramUsernames.delete(tgChatOf(B));

    await runCron();

    expect(sent()).toEqual([
      { chatId: tgChatOf(B), text: rt('ru', 'usernamePromptReveal'), data: [['rm:u:done']] },
    ]);
    expect(row(B).tgUsername).toBeNull();
    // The stored username is null now: the next run neither reveals nor prompts again.
    api.sendMessage.mockClear();
    await runCron();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });
});

describe('the next steps under a reveal (FR-30)', () => {
  const linkIn = (text: string, n = 0) =>
    new URL([...text.matchAll(/href="([^"]+)"/g)][n][1].replace(/&amp;/g, '&'));

  function expectBotUtm(url: URL) {
    expect(url.searchParams.get('utm_source')).toBe('telegram');
    expect(url.searchParams.get('utm_medium')).toBe('bot');
    expect(url.searchParams.get('utm_campaign')).toBe('roommate');
    for (const secret of [String(VIEWER_CHAT), VIEWER, `chat-${VIEWER}`]) {
      expect(url.toString()).not.toContain(secret);
    }
  }

  it.each<[RoommateLocale, string]>([
    ['ru', 'umowa-wspollokatorska-ru.pdf'],
    ['uk', 'umowa-wspollokatorska-uk.pdf'],
  ])('%s: agreement → the template in the locale and the Polish original', async (locale, file) => {
    seed([profile(VIEWER)]);
    const [reply] = await tap('rm:ns:agreement', { locale });

    expect(mocks.track.mock.calls).toEqual([
      [VIEWER_CHAT, 'tg_roommate_next_step', { step: 'agreement' }],
    ]);
    const translated = linkIn(reply.text, 0);
    const original = linkIn(reply.text, 1);
    expect(`${translated.origin}${translated.pathname}`).toBe(
      `https://passflat.com/documents/${file}`,
    );
    expect(`${original.origin}${original.pathname}`).toBe(
      'https://passflat.com/documents/umowa-wspollokatorska.pdf',
    );
    expectBotUtm(translated);
    expectBotUtm(original);
    expect(reply.text).toContain('umowa współlokatorska');
    expect(reply.options?.parse_mode).toBe('HTML');
  });

  it('address → the bot address prompt', async () => {
    seed([profile(VIEWER)]);
    const replies = await tap('rm:ns:address', { locale: 'uk' });

    expect(replies.map((reply) => reply.text)).toEqual([rt('uk', 'nextStepAddress')]);
    expect(mocks.track.mock.calls).toEqual([
      [VIEWER_CHAT, 'tg_roommate_next_step', { step: 'address_check' }],
    ]);
  });

  it('cost → the Warsaw costs page with the bot UTM', async () => {
    seed([profile(VIEWER)]);
    const [reply] = await tap('rm:ns:cost');

    const url = linkIn(reply.text);
    expect(`${url.origin}${url.pathname}`).toBe('https://passflat.com/ru/warsaw/costs');
    expectBotUtm(url);
    expect(mocks.track.mock.calls).toEqual([
      [VIEWER_CHAT, 'tg_roommate_next_step', { step: 'cost' }],
    ]);
  });

  it('works with the switch off (the reveal was already sent) and stores the username', async () => {
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', '');
    seed([profile(VIEWER, { tgUsername: 'old' })]);
    const replies = await tap('rm:ns:cost', { username: 'anna_w' });

    expect(replies).toHaveLength(1);
    expect(replies[0].text).not.toBe(rt('ru', 'matchingPaused'));
    expect(row(VIEWER).tgUsername).toBe('anna_w');
  });

  it('an unknown next step routes nowhere', () => {
    expect(
      ROUTES.filter(([trigger]) => trigger instanceof RegExp && trigger.test('rm:ns:x')),
    ).toEqual([]);
  });

  it('the Report button under a reveal names the partner profile', async () => {
    seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B)]);
    formedPair();
    await runCron();

    expect(sent()[0].data.at(-1)).toEqual([`rm:r:${VIEWER}`]);
    expect(sent()[1].data.at(-1)).toEqual([`rm:r:${B}`]);
    expect(`rm:r:${B}`.length).toBeLessThanOrEqual(64);
  });
});

it('the waiting person of a retry is the earlier interest, also when ids sort the other way', async () => {
  seed([profile(VIEWER, { tgUsername: 'anna_w' }), profile(B)]);
  const matchedAt = new Date(NOW.getTime() - HOUR);
  db.state.reactions.push(
    interest(VIEWER, B, { id: 'r-a', createdAt: new Date(NOW.getTime() - 2 * DAY), matchedAt }),
    interest(B, VIEWER, { id: 'r-b', createdAt: matchedAt, matchedAt }),
  );

  await runCron();

  expect(sent().map((m) => m.chatId)).toEqual([VIEWER_CHAT, tgChatOf(B)]);
});
