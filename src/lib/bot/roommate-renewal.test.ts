import type { RoommateProfile } from '@prisma/client';
import { GrammyError, type Api, type Bot, type Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The renewal reminder and the renewal (FR-15; spec 06 §Renewal). The reminder runs through the
 * real daily cron (`runRoommateDaily` with its default jobs) and the taps through the handlers
 * `registerRoommateFlow` registers, both over one in-memory Prisma fake whose `findMany` /
 * `updateMany` / `deleteMany` apply their `where` (the chat relation included) and return copies.
 * Telegram is a fake `api.sendMessage` and a fake context; nothing reaches Telegram or a database.
 */

type ChatRow = { id: string; chatId: bigint; blockedAt: Date | null; locale: string };
type Where = Record<string, unknown>;
type Row = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = {
    profiles: [] as Row[],
    chats: [] as Row[],
    /** Runs after every `findMany` read, before its caller writes (a renewal between the two). */
    afterRead: null as ((where: Where) => void) | null,
  };
  const chatOf = (row: Row) => state.chats.find((chat) => chat.id === row.chatId) ?? {};

  function matches(row: Row, where: Where): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (key === 'chat') return matches(chatOf(row), cond as Where);
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

  function project(row: Row, select: Record<string, unknown>): Row {
    return Object.fromEntries(
      Object.entries(select).map(([key, part]) => [
        key,
        part === true
          ? structuredClone(row[key])
          : project(
              key === 'chat' ? chatOf(row) : (row[key] as Row),
              (part as { select: Row }).select,
            ),
      ]),
    );
  }

  const time = (value: unknown) => (value instanceof Date ? value.getTime() : Infinity);

  return {
    state,
    prisma: {
      telegramChat: {
        updateMany: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
          const hits = state.chats.filter((chat) => matches(chat, where));
          for (const chat of hits) Object.assign(chat, structuredClone(data));
          return { count: hits.length };
        }),
      },
      roommateProfile: {
        findUnique: vi.fn(async ({ where }: { where: { chatId: string } }) => {
          const row = state.profiles.find((profile) => profile.chatId === where.chatId);
          return row ? structuredClone(row) : null;
        }),
        findMany: vi.fn(
          async ({
            where,
            select,
            orderBy,
            take,
          }: {
            where: Where;
            select?: Row;
            orderBy?: { expiresAt: 'asc' };
            take?: number;
          }) => {
            let hits = state.profiles.filter((row) => matches(row, where));
            if (orderBy) hits = [...hits].sort((a, b) => time(a.expiresAt) - time(b.expiresAt));
            if (take !== undefined) hits = hits.slice(0, take);
            const result = hits.map((row) =>
              select ? project(row, select) : structuredClone(row),
            );
            state.afterRead?.(where);
            return result;
          },
        ),
        updateMany: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
          const hits = state.profiles.filter((row) => matches(row, where));
          for (const row of hits) Object.assign(row, structuredClone(data));
          return { count: hits.length };
        }),
        deleteMany: vi.fn(async ({ where }: { where: Where }) => {
          const hits = state.profiles.filter((row) => matches(row, where));
          state.profiles = state.profiles.filter((row) => !hits.includes(row));
          return { count: hits.length };
        }),
      },
      roommateReport: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    },
  };
});
const mocks = vi.hoisted(() => ({
  touchChat: vi.fn(),
  track: vi.fn(),
  hasOpenIntake: vi.fn(),
  getCity: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }));
vi.mock('./store', () => ({ touchChat: mocks.touchChat }));
vi.mock('./analytics', () => ({ track: mocks.track }));
vi.mock('./deposit-flow', () => ({ hasOpenIntake: mocks.hasOpenIntake }));
vi.mock('./lookup', () => ({ getCity: mocks.getCity }));

import { MONTH_TAP, cancelRoommate, registerRoommateFlow } from './roommate-flow';
import { runRoommateDaily, type CronClock } from './roommate-daily';
import { rt } from './roommate-texts';

const CHAT_ID = 4242;
const CHAT_ROW = 'chat-row';
const DAY = 24 * 60 * 60 * 1000;
const at = (iso: string) => new Date(iso);
const month = (yyyyMm: string) => new Date(`${yyyyMm}-01T00:00:00.000Z`);

const DISTRICTS = [{ id: 'd1', slug: 'mokotow', nameKey: 'Mokotów' }];

/** A saved (active) profile; `fields` override. */
function profileRow(fields: Partial<RoommateProfile> = {}): RoommateProfile {
  const activated = at('2026-12-03T08:00:00Z');
  return {
    id: 'profile-1',
    chatId: CHAT_ROW,
    status: 'active',
    step: null,
    entrySource: 'tg',
    districtSlugs: ['mokotow'],
    anyDistrict: false,
    budgetBand: 'b2',
    moveInMonth: month('2027-02'),
    languages: ['ru'],
    gender: null,
    prefers: 'anyone',
    about: null,
    smoking: null,
    pets: null,
    adultConfirmedAt: activated,
    tgUsername: 'anna_w',
    activatedAt: activated,
    expiresAt: at('2027-01-02T08:00:00Z'),
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
    createdAt: activated,
    updatedAt: activated,
    ...fields,
  };
}

let nextChat = 0;

/** A chat with its one profile; the first chat is the one the fake context taps from. */
function seed(fields: Partial<RoommateProfile> = {}, chat: Partial<ChatRow> = {}) {
  nextChat += 1;
  const chatRow: ChatRow = {
    id: nextChat === 1 ? CHAT_ROW : `chat-${nextChat}`,
    chatId: BigInt(nextChat === 1 ? CHAT_ID : 500_000_000 + nextChat),
    blockedAt: null,
    locale: 'ru',
    ...chat,
  };
  db.state.chats.push(chatRow);
  const row = profileRow({
    id: nextChat === 1 ? 'profile-1' : `profile-${nextChat}`,
    chatId: chatRow.id,
    ...fields,
  });
  db.state.profiles.push(row as unknown as Row);
  return { chat: chatRow, id: row.id };
}

/** The stored row of a profile (the first one by default). */
const row = (id = 'profile-1') =>
  db.state.profiles.find((profile) => profile.id === id) as unknown as RoommateProfile | undefined;

// --- the cron ---------------------------------------------------------------------------------

function fakeApi() {
  const sendMessage = vi.fn(async (..._args: unknown[]) => ({}));
  return { api: { sendMessage } as unknown as Api, sendMessage };
}

function fakeClock(): CronClock {
  let t = 1_000_000;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  };
}

/** One cron run with the default jobs, as the route calls it. */
const runAt = (now: Date, api: Api) => runRoommateDaily(api, now, { clock: fakeClock() });

/**
 * Both cron runs (08:00 and 09:00 UTC) of every day from `from` to `to` (inclusive); returns the
 * runs that sent a message, as ISO instants.
 */
async function runDays(from: string, to: string, api: Api, sendMessage: ReturnType<typeof vi.fn>) {
  const sentAt: string[] = [];
  for (
    let day = at(`${from}T00:00:00Z`);
    day <= at(`${to}T00:00:00Z`);
    day = new Date(day.getTime() + DAY)
  ) {
    for (const hour of [8, 9]) {
      const run = new Date(day.getTime() + hour * 60 * 60 * 1000);
      const before = sendMessage.mock.calls.length;
      await runAt(run, api);
      if (sendMessage.mock.calls.length > before) sentAt.push(run.toISOString());
    }
  }
  return sentAt;
}

type Button = { text: string; callback_data?: string };
type Markup = { inline_keyboard: Button[][] };

const buttons = (options: unknown) =>
  ((options as { reply_markup?: Markup } | undefined)?.reply_markup?.inline_keyboard ?? []).map(
    (r) => r.map((b) => [b.text, b.callback_data]),
  );

// --- the taps ---------------------------------------------------------------------------------

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
  return routes;
}

const ROUTES = registeredRoutes();
const routesFor = (data: string) =>
  ROUTES.filter(([trigger]) =>
    typeof trigger === 'string' ? trigger === data : trigger.test(data),
  );

function fakeCtx() {
  const reply = vi.fn().mockResolvedValue({});
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const editMessageReplyMarkup = vi.fn().mockResolvedValue(true);
  const ctx = {
    chat: { id: CHAT_ID },
    from: { id: CHAT_ID, username: 'anna_w' },
    reply,
    answerCallbackQuery,
    editMessageReplyMarkup,
  } as unknown as Context;
  return { ctx, reply, answerCallbackQuery };
}

/** A tap on a button with `data`, routed to the one handler registered for it. */
async function tap(data: string, fake = fakeCtx()) {
  const routes = routesFor(data);
  expect(routes, `routes for ${data}`).toHaveLength(1);
  const [trigger, handler] = routes[0];
  Object.assign(fake.ctx, {
    callbackQuery: { id: 'q', data },
    match: typeof trigger === 'string' ? data : data.match(trigger),
  });
  await handler(fake.ctx);
  return fake;
}

const texts = (reply: ReturnType<typeof vi.fn>) => reply.mock.calls.map((call) => call[0]);
const replyButtons = (reply: ReturnType<typeof vi.fn>, index: number) =>
  buttons(reply.mock.calls[index][1]).map((r) => r.map(([, data]) => data));

const RENEWED: unknown[] = [CHAT_ID, 'tg_roommate_profile_renewed'];
const renewedEvents = () =>
  mocks.track.mock.calls.filter((call) => call[1] === 'tg_roommate_profile_renewed');
const CARD = /^🏠 <b>Твоя анкета<\/b>/;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: at('2026-12-30T10:00:00Z'), toFake: ['Date'] });
  vi.stubEnv('ROOMMATE_MATCHING_ENABLED', '');
  db.state.profiles = [];
  db.state.chats = [];
  db.state.afterRead = null;
  nextChat = 0;
  mocks.touchChat.mockImplementation(async () => ({
    id: CHAT_ROW,
    locale: db.state.chats.find((chat) => chat.id === CHAT_ROW)?.locale ?? 'ru',
    isNew: false,
  }));
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.getCity.mockResolvedValue({ id: 'city-1', slug: 'warsaw', districts: DISTRICTS });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('callback data of the renewal', () => {
  it('the reminder buttons and the month answer are routed to exactly one handler each', () => {
    expect(routesFor('rm:c:renew')).toHaveLength(1);
    expect(routesFor('rm:c:del')).toHaveLength(1);
    expect(routesFor('rm:m:2027-01')).toEqual([[MONTH_TAP, expect.any(Function)]]);
  });
});

describe('golden case 1 (PRD 3 FR-15 criterion 1): created 2026-12-03 08:00 UTC, move-in February 2027', () => {
  it('hides 2027-01-02 08:00 UTC, is reminded on the run of 2026-12-30 09:00 UTC, renewed 2026-12-31 10:00 UTC → 2027-01-30 10:00 UTC', async () => {
    seed({
      status: 'draft',
      step: 'adult',
      activatedAt: null,
      expiresAt: null,
      adultConfirmedAt: null,
    });
    vi.setSystemTime(at('2026-12-03T08:00:00Z'));
    await tap('rm:a:yes');
    expect(row()?.status).toBe('active');
    expect(row()?.expiresAt).toEqual(at('2027-01-02T08:00:00Z'));

    const { api, sendMessage } = fakeApi();
    expect(await runDays('2026-12-03', '2026-12-31', api, sendMessage)).toEqual([
      '2026-12-30T09:00:00.000Z',
    ]);
    const [chatId, text, options] = sendMessage.mock.calls[0];
    expect(chatId).toBe(CHAT_ID);
    expect(text).toBe('Анкета скроется 2 января 2027. Продлить на 30 дней?');
    expect(text).toBe(rt('ru', 'renewalReminder', { date: '2 января 2027' }));
    expect(buttons(options)).toEqual(
      [
        ['🔄 Продлить на 30 дней', 'rm:c:renew'],
        ['🗑 Удалить', 'rm:c:del'],
      ].map((button) => [button]),
    );
    expect(row()?.renewalRemindedAt).toEqual(at('2026-12-30T09:00:00Z'));

    // Renew from the reminder.
    vi.setSystemTime(at('2026-12-31T10:00:00Z'));
    mocks.track.mockClear();
    const { reply } = await tap('rm:c:renew');
    expect(row()).toMatchObject({
      status: 'active',
      step: null,
      moveInMonth: month('2027-02'),
      renewedAt: at('2026-12-31T10:00:00Z'),
      expiresAt: at('2027-01-30T10:00:00Z'),
      renewalRemindedAt: null,
      expiredAt: null,
    });
    expect(mocks.track.mock.calls).toEqual([RENEWED]);
    expect(texts(reply)).toHaveLength(2);
    expect(texts(reply)[0]).toBe('Анкета продлена, теперь она скроется 30 января 2027.');
    expect(texts(reply)[1]).toMatch(CARD);
    expect(texts(reply)[1]).toContain('Анкета скроется 30 января 2027.');
    // 30 days away now: the card has no Renew button.
    expect(replyButtons(reply, 1).flat()).not.toContain('rm:c:renew');

    // The renewal cleared the reminder mark: the new date is reminded once, 3 days before it.
    sendMessage.mockClear();
    expect(await runDays('2027-01-01', '2027-01-29', api, sendMessage)).toEqual([
      '2027-01-28T09:00:00.000Z',
    ]);
    expect(sendMessage.mock.calls[0][1]).toBe(
      'Анкета скроется 30 января 2027. Продлить на 30 дней?',
    );
  });
});

describe('golden case 2 (criterion 2): created 2026-12-20 with move-in December 2026', () => {
  beforeEach(async () => {
    seed({
      status: 'draft',
      step: 'adult',
      moveInMonth: month('2026-12'),
      activatedAt: null,
      expiresAt: null,
      adultConfirmedAt: null,
    });
    vi.setSystemTime(at('2026-12-20T12:00:00Z'));
    await tap('rm:a:yes');
  });

  it('hides 2026-12-31 23:59:59 Warsaw and is reminded on the run of 2026-12-29, naming that date', async () => {
    expect(row()?.expiresAt).toEqual(at('2026-12-31T22:59:59Z'));
    const { api, sendMessage } = fakeApi();
    expect(await runDays('2026-12-20', '2026-12-31', api, sendMessage)).toEqual([
      '2026-12-29T09:00:00.000Z',
    ]);
    // The date, not "in 3 days": the month's end leaves less than that from the reminder.
    expect(sendMessage.mock.calls[0][1]).toBe(
      'Анкета скроется 31 декабря 2026. Продлить на 30 дней?',
    );
  });

  it('Renew on 2026-12-29: the month ends within 3 days, so a month is asked first; then renewed once', async () => {
    vi.setSystemTime(at('2026-12-29T10:00:00Z'));
    mocks.track.mockClear();
    const first = await tap('rm:c:renew');

    expect(texts(first.reply)).toEqual([rt('ru', 'renewMonthFirst'), rt('ru', 'askMonth')]);
    expect(replyButtons(first.reply, 1)).toEqual([
      ['rm:m:2026-12', 'rm:m:2027-01'],
      ['rm:m:2027-02', 'rm:m:2027-03'],
    ]);
    expect(row()).toMatchObject({
      status: 'active',
      step: 'renew_month',
      expiresAt: at('2026-12-31T22:59:59Z'),
      renewedAt: null,
    });
    expect(mocks.track).not.toHaveBeenCalled();

    const { reply } = await tap('rm:m:2027-01');
    expect(row()).toMatchObject({
      status: 'active',
      step: null,
      moveInMonth: month('2027-01'),
      renewedAt: at('2026-12-29T10:00:00Z'),
      // 30 days come before the end of January.
      expiresAt: at('2027-01-28T10:00:00Z'),
      renewalRemindedAt: null,
    });
    expect(mocks.track.mock.calls).toEqual([RENEWED]);
    expect(texts(reply)[0]).toBe('Анкета продлена, теперь она скроется 28 января 2027.');
    expect(texts(reply)[1]).toMatch(CARD);
    expect(texts(reply)[1]).toContain('Заезд: январь 2027');

    // A second tap on the month question is stale.
    const again = await tap('rm:m:2027-02');
    expect(texts(again.reply)).toEqual([rt('ru', 'stepDone')]);
    expect(row()?.moveInMonth).toEqual(month('2027-01'));
    expect(renewedEvents()).toHaveLength(1);
  });

  it('left alone it expires at the next run, and Renew inside the grace period makes it active again', async () => {
    const { api } = fakeApi();
    await runAt(at('2027-01-01T08:00:00Z'), api);
    expect(row()).toMatchObject({ status: 'expired', expiredAt: at('2027-01-01T08:00:00Z') });

    // Renew from the expired card on 2027-01-05: December has passed, so a month comes first.
    vi.setSystemTime(at('2027-01-05T10:00:00Z'));
    const first = await tap('rm:c:renew');
    expect(texts(first.reply)).toEqual([rt('ru', 'renewMonthFirst'), rt('ru', 'askMonth')]);
    expect(row()).toMatchObject({ status: 'expired', step: 'renew_month' });

    const { reply } = await tap('rm:m:2027-01');
    expect(row()).toMatchObject({
      status: 'active',
      step: null,
      moveInMonth: month('2027-01'),
      renewedAt: at('2027-01-05T10:00:00Z'),
      // The end of January comes before 30 days.
      expiresAt: at('2027-01-31T22:59:59Z'),
      expiredAt: null,
      renewalRemindedAt: null,
    });
    expect(renewedEvents()).toEqual([RENEWED]);
    expect(texts(reply)[1]).not.toContain('Срок анкеты истёк');

    // Active again: the next runs neither expire nor delete it.
    await runAt(at('2027-01-15T08:00:00Z'), api);
    expect(row()?.status).toBe('active');
  });
});

describe('the reminder job (spec 06 §Renewal, criterion 4)', () => {
  /** The run of 2026-12-30 at 10:00 Warsaw. */
  const RUN = at('2026-12-30T09:00:00Z');

  it('a second run, also an overlapping one, sends no second reminder', async () => {
    seed();
    const { api, sendMessage } = fakeApi();
    await runAt(RUN, api);
    await runAt(new Date(RUN.getTime() + 60_000), api);
    await Promise.all([runAt(RUN, api), runAt(RUN, api)]);
    await runAt(new Date(RUN.getTime() + DAY), api);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('two overlapping first runs claim the row once', async () => {
    seed();
    const { api, sendMessage } = fakeApi();
    const [a, b] = await Promise.all([runAt(RUN, api), runAt(RUN, api)]);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect([a.messages, b.messages]).toContainEqual(expect.objectContaining({ sent: 1 }));
  });

  it('is sent in the chat language (UK)', async () => {
    seed({}, { locale: 'uk' });
    const { api, sendMessage } = fakeApi();
    await runAt(RUN, api);
    const [, text, options] = sendMessage.mock.calls[0];
    expect(text).toBe('Анкета сховається 2 січня 2027. Продовжити на 30 днів?');
    expect(buttons(options)).toEqual([
      [[rt('uk', 'btnRenew'), 'rm:c:renew']],
      [[rt('uk', 'btnDelete'), 'rm:c:del']],
    ]);
  });

  it('goes only to active profiles within 3 days of expiry that were not reminded yet', async () => {
    seed({ id: 'due' });
    seed({ id: 'later', expiresAt: at('2027-01-02T09:00:01Z') });
    seed({ id: 'reminded', renewalRemindedAt: at('2026-12-29T09:00:00Z') });
    seed({ id: 'expired', status: 'expired', expiredAt: at('2026-12-29T08:00:00Z') });
    seed({ id: 'hidden', status: 'hidden', hiddenAt: at('2026-12-20T08:00:00Z') });
    seed({ id: 'draft', status: 'draft', step: 'budget', expiresAt: null, updatedAt: RUN });
    const { api, sendMessage } = fakeApi();

    const result = await runAt(RUN, api);

    expect(sendMessage.mock.calls.map((call) => call[0])).toEqual([CHAT_ID]);
    expect(result.messages).toEqual({ sent: 1, blocked: 0, failed: 0, skipped: 0, stopped: null });
    expect(row('later')?.renewalRemindedAt).toBeNull();
    expect(row('expired')?.renewalRemindedAt).toBeNull();
    expect(row('hidden')?.renewalRemindedAt).toBeNull();
  });

  it('is not sent outside the send hour', async () => {
    seed();
    const { api, sendMessage } = fakeApi();
    await runAt(at('2026-12-30T08:00:00Z'), api);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(row()?.renewalRemindedAt).toBeNull();
  });

  it('sends the earliest hide date first', async () => {
    seed({ id: 'first-seeded', expiresAt: at('2027-01-02T08:00:00Z') });
    seed({ id: 'sooner', expiresAt: at('2026-12-31T08:00:00Z') });
    const { api, sendMessage } = fakeApi();
    await runAt(RUN, api);
    expect(sendMessage.mock.calls.map((call) => call[1])).toEqual([
      'Анкета скроется 31 декабря 2026. Продлить на 30 дней?',
      'Анкета скроется 2 января 2027. Продлить на 30 дней?',
    ]);
  });

  it('skips a chat that blocked the bot: no claim, no send', async () => {
    seed({}, { blockedAt: at('2026-12-01T00:00:00Z') });
    const { api, sendMessage } = fakeApi();
    await runAt(RUN, api);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(row()?.renewalRemindedAt).toBeNull();
  });

  it('a 403 marks the chat blocked and keeps the claim: no retry the next day', async () => {
    const { chat } = seed();
    const { api, sendMessage } = fakeApi();
    sendMessage.mockRejectedValueOnce(
      new GrammyError(
        "Call to 'sendMessage' failed!",
        { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' },
        'sendMessage',
        {},
      ),
    );

    const result = await runAt(RUN, api);
    expect(result.messages).toMatchObject({ blocked: 1, sent: 0 });
    expect(chat.blockedAt).toEqual(RUN);
    expect(row()?.renewalRemindedAt).toEqual(RUN);

    await runAt(new Date(RUN.getTime() + DAY), api);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('a failed send releases the claim, so the next day sends it', async () => {
    seed();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { api, sendMessage } = fakeApi();
    sendMessage.mockRejectedValueOnce(new Error('network down'));

    const result = await runAt(RUN, api);
    expect(result.messages).toMatchObject({ failed: 1, sent: 0 });
    expect(row()?.renewalRemindedAt).toBeNull();
    expect(JSON.stringify(log.mock.calls)).not.toContain(String(CHAT_ID));

    const nextDay = new Date(RUN.getTime() + DAY);
    await runAt(nextDay, api);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(row()?.renewalRemindedAt).toEqual(nextDay);
  });

  it('a renewal between the read and the claim is not reminded with the old date', async () => {
    seed();
    db.state.afterRead = (where) => {
      if (!('renewalRemindedAt' in where)) return;
      Object.assign(row()!, { renewedAt: RUN, expiresAt: at('2027-01-29T09:00:00Z') });
    };
    const { api, sendMessage } = fakeApi();
    await runAt(RUN, api);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(row()?.renewalRemindedAt).toBeNull();
  });

  it('sends no event and puts no chat id or text into the result', async () => {
    seed();
    const { api } = fakeApi();
    const result = await runAt(RUN, api);
    expect(mocks.track).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/4242|Анкета/);
  });
});

describe('Renew (spec 06 §Renewal)', () => {
  /** 2026-12-30 10:00 UTC: the profile hides 2027-01-02 08:00 UTC, within 3 days. */
  const NOW = at('2026-12-30T10:00:00Z');

  it('from the card or the reminder: renews at once, a later move-in month kept', async () => {
    seed({ renewalRemindedAt: at('2026-12-30T09:00:00Z') });
    const { reply, answerCallbackQuery } = await tap('rm:c:renew');
    expect(row()).toMatchObject({
      status: 'active',
      moveInMonth: month('2027-02'),
      renewedAt: NOW,
      expiresAt: at('2027-01-29T10:00:00Z'),
      renewalRemindedAt: null,
      expiredAt: null,
    });
    expect(mocks.track.mock.calls).toEqual([RENEWED]);
    expect(texts(reply)[0]).toBe(rt('ru', 'renewed', { date: '29 января 2027' }));
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it('writes through one conditional update on renewed_at as read', async () => {
    seed({ renewedAt: at('2026-12-01T10:00:00Z') });
    await tap('rm:c:renew');
    expect(db.prisma.roommateProfile.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'profile-1',
        status: { in: ['active', 'expired'] },
        renewedAt: at('2026-12-01T10:00:00Z'),
      },
      data: {
        status: 'active',
        renewedAt: NOW,
        expiresAt: at('2027-01-29T10:00:00Z'),
        renewalRemindedAt: null,
        expiredAt: null,
      },
    });
  });

  it('keeps an open edit step (it renews nothing but the dates)', async () => {
    seed({ step: 'edit_budget' });
    await tap('rm:c:renew');
    expect(row()).toMatchObject({ step: 'edit_budget', renewedAt: NOW, budgetBand: 'b2' });
  });

  it('a move-in month that ends 4 days away renews at once, capped by the month end', async () => {
    seed({ moveInMonth: month('2026-12'), expiresAt: at('2026-12-29T12:00:00Z') });
    vi.setSystemTime(at('2026-12-27T22:00:00Z'));
    await tap('rm:c:renew');
    expect(row()).toMatchObject({ step: null, expiresAt: at('2026-12-31T22:59:59Z') });
    expect(renewedEvents()).toHaveLength(1);
  });

  it('a double tap renews once: the second tap gets the card', async () => {
    seed();
    await tap('rm:c:renew');
    const second = await tap('rm:c:renew');
    expect(renewedEvents()).toHaveLength(1);
    expect(texts(second.reply)).toHaveLength(1);
    expect(texts(second.reply)[0]).toMatch(CARD);
    expect(row()?.expiresAt).toEqual(at('2027-01-29T10:00:00Z'));
  });

  it('two overlapping taps: one write lands, one event, one "renewed"', async () => {
    seed();
    const [a, b] = await Promise.all([tap('rm:c:renew'), tap('rm:c:renew')]);
    expect(renewedEvents()).toHaveLength(1);
    const renewedReplies = [...texts(a.reply), ...texts(b.reply)].filter((text) =>
      text.startsWith('Анкета продлена'),
    );
    expect(renewedReplies).toHaveLength(1);
  });

  it('an old reminder after the profile was renewed: the card, nothing written', async () => {
    seed({ expiresAt: at('2027-01-20T10:00:00Z'), renewedAt: at('2026-12-21T10:00:00Z') });
    const { reply } = await tap('rm:c:renew');
    expect(texts(reply)).toHaveLength(1);
    expect(texts(reply)[0]).toMatch(CARD);
    expect(db.prisma.roommateProfile.updateMany).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('an expired profile inside the grace period renews at once when its month is still ahead', async () => {
    seed({ status: 'expired', expiredAt: at('2027-01-02T08:00:00Z') });
    vi.setSystemTime(at('2027-01-10T10:00:00Z'));
    const { reply } = await tap('rm:c:renew');
    expect(row()).toMatchObject({
      status: 'active',
      expiredAt: null,
      renewedAt: at('2027-01-10T10:00:00Z'),
      expiresAt: at('2027-02-09T10:00:00Z'),
    });
    expect(renewedEvents()).toHaveLength(1);
    expect(texts(reply)[1]).toContain('Анкета скроется 9 февраля 2027.');
  });

  it('an expired profile past its grace period is refused (the next run deletes it)', async () => {
    seed({ status: 'expired', expiredAt: at('2027-01-02T08:00:00Z') });
    vi.setSystemTime(at('2027-01-16T10:00:00Z'));
    const { reply } = await tap('rm:c:renew');
    expect(texts(reply)).toEqual([rt('ru', 'renewRefused')]);
    expect(row()).toMatchObject({ status: 'expired', renewedAt: null });
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('a hidden profile is never renewed (D55)', async () => {
    seed({ status: 'hidden', hiddenAt: at('2026-12-20T08:00:00Z') });
    const { reply } = await tap('rm:c:renew');
    expect(texts(reply)).toEqual([rt('ru', 'renewRefused')]);
    expect(row()).toMatchObject({ status: 'hidden', renewedAt: null, step: null });
    expect(db.prisma.roommateProfile.updateMany).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('no profile: "already deleted"; a draft (an old button after a restart): this step is done', async () => {
    const none = await tap('rm:c:renew');
    expect(texts(none.reply)).toEqual([rt('ru', 'alreadyDeleted')]);

    seed({ status: 'draft', step: 'budget', expiresAt: null, activatedAt: null });
    const draft = await tap('rm:c:renew');
    expect(texts(draft.reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askBudget')]);
    expect(row()).toMatchObject({ status: 'draft', step: 'budget' });
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('a passed move-in month asks for a month first; a passed month button there is refused', async () => {
    seed({ moveInMonth: month('2026-11'), expiresAt: at('2027-01-01T08:00:00Z') });
    await tap('rm:c:renew');
    expect(row()?.step).toBe('renew_month');

    const passed = await tap('rm:m:2026-11');
    expect(texts(passed.reply)).toEqual([rt('ru', 'monthPassed'), rt('ru', 'askMonth')]);
    expect(row()).toMatchObject({ step: 'renew_month', renewedAt: null });
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('accepts the current month at the renewal question when the person picks it', async () => {
    seed({ moveInMonth: month('2026-12'), expiresAt: at('2026-12-31T22:59:59Z') });
    await tap('rm:c:renew');
    await tap('rm:m:2026-12');
    expect(row()).toMatchObject({
      step: null,
      moveInMonth: month('2026-12'),
      renewedAt: NOW,
      expiresAt: at('2026-12-31T22:59:59Z'),
    });
    expect(renewedEvents()).toHaveLength(1);
  });

  it('no month question opens while the deposit questions are open', async () => {
    seed({ moveInMonth: month('2026-12'), expiresAt: at('2026-12-31T22:59:59Z') });
    mocks.hasOpenIntake.mockResolvedValue(true);
    const { reply } = await tap('rm:c:renew');
    expect(texts(reply)).toEqual([rt('ru', 'depositQuestionsOpen')]);
    expect(row()?.step).toBeNull();
  });

  it('/cancel at the month question closes it and leaves the profile as it was', async () => {
    seed({ moveInMonth: month('2026-12'), expiresAt: at('2026-12-31T22:59:59Z') });
    await tap('rm:c:renew');
    const { ctx, reply } = fakeCtx();
    expect(await cancelRoommate(ctx, CHAT_ROW, 'ru')).toBe(true);
    expect(texts(reply)).toEqual([rt('ru', 'cancelledEdit')]);
    expect(row()).toMatchObject({
      step: null,
      moveInMonth: month('2026-12'),
      expiresAt: at('2026-12-31T22:59:59Z'),
      renewedAt: null,
    });
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('the grace period ending while the month question is open refuses the month', async () => {
    seed({
      status: 'expired',
      moveInMonth: month('2026-12'),
      expiresAt: at('2026-12-31T22:59:59Z'),
      expiredAt: at('2027-01-01T08:00:00Z'),
    });
    vi.setSystemTime(at('2027-01-15T07:30:00Z'));
    await tap('rm:c:renew');
    expect(row()?.step).toBe('renew_month');

    vi.setSystemTime(at('2027-01-15T08:00:00Z'));
    const { reply } = await tap('rm:m:2027-02');
    expect(texts(reply)).toEqual([rt('ru', 'renewRefused')]);
    expect(row()).toMatchObject({ status: 'expired', renewedAt: null });
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('replies in the chat language (UK)', async () => {
    seed({}, { locale: 'uk' });
    const { reply } = await tap('rm:c:renew');
    expect(texts(reply)[0]).toBe(rt('uk', 'renewed', { date: '29 січня 2027' }));
  });
});
