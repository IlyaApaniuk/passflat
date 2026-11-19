import { Prisma, type RoommateProfile } from '@prisma/client';
import type { Bot, Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cards one at a time (PRD 3 FR-25, spec 07 §Cards): "Show people" (`rm:show:<via>`) with the
 * switch on and off, the card's content and buttons, "That's everyone for now", Skip
 * (`rm:x:<id>`), a card button for a profile no longer visible, the username prompt and its Done
 * (`rm:u:done`), and the events `tg_roommate_cards_viewed`, `tg_roommate_username_prompted` and
 * `tg_roommate_username_set`. "Interested" (`rm:i:<id>`, spec 07 §Interest and mutual match,
 * FR-26, FR-28): the daily limit, the stored interest and `tg_roommate_interest_sent`, the mutual
 * match (`formMutualMatch`'s `$executeRaw`, applied in memory or its result mocked) and
 * `tg_roommate_matched`. Taps go through the handlers `registerRoommateFlow` and
 * `registerRoommateMatching` register, over an in-memory Prisma fake whose reads apply their
 * `where` (the chat, reaction and report relations included) and return copies. The clock is
 * fake; nothing reaches Telegram, PostHog or a database.
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

  /** `relation: { none: {...} }`: the table and the field that points at the profile. */
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
      if (key in RELATIONS) {
        const { none, ...rest } = cond as { none?: Where };
        if (!none || Object.keys(rest).length) throw new Error(`only none on ${key}`);
        const [table, own] = RELATIONS[key];
        return !state[table].some((item) => item[own] === row.id && matches(item, none));
      }
      const value = row[key];
      if (cond === null) return value === null;
      if (cond instanceof Date) return time(value) === cond.getTime();
      if (typeof cond === 'object') {
        const { not, gt, ...rest } = cond as { not?: unknown; gt?: Date };
        if (Object.keys(rest).length) throw new Error(`unsupported filter on ${key}`);
        if ('not' in (cond as object) && value === not) return false;
        if (gt && !(time(value) > gt.getTime())) return false;
        return true;
      }
      return value === cond;
    });
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
      },
      roommateProfile: {
        findUnique: vi.fn(async ({ where }: { where: { chatId: string } }) => {
          const row = state.profiles.find((profile) => profile.chatId === where.chatId);
          return row ? structuredClone(row) : null;
        }),
        findMany: vi.fn(async ({ where }: { where: Where }) =>
          state.profiles.filter((row) => matches(row, where)).map((row) => structuredClone(row)),
        ),
        findFirst: vi.fn(async ({ where }: { where: Where }) => {
          const row = state.profiles.find((profile) => matches(profile, where));
          return row ? structuredClone(row) : null;
        }),
        updateMany: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
          const hits = state.profiles.filter((row) => matches(row, where));
          for (const row of hits) Object.assign(row, structuredClone(data));
          return { count: hits.length };
        }),
        create: vi.fn(async ({ data }: { data: Row }) => {
          const row = { id: 'new-draft', districtSlugs: [], anyDistrict: false, ...data };
          state.profiles.push(row);
          return structuredClone(row);
        }),
      },
      roommateReaction: {
        createMany: vi.fn(async ({ data }: { data: Row[]; skipDuplicates: boolean }) => {
          let count = 0;
          for (const item of data) {
            const exists = state.reactions.some(
              (r) => r.fromProfileId === item.fromProfileId && r.toProfileId === item.toProfileId,
            );
            if (!exists) {
              state.reactions.push({ ...item });
              count += 1;
            }
          }
          return { count };
        }),
        count: vi.fn(
          async ({ where }: { where: Where }) =>
            state.reactions.filter((row) => matches(row, where)).length,
        ),
        /** The pair reads of the reveal (`loadMatchedPair`, `pendingRevealPartners`). */
        findMany: vi.fn(async ({ where, include }: { where: Where; include?: Row }) =>
          state.reactions
            .filter((row) => matches(row, where))
            .map((row) => {
              const copy = structuredClone(row);
              if (!include) return copy;
              const from = state.profiles.find((p) => p.id === row.fromProfileId)!;
              return { ...copy, fromProfile: { ...structuredClone(from), chat: chatOf(from) } };
            }),
        ),
      },
      /**
       * The mutual-match statement (`formMutualMatch`), applied in memory: its values are the two
       * profile ids twice and the time; both unmatched `interest` rows of the pair → both matched,
       * 2 rows changed, else 0.
       */
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
  /** The reveal itself is `roommate-reveal.test.ts`; here only what the tap decides from it. */
  revealPair: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }));
vi.mock('./store', () => ({ touchChat: mocks.touchChat }));
vi.mock('./analytics', () => ({ track: mocks.track }));
vi.mock('./deposit-flow', () => ({ hasOpenIntake: mocks.hasOpenIntake }));
vi.mock('./lookup', () => ({ getCity: mocks.getCity }));
vi.mock('./roommate-room-costs', () => ({ roomCostsReply: mocks.roomCostsReply }));
vi.mock('./roommate-reveal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./roommate-reveal')>()),
  revealPair: mocks.revealPair,
}));

import { registerRoommateFlow } from './roommate-flow';
import { registerRoommateMatching, renderRoommateCard } from './roommate-matching';
import { rt } from './roommate-texts';
import type { BotLocale } from './texts';

const CHAT_ID = 4242;
const CHAT_ROW = 'chat-row';
const NOW = new Date('2026-12-05T10:00:00Z');
const LATER = new Date('2027-01-04T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const LOCALES: BotLocale[] = ['ru', 'uk', 'en'];

const DISTRICTS = [
  { slug: 'mokotow', nameKey: 'Mokotów' },
  { slug: 'ochota', nameKey: 'Ochota' },
  { slug: 'wola', nameKey: 'Wola' },
];

/** A profile id of the database's shape. */
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const VIEWER = uid(1);
const A = uid(2);
const B = uid(3);

function profile(fields: Partial<RoommateProfile> = {}): RoommateProfile {
  return {
    id: VIEWER,
    chatId: CHAT_ROW,
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
    tgUsername: 'anna_w',
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
}

/** Another person's profile in its own chat, activated `daysAgo` before NOW. */
function person(id: string, daysAgo: number, fields: Partial<RoommateProfile> = {}): Row {
  return profile({
    id,
    chatId: `chat-${id}`,
    tgUsername: `user_${id.slice(-2)}`,
    activatedAt: new Date(NOW.getTime() - daysAgo * DAY),
    ...fields,
  }) as unknown as Row;
}

/** The Telegram chat id of the chat of profile `id` (its `tg_<chatId>` identity). */
const tgChatOf = (id: string) => 7000 + Number(id.slice(-4));

/** The viewer's chat with its profile (none for null), and the other people with their chats. */
function seed(own: Partial<RoommateProfile> | null, others: Row[] = []) {
  db.state.chats = [
    { id: CHAT_ROW, chatId: BigInt(CHAT_ID), blockedAt: null, roommateBannedAt: null },
    ...others.map((row) => ({
      id: row.chatId,
      chatId: BigInt(tgChatOf(row.id as string)),
      blockedAt: null,
      roommateBannedAt: null,
    })),
  ];
  db.state.profiles = [...others];
  if (own) db.state.profiles.push(profile(own) as unknown as Row);
  db.state.reactions = [];
  db.state.reports = [];
}

const own = () => db.state.profiles.find((row) => row.chatId === CHAT_ROW);
const chatOfProfile = (id: string) => db.state.chats.find((chat) => chat.id === `chat-${id}`)!;

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

type Button = { text: string; callback_data?: string };
type Options = { reply_markup?: { inline_keyboard: Button[][] }; parse_mode?: string } | undefined;

/** A tap on a button with `data`, routed to the one handler registered for it. */
async function tap(
  data: string,
  { locale = 'ru', username = 'anna_w' }: { locale?: BotLocale; username?: string | null } = {},
) {
  mocks.touchChat.mockResolvedValue({ id: CHAT_ROW, locale, isNew: false });
  const routes = ROUTES.filter(([trigger]) =>
    typeof trigger === 'string' ? trigger === data : trigger.test(data),
  );
  expect(routes, `routes for ${data}`).toHaveLength(1);
  const [trigger, handler] = routes[0];
  const reply = vi.fn().mockResolvedValue({});
  const ctx = {
    chat: { id: CHAT_ID },
    from: username === null ? { id: CHAT_ID } : { id: CHAT_ID, username },
    callbackQuery: { id: 'q', data },
    match: typeof trigger === 'string' ? data : data.match(trigger),
    reply,
    answerCallbackQuery: vi.fn().mockResolvedValue(true),
  } as unknown as Context;
  await handler(ctx);
  return reply.mock.calls.map(([text, options]) => {
    const rows = (options as Options)?.reply_markup?.inline_keyboard ?? [];
    return {
      text: text as string,
      options: options as Options,
      data: rows.map((row) => row.map((button) => button.callback_data)),
      labels: rows.map((row) => row.map((button) => button.text)),
    };
  });
}

/** The card of profile `id` as the viewer gets it, from the stored row. */
function cardOf(id: string, locale: BotLocale = 'ru'): string {
  const row = db.state.profiles.find((profileRow) => profileRow.id === id)!;
  return renderRoommateCard(row as unknown as RoommateProfile, DISTRICTS, locale);
}

const cardButtons = (id: string) => [[`rm:i:${id}`, `rm:x:${id}`], [`rm:r:${id}`]];

/** Amounts on bot cards group thousands with a no-break space ("1 600"). */
const nb = (text: string) => text.replace(/(\d) (\d)/g, `$1${String.fromCharCode(0xa0)}$2`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.getCity.mockResolvedValue({ districts: DISTRICTS });
  mocks.roomCostsReply.mockResolvedValue(null);
  mocks.revealPair.mockResolvedValue(new Set());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('renderRoommateCard', () => {
  const FULL = profile({
    districtSlugs: ['mokotow', 'wola'],
    budgetBand: 'b3',
    languages: ['en', 'ru'],
    gender: 'woman',
    prefers: 'women',
    about: 'Тихая, работаю в IT <3 & кот',
    smoking: 'outside',
    pets: 'have',
    tgUsername: 'anna_w',
  });

  it('shows the listed fields only, in the order of the intake', () => {
    expect(renderRoommateCard(FULL, DISTRICTS, 'en').split('\n')).toEqual([
      '👤 <b>Profile</b>',
      '',
      'Districts: Mokotów, Wola',
      nb('Budget per person: 1 600 – 1 999 zł'),
      'Move-in: February 2027',
      'Languages: English, Russian',
      'About: Тихая, работаю в IT &lt;3 &amp; кот',
      'Smoking: Outside only',
      'Pets: I have a pet',
    ]);
    expect(renderRoommateCard(FULL, DISTRICTS, 'ru')).toContain('Районы: Mokotów, Wola');
    expect(renderRoommateCard(FULL, DISTRICTS, 'uk')).toContain('Про себе: Тихая');
  });

  it.each(LOCALES)('never shows gender, "live with", the username or an id (%s)', (locale) => {
    const text = renderRoommateCard(FULL, DISTRICTS, locale);
    const hidden = [
      rt(locale, 'cardGender', { value: '' }).trim(),
      rt(locale, 'cardPrefers', { value: '' }).trim(),
      rt(locale, 'cardPrivateNote'),
      rt(locale, 'btnWoman'),
      rt(locale, 'btnMan'),
      rt(locale, 'btnPrefersAnyone'),
      rt(locale, 'btnPrefersWomen'),
      rt(locale, 'btnPrefersMen'),
      rt(locale, 'cardGenderNone'),
      'anna_w',
      '@',
      FULL.id,
      FULL.chatId,
    ];
    for (const value of hidden) expect(text, value).not.toContain(value);
  });

  it('leaves out an unanswered text and house rules, and writes "any district"', () => {
    const text = renderRoommateCard(profile({ anyDistrict: true, districtSlugs: [] }), [], 'en');
    expect(text.split('\n').slice(2)).toEqual([
      'Districts: any',
      nb('Budget per person: 1 600 – 1 999 zł'),
      'Move-in: February 2027',
      'Languages: Russian',
    ]);
  });
});

describe('rm:show with the switch on', () => {
  it('shows one card of the newest compatible profile with Interested, Skip and Report', async () => {
    seed({}, [
      person(A, 5),
      // Activated earlier but renewed later: `coalesce(renewed_at, activated_at)` puts it first.
      person(B, 20, { renewedAt: new Date(NOW.getTime() - DAY), about: '<b>hi</b>' }),
      person(uid(4), 1, { districtSlugs: ['wola'] }),
    ]);

    const replies = await tap('rm:show:c');

    expect(replies).toHaveLength(1);
    expect(replies[0].text).toBe(cardOf(B));
    expect(replies[0].text).toContain('О себе: &lt;b&gt;hi&lt;/b&gt;');
    expect(replies[0].options?.parse_mode).toBe('HTML');
    expect(replies[0].data).toEqual(cardButtons(B));
    expect(replies[0].labels).toEqual([
      [rt('ru', 'btnInterested'), rt('ru', 'btnCardSkip')],
      [rt('ru', 'btnReport')],
    ]);
    expect(mocks.track.mock.calls).toEqual([
      [CHAT_ID, 'tg_roommate_cards_viewed', { results_band: '1-2', via: 'card' }],
    ]);
  });

  it.each([
    ['rm:show:c', 'card'],
    ['rm:show:o', 'open_message'],
    ['rm:show:p', 'push'],
    ['rm:show:n', 'next'],
    ['rm:show', 'card'],
  ])('sends one tg_roommate_cards_viewed for %s with via=%s', async (data, via) => {
    seed({}, [person(A, 5)]);
    await tap(data);
    expect(mocks.track.mock.calls).toEqual([
      [CHAT_ID, 'tg_roommate_cards_viewed', { results_band: '1-2', via }],
    ]);
  });

  it.each([
    [0, '0'],
    [1, '1-2'],
    [2, '1-2'],
    [3, '3-5'],
    [5, '3-5'],
    [6, '6+'],
  ])('puts %i compatible profiles into results_band %s', async (n, band) => {
    seed(
      {},
      Array.from({ length: n }, (_, i) => person(uid(10 + i), i + 1)),
    );
    await tap('rm:show:p');
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(mocks.track.mock.calls[0][2]).toEqual({ results_band: band, via: 'push' });
  });

  it('never shows a profile that is reacted to, skipped the viewer, reported, inactive or incompatible', async () => {
    const ids = Array.from({ length: 11 }, (_, i) => uid(20 + i));
    seed({}, [
      person(ids[0], 1),
      person(ids[1], 1),
      person(ids[2], 1),
      person(ids[3], 1),
      person(ids[4], 1),
      person(ids[5], 1),
      person(ids[6], 1, { expiresAt: new Date(NOW.getTime() - 1000) }),
      person(ids[7], 1, { status: 'expired' }),
      person(ids[8], 1, { status: 'hidden' }),
      person(ids[9], 1, { status: 'draft' }),
      person(ids[10], 1, { budgetBand: 'b5' }),
    ]);
    db.state.reactions.push(
      { fromProfileId: VIEWER, toProfileId: ids[0], kind: 'interest' },
      { fromProfileId: ids[1], toProfileId: VIEWER, kind: 'skip' },
    );
    db.state.reports.push(
      { reporterProfileId: VIEWER, targetProfileId: ids[2] },
      { reporterProfileId: ids[3], targetProfileId: VIEWER },
    );
    chatOfProfile(ids[4]).blockedAt = NOW;
    chatOfProfile(ids[5]).roommateBannedAt = NOW;

    const replies = await tap('rm:show:c');

    expect(replies).toHaveLength(1);
    expect(replies[0].text.startsWith(rt('ru', 'browseNoneLeft'))).toBe(true);
    expect(mocks.track.mock.calls[0][2]).toEqual({ results_band: '0', via: 'card' });
  });

  it.each(LOCALES)(
    'says "That\'s everyone for now" with the daily-message state when none is left (%s)',
    async (locale) => {
      seed({}, []);
      const [reply] = await tap('rm:show:c', { locale });
      expect(reply.text).toBe(`${rt(locale, 'browseNoneLeft')}\n\n${rt(locale, 'cardPushOn')}`);
      expect(reply.data).toEqual([['rm:show:n'], ['rm:push:off']]);
      expect(reply.labels).toEqual([[rt(locale, 'btnShowPeople')], [rt(locale, 'btnPushOff')]]);
    },
  );

  it('shows the daily messages as off, with the toggle back on, when they are off', async () => {
    seed({ pushOff: true }, []);
    const [reply] = await tap('rm:show:c');
    expect(reply.text).toBe(`${rt('ru', 'browseNoneLeft')}\n\n${rt('ru', 'cardPushOff')}`);
    expect(reply.data).toEqual([['rm:show:n'], ['rm:push:on']]);
  });

  it('without a profile says "create a profile first" and starts the intake', async () => {
    seed(null, [person(A, 5)]);
    const replies = await tap('rm:show:o');

    expect(replies[0].text).toBe(rt('ru', 'browseCreateFirst'));
    expect(replies[1].text.startsWith(rt('ru', 'intro').slice(0, 30))).toBe(true);
    expect(replies[2].text).toBe(rt('ru', 'askDistricts', { max: '3' }));
    expect(replies).toHaveLength(3);
    expect(own()).toMatchObject({ status: 'draft', step: 'districts', entrySource: 'bot_menu' });
    expect(mocks.track.mock.calls).toEqual([
      [CHAT_ID, 'tg_roommate_flow_started', { entry_source: 'bot_menu' }],
    ]);
  });

  it('gives a banned chat without a profile only the FR-14 reply', async () => {
    seed(null, [person(A, 5)]);
    db.state.chats[0].roommateBannedAt = NOW;
    const replies = await tap('rm:show:c');
    expect(replies.map((reply) => reply.text)).toEqual([rt('ru', 'banned')]);
    expect(own()).toBeUndefined();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('gives a hidden profile the FR-14 reply with its delete button', async () => {
    seed({ status: 'hidden' }, [person(A, 5)]);
    const replies = await tap('rm:show:c');
    expect(replies).toHaveLength(1);
    expect(replies[0].text).toBe(rt('ru', 'banned'));
    expect(replies[0].data).toEqual([['rm:c:del']]);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('gives a draft its current step', async () => {
    seed({ status: 'draft', step: 'budget', activatedAt: null, expiresAt: null }, [person(A, 5)]);
    const replies = await tap('rm:show:c');
    expect(replies).toHaveLength(1);
    expect(replies[0].text).toBe(rt('ru', 'askBudget'));
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it.each([
    ['marked expired', { status: 'expired', expiredAt: new Date(NOW.getTime() - DAY) }],
    ['past its hide date, not yet marked', { expiresAt: new Date(NOW.getTime() - 1000) }],
  ])('asks a profile %s to renew to keep browsing', async (_name, fields) => {
    seed(fields as Partial<RoommateProfile>, [person(A, 5)]);
    const replies = await tap('rm:show:c');
    expect(replies).toHaveLength(1);
    expect(replies[0].text).toBe(rt('ru', 'browseRenew'));
    expect(replies[0].data).toEqual([['rm:c:renew']]);
    expect(replies[0].labels).toEqual([[rt('ru', 'btnRenew')]]);
    expect(mocks.track).not.toHaveBeenCalled();
  });
});

describe('the username prompt (spec 07 §Usernames, context browse)', () => {
  it.each(LOCALES)(
    'asks for a Telegram username with Done and shows no card (%s)',
    async (locale) => {
      seed({}, [person(A, 5)]);
      const replies = await tap('rm:show:p', { locale, username: null });

      expect(replies).toHaveLength(1);
      expect(replies[0].text).toBe(rt(locale, 'usernamePromptBrowse'));
      expect(replies[0].data).toEqual([['rm:u:done']]);
      expect(replies[0].labels).toEqual([[rt(locale, 'btnDone')]]);
      expect(own()?.tgUsername).toBeNull();
      expect(mocks.track.mock.calls).toEqual([
        [CHAT_ID, 'tg_roommate_cards_viewed', { results_band: '1-2', via: 'push' }],
        [CHAT_ID, 'tg_roommate_username_prompted', { context: 'browse' }],
      ]);
    },
  );

  it('Done that finds a username stores it, sends tg_roommate_username_set and the card', async () => {
    seed({ tgUsername: null }, [person(A, 5)]);
    const replies = await tap('rm:u:done', { username: 'new_name' });

    expect(own()?.tgUsername).toBe('new_name');
    expect(replies.map((reply) => reply.text)).toEqual([cardOf(A)]);
    expect(replies[0].data).toEqual(cardButtons(A));
    expect(mocks.track.mock.calls).toEqual([
      [CHAT_ID, 'tg_roommate_username_set', { context: 'browse' }],
    ]);
  });

  it('Done without a username asks again', async () => {
    seed({ tgUsername: null }, [person(A, 5)]);
    const replies = await tap('rm:u:done', { username: null });

    expect(replies.map((reply) => reply.text)).toEqual([rt('ru', 'usernamePromptBrowse')]);
    expect(mocks.track.mock.calls).toEqual([
      [CHAT_ID, 'tg_roommate_username_prompted', { context: 'browse' }],
    ]);
  });
});

/** A card's profile that a button tap must refuse (spec 07 §Cards, the visibility rule). */
const TARGET = uid(40);
const UNAVAILABLE: [string, (id: string) => void][] = [
  ['a deleted profile', (id) => (db.state.profiles = db.state.profiles.filter((r) => r.id !== id))],
  ['a hidden profile', (id) => Object.assign(row(id), { status: 'hidden' })],
  ['an expired profile', (id) => Object.assign(row(id), { status: 'expired' })],
  ['a profile past its hide date', (id) => Object.assign(row(id), { expiresAt: NOW })],
  ['a blocked chat', (id) => (chatOfProfile(id).blockedAt = NOW)],
  ['a banned chat', (id) => (chatOfProfile(id).roommateBannedAt = NOW)],
  [
    'a profile the viewer reported',
    (id) => db.state.reports.push({ reporterProfileId: VIEWER, targetProfileId: id }),
  ],
  [
    'a profile that reported the viewer',
    (id) => db.state.reports.push({ reporterProfileId: id, targetProfileId: VIEWER }),
  ],
  [
    'a profile the viewer is interested in',
    (id) => db.state.reactions.push({ fromProfileId: VIEWER, toProfileId: id, kind: 'interest' }),
  ],
  [
    'a profile that skipped the viewer',
    (id) => db.state.reactions.push({ fromProfileId: id, toProfileId: VIEWER, kind: 'skip' }),
  ],
  ['a profile no longer compatible', (id) => Object.assign(row(id), { languages: ['pl'] })],
];

describe('Skip (rm:x:<id>)', () => {
  it('stores one skip reaction and sends the next card, with no event', async () => {
    seed({}, [person(A, 5), person(B, 1)]);
    const replies = await tap(`rm:x:${B}`);

    expect(db.state.reactions).toEqual([{ fromProfileId: VIEWER, toProfileId: B, kind: 'skip' }]);
    expect(db.prisma.roommateReaction.createMany).toHaveBeenCalledWith({
      data: [{ fromProfileId: VIEWER, toProfileId: B, kind: 'skip' }],
      skipDuplicates: true,
    });
    expect(replies.map((reply) => reply.text)).toEqual([cardOf(A)]);
    expect(replies[0].data).toEqual(cardButtons(A));
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('never shows the skipped profile again', async () => {
    seed({}, [person(A, 5), person(B, 1)]);
    await tap(`rm:x:${B}`);
    const [reply] = await tap('rm:show:c');
    expect(reply.text).toBe(cardOf(A));
  });

  it('says "That\'s everyone for now" after the last card', async () => {
    seed({}, [person(A, 5)]);
    const replies = await tap(`rm:x:${A}`);
    expect(replies).toHaveLength(1);
    expect(replies[0].text.startsWith(rt('ru', 'browseNoneLeft'))).toBe(true);
  });

  it('a repeat changes nothing: "no longer available" and the next card', async () => {
    seed({}, [person(A, 5), person(B, 1)]);
    await tap(`rm:x:${B}`);
    const replies = await tap(`rm:x:${B}`);

    expect(replies.map((reply) => reply.text)).toEqual([rt('ru', 'browseUnavailable'), cardOf(A)]);
    expect(db.state.reactions).toHaveLength(1);
    expect(db.prisma.roommateReaction.createMany).toHaveBeenCalledTimes(1);
  });

  it.each(UNAVAILABLE)(
    'for %s replies "no longer available" and the next card',
    async (_name, change) => {
      seed({}, [person(A, 5), person(TARGET, 1)]);
      change(TARGET);
      const before = structuredClone(db.state.reactions);

      const replies = await tap(`rm:x:${TARGET}`);

      expect(replies.map((reply) => reply.text)).toEqual([
        rt('ru', 'browseUnavailable'),
        cardOf(A),
      ]);
      expect(replies[1].data).toEqual(cardButtons(A));
      expect(db.state.reactions).toEqual(before);
      expect(db.prisma.roommateReaction.createMany).not.toHaveBeenCalled();
      expect(mocks.track).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['an id of the wrong shape', 'not-a-uuid'],
    ['the viewer itself', VIEWER],
  ])('never trusts %s from the callback', async (_name, id) => {
    seed({}, [person(A, 5)]);
    const replies = await tap(`rm:x:${id}`);

    expect(replies.map((reply) => reply.text)).toEqual([rt('ru', 'browseUnavailable'), cardOf(A)]);
    expect(db.prisma.roommateProfile.findFirst).not.toHaveBeenCalled();
    expect(db.prisma.roommateReaction.createMany).not.toHaveBeenCalled();
  });

  it('without a username stores the skip and asks for one instead of the next card', async () => {
    seed({}, [person(A, 5), person(B, 1)]);
    const replies = await tap(`rm:x:${B}`, { username: null });

    expect(db.state.reactions).toHaveLength(1);
    expect(replies.map((reply) => reply.text)).toEqual([rt('ru', 'usernamePromptBrowse')]);
    expect(mocks.track.mock.calls).toEqual([
      [CHAT_ID, 'tg_roommate_username_prompted', { context: 'browse' }],
    ]);
  });
});

describe('Interested (rm:i:<id>), the daily limit and the mutual match', () => {
  const HOUR = 60 * 60 * 1000;
  const interest = (from: string, to: string, createdAt = new Date(NOW.getTime() - HOUR)) => ({
    fromProfileId: from,
    toProfileId: to,
    kind: 'interest',
    createdAt,
    matchedAt: null,
  });
  /** `n` interests of the viewer stored within the last 24 hours, to profiles not on any card. */
  const recentInterests = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      interest(VIEWER, uid(100 + i), new Date(NOW.getTime() - (i + 1) * HOUR)),
    );

  it('stores a one-sided interest, sends tg_roommate_interest_sent and the next card', async () => {
    seed({}, [person(A, 5), person(B, 1)]);
    const replies = await tap(`rm:i:${B}`);

    expect(db.prisma.roommateReaction.createMany).toHaveBeenCalledWith({
      data: [{ fromProfileId: VIEWER, toProfileId: B, kind: 'interest', createdAt: NOW }],
      skipDuplicates: true,
    });
    expect(db.state.reactions).toEqual([
      { fromProfileId: VIEWER, toProfileId: B, kind: 'interest', createdAt: NOW },
    ]);
    expect(db.prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.track.mock.calls).toEqual([[CHAT_ID, 'tg_roommate_interest_sent']]);
    // Nothing goes to the other person: one reply, to this chat, with the next card.
    expect(replies.map((reply) => reply.text)).toEqual([cardOf(A)]);
    expect(replies[0].data).toEqual(cardButtons(A));
  });

  it('runs one statement over the pair that matches only unmatched interests, both rows', async () => {
    seed({}, [person(B, 1)]);
    await tap(`rm:i:${B}`);

    expect(db.prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = db.prisma.$executeRaw.mock.calls[0];
    const sql = strings.join('?').replace(/\s+/g, ' ');
    expect(values).toEqual([VIEWER, B, B, VIEWER, NOW]);
    expect(sql).toContain("kind = 'interest'");
    expect(sql).toContain('matched_at IS NULL');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('SET matched_at = ?');
    expect(sql).toContain('(SELECT count(*) FROM pair) = 2');
  });

  it('forms the pair: both reactions matched, completer for this person, waiting for the other', async () => {
    seed({}, [person(A, 5), person(B, 1)]);
    db.state.reactions.push(interest(B, VIEWER, new Date(NOW.getTime() - 3 * DAY)));

    const replies = await tap(`rm:i:${B}`);

    expect(db.state.reactions).toEqual([
      { ...interest(B, VIEWER, new Date(NOW.getTime() - 3 * DAY)), matchedAt: NOW },
      { fromProfileId: VIEWER, toProfileId: B, kind: 'interest', createdAt: NOW, matchedAt: NOW },
    ]);
    expect(mocks.track.mock.calls).toEqual([
      [CHAT_ID, 'tg_roommate_interest_sent'],
      [CHAT_ID, 'tg_roommate_matched', { role: 'completer' }],
      [tgChatOf(B), 'tg_roommate_matched', { role: 'waiting' }],
    ]);
    // Then the reveal of the pair formed just now, the waiting person (B) first.
    expect(mocks.revealPair).toHaveBeenCalledTimes(1);
    const [, pair, at, options] = mocks.revealPair.mock.calls[0];
    expect(pair.waiting.profile.id).toBe(B);
    expect(pair.completer.profile.id).toBe(VIEWER);
    expect([at, options]).toEqual([NOW, { justFormed: true }]);
    // The reveal sent this person nothing (mocked), so the next card follows.
    expect(replies.map((reply) => reply.text)).toEqual([cardOf(A)]);
  });

  it('a reveal (or its username prompt) to this person replaces the next card', async () => {
    seed({}, [person(A, 5), person(B, 1)]);
    db.state.reactions.push(interest(B, VIEWER, new Date(NOW.getTime() - 3 * DAY)));
    mocks.revealPair.mockResolvedValueOnce(new Set([VIEWER, B]));

    const replies = await tap(`rm:i:${B}`);

    expect(mocks.revealPair).toHaveBeenCalledTimes(1);
    expect(replies).toEqual([]);
  });

  it('a one-sided interest reveals nothing', async () => {
    seed({}, [person(A, 5), person(B, 1)]);
    await tap(`rm:i:${B}`);

    expect(mocks.revealPair).not.toHaveBeenCalled();
  });

  it.each([0, 1])(
    'a concurrent second completion (the statement changed %i rows) sends no second pair',
    async (changed) => {
      seed({}, [person(A, 5), person(B, 1)]);
      db.state.reactions.push(interest(B, VIEWER));
      db.prisma.$executeRaw.mockResolvedValueOnce(changed);

      const replies = await tap(`rm:i:${B}`);

      expect(mocks.track.mock.calls).toEqual([[CHAT_ID, 'tg_roommate_interest_sent']]);
      expect(db.prisma.telegramChat.findUnique).not.toHaveBeenCalledWith(
        expect.objectContaining({ select: { chatId: true } }),
      );
      expect(replies.map((reply) => reply.text)).toEqual([cardOf(A)]);
    },
  );

  it('forms no pair against a skip from the other person', async () => {
    seed({}, [person(A, 5), person(B, 1)]);
    // B skipped the viewer, so B is never on the viewer's cards; an old card's tap is refused.
    db.state.reactions.push({ fromProfileId: B, toProfileId: VIEWER, kind: 'skip' });
    const replies = await tap(`rm:i:${B}`);

    expect(replies.map((reply) => reply.text)).toEqual([rt('ru', 'browseUnavailable'), cardOf(A)]);
    expect(db.prisma.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('stores the 20th interest within 24 hours', async () => {
    seed({}, [person(A, 5), person(B, 1)]);
    db.state.reactions.push(...recentInterests(19));

    const replies = await tap(`rm:i:${B}`);

    expect(db.prisma.roommateReaction.count).toHaveBeenCalledWith({
      where: {
        fromProfileId: VIEWER,
        kind: 'interest',
        createdAt: { gt: new Date(NOW.getTime() - DAY) },
      },
    });
    expect(db.state.reactions).toHaveLength(20);
    expect(mocks.track.mock.calls).toEqual([[CHAT_ID, 'tg_roommate_interest_sent']]);
    expect(replies.map((reply) => reply.text)).toEqual([cardOf(A)]);
  });

  it.each(LOCALES)(
    'refuses the 21st within 24 hours: the limit reply, nothing stored, no event (%s)',
    async (locale) => {
      seed({}, [person(A, 5), person(B, 1)]);
      db.state.reactions.push(...recentInterests(20));
      const before = structuredClone(db.state.reactions);

      const replies = await tap(`rm:i:${B}`, { locale });

      expect(replies).toHaveLength(1);
      expect(replies[0].text).toBe(rt(locale, 'interestLimit', { limit: '20' }));
      expect(replies[0].text).toContain('20');
      expect(replies[0].options).toBeUndefined();
      expect(db.state.reactions).toEqual(before);
      expect(db.prisma.roommateReaction.createMany).not.toHaveBeenCalled();
      expect(db.prisma.$executeRaw).not.toHaveBeenCalled();
      expect(mocks.track).not.toHaveBeenCalled();
    },
  );

  it('counts neither interests older than 24 hours nor skips toward the limit', async () => {
    seed({}, [person(A, 5), person(B, 1)]);
    db.state.reactions.push(
      ...recentInterests(19),
      interest(VIEWER, uid(200), new Date(NOW.getTime() - DAY)),
      interest(VIEWER, uid(201), new Date(NOW.getTime() - 2 * DAY)),
      { fromProfileId: VIEWER, toProfileId: uid(202), kind: 'skip', createdAt: NOW },
      // Interests the viewer received are the other people's taps.
      interest(uid(203), VIEWER),
    );

    await tap(`rm:i:${B}`);

    expect(mocks.track.mock.calls).toEqual([[CHAT_ID, 'tg_roommate_interest_sent']]);
  });

  it('a reaction stored meanwhile (a double tap) replies "already answered" and the next card', async () => {
    seed({}, [person(A, 5), person(B, 1)]);
    // The first tap stored its reaction after this one's visibility check: the unique pair
    // inserts nothing.
    db.prisma.roommateReaction.createMany.mockImplementationOnce(async () => {
      db.state.reactions.push(interest(VIEWER, B, NOW));
      return { count: 0 };
    });

    const replies = await tap(`rm:i:${B}`);

    expect(replies.map((reply) => reply.text)).toEqual([rt('ru', 'interestAlready'), cardOf(A)]);
    expect(db.prisma.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('a profile deleted since the check replies "no longer available" and the next card', async () => {
    seed({}, [person(A, 5), person(B, 1)]);
    db.prisma.roommateReaction.createMany.mockImplementationOnce(async () => {
      db.state.profiles = db.state.profiles.filter((r) => r.id !== B);
      throw new Prisma.PrismaClientKnownRequestError('foreign key', {
        code: 'P2003',
        clientVersion: 'test',
      });
    });

    const replies = await tap(`rm:i:${B}`);

    expect(replies.map((reply) => reply.text)).toEqual([rt('ru', 'browseUnavailable'), cardOf(A)]);
    expect(db.prisma.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it.each(UNAVAILABLE)(
    'for %s replies "no longer available" and the next card, storing nothing',
    async (_name, change) => {
      seed({}, [person(A, 5), person(TARGET, 1)]);
      change(TARGET);
      const before = structuredClone(db.state.reactions);

      const replies = await tap(`rm:i:${TARGET}`);

      expect(replies.map((reply) => reply.text)).toEqual([
        rt('ru', 'browseUnavailable'),
        cardOf(A),
      ]);
      expect(db.state.reactions).toEqual(before);
      expect(db.prisma.roommateReaction.createMany).not.toHaveBeenCalled();
      expect(db.prisma.$executeRaw).not.toHaveBeenCalled();
      expect(mocks.track).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['an id of the wrong shape', 'not-a-uuid'],
    ['the viewer itself', VIEWER],
  ])('never trusts %s from the callback', async (_name, id) => {
    seed({}, [person(A, 5)]);
    const replies = await tap(`rm:i:${id}`);

    expect(replies.map((reply) => reply.text)).toEqual([rt('ru', 'browseUnavailable'), cardOf(A)]);
    expect(db.prisma.roommateProfile.findFirst).not.toHaveBeenCalled();
    expect(db.prisma.roommateReaction.createMany).not.toHaveBeenCalled();
  });

  it('a second tap after the pair formed forms nothing again', async () => {
    seed({}, [person(A, 5), person(B, 1)]);
    db.state.reactions.push(interest(B, VIEWER));
    await tap(`rm:i:${B}`);
    mocks.track.mockClear();

    const replies = await tap(`rm:i:${B}`);

    expect(replies.map((reply) => reply.text)).toEqual([rt('ru', 'browseUnavailable'), cardOf(A)]);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('without a username stores the interest and asks for one instead of the next card', async () => {
    seed({}, [person(A, 5), person(B, 1)]);
    const replies = await tap(`rm:i:${B}`, { username: null });

    expect(db.state.reactions).toHaveLength(1);
    expect(replies.map((reply) => reply.text)).toEqual([rt('ru', 'usernamePromptBrowse')]);
    expect(mocks.track.mock.calls).toEqual([
      [CHAT_ID, 'tg_roommate_interest_sent'],
      [CHAT_ID, 'tg_roommate_username_prompted', { context: 'browse' }],
    ]);
  });

  it('no event carries a username, a partner id or a match id', async () => {
    seed({}, [person(A, 5), person(B, 1), person(uid(5), 2)]);
    db.state.reactions.push(interest(B, VIEWER));
    // A one-sided interest, a formed pair, then the limit.
    await tap(`rm:i:${uid(5)}`);
    await tap(`rm:i:${B}`);
    db.state.reactions.push(...recentInterests(18));
    await tap(`rm:i:${A}`);

    const calls = mocks.track.mock.calls as [number, string, Record<string, unknown>?][];
    expect(calls.map(([, event]) => event)).toEqual([
      'tg_roommate_interest_sent',
      'tg_roommate_interest_sent',
      'tg_roommate_matched',
      'tg_roommate_matched',
    ]);
    const secrets = [
      VIEWER,
      A,
      B,
      uid(5),
      CHAT_ROW,
      `chat-${B}`,
      'anna_w',
      String(row(B).tgUsername),
      String(row(uid(5)).tgUsername),
      String(tgChatOf(B)),
      String(CHAT_ID),
    ];
    for (const [chatId, event, properties = {}] of calls) {
      // Each event goes to its own person's identity, never the partner's.
      expect([CHAT_ID, tgChatOf(B)]).toContain(chatId);
      expect(
        Object.keys(properties).every((key) => key === 'role'),
        event,
      ).toBe(true);
      const json = JSON.stringify(properties);
      for (const secret of secrets) expect(json, `${event} ${secret}`).not.toContain(secret);
    }
    expect(calls.filter(([chatId]) => chatId === tgChatOf(B))).toEqual([
      [tgChatOf(B), 'tg_roommate_matched', { role: 'waiting' }],
    ]);
  });
});

/** The stored row of profile `id`. */
function row(id: string): Row {
  return db.state.profiles.find((profileRow) => profileRow.id === id)!;
}

describe('the switch off', () => {
  beforeEach(() => {
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', '');
  });

  it.each(
    LOCALES.flatMap((locale) =>
      ['rm:show:c', 'rm:show:o', `rm:x:${A}`, `rm:i:${A}`, 'rm:u:done'].map(
        (data) => [data, locale] as [string, BotLocale],
      ),
    ),
  )('%s replies "matching is paused" and does nothing else (%s)', async (data, locale) => {
    seed({}, [person(A, 5)]);
    const replies = await tap(data, { locale });

    expect(replies.map((reply) => reply.text)).toEqual([rt(locale, 'matchingPaused')]);
    expect(replies[0].options).toBeUndefined();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(db.prisma.telegramChat.findUnique).not.toHaveBeenCalled();
    expect(db.prisma.roommateProfile.findMany).not.toHaveBeenCalled();
    expect(db.prisma.roommateProfile.updateMany).not.toHaveBeenCalled();
    expect(db.prisma.roommateReaction.createMany).not.toHaveBeenCalled();
    expect(db.prisma.roommateReaction.count).not.toHaveBeenCalled();
    expect(db.prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
