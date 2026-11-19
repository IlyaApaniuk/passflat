import type { RoommateProfile } from '@prisma/client';
import type { Api, Bot, Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The matching switch across the roommate flows (PRD 3 FR-23 criteria 2 – 3, spec 07 §Switch):
 * `/mate` (the own card's buttons and the intro), "Show people" (`rm:show:*`), "Interested"
 * (`rm:i:*`), the opt-in button, and the cron's stage 2 jobs, each with the switch on and off;
 * every stage 2 button with the switch off ("matching is paused" in RU / UK / EN, nothing else
 * changes); and turning the switch off again: stored reactions and sent reveals stay, the next
 * steps, the waiting reveals' retry and the outcome question keep working, and an opt-in made
 * after an earlier opening holds for the next one. The `/mate` line of the capability list in
 * both states is `bot.test.ts` (`/start`, `/help`).
 *
 * Commands and taps go through what `registerRoommateFlow` and `registerRoommateMatching`
 * register, the cron through `runRoommateDaily` with its default jobs, over one in-memory Prisma
 * fake whose reads apply their `where` and return copies. Telegram is a fake `api`; nothing
 * reaches Telegram, PostHog or a database.
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
        create: vi.fn(async ({ data }: { data: Row }) => {
          const row = { id: 'new-draft', districtSlugs: [], anyDistrict: false, ...data };
          state.profiles.push(row);
          return structuredClone(row);
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
import { rt, type RoommateLocale } from './roommate-texts';

/** 10:00 Warsaw in winter: the send hour of the roommate cron. */
const NOW = new Date('2026-12-05T09:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
/** The send hour 21 days later (`OUTCOME_QUESTION_DAYS`), still winter time. */
const DAY_21 = new Date(NOW.getTime() + 21 * DAY);
const EXPIRES = new Date(NOW.getTime() + 30 * DAY);
const LOCALES: RoommateLocale[] = ['ru', 'uk', 'en'];
const DISTRICTS = [{ slug: 'mokotow', nameKey: 'Mokotów' }];

/** "Matching is paused" as each locale reads it (spec 07 §Switch, agent draft). */
const PAUSED: Record<RoommateLocale, string> = {
  ru: 'Подбор сейчас на паузе.',
  uk: 'Підбір зараз на паузі.',
  en: 'Matching is paused right now.',
};

/** The switch values per state: only the exact string `true` is on (`switch.test.ts`). */
const STATES = [
  ['on', 'true'],
  ['off', ''],
] as const;

/** A profile id of the database's shape. */
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = uid(1);
const B = uid(2);
const C = uid(3);

/** The Telegram chat id of the chat of profile `id` (its `tg_<chatId>` identity). */
const tgChatOf = (id: string) => 7000 + Number(id.slice(-4));
const A_CHAT = tgChatOf(A);
const B_CHAT = tgChatOf(B);

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

/** Profiles in their own chats (RU unless named); Telegram knows the stored usernames. */
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

/** What Telegram's `getChat` says each chat's username is now (absent = none). */
let telegramUsernames = new Map<number, string | undefined>();

const row = (id: string) => db.state.profiles.find((r) => r.id === id)!;

/** Everything the database holds, to compare before and after. */
const snapshot = () => structuredClone(db.state);

const switchTo = (value: string) => vi.stubEnv('ROOMMATE_MATCHING_ENABLED', value);

type Button = { text: string; callback_data?: string };
type Options = { reply_markup?: { inline_keyboard: Button[][] }; parse_mode?: string };

const api = {
  sendMessage: vi.fn(async (_chatId: number, _text: string, _options?: Options) => ({})),
  getChat: vi.fn(async (chatId: number) => ({
    id: chatId,
    type: 'private' as const,
    ...(telegramUsernames.get(chatId) ? { username: telegramUsernames.get(chatId) } : {}),
  })),
};

const dataOf = (options?: Options) =>
  (options?.reply_markup?.inline_keyboard ?? []).map((r) => r.map((b) => b.callback_data));

/** Every message sent through `api.sendMessage`, in order, with its buttons' callback data. */
const sent = () =>
  api.sendMessage.mock.calls.map(([chatId, text, options]) => ({
    chatId,
    text,
    data: dataOf(options),
  }));

const events = () => mocks.track.mock.calls.map(([chatId, event]) => [chatId, event]);

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
}

type Who = { who?: string; locale?: RoommateLocale; username?: string | null };

function fakeContext(data: string | null, { who = A, locale = 'ru', username }: Who) {
  mocks.touchChat.mockResolvedValue({ id: `chat-${who}`, locale, isNew: false });
  const name = username === undefined ? (row(who)?.tgUsername as string | null) : username;
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
      options: options as Options | undefined,
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

/** `/mate` from the person of profile `who`. */
async function mate(who: Who = {}) {
  const { ctx, replies } = fakeContext(null, who);
  await COMMANDS.get('mate')!(ctx as unknown as Context);
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

const cardOf = (id: string) =>
  renderRoommateCard(row(id) as unknown as RoommateProfile, DISTRICTS, 'ru');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  switchTo('true');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://passflat.com');
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.getCity.mockResolvedValue({ districts: DISTRICTS });
  mocks.roomCostsReply.mockResolvedValue(null);
});

describe('/mate with the switch on and off', () => {
  const OWN_CARD_ROWS = {
    on: [['rm:c:edit', 'rm:c:del'], ['rm:show:c'], ['rm:push:off']],
    off: [['rm:c:edit', 'rm:c:del'], ['rm:c:counts'], ['rm:c:optin']],
  };

  it.each(STATES)(
    'switch %s: the own card has the buttons and state lines of it',
    async (state, value) => {
      switchTo(value);
      seed([profile(A)]);
      const [card, ...rest] = await mate();

      expect(rest).toEqual([]);
      expect(card.data).toEqual(OWN_CARD_ROWS[state]);
      const lines = card.text.split('\n');
      if (state === 'on') {
        expect(lines).toContain(rt('ru', 'cardPushOn'));
        expect(lines).not.toContain(rt('ru', 'cardOptInOff'));
        expect(lines).not.toContain(rt('ru', 'cardHiddenUntilOpen'));
      } else {
        expect(lines).toContain(rt('ru', 'cardOptInOff'));
        expect(lines).toContain(rt('ru', 'cardHiddenUntilOpen'));
        expect(lines).not.toContain(rt('ru', 'cardPushOn'));
      }
    },
  );

  it.each(LOCALES.flatMap((locale) => STATES.map(([state, value]) => [locale, state, value])))(
    '%s, switch %s: a new person gets the intro of that state, then the districts step',
    async (locale, state, value) => {
      switchTo(value);
      seed([]);
      const [intro, step] = await mate({ locale: locale as RoommateLocale, username: 'anna_w' });
      const privacyUrl = `https://passflat.com/${locale}/privacy?utm_source=telegram&amp;utm_medium=bot&amp;utm_campaign=roommate#roommate-matching`;

      expect(intro.text).toBe(
        rt(locale as RoommateLocale, state === 'on' ? 'introMatching' : 'intro', { privacyUrl }),
      );
      expect(step.text.startsWith(rt(locale as RoommateLocale, 'askDistricts').slice(0, 12))).toBe(
        true,
      );
    },
  );

  it.each<[RoommateLocale, string]>([
    [
      'ru',
      'Анкету видят только подходящие тебе люди, а твой username — только при взаимном интересе.',
    ],
    [
      'uk',
      'Анкету бачать лише люди, які тобі підходять, а твій username — лише за взаємного інтересу.',
    ],
    [
      'en',
      'Only people who fit you see your profile, and your username only when the interest is mutual.',
    ],
  ])('%s: the switch-on intro says who sees what instead of "nobody sees it"', (locale, line) => {
    const on = rt(locale, 'introMatching');
    const off = rt(locale, 'intro');
    expect(on).toContain(line);
    const [before, after] = on.split(line);
    // Everything around the one sentence is the PRD 3 §8 intro.
    expect(off.startsWith(before)).toBe(true);
    expect(off.endsWith(after)).toBe(true);
    expect(off).not.toContain(line);
  });
});

describe('"Show people" and "Interested" with the switch on and off', () => {
  it('switch on: rm:show shows a card, rm:i stores the interest', async () => {
    seed([profile(A), profile(B)]);
    const shown = await tap('rm:show:c');
    expect(shown.map((reply) => reply.text)).toEqual([cardOf(B)]);
    expect(shown[0].data).toEqual([[`rm:i:${B}`, `rm:x:${B}`], [`rm:r:${B}`]]);

    await tap(`rm:i:${B}`);
    expect(db.state.reactions).toMatchObject([
      { fromProfileId: A, toProfileId: B, kind: 'interest' },
    ]);
    expect(events()).toEqual([
      [A_CHAT, 'tg_roommate_cards_viewed'],
      [A_CHAT, 'tg_roommate_interest_sent'],
    ]);
  });

  it('switch off: both reply "matching is paused" and change nothing', async () => {
    switchTo('');
    seed([profile(A), profile(B)]);
    const before = snapshot();

    for (const data of ['rm:show:c', `rm:i:${B}`]) {
      const replies = await tap(data);
      expect(replies).toEqual([{ text: PAUSED.ru, options: undefined, data: [] }]);
    }
    expect(snapshot()).toEqual(before);
    expect(mocks.track).not.toHaveBeenCalled();
    expect(db.prisma.roommateReaction.createMany).not.toHaveBeenCalled();
    expect(db.prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('every stage 2 button with the switch off', () => {
  const STAGE_2_BUTTONS = [
    'rm:show',
    'rm:show:c',
    'rm:show:o',
    'rm:show:p',
    'rm:show:n',
    `rm:i:${B}`,
    `rm:x:${B}`,
    'rm:u:done',
    'rm:push:on',
  ];

  it.each(LOCALES.flatMap((locale) => STAGE_2_BUTTONS.map((data) => [data, locale])))(
    '%s replies "matching is paused" in %s and changes nothing else',
    async (data, locale) => {
      switchTo('');
      seed([profile(A, { pushOff: true }), profile(B)], { [A]: locale as RoommateLocale });
      const before = snapshot();
      const replies = await tap(data, { locale: locale as RoommateLocale });

      expect(replies).toEqual([
        { text: PAUSED[locale as RoommateLocale], options: undefined, data: [] },
      ]);
      expect(rt(locale as RoommateLocale, 'matchingPaused')).toBe(PAUSED[locale as RoommateLocale]);
      expect(snapshot()).toEqual(before);
      expect(mocks.track).not.toHaveBeenCalled();
      expect(api.sendMessage).not.toHaveBeenCalled();
    },
  );

  it.each(STAGE_2_BUTTONS)(
    '%s still stores a changed username (spec 07 §Usernames)',
    async (data) => {
      switchTo('');
      seed([profile(A, { tgUsername: null, pushOff: true }), profile(B)]);
      await tap(data, { username: 'anna_new' });

      expect(row(A).tgUsername).toBe('anna_new');
      expect(mocks.track).not.toHaveBeenCalled();
    },
  );

  it('a chat without a profile gets the same reply and nothing is created', async () => {
    switchTo('');
    seed([profile(B)]);
    db.state.chats.push({
      id: `chat-${A}`,
      chatId: BigInt(A_CHAT),
      blockedAt: null,
      roommateBannedAt: null,
      locale: 'ru',
    });
    const replies = await tap('rm:show:c', { username: 'anna_w' });

    expect(replies.map((reply) => reply.text)).toEqual([PAUSED.ru]);
    expect(db.state.profiles.map((r) => r.id)).toEqual([B]);
  });

  it('"Stop daily messages" is still honoured, so no push starts when the switch is back', async () => {
    switchTo('');
    seed([profile(A), profile(B)]);
    const replies = await tap('rm:push:off');

    expect(row(A).pushOff).toBe(true);
    expect(replies[0].text.startsWith(rt('ru', 'cardHeader'))).toBe(true);
    expect(events()).toEqual([[A_CHAT, 'tg_roommate_push_opted_out']]);
  });
});

describe('the opt-in button with the switch on and off', () => {
  it('switch off: under the counts; a tap stores the opt-in and confirms it', async () => {
    switchTo('');
    seed([profile(A), profile(B)]);
    const [counts] = await tap('rm:c:counts');
    expect(counts.data).toEqual([['rm:c:optin']]);

    const replies = await tap('rm:c:optin');
    expect(row(A).notifyOnOpenAt).toEqual(NOW);
    expect(replies.map((reply) => reply.text)).toEqual([
      `${rt('ru', 'optInConfirm')} ${rt('ru', 'optInClosing')}`,
    ]);
    expect(mocks.track.mock.calls).toEqual([
      [A_CHAT, 'tg_roommate_browse_opted_in', { already: false }],
    ]);
  });

  it('switch on: not under the counts; an old button stores nothing and gets the card', async () => {
    seed([profile(A), profile(B)]);
    const [counts] = await tap('rm:c:counts');
    expect(counts.data).toEqual([]);

    const replies = await tap('rm:c:optin');
    expect(row(A).notifyOnOpenAt).toBeNull();
    expect(replies.map((reply) => reply.data)).toEqual([
      [['rm:c:edit', 'rm:c:del'], ['rm:show:c'], ['rm:push:off']],
    ]);
    expect(mocks.track).not.toHaveBeenCalled();
  });
});

describe("the cron's stage 2 jobs with the switch on and off", () => {
  /** A opted in to the one-time message; C pushed yesterday; B came up since. */
  function seedDue() {
    seed([
      profile(A, { notifyOnOpenAt: new Date(NOW.getTime() - 5 * DAY) }),
      profile(B, { activatedAt: new Date(NOW.getTime() - DAY) }),
      profile(C, { lastPushAt: new Date(NOW.getTime() - 2 * DAY) }),
    ]);
  }

  it('switch on: the one-time message to A and the daily push to C', async () => {
    seedDue();
    await runCron();

    expect(sent().map(({ chatId, data }) => [chatId, data])).toEqual([
      [A_CHAT, [['rm:show:o']]],
      [tgChatOf(C), [['rm:show:p'], ['rm:push:off']]],
    ]);
    expect(row(A).notifiedOpenAt).toEqual(NOW);
    expect(row(C).lastPushAt).toEqual(NOW);
    expect(events()).toEqual([
      [A_CHAT, 'tg_roommate_open_notified'],
      [tgChatOf(C), 'tg_roommate_push_sent'],
    ]);
  });

  it.each(['', 'false', 'TRUE', '1'])('switch "%s": neither job sends or writes', async (value) => {
    switchTo(value);
    seedDue();
    const before = snapshot();
    await runCron();

    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(before);
  });
});

describe('turning the switch off again', () => {
  /**
   * With the switch on: A got the one-time message, A and B formed a pair (B's interest first)
   * and both reveals went out; A skipped C. Then the switch goes off.
   */
  async function matchedThenOff() {
    seed([
      profile(A, { notifyOnOpenAt: new Date(NOW.getTime() - 5 * DAY), notifiedOpenAt: NOW }),
      profile(B, { pushOff: true }),
      profile(C, { pushOff: true }),
    ]);
    await tap(`rm:x:${C}`);
    await tap(`rm:i:${A}`, { who: B });
    await tap(`rm:i:${B}`);
    expect(sent().map(({ chatId }) => chatId)).toEqual([B_CHAT, A_CHAT]);
    switchTo('');
    vi.clearAllMocks();
  }

  it('keeps every stored reaction and the sent reveals; new cards stop', async () => {
    await matchedThenOff();
    const reactions = structuredClone(db.state.reactions);
    expect(reactions).toMatchObject([
      { fromProfileId: A, toProfileId: C, kind: 'skip' },
      { fromProfileId: B, toProfileId: A, kind: 'interest', matchedAt: NOW, revealedAt: NOW },
      { fromProfileId: A, toProfileId: B, kind: 'interest', matchedAt: NOW, revealedAt: NOW },
    ]);

    for (const data of ['rm:show:c', `rm:i:${C}`, `rm:x:${B}`]) {
      expect((await tap(data)).map((reply) => reply.text)).toEqual([PAUSED.ru]);
    }
    await runCron();
    await runCron(new Date(NOW.getTime() + DAY));

    expect(db.state.reactions).toEqual(reactions);
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('the next steps under a sent reveal still answer', async () => {
    await matchedThenOff();
    const replies = await tap('rm:ns:cost', { who: B });

    expect(replies.map((reply) => reply.text)).toEqual([
      rt('ru', 'nextStepCost', {
        url: 'https://passflat.com/ru/warsaw/costs?utm_source=telegram&amp;utm_medium=bot&amp;utm_campaign=roommate',
      }),
    ]);
    expect(mocks.track.mock.calls).toEqual([[B_CHAT, 'tg_roommate_next_step', { step: 'cost' }]]);
  });

  it('the outcome question still goes at day 21 and its answer is stored', async () => {
    await matchedThenOff();
    await runCron(DAY_21);

    expect(sent().map(({ chatId, text }) => [chatId, text])).toEqual([
      [A_CHAT, rt('ru', 'outcomeQuestion')],
      [B_CHAT, rt('ru', 'outcomeQuestion')],
    ]);
    const replies = await tap('rm:o:talking', { who: B });
    expect(row(B).outcome).toBe('talking');
    expect(replies.map((reply) => reply.text)).toEqual([rt('ru', 'reasonThanks')]);
    expect(mocks.track.mock.calls.at(-1)).toEqual([
      B_CHAT,
      'tg_roommate_outcome',
      { outcome: 'talking', asked: 'follow_up' },
    ]);
  });

  it('a reveal formed before and waiting on a username goes out once Done stores it', async () => {
    seed([profile(A), profile(B, { tgUsername: null })]);
    telegramUsernames.delete(B_CHAT);
    await tap(`rm:i:${A}`, { who: B, username: null });
    await tap(`rm:i:${B}`);
    expect(sent().map(({ chatId }) => chatId)).toEqual([B_CHAT]);
    expect(sent()[0].text).toBe(rt('ru', 'usernamePromptReveal'));
    switchTo('');
    vi.clearAllMocks();

    telegramUsernames.set(B_CHAT, 'bo_new');
    const replies = await tap('rm:u:done', { who: B, username: 'bo_new' });
    expect(replies.map((reply) => reply.text)).toEqual([PAUSED.ru]);
    expect(row(B).tgUsername).toBe('bo_new');
    expect(api.sendMessage).not.toHaveBeenCalled();

    // The send-hour retry of waiting reveals runs with the switch off too (spec 06 §Daily cron).
    await runCron(new Date(NOW.getTime() + DAY));
    expect(sent().map(({ chatId }) => chatId)).toEqual([B_CHAT, A_CHAT]);
    expect(sent()[0].text).toContain('@user_01');
    expect(sent()[1].text).toContain('@bo_new');
  });

  it('a person told at the earlier opening can opt in again, and the next opening tells them once', async () => {
    await matchedThenOff();
    const [card] = await mate();
    expect(card.text.split('\n')).toContain(rt('ru', 'cardOptInOff'));
    expect(card.data.at(-1)).toEqual(['rm:c:optin']);

    const later = new Date(NOW.getTime() + 2 * DAY);
    vi.setSystemTime(later);
    const replies = await tap('rm:c:optin');
    expect(replies.map((reply) => reply.text)).toEqual([
      `${rt('ru', 'optInConfirm')} ${rt('ru', 'optInClosing')}`,
    ]);
    expect(row(A)).toMatchObject({ notifyOnOpenAt: later, notifiedOpenAt: null });
    expect(mocks.track.mock.calls).toEqual([
      [A_CHAT, 'tg_roommate_browse_opted_in', { already: false }],
    ]);
    const [again] = await mate();
    expect(again.text.split('\n')).toContain(rt('ru', 'cardOptInOn'));
    expect(again.data.at(-1)).toEqual(['rm:c:optout']);

    await runCron(new Date(NOW.getTime() + 3 * DAY));
    expect(api.sendMessage).not.toHaveBeenCalled();

    switchTo('true');
    const reopened = new Date(NOW.getTime() + 4 * DAY);
    await runCron(reopened);
    await runCron(new Date(reopened.getTime() + 20 * 60 * 1000));
    const toA = sent().filter(({ chatId }) => chatId === A_CHAT);
    expect(toA.map(({ data }) => data)).toEqual([[['rm:show:o']]]);
    expect(row(A).notifiedOpenAt).toEqual(reopened);
  });

  it('an opt-in still waiting stays "already on" and is not moved', async () => {
    switchTo('');
    const optedIn = new Date(NOW.getTime() - 5 * DAY);
    seed([profile(A, { notifyOnOpenAt: optedIn })]);
    const replies = await tap('rm:c:optin');

    expect(replies.map((reply) => reply.text)).toEqual([
      `${rt('ru', 'optInAlready')} ${rt('ru', 'optInConfirm')} ${rt('ru', 'optInClosing')}`,
    ]);
    expect(row(A)).toMatchObject({ notifyOnOpenAt: optedIn, notifiedOpenAt: null });
  });
});
