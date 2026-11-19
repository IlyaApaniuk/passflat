import type { RoommateProfile } from '@prisma/client';
import { GrammyError, type Api, type Bot, type Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The outcome question (PRD 3 FR-29; spec 07 §Outcome question): in every send-hour run (switch on
 * or off), each active or expired profile with `outcome_asked_at` null whose earliest `matched_at`
 * is at least 21 days old gets "Did you find someone to rent with?" with four answers, claimed on
 * `outcome_asked_at`; a tap (`rm:o:<outcome>`) stores `outcome` only on an asked, unanswered
 * profile and only then sends `tg_roommate_outcome` with `outcome` and `asked=follow_up`.
 *
 * The cron runs through `runRoommateDaily` with its default jobs; taps go through the handlers
 * `registerRoommateFlow` and `registerRoommateMatching` register. Both read one in-memory Prisma
 * fake whose reads apply their `where` (the chat relation and the reaction relations included)
 * and return copies. Telegram is a fake `api`; nothing reaches Telegram, PostHog or a database.
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

  /** `relation: { none | some: {...} }` on a profile: the table and the field that points at it. */
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
        const { none, some, ...rest } = cond as { none?: Where; some?: Where };
        if (Object.keys(rest).length || (none ? 1 : 0) + (some ? 1 : 0) !== 1) {
          throw new Error(`only one of none / some on ${key}`);
        }
        const [table, own] = RELATIONS[key];
        const related = state[table].filter((item) => item[own] === row.id);
        return none
          ? !related.some((item) => matches(item, none))
          : related.some((item) => matches(item, some!));
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
      /** Every matched pair here is revealed already: the default run's reveal retry finds none. */
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

import { OUTCOMES, OUTCOME_QUESTION_DAYS, type Outcome } from '@/lib/roommate/rules';

import { runRoommateDaily, type CronClock } from './roommate-daily';
import { registerRoommateFlow } from './roommate-flow';
import { registerRoommateMatching } from './roommate-matching';
import { rt, type RoommateLocale } from './roommate-texts';

const at = (iso: string) => new Date(iso);
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/** The run: 2027-01-11 09:00 UTC, 10:00 Warsaw in winter (the send hour). */
const NOW = at('2027-01-11T09:00:00Z');
const NEXT_DAY = new Date(NOW.getTime() + DAY);
/** Exactly `OUTCOME_QUESTION_DAYS` before `NOW`. */
const DUE = new Date(NOW.getTime() - OUTCOME_QUESTION_DAYS * DAY);
/** When the default profile came up. */
const ACTIVATED = at('2026-12-15T10:00:00Z');

/** A profile id of the database's shape. */
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = uid(1);
const B = uid(2);

/** The Telegram chat id of the chat of profile `id` (its `tg_<chatId>` identity). */
const tgChatOf = (id: string) => 7000 + Number(id.slice(-4));
const A_CHAT = tgChatOf(A);
const B_CHAT = tgChatOf(B);

/**
 * Active, already reminded of renewal, its push off and no opt-in, so in a default run only the
 * outcome question can write to it.
 */
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
    expiresAt: at('2027-01-14T10:00:00Z'),
    renewalRemindedAt: at('2027-01-10T09:00:00Z'),
    expiredAt: null,
    renewedAt: null,
    notifyOnOpenAt: null,
    notifiedOpenAt: null,
    pushOff: true,
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

/** One direction of a pair: an `interest` reaction from `from` to `to`. */
function reaction(from: string, to: string, fields: Row = {}) {
  db.state.reactions.push({
    id: `r-${from.slice(-2)}-${to.slice(-2)}`,
    fromProfileId: from,
    toProfileId: to,
    kind: 'interest',
    createdAt: new Date(time(fields.matchedAt) - MINUTE),
    matchedAt: null,
    revealedAt: null,
    ...fields,
  });
}

function time(value: unknown): number {
  return value instanceof Date ? value.getTime() : ACTIVATED.getTime();
}

/** A pair formed (and revealed) at `matchedAt`: both reactions matched, as `formMutualMatch` does. */
function match(x: string, y: string, matchedAt: Date) {
  reaction(x, y, { matchedAt, revealedAt: matchedAt });
  reaction(y, x, { matchedAt, revealedAt: matchedAt });
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

const sentTo = () => sent().map((message) => message.chatId);

const outcomeEvents = () =>
  mocks.track.mock.calls.filter(([, event]) => event === 'tg_roommate_outcome');

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

/** The routes a button with `data` reaches. */
const routesFor = (data: string) =>
  ROUTES.filter(([trigger]) =>
    typeof trigger === 'string' ? trigger === data : trigger.test(data),
  );

/** A tap by the person of profile `who` (A by default) on a button with `data`. */
async function tap(
  data: string,
  {
    who = A,
    locale = 'ru',
    username = `user_${who.slice(-2)}`,
  }: { who?: string; locale?: RoommateLocale; username?: string } = {},
) {
  mocks.touchChat.mockResolvedValue({ id: `chat-${who}`, locale, isNew: false });
  const routes = routesFor(data);
  expect(routes, `routes for ${data}`).toHaveLength(1);
  const [trigger, handler] = routes[0];
  const reply = vi.fn().mockResolvedValue({});
  const editMessageReplyMarkup = vi.fn().mockResolvedValue(true);
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const ctx = {
    chat: { id: tgChatOf(who) },
    from: { id: tgChatOf(who), username },
    callbackQuery: { id: 'q', data },
    match: typeof trigger === 'string' ? data : data.match(trigger),
    reply,
    editMessageReplyMarkup,
    api: api as unknown as Api,
    answerCallbackQuery,
  } as unknown as Context;
  await handler(ctx);
  return {
    replies: reply.mock.calls.map(([text]) => text as string),
    edits: editMessageReplyMarkup.mock.calls.length,
    answered: answerCallbackQuery.mock.calls.length,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.getCity.mockResolvedValue({ districts: [{ slug: 'mokotow', nameKey: 'Mokotów' }] });
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

const QUESTION_DATA = [
  ['rm:o:renting_together'],
  ['rm:o:talking'],
  ['rm:o:no_fit'],
  ['rm:o:dont_ask'],
];

describe('the outcome question: who is asked, and when (FR-29)', () => {
  it('asks both people of a pair matched exactly 21 days before the send-hour run, once each, with the four answers', async () => {
    seed(A);
    seed(B);
    match(A, B, DUE);

    await run();

    expect(OUTCOME_QUESTION_DAYS).toBe(21);
    expect(sent()).toEqual(
      [A_CHAT, B_CHAT].map((chatId) => ({
        chatId,
        text: 'Получилось найти, с кем снимать квартиру?',
        data: QUESTION_DATA,
        labels: [['Снимаем вместе'], ['Ещё общаемся'], ['Не сложилось'], ['Не спрашивай']],
      })),
    );
    expect(row(A).outcomeAskedAt).toEqual(NOW);
    expect(row(B).outcomeAskedAt).toEqual(NOW);
    // The question sends no event; only an answer does (spec 07 §Events).
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('does not ask before day 21: a match one minute short, and on day 20', async () => {
    seed(A);
    seed(B);
    match(A, B, new Date(DUE.getTime() + MINUTE));

    await run();
    await run(new Date(NOW.getTime() - DAY));

    expect(sent()).toEqual([]);
    expect(row(A).outcomeAskedAt).toBeNull();

    await run(NEXT_DAY);
    expect(sentTo()).toEqual([A_CHAT, B_CHAT]);
    expect(row(A).outcomeAskedAt).toEqual(NEXT_DAY);
  });

  it('counts from the earliest matched_at: an old match asks, a recent one alone does not', async () => {
    seed(A);
    seed(B);
    seed(uid(3));
    match(A, B, new Date(DUE.getTime() - 4 * DAY)); // A and B: 25 days ago
    match(A, uid(3), new Date(NOW.getTime() - 2 * DAY)); // A and C: 2 days ago

    await run();

    expect(sentTo()).toEqual([A_CHAT, B_CHAT]);
    expect(row(uid(3)).outcomeAskedAt).toBeNull();
  });

  it('asks once over two runs the same day, over the next days, and over two overlapping runs', async () => {
    seed(A);
    seed(B);
    match(A, B, DUE);

    await run();
    await run();
    await run(NEXT_DAY);
    await run(new Date(NOW.getTime() + 30 * DAY));
    expect(sentTo()).toEqual([A_CHAT, B_CHAT]);

    api.sendMessage.mockClear();
    db.state.profiles.forEach((p) => (p.outcomeAskedAt = null));
    await Promise.all([run(), run()]);
    expect(sentTo().sort()).toEqual([A_CHAT, B_CHAT]);
  });

  it('asks an expired profile, and an active one past expires_at the housekeeping marks', async () => {
    seed(A, {
      status: 'expired',
      expiresAt: at('2027-01-05T10:00:00Z'),
      expiredAt: at('2027-01-05T10:00:00Z'),
    });
    seed(B, { expiresAt: at('2027-01-10T10:00:00Z') });
    match(A, B, DUE);

    await run();

    expect(sentTo()).toEqual([A_CHAT, B_CHAT]);
    expect(row(B).status).toBe('expired');
  });

  it('a renewal keeps outcome_asked_at: a profile asked in an earlier life is not asked again', async () => {
    seed(A, { outcomeAskedAt: at('2026-12-01T09:00:00Z'), renewedAt: at('2027-01-05T10:00:00Z') });
    seed(B);
    match(A, B, DUE);

    await run();

    expect(sentTo()).toEqual([B_CHAT]);
    expect(row(A).outcomeAskedAt).toEqual(at('2026-12-01T09:00:00Z'));
  });

  it.each<[string, Partial<RoommateProfile>, Partial<ChatRow>]>([
    ['a hidden profile', { status: 'hidden', hiddenAt: at('2027-01-01T10:00:00Z') }, {}],
    ['a blocked chat', {}, { blockedAt: at('2027-01-01T10:00:00Z') }],
    ['an answered one', { outcomeAskedAt: DUE, outcome: 'talking' }, {}],
  ])('never asks %s', async (_name, fields, chat) => {
    seed(A, fields, chat);
    seed(B);
    match(A, B, DUE);

    await run();

    expect(sentTo()).toEqual([B_CHAT]);
    if (fields.status === 'hidden' || chat.blockedAt) expect(row(A).outcomeAskedAt).toBeNull();
  });

  it('never asks a profile without a match: interest one way, a skip, or none', async () => {
    seed(A);
    seed(B);
    seed(uid(3));
    reaction(A, B, { createdAt: new Date(DUE.getTime() - DAY) });
    reaction(uid(3), A, { kind: 'skip', createdAt: new Date(DUE.getTime() - DAY) });

    await run();

    expect(sent()).toEqual([]);
  });

  it('a profile deleted before day 21 is not asked; its reactions cascade, so its partner has no match left either', async () => {
    seed(A);
    seed(B);
    match(A, B, DUE);
    db.state.profiles = db.state.profiles.filter((p) => p.id !== B);
    db.state.reactions = db.state.reactions.filter(
      (r) => r.fromProfileId !== B && r.toProfileId !== B,
    );

    await run();

    expect(sent()).toEqual([]);
  });

  it('runs with the switch off too, and only in the send hour', async () => {
    seed(A);
    seed(B);
    match(A, B, DUE);

    await runRoommateDaily(api as unknown as Api, at('2027-01-11T08:00:00Z'), {
      clock: fakeClock(),
    });
    expect(sent()).toEqual([]);

    for (const value of ['false', '', 'TRUE']) {
      vi.stubEnv('ROOMMATE_MATCHING_ENABLED', value);
      db.state.profiles.forEach((p) => (p.outcomeAskedAt = null));
      api.sendMessage.mockClear();
      await run();
      expect(sentTo(), `switch ${JSON.stringify(value)}`).toEqual([A_CHAT, B_CHAT]);
    }
  });

  it.each<[RoommateLocale, string, string[]]>([
    [
      'uk',
      'Вдалося знайти, з ким винаймати квартиру?',
      ['Винаймаємо разом', 'Ще спілкуємося', 'Не склалося', 'Не питай'],
    ],
    [
      'en',
      'Did you find someone to rent with?',
      ['Renting together', 'Still talking', 'Did not work out', "Don't ask"],
    ],
  ])('asks in the chat locale (%s)', async (locale, text, labels) => {
    seed(A, {}, { locale });
    seed(B, { outcomeAskedAt: DUE });
    match(A, B, DUE);

    await run();

    expect(sent()).toEqual([
      { chatId: A_CHAT, text, data: QUESTION_DATA, labels: labels.map((label) => [label]) },
    ]);
  });

  it('a failed send releases the claim (logging no chat id) and the next day asks again', async () => {
    seed(A);
    seed(B, { outcomeAskedAt: DUE });
    match(A, B, DUE);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.sendMessage.mockRejectedValueOnce(grammyError(400, 'Bad Request: chat not found'));

    await run();

    expect(row(A).outcomeAskedAt).toBeNull();
    expect(JSON.stringify(log.mock.calls)).not.toContain(String(A_CHAT));
    expect(JSON.stringify(log.mock.calls)).not.toContain('500000001');

    await run(NEXT_DAY);
    expect(sentTo()).toEqual([A_CHAT, A_CHAT]);
    expect(row(A).outcomeAskedAt).toEqual(NEXT_DAY);
  });

  it('a 403 marks the chat blocked and keeps the claim: never asked again', async () => {
    seed(A);
    seed(B, { outcomeAskedAt: DUE });
    match(A, B, DUE);
    api.sendMessage.mockRejectedValueOnce(
      grammyError(403, 'Forbidden: bot was blocked by the user'),
    );

    await run();
    await run(NEXT_DAY);

    expect(sentTo()).toEqual([A_CHAT]);
    expect(row(A).outcomeAskedAt).toEqual(NOW);
    expect(chatRow(A).blockedAt).toEqual(NOW);
  });

  it('a profile answered or claimed between the read and the claim gets nothing', async () => {
    seed(A);
    seed(B, { outcomeAskedAt: DUE });
    match(A, B, DUE);
    db.state.afterRead = (where) => {
      if (where.outcomeAskedAt === null) row(A).outcomeAskedAt = DUE;
    };

    await run();

    expect(sent()).toEqual([]);
    expect(row(A).outcomeAskedAt).toEqual(DUE);
  });
});

describe('an answer (rm:o:<outcome>)', () => {
  function seedAsked(fields: Partial<RoommateProfile> = {}) {
    seed(A, { outcomeAskedAt: NOW, ...fields });
  }

  it.each<[Outcome]>(OUTCOMES.map((outcome) => [outcome]))(
    '%s: stored, one tg_roommate_outcome with asked=follow_up, the buttons removed and a thank-you',
    async (outcome: Outcome) => {
      seedAsked();

      const result = await tap(`rm:o:${outcome}`);

      expect(row(A).outcome).toBe(outcome);
      expect(outcomeEvents()).toEqual([
        [A_CHAT, 'tg_roommate_outcome', { outcome, asked: 'follow_up' }],
      ]);
      expect(result).toEqual({ replies: ['Спасибо, что ответил(а).'], edits: 1, answered: 1 });
    },
  );

  it('stores through updateMany where { id, outcome_asked_at not null, outcome null }', async () => {
    seedAsked();

    await tap('rm:o:talking');

    expect(db.prisma.roommateProfile.updateMany).toHaveBeenCalledWith({
      where: { id: A, outcomeAskedAt: { not: null }, outcome: null },
      data: { outcome: 'talking' },
    });
  });

  it('a second tap (the same or another answer) changes nothing and sends nothing', async () => {
    seedAsked();
    await tap('rm:o:renting_together');
    mocks.track.mockClear();

    for (const outcome of OUTCOMES) {
      const result = await tap(`rm:o:${outcome}`);
      expect(result).toEqual({ replies: [], edits: 0, answered: 1 });
    }

    expect(row(A).outcome).toBe('renting_together');
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('two overlapping taps store one answer and send one event', async () => {
    seedAsked();

    const results = await Promise.all([tap('rm:o:talking'), tap('rm:o:no_fit')]);

    expect(outcomeEvents()).toHaveLength(1);
    expect(row(A).outcome).toBe(outcomeEvents()[0][2].outcome);
    expect(results.map((r) => r.replies.length).sort()).toEqual([0, 1]);
  });

  it('a tap on a profile that was never asked (deleted and created again since) changes nothing and sends nothing', async () => {
    seed(A);

    const result = await tap('rm:o:renting_together');

    expect(row(A).outcome).toBeNull();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(result).toEqual({ replies: [], edits: 0, answered: 1 });
  });

  it('a tap from a chat without a profile sends nothing', async () => {
    db.state.chats.push({
      id: `chat-${A}`,
      chatId: BigInt(A_CHAT),
      blockedAt: null,
      roommateBannedAt: null,
      locale: 'ru',
    });

    const result = await tap('rm:o:talking');

    expect(mocks.track).not.toHaveBeenCalled();
    expect(result).toEqual({ replies: [], edits: 0, answered: 1 });
  });

  it('works with the switch off, for an expired or hidden profile, and in every locale', async () => {
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'false');
    seedAsked({ status: 'expired' });
    seed(B, { outcomeAskedAt: NOW, status: 'hidden' }, { locale: 'uk' });
    seed(uid(3), { outcomeAskedAt: NOW }, { locale: 'en' });

    expect((await tap('rm:o:no_fit')).replies).toEqual([rt('ru', 'reasonThanks')]);
    expect((await tap('rm:o:dont_ask', { who: B, locale: 'uk' })).replies).toEqual([
      'Дякуємо за відповідь.',
    ]);
    expect((await tap('rm:o:talking', { who: uid(3), locale: 'en' })).replies).toEqual([
      'Thanks for telling us.',
    ]);

    expect(outcomeEvents().map(([chatId, , props]) => [chatId, props])).toEqual([
      [A_CHAT, { outcome: 'no_fit', asked: 'follow_up' }],
      [B_CHAT, { outcome: 'dont_ask', asked: 'follow_up' }],
      [tgChatOf(uid(3)), { outcome: 'talking', asked: 'follow_up' }],
    ]);
  });

  it('stores the username like every roommate handler; no event carries it or an id', async () => {
    seedAsked({ tgUsername: 'old_name' });

    await tap('rm:o:renting_together', { username: 'new_name' });

    expect(row(A).tgUsername).toBe('new_name');
    const [, , props] = outcomeEvents()[0];
    expect(Object.keys(props)).toEqual(['outcome', 'asked']);
    expect(JSON.stringify(mocks.track.mock.calls)).not.toMatch(/new_name|old_name|0000-4000/);
  });

  it('an unknown answer reaches no handler', () => {
    for (const data of ['rm:o:yes', 'rm:o:', 'rm:o:talking:x', 'rm:o:TALKING']) {
      expect(routesFor(data), data).toHaveLength(0);
    }
    for (const outcome of OUTCOMES) expect(routesFor(`rm:o:${outcome}`)).toHaveLength(1);
  });

  it('a question from the cron is answered through its button end to end', async () => {
    seed(A);
    seed(B);
    match(A, B, DUE);
    await run();
    const [question] = sent();

    await tap(question.data[2][0]!);

    expect(row(A).outcome).toBe('no_fit');
    expect(outcomeEvents()).toEqual([
      [A_CHAT, 'tg_roommate_outcome', { outcome: 'no_fit', asked: 'follow_up' }],
    ]);
  });
});
