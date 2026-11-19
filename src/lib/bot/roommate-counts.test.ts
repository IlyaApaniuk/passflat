import type { RoommateProfile } from '@prisma/client';
import type { Bot, Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

/**
 * The counts reply (PRD 3 FR-16, spec 06 §Counts) after the save ("I'm 18+") and on "How many are
 * looking?" (`rm:c:counts`), with PRD 3 §8 "Counts" in RU, UK and EN. Taps go through the handlers
 * `registerRoommateFlow` registers, over an in-memory Prisma fake whose `findMany` / `updateMany`
 * apply their `where` (the chat relation and `gt` included), so the golden case of PRD 3 §5
 * example 1 runs with its hidden, expired and blocked profiles in the table. Nothing reaches
 * Telegram or a database.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = {
    profiles: [] as Row[],
    chats: [] as Row[],
    reports: [] as Row[],
    fail: null as Error | null,
  };
  const chatOf = (row: Row) => state.chats.find((chat) => chat.id === row.chatId) ?? {};
  /** `relation: { none: {...} }` over the reports: the field that points at the profile. */
  const REPORTS: Record<string, string> = {
    reportsReceived: 'targetProfileId',
    reportsMade: 'reporterProfileId',
  };

  function matches(row: Row, where: Where): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (key === 'chat') return matches(chatOf(row), cond as Where);
      if (key in REPORTS) {
        const { none, ...rest } = cond as { none?: Where };
        if (!none || Object.keys(rest).length) throw new Error(`only none on ${key}`);
        return !state.reports.some((item) => item[REPORTS[key]] === row.id && matches(item, none));
      }
      const value = row[key];
      if (cond === null) return value === null;
      if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
      if (typeof cond === 'object') {
        const c = cond as { in?: unknown[]; gt?: Date };
        if (c.in) return c.in.includes(value);
        if (c.gt) return value instanceof Date && value.getTime() > c.gt.getTime();
        throw new Error(`unsupported filter on ${key}`);
      }
      return value === cond;
    });
  }

  return {
    state,
    prisma: {
      roommateProfile: {
        findUnique: vi.fn(async ({ where }: { where: { chatId: string } }) => {
          const row = state.profiles.find((profile) => profile.chatId === where.chatId);
          return row ? structuredClone(row) : null;
        }),
        findMany: vi.fn(async ({ where, select }: { where: Where; select: Row }) => {
          if (state.fail) throw state.fail;
          return state.profiles
            .filter((row) => matches(row, where))
            .map((row) => Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])))
            .map((row) => structuredClone(row));
        }),
        updateMany: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
          const hits = state.profiles.filter((row) => matches(row, where));
          for (const row of hits) Object.assign(row, structuredClone(data));
          return { count: hits.length };
        }),
      },
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
// The room cost reference has its own tests (`roommate-room-costs.test.ts`); here it is left out
// (null) unless a test gives it a text.
vi.mock('./roommate-room-costs', () => ({ roomCostsReply: mocks.roomCostsReply }));

import { registerRoommateFlow } from './roommate-flow';
import { rt, type RoommateLocale } from './roommate-texts';

const CHAT_ID = 4242;
const CHAT_ROW = 'chat-row';
const NOW = new Date('2026-12-05T10:00:00Z');
const LATER = new Date('2027-01-04T10:00:00Z');

const DISTRICTS = [
  { id: 'd1', slug: 'wola', nameKey: 'Wola' },
  { id: 'd2', slug: 'mokotow', nameKey: 'Mokotów' },
  { id: 'd3', slug: 'ochota', nameKey: 'Ochota' },
  { id: 'd4', slug: 'bielany', nameKey: 'Bielany' },
];

function profile(fields: Partial<RoommateProfile> = {}): RoommateProfile {
  return {
    id: 'P8',
    chatId: CHAT_ROW,
    status: 'active',
    step: null,
    entrySource: 'tg',
    districtSlugs: ['mokotow', 'wola'],
    anyDistrict: false,
    budgetBand: 'b3',
    moveInMonth: new Date('2027-02-01T00:00:00.000Z'),
    languages: ['ru'],
    gender: 'woman',
    prefers: 'women',
    about: null,
    smoking: null,
    pets: null,
    adultConfirmedAt: NOW,
    tgUsername: 'anna_w',
    activatedAt: NOW,
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
}

type Other = {
  id: string;
  districts: string[] | 'any';
  status?: string;
  expiresAt?: Date;
  blockedAt?: Date;
  bannedAt?: Date;
};

/** The chat's own profile (P8 unless changed) and other people's profiles, each in its own chat. */
function seed(own: Partial<RoommateProfile> | null, others: Other[] = []) {
  db.state.chats = [{ id: CHAT_ROW, blockedAt: null, roommateBannedAt: null }];
  db.state.profiles = own ? [profile(own) as unknown as Row] : [];
  db.state.reports = [];
  for (const other of others) {
    const chatId = `chat-${other.id}`;
    db.state.chats.push({
      id: chatId,
      blockedAt: other.blockedAt ?? null,
      roommateBannedAt: other.bannedAt ?? null,
    });
    db.state.profiles.push(
      profile({
        id: other.id,
        chatId,
        status: other.status ?? 'active',
        expiresAt: other.expiresAt ?? LATER,
        districtSlugs: other.districts === 'any' ? [] : other.districts,
        anyDistrict: other.districts === 'any',
        tgUsername: `user_${other.id}`,
      }) as unknown as Row,
    );
  }
}

/** PRD 3 §5 example 1, besides the viewer P8. */
const EXAMPLE_1: Other[] = [
  { id: 'P1', districts: ['mokotow', 'ochota'] },
  { id: 'P2', districts: ['mokotow'] },
  { id: 'P3', districts: 'any' },
  { id: 'P4', districts: ['wola'] },
  { id: 'P5', districts: ['mokotow'], status: 'hidden' },
  { id: 'P6', districts: ['mokotow'], status: 'expired', expiresAt: new Date('2026-12-01T10:00Z') },
  { id: 'P7', districts: ['ochota'] },
  { id: 'P9', districts: ['mokotow'], blockedAt: new Date('2026-12-02T10:00:00Z') },
];

/** P8 as a draft at the 18+ step, so "I'm 18+" saves it. */
const DRAFT_AT_ADULT = {
  status: 'draft',
  step: 'adult',
  activatedAt: null,
  expiresAt: null,
  adultConfirmedAt: null,
} satisfies Partial<RoommateProfile>;

const own = () => db.state.profiles.find((row) => row.chatId === CHAT_ROW);

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

type Button = { text: string; callback_data?: string };

/** A tap on a button with `data`, routed to the one handler registered for it. */
async function tap(data: string, locale: RoommateLocale = 'ru') {
  mocks.touchChat.mockResolvedValue({ id: CHAT_ROW, locale, isNew: false });
  const routes = ROUTES.filter(([trigger]) =>
    typeof trigger === 'string' ? trigger === data : trigger.test(data),
  );
  expect(routes, `routes for ${data}`).toHaveLength(1);
  const [trigger, handler] = routes[0];
  const reply = vi.fn().mockResolvedValue({});
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const ctx = {
    chat: { id: CHAT_ID },
    from: { id: CHAT_ID, username: 'anna_w' },
    callbackQuery: { id: 'q', data },
    match: typeof trigger === 'string' ? data : data.match(trigger),
    reply,
    answerCallbackQuery,
  } as unknown as Context;
  await handler(ctx);
  const texts = reply.mock.calls.map(([text]) => text as string);
  return { reply, answerCallbackQuery, texts, last: texts[texts.length - 1] };
}

const events = () => mocks.track.mock.calls.map(([, event]) => event);

/** The counts reply's options with the switch off: HTML and the opt-in button (spec 06 §Opt-in). */
const WITH_OPT_IN = {
  parse_mode: 'HTML',
  reply_markup: {
    inline_keyboard: [[{ text: rt('ru', 'btnOptIn'), callback_data: 'rm:c:optin' }]],
  },
};

const RU_GOLDEN =
  'Кроме тебя, анкеты есть у: Mokotów — 2 человека, Wola — 1, готовы к любому району — 1. Всего в Варшаве — 5 человек. Подбор откроется, когда людей станет больше.';
const UK_GOLDEN =
  'Окрім тебе, анкети мають: Mokotów — 2 людини, Wola — 1, готові до будь-якого району — 1. Усього у Варшаві — 5 людей. Підбір відкриється, коли людей стане більше.';
const EN_GOLDEN =
  'Besides you, people with a profile: Mokotów 2, Wola 1, open to any district 1. In Warsaw 5 in total. Matching opens when there are more people.';

const RU_ANY =
  'Кроме тебя, всего в Варшаве — 5 человек. Чаще всего выбирают: Mokotów — 2 человека, Ochota — 2, Wola — 1. Подбор откроется, когда людей станет больше.';
const UK_ANY =
  'Окрім тебе, усього у Варшаві — 5 людей. Найчастіше обирають: Mokotów — 2 людини, Ochota — 2, Wola — 1. Підбір відкриється, коли людей стане більше.';
const EN_ANY =
  'Besides you, in Warsaw 5 in total. Most chosen: Mokotów 2, Ochota 2, Wola 1. Matching opens when there are more people.';

let errorLog: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubEnv('ROOMMATE_MATCHING_ENABLED', '');
  db.state.fail = null;
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.getCity.mockResolvedValue({ id: 'city-1', slug: 'warsaw', districts: DISTRICTS });
  mocks.roomCostsReply.mockResolvedValue(null);
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  errorLog.mockRestore();
});

describe('after the save (golden case, PRD 3 §5 example 1)', () => {
  it('sends the card, then the counts in RU: Mokotów 2, Wola 1, any 1, Warsaw 5 besides you', async () => {
    seed(DRAFT_AT_ADULT, EXAMPLE_1);
    const { reply, texts } = await tap('rm:a:yes');

    expect(own()).toMatchObject({ status: 'active', step: null });
    expect(texts).toHaveLength(2);
    expect(texts[0].startsWith(rt('ru', 'cardHeader'))).toBe(true);
    expect(texts[1]).toBe(RU_GOLDEN);
    expect(reply.mock.calls[1][1]).toEqual(WITH_OPT_IN);
  });

  it.each<[RoommateLocale, string]>([
    ['uk', UK_GOLDEN],
    ['en', EN_GOLDEN],
  ])('writes the counts in %s', async (locale, expected) => {
    seed(DRAFT_AT_ADULT, EXAMPLE_1);
    const { last } = await tap('rm:a:yes', locale);
    expect(last).toBe(expected);
  });

  it.each<[RoommateLocale, string]>([
    ['ru', RU_ANY],
    ['uk', UK_ANY],
    ['en', EN_ANY],
  ])(
    'a viewer with "any" gets Warsaw 5 and Mokotów 2, Ochota 2, Wola 1 in %s',
    async (locale, expected) => {
      seed({ ...DRAFT_AT_ADULT, districtSlugs: [], anyDistrict: true }, EXAMPLE_1);
      const { last } = await tap('rm:a:yes', locale);
      expect(last).toBe(expected);
    },
  );

  it('never sums the district numbers and holds no percentage', async () => {
    seed(DRAFT_AT_ADULT, EXAMPLE_1);
    const { last } = await tap('rm:a:yes');
    // Mokotów 2 + Wola 1 would be 3; no other number than 2, 1, 1 and 5 appears.
    expect(last.match(/\d+/g)).toEqual(['2', '1', '1', '5']);
    expect(last).not.toMatch(/%|verified|провер/i);
  });

  it('sends only tg_roommate_profile_created; the counts send no event', async () => {
    seed(DRAFT_AT_ADULT, EXAMPLE_1);
    await tap('rm:a:yes');
    expect(events()).toEqual(['tg_roommate_profile_created']);
  });

  it('a second tap after the save says the step is done and sends no second counts reply', async () => {
    seed(DRAFT_AT_ADULT, EXAMPLE_1);
    await tap('rm:a:yes');
    const again = await tap('rm:a:yes');
    expect(again.texts).toEqual([rt('ru', 'stepDone')]);
    expect(db.prisma.roommateProfile.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('"How many are looking?" (rm:c:counts)', () => {
  it('sends the counts of the saved profile, answers the callback once and sends no event', async () => {
    seed({}, EXAMPLE_1);
    const { reply, texts, answerCallbackQuery } = await tap('rm:c:counts');

    expect(texts).toEqual([RU_GOLDEN]);
    expect(reply.mock.calls[0][1]).toEqual(WITH_OPT_IN);
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('leaves out a profile the viewer reported and one that reported the viewer (spec 07 §Report)', async () => {
    seed({}, EXAMPLE_1);
    db.state.reports = [
      { reporterProfileId: 'P8', targetProfileId: 'P1', reason: 'fake' },
      { reporterProfileId: 'P4', targetProfileId: 'P8', reason: 'other' },
      // Between two other people: it changes nothing for P8.
      { reporterProfileId: 'P2', targetProfileId: 'P3', reason: 'money' },
    ];
    const { texts } = await tap('rm:c:counts');

    // Mokotów: P2 (P1 left out); Wola: nobody (P4 left out); any: P3; Warsaw: P2, P3, P7.
    expect(texts).toEqual([
      'Кроме тебя, анкеты есть у: Mokotów — 1 человек, Wola — пока никого, готовы к любому району — 1. Всего в Варшаве — 3 человека. Подбор откроется, когда людей станет больше.',
    ]);
  });

  it.each<[RoommateLocale, string]>([
    ['uk', UK_GOLDEN],
    ['en', EN_GOLDEN],
  ])('writes them in %s', async (locale, expected) => {
    seed({}, EXAMPLE_1);
    const { texts } = await tap('rm:c:counts', locale);
    expect(texts).toEqual([expected]);
  });

  it('counts for the districts stored now (after an edit)', async () => {
    seed({ districtSlugs: ['ochota'] }, EXAMPLE_1);
    const { texts } = await tap('rm:c:counts');
    expect(texts).toEqual([
      'Кроме тебя, анкеты есть у: Ochota — 2 человека, готовы к любому району — 1. Всего в Варшаве — 5 человек. Подбор откроется, когда людей станет больше.',
    ]);
  });

  it('works on the card of an expired profile, which is not counted itself', async () => {
    seed({ status: 'expired', expiresAt: NOW, expiredAt: NOW }, EXAMPLE_1);
    const { texts } = await tap('rm:c:counts');
    expect(texts).toEqual([RU_GOLDEN]);
  });

  it('counts a profile past expires_at that the cron has not marked expired as not active', async () => {
    seed({}, [
      ...EXAMPLE_1,
      { id: 'P10', districts: ['wola'], expiresAt: NOW },
      { id: 'P11', districts: ['wola'], bannedAt: NOW },
    ]);
    const { texts } = await tap('rm:c:counts');
    expect(texts).toEqual([RU_GOLDEN]);
  });

  it('without a profile says it is deleted and counts nothing', async () => {
    seed(null, EXAMPLE_1);
    const { texts } = await tap('rm:c:counts');
    expect(texts).toEqual([rt('ru', 'alreadyDeleted')]);
    expect(db.prisma.roommateProfile.findMany).not.toHaveBeenCalled();
  });

  it('a hidden profile gets the FR-14 reply, not the counts', async () => {
    seed({ status: 'hidden' }, EXAMPLE_1);
    const { texts, reply } = await tap('rm:c:counts');
    expect(texts).toEqual([rt('ru', 'banned')]);
    const rows = (reply.mock.calls[0][1].reply_markup as { inline_keyboard: Button[][] })
      .inline_keyboard;
    expect(rows.map((row) => row.map((button) => button.callback_data))).toEqual([['rm:c:del']]);
    expect(db.prisma.roommateProfile.findMany).not.toHaveBeenCalled();
  });

  it('an old card while a new draft is open says the step is done and sends the step', async () => {
    seed({ ...DRAFT_AT_ADULT, step: 'budget' }, EXAMPLE_1);
    const { texts } = await tap('rm:c:counts');
    expect(texts).toEqual([rt('ru', 'stepDone'), rt('ru', 'askBudget')]);
    expect(db.prisma.roommateProfile.findMany).not.toHaveBeenCalled();
  });

  it('leaves out "matching opens later" once the switch is on', async () => {
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
    seed({}, EXAMPLE_1);
    const { texts } = await tap('rm:c:counts');
    expect(texts).toEqual([
      'Кроме тебя, анкеты есть у: Mokotów — 2 человека, Wola — 1, готовы к любому району — 1. Всего в Варшаве — 5 человек.',
    ]);
  });
});

describe('zero', () => {
  it.each<[RoommateLocale, string]>([
    ['ru', 'Кроме тебя, анкет пока ни у кого нет. Подбор откроется, когда людей станет больше.'],
    ['uk', 'Окрім тебе, анкет поки ні в кого немає. Підбір відкриється, коли людей стане більше.'],
    ['en', 'Besides you, nobody has a profile yet. Matching opens when there are more people.'],
  ])('the only profile in Warsaw reads "nobody else yet" in %s', async (locale, expected) => {
    seed(DRAFT_AT_ADULT, [
      { id: 'H', districts: ['mokotow'], status: 'hidden' },
      { id: 'B', districts: ['wola'], blockedAt: NOW },
    ]);
    const { last } = await tap('rm:a:yes', locale);
    expect(last).toBe(expected);
  });

  it('"nobody else yet" for a viewer with "any" too', async () => {
    seed({ districtSlugs: [], anyDistrict: true });
    const { texts } = await tap('rm:c:counts');
    expect(texts).toEqual([
      'Кроме тебя, анкет пока ни у кого нет. Подбор откроется, когда людей станет больше.',
    ]);
  });

  it.each<[RoommateLocale, string]>([
    [
      'ru',
      'Кроме тебя, анкеты есть у: Bielany — пока никого, Mokotów — 2 человека, готовых к любому району пока нет. Всего в Варшаве — 3 человека. Подбор откроется, когда людей станет больше.',
    ],
    [
      'uk',
      'Окрім тебе, анкети мають: Bielany — поки нікого, Mokotów — 2 людини, готових до будь-якого району поки немає. Усього у Варшаві — 3 людини. Підбір відкриється, коли людей стане більше.',
    ],
    [
      'en',
      'Besides you, people with a profile: Bielany (nobody yet), Mokotów 2, open to any district (nobody yet). In Warsaw 3 in total. Matching opens when there are more people.',
    ],
  ])('a district nobody else named reads "nobody yet" in %s', async (locale, expected) => {
    seed({ districtSlugs: ['bielany', 'mokotow'] }, [
      { id: 'A', districts: ['mokotow'] },
      { id: 'B', districts: ['mokotow', 'ochota'] },
      { id: 'C', districts: ['wola'] },
    ]);
    const { texts } = await tap('rm:c:counts', locale);
    expect(texts).toEqual([expected]);
  });

  it('a viewer with "any" among only "any" profiles gets the total without a district line', async () => {
    seed({ districtSlugs: [], anyDistrict: true }, [{ id: 'A', districts: 'any' }]);
    const { texts } = await tap('rm:c:counts');
    expect(texts).toEqual([
      'Кроме тебя, всего в Варшаве — 1 человек. Подбор откроется, когда людей станет больше.',
    ]);
  });

  it('names a district missing from the table by its slug, escaped', async () => {
    seed({ districtSlugs: ['old<slug>'] }, [{ id: 'A', districts: ['old<slug>'] }]);
    const { texts } = await tap('rm:c:counts');
    expect(texts[0]).toContain('old&lt;slug&gt; — 1 человек,');
  });
});

describe('the room cost reference (spec 06 §Room cost reference)', () => {
  const ROOM = '📊 <b>Для ориентира — комнаты</b>\n<b>Mokotów</b>:\n   …';

  it('follows the counts in the same message after the save', async () => {
    mocks.roomCostsReply.mockResolvedValue(ROOM);
    seed(DRAFT_AT_ADULT, EXAMPLE_1);
    const { reply, texts } = await tap('rm:a:yes');

    expect(texts).toHaveLength(2);
    expect(texts[1]).toBe(`${RU_GOLDEN}\n\n${ROOM}`);
    expect(reply.mock.calls[1][1]).toEqual(WITH_OPT_IN);
    expect(mocks.roomCostsReply).toHaveBeenCalledTimes(1);
    expect(mocks.roomCostsReply.mock.calls[0][0]).toMatchObject({
      districtSlugs: ['mokotow', 'wola'],
      anyDistrict: false,
    });
    expect(mocks.roomCostsReply.mock.calls[0][1]).toBe('ru');
  });

  it('follows the counts on "How many are looking?", for "any" and in the chat locale', async () => {
    mocks.roomCostsReply.mockResolvedValue(ROOM);
    seed({ districtSlugs: [], anyDistrict: true }, EXAMPLE_1);
    const { texts } = await tap('rm:c:counts', 'uk');

    expect(texts).toEqual([`${UK_ANY}\n\n${ROOM}`]);
    expect(mocks.roomCostsReply.mock.calls[0][0]).toMatchObject({ anyDistrict: true });
    expect(mocks.roomCostsReply.mock.calls[0][1]).toBe('uk');
  });

  it('follows "nobody else yet" too', async () => {
    mocks.roomCostsReply.mockResolvedValue(ROOM);
    seed({});
    const { texts } = await tap('rm:c:counts');
    expect(texts).toEqual([
      `Кроме тебя, анкет пока ни у кого нет. Подбор откроется, когда людей станет больше.\n\n${ROOM}`,
    ]);
  });

  it('is not loaded when the counts failed', async () => {
    mocks.roomCostsReply.mockResolvedValue(ROOM);
    seed({}, EXAMPLE_1);
    db.state.fail = new Error('timeout');
    const { texts } = await tap('rm:c:counts');
    expect(texts).toEqual([rt('ru', 'countsUnavailable')]);
    expect(mocks.roomCostsReply).not.toHaveBeenCalled();
  });

  it('is not loaded for a refused tap (no profile, hidden, draft)', async () => {
    for (const own of [null, { status: 'hidden' }, { ...DRAFT_AT_ADULT, step: 'budget' }]) {
      seed(own, EXAMPLE_1);
      await tap('rm:c:counts');
    }
    expect(mocks.roomCostsReply).not.toHaveBeenCalled();
  });
});

describe('a database error', () => {
  it('keeps the saved profile, sends the card and says the counts are not available now', async () => {
    seed(DRAFT_AT_ADULT, EXAMPLE_1);
    db.state.fail = new Error('connection refused');
    const { texts, reply } = await tap('rm:a:yes');

    expect(own()).toMatchObject({ status: 'active', step: null });
    expect(events()).toEqual(['tg_roommate_profile_created']);
    expect(texts).toHaveLength(2);
    expect(texts[0].startsWith(rt('ru', 'cardHeader'))).toBe(true);
    expect(texts[1]).toBe(rt('ru', 'countsUnavailable'));
    expect(reply.mock.calls[1][1]).toEqual({ parse_mode: 'HTML' });
  });

  it('logs only the error message, never the chat id, the username or the districts', async () => {
    seed(DRAFT_AT_ADULT, EXAMPLE_1);
    db.state.fail = new Error('connection refused');
    await tap('rm:a:yes');

    expect(errorLog).toHaveBeenCalledWith('[bot/roommate] counts failed', 'connection refused');
    expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(/4242|anna|chat-row|mokotow|P8/);
  });

  it.each<RoommateLocale>(['ru', 'uk', 'en'])(
    'on "How many are looking?" says so in %s',
    async (locale) => {
      seed({}, EXAMPLE_1);
      db.state.fail = new Error('timeout');
      const { texts } = await tap('rm:c:counts', locale);
      expect(texts).toEqual([rt(locale, 'countsUnavailable')]);
    },
  );

  it('the district names failing to load is the same error reply', async () => {
    seed({}, EXAMPLE_1);
    mocks.getCity.mockRejectedValue(new Error('districts down'));
    const { texts } = await tap('rm:c:counts');
    expect(texts).toEqual([rt('ru', 'countsUnavailable')]);
  });
});
