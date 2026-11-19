import type { RoommateProfile } from '@prisma/client';
import type { Bot, Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The opt-in "message me once when matching opens" (PRD 3 FR-18, spec 06 §Opt-in): the button
 * under the counts reply while the switch is off, the first and the repeat tap with
 * `tg_roommate_browse_opted_in`, the reply (the one message, the FR-18 edge case and the closing
 * sentence, D64 as reworded by D72) in RU, UK and EN, and the card's state and switch-off. Taps go through the
 * handlers `registerRoommateFlow` registers, over an in-memory Prisma fake whose `updateMany`
 * applies its `where`. Nothing reaches Telegram or a database.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = { profiles: [] as Row[], chats: [] as Row[] };
  const chatOf = (row: Row) => state.chats.find((chat) => chat.id === row.chatId) ?? {};

  function matches(row: Row, where: Where): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (key === 'chat') return matches(chatOf(row), cond as Where);
      if (key === 'OR') return (cond as Where[]).some((part) => matches(row, part));
      // The counts' reported-pair filter (spec 07 §Report): this fake holds no reports, so `none`
      // always holds; anything else is unsupported.
      if (key === 'reportsReceived' || key === 'reportsMade') {
        if (!('none' in (cond as object))) throw new Error(`only none on ${key}`);
        return true;
      }
      const value = row[key];
      if (cond === null) return value === null;
      if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
      if (typeof cond === 'object') {
        const c = cond as { in?: unknown[]; gt?: Date; not?: unknown };
        if (c.in) return c.in.includes(value);
        if (c.gt) return value instanceof Date && value.getTime() > c.gt.getTime();
        if (c.not === null) return value !== null;
        throw new Error(`unsupported filter on ${key}`);
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
        findMany: vi.fn(async ({ where, select }: { where: Where; select: Row }) =>
          state.profiles
            .filter((row) => matches(row, where))
            .map((row) => Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])))
            .map((row) => structuredClone(row)),
        ),
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
vi.mock('./roommate-room-costs', () => ({ roomCostsReply: mocks.roomCostsReply }));

import { registerRoommateFlow } from './roommate-flow';
import { rt } from './roommate-texts';
import type { BotLocale } from './texts';

const CHAT_ID = 4242;
const CHAT_ROW = 'chat-row';
const NOW = new Date('2026-12-05T10:00:00Z');
const LATER = new Date('2027-01-04T10:00:00Z');
const LOCALES: BotLocale[] = ['ru', 'uk', 'en'];

function profile(fields: Partial<RoommateProfile> = {}): RoommateProfile {
  return {
    id: 'P8',
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

/** The chat's own profile (none for null) and one other active profile in its own chat. */
function seed(own: Partial<RoommateProfile> | null) {
  db.state.chats = [
    { id: CHAT_ROW, blockedAt: null, roommateBannedAt: null },
    { id: 'chat-P1', blockedAt: null, roommateBannedAt: null },
  ];
  db.state.profiles = [profile({ id: 'P1', chatId: 'chat-P1' }) as unknown as Row];
  if (own) db.state.profiles.push(profile(own) as unknown as Row);
}

/** P8 as a draft at the 18+ step, so "I'm 18+" saves it. */
const DRAFT_AT_ADULT = {
  status: 'draft',
  step: 'adult',
  activatedAt: null,
  expiresAt: null,
  adultConfirmedAt: null,
} satisfies Partial<RoommateProfile>;

const own = () => db.state.profiles.find((row) => row.chatId === CHAT_ROW);
const other = () => db.state.profiles.find((row) => row.id === 'P1');

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
type Options = { reply_markup?: { inline_keyboard: Button[][] }; parse_mode?: string } | undefined;

/** A tap on a button with `data`, routed to the one handler registered for it. */
async function tap(data: string, locale: BotLocale = 'ru') {
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
  const replies = reply.mock.calls.map(([text, options]) => {
    const rows = (options as Options)?.reply_markup?.inline_keyboard ?? [];
    return {
      text: text as string,
      options: options as Options,
      data: rows.map((row) => row.map((button) => button.callback_data)),
      labels: rows.map((row) => row.map((button) => button.text)),
    };
  });
  return { answerCallbackQuery, replies, last: replies[replies.length - 1] };
}

const optInEvents = () =>
  mocks.track.mock.calls.filter(([, event]) => event === 'tg_roommate_browse_opted_in');

/** The reply of a first tap, PRD 3 §8 "Opt-in" with the FR-18 edge case, in each locale. */
const CONFIRMATION: Record<BotLocale, string> = {
  ru: 'Напишу один раз, когда подбор откроется. Если анкета скроется раньше, этого сообщения не будет. Если подбор не откроется, пока твоя анкета активна, напишу об этом и удалю её.',
  uk: 'Напишу один раз, коли підбір відкриється. Якщо анкета сховається раніше, цього повідомлення не буде. Якщо підбір не відкриється, поки твоя анкета активна, напишу про це й видалю її.',
  en: "I'll message you once when matching opens. If your profile hides before then, this message won't come. If matching does not open while your profile is active, we'll tell you and delete it.",
};

/**
 * PRD 3 §8 "Opt-in" verbatim (the first sentence) and the closing sentence as D72 rewords D64
 * (PRD 3 Q-18 (a)): the promise holds only while the profile is active.
 */
const PRD_SENTENCES: Record<BotLocale, [first: string, closing: string]> = {
  ru: [
    'Напишу один раз, когда подбор откроется.',
    'Если подбор не откроется, пока твоя анкета активна, напишу об этом и удалю её.',
  ],
  uk: [
    'Напишу один раз, коли підбір відкриється.',
    'Якщо підбір не відкриється, поки твоя анкета активна, напишу про це й видалю її.',
  ],
  en: [
    "I'll message you once when matching opens.",
    "If matching does not open while your profile is active, we'll tell you and delete it.",
  ],
};

/** The D64 wording that D72 replaced: a promise to every opted-in person, active or not. */
const D64_CLOSING: Record<BotLocale, string> = {
  ru: 'Если подбор не откроется, напишу об этом и удалю анкету.',
  uk: 'Якщо підбір не відкриється, напишу про це й видалю анкету.',
  en: "If matching does not open, we'll tell you and delete your profile.",
};

/** The words that limit the closing promise to an active profile (D72), per locale. */
const WHILE_ACTIVE: Record<BotLocale, string> = {
  ru: 'пока твоя анкета активна',
  uk: 'поки твоя анкета активна',
  en: 'while your profile is active',
};

const BUTTON: Record<BotLocale, string> = {
  ru: 'Напиши мне, когда откроется подбор',
  uk: 'Напиши мені, коли відкриється підбір',
  en: 'Message me when matching opens',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubEnv('ROOMMATE_MATCHING_ENABLED', '');
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.getCity.mockResolvedValue({
    id: 'city-1',
    slug: 'warsaw',
    districts: [{ id: 'd2', slug: 'mokotow', nameKey: 'Mokotów' }],
  });
  mocks.roomCostsReply.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('the button under the counts reply (switch off)', () => {
  it.each(LOCALES)(
    'is the one button under the counts after the save, PRD 3 §8 wording in %s',
    async (locale) => {
      seed(DRAFT_AT_ADULT);
      const { replies } = await tap('rm:a:yes', locale);

      expect(replies).toHaveLength(2);
      expect(replies[1].text.startsWith(rt(locale, 'countsLead').split('{')[0])).toBe(true);
      expect(replies[1].data).toEqual([['rm:c:optin']]);
      expect(replies[1].labels).toEqual([[BUTTON[locale]]]);
      expect(replies[1].options?.parse_mode).toBe('HTML');
    },
  );

  it('is under the counts on "How many are looking?" too', async () => {
    seed({});
    const { replies } = await tap('rm:c:counts');
    expect(replies).toHaveLength(1);
    expect(replies[0].data).toEqual([['rm:c:optin']]);
  });

  it('stays under the counts of an opted-in profile, where a tap says "already on"', async () => {
    seed({ notifyOnOpenAt: NOW });
    const { replies } = await tap('rm:c:counts');
    expect(replies[0].data).toEqual([['rm:c:optin']]);
  });

  it('is not under the "counts not available" reply', async () => {
    seed({});
    db.prisma.roommateProfile.findMany.mockRejectedValueOnce(new Error('timeout'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { replies } = await tap('rm:c:counts');
    errorLog.mockRestore();
    expect(replies.map((reply) => reply.text)).toEqual([rt('ru', 'countsUnavailable')]);
    expect(replies[0].data).toEqual([]);
  });
});

describe('with the switch on', () => {
  beforeEach(() => {
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
  });

  it('the button is not rendered under the counts after the save or on "How many are looking?"', async () => {
    seed(DRAFT_AT_ADULT);
    const saved = await tap('rm:a:yes');
    const counts = await tap('rm:c:counts');

    for (const reply of [saved.last, counts.last]) {
      expect(reply.options).toEqual({ parse_mode: 'HTML' });
      expect(reply.data).toEqual([]);
    }
    // The card above the counts has "Show people" instead of the opt-in toggle.
    expect(saved.replies[0].data.flat()).not.toContain('rm:c:optin');
    expect(saved.replies[0].data.flat()).not.toContain('rm:c:optout');
    expect(saved.replies[0].text).not.toContain(rt('ru', 'cardOptInOff'));
  });

  it('an old opt-in button stores nothing, sends no event and gets the card', async () => {
    seed({});
    const { replies } = await tap('rm:c:optin');

    expect(own()?.notifyOnOpenAt).toBeNull();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(db.prisma.roommateProfile.updateMany).not.toHaveBeenCalled();
    expect(replies).toHaveLength(1);
    expect(replies[0].text.startsWith(rt('ru', 'cardHeader'))).toBe(true);
    expect(replies[0].data.flat()).toContain('rm:show:c');
  });
});

describe('the first tap', () => {
  it('sets notify_on_open_at and sends tg_roommate_browse_opted_in with already=false', async () => {
    seed({});
    const { replies, answerCallbackQuery } = await tap('rm:c:optin');

    expect(own()).toMatchObject({ notifyOnOpenAt: NOW, notifiedOpenAt: null, status: 'active' });
    expect(other()?.notifyOnOpenAt).toBeNull();
    expect(mocks.track.mock.calls).toEqual([
      [CHAT_ID, 'tg_roommate_browse_opted_in', { already: false }],
    ]);
    expect(replies.map((reply) => reply.text)).toEqual([CONFIRMATION.ru]);
    expect(replies[0].data).toEqual([]);
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it('writes the opt-in columns only, conditionally on no opt-in waiting', async () => {
    seed({});
    await tap('rm:c:optin');
    expect(db.prisma.roommateProfile.updateMany.mock.calls.map(([args]) => args)).toEqual([
      {
        where: {
          id: 'P8',
          status: { in: ['active', 'expired'] },
          OR: [{ notifyOnOpenAt: null }, { notifiedOpenAt: { not: null } }],
        },
        data: { notifyOnOpenAt: NOW, notifiedOpenAt: null },
      },
    ]);
  });

  it.each(LOCALES)(
    'says the one message, the edge case and the D72 closing sentence in %s',
    async (locale) => {
      seed({});
      const { replies } = await tap('rm:c:optin', locale);
      const [first, closing] = PRD_SENTENCES[locale];

      expect(replies.map((reply) => reply.text)).toEqual([CONFIRMATION[locale]]);
      expect(replies[0].text.startsWith(first)).toBe(true);
      expect(replies[0].text.endsWith(closing)).toBe(true);
      expect(replies[0].text).toBe(`${rt(locale, 'optInConfirm')} ${rt(locale, 'optInClosing')}`);
    },
  );

  it.each(LOCALES)(
    'limits the closing promise to an active profile, not the D64 wording, in %s (D72)',
    async (locale) => {
      seed({});
      const { replies } = await tap('rm:c:optin', locale);

      expect(rt(locale, 'optInClosing')).toContain(WHILE_ACTIVE[locale]);
      expect(replies[0].text).toContain(WHILE_ACTIVE[locale]);
      expect(replies[0].text).not.toContain(D64_CLOSING[locale]);
    },
  );

  it('works from the card of an expired profile, whose message waits for a renewal', async () => {
    seed({ status: 'expired', expiresAt: NOW, expiredAt: NOW });
    const { replies } = await tap('rm:c:optin');

    expect(own()).toMatchObject({ status: 'expired', notifyOnOpenAt: NOW });
    expect(optInEvents()).toEqual([[CHAT_ID, 'tg_roommate_browse_opted_in', { already: false }]]);
    expect(replies.map((reply) => reply.text)).toEqual([CONFIRMATION.ru]);
  });
});

describe('a repeat tap', () => {
  it('replies "already on", keeps the first time and sends already=true', async () => {
    seed({});
    await tap('rm:c:optin');
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const { replies } = await tap('rm:c:optin');

    expect(own()?.notifyOnOpenAt).toEqual(NOW);
    expect(optInEvents()).toEqual([
      [CHAT_ID, 'tg_roommate_browse_opted_in', { already: false }],
      [CHAT_ID, 'tg_roommate_browse_opted_in', { already: true }],
    ]);
    expect(replies.map((reply) => reply.text)).toEqual([`Уже включено. ${CONFIRMATION.ru}`]);
  });

  it.each(LOCALES)('starts with "already on" in %s', async (locale) => {
    seed({ notifyOnOpenAt: NOW });
    const { replies } = await tap('rm:c:optin', locale);
    expect(replies.map((reply) => reply.text)).toEqual([
      `${rt(locale, 'optInAlready')} ${CONFIRMATION[locale]}`,
    ]);
    expect(optInEvents()).toEqual([[CHAT_ID, 'tg_roommate_browse_opted_in', { already: true }]]);
  });

  it('of two overlapping taps exactly one is the first', async () => {
    seed({});
    await Promise.all([tap('rm:c:optin'), tap('rm:c:optin')]);

    const already = optInEvents().map(([, , properties]) => properties.already);
    expect(already.sort()).toEqual([false, true]);
    expect(own()?.notifyOnOpenAt).toEqual(NOW);
  });

  it('sends only the already property', async () => {
    seed({ notifyOnOpenAt: NOW });
    await tap('rm:c:optin');
    for (const [, , properties] of mocks.track.mock.calls) {
      expect(Object.keys(properties)).toEqual(['already']);
    }
  });
});

describe('the card shows the opt-in and switches it off', () => {
  it('shows "on" with the switch-off button after the opt-in', async () => {
    seed({});
    await tap('rm:c:optin');
    const { replies } = await tap('rm:start');

    expect(replies).toHaveLength(1);
    expect(replies[0].text).toContain(rt('ru', 'cardOptInOn'));
    expect(replies[0].data.flat()).toContain('rm:c:optout');
    expect(replies[0].data.flat()).not.toContain('rm:c:optin');
  });

  it('"Don\'t message me" clears notify_on_open_at and sends the card with "off", no event', async () => {
    seed({ notifyOnOpenAt: NOW });
    const { replies } = await tap('rm:c:optout');

    expect(own()?.notifyOnOpenAt).toBeNull();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(replies).toHaveLength(1);
    expect(replies[0].text).toContain(rt('ru', 'cardOptInOff'));
    expect(replies[0].text).not.toContain(rt('ru', 'cardOptInOn'));
    expect(replies[0].data.flat()).toContain('rm:c:optin');
    expect(replies[0].data.flat()).not.toContain('rm:c:optout');
  });

  it('after switching off, the next opt-in is a first tap again', async () => {
    seed({ notifyOnOpenAt: new Date('2026-12-01T10:00:00Z') });
    await tap('rm:c:optout');
    const { replies } = await tap('rm:c:optin');

    expect(own()?.notifyOnOpenAt).toEqual(NOW);
    expect(optInEvents()).toEqual([[CHAT_ID, 'tg_roommate_browse_opted_in', { already: false }]]);
    expect(replies.map((reply) => reply.text)).toEqual([CONFIRMATION.ru]);
  });

  it('a repeat switch-off changes nothing and sends the card again', async () => {
    seed({});
    const { replies } = await tap('rm:c:optout');
    expect(own()?.notifyOnOpenAt).toBeNull();
    expect(replies[0].text).toContain(rt('ru', 'cardOptInOff'));
    expect(mocks.track).not.toHaveBeenCalled();
  });
});

describe('a tap that cannot change the opt-in', () => {
  it.each([
    ['no profile', null, 'alreadyDeleted'],
    ['a hidden profile', { status: 'hidden' }, 'banned'],
    ['a new draft', { ...DRAFT_AT_ADULT, step: 'budget' }, 'stepDone'],
  ] as const)('%s: nothing stored, no event', async (_name, ownFields, replyKey) => {
    for (const data of ['rm:c:optin', 'rm:c:optout']) {
      seed(ownFields);
      vi.clearAllMocks();
      const { replies } = await tap(data);

      expect(replies[0].text).toBe(rt('ru', replyKey));
      expect(mocks.track).not.toHaveBeenCalled();
      expect(db.prisma.roommateProfile.updateMany).not.toHaveBeenCalled();
      if (ownFields) expect(own()?.notifyOnOpenAt).toBeNull();
    }
  });
});
