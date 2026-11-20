import { Prisma, type RoommateProfile } from '@prisma/client';
import { GrammyError, type Api, type Bot, type Context } from 'grammy';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

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
 * notice to reporters; spec 07 §Statement of reasons, FR-32 criterion 4, FR-33) are the last
 * describe blocks.
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
      if (key === 'reporterProfile')
        return matches(profileOf(row.reporterProfileId), cond as Where);
      if (key === 'targetProfile') return matches(profileOf(row.targetProfileId), cond as Where);
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
    const related = (key: string) =>
      key === 'chat'
        ? chatOf(row)
        : key === 'reporterProfile'
          ? profileOf(row.reporterProfileId)
          : (row[key] as Row);
    return Object.fromEntries(
      Object.entries(select).map(([key, part]) => [
        key,
        part === true
          ? structuredClone(row[key])
          : project(related(key), (part as Row).select as Row),
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
      /** The statement's facts and the reporters' notices (`roommate-hide-messages.ts`). */
      findMany: vi.fn(async (args: Read) =>
        readMany(state.reports, args, (row) => structuredClone(row)),
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
import { deleteProfile, findCompatible, liftHide } from '@/lib/roommate/store';

import { escapeHtml, webLink } from './format';
import { runRoommateDaily, type CronClock } from './roommate-daily';
import { openRoommate, registerRoommateFlow } from './roommate-flow';
import { statementText } from './roommate-hide-messages';
import { registerRoommateMatching } from './roommate-matching';
import { registerRoommateSafety } from './roommate-safety';
import { rt } from './roommate-texts';
import type { TouchedChat } from './store';
import type { BotLocale } from './texts';

/** 10:00 Warsaw in winter: the send hour of the roommate cron. */
const NOW = new Date('2026-12-05T09:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const EXPIRES = new Date(NOW.getTime() + 30 * DAY);
const LOCALES: BotLocale[] = ['ru', 'uk', 'en'];
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
function seed(rows: Row[], locales: Record<string, BotLocale> = {}) {
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
 * The owner's `lifted` decision (`bot/README.md` §Owner review, D73): the real `liftHide` that
 * `POST /api/cron/roommate-appeal` runs, over this fake. Back to active (or expired, with
 * `expired_at`), the hide fields cleared, the target's reports lifted by a person, the chat's ban
 * cleared; `appealed_at` kept. The decision message itself is tested in
 * `roommate-appeal-decision.test.ts`.
 */
async function ownerUnhide(id: string, now: Date) {
  expect(await liftHide(id, now)).toBe(true);
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
/** The decision writes of a hide (not the notice claims, which set `reporter_notified_at`). */
const decisionWrites = () =>
  db.prisma.roommateReport.updateMany.mock.calls.filter(([args]) => 'decision' in args.data);
/** The hide's own decision write, not the late decision after a report that did not hide. */
const hideDecisionWrites = () =>
  decisionWrites().filter(([args]) => args.where.decision !== 'none');
/** The late decision of a report that did not hide `target` (`hideAfterReport`). */
const lateDecision = (target: string) => [
  {
    where: {
      targetProfileId: target,
      decision: 'none',
      targetProfile: { hiddenAt: { not: null } },
    },
    data: { decision: 'hidden', automated: true, decidedAt: NOW },
  },
];

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

type Who = { who?: string; locale?: BotLocale };

/** The `reply` of the last fake context, to order a tap's receipt against the API's sends. */
let lastReply: Mock = vi.fn();

function fakeContext(data: string | null, { who = C, locale = 'ru' }: Who) {
  mocks.touchChat.mockResolvedValue({ id: `chat-${who}`, locale, isNew: false });
  const name = row(who)?.tgUsername as string | null | undefined;
  const reply = vi.fn().mockResolvedValue({});
  lastReply = reply;
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

/** `/appeal` from the person of profile `who` (`handleAppeal`, registered by the safety module). */
async function appeal(who: Who = {}) {
  const { ctx, replies } = fakeContext(null, who);
  await COMMANDS.get('appeal')!(ctx as unknown as Context);
  return replies().map((r) => r.text);
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
  // A failing send set by one test must not leak into the next (`clearAllMocks` keeps it).
  api.sendMessage.mockImplementation(async () => ({}));
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
    // Both reporters were told (spec 07 §Automatic hiding; the notices are tested below).
    for (const decided of reportsOn(X)) {
      expect(decided).toMatchObject({ automated: true, decidedAt: NOW, reporterNotifiedAt: NOW });
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
    expect(hideDecisionWrites()).toHaveLength(1);
    // The other request decides what the hide left (nothing here: both were stored before it).
    expect(decisionWrites()).toHaveLength(2);
    expect(decisionWrites()).toContainEqual(lateDecision(X));
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
    await ownerUnhide(X, LATER);
    vi.clearAllMocks();

    expect(await report(R3, 'other', X)).toEqual([RECEIPT]);
    expect(row(X)).toMatchObject({ status: 'active', hiddenAt: null });
    expect(hideEvents()).toEqual([]);

    expect(await report(R4, 'fake', X)).toEqual([RECEIPT]);
    expect(row(X)).toMatchObject({ status: 'hidden', hiddenAt: LATER, hiddenReason: 'reports' });
    expect(chatRow(X).roommateBannedAt).toEqual(LATER);
    // The owner's decisions stay; the two new reports are decided now.
    expect(
      reportsOn(X).map((r) => [r.reporterProfileId, r.decision, r.automated, r.decidedAt]),
    ).toEqual([
      [R1, 'lifted', false, LATER],
      [R2, 'lifted', false, LATER],
      [R3, 'hidden', true, LATER],
      [R4, 'hidden', true, LATER],
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

    // `statement_sent_at` and `appealed_at` are cleared, so a hide after an owner's unhide gets
    // its own statement and its own `/appeal`.
    expect(db.prisma.roommateProfile.updateMany).toHaveBeenCalledWith({
      where: { id: X, hiddenAt: null },
      data: {
        status: 'hidden',
        hiddenAt: NOW,
        hiddenReason: 'reports',
        statementSentAt: null,
        appealedAt: null,
      },
    });
    expect(banWrites()).toEqual([
      [{ where: { id: `chat-${X}`, roommateBannedAt: null }, data: { roommateBannedAt: NOW } }],
    ]);
    expect(decisionWrites()).toEqual([
      // R1's report did not hide: the late decision, conditional on X's hidden_at, decides nothing.
      lateDecision(X),
      [
        {
          where: { targetProfileId: X, decision: { not: 'lifted' } },
          data: { decision: 'hidden', automated: true, decidedAt: NOW },
        },
      ],
    ]);
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

// ---------------------------------------------------------------------------------------------
// The messages of a hide (spec 07 §Statement of reasons, FR-33; §Automatic hiding, FR-32
// criterion 4; DSA Art. 16(5) – (6), Art. 17)
// ---------------------------------------------------------------------------------------------

const NEXT_DAY = new Date(NOW.getTime() + DAY);
const DAY_AFTER = new Date(NOW.getTime() + 2 * DAY);

/** The API sends to the chat of profile `id`: `[text, options]`. */
const sendsTo = (id: string) =>
  api.sendMessage.mock.calls
    .filter(([chatId]) => chatId === tgChatOf(id))
    .map(([, text, options]) => [text, options] as const);
const textsTo = (id: string) => sendsTo(id).map(([text]) => text);
const notifiedAt = (id: string) => reportsOn(id).map((r) => r.reporterNotifiedAt);

function grammyError(code: number, description: string): GrammyError {
  return new GrammyError(
    "Call to 'sendMessage' failed!",
    { ok: false, error_code: code, description },
    'sendMessage',
    { chat_id: 500_000_001, text: 'roommate' },
  );
}

/** Every send to the chat of a profile in `codes` fails with its error code; the others go through. */
function failSends(codes: Record<string, number>) {
  api.sendMessage.mockImplementation(async (chatId: number) => {
    const id = Object.keys(codes).find((profileId) => tgChatOf(profileId) === chatId);
    if (id) throw grammyError(codes[id], codes[id] === 403 ? 'Forbidden' : 'Bad Gateway');
    return {};
  });
}

/** Every send to the chat of one of `ids` fails with `code`; the others go through. */
const failSendsTo = (code: number, ...ids: string[]) =>
  failSends(Object.fromEntries(ids.map((id) => [id, code])));

const quoted = (locale: BotLocale, key: Parameters<typeof rt>[1]) =>
  locale === 'en' ? `'${rt(locale, key)}'` : `«${rt(locale, key)}»`;

describe('the statement of reasons (spec 07 §Statement of reasons, FR-33)', () => {
  it.each(LOCALES)(
    '%s: the hide sends X one statement: restriction, counts and categories, automated, the ground with the terms link, redress',
    async (locale) => {
      seed(
        [R1, R2, X, C].map((id) => profile(id)),
        { [X]: locale },
      );
      await hideXByReports();

      const termsUrl = escapeHtml(webLink('/terms#matching', locale, 'roommate'));
      expect(sendsTo(X)).toEqual([
        [
          [
            rt(locale, 'statementRestriction'),
            rt(locale, 'statementFacts', {
              count: '2',
              // `REPORT_REASONS` order: money before fake.
              reasons: `${quoted(locale, 'btnReportMoney')}, ${quoted(locale, 'btnReportFake')}`,
            }),
            rt(locale, 'statementGroundReports', { termsUrl }),
            rt(locale, 'statementRedress'),
          ].join('\n\n'),
          { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
        ],
      ]);
      expect(row(X)!.statementSentAt).toEqual(NOW);
    },
  );

  it('ru: every element as the spec names it', async () => {
    await hideXByReports();
    const [text] = textsTo(X);

    expect(text).toContain('Твоя анкета для подбора соседей скрыта');
    expect(text).toContain('в этом чате нельзя создать новую анкету');
    expect(text).toContain(
      'Жалоб на анкету: 2. Причины: «Просит деньги или залог», «Фейковая анкета».',
    );
    expect(text).toContain('Решение принято автоматически');
    expect(text).toContain('два разных человека');
    expect(text).toContain(
      '<a href="https://passflat.com/ru/terms?utm_source=telegram&amp;utm_medium=bot&amp;utm_campaign=roommate#matching">',
    );
    expect(text).toContain('ответь /appeal');
    expect(text).toContain('contact@passflat.com');
    expect(text).toContain('координатору цифровых услуг — Prezes UKE');
    expect(text).toContain('обратиться в суд');
  });

  it('names no reporter and no other profile: no id, username, chat id, link to a person', async () => {
    revealed(R1, X);
    revealed(R2, X);
    await hideXByReports();
    const [text] = textsTo(X);

    for (const id of [R1, R2, C, Y, X]) {
      expect(text).not.toContain(id);
      expect(text).not.toContain(String(tgChatOf(id)));
    }
    expect(text).not.toMatch(/user_|chat-|t\.me|tg:\/\//);
    // The only figure is the count of reports.
    expect(text.match(/\d+/g)).toEqual(['2']);
  });

  it('"under_18": the facts and the at-once ground, with an earlier report too', async () => {
    const termsUrl = escapeHtml(webLink('/terms#matching', 'ru', 'roommate'));
    await report(R3, 'under_18', Y);
    expect(textsTo(Y)).toEqual([statementText('ru', 'under_18', ['under_18'])]);
    expect(textsTo(Y)[0]).toContain('Жалоб на анкету: 1. Причины: «Похоже, младше 18».');
    expect(textsTo(Y)[0]).toContain(rt('ru', 'statementGroundUnder18', { termsUrl }));
    expect(textsTo(Y)[0]).not.toContain('два разных человека');

    await report(R1, 'fake', X);
    await report(R2, 'under_18', X);
    expect(textsTo(X)).toHaveLength(1);
    expect(textsTo(X)[0]).toContain(
      'Жалоб на анкету: 2. Причины: «Фейковая анкета», «Похоже, младше 18».',
    );
    expect(textsTo(X)[0]).toContain('сразу после жалобы «Похоже, младше 18»');
  });

  it('a statement with no decided report left says no count (never "0")', () => {
    const text = statementText('ru', 'reports', []);
    expect(text).not.toContain('Жалоб');
    expect(text).toContain(rt('ru', 'statementRestriction'));
    expect(text).toContain(rt('ru', 'statementRedress'));
  });

  it('sent once: two concurrent reports, a later report and two send-hour runs send no second one', async () => {
    revealed(R4, X); // R4 got X's reveal, so its Report button still names X after the hide
    await report(R1, 'fake', X);
    await Promise.all([report(R2, 'money', X), report(R3, 'other', X)]);
    expect(textsTo(X)).toHaveLength(1);

    expect(await report(R4, 'offensive', X)).toEqual([rt('ru', 'reportReceiptHidden')]);
    await runCron(NEXT_DAY);
    await runCron(DAY_AFTER);
    expect(textsTo(X)).toHaveLength(1);
    expect(row(X)!.statementSentAt).toEqual(NOW);
    // Each reporter whose report the hide decided was told once; R4's later report was not stored.
    for (const id of [R1, R2, R3]) expect(textsTo(id)).toEqual([rt('ru', 'hideNotice')]);
    expect(textsTo(R4)).toEqual([]);
  });

  it('a failed send other than a 403 releases the claim; the send-hour run sends it once, before the notices, with the switch off', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    failSendsTo(502, X, R1, R2);
    expect(await report(R1, 'fake', X)).toEqual([RECEIPT]);
    expect(await report(R2, 'money', X)).toEqual([RECEIPT]);
    expect(row(X)).toMatchObject({ status: 'hidden', statementSentAt: null });
    expect(notifiedAt(X)).toEqual([null, null]);

    api.sendMessage.mockImplementation(async () => ({}));
    api.sendMessage.mockClear();
    const eventsBefore = events().length;
    switchTo('');
    await runCron(NEXT_DAY);

    expect(sent().map(({ chatId, text }) => [chatId, text])).toEqual([
      [X_CHAT, statementText('ru', 'reports', ['fake', 'money'])],
      [tgChatOf(R1), rt('ru', 'hideNotice')],
      [tgChatOf(R2), rt('ru', 'hideNotice')],
    ]);
    expect(row(X)!.statementSentAt).toEqual(NEXT_DAY);
    expect(notifiedAt(X)).toEqual([NEXT_DAY, NEXT_DAY]);

    await runCron(DAY_AFTER);
    expect(sent()).toHaveLength(3);
    // The retries send no event (spec 07 §Events has none for a statement or a notice).
    expect(events()).toHaveLength(eventsBefore);
    quiet.mockRestore();
  });

  it('a 403: the chat is marked blocked and keeps statement_sent_at null; no retry while blocked; sent once the person writes again', async () => {
    failSendsTo(403, X);
    await hideXByReports();
    expect(row(X)!.statementSentAt).toBeNull();
    expect(chatRow(X).blockedAt).toEqual(NOW);
    // The reporters are still told.
    expect(notifiedAt(X)).toEqual([NOW, NOW]);

    api.sendMessage.mockImplementation(async () => ({}));
    api.sendMessage.mockClear();
    await runCron(NEXT_DAY);
    expect(textsTo(X)).toEqual([]);

    chatRow(X).blockedAt = null; // the person wrote to the bot again (`touchChat`)
    await runCron(DAY_AFTER);
    expect(textsTo(X)).toEqual([statementText('ru', 'reports', ['fake', 'money'])]);
    expect(row(X)!.statementSentAt).toEqual(DAY_AFTER);
  });

  it('a chat that blocked the bot before the hide gets nothing and keeps statement_sent_at null', async () => {
    chatRow(X).blockedAt = new Date(NOW.getTime() - DAY);
    // A blocked chat's profile is no card: R1 and R2 report it under the reveals they got.
    revealed(R1, X);
    revealed(R2, X);
    await hideXByReports();
    expect(textsTo(X)).toEqual([]);
    expect(row(X)!.statementSentAt).toBeNull();
    expect(notifiedAt(X)).toEqual([NOW, NOW]);
  });

  it("a hide after an owner's unhide sends a new statement; the earlier reporters are not told again", async () => {
    await hideXByReports();
    const LATER = new Date(NOW.getTime() + 2 * DAY);
    vi.setSystemTime(LATER);
    await ownerUnhide(X, LATER);
    api.sendMessage.mockClear();

    await report(R3, 'other', X);
    await report(R4, 'fake', X);

    expect(sent().map(({ chatId, text }) => [chatId, text])).toEqual([
      [X_CHAT, statementText('ru', 'reports', ['other', 'fake'])],
      [tgChatOf(R3), rt('ru', 'hideNotice')],
      [tgChatOf(R4), rt('ru', 'hideNotice')],
    ]);
    expect(textsTo(X)[0]).toContain('Жалоб на анкету: 2. Причины: «Фейковая анкета», «Другое».');
    expect(row(X)!.statementSentAt).toEqual(LATER);
  });
});

describe('the notice to reporters (spec 07 §Automatic hiding, FR-32 criterion 4)', () => {
  it.each(LOCALES)(
    '%s: every reporter is told once, in their language, that an automated decision hid it; the hiding reporter after the receipt',
    async (locale) => {
      seed(
        [R1, R2, X, C].map((id) => profile(id)),
        { [R1]: locale, [R2]: locale },
      );
      await report(R1, 'fake', X);
      expect(api.sendMessage).not.toHaveBeenCalled();

      expect(await report(R2, 'money', X)).toEqual([RECEIPT]);
      const receiptAt = lastReply.mock.invocationCallOrder[0];

      for (const id of [R1, R2]) {
        expect(sendsTo(id)).toEqual([[rt(locale, 'hideNotice'), undefined]]);
      }
      const r2NoticeAt =
        api.sendMessage.mock.invocationCallOrder[
          api.sendMessage.mock.calls.findIndex(([chatId]) => chatId === tgChatOf(R2))
        ];
      expect(receiptAt).toBeLessThan(r2NoticeAt);
      expect(notifiedAt(X)).toEqual([NOW, NOW]);
      expect(rt(locale, 'hideNotice')).toMatch(
        { ru: /автоматически/, uk: /автоматично/, en: /automatically/ }[locale],
      );
      // No event for a statement or a notice (spec 07 §Events has none).
      expect(events().map(([, event]) => event)).toEqual([
        'tg_roommate_reported',
        'tg_roommate_reported',
        'tg_roommate_profile_hidden',
      ]);
    },
  );

  it('the notice names nothing: no profile, reporter, reason or username', () => {
    for (const locale of LOCALES) {
      const notice = rt(locale, 'hideNotice');
      expect(notice).not.toMatch(/\{|user_|@|\d/);
      for (const key of ['btnReportMoney', 'btnReportFake', 'btnReportUnder18'] as const) {
        expect(notice).not.toContain(rt(locale, key));
      }
    }
  });

  it('a failed notice other than a 403 is released and retried once by the send-hour run; a 403 keeps its claim', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    failSends({ [R1]: 502, [R2]: 403 });
    await report(R1, 'fake', X);
    await report(R2, 'money', X);
    expect(row(X)!.status).toBe('hidden');
    expect(notifiedAt(X)).toEqual([null, NOW]);
    expect(chatRow(R2).blockedAt).toEqual(NOW);

    api.sendMessage.mockImplementation(async () => ({}));
    api.sendMessage.mockClear();
    chatRow(R2).blockedAt = null; // R2 unblocks: the 403's claim still stands
    await runCron(NEXT_DAY);
    expect(sent().map(({ chatId, text }) => [chatId, text])).toEqual([
      [tgChatOf(R1), rt('ru', 'hideNotice')],
    ]);
    expect(notifiedAt(X)).toEqual([NEXT_DAY, NOW]);

    await runCron(DAY_AFTER);
    expect(sent()).toHaveLength(1);
    quiet.mockRestore();
  });

  it('only reporters whose profile still exists, of reports a hide decided; a blocked chat waits until it writes again', async () => {
    await report(R1, 'fake', X);
    await deleteProfile(R1); // R1's report stays with a null reference: it does not count either
    chatRow(R3).blockedAt = new Date(NOW.getTime() - DAY);
    await report(R4, 'offensive', Y); // Y is not hidden: no notice
    await report(R2, 'money', X);
    await report(R3, 'other', X);
    expect(row(X)!.status).toBe('hidden');

    expect(textsTo(R1)).toEqual([]);
    expect(textsTo(R2)).toEqual([rt('ru', 'hideNotice')]);
    expect(textsTo(R3)).toEqual([]);
    expect(textsTo(R4)).toEqual([]);

    await runCron(NEXT_DAY);
    expect(textsTo(R3)).toEqual([]);
    chatRow(R3).blockedAt = null;
    await runCron(DAY_AFTER);
    expect(textsTo(R3)).toEqual([rt('ru', 'hideNotice')]);
    expect(textsTo(R1)).toEqual([]);
    expect(textsTo(R4)).toEqual([]);
  });

  it('reports the owner lifted get no notice from the retry', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    failSendsTo(502, R1, R2);
    await hideXByReports();
    expect(notifiedAt(X)).toEqual([null, null]);
    await ownerUnhide(X, NOW);
    api.sendMessage.mockImplementation(async () => ({}));
    api.sendMessage.mockClear();

    await runCron(NEXT_DAY);
    expect(textsTo(R1)).toEqual([]);
    expect(textsTo(R2)).toEqual([]);
    quiet.mockRestore();
  });
});

/**
 * `who` reports `target` with `reason`, and another request's whole tap (`between`) runs after this
 * request's check and before its insert: the insert waits until `between` has finished, as when
 * another request's hide commits in that gap. Returns this request's replies and the `reply` mock
 * of its context (to order the receipt against the API's sends).
 */
async function reportAcrossHide(
  who: string,
  reason: string,
  target: string,
  between: () => Promise<unknown>,
) {
  const insert = db.prisma.roommateReport.createMany.getMockImplementation()!;
  let reached!: () => void;
  const atInsert = new Promise<void>((resolve) => (reached = resolve));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  db.prisma.roommateReport.createMany.mockImplementationOnce(async (args) => {
    reached();
    await gate;
    return insert(args);
  });
  const late = report(who, reason, target);
  await atInsert;
  const reply = lastReply;
  // This request has checked the target (visible) and waits at its insert.
  expect(db.state.profiles.find((p) => p.id === target)!.hiddenAt).toBeNull();
  await between();
  release();
  return { replies: await late, reply };
}

/** The invocation order of the first API send to the chat of profile `id`. */
const firstSendAt = (id: string) =>
  api.sendMessage.mock.invocationCallOrder[
    api.sendMessage.mock.calls.findIndex(([chatId]) => chatId === tgChatOf(id))
  ];

describe('a report stored just after another request hid the target (FR-32 criterion 4)', () => {
  it('"under_18" hides Y between R2\'s check and insert: both reporters are told once, one statement, one hide', async () => {
    const { replies, reply } = await reportAcrossHide(R2, 'fake', Y, async () => {
      expect(await report(R1, 'under_18', Y)).toEqual([RECEIPT]);
    });

    // R2's check found Y visible, so it got the receipt that promises the notice.
    expect(replies).toEqual([RECEIPT]);
    expect(row(Y)).toMatchObject({ status: 'hidden', hiddenAt: NOW, hiddenReason: 'under_18' });
    expect(reportsOn(Y)).toEqual([
      expect.objectContaining({ reporterProfileId: R1, reason: 'under_18' }),
      expect.objectContaining({ reporterProfileId: R2, reason: 'fake' }),
    ]);
    for (const decided of reportsOn(Y)) {
      expect(decided).toMatchObject({
        decision: 'hidden',
        automated: true,
        decidedAt: NOW,
        reporterNotifiedAt: NOW,
      });
    }
    expect(textsTo(R1)).toEqual([rt('ru', 'hideNotice')]);
    expect(textsTo(R2)).toEqual([rt('ru', 'hideNotice')]);
    expect(reply.mock.invocationCallOrder[0]).toBeLessThan(firstSendAt(R2));
    // One statement, sent by the hiding request: its facts are the reports that hide decided.
    expect(textsTo(Y)).toEqual([statementText('ru', 'under_18', ['under_18'])]);
    expect(banWrites()).toHaveLength(1);
    expect(events()).toEqual([
      [tgChatOf(R1), 'tg_roommate_reported', { reason: 'under_18' }],
      [Y_CHAT, 'tg_roommate_profile_hidden', { reason: 'under_18' }],
      [tgChatOf(R2), 'tg_roommate_reported', { reason: 'fake' }],
    ]);

    await runCron(NEXT_DAY);
    await runCron(DAY_AFTER);
    expect(textsTo(R1)).toHaveLength(1);
    expect(textsTo(R2)).toHaveLength(1);
    expect(textsTo(Y)).toHaveLength(1);
  });

  it("the second reporter hides X between R3's check and insert: R1, R2 and R3 are told once, one statement", async () => {
    await report(R1, 'fake', X);
    const { replies } = await reportAcrossHide(R3, 'other', X, async () => {
      expect(await report(R2, 'money', X)).toEqual([RECEIPT]);
    });

    expect(replies).toEqual([RECEIPT]);
    expect(row(X)).toMatchObject({ status: 'hidden', hiddenAt: NOW, hiddenReason: 'reports' });
    expect(reportsOn(X).map((r) => [r.reporterProfileId, r.decision, r.decidedAt])).toEqual([
      [R1, 'hidden', NOW],
      [R2, 'hidden', NOW],
      [R3, 'hidden', NOW],
    ]);
    expect(notifiedAt(X)).toEqual([NOW, NOW, NOW]);
    for (const id of [R1, R2, R3]) expect(textsTo(id)).toEqual([rt('ru', 'hideNotice')]);
    expect(textsTo(X)).toEqual([statementText('ru', 'reports', ['fake', 'money'])]);
    expect(hideEvents()).toEqual([[X_CHAT, 'tg_roommate_profile_hidden', { reason: 'reports' }]]);
    expect(hideDecisionWrites()).toHaveLength(1);

    await runCron(NEXT_DAY);
    for (const id of [R1, R2, R3, X]) expect(textsTo(id)).toHaveLength(1);
  });

  it("the late reporter's failed notice (not a 403) is released and sent once by the send-hour run", async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    failSendsTo(502, R2);
    await reportAcrossHide(R2, 'fake', Y, () => report(R1, 'under_18', Y));
    expect(reportsOn(Y).map((r) => [r.reporterProfileId, r.decision])).toEqual([
      [R1, 'hidden'],
      [R2, 'hidden'],
    ]);
    expect(notifiedAt(Y)).toEqual([NOW, null]);

    api.sendMessage.mockImplementation(async () => ({}));
    api.sendMessage.mockClear();
    await runCron(NEXT_DAY);
    expect(sent().map(({ chatId, text }) => [chatId, text])).toEqual([
      [tgChatOf(R2), rt('ru', 'hideNotice')],
    ]);
    expect(notifiedAt(Y)).toEqual([NOW, NEXT_DAY]);

    await runCron(DAY_AFTER);
    expect(sent()).toHaveLength(1);
    quiet.mockRestore();
  });

  it("decided also when the rule is not met by the reports left: the hider's profile was deleted in the gap", async () => {
    await reportAcrossHide(R2, 'fake', Y, async () => {
      await report(R1, 'under_18', Y);
      expect(await deleteProfile(R1)).toBe(true);
    });

    // R1's report no longer counts, so R2's report alone meets no rule; it is decided all the same.
    expect(reportsOn(Y).map((r) => [r.reporterProfileId, r.decision])).toEqual([
      [null, 'hidden'],
      [R2, 'hidden'],
    ]);
    expect(textsTo(R2)).toEqual([rt('ru', 'hideNotice')]);
    expect(hideEvents()).toHaveLength(1);
  });

  it('a visible target: the late decision decides nothing, and nobody is told', async () => {
    await report(R1, 'fake', X);
    await report(R2, 'offensive', Y);
    expect(decisionWrites()).toEqual([lateDecision(X), lateDecision(Y)]);
    expect(db.state.reports.map((r) => r.decision)).toEqual(['none', 'none']);
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it("an owner's unhide: the lifted reports stay lifted when a later report does not hide", async () => {
    await hideXByReports();
    await ownerUnhide(X, NOW);
    await report(R3, 'other', X);

    expect(row(X)).toMatchObject({ status: 'active', hiddenAt: null });
    expect(reportsOn(X).map((r) => [r.reporterProfileId, r.decision])).toEqual([
      [R1, 'lifted'],
      [R2, 'lifted'],
      [R3, 'none'],
    ]);
  });
});

describe("/appeal after a real hide (spec 07 §Appeals and the owner's review, FR-35)", () => {
  it('the hidden person appeals once; after an unhide nothing is left; a re-hide can be appealed again', async () => {
    await hideXByReports();
    vi.clearAllMocks();

    expect(await appeal({ who: X })).toEqual([rt('ru', 'appealReceived')]);
    expect(row(X)).toMatchObject({ status: 'hidden', appealedAt: NOW });
    expect(await appeal({ who: X })).toEqual([rt('ru', 'appealAlready')]);
    expect(row(X)!.appealedAt).toEqual(NOW);
    // Nobody else has anything to appeal, the reporters included.
    expect(await appeal({ who: R1 })).toEqual([rt('ru', 'appealNothing')]);
    expect(events()).toEqual([]);

    const LATER = new Date(NOW.getTime() + 2 * DAY);
    vi.setSystemTime(LATER);
    await ownerUnhide(X, LATER);
    expect(row(X)).toMatchObject({ status: 'active', appealedAt: NOW });
    expect(await appeal({ who: X })).toEqual([rt('ru', 'appealNothing')]);

    await report(R3, 'other', X);
    await report(R4, 'fake', X);
    expect(row(X)).toMatchObject({ status: 'hidden', hiddenAt: LATER, appealedAt: null });
    expect(await appeal({ who: X })).toEqual([rt('ru', 'appealReceived')]);
    expect(row(X)!.appealedAt).toEqual(LATER);
  });

  it('once the cron deletes the hidden profile, the banned chat gets the e-mail address', async () => {
    await hideXByReports();
    expect(await appeal({ who: X })).toEqual([rt('ru', 'appealReceived')]);

    await runCron(new Date(EXPIRES.getTime() + 14 * DAY));
    expect(row(X)).toBeUndefined();
    expect(chatRow(X).roommateBannedAt).toEqual(NOW);

    expect(await appeal({ who: X })).toEqual([rt('ru', 'appealByEmail')]);
  });

  it('an unhide that keeps the ban: the e-mail address, as /mate is still refused', async () => {
    await hideXByReports();
    await ownerUnhide(X, NOW);
    chatRow(X).roommateBannedAt = NOW;

    expect(await appeal({ who: X })).toEqual([rt('ru', 'appealByEmail')]);
    expect((await mate({ who: X })).map((r) => r.text)).toEqual([rt('ru', 'banned')]);
  });
});
