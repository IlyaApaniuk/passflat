import type { RoommateProfile } from '@prisma/client';
import type { Bot, Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cards one at a time (PRD 3 FR-25, spec 07 §Cards): "Show people" (`rm:show:<via>`) with the
 * switch on and off, the card's content and buttons, "That's everyone for now", Skip
 * (`rm:x:<id>`), a card button for a profile no longer visible, the username prompt and its Done
 * (`rm:u:done`), and the events `tg_roommate_cards_viewed`, `tg_roommate_username_prompted` and
 * `tg_roommate_username_set`. Taps go through the handlers `registerRoommateFlow` and
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
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          const chat = state.chats.find((row) => row.id === where.id);
          if (!chat) return null;
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
vi.mock('./roommate-room-costs', () => ({ roomCostsReply: mocks.roomCostsReply }));

import { registerRoommateFlow } from './roommate-flow';
import { registerRoommateMatching, renderRoommateCard } from './roommate-matching';
import { rt, type RoommateLocale } from './roommate-texts';

const CHAT_ID = 4242;
const CHAT_ROW = 'chat-row';
const NOW = new Date('2026-12-05T10:00:00Z');
const LATER = new Date('2027-01-04T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const LOCALES: RoommateLocale[] = ['ru', 'uk', 'en'];

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

/** The viewer's chat with its profile (none for null), and the other people with their chats. */
function seed(own: Partial<RoommateProfile> | null, others: Row[] = []) {
  db.state.chats = [
    { id: CHAT_ROW, blockedAt: null, roommateBannedAt: null },
    ...others.map((row) => ({ id: row.chatId, blockedAt: null, roommateBannedAt: null })),
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
  {
    locale = 'ru',
    username = 'anna_w',
  }: { locale?: RoommateLocale; username?: string | null } = {},
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
function cardOf(id: string, locale: RoommateLocale = 'ru'): string {
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

  const TARGET = uid(40);
  it.each<[string, (id: string) => void]>([
    [
      'a deleted profile',
      (id) => (db.state.profiles = db.state.profiles.filter((r) => r.id !== id)),
    ],
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
  ])('for %s replies "no longer available" and the next card', async (_name, change) => {
    seed({}, [person(A, 5), person(TARGET, 1)]);
    change(TARGET);
    const before = structuredClone(db.state.reactions);

    const replies = await tap(`rm:x:${TARGET}`);

    expect(replies.map((reply) => reply.text)).toEqual([rt('ru', 'browseUnavailable'), cardOf(A)]);
    expect(replies[1].data).toEqual(cardButtons(A));
    expect(db.state.reactions).toEqual(before);
    expect(db.prisma.roommateReaction.createMany).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

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
      ['rm:show:c', 'rm:show:o', `rm:x:${A}`, 'rm:u:done'].map(
        (data) => [data, locale] as [string, RoommateLocale],
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
  });
});
