import type { RoommateProfile } from '@prisma/client';
import { GrammyError, type Api, type Bot, type Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The daily push (PRD 3 FR-27; spec 07 §Daily push): "<N> new people fit you" in the send-hour
 * run with the switch on, N counted over `findCompatible` since `coalesce(last_push_at,
 * activated_at)`, claimed on `last_push_at`, `tg_roommate_push_sent` with `count_band`; and its
 * toggle `rm:push:off` / `rm:push:on` (`tg_roommate_push_opted_out` on the way off).
 *
 * The cron runs through `runRoommateDaily` with its default jobs and the real `findCompatible`;
 * taps go through the handlers `registerRoommateFlow` and `registerRoommateMatching` register.
 * Both read one in-memory Prisma fake whose reads apply their `where` (the chat relation and the
 * reaction and report relations included) and return copies. Telegram is a fake `api`; nothing
 * reaches Telegram, PostHog or a database.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;
type ChatRow = {
  id: string;
  chatId: bigint;
  blockedAt: Date | null;
  roommateBannedAt: Date | null;
  locale: string;
};

const db = vi.hoisted(() => {
  const state = {
    profiles: [] as Row[],
    chats: [] as Row[],
    reactions: [] as Row[],
    reports: [] as Row[],
    /** Runs after every profile `findMany` read, before its caller writes. */
    afterRead: null as ((where: Where) => void) | null,
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

  function readMany(table: Row[], { where, select, include, orderBy, take }: Read) {
    let hits = table.filter((row) => matches(row, where));
    if (orderBy) {
      const [field] = Object.keys(orderBy);
      hits = [...hits].sort((a, b) => time(a[field]) - time(b[field]));
    }
    if (take !== undefined) hits = hits.slice(0, take);
    return hits.map((row) => {
      if (select) return project(row, select);
      const copy = structuredClone(row);
      const chat = (include?.chat as Row | undefined)?.select as Row | undefined;
      if (chat) copy.chat = project(chatOf(row), chat);
      return copy;
    });
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
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          const chat = state.chats.find((row) => row.id === where.id);
          if (!chat) return null;
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
        findMany: vi.fn(async (args: Read) => {
          const result = readMany(state.profiles, args);
          state.afterRead?.(args.where);
          return result;
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
      /** No pair is matched here: the default run's reveal retry finds none. */
      roommateReaction: { findMany: vi.fn(async (args: Read) => readMany(state.reactions, args)) },
      roommateReport: { deleteMany: vi.fn(async () => ({ count: 0 })) },
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
import { registerRoommateMatching } from './roommate-matching';
import { rt, type RoommateLocale } from './roommate-texts';

const at = (iso: string) => new Date(iso);
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/** The golden case's run: 2027-01-11 09:00 UTC, 10:00 Warsaw in winter (the send hour). */
const NOW = at('2027-01-11T09:00:00Z');
const NEXT_DAY = new Date(NOW.getTime() + DAY);
/** The golden case's last push. */
const LAST_PUSH = at('2027-01-10T09:00:00Z');
/** When the default profile came up: before the last push. */
const ACTIVATED = at('2027-01-01T10:00:00Z');

const DISTRICTS = [{ slug: 'mokotow', nameKey: 'Mokotów' }];

/** A profile id of the database's shape. */
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const VIEWER = uid(1);

/** The Telegram chat id of the chat of profile `id` (its `tg_<chatId>` identity). */
const tgChatOf = (id: string) => 7000 + Number(id.slice(-4));
const VIEWER_CHAT = tgChatOf(VIEWER);

/** Compatible with every other default row: Mokotów, b3, February 2027, Russian, anyone. */
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
    moveInMonth: at('2027-02-01T00:00:00.000Z'),
    languages: ['ru'],
    gender: null,
    prefers: 'anyone',
    about: null,
    smoking: null,
    pets: null,
    adultConfirmedAt: ACTIVATED,
    tgUsername: `user_${id.slice(-2)}`,
    activatedAt: ACTIVATED,
    expiresAt: at('2027-01-31T10:00:00Z'),
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
    createdAt: ACTIVATED,
    updatedAt: ACTIVATED,
    ...fields,
  };
  return value as unknown as Row;
}

/** A chat with its one profile. */
function seed(id: string, fields: Partial<RoommateProfile> = {}, chat: Partial<ChatRow> = {}) {
  db.state.chats.push({
    id: `chat-${id}`,
    chatId: BigInt(tgChatOf(id)),
    blockedAt: null,
    roommateBannedAt: null,
    locale: 'ru',
    ...chat,
  });
  db.state.profiles.push(profile(id, fields));
  return tgChatOf(id);
}

/** The viewer: pushed last at the golden case's `LAST_PUSH`. */
function seedViewer(fields: Partial<RoommateProfile> = {}, chat: Partial<ChatRow> = {}) {
  return seed(VIEWER, { lastPushAt: LAST_PUSH, ...fields }, chat);
}

/**
 * `n` profiles that fit the viewer and came up after its last push; their own push is off, so
 * every message of a run is the viewer's.
 */
function seedNew(n: number, from = 10, fields: Partial<RoommateProfile> = {}) {
  for (let i = 0; i < n; i += 1) {
    seed(uid(from + i), {
      activatedAt: new Date(LAST_PUSH.getTime() + (i + 1) * 60 * MINUTE),
      pushOff: true,
      ...fields,
    });
  }
}

const row = (id: string) => db.state.profiles.find((r) => r.id === id)!;
const chatRow = (id: string) => db.state.chats.find((chat) => chat.id === `chat-${id}`)!;

function grammyError(code: number, description: string): GrammyError {
  return new GrammyError(
    "Call to 'sendMessage' failed!",
    { ok: false, error_code: code, description },
    'sendMessage',
    { chat_id: 500_000_001, text: 'roommate' },
  );
}

type Button = { text: string; callback_data?: string };
type Options = { reply_markup?: { inline_keyboard: Button[][] }; parse_mode?: string };

const api = {
  sendMessage: vi.fn(async (_chatId: number, _text: string, _options?: Options) => ({})),
};

const buttons = (options?: Options) => options?.reply_markup?.inline_keyboard ?? [];

/** Every message sent through `api.sendMessage`, in order, with its buttons. */
function sent() {
  return api.sendMessage.mock.calls.map(([chatId, text, options]) => ({
    chatId,
    text,
    data: buttons(options).map((r) => r.map((b) => b.callback_data)),
    labels: buttons(options).map((r) => r.map((b) => b.text)),
  }));
}

const pushEvents = () =>
  mocks.track.mock.calls.filter(([, event]) => event === 'tg_roommate_push_sent');
const optOutEvents = () =>
  mocks.track.mock.calls.filter(([, event]) => event === 'tg_roommate_push_opted_out');

function fakeClock(start = 1_000_000): CronClock {
  let t = start;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

const run = (now: Date = NOW) =>
  runRoommateDaily(api as unknown as Api, now, { clock: fakeClock() });

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
  { who = VIEWER, locale = 'ru' }: { who?: string; locale?: RoommateLocale } = {},
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
    from: { id: tgChatOf(who), username: `user_${who.slice(-2)}` },
    callbackQuery: { id: 'q', data },
    match: typeof trigger === 'string' ? data : data.match(trigger),
    reply,
    api: api as unknown as Api,
    answerCallbackQuery: vi.fn().mockResolvedValue(true),
  } as unknown as Context;
  await handler(ctx);
  return reply.mock.calls.map(([text, options]) => ({
    text: text as string,
    data: buttons(options as Options | undefined).map((r) => r.map((b) => b.callback_data)),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.getCity.mockResolvedValue({ districts: DISTRICTS });
  mocks.roomCostsReply.mockResolvedValue(null);
  db.state.profiles = [];
  db.state.chats = [];
  db.state.reactions = [];
  db.state.reports = [];
  db.state.afterRead = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the daily push: the golden case (PRD 3 FR-27 criterion 1)', () => {
  it('last push 01-10 09:00 UTC; B created 01-10 15:00, C renewed 01-11 08:00, D not compatible → the run of 01-11 09:00 UTC says 2', async () => {
    seedViewer();
    seed(uid(2), { activatedAt: at('2027-01-10T15:00:00Z'), pushOff: true }); // B
    seed(uid(3), {
      activatedAt: at('2026-12-20T10:00:00Z'),
      renewedAt: at('2027-01-11T08:00:00Z'),
      expiresAt: at('2027-02-10T08:00:00Z'),
      pushOff: true,
    }); // C
    seed(uid(4), { activatedAt: at('2027-01-10T20:00:00Z'), languages: ['pl'], pushOff: true }); // D

    await run();

    expect(sent()).toEqual([
      {
        chatId: VIEWER_CHAT,
        text: 'Новых подходящих людей: 2.',
        data: [['rm:show:p'], ['rm:push:off']],
        labels: [['👀 Показать'], ['Остановить ежедневные сообщения']],
      },
    ]);
    expect(row(VIEWER).lastPushAt).toEqual(NOW);
    expect(mocks.track.mock.calls).toEqual([
      [VIEWER_CHAT, 'tg_roommate_push_sent', { count_band: '1-2' }],
    ]);
  });

  it('every profile counts from its own last push: B and C with their push on get theirs too', async () => {
    seedViewer();
    const b = seed(uid(2), { activatedAt: at('2027-01-10T15:00:00Z') });
    const c = seed(uid(3), {
      activatedAt: at('2026-12-20T10:00:00Z'),
      renewedAt: at('2027-01-11T08:00:00Z'),
      expiresAt: at('2027-02-10T08:00:00Z'),
    });
    seed(uid(4), { activatedAt: at('2027-01-10T20:00:00Z'), languages: ['pl'] }); // D: fits nobody

    await run();

    // The viewer: B and C. B (never pushed, came up 01-10 15:00): C's renewal. C (never pushed,
    // came up 12-20): the viewer (01-01) and B. D: nobody fits it.
    expect(sent().map(({ chatId, text }) => ({ chatId, text }))).toEqual([
      { chatId: c, text: 'Новых подходящих людей: 2.' },
      { chatId: VIEWER_CHAT, text: 'Новых подходящих людей: 2.' },
      { chatId: b, text: 'Новых подходящих людей: 1.' },
    ]);
  });
});

describe('the daily push: N = 0 sends nothing (criterion 2)', () => {
  function expectNothing() {
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(row(VIEWER).lastPushAt).toEqual(LAST_PUSH);
    expect(pushEvents()).toEqual([]);
  }

  it('nobody came up since the last push', async () => {
    seedViewer();
    seed(uid(2), { activatedAt: new Date(LAST_PUSH.getTime() - MINUTE), pushOff: true });
    seed(uid(3), {
      activatedAt: at('2026-12-01T10:00:00Z'),
      renewedAt: new Date(LAST_PUSH.getTime() - DAY),
      pushOff: true,
    });

    await run();

    expectNothing();
  });

  it('a profile that came up exactly at the last push is not new', async () => {
    seedViewer();
    seed(uid(2), { activatedAt: LAST_PUSH, pushOff: true });

    await run();

    expectNothing();
  });

  it('new profiles that do not fit, or that findCompatible leaves out, are not counted', async () => {
    seedViewer();
    const fresh = { activatedAt: new Date(LAST_PUSH.getTime() + 60 * MINUTE), pushOff: true };
    seed(uid(2), { ...fresh, languages: ['pl'] });
    seed(uid(3), { ...fresh, budgetBand: 'b5' });
    seed(uid(4), { ...fresh, status: 'hidden' });
    seed(uid(5), { ...fresh, status: 'expired', expiredAt: new Date(NOW.getTime() - MINUTE) });
    seed(uid(6), { ...fresh, status: 'draft' });
    seed(uid(7), fresh, { blockedAt: new Date(NOW.getTime() - DAY) });
    seed(uid(8), fresh, { roommateBannedAt: new Date(NOW.getTime() - DAY) });
    seed(uid(9), { ...fresh, expiresAt: new Date(NOW.getTime() - MINUTE) });
    seed(uid(10), fresh);
    db.state.reactions.push({ fromProfileId: VIEWER, toProfileId: uid(10), kind: 'interest' });
    seed(uid(11), fresh);
    db.state.reactions.push({ fromProfileId: VIEWER, toProfileId: uid(11), kind: 'skip' });
    seed(uid(12), fresh);
    db.state.reactions.push({ fromProfileId: uid(12), toProfileId: VIEWER, kind: 'skip' });
    seed(uid(13), fresh);
    db.state.reports.push({ reporterProfileId: VIEWER, targetProfileId: uid(13) });
    seed(uid(14), fresh);
    db.state.reports.push({ reporterProfileId: uid(14), targetProfileId: VIEWER });

    await run();

    expectNothing();
  });

  it('an interest from the other side does not hide a new profile: it is counted', async () => {
    seedViewer();
    seedNew(1);
    db.state.reactions.push({ fromProfileId: uid(10), toProfileId: VIEWER, kind: 'interest' });

    await run();

    expect(sent().map(({ text }) => text)).toEqual(['Новых подходящих людей: 1.']);
  });
});

describe('the daily push: what counts as new', () => {
  it('never pushed: counts from its own activation, so older profiles are not new', async () => {
    seed(VIEWER, { activatedAt: at('2027-01-05T10:00:00Z') });
    seed(uid(2), { activatedAt: at('2027-01-04T10:00:00Z'), pushOff: true });
    seed(uid(3), { activatedAt: at('2027-01-06T10:00:00Z'), pushOff: true });
    seed(uid(4), {
      activatedAt: at('2026-12-20T10:00:00Z'),
      renewedAt: at('2027-01-07T10:00:00Z'),
      pushOff: true,
    });

    await run();

    expect(sent().map(({ chatId, text }) => ({ chatId, text }))).toEqual([
      { chatId: VIEWER_CHAT, text: 'Новых подходящих людей: 2.' },
    ]);
  });

  it('a profile that comes up during the run is counted by the next push, not this one', async () => {
    seedViewer();
    seedNew(1);
    seed(uid(20), { activatedAt: new Date(NOW.getTime() + MINUTE), pushOff: true });

    await run();
    await run(NEXT_DAY);

    expect(sent().map(({ text }) => text)).toEqual([
      'Новых подходящих людей: 1.',
      'Новых подходящих людей: 1.',
    ]);
    expect(row(VIEWER).lastPushAt).toEqual(NEXT_DAY);
  });
});

describe('the daily push: claim before send (criterion 3)', () => {
  it('two runs in a row send one push; the next day sends only for what is new since', async () => {
    seedViewer();
    seedNew(2);

    await run();
    await run();
    expect(api.sendMessage).toHaveBeenCalledTimes(1);

    await run(NEXT_DAY);
    expect(api.sendMessage).toHaveBeenCalledTimes(1);

    seed(uid(30), { activatedAt: new Date(NEXT_DAY.getTime() + 2 * 60 * MINUTE), pushOff: true });
    const dayAfter = new Date(NEXT_DAY.getTime() + DAY);
    await run(dayAfter);

    expect(sent().map(({ text }) => text)).toEqual([
      'Новых подходящих людей: 2.',
      'Новых подходящих людей: 1.',
    ]);
    expect(pushEvents()).toEqual([
      [VIEWER_CHAT, 'tg_roommate_push_sent', { count_band: '1-2' }],
      [VIEWER_CHAT, 'tg_roommate_push_sent', { count_band: '1-2' }],
    ]);
    expect(row(VIEWER).lastPushAt).toEqual(dayAfter);
  });

  it('two overlapping runs send it once', async () => {
    seedViewer();
    seedNew(3);

    await Promise.all([run(), run()]);

    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    expect(pushEvents()).toHaveLength(1);
  });

  it('the cron invoked again later in the send hour sends no second push that day', async () => {
    seedViewer();
    seedNew(1);
    await run();

    // Someone new between the two invocations.
    const again = new Date(NOW.getTime() + 20 * MINUTE);
    seed(uid(30), { activatedAt: new Date(NOW.getTime() + 5 * MINUTE), pushOff: true });
    await run(again);
    expect(api.sendMessage).toHaveBeenCalledTimes(1);

    // The next day counts that one.
    await run(NEXT_DAY);
    expect(sent().map(({ text }) => text)).toEqual([
      'Новых подходящих людей: 1.',
      'Новых подходящих людей: 1.',
    ]);
  });

  it('the one-time message of the same run replaces that day’s push', async () => {
    seedViewer({ notifyOnOpenAt: at('2026-12-10T12:00:00Z') });
    seedNew(2);

    await run();

    expect(sent().map(({ text }) => text)).toEqual([
      'Подбор открыт. Сейчас тебе подходят 2 человека.',
    ]);
    expect(pushEvents()).toEqual([]);
    expect(row(VIEWER).lastPushAt).toEqual(NOW);
  });

  it('a failed send releases last_push_at as it was, no event; the next day retries from there', async () => {
    seedViewer();
    seedNew(2);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.sendMessage.mockRejectedValueOnce(grammyError(400, 'Bad Request: something'));

    await run();

    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    expect(row(VIEWER).lastPushAt).toEqual(LAST_PUSH);
    expect(pushEvents()).toEqual([]);
    expect(JSON.stringify(errors.mock.calls)).not.toContain(String(VIEWER_CHAT));

    await run(NEXT_DAY);

    expect(sent().map(({ text }) => text)).toEqual([
      'Новых подходящих людей: 2.',
      'Новых подходящих людей: 2.',
    ]);
    expect(pushEvents()).toHaveLength(1);
    expect(row(VIEWER).lastPushAt).toEqual(NEXT_DAY);
  });

  it('a 403 marks the chat blocked and keeps the claim; no event', async () => {
    seedViewer();
    seedNew(1);
    api.sendMessage.mockRejectedValueOnce(
      grammyError(403, 'Forbidden: bot was blocked by the user'),
    );

    await run();

    expect(chatRow(VIEWER).blockedAt).toEqual(NOW);
    expect(row(VIEWER).lastPushAt).toEqual(NOW);
    expect(pushEvents()).toEqual([]);
  });

  it('an opt-out between the read and the claim sends nothing', async () => {
    seedViewer();
    seedNew(1);
    db.state.afterRead = (where) => {
      if (where.pushOff === false) Object.assign(row(VIEWER), { pushOff: true });
    };

    await run();

    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(row(VIEWER).lastPushAt).toEqual(LAST_PUSH);
    expect(pushEvents()).toEqual([]);
  });
});

describe('the daily push: who gets it (edge cases)', () => {
  it.each(['', 'false', 'TRUE', '1'])(
    'with the switch "%s" (off) nothing is sent, claimed or tracked',
    async (value) => {
      vi.stubEnv('ROOMMATE_MATCHING_ENABLED', value);
      seedViewer();
      seedNew(2);

      await run();

      expect(api.sendMessage).not.toHaveBeenCalled();
      expect(row(VIEWER).lastPushAt).toEqual(LAST_PUSH);
      expect(mocks.track).not.toHaveBeenCalled();
    },
  );

  it('the switch is read per run: off, then on', async () => {
    seedViewer();
    seedNew(1);
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'false');
    await run();
    expect(api.sendMessage).not.toHaveBeenCalled();

    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
    await run();
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('outside the send hour nothing is sent', async () => {
    seedViewer();
    seedNew(1);

    await run(new Date(NOW.getTime() - 60 * MINUTE)); // 09:00 Warsaw

    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(row(VIEWER).lastPushAt).toEqual(LAST_PUSH);
  });

  it.each<[string, Partial<RoommateProfile>, Partial<ChatRow>]>([
    ['the push off', { pushOff: true }, {}],
    ['a hidden profile', { status: 'hidden', hiddenAt: LAST_PUSH, hiddenReason: 'reports' }, {}],
    ['an expired profile', { status: 'expired', expiredAt: LAST_PUSH }, {}],
    ['a profile past its hide date', { expiresAt: new Date(NOW.getTime() - MINUTE) }, {}],
    ['a draft', { status: 'draft' }, {}],
    ['a blocked chat', {}, { blockedAt: LAST_PUSH }],
    ['a banned chat', {}, { roommateBannedAt: LAST_PUSH }],
  ])('%s gets no push', async (_name, fields, chat) => {
    seedViewer(fields, chat);
    seedNew(3);

    await run();

    expect(sent().filter(({ chatId }) => chatId === VIEWER_CHAT)).toEqual([]);
    expect(row(VIEWER)?.lastPushAt ?? LAST_PUSH).toEqual(LAST_PUSH);
    expect(pushEvents()).toEqual([]);
  });
});

describe('the daily push: wording, buttons and count_band (criterion 5)', () => {
  it.each<[RoommateLocale, number, string, string, string]>([
    ['ru', 1, 'Новых подходящих людей: 1.', '👀 Показать', 'Остановить ежедневные сообщения'],
    ['ru', 3, 'Новых подходящих людей: 3.', '👀 Показать', 'Остановить ежедневные сообщения'],
    [
      'uk',
      1,
      'Нових людей, які тобі підходять: 1.',
      '👀 Показати',
      'Зупинити щоденні повідомлення',
    ],
    [
      'uk',
      5,
      'Нових людей, які тобі підходять: 5.',
      '👀 Показати',
      'Зупинити щоденні повідомлення',
    ],
    ['en', 1, '1 new person fits you.', '👀 Show', 'Stop daily messages'],
    ['en', 2, '2 new people fit you.', '👀 Show', 'Stop daily messages'],
  ])('%s, N = %i: "%s"', async (locale, n, text, show, stop) => {
    seedViewer({}, { locale });
    seedNew(n);

    await run();

    expect(sent()).toEqual([
      {
        chatId: VIEWER_CHAT,
        text,
        data: [['rm:show:p'], ['rm:push:off']],
        labels: [[show], [stop]],
      },
    ]);
  });

  it.each([
    [1, '1-2'],
    [2, '1-2'],
    [3, '3-5'],
    [5, '3-5'],
    [6, '6+'],
    [9, '6+'],
  ])('N = %i → count_band %s, the only property', async (n, band) => {
    seedViewer();
    seedNew(n);

    await run();

    expect(pushEvents()).toEqual([[VIEWER_CHAT, 'tg_roommate_push_sent', { count_band: band }]]);
  });

  it('the buttons route to one handler each; "Show" counts the view as the push’s', async () => {
    seedViewer();
    seedNew(1);
    await run();
    const [push] = sent();
    expect(push.data).toEqual([['rm:show:p'], ['rm:push:off']]);

    const replies = await tap('rm:show:p');

    expect(replies.map(({ data }) => data[0])).toEqual([[`rm:i:${uid(10)}`, `rm:x:${uid(10)}`]]);
    expect(
      mocks.track.mock.calls.filter(([, event]) => event === 'tg_roommate_cards_viewed'),
    ).toEqual([[VIEWER_CHAT, 'tg_roommate_cards_viewed', { results_band: '1-2', via: 'push' }]]);
  });
});

describe('rm:push:off and rm:push:on (criterion 4)', () => {
  const card = (replies: { text: string; data: (string | undefined)[][] }[]) => {
    expect(replies).toHaveLength(1);
    return replies[0];
  };

  it.each<RoommateLocale>(['ru', 'uk', 'en'])(
    '%s: "Stop daily messages" sets push_off, sends one opt-out event and the card with the way back',
    async (locale) => {
      seedViewer({}, { locale });

      const reply = card(await tap('rm:push:off', { locale }));

      expect(row(VIEWER).pushOff).toBe(true);
      expect(optOutEvents()).toEqual([[VIEWER_CHAT, 'tg_roommate_push_opted_out']]);
      expect(reply.text).toContain(rt(locale, 'cardPushOff'));
      expect(reply.text).not.toContain(rt(locale, 'cardPushOn'));
      expect(reply.data).toContainEqual(['rm:push:on']);
      expect(reply.data).not.toContainEqual(['rm:push:off']);
      expect(reply.data).toContainEqual(['rm:show:c']);
    },
  );

  it('a repeat tap changes nothing and sends no second event', async () => {
    seedViewer();

    await tap('rm:push:off');
    const reply = card(await tap('rm:push:off'));

    expect(row(VIEWER).pushOff).toBe(true);
    expect(optOutEvents()).toHaveLength(1);
    expect(reply.data).toContainEqual(['rm:push:on']);
  });

  it('after the opt-out the run sends nothing; after "on" from the card the next run sends again', async () => {
    seedViewer();
    seedNew(1);

    await tap('rm:push:off');
    await run();
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(row(VIEWER).lastPushAt).toEqual(LAST_PUSH);

    vi.setSystemTime(new Date(NOW.getTime() + 2 * 60 * MINUTE));
    const reply = card(await tap('rm:push:on'));
    expect(row(VIEWER).pushOff).toBe(false);
    expect(reply.text).toContain(rt('ru', 'cardPushOn'));
    expect(reply.data).toContainEqual(['rm:push:off']);
    // Turning it back on sends no event.
    expect(mocks.track.mock.calls.map(([, event]) => event)).toEqual([
      'tg_roommate_push_opted_out',
    ]);

    await run(NEXT_DAY);
    expect(sent().map(({ text }) => text)).toEqual(['Новых подходящих людей: 1.']);
  });

  it('"on" while it is on changes nothing and sends the card', async () => {
    seedViewer();

    const reply = card(await tap('rm:push:on'));

    expect(row(VIEWER).pushOff).toBe(false);
    expect(reply.data).toContainEqual(['rm:push:off']);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('an expired profile can stop the push too (its card shows Renew)', async () => {
    seedViewer({ status: 'expired', expiredAt: LAST_PUSH, expiresAt: LAST_PUSH });

    const reply = card(await tap('rm:push:off'));

    expect(row(VIEWER).pushOff).toBe(true);
    expect(optOutEvents()).toHaveLength(1);
    expect(reply.data).toContainEqual(['rm:c:renew']);
  });

  it.each<RoommateLocale>(['ru', 'uk', 'en'])(
    '%s, switch off: "Stop" is still honoured; "on" replies "matching is paused" and stores nothing',
    async (locale) => {
      vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'false');
      seedViewer({}, { locale });

      await tap('rm:push:off', { locale });
      expect(row(VIEWER).pushOff).toBe(true);
      expect(optOutEvents()).toHaveLength(1);

      const replies = await tap('rm:push:on', { locale });
      expect(replies).toEqual([{ text: rt(locale, 'matchingPaused'), data: [] }]);
      expect(row(VIEWER).pushOff).toBe(true);
      expect(optOutEvents()).toHaveLength(1);
    },
  );

  it('no profile → "already deleted"; a hidden profile → the FR-14 reply; nothing stored, no event', async () => {
    seed(uid(40), { status: 'hidden', hiddenAt: LAST_PUSH, hiddenReason: 'reports' });
    db.state.chats.push({
      id: `chat-${uid(41)}`,
      chatId: BigInt(tgChatOf(uid(41))),
      blockedAt: null,
      roommateBannedAt: null,
      locale: 'ru',
    });

    const none = await tap('rm:push:off', { who: uid(41) });
    const hidden = await tap('rm:push:off', { who: uid(40) });

    expect(none.map(({ text }) => text)).toEqual([rt('ru', 'alreadyDeleted')]);
    expect(hidden.map(({ text }) => text)).not.toContainEqual(
      expect.stringContaining(rt('ru', 'cardPushOff')),
    );
    expect(row(uid(40)).pushOff).toBe(false);
    expect(mocks.track).not.toHaveBeenCalled();
  });
});
