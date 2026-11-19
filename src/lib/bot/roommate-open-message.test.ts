import type { RoommateProfile } from '@prisma/client';
import { GrammyError, type Api } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The one-time "matching is open" message (FR-19; spec 06 §Matching is open). It runs through the
 * real daily cron (`runRoommateDaily` with its default jobs) and the real candidate loader
 * (`findCompatible`), over one in-memory Prisma fake whose `findMany` / `updateMany` /
 * `deleteMany` apply their `where` (the chat relation and the reaction and report relations
 * included) and return copies. Telegram is a fake `api.sendMessage`; the clock is fake; nothing
 * reaches Telegram, PostHog or a database.
 */

type ChatRow = {
  id: string;
  chatId: bigint;
  blockedAt: Date | null;
  roommateBannedAt: Date | null;
  locale: string;
};
type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = {
    profiles: [] as Row[],
    chats: [] as Row[],
    reactions: [] as Row[],
    reports: [] as Row[],
    /** Runs after every `findMany` read, before its caller writes. */
    afterRead: null as ((where: Where) => void) | null,
  };
  const chatOf = (row: Row) => state.chats.find((chat) => chat.id === row.chatId) ?? {};

  /** `relation: { none | some: {...} }`: the table and the field that points at the profile. */
  const RELATIONS: Record<string, [keyof typeof state, string]> = {
    reactionsGot: ['reactions', 'toProfileId'],
    reactionsGiven: ['reactions', 'fromProfileId'],
    reportsReceived: ['reports', 'targetProfileId'],
    reportsMade: ['reports', 'reporterProfileId'],
  };

  const time = (value: unknown) => (value instanceof Date ? value.getTime() : NaN);

  function matches(row: Row, where: Where): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (key === 'chat') return matches(chatOf(row), cond as Where);
      if (key in RELATIONS) {
        // `some` is the outcome question's (`reactionsGiven`), which every default run reads.
        const { none, some, ...rest } = cond as { none?: Where; some?: Where };
        const filter = none ?? some;
        if (!filter || (none && some) || Object.keys(rest).length) {
          throw new Error(`only none or some on ${key}`);
        }
        const [table, own] = RELATIONS[key];
        const found = (state[table] as Row[]).some(
          (item) => item[own] === row.id && matches(item, filter),
        );
        return none ? !found : found;
      }
      const value = row[key];
      if (cond === null) return value === null;
      if (cond instanceof Date) return time(value) === cond.getTime();
      if (typeof cond === 'object') {
        const {
          in: list,
          not,
          lte,
          gt,
          ...rest
        } = cond as {
          in?: unknown[];
          not?: unknown;
          lte?: Date;
          gt?: Date;
        };
        if (Object.keys(rest).length) throw new Error(`unsupported filter on ${key}`);
        if (list && !list.includes(value)) return false;
        if ('not' in (cond as object) && (not === null ? value === null : value === not)) {
          return false;
        }
        if (lte && !(time(value) <= lte.getTime())) return false;
        if (gt && !(time(value) > gt.getTime())) return false;
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
          : project(
              key === 'chat' ? chatOf(row) : (row[key] as Row),
              (part as { select: Row }).select,
            ),
      ]),
    );
  }

  function read(
    row: Row,
    select: Row | undefined,
    include: { chat?: { select: Row } } | undefined,
  ): Row {
    if (select) return project(row, select);
    const copy = structuredClone(row);
    if (include?.chat) copy.chat = project(chatOf(row), include.chat.select);
    return copy;
  }

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
        findMany: vi.fn(
          async ({
            where,
            select,
            include,
            orderBy,
            take,
          }: {
            where: Where;
            select?: Row;
            include?: { chat?: { select: Row } };
            orderBy?: Record<string, 'asc'>;
            take?: number;
          }) => {
            let hits = state.profiles.filter((row) => matches(row, where));
            if (orderBy) {
              const [field] = Object.keys(orderBy);
              hits = [...hits].sort((a, b) => time(a[field]) - time(b[field]));
            }
            if (take !== undefined) hits = hits.slice(0, take);
            const result = hits.map((row) => read(row, select, include));
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
      roommateReport: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        /** No report here: the default run's hide-notice retry (`retryHideNotices`) finds none. */
        findMany: vi.fn(async () => []),
      },
      /** No pair is matched here: the default run's reveal retry (`dueRevealPairs`) finds none. */
      roommateReaction: { findMany: vi.fn(async () => []) },
    },
  };
});
const mocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }));
vi.mock('./analytics', () => ({ track: mocks.track }));

import { runRoommateDaily, type CronClock } from './roommate-daily';
import { rt } from './roommate-texts';

const DAY = 24 * 60 * 60 * 1000;
const at = (iso: string) => new Date(iso);
const month = (yyyyMm: string) => new Date(`${yyyyMm}-01T00:00:00.000Z`);
/** 10:15 Warsaw in winter: the send-hour run. */
const NOW = at('2027-01-20T09:15:00Z');
/** The next day's send-hour run. */
const NEXT_DAY = new Date(NOW.getTime() + DAY);
const OPTED_IN = at('2026-12-10T12:00:00Z');

/** Compatible with every other default row: Mokotów, b3, February 2027, Russian, anyone. */
function profileRow(fields: Partial<RoommateProfile>): RoommateProfile {
  const activated = new Date(NOW.getTime() - 5 * DAY);
  return {
    id: 'profile',
    chatId: 'chat',
    status: 'active',
    step: null,
    entrySource: 'tg',
    districtSlugs: ['mokotow'],
    anyDistrict: false,
    budgetBand: 'b3',
    moveInMonth: month('2027-02'),
    languages: ['ru'],
    gender: null,
    prefers: 'anyone',
    about: null,
    smoking: null,
    pets: null,
    adultConfirmedAt: activated,
    tgUsername: 'someone',
    activatedAt: activated,
    expiresAt: new Date(NOW.getTime() + 20 * DAY),
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

/** A chat with its one profile. */
function seed(id: string, fields: Partial<RoommateProfile> = {}, chat: Partial<ChatRow> = {}) {
  nextChat += 1;
  const chatRow: ChatRow = {
    id: `chat-${id}`,
    chatId: BigInt(500_000_000 + nextChat),
    blockedAt: null,
    roommateBannedAt: null,
    locale: 'ru',
    ...chat,
  };
  db.state.chats.push(chatRow);
  db.state.profiles.push(profileRow({ id, chatId: chatRow.id, ...fields }) as unknown as Row);
  return { id, tgId: Number(chatRow.chatId), chat: chatRow };
}

/** The opted-in viewer of most tests. */
function seedViewer(fields: Partial<RoommateProfile> = {}, chat: Partial<ChatRow> = {}) {
  return seed('viewer', { notifyOnOpenAt: OPTED_IN, ...fields }, chat);
}

/** `n` profiles that fit the viewer, none of them opted in. */
function seedCompatible(n: number) {
  for (let i = 1; i <= n; i += 1) seed(`fit-${i}`);
}

function stored(id: string): RoommateProfile {
  const row = db.state.profiles.find((profile) => profile.id === id);
  if (!row) throw new Error(`no profile ${id}`);
  return row as unknown as RoommateProfile;
}

function fakeApi(impl?: (...args: unknown[]) => Promise<unknown>) {
  const sendMessage = vi.fn(impl ?? (async (..._args: unknown[]) => ({})));
  return { api: { sendMessage } as unknown as Api, sendMessage };
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

function run(api: Api, now: Date = NOW) {
  return runRoommateDaily(api, now, { clock: fakeClock() });
}

function telegramError(code: number, description: string) {
  return new GrammyError(
    "Call to 'sendMessage' failed!",
    { ok: false, error_code: code, description },
    'sendMessage',
    { chat_id: 500_000_001, text: 'roommate' },
  );
}

type Sent = { tgId: unknown; text: unknown; buttons: unknown };

function sent(sendMessage: ReturnType<typeof fakeApi>['sendMessage']): Sent[] {
  return sendMessage.mock.calls.map(([tgId, text, options]) => ({
    tgId,
    text,
    buttons: (options as { reply_markup?: { inline_keyboard: unknown } } | undefined)?.reply_markup
      ?.inline_keyboard,
  }));
}

const openEvents = () =>
  mocks.track.mock.calls.filter(([, event]) => event === 'tg_roommate_open_notified');

beforeEach(() => {
  vi.clearAllMocks();
  db.state.profiles = [];
  db.state.chats = [];
  db.state.reactions = [];
  db.state.reports = [];
  db.state.afterRead = null;
  nextChat = 0;
  vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the one-time message: the switch', () => {
  it.each(['', 'false', 'TRUE', '1'])(
    'with the switch "%s" (off) nothing is sent, claimed or tracked',
    async (value) => {
      vi.stubEnv('ROOMMATE_MATCHING_ENABLED', value);
      seedViewer();
      seedCompatible(3);
      const { api, sendMessage } = fakeApi();

      const result = await run(api);

      expect(sendMessage).not.toHaveBeenCalled();
      expect(stored('viewer').notifiedOpenAt).toBeNull();
      expect(stored('viewer').lastPushAt).toBeNull();
      expect(mocks.track).not.toHaveBeenCalled();
      expect(result.messages).toEqual({
        sent: 0,
        blocked: 0,
        failed: 0,
        skipped: 0,
        stopped: null,
      });
    },
  );

  it('reads the switch per run: off sends nothing, the next run with it on sends once', async () => {
    seedViewer();
    seedCompatible(1);
    const { api, sendMessage } = fakeApi();

    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'false');
    await run(api);
    expect(sendMessage).not.toHaveBeenCalled();

    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
    await run(api, NEXT_DAY);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('outside the send hour nothing is sent, even with the switch on', async () => {
    seedViewer();
    seedCompatible(1);
    const { api, sendMessage } = fakeApi();

    await run(api, new Date(NOW.getTime() - 60 * 60 * 1000));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(stored('viewer').notifiedOpenAt).toBeNull();
  });
});

describe('the one-time message: PRD 3 §8 wording and the Show button', () => {
  it.each([
    ['ru', 'Подбор открыт. Сейчас тебе подходят 3 человека.', '👀 Показать'],
    ['uk', 'Підбір відкрито. Зараз тобі підходять 3 людини.', '👀 Показати'],
    ['en', 'Matching is open. 3 people fit you right now.', '👀 Show'],
  ])('%s: three people fit', async (locale, text, button) => {
    const viewer = seedViewer({}, { locale });
    seedCompatible(3);
    seed('other-language', { languages: ['pl'] }); // fits nobody here
    const { api, sendMessage } = fakeApi();

    await run(api);

    expect(sent(sendMessage)).toEqual([
      { tgId: viewer.tgId, text, buttons: [[{ text: button, callback_data: 'rm:show:o' }]] },
    ]);
  });

  it.each<[string, number, string]>([
    ['ru', 1, 'Подбор открыт. Сейчас тебе подходит 1 человек.'],
    ['ru', 2, 'Подбор открыт. Сейчас тебе подходят 2 человека.'],
    ['ru', 5, 'Подбор открыт. Сейчас тебе подходят 5 человек.'],
    ['ru', 11, 'Подбор открыт. Сейчас тебе подходят 11 человек.'],
    ['ru', 21, 'Подбор открыт. Сейчас тебе подходит 21 человек.'],
    ['uk', 1, 'Підбір відкрито. Зараз тобі підходить 1 людина.'],
    ['uk', 2, 'Підбір відкрито. Зараз тобі підходять 2 людини.'],
    ['uk', 5, 'Підбір відкрито. Зараз тобі підходять 5 людей.'],
    ['uk', 11, 'Підбір відкрито. Зараз тобі підходять 11 людей.'],
    ['uk', 21, 'Підбір відкрито. Зараз тобі підходить 21 людина.'],
    ['en', 1, 'Matching is open. 1 person fits you right now.'],
    ['en', 2, 'Matching is open. 2 people fit you right now.'],
    ['en', 21, 'Matching is open. 21 people fit you right now.'],
  ])('%s: %i agrees in verb and noun', async (locale, n, text) => {
    seedViewer({}, { locale });
    seedCompatible(n);
    const { api, sendMessage } = fakeApi();

    await run(api);

    expect(sent(sendMessage).map((message) => message.text)).toEqual([text]);
  });

  it.each([
    [
      'ru',
      'Подбор открыт. Пока тебе никто не подходит. Раз в день проверяю новые анкеты и напишу, когда появится подходящий человек.',
    ],
    [
      'uk',
      'Підбір відкрито. Поки тобі ніхто не підходить. Раз на день перевіряю нові анкети й напишу, коли зʼявиться людина, яка тобі підходить.',
    ],
    [
      'en',
      "Matching is open. Nobody fits you yet. I check new profiles once a day and I'll message you when someone new fits.",
    ],
  ])(
    '%s: N = 0 still sends, says nobody fits yet and the once-a-day message',
    async (locale, text) => {
      const viewer = seedViewer({}, { locale });
      seed('other-language', { languages: ['pl'] });
      const { api, sendMessage } = fakeApi();

      await run(api);

      expect(sent(sendMessage)).toEqual([
        {
          tgId: viewer.tgId,
          text,
          buttons: [[{ text: rt(locale as 'ru', 'btnShow'), callback_data: 'rm:show:o' }]],
        },
      ]);
      expect(openEvents()).toEqual([
        [viewer.tgId, 'tg_roommate_open_notified', { count_band: '0' }],
      ]);
    },
  );

  it.each([
    ['ru', 'Подбор открыт. Пока тебе никто не подходит.'],
    ['uk', 'Підбір відкрито. Поки тобі ніхто не підходить.'],
    ['en', 'Matching is open. Nobody fits you yet.'],
  ])('%s: N = 0 with the daily push off promises no daily message', async (locale, text) => {
    seedViewer({ pushOff: true }, { locale });
    const { api, sendMessage } = fakeApi();

    await run(api);

    expect(sent(sendMessage).map((message) => message.text)).toEqual([text]);
  });

  it('N > 0 reads the same with the daily push off', async () => {
    seedViewer({ pushOff: true });
    seedCompatible(2);
    const { api, sendMessage } = fakeApi();

    await run(api);

    expect(sent(sendMessage).map((message) => message.text)).toEqual([
      'Подбор открыт. Сейчас тебе подходят 2 человека.',
    ]);
  });
});

describe('the one-time message: tg_roommate_open_notified', () => {
  it.each<[number, string]>([
    [0, '0'],
    [1, '1-2'],
    [2, '1-2'],
    [3, '3-5'],
    [5, '3-5'],
    [6, '6+'],
    [9, '6+'],
  ])('%i people fit → count_band %s, and nothing else in the event', async (n, band) => {
    const viewer = seedViewer();
    seedCompatible(n);
    const { api } = fakeApi();

    await run(api);

    expect(openEvents()).toEqual([
      [viewer.tgId, 'tg_roommate_open_notified', { count_band: band }],
    ]);
  });
});

describe('the one-time message: N is the number findCompatible gives', () => {
  it('counts only visible, compatible profiles the viewer has not reacted to or reported', async () => {
    const viewer = seedViewer();
    seed('fit-1');
    seed('fit-2', { renewedAt: new Date(NOW.getTime() - DAY) });
    // An interest from the other side does not hide it (only a skip does).
    seed('likes-viewer');
    db.state.reactions.push({
      fromProfileId: 'likes-viewer',
      toProfileId: 'viewer',
      kind: 'interest',
    });
    // Not counted:
    seed('other-language', { languages: ['pl'] });
    seed('far-budget', { budgetBand: 'b5' });
    seed('hidden', { status: 'hidden' });
    seed('expired', { status: 'expired', expiredAt: new Date(NOW.getTime() - DAY) });
    seed('draft', { status: 'draft' });
    seed('blocked', {}, { blockedAt: new Date(NOW.getTime() - DAY) });
    seed('banned', {}, { roommateBannedAt: new Date(NOW.getTime() - DAY) });
    seed('reacted-to');
    db.state.reactions.push({
      fromProfileId: 'viewer',
      toProfileId: 'reacted-to',
      kind: 'interest',
    });
    seed('skipped-viewer');
    db.state.reactions.push({
      fromProfileId: 'skipped-viewer',
      toProfileId: 'viewer',
      kind: 'skip',
    });
    seed('reported');
    db.state.reports.push({ reporterProfileId: 'viewer', targetProfileId: 'reported' });
    seed('reported-viewer');
    db.state.reports.push({ reporterProfileId: 'reported-viewer', targetProfileId: 'viewer' });
    const { api, sendMessage } = fakeApi();

    await run(api);

    // The others get the daily push (fit-2 renewed after they came up); the viewer only this.
    expect(
      sent(sendMessage)
        .filter((message) => message.tgId === viewer.tgId)
        .map((message) => message.text),
    ).toEqual(['Подбор открыт. Сейчас тебе подходят 3 человека.']);
  });
});

describe('the one-time message: who gets it', () => {
  it('only active, opted-in profiles not yet told, whose chat is neither blocked nor banned', async () => {
    const eligible = seed('eligible', { notifyOnOpenAt: OPTED_IN });
    seed('never-opted-in'); // e.g. created after the switch went on: the opt-in was never shown
    seed('already-told', {
      notifyOnOpenAt: OPTED_IN,
      notifiedOpenAt: new Date(NOW.getTime() - 3 * DAY),
    });
    seed('hidden', { status: 'hidden', statementSentAt: OPTED_IN, notifyOnOpenAt: OPTED_IN });
    seed('expired', {
      status: 'expired',
      notifyOnOpenAt: OPTED_IN,
      expiredAt: new Date(NOW.getTime() - DAY),
    });
    seed('draft', { status: 'draft', notifyOnOpenAt: OPTED_IN });
    seed('blocked', { notifyOnOpenAt: OPTED_IN }, { blockedAt: new Date(NOW.getTime() - DAY) });
    seed(
      'banned',
      { notifyOnOpenAt: OPTED_IN },
      { roommateBannedAt: new Date(NOW.getTime() - DAY) },
    );
    // Active, but its expiry time has passed: the run marks it expired first, so no message.
    seed('past-expiry', { notifyOnOpenAt: OPTED_IN, expiresAt: new Date(NOW.getTime() - 1000) });
    const { api, sendMessage } = fakeApi();

    await run(api);

    expect(sent(sendMessage).map((message) => message.tgId)).toEqual([eligible.tgId]);
    expect(openEvents().map(([tgId]) => tgId)).toEqual([eligible.tgId]);
    expect(stored('already-told').notifiedOpenAt).toEqual(new Date(NOW.getTime() - 3 * DAY));
    for (const id of ['never-opted-in', 'hidden', 'expired', 'draft', 'blocked', 'banned']) {
      expect(stored(id).notifiedOpenAt, id).toBeNull();
    }
  });

  it('sends to every opted-in profile, earliest opt-in first', async () => {
    const late = seed('late', { notifyOnOpenAt: at('2026-12-20T10:00:00Z') });
    const early = seed('early', { notifyOnOpenAt: at('2026-12-01T10:00:00Z') });
    const middle = seed('middle', { notifyOnOpenAt: at('2026-12-10T10:00:00Z') });
    const { api, sendMessage } = fakeApi();

    await run(api);

    // Each fits the other two.
    expect(sent(sendMessage)).toEqual(
      [early, middle, late].map(({ tgId }) => ({
        tgId,
        text: 'Подбор открыт. Сейчас тебе подходят 2 человека.',
        buttons: [[{ text: '👀 Показать', callback_data: 'rm:show:o' }]],
      })),
    );
  });

  it('a renewal reminder due the same run goes first, then the one-time message', async () => {
    const viewer = seedViewer({ expiresAt: new Date(NOW.getTime() + 2 * DAY) });
    seedCompatible(1);
    const { api, sendMessage } = fakeApi();

    await run(api);

    expect(sent(sendMessage).map(({ tgId, text }) => ({ tgId, text }))).toEqual([
      { tgId: viewer.tgId, text: rt('ru', 'renewalReminder', { date: '22 января 2027' }) },
      { tgId: viewer.tgId, text: 'Подбор открыт. Сейчас тебе подходит 1 человек.' },
    ]);
  });
});

describe('the one-time message: claim once, release on failure', () => {
  it('claims notified_open_at and sets last_push_at to the send time, so no push follows today', async () => {
    seedViewer({ lastPushAt: null });
    seedCompatible(1);
    const { api } = fakeApi();

    await run(api);

    expect(stored('viewer').notifiedOpenAt).toEqual(NOW);
    expect(stored('viewer').lastPushAt).toEqual(NOW);
    // The daily push counts profiles newer than coalesce(last_push_at, activated_at): none is.
    const freshest = Math.max(
      ...db.state.profiles
        .filter((row) => row.id !== 'viewer')
        .map((row) => ((row.renewedAt ?? row.activatedAt) as Date).getTime()),
    );
    expect(freshest).toBeLessThanOrEqual(stored('viewer').lastPushAt!.getTime());
  });

  it('two runs in a row, and the next day, send it once', async () => {
    const viewer = seedViewer();
    seedCompatible(2);
    const { api, sendMessage } = fakeApi();

    await run(api);
    await run(api);
    await run(api, NEXT_DAY);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(openEvents()).toEqual([
      [viewer.tgId, 'tg_roommate_open_notified', { count_band: '1-2' }],
    ]);
    expect(stored('viewer').notifiedOpenAt).toEqual(NOW);
  });

  it('two overlapping runs send it once', async () => {
    seedViewer();
    seedCompatible(2);
    const { api, sendMessage } = fakeApi();

    await Promise.all([run(api), run(api)]);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(openEvents()).toHaveLength(1);
  });

  it('a failed send releases both columns (last_push_at as it was), no event; the next day retries', async () => {
    const earlierPush = at('2026-12-28T09:15:00Z');
    seedViewer({ lastPushAt: earlierPush });
    seedCompatible(1);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = fakeApi(async () => {
      throw telegramError(400, 'Bad Request: something');
    });

    await run(failing.api);

    // The one-time message did not arrive, so the daily push of the same run may go: it counts
    // fit-1 (newer than the earlier push), fails too and restores last_push_at as well.
    expect(sent(failing.sendMessage).map((message) => message.text)).toEqual([
      'Подбор открыт. Сейчас тебе подходит 1 человек.',
      'Новых подходящих людей: 1.',
    ]);
    expect(stored('viewer').notifiedOpenAt).toBeNull();
    expect(stored('viewer').lastPushAt).toEqual(earlierPush);
    expect(openEvents()).toEqual([]);
    expect(JSON.stringify(errors.mock.calls)).not.toContain('500000001');

    const { api, sendMessage } = fakeApi();
    await run(api, NEXT_DAY);
    // The one-time message only: it sets last_push_at, so no push the same day.
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(stored('viewer').notifiedOpenAt).toEqual(NEXT_DAY);
    expect(openEvents()).toHaveLength(1);
  });

  it('a 403 marks the chat blocked and keeps the claim; no event', async () => {
    const viewer = seedViewer();
    seedCompatible(1);
    const { api } = fakeApi(async () => {
      throw telegramError(403, 'Forbidden: bot was blocked by the user');
    });

    await run(api);

    expect(viewer.chat.blockedAt).toEqual(NOW);
    expect(stored('viewer').notifiedOpenAt).toEqual(NOW);
    expect(openEvents()).toEqual([]);
  });

  it('an opt-out between the read and the claim sends nothing', async () => {
    seedViewer();
    seedCompatible(1);
    db.state.afterRead = (where) => {
      if ('notifyOnOpenAt' in where) {
        Object.assign(db.state.profiles.find((row) => row.id === 'viewer')!, {
          notifyOnOpenAt: null,
        });
      }
    };
    const { api, sendMessage } = fakeApi();

    await run(api);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(stored('viewer').notifiedOpenAt).toBeNull();
    expect(openEvents()).toEqual([]);
  });
});
