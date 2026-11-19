import { Prisma, type RoommateProfile } from '@prisma/client';
import type { Api, Bot, Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Automatic hiding and the ban marker (PRD 3 FR-32, FR-34, spec 07 §Automatic hiding, D62, D55):
 * after each stored report the target is hidden at reports from `HIDE_AT_REPORTERS` different
 * people or at once on `under_18`, through one conditional update on `hidden_at`; only that request
 * bans the chat, decides the reports and sends `tg_roommate_profile_hidden`. Which reports count
 * (a reporter whose profile exists, a decision not lifted), the golden cases with two concurrent
 * reports, and what a hidden profile no longer gets: counts, cards, compatibility, the daily push;
 * `/mate` and `mate` links give the FR-14 reply, and the ban outlives the profile.
 *
 * Taps go through what `registerRoommateFlow`, `registerRoommateMatching` and
 * `registerRoommateSafety` register, the cron through `runRoommateDaily` with its default jobs,
 * over one in-memory Prisma fake whose reads apply their `where` and return copies, and whose
 * deletes apply the foreign keys (reactions cascade, report references set to null). Nothing
 * reaches Telegram, PostHog or a database. The messages of a hide (the statement of reasons, the
 * notice to reporters) are T095.
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
        const filter = none ?? some;
        if (!filter || (none && some) || Object.keys(rest).length) {
          throw new Error(`only none or some on ${key}`);
        }
        const [table, own] = RELATIONS[key];
        const found = state[table].some((item) => item[own] === row.id && matches(item, filter));
        return none ? !found : found;
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
        } = cond as { in?: unknown[]; not?: unknown; gt?: Date; lte?: Date };
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

  /** The client `$transaction` hands its callback (the fake itself; set once it is built). */
  let client: unknown = null;
  const prisma = {
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
      updateMany: vi.fn(async (args: { where: Where; data: Row }) => updateMany(state.chats, args)),
    },
    roommateProfile: {
      findUnique: vi.fn(async ({ where }: { where: { chatId?: string; id?: string } }) => {
        const row = state.profiles.find((profile) =>
          where.id !== undefined ? profile.id === where.id : profile.chatId === where.chatId,
        );
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
      /** The foreign keys as Postgres has them: reactions cascade, report references are nulled. */
      deleteMany: vi.fn(async ({ where }: { where: Where }) => {
        const hits = state.profiles.filter((row) => matches(row, where));
        const gone = new Set(hits.map((row) => row.id));
        state.profiles = state.profiles.filter((row) => !gone.has(row.id));
        state.reactions = state.reactions.filter(
          (r) => !gone.has(r.fromProfileId) && !gone.has(r.toProfileId),
        );
        for (const report of state.reports) {
          if (gone.has(report.reporterProfileId)) report.reporterProfileId = null;
          if (gone.has(report.targetProfileId)) report.targetProfileId = null;
        }
        return { count: hits.length };
      }),
    },
    roommateReaction: {
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
    roommateReport: {
      count: vi.fn(
        async ({ where }: { where: Where }) =>
          state.reports.filter((row) => matches(row, where)).length,
      ),
      /** The unique (reporter, target) pair and the foreign key to the target, as Postgres has them. */
      createMany: vi.fn(
        async ({ data, skipDuplicates }: { data: Row[]; skipDuplicates?: boolean }) => {
          let count = 0;
          for (const item of data) {
            if (!state.profiles.some((p) => p.id === item.targetProfileId)) {
              throw new Prisma.PrismaClientKnownRequestError('Foreign key constraint violated', {
                code: 'P2003',
                clientVersion: 'test',
              });
            }
            const exists = state.reports.some(
              (r) =>
                r.reporterProfileId === item.reporterProfileId &&
                r.targetProfileId === item.targetProfileId,
            );
            if (exists && skipDuplicates) continue;
            if (exists) throw new Error('unique violation');
            state.reports.push({
              id: `rep-${state.reports.length + 1}`,
              decision: 'none',
              automated: true,
              decidedAt: null,
              reporterNotifiedAt: null,
              ...structuredClone(item),
            });
            count += 1;
          }
          return { count };
        },
      ),
      updateMany: vi.fn(async (args: { where: Where; data: Row }) =>
        updateMany(state.reports, args),
      ),
      deleteMany: vi.fn(async ({ where }: { where: Where }) => {
        const before = state.reports.length;
        state.reports = state.reports.filter((row) => !matches(row, where));
        return { count: before - state.reports.length };
      }),
    },
    /** An interactive transaction runs its callback over the same fake. */
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(client)),
  };
  client = prisma;
  return { state, prisma };
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

import { loadRoommateCounts } from '@/lib/roommate/counts';
import { HIDE_AT_REPORTERS } from '@/lib/roommate/rules';
import { deleteProfile, findCompatible } from '@/lib/roommate/store';

import { runRoommateDaily, type CronClock } from './roommate-daily';
import { openRoommate, registerRoommateFlow } from './roommate-flow';
import { registerRoommateMatching } from './roommate-matching';
import { registerRoommateSafety } from './roommate-safety';
import { rt, type RoommateLocale } from './roommate-texts';
import type { TouchedChat } from './store';
import type { BotLocale } from './texts';

/** 10:00 Warsaw in winter: the send hour of the roommate cron. */
const NOW = new Date('2026-12-05T09:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const EXPIRES = new Date(NOW.getTime() + 30 * DAY);
const LOCALES: RoommateLocale[] = ['ru', 'uk', 'en'];
const DISTRICTS = [{ slug: 'mokotow', nameKey: 'Mokotów' }];

/** A profile id of the database's shape. */
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** Reporters. */
const R1 = uid(1);
const R2 = uid(2);
const R3 = uid(3);
const R4 = uid(4);
/** Targets. */
const X = uid(10);
const Y = uid(11);
/** Someone who reports nobody. */
const C = uid(20);

/** The Telegram chat id of the chat of profile `id` (its `tg_<chatId>` identity). */
const tgChatOf = (id: string) => 7000 + Number(id.slice(-4));
const X_CHAT = tgChatOf(X);
const Y_CHAT = tgChatOf(Y);

/** Active and compatible with every other default profile; the daily push on. */
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
    expiresAt: EXPIRES,
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

/** Profiles in their own chats (RU unless named). */
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
}

/** `x` and `y` matched, and each has had the reveal of the other (spec 07 §Reveal). */
function revealed(x: string, y: string) {
  for (const [from, to] of [
    [x, y],
    [y, x],
  ]) {
    db.state.reactions.push({
      id: `r-${db.state.reactions.length + 1}`,
      fromProfileId: from,
      toProfileId: to,
      kind: 'interest',
      createdAt: NOW,
      matchedAt: NOW,
      revealedAt: NOW,
    });
  }
}

const row = (id: string) => db.state.profiles.find((r) => r.id === id);
const chatRow = (id: string) => db.state.chats.find((chat) => chat.id === `chat-${id}`)!;
const reportsOn = (id: string) => db.state.reports.filter((r) => r.targetProfileId === id);
const snapshot = () => structuredClone(db.state);

const switchTo = (value: string) => vi.stubEnv('ROOMMATE_MATCHING_ENABLED', value);

/**
 * The owner's unhide of `bot/README.md` §Owner review, applied in memory: back to active (or
 * expired), the hide fields cleared, the target's reports lifted, the chat's ban cleared.
 */
function ownerUnhide(id: string, now: Date) {
  const target = row(id)!;
  Object.assign(target, {
    status: (target.expiresAt as Date).getTime() > now.getTime() ? 'active' : 'expired',
    hiddenAt: null,
    hiddenReason: null,
  });
  for (const report of reportsOn(id)) report.decision = 'lifted';
  chatRow(id).roommateBannedAt = null;
}

type Button = { text: string; callback_data?: string };
type Options = { reply_markup?: { inline_keyboard: Button[][] }; parse_mode?: string };

const api = {
  sendMessage: vi.fn(async (_chatId: number, _text: string, _options?: Options) => ({})),
  getChat: vi.fn(async (chatId: number) => ({ id: chatId, type: 'private' as const })),
};

const dataOf = (options?: Options) =>
  (options?.reply_markup?.inline_keyboard ?? []).map((r) => r.map((b) => b.callback_data));

const sent = () =>
  api.sendMessage.mock.calls.map(([chatId, text, options]) => ({
    chatId,
    text,
    data: dataOf(options),
  }));

const events = () => mocks.track.mock.calls;
const hideEvents = () => events().filter(([, event]) => event === 'tg_roommate_profile_hidden');
/** The ban writes of a hide (a chat update that sets `roommate_banned_at`). */
const banWrites = () =>
  db.prisma.telegramChat.updateMany.mock.calls.filter(([args]) => 'roommateBannedAt' in args.data);

type Handler = (ctx: Context) => Promise<void>;
type Route = [trigger: string | RegExp, handler: Handler];

const COMMANDS = new Map<string, Handler>();
const ROUTES: Route[] = [];
{
  const bot = {
    command: (name: string, handler: Handler) => COMMANDS.set(name, handler),
    callbackQuery: (trigger: string | RegExp, handler: Handler) => {
      ROUTES.push([trigger, handler]);
    },
  } as unknown as Bot;
  registerRoommateFlow(bot);
  registerRoommateMatching(bot);
  registerRoommateSafety(bot);
}

type Who = { who?: string; locale?: RoommateLocale };

function fakeContext(data: string | null, { who = C, locale = 'ru' }: Who) {
  mocks.touchChat.mockResolvedValue({ id: `chat-${who}`, locale, isNew: false });
  const name = row(who)?.tgUsername as string | null | undefined;
  const reply = vi.fn().mockResolvedValue({});
  const ctx = {
    chat: { id: tgChatOf(who) },
    from: name ? { id: tgChatOf(who), username: name } : { id: tgChatOf(who) },
    ...(data ? { callbackQuery: { id: 'q', data } } : { message: { text: '/mate' } }),
    reply,
    editMessageReplyMarkup: vi.fn().mockResolvedValue(true),
    answerCallbackQuery: vi.fn().mockResolvedValue(true),
    api: api as unknown as Api,
  };
  const replies = () =>
    reply.mock.calls.map(([text, options]) => ({
      text: text as string,
      data: dataOf(options as Options | undefined),
    }));
  return { ctx, replies };
}

/** A tap on a button with `data`, routed to the one handler registered for it. */
async function tap(data: string, who: Who = {}) {
  const routes = ROUTES.filter(([trigger]) =>
    typeof trigger === 'string' ? trigger === data : trigger.test(data),
  );
  expect(routes, `routes for ${data}`).toHaveLength(1);
  const [trigger, handler] = routes[0];
  const { ctx, replies } = fakeContext(data, who);
  await handler({
    ...ctx,
    match: typeof trigger === 'string' ? data : data.match(trigger),
  } as unknown as Context);
  return replies();
}

const texts = async (data: string, who: Who = {}) => (await tap(data, who)).map((r) => r.text);

/** `reason` on `target` from the person of profile `who`. */
const report = (who: string, reason: string, target: string) =>
  texts(`rm:rr:${reason}:${target}`, { who });

/** `/mate` from the person of profile `who`. */
async function mate(who: Who = {}) {
  const { ctx, replies } = fakeContext(null, who);
  await COMMANDS.get('mate')!(ctx as unknown as Context);
  return replies();
}

/** A `mate` deep link (`/start mate_tg`) from the person of profile `who`: `openRoommate`. */
async function mateLink({ who = C, locale = 'ru' }: Who = {}) {
  const { ctx, replies } = fakeContext(null, { who, locale });
  const chat = { id: `chat-${who}`, locale, isNew: false } as TouchedChat;
  await openRoommate(ctx as unknown as Context, chat, locale as BotLocale, { source: 'tg' });
  return replies();
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

const runCron = (now: Date = NOW) => {
  vi.setSystemTime(now);
  return runRoommateDaily(api as unknown as Api, now, { clock: fakeClock() });
};

const compatibleWith = async (id: string) =>
  (await findCompatible(row(id) as unknown as RoommateProfile, NOW)).map((p) => p.id);

const RECEIPT = rt('ru', 'reportReceipt');

/** Reports from R1 ("fake") and R2 ("money") hide X: the golden case. */
async function hideXByReports() {
  await report(R1, 'fake', X);
  await report(R2, 'money', X);
  expect(row(X)!.status).toBe('hidden');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  switchTo('true');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://passflat.com');
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.getCity.mockResolvedValue({ districts: DISTRICTS });
  mocks.roomCostsReply.mockResolvedValue(null);
  seed([R1, R2, R3, R4, X, Y, C].map((id) => profile(id)));
});

describe('the golden cases of spec 07 §Automatic hiding', () => {
  it('the rule: 2 different reporters (D62)', () => {
    expect(HIDE_AT_REPORTERS).toBe(2);
  });

  it('R1 reports X: X stays visible to others; R1 again: no change; R2 reports X: hidden for reports', async () => {
    expect(await report(R1, 'fake', X)).toEqual([RECEIPT]);
    expect(row(X)).toMatchObject({ status: 'active', hiddenAt: null, hiddenReason: null });
    expect(chatRow(X).roommateBannedAt).toBeNull();
    expect(reportsOn(X)).toMatchObject([{ decision: 'none', decidedAt: null }]);
    expect(await compatibleWith(C)).toContain(X);
    expect(await compatibleWith(R2)).toContain(X);
    expect(hideEvents()).toEqual([]);

    const before = snapshot();
    expect(await report(R1, 'money', X)).toEqual([rt('ru', 'reportAlready')]);
    expect(db.state).toEqual(before);
    expect(hideEvents()).toEqual([]);

    expect(await report(R2, 'money', X)).toEqual([RECEIPT]);
    expect(row(X)).toMatchObject({ status: 'hidden', hiddenAt: NOW, hiddenReason: 'reports' });
    expect(chatRow(X).roommateBannedAt).toEqual(NOW);
    expect(reportsOn(X)).toEqual([
      expect.objectContaining({ reporterProfileId: R1, reason: 'fake', decision: 'hidden' }),
      expect.objectContaining({ reporterProfileId: R2, reason: 'money', decision: 'hidden' }),
    ]);
    for (const decided of reportsOn(X)) {
      expect(decided).toMatchObject({ automated: true, decidedAt: NOW, reporterNotifiedAt: null });
    }
    expect(events()).toEqual([
      [tgChatOf(R1), 'tg_roommate_reported', { reason: 'fake' }],
      [tgChatOf(R2), 'tg_roommate_reported', { reason: 'money' }],
      [X_CHAT, 'tg_roommate_profile_hidden', { reason: 'reports' }],
    ]);
  });

  it('R3 reports Y "under_18": Y is hidden at once, hidden_reason=under_18', async () => {
    expect(await report(R3, 'under_18', Y)).toEqual([RECEIPT]);
    expect(row(Y)).toMatchObject({ status: 'hidden', hiddenAt: NOW, hiddenReason: 'under_18' });
    expect(chatRow(Y).roommateBannedAt).toEqual(NOW);
    expect(reportsOn(Y)).toMatchObject([
      { reporterProfileId: R3, reason: 'under_18', decision: 'hidden', decidedAt: NOW },
    ]);
    expect(events()).toEqual([
      [tgChatOf(R3), 'tg_roommate_reported', { reason: 'under_18' }],
      [Y_CHAT, 'tg_roommate_profile_hidden', { reason: 'under_18' }],
    ]);
  });

  it('two concurrent reports from different people → one hide, one ban, one event', async () => {
    await report(R1, 'fake', X);
    vi.clearAllMocks();
    const results = await Promise.all([report(R2, 'money', X), report(R3, 'other', X)]);

    expect(results).toEqual([[RECEIPT], [RECEIPT]]);
    // Both requests found the rule met and tried to hide; the conditional update let one through.
    expect(db.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(row(X)).toMatchObject({ status: 'hidden', hiddenAt: NOW, hiddenReason: 'reports' });
    expect(banWrites()).toHaveLength(1);
    expect(db.prisma.roommateReport.updateMany).toHaveBeenCalledTimes(1);
    expect(reportsOn(X).map((r) => r.decision)).toEqual(['hidden', 'hidden', 'hidden']);
    expect(hideEvents()).toEqual([[X_CHAT, 'tg_roommate_profile_hidden', { reason: 'reports' }]]);
  });

  it('two concurrent "under_18" reports on a fresh profile → one hide, one event', async () => {
    await Promise.all([report(R1, 'under_18', Y), report(R2, 'under_18', Y)]);

    expect(db.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(row(Y)).toMatchObject({ status: 'hidden', hiddenReason: 'under_18' });
    expect(banWrites()).toHaveLength(1);
    expect(reportsOn(Y)).toHaveLength(2);
    expect(hideEvents()).toEqual([[Y_CHAT, 'tg_roommate_profile_hidden', { reason: 'under_18' }]]);
  });
});

describe('which reports count toward the 2', () => {
  it("a reporter who deletes and re-creates their profile is one reporter: R1's second report hides nothing", async () => {
    await report(R1, 'fake', X);
    expect(await deleteProfile(R1)).toBe(true);
    // The old report stays with its reporter reference nulled (D55).
    expect(reportsOn(X)).toMatchObject([{ reporterProfileId: null, reason: 'fake' }]);
    // The same chat makes a new profile and reports X again.
    const R1_AGAIN = uid(5);
    db.state.profiles.push(profile(R1_AGAIN, { chatId: `chat-${R1}` }));

    expect(await report(R1, 'money', X)).toEqual([RECEIPT]);

    expect(reportsOn(X)).toMatchObject([
      { reporterProfileId: null, reason: 'fake' },
      { reporterProfileId: R1_AGAIN, reason: 'money' },
    ]);
    expect(row(X)).toMatchObject({ status: 'active', hiddenAt: null });
    expect(chatRow(X).roommateBannedAt).toBeNull();
    expect(reportsOn(X).map((r) => r.decision)).toEqual(['none', 'none']);
    expect(hideEvents()).toEqual([]);
    expect(await compatibleWith(C)).toContain(X);

    // A second person then makes it 2: the report of the deleted profile is decided too.
    await report(R2, 'other', X);
    expect(row(X)).toMatchObject({ status: 'hidden', hiddenReason: 'reports' });
    expect(reportsOn(X).map((r) => r.decision)).toEqual(['hidden', 'hidden', 'hidden']);
  });

  it("a deleted reporter's report does not count: one more report hides nothing", async () => {
    await report(R1, 'fake', X);
    await deleteProfile(R1);
    await report(R2, 'money', X);

    expect(row(X)).toMatchObject({ status: 'active', hiddenAt: null });
    expect(hideEvents()).toEqual([]);
  });

  it('reports the owner lifted do not count: after an unhide two new reporters are needed', async () => {
    await hideXByReports();
    const LATER = new Date(NOW.getTime() + 2 * DAY);
    vi.setSystemTime(LATER);
    ownerUnhide(X, LATER);
    vi.clearAllMocks();

    expect(await report(R3, 'other', X)).toEqual([RECEIPT]);
    expect(row(X)).toMatchObject({ status: 'active', hiddenAt: null });
    expect(hideEvents()).toEqual([]);

    expect(await report(R4, 'fake', X)).toEqual([RECEIPT]);
    expect(row(X)).toMatchObject({ status: 'hidden', hiddenAt: LATER, hiddenReason: 'reports' });
    expect(chatRow(X).roommateBannedAt).toEqual(LATER);
    // The owner's decisions stay; the two new reports are decided now.
    expect(reportsOn(X).map((r) => [r.reporterProfileId, r.decision, r.decidedAt])).toEqual([
      [R1, 'lifted', NOW],
      [R2, 'lifted', NOW],
      [R3, 'hidden', LATER],
      [R4, 'hidden', LATER],
    ]);
    expect(hideEvents()).toEqual([[X_CHAT, 'tg_roommate_profile_hidden', { reason: 'reports' }]]);
  });

  it('"under_18" hides at once after an earlier report too, with hidden_reason=under_18', async () => {
    await report(R1, 'fake', X);
    await report(R2, 'under_18', X);
    expect(row(X)).toMatchObject({ status: 'hidden', hiddenReason: 'under_18' });
    expect(hideEvents()).toEqual([[X_CHAT, 'tg_roommate_profile_hidden', { reason: 'under_18' }]]);
  });

  it('every other reason hides nothing on its own', async () => {
    for (const [who, reason, target] of [
      [R1, 'money', X],
      [R2, 'fake', Y],
      [R3, 'offensive', C],
      [R4, 'other', R1],
    ]) {
      expect(await report(who, reason, target)).toEqual([RECEIPT]);
    }
    expect(db.state.reports).toHaveLength(4);
    expect(db.state.profiles.filter((p) => p.status === 'hidden')).toEqual([]);
    expect(hideEvents()).toEqual([]);
  });
});

describe('what a hide writes', () => {
  it('one conditional update on hidden_at, the ban when null, and the decisions', async () => {
    await hideXByReports();

    expect(db.prisma.roommateProfile.updateMany).toHaveBeenCalledWith({
      where: { id: X, hiddenAt: null },
      data: { status: 'hidden', hiddenAt: NOW, hiddenReason: 'reports' },
    });
    expect(banWrites()).toEqual([
      [{ where: { id: `chat-${X}`, roommateBannedAt: null }, data: { roommateBannedAt: NOW } }],
    ]);
    expect(db.prisma.roommateReport.updateMany).toHaveBeenCalledTimes(1);
    expect(db.prisma.roommateReport.updateMany).toHaveBeenCalledWith({
      where: { targetProfileId: X, decision: { not: 'lifted' } },
      data: { decision: 'hidden', automated: true, decidedAt: NOW },
    });
  });

  it('an expired target is hidden too; a ban set earlier keeps its time', async () => {
    const EARLIER = new Date(NOW.getTime() - 40 * DAY);
    seed([
      profile(R1),
      profile(R2),
      profile(X, { status: 'expired', expiresAt: new Date(NOW.getTime() - DAY) }),
    ]);
    chatRow(X).roommateBannedAt = EARLIER;
    revealed(R1, X);
    revealed(R2, X);

    await hideXByReports();
    expect(row(X)).toMatchObject({ status: 'hidden', hiddenAt: NOW, hiddenReason: 'reports' });
    expect(chatRow(X).roommateBannedAt).toEqual(EARLIER);
    expect(hideEvents()).toHaveLength(1);
  });

  it("reports the hidden person made, and other targets' reports, are not decided", async () => {
    await report(X, 'offensive', C);
    await report(R3, 'fake', Y);
    await hideXByReports();

    expect(reportsOn(C).map((r) => [r.reporterProfileId, r.decision])).toEqual([[X, 'none']]);
    expect(reportsOn(Y).map((r) => [r.reporterProfileId, r.decision])).toEqual([[R3, 'none']]);
    expect(row(C)).toMatchObject({ status: 'active', hiddenAt: null });
    expect(row(Y)).toMatchObject({ status: 'active', hiddenAt: null });
  });

  it('the event is the hidden person’s, carries the reason only and names no reporter', async () => {
    await hideXByReports();
    const [[chatId, , properties]] = hideEvents();
    expect(chatId).toBe(X_CHAT);
    expect(properties).toEqual({ reason: 'reports' });
    expect(JSON.stringify(hideEvents())).not.toMatch(
      new RegExp(`${R1}|${R2}|${X}|user_|chat-|${tgChatOf(R1)}|${tgChatOf(R2)}`),
    );
  });

  it('a later report on the hidden profile: the receipt of a hidden profile, nothing else', async () => {
    // R3 got X's reveal earlier, so the Report button under it still names X (spec 07 §Report).
    revealed(R3, X);
    await hideXByReports();
    vi.clearAllMocks();
    const before = snapshot();

    expect(await report(R3, 'money', X)).toEqual([rt('ru', 'reportReceiptHidden')]);
    expect(db.state).toEqual(before);
    expect(events()).toEqual([]);
  });

  it('the switch does not stop it: hidden with ROOMMATE_MATCHING_ENABLED off', async () => {
    revealed(R1, X);
    revealed(R2, X);
    switchTo('');

    await hideXByReports();
    expect(hideEvents()).toEqual([[X_CHAT, 'tg_roommate_profile_hidden', { reason: 'reports' }]]);
  });
});

describe('a hidden profile is not counted, shown or pushed', () => {
  it('counts, cards and compatibility of everyone else leave it out', async () => {
    expect((await texts('rm:c:counts'))[0]).toMatch(/Mokotów — 6 человек[,.]/);
    expect(await compatibleWith(C)).toContain(X);
    expect((await loadRoommateCounts(null, NOW)).total).toBe(7);

    await hideXByReports();

    expect((await texts('rm:c:counts'))[0]).toMatch(/Mokotów — 5 человек[,.]/);
    expect(await compatibleWith(C)).not.toContain(X);
    expect(await compatibleWith(R3)).not.toContain(X);
    expect((await loadRoommateCounts(null, NOW)).total).toBe(6);
    // A card of X shown before the hide: its buttons answer "no longer available".
    expect((await texts(`rm:i:${X}`))[0]).toBe(rt('ru', 'browseUnavailable'));
    expect(db.state.reactions).toEqual([]);
  });

  it('the daily run sends the hidden person nothing and counts them as new for nobody', async () => {
    const SINCE = new Date(NOW.getTime() - 2 * DAY);
    const FRESH = new Date(NOW.getTime() - DAY);
    seed([
      profile(R1, { lastPushAt: SINCE }),
      profile(R2, { lastPushAt: SINCE }),
      profile(C, { lastPushAt: SINCE }),
      profile(X, { activatedAt: FRESH }),
      profile(Y, { activatedAt: FRESH }),
    ]);
    await hideXByReports();
    vi.clearAllMocks();

    await runCron(NOW);

    const to = (id: string) => sent().filter((m) => String(m.chatId) === String(tgChatOf(id)));
    expect(to(X)).toEqual([]);
    // Without the hide C's push would count X and Y; it counts Y only.
    expect(to(C).map(({ text, data }) => ({ text, data }))).toEqual([
      { text: rt('ru', 'pushNewOne', { count: '1' }), data: [['rm:show:p'], ['rm:push:off']] },
    ]);
    expect(row(X)!.lastPushAt).toBeNull();
    expect(events().filter(([chatId]) => chatId === X_CHAT)).toEqual([]);
  });

  it.each(LOCALES)(
    '%s: /mate, a mate link and "Show people" give the FR-14 reply after a hide, no event',
    async (locale) => {
      await hideXByReports();
      chatRow(X).locale = locale;
      vi.clearAllMocks();
      const refused = { text: rt(locale, 'banned'), data: [['rm:c:del']] };

      expect(await mate({ who: X, locale })).toEqual([refused]);
      expect(await mateLink({ who: X, locale })).toEqual([refused]);
      expect(await tap('rm:show:c', { who: X, locale })).toEqual([refused]);
      expect(events()).toEqual([]);
      expect(db.state.profiles.filter((p) => p.chatId === `chat-${X}`)).toHaveLength(1);
    },
  );

  it('the ban outlives the profile: deleted at expires_at + 14 days for moderation, /mate still refused', async () => {
    await hideXByReports();
    vi.clearAllMocks();

    await runCron(new Date(EXPIRES.getTime() + 14 * DAY));

    expect(row(X)).toBeUndefined();
    expect(events()).toContainEqual([
      X_CHAT,
      'tg_roommate_profile_deleted',
      { reason: 'moderation' },
    ]);
    expect(chatRow(X).roommateBannedAt).toEqual(NOW);
    expect(reportsOn(X)).toEqual([]);
    expect(db.state.reports.map((r) => [r.targetProfileId, r.decision])).toEqual([
      [null, 'hidden'],
      [null, 'hidden'],
    ]);
    // No profile left: the FR-14 reply without the delete button, and no new draft.
    expect(await mate({ who: X })).toEqual([{ text: rt('ru', 'banned'), data: [] }]);
    expect(await mateLink({ who: X })).toEqual([{ text: rt('ru', 'banned'), data: [] }]);
    expect(db.state.profiles.some((p) => p.chatId === `chat-${X}`)).toBe(false);
  });
});
