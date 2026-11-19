import type { RoommateProfile } from '@prisma/client';
import { GrammyError, type Bot, type CommandContext, type Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Intake steps 1 – 9 (spec 06 §Intake steps: districts, budget, move-in month, languages, own
 * gender, "live with", the short text, smoking and pets, 18+) and the save of §Save and the own
 * card, with the callback data of §Entry and routing and the "Stale and repeated taps" rule. Taps
 * go through
 * the handlers `registerRoommateFlow` registers, so the callback data is routed as in the bot.
 * Profiles live in an in-memory Prisma fake whose `updateMany` applies its `where`, so the
 * conditional step writes behave as in the database. Nothing reaches Telegram or a database.
 */

const db = vi.hoisted(() => {
  const rows: RoommateProfile[] = [];
  const matches = (row: RoommateProfile, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      const field = (row as Record<string, unknown>)[key];
      if (value && typeof value === 'object' && 'in' in value) {
        return (value as { in: unknown[] }).in.includes(field);
      }
      return field === value;
    });
  const byChat = (chatId: string) => rows.find((row) => row.chatId === chatId);
  return {
    rows,
    telegramChat: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = byChat(where.id);
        return { roommateBannedAt: null, roommateProfile: row ? structuredClone(row) : null };
      }),
    },
    roommateProfile: {
      findUnique: vi.fn(async ({ where }: { where: { chatId: string } }) => {
        const row = byChat(where.chatId);
        return row ? structuredClone(row) : null;
      }),
      create: vi.fn(),
      /** The counts query after the save (spec 06 §Counts): this chat's row is the only one. */
      findMany: vi.fn(async () =>
        rows
          .filter((row) => row.status === 'active')
          .map(({ id, districtSlugs, anyDistrict }) => ({ id, districtSlugs, anyDistrict })),
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
          const hits = rows.filter((row) => matches(row, where));
          for (const row of hits) Object.assign(row, structuredClone(data));
          return { count: hits.length };
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const hits = rows.filter((row) => matches(row, where));
        for (const hit of hits) rows.splice(rows.indexOf(hit), 1);
        return { count: hits.length };
      }),
    },
  };
});
const mocks = vi.hoisted(() => ({
  touchChat: vi.fn(),
  track: vi.fn(),
  hasOpenIntake: vi.fn(),
  getCity: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('./store', () => ({ touchChat: mocks.touchChat }));
vi.mock('./analytics', () => ({ track: mocks.track }));
vi.mock('./deposit-flow', () => ({ hasOpenIntake: mocks.hasOpenIntake }));
vi.mock('./lookup', () => ({ getCity: mocks.getCity }));

import {
  BUDGET_TAP,
  DISTRICT_TOGGLE,
  GENDER_TAP,
  LANGUAGE_TOGGLE,
  MONTH_TAP,
  PETS_TAP,
  PREFERS_TAP,
  SMOKING_TAP,
  handleMate,
  handleRoommateText,
  registerRoommateFlow,
} from './roommate-flow';
import { rt } from './roommate-texts';

const CHAT_ID = 4242;
const CHAT = { id: 'chat-row', locale: 'ru', isNew: false };
const NOW = new Date('2026-12-05T10:00:00Z');
const NBSP = String.fromCharCode(0xa0);

const DISTRICTS = [
  { id: 'd1', slug: 'wola', nameKey: 'Wola' },
  { id: 'd2', slug: 'mokotow', nameKey: 'Mokotów' },
  { id: 'd3', slug: 'ochota', nameKey: 'Ochota' },
  { id: 'd4', slug: 'bielany', nameKey: 'Bielany' },
  { id: 'd5', slug: 'srodmiescie', nameKey: 'Śródmieście' },
];

function profile(fields: Partial<RoommateProfile> = {}): RoommateProfile {
  return {
    id: 'profile-1',
    chatId: 'chat-row',
    status: 'draft',
    step: 'districts',
    entrySource: 'tg',
    districtSlugs: [],
    anyDistrict: false,
    budgetBand: null,
    moveInMonth: null,
    languages: [],
    gender: null,
    prefers: 'anyone',
    about: null,
    smoking: null,
    pets: null,
    adultConfirmedAt: null,
    tgUsername: 'anna_w',
    activatedAt: null,
    expiresAt: null,
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

/** The chat's one profile row. */
function seed(fields: Partial<RoommateProfile> = {}): RoommateProfile {
  db.rows.length = 0;
  const row = profile(fields);
  db.rows.push(row);
  return row;
}

const row = () => db.rows[0];

type Handler = (ctx: Context) => Promise<void>;
type Route = [trigger: string | RegExp, handler: Handler];

/** The callback routes `registerRoommateFlow` registers, in registration order. */
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

type Button = { text: string; callback_data?: string };
type Markup = { inline_keyboard: Button[][] };

function fakeCtx({ username = 'anna_w' as string | null } = {}) {
  const reply = vi.fn().mockResolvedValue({});
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const editMessageReplyMarkup = vi.fn().mockResolvedValue(true);
  const ctx = {
    chat: { id: CHAT_ID },
    from: username ? { id: CHAT_ID, username } : { id: CHAT_ID },
    message: { text: '/mate' },
    reply,
    answerCallbackQuery,
    editMessageReplyMarkup,
  } as unknown as Context;
  return { ctx, reply, answerCallbackQuery, editMessageReplyMarkup };
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

/** The inline keyboard of reply number `index`. */
function replyKeyboard(reply: ReturnType<typeof vi.fn>, index = 0): Button[][] {
  const markup = reply.mock.calls[index][1]?.reply_markup as Markup | undefined;
  return markup?.inline_keyboard ?? [];
}

/** The keyboard of the last in-place edit. */
function editedKeyboard(edit: ReturnType<typeof vi.fn>): Button[][] {
  return (edit.mock.lastCall![0].reply_markup as Markup).inline_keyboard;
}

const labels = (rows: Button[][]) => rows.map((r) => r.map((b) => b.text.replace(/\s/g, ' ')));
const data = (rows: Button[][]) => rows.map((r) => r.map((b) => b.callback_data));

const askDistricts = (locale: 'ru' | 'uk' = 'ru') => rt(locale, 'askDistricts', { max: '3' });

function notModified() {
  return new GrammyError(
    "Call to 'editMessageReplyMarkup' failed!",
    {
      ok: false,
      error_code: 400,
      description: 'Bad Request: message is not modified: specified new message content',
    },
    'editMessageReplyMarkup',
    {},
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  db.rows.length = 0;
  mocks.touchChat.mockResolvedValue(CHAT);
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.getCity.mockResolvedValue({ id: 'city-1', slug: 'warsaw', districts: DISTRICTS });
  db.roommateProfile.create.mockImplementation(async ({ data: fields }) => {
    const created = profile({ ...fields });
    db.rows.push(created);
    return structuredClone(created);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('callback data of spec 06 §Entry and routing, steps 1 – 8', () => {
  it.each([
    ['rm:start', 'rm:start'],
    ['rm:d:wola:1', DISTRICT_TOGGLE],
    ['rm:d:praga-poludnie:0', DISTRICT_TOGGLE],
    ['rm:d:any', 'rm:d:any'],
    ['rm:d:done', 'rm:d:done'],
    ['rm:b:b3', BUDGET_TAP],
    ['rm:m:2026-12', MONTH_TAP],
    ['rm:l:pl:1', LANGUAGE_TOGGLE],
    ['rm:l:uk:0', LANGUAGE_TOGGLE],
    ['rm:l:done', 'rm:l:done'],
    ['rm:g:woman', GENDER_TAP],
    ['rm:g:skip', GENDER_TAP],
    ['rm:p:anyone', PREFERS_TAP],
    ['rm:p:men', PREFERS_TAP],
    ['rm:t:skip', 'rm:t:skip'],
    ['rm:s:no', SMOKING_TAP],
    ['rm:s:outside', SMOKING_TAP],
    ['rm:s:skip', SMOKING_TAP],
    ['rm:pt:have', PETS_TAP],
    ['rm:pt:skip', PETS_TAP],
    ['rm:a:yes', 'rm:a:yes'],
    ['rm:a:no', 'rm:a:no'],
  ])('%s reaches exactly one handler', (callbackData, trigger) => {
    const routes = routesFor(callbackData);
    expect(routes).toHaveLength(1);
    expect(routes[0][0]).toBe(trigger);
  });

  it('every button of the three steps fits the 64-byte limit and is routed', async () => {
    seed();
    const districts = fakeCtx();
    await handleMate(districts.ctx as CommandContext<Context>);
    seed({ anyDistrict: true });
    const budget = await tap('rm:d:done');
    seed({ step: 'budget' });
    const month = await tap('rm:b:b1');

    const buttons = [
      ...replyKeyboard(districts.reply).flat(),
      ...replyKeyboard(budget.reply).flat(),
      ...replyKeyboard(month.reply).flat(),
    ];
    expect(buttons).toHaveLength(DISTRICTS.length + 2 + 5 + 4);
    for (const button of buttons) {
      expect(Buffer.byteLength(button.callback_data!, 'utf8')).toBeLessThanOrEqual(64);
      expect(routesFor(button.callback_data!)).toHaveLength(1);
    }
  });

  it('every button of steps 4 – 6 fits the 64-byte limit and is routed', async () => {
    seed({ step: 'month' });
    const languages = await tap('rm:m:2027-01');
    seed({ step: 'languages', languages: ['pl', 'en', 'ru', 'uk'] });
    const allTicked = await tap('rm:l:pl:1');
    seed({ step: 'languages', languages: ['ru'] });
    const gender = await tap('rm:l:done');
    seed({ step: 'gender' });
    const prefers = await tap('rm:g:skip');

    const buttons = [
      ...replyKeyboard(languages.reply).flat(),
      ...editedKeyboard(allTicked.editMessageReplyMarkup).flat(),
      ...replyKeyboard(gender.reply).flat(),
      ...replyKeyboard(prefers.reply).flat(),
    ];
    expect(buttons).toHaveLength(5 + 5 + 3 + 3);
    for (const button of buttons) {
      expect(Buffer.byteLength(button.callback_data!, 'utf8')).toBeLessThanOrEqual(64);
      expect(routesFor(button.callback_data!)).toHaveLength(1);
    }
  });

  it('every button of steps 7 – 8 fits the 64-byte limit and is routed', async () => {
    seed({ step: 'prefers' });
    const about = await tap('rm:p:anyone');
    const smoking = await tap('rm:t:skip');
    const pets = await tap('rm:s:skip');

    const buttons = [
      ...replyKeyboard(about.reply).flat(),
      ...replyKeyboard(smoking.reply).flat(),
      ...replyKeyboard(pets.reply).flat(),
    ];
    expect(buttons).toHaveLength(1 + 4 + 4);
    for (const button of buttons) {
      expect(Buffer.byteLength(button.callback_data!, 'utf8')).toBeLessThanOrEqual(64);
      expect(routesFor(button.callback_data!)).toHaveLength(1);
    }
  });

  it('every button of step 9 fits the 64-byte limit and is routed', async () => {
    seed({ step: 'pets' });
    const adult = await tap('rm:pt:no');

    const buttons = replyKeyboard(adult.reply).flat();
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(Buffer.byteLength(button.callback_data!, 'utf8')).toBeLessThanOrEqual(64);
      expect(routesFor(button.callback_data!)).toHaveLength(1);
    }
  });
});

describe('step 1: districts', () => {
  it('a tap picks the district and marks it ✓ in the same message', async () => {
    seed();
    const { reply, editMessageReplyMarkup, answerCallbackQuery } = await tap('rm:d:mokotow:1');

    expect(row().districtSlugs).toEqual(['mokotow']);
    expect(row().step).toBe('districts');
    expect(reply).not.toHaveBeenCalled();
    expect(editMessageReplyMarkup).toHaveBeenCalledTimes(1);
    const buttons = editedKeyboard(editMessageReplyMarkup).flat();
    expect(buttons).toContainEqual({
      text: rt('ru', 'btnPicked', { name: 'Mokotów' }),
      callback_data: 'rm:d:mokotow:0',
    });
    expect(buttons).toContainEqual({ text: 'Wola', callback_data: 'rm:d:wola:1' });
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
  });

  it('a repeated tap sets the same state instead of flipping it back', async () => {
    seed();
    await tap('rm:d:mokotow:1');
    const second = fakeCtx();
    second.editMessageReplyMarkup.mockRejectedValue(notModified());
    await expect(tap('rm:d:mokotow:1', second)).resolves.toBeDefined();

    expect(row().districtSlugs).toEqual(['mokotow']);
    expect(second.answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it('the ✓ button (target state 0) unpicks the district', async () => {
    seed({ districtSlugs: ['mokotow', 'wola'] });
    const { editMessageReplyMarkup } = await tap('rm:d:mokotow:0');

    expect(row().districtSlugs).toEqual(['wola']);
    expect(editedKeyboard(editMessageReplyMarkup).flat()).toContainEqual({
      text: 'Mokotów',
      callback_data: 'rm:d:mokotow:1',
    });
  });

  it('a 4th pick answers "up to 3 districts" as the toast and changes nothing', async () => {
    seed({ districtSlugs: ['mokotow', 'wola', 'ochota'] });
    const { reply, editMessageReplyMarkup, answerCallbackQuery } = await tap('rm:d:bielany:1');

    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: rt('ru', 'districtLimit', { max: '3' }),
    });
    expect(row().districtSlugs).toEqual(['mokotow', 'wola', 'ochota']);
    expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
    expect(editMessageReplyMarkup).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });

  it('"Any district" stores any_district and no districts; a district picked afterwards clears it', async () => {
    seed({ districtSlugs: ['wola'] });
    const any = await tap('rm:d:any');

    expect(row()).toMatchObject({ anyDistrict: true, districtSlugs: [] });
    const buttons = editedKeyboard(any.editMessageReplyMarkup).flat();
    expect(buttons).toContainEqual({
      text: rt('ru', 'btnPicked', { name: rt('ru', 'btnAnyDistrict') }),
      callback_data: 'rm:d:any',
    });
    expect(buttons).toContainEqual({ text: 'Wola', callback_data: 'rm:d:wola:1' });

    const pick = await tap('rm:d:ochota:1');
    expect(row()).toMatchObject({ anyDistrict: false, districtSlugs: ['ochota'] });
    expect(editedKeyboard(pick.editMessageReplyMarkup).flat()).toContainEqual({
      text: rt('ru', 'btnAnyDistrict'),
      callback_data: 'rm:d:any',
    });
  });

  it('"Done" with nothing picked asks again and stays at the step', async () => {
    seed();
    const { reply, answerCallbackQuery } = await tap('rm:d:done');

    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: rt('ru', 'districtsEmpty') });
    expect(row().step).toBe('districts');
    expect(reply).not.toHaveBeenCalled();
  });

  it.each([
    ['1 – 3 districts', { districtSlugs: ['wola', 'mokotow'] }],
    ['"any"', { anyDistrict: true }],
  ])('"Done" with %s moves on to the budget', async (_label, fields) => {
    seed(fields);
    const { reply } = await tap('rm:d:done');

    expect(row().step).toBe('budget');
    expect(row()).toMatchObject(fields);
    expect(texts(reply)).toEqual([rt('ru', 'askBudget')]);
  });

  it('a slug outside the District table is ignored', async () => {
    seed();
    const { reply, editMessageReplyMarkup, answerCallbackQuery } = await tap('rm:d:praga-x:1');

    expect(row().districtSlugs).toEqual([]);
    expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    expect(editMessageReplyMarkup).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it.each(['rm:d:wola:1', 'rm:d:any', 'rm:d:done'])(
    '%s from an older message after the step moved on: "this step is done" and the current step',
    async (callbackData) => {
      seed({ step: 'budget', districtSlugs: ['mokotow'] });
      const { reply, editMessageReplyMarkup } = await tap(callbackData);

      expect(texts(reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askBudget')]);
      expect(row()).toMatchObject({
        step: 'budget',
        districtSlugs: ['mokotow'],
        anyDistrict: false,
      });
      expect(editMessageReplyMarkup).not.toHaveBeenCalled();
    },
  );

  it('a tap after the draft was closed only says the step is done', async () => {
    const { reply } = await tap('rm:d:wola:1');
    expect(texts(reply)).toEqual([rt('ru', 'stepDone')]);
  });

  it('a step that moves on between the read and the write changes nothing', async () => {
    seed({ step: 'budget' });
    db.roommateProfile.findUnique.mockResolvedValueOnce(profile({ step: 'districts' }));
    const { reply, editMessageReplyMarkup } = await tap('rm:d:wola:1');

    expect(row()).toMatchObject({ step: 'budget', districtSlugs: [] });
    expect(texts(reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askBudget')]);
    expect(editMessageReplyMarkup).not.toHaveBeenCalled();
  });

  it('two "Done" taps at once advance the step once', async () => {
    seed({ districtSlugs: ['wola'] });
    const first = fakeCtx();
    const second = fakeCtx();
    await Promise.all([tap('rm:d:done', first), tap('rm:d:done', second)]);

    expect(row().step).toBe('budget');
    expect([...texts(first.reply), ...texts(second.reply)].sort()).toEqual(
      [rt('ru', 'askBudget'), rt('ru', 'askBudget'), rt('ru', 'stepDone')].sort(),
    );
  });

  it('stores a changed username on a tap', async () => {
    seed({ tgUsername: 'old_name' });
    await tap('rm:d:wola:1', fakeCtx({ username: 'anna_w' }));
    expect(row().tgUsername).toBe('anna_w');
  });
});

describe('step 2: budget', () => {
  const ruLabels = [
    ['до 1 199 zł'],
    ['1 200 – 1 599 zł'],
    ['1 600 – 1 999 zł'],
    ['2 000 – 2 499 zł'],
    ['2 500 zł и больше'],
  ];

  it('asks per person, all-in a month, with one button per band', async () => {
    seed({ anyDistrict: true });
    const { reply } = await tap('rm:d:done');

    expect(rt('ru', 'askBudget')).toContain('На человека в месяц, всё включено');
    expect(rt('uk', 'askBudget')).toContain('На людину на місяць, усе включено');
    expect(rt('en', 'askBudget')).toContain('Per person, all-in a month');
    expect(reply.mock.calls[0][1]).toMatchObject({ parse_mode: 'HTML' });
    expect(labels(replyKeyboard(reply))).toEqual(ruLabels);
    expect(data(replyKeyboard(reply))).toEqual([
      ['rm:b:b1'],
      ['rm:b:b2'],
      ['rm:b:b3'],
      ['rm:b:b4'],
      ['rm:b:b5'],
    ]);
    expect(replyKeyboard(reply)[1][0].text).toBe(`1${NBSP}200 – 1${NBSP}599 zł`);
  });

  it('writes the band labels in the chat locale', async () => {
    mocks.touchChat.mockResolvedValue({ ...CHAT, locale: 'uk' });
    seed({ anyDistrict: true });
    const { reply } = await tap('rm:d:done');

    expect(texts(reply)).toEqual([rt('uk', 'askBudget')]);
    expect(labels(replyKeyboard(reply))[0]).toEqual(['до 1 199 zł']);
    expect(labels(replyKeyboard(reply))[4]).toEqual(['2 500 zł і більше']);
  });

  it('a tap stores the band and moves on to the move-in month', async () => {
    seed({ step: 'budget' });
    const { reply } = await tap('rm:b:b3');

    expect(row()).toMatchObject({ budgetBand: 'b3', step: 'month' });
    expect(texts(reply)).toEqual([rt('ru', 'askMonth')]);
  });

  it('an unknown band is ignored', async () => {
    seed({ step: 'budget' });
    const { reply, answerCallbackQuery } = await tap('rm:b:b9');

    expect(row()).toMatchObject({ budgetBand: null, step: 'budget' });
    expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it('a second tap after the step moved on changes nothing and resends the current step', async () => {
    seed({ step: 'budget' });
    await tap('rm:b:b3');
    const { reply } = await tap('rm:b:b2');

    expect(row()).toMatchObject({ budgetBand: 'b3', step: 'month' });
    expect(texts(reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askMonth')]);
  });

  it.each([
    ['1650', 'b3'],
    ['1 650 zł', 'b3'],
    ['2500', 'b5'],
    ['около 1100 zł', 'b1'],
  ])('a typed %j is stored as %s and moves on', async (text, band) => {
    seed({ step: 'budget' });
    const { ctx, reply } = fakeCtx();

    expect(await handleRoommateText(ctx, 'chat-row', 'ru', text)).toBe('used');
    expect(row()).toMatchObject({ budgetBand: band, step: 'month' });
    expect(texts(reply)).toEqual([rt('ru', 'askMonth')]);
  });

  it.each(['Mokotów', 'около двух тысяч', '1500-2000', 'Puławska 10'])(
    'typed %j without one amount passes on and the step stays open',
    async (text) => {
      seed({ step: 'budget' });
      const { ctx, reply } = fakeCtx();

      expect(await handleRoommateText(ctx, 'chat-row', 'ru', text)).toBe('passed');
      expect(row()).toMatchObject({ budgetBand: null, step: 'budget' });
      expect(reply).not.toHaveBeenCalled();
    },
  );

  it('a typed amount after the step moved on (a lost race) changes nothing', async () => {
    seed({ step: 'month', budgetBand: 'b2' });
    db.roommateProfile.findUnique.mockResolvedValueOnce(profile({ step: 'budget' }));
    const { ctx, reply } = fakeCtx();

    expect(await handleRoommateText(ctx, 'chat-row', 'ru', '1650')).toBe('used');
    expect(row()).toMatchObject({ budgetBand: 'b2', step: 'month' });
    expect(texts(reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askMonth')]);
  });
});

describe('step 3: move-in month', () => {
  async function monthStep(locale: 'ru' | 'uk' = 'ru') {
    mocks.touchChat.mockResolvedValue({ ...CHAT, locale });
    seed({ step: 'budget' });
    return (await tap('rm:b:b2')).reply;
  }

  it('offers the current Warsaw month and the next three in the locale, two per row', async () => {
    const reply = await monthStep();

    expect(texts(reply)).toEqual([rt('ru', 'askMonth')]);
    expect(labels(replyKeyboard(reply))).toEqual([
      ['Декабрь 2026', 'Январь 2027'],
      ['Февраль 2027', 'Март 2027'],
    ]);
    expect(data(replyKeyboard(reply))).toEqual([
      ['rm:m:2026-12', 'rm:m:2027-01'],
      ['rm:m:2027-02', 'rm:m:2027-03'],
    ]);
  });

  it('writes Ukrainian month names for a Ukrainian chat', async () => {
    const reply = await monthStep('uk');
    expect(labels(replyKeyboard(reply))[0]).toEqual(['Грудень 2026', 'Січень 2027']);
  });

  it('starts with January at 00:30 Warsaw time on 1 January, whatever the process time zone', async () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    vi.setSystemTime(new Date('2026-12-31T23:30:00Z'));
    const reply = await monthStep();

    expect(data(replyKeyboard(reply))).toEqual([
      ['rm:m:2027-01', 'rm:m:2027-02'],
      ['rm:m:2027-03', 'rm:m:2027-04'],
    ]);
  });

  it('a tap stores the first day of the month and moves on to the languages', async () => {
    seed({ step: 'month' });
    const { reply } = await tap('rm:m:2027-01');

    expect(row().moveInMonth?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(row().step).toBe('languages');
    expect(texts(reply)).toEqual([rt('ru', 'askLanguages')]);
  });

  it('a button for a month that has passed gets the step again with the current months', async () => {
    vi.setSystemTime(new Date('2027-01-02T10:00:00Z'));
    seed({ step: 'month' });
    const { reply } = await tap('rm:m:2026-12');

    expect(texts(reply)).toEqual([rt('ru', 'monthPassed'), rt('ru', 'askMonth')]);
    expect(data(replyKeyboard(reply, 1))).toEqual([
      ['rm:m:2027-01', 'rm:m:2027-02'],
      ['rm:m:2027-03', 'rm:m:2027-04'],
    ]);
    expect(row()).toMatchObject({ moveInMonth: null, step: 'month' });
  });

  it('a December button tapped at 00:30 Warsaw time on 1 January has passed', async () => {
    vi.setSystemTime(new Date('2026-12-31T23:30:00Z'));
    seed({ step: 'month' });
    const { reply } = await tap('rm:m:2026-12');

    expect(texts(reply)[0]).toBe(rt('ru', 'monthPassed'));
    expect(row().moveInMonth).toBeNull();
  });

  it.each(['rm:m:2027-13', 'rm:m:abc', 'rm:m:2027-09'])(
    '%s (not a month the step offers) is ignored',
    async (callbackData) => {
      seed({ step: 'month' });
      const { reply, answerCallbackQuery } = await tap(callbackData);

      expect(row()).toMatchObject({ moveInMonth: null, step: 'month' });
      expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
      expect(reply).not.toHaveBeenCalled();
      expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    },
  );

  it('a month button after the step moved on changes nothing', async () => {
    const month = new Date('2027-02-01T00:00:00.000Z');
    seed({ step: 'languages', moveInMonth: month });
    const { reply } = await tap('rm:m:2027-01');

    expect(texts(reply)[0]).toBe(rt('ru', 'stepDone'));
    expect(row()).toMatchObject({ step: 'languages', moveInMonth: month });
  });

  it('typed text at the month step passes on', async () => {
    seed({ step: 'month' });
    const { ctx } = fakeCtx();
    expect(await handleRoommateText(ctx, 'chat-row', 'ru', 'январь')).toBe('passed');
    expect(row().moveInMonth).toBeNull();
  });
});

describe('step 4: languages', () => {
  it('opens with the chat language ticked, two per row, then "Done"', async () => {
    seed({ step: 'month' });
    const { reply } = await tap('rm:m:2027-01');

    expect(row().languages).toEqual(['ru']);
    expect(reply.mock.calls[0][1]).toMatchObject({ parse_mode: 'HTML' });
    expect(labels(replyKeyboard(reply))).toEqual([
      ['Польский', 'Английский'],
      ['✓ Русский', 'Украинский'],
      ['Готово'],
    ]);
    expect(data(replyKeyboard(reply))).toEqual([
      ['rm:l:pl:1', 'rm:l:en:1'],
      ['rm:l:ru:0', 'rm:l:uk:1'],
      ['rm:l:done'],
    ]);
  });

  it.each([
    [
      'uk',
      ['uk'],
      [['Польська', 'Англійська'], ['Російська', '✓ Українська'], ['Готово']],
      [['rm:l:pl:1', 'rm:l:en:1'], ['rm:l:ru:1', 'rm:l:uk:0'], ['rm:l:done']],
    ],
    [
      'en',
      ['en'],
      [['Polish', '✓ English'], ['Russian', 'Ukrainian'], ['Done']],
      [['rm:l:pl:1', 'rm:l:en:0'], ['rm:l:ru:1', 'rm:l:uk:1'], ['rm:l:done']],
    ],
  ])(
    'a %s chat gets %j ticked in advance',
    async (locale, ticked, expectedLabels, expectedData) => {
      mocks.touchChat.mockResolvedValue({ ...CHAT, locale });
      seed({ step: 'month' });
      const { reply } = await tap('rm:m:2027-01');

      expect(row().languages).toEqual(ticked);
      expect(texts(reply)).toEqual([rt(locale as 'uk' | 'en', 'askLanguages')]);
      expect(labels(replyKeyboard(reply))).toEqual(expectedLabels);
      expect(data(replyKeyboard(reply))).toEqual(expectedData);
    },
  );

  it('a draft that already holds languages keeps them when the step opens', async () => {
    seed({ step: 'month', languages: ['pl'] });
    await tap('rm:m:2027-01');
    expect(row().languages).toEqual(['pl']);
  });

  it('a tap ticks the language in the same message, in button order', async () => {
    seed({ step: 'languages', languages: ['ru'] });
    const { reply, editMessageReplyMarkup, answerCallbackQuery } = await tap('rm:l:pl:1');

    expect(row()).toMatchObject({ languages: ['pl', 'ru'], step: 'languages' });
    expect(reply).not.toHaveBeenCalled();
    expect(data(editedKeyboard(editMessageReplyMarkup))).toEqual([
      ['rm:l:pl:0', 'rm:l:en:1'],
      ['rm:l:ru:0', 'rm:l:uk:1'],
      ['rm:l:done'],
    ]);
    expect(labels(editedKeyboard(editMessageReplyMarkup))[0]).toEqual(['✓ Польский', 'Английский']);
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
  });

  it('a repeated tap sets the same state instead of flipping it back', async () => {
    seed({ step: 'languages', languages: ['ru'] });
    await tap('rm:l:pl:1');
    const second = fakeCtx();
    second.editMessageReplyMarkup.mockRejectedValue(notModified());
    await expect(tap('rm:l:pl:1', second)).resolves.toBeDefined();

    expect(row().languages).toEqual(['pl', 'ru']);
    expect(second.answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it('the ✓ button (target state 0) unticks the language', async () => {
    seed({ step: 'languages', languages: ['pl', 'ru'] });
    const { editMessageReplyMarkup } = await tap('rm:l:ru:0');

    expect(row().languages).toEqual(['pl']);
    expect(editedKeyboard(editMessageReplyMarkup).flat()).toContainEqual({
      text: 'Русский',
      callback_data: 'rm:l:ru:1',
    });
  });

  it('"Done" without a language asks for one as the toast and stays at the step', async () => {
    seed({ step: 'languages', languages: ['ru'] });
    await tap('rm:l:ru:0');
    expect(row().languages).toEqual([]);

    const { reply, answerCallbackQuery } = await tap('rm:l:done');
    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: rt('ru', 'languagesEmpty') });
    expect(row().step).toBe('languages');
    expect(reply).not.toHaveBeenCalled();
  });

  it('"Done" with a language moves on to the own gender', async () => {
    seed({ step: 'languages', languages: ['pl', 'ru'] });
    const { reply } = await tap('rm:l:done');

    expect(row()).toMatchObject({ step: 'gender', languages: ['pl', 'ru'] });
    expect(texts(reply)).toEqual([rt('ru', 'askGender')]);
    expect(reply.mock.calls[0][1]).toMatchObject({ parse_mode: 'HTML' });
    expect(labels(replyKeyboard(reply))).toEqual([['Женщина', 'Мужчина'], ['Пропустить']]);
    expect(data(replyKeyboard(reply))).toEqual([['rm:g:woman', 'rm:g:man'], ['rm:g:skip']]);
  });

  it('a code outside the four languages is ignored', async () => {
    seed({ step: 'languages', languages: ['ru'] });
    const { reply, editMessageReplyMarkup, answerCallbackQuery } = await tap('rm:l:de:1');

    expect(row().languages).toEqual(['ru']);
    expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    expect(editMessageReplyMarkup).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it.each(['rm:l:pl:1', 'rm:l:ru:0', 'rm:l:done'])(
    '%s from an older message after the step moved on: "this step is done" and the current step',
    async (callbackData) => {
      seed({ step: 'gender', languages: ['ru'] });
      const { reply, editMessageReplyMarkup } = await tap(callbackData);

      expect(texts(reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askGender')]);
      expect(row()).toMatchObject({ step: 'gender', languages: ['ru'] });
      expect(editMessageReplyMarkup).not.toHaveBeenCalled();
    },
  );

  it('a toggle that loses the race to "Done" changes nothing', async () => {
    seed({ step: 'gender', languages: ['ru'] });
    db.roommateProfile.findUnique.mockResolvedValueOnce(
      profile({ step: 'languages', languages: ['ru'] }),
    );
    const { reply, editMessageReplyMarkup } = await tap('rm:l:pl:1');

    expect(row()).toMatchObject({ step: 'gender', languages: ['ru'] });
    expect(texts(reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askGender')]);
    expect(editMessageReplyMarkup).not.toHaveBeenCalled();
  });

  it('two "Done" taps at once advance the step once', async () => {
    seed({ step: 'languages', languages: ['ru'] });
    const first = fakeCtx();
    const second = fakeCtx();
    await Promise.all([tap('rm:l:done', first), tap('rm:l:done', second)]);

    expect(row().step).toBe('gender');
    expect([...texts(first.reply), ...texts(second.reply)].sort()).toEqual(
      [rt('ru', 'askGender'), rt('ru', 'askGender'), rt('ru', 'stepDone')].sort(),
    );
  });

  it('a draft reopened at the step shows its ticked languages', async () => {
    seed({ step: 'languages', languages: ['en', 'uk'] });
    const { ctx, reply } = fakeCtx();
    await handleMate(ctx as CommandContext<Context>);

    expect(texts(reply)).toEqual([rt('ru', 'askLanguages')]);
    expect(data(replyKeyboard(reply))).toEqual([
      ['rm:l:pl:1', 'rm:l:en:0'],
      ['rm:l:ru:1', 'rm:l:uk:0'],
      ['rm:l:done'],
    ]);
  });
});

describe('steps 5 and 6: own gender and "live with" (FR-8)', () => {
  it.each([
    ['ru', 'только для взаимного подбора и никому не показывается'],
    ['uk', 'лише для взаємного підбору й нікому не показується'],
    ['en', 'Used only for mutual matching and never shown to anyone'],
  ] as const)(
    'the %s wording says why both are asked and that they are never shown',
    (locale, why) => {
      expect(rt(locale, 'askGender')).toContain(why);
      expect(rt(locale, 'askPrefers')).toContain(why);
    },
  );

  it('the wording is the PRD 3 §8 draft split over the two steps', () => {
    expect(rt('ru', 'askGender')).toContain(
      'Необязательно. Кто ты: женщина / мужчина / пропустить.',
    );
    expect(rt('ru', 'askPrefers')).toContain(
      'С кем готов(а) жить: с кем угодно / с женщинами / с мужчинами.',
    );
    expect(rt('uk', 'askGender')).toContain('Необовʼязково. Хто ти: жінка / чоловік / пропустити.');
    expect(rt('uk', 'askPrefers')).toContain(
      'З ким готовий(-а) жити: з ким завгодно / з жінками / з чоловіками.',
    );
    expect(rt('en', 'askGender')).toContain('Optional. You are: a woman / a man / skip.');
    expect(rt('en', 'askPrefers')).toContain("Who you'd live with: anyone / women / men.");
  });

  it.each([
    ['rm:g:woman', 'woman'],
    ['rm:g:man', 'man'],
    ['rm:g:skip', null],
  ])('%s stores gender %j and moves on to "live with"', async (callbackData, gender) => {
    seed({ step: 'gender', languages: ['ru'] });
    const { reply } = await tap(callbackData);

    expect(row()).toMatchObject({ gender, step: 'prefers', prefers: 'anyone' });
    expect(texts(reply)).toEqual([rt('ru', 'askPrefers')]);
    expect(reply.mock.calls[0][1]).toMatchObject({ parse_mode: 'HTML' });
    expect(labels(replyKeyboard(reply))).toEqual([
      ['С кем угодно'],
      ['С женщинами', 'С мужчинами'],
    ]);
    expect(data(replyKeyboard(reply))).toEqual([['rm:p:anyone'], ['rm:p:women', 'rm:p:men']]);
  });

  it('writes the gender and "live with" buttons in the chat locale', async () => {
    mocks.touchChat.mockResolvedValue({ ...CHAT, locale: 'uk' });
    seed({ step: 'languages', languages: ['uk'] });
    const gender = await tap('rm:l:done');
    const prefers = await tap('rm:g:woman');

    expect(texts(gender.reply)).toEqual([rt('uk', 'askGender')]);
    expect(labels(replyKeyboard(gender.reply))).toEqual([['Жінка', 'Чоловік'], ['Пропустити']]);
    expect(texts(prefers.reply)).toEqual([rt('uk', 'askPrefers')]);
    expect(labels(replyKeyboard(prefers.reply))).toEqual([
      ['З ким завгодно'],
      ['З жінками', 'З чоловіками'],
    ]);
  });

  it.each([
    ['rm:p:anyone', 'anyone'],
    ['rm:p:women', 'women'],
    ['rm:p:men', 'men'],
  ])('%s stores "live with" %j and moves on to the short text', async (callbackData, prefers) => {
    seed({ step: 'prefers', gender: 'man' });
    await tap(callbackData);
    expect(row()).toMatchObject({ gender: 'man', prefers, step: 'about' });
  });

  it('"women" without an own gender is stored as chosen', async () => {
    seed({ step: 'prefers', gender: null });
    await tap('rm:p:women');
    expect(row()).toMatchObject({ gender: null, prefers: 'women', step: 'about' });
  });

  it('skipping both stores gender=null and prefers=anyone', async () => {
    seed({ step: 'gender', gender: 'woman', prefers: 'men' });
    await tap('rm:g:skip');
    await tap('rm:p:anyone');
    expect(row()).toMatchObject({ gender: null, prefers: 'anyone', step: 'about' });
  });

  it.each([
    ['rm:g:other', 'gender'],
    ['rm:g:women', 'gender'],
    ['rm:p:skip', 'prefers'],
    ['rm:p:woman', 'prefers'],
  ])('%s (not a value the step offers) is ignored', async (callbackData, step) => {
    seed({ step });
    const { reply, answerCallbackQuery } = await tap(callbackData);

    expect(row()).toMatchObject({ step, gender: null, prefers: 'anyone' });
    expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it('a gender button after the step moved on changes nothing', async () => {
    seed({ step: 'prefers', gender: 'woman' });
    const { reply } = await tap('rm:g:man');

    expect(texts(reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askPrefers')]);
    expect(row()).toMatchObject({ step: 'prefers', gender: 'woman' });
  });

  it('a "live with" button after the step moved on changes nothing', async () => {
    seed({ step: 'about', prefers: 'men' });
    const { reply } = await tap('rm:p:women');

    expect(texts(reply)[0]).toBe(rt('ru', 'stepDone'));
    expect(row()).toMatchObject({ step: 'about', prefers: 'men' });
  });

  it('two gender taps at once store one answer and advance once', async () => {
    seed({ step: 'gender' });
    const first = fakeCtx();
    const second = fakeCtx();
    await Promise.all([tap('rm:g:woman', first), tap('rm:g:man', second)]);

    expect(row().step).toBe('prefers');
    expect(['woman', 'man']).toContain(row().gender);
    expect([...texts(first.reply), ...texts(second.reply)].sort()).toEqual(
      [rt('ru', 'askPrefers'), rt('ru', 'askPrefers'), rt('ru', 'stepDone')].sort(),
    );
  });

  it.each(['languages', 'gender', 'prefers'])(
    'typed text at the %s step passes on and the step stays open',
    async (step) => {
      seed({ step, languages: ['ru'] });
      const { ctx, reply } = fakeCtx();

      expect(await handleRoommateText(ctx, 'chat-row', 'ru', 'женщина')).toBe('passed');
      expect(row()).toMatchObject({ step, gender: null, prefers: 'anyone', languages: ['ru'] });
      expect(reply).not.toHaveBeenCalled();
    },
  );

  it('neither step sends an event', async () => {
    seed({ step: 'gender' });
    await tap('rm:g:woman');
    await tap('rm:p:women');
    expect(mocks.track).not.toHaveBeenCalled();
  });
});

describe('step 7: the short text (FR-10)', () => {
  const ACCEPTED = 'Pracuję w IT, spokojna, nie palę';

  it('asks for a few words, not sensitive facts, with one "Skip" button', async () => {
    seed({ step: 'prefers' });
    const { reply } = await tap('rm:p:anyone');

    expect(texts(reply)).toEqual([rt('ru', 'askAbout')]);
    expect(reply.mock.calls[0][1]).toMatchObject({ parse_mode: 'HTML' });
    expect(labels(replyKeyboard(reply))).toEqual([['Пропустить']]);
    expect(data(replyKeyboard(reply))).toEqual([['rm:t:skip']]);
  });

  it.each([
    ['ru', 'Не пиши о здоровье, религии и других личных вещах'],
    ['uk', 'Не пиши про здоровʼя, релігію та інші особисті речі'],
    ['en', "Don't include health, religion or other personal details"],
  ] as const)('the %s question asks not to write sensitive facts', (locale, ask) => {
    expect(rt(locale, 'askAbout')).toContain(ask);
    expect(rt(locale, 'askAbout')).toContain('280');
  });

  it('accepted text is stored and the intake moves on to smoking', async () => {
    seed({ step: 'about' });
    const { ctx, reply } = fakeCtx();

    expect(await handleRoommateText(ctx, 'chat-row', 'ru', ACCEPTED)).toBe('used');
    expect(row()).toMatchObject({ about: ACCEPTED, step: 'smoking' });
    expect(texts(reply)).toEqual([rt('ru', 'askSmoking')]);
  });

  it('accepts "Мне 25, есть 2 кота" and exactly 280 characters', async () => {
    seed({ step: 'about' });
    expect(await handleRoommateText(fakeCtx().ctx, 'chat-row', 'ru', 'Мне 25, есть 2 кота')).toBe(
      'used',
    );
    expect(row()).toMatchObject({ about: 'Мне 25, есть 2 кота', step: 'smoking' });

    seed({ step: 'about' });
    expect(await handleRoommateText(fakeCtx().ctx, 'chat-row', 'ru', 'a'.repeat(280))).toBe('used');
    expect(row()).toMatchObject({ about: 'a'.repeat(280), step: 'smoking' });
  });

  it('stores the text NFKC-normalised and trimmed', async () => {
    seed({ step: 'about' });
    await handleRoommateText(fakeCtx().ctx, 'chat-row', 'ru', '  ｓｐｏｋｏｊｎａ  ');
    expect(row()).toMatchObject({ about: 'spokojna', step: 'smoking' });
  });

  it.each([
    ['пиши @anna_w', 'foundHandle', '@ник'],
    ['zadzwoń 501 234 567', 'foundPhone', 'номер телефона'],
    ['see https://x.pl', 'foundLink', 'ссылка'],
    ['PL61109010140000071219812874', 'foundIban', 'номер банковского счёта'],
    ['anna@x.pl', 'foundEmail', 'e-mail'],
    ['звони ５０１ ２３４ ５６７', 'foundPhone', 'номер телефона'],
  ] as const)(
    '%j is refused naming %s; nothing is stored and the step stays open',
    async (text, foundKey, word) => {
      seed({ step: 'about' });
      const { ctx, reply } = fakeCtx();

      expect(await handleRoommateText(ctx, 'chat-row', 'ru', text)).toBe('used');
      expect(texts(reply)).toEqual([rt('ru', 'aboutRefused', { found: rt('ru', foundKey) })]);
      expect(texts(reply)[0]).toContain(word);
      // The reply never echoes the person's text.
      expect(texts(reply)[0]).not.toContain(text);
      expect(row()).toMatchObject({ about: null, step: 'about' });
      expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
    },
  );

  it('281 characters are refused with the limit and the length', async () => {
    seed({ step: 'about' });
    const { ctx, reply } = fakeCtx();

    expect(await handleRoommateText(ctx, 'chat-row', 'ru', 'a'.repeat(281))).toBe('used');
    expect(texts(reply)).toEqual([rt('ru', 'aboutTooLong', { max: '280', length: '281' })]);
    expect(texts(reply)[0]).toContain('280');
    expect(texts(reply)[0]).toContain('281');
    expect(row()).toMatchObject({ about: null, step: 'about' });
  });

  it('writes the refusal in the chat locale', async () => {
    seed({ step: 'about' });
    const { ctx, reply } = fakeCtx();

    await handleRoommateText(ctx, 'chat-row', 'uk', 'пиши @anna_w');
    expect(texts(reply)).toEqual([rt('uk', 'aboutRefused', { found: '@нік' })]);
  });

  it('a corrected text after a refusal is accepted', async () => {
    seed({ step: 'about' });
    await handleRoommateText(fakeCtx().ctx, 'chat-row', 'ru', 'zadzwoń 501 234 567');
    await handleRoommateText(fakeCtx().ctx, 'chat-row', 'ru', ACCEPTED);
    expect(row()).toMatchObject({ about: ACCEPTED, step: 'smoking' });
  });

  it.each([
    ['spaces', '   '],
    ['no-break spaces', `${NBSP} ${NBSP}`],
  ])('only %s is a skip: no text is stored and the intake moves on', async (_name, text) => {
    seed({ step: 'about' });
    const { ctx, reply } = fakeCtx();

    expect(await handleRoommateText(ctx, 'chat-row', 'ru', text)).toBe('used');
    expect(row()).toMatchObject({ about: null, step: 'smoking' });
    expect(texts(reply)).toEqual([rt('ru', 'askSmoking')]);
  });

  it('"Skip" stores no text and moves on to smoking', async () => {
    seed({ step: 'about', about: 'старый текст' });
    const { reply } = await tap('rm:t:skip');

    expect(row()).toMatchObject({ about: null, step: 'smoking' });
    expect(texts(reply)).toEqual([rt('ru', 'askSmoking')]);
  });

  it('"Skip" after the step moved on changes nothing', async () => {
    seed({ step: 'smoking', about: ACCEPTED });
    const { reply } = await tap('rm:t:skip');

    expect(texts(reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askSmoking')]);
    expect(row()).toMatchObject({ about: ACCEPTED, step: 'smoking' });
  });

  it('a typed text after the step moved on (a lost race) changes nothing', async () => {
    seed({ step: 'smoking', about: null });
    db.roommateProfile.findUnique.mockResolvedValueOnce(profile({ step: 'about' }));
    const { ctx, reply } = fakeCtx();

    expect(await handleRoommateText(ctx, 'chat-row', 'ru', ACCEPTED)).toBe('used');
    expect(row()).toMatchObject({ about: null, step: 'smoking' });
    expect(texts(reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askSmoking')]);
  });

  it('neither path sends an event or logs anything', async () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    seed({ step: 'about' });
    await handleRoommateText(fakeCtx().ctx, 'chat-row', 'ru', 'пиши @anna_w');
    await handleRoommateText(fakeCtx().ctx, 'chat-row', 'ru', ACCEPTED);

    expect(mocks.track).not.toHaveBeenCalled();
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});

describe('step 8: smoking and pets (FR-11)', () => {
  it('asks about smoking with one option per row, then "Skip"', async () => {
    seed({ step: 'about' });
    const { reply } = await tap('rm:t:skip');

    expect(texts(reply)).toEqual([rt('ru', 'askSmoking')]);
    expect(reply.mock.calls[0][1]).toMatchObject({ parse_mode: 'HTML' });
    expect(labels(replyKeyboard(reply))).toEqual([
      ['Без курения'],
      ['Только на улице'],
      ['Можно курить'],
      ['Пропустить'],
    ]);
    expect(data(replyKeyboard(reply))).toEqual([
      ['rm:s:no'],
      ['rm:s:outside'],
      ['rm:s:fine'],
      ['rm:s:skip'],
    ]);
  });

  it.each([
    ['rm:s:no', 'no'],
    ['rm:s:outside', 'outside'],
    ['rm:s:fine', 'fine'],
    ['rm:s:skip', null],
  ])('%s stores smoking %j and asks about pets', async (callbackData, smoking) => {
    seed({ step: 'smoking' });
    const { reply } = await tap(callbackData);

    expect(row()).toMatchObject({ smoking, step: 'pets', pets: null });
    expect(texts(reply)).toEqual([rt('ru', 'askPets')]);
    expect(reply.mock.calls[0][1]).toMatchObject({ parse_mode: 'HTML' });
    expect(labels(replyKeyboard(reply))).toEqual([
      ['Без животных'],
      ['У меня есть питомец'],
      ['Не против животных'],
      ['Пропустить'],
    ]);
    expect(data(replyKeyboard(reply))).toEqual([
      ['rm:pt:no'],
      ['rm:pt:have'],
      ['rm:pt:fine'],
      ['rm:pt:skip'],
    ]);
  });

  it.each([
    ['rm:pt:no', 'no'],
    ['rm:pt:have', 'have'],
    ['rm:pt:fine', 'fine'],
    ['rm:pt:skip', null],
  ])('%s stores pets %j and moves on to the 18+ step', async (callbackData, pets) => {
    seed({ step: 'pets', smoking: 'outside' });
    await tap(callbackData);
    expect(row()).toMatchObject({ smoking: 'outside', pets, step: 'adult' });
  });

  it('"Skip" stores null over an earlier answer', async () => {
    seed({ step: 'smoking', smoking: 'fine', pets: 'have' });
    await tap('rm:s:skip');
    await tap('rm:pt:skip');
    expect(row()).toMatchObject({ smoking: null, pets: null, step: 'adult' });
  });

  it('writes the smoking and pets buttons in the chat locale', async () => {
    mocks.touchChat.mockResolvedValue({ ...CHAT, locale: 'uk' });
    seed({ step: 'about' });
    const smoking = await tap('rm:t:skip');
    const pets = await tap('rm:s:no');

    expect(texts(smoking.reply)).toEqual([rt('uk', 'askSmoking')]);
    expect(labels(replyKeyboard(smoking.reply))).toEqual([
      ['Без куріння'],
      ['Лише надворі'],
      ['Можна курити'],
      ['Пропустити'],
    ]);
    expect(texts(pets.reply)).toEqual([rt('uk', 'askPets')]);
    expect(labels(replyKeyboard(pets.reply))).toEqual([
      ['Без тварин'],
      ['У мене є улюбленець'],
      ['Не проти тварин'],
      ['Пропустити'],
    ]);
  });

  it.each([
    ['rm:s:have', 'smoking'],
    ['rm:s:yes', 'smoking'],
    ['rm:pt:outside', 'pets'],
    ['rm:pt:cat', 'pets'],
  ])('%s (not a value the step offers) is ignored', async (callbackData, step) => {
    seed({ step });
    const { reply, answerCallbackQuery } = await tap(callbackData);

    expect(row()).toMatchObject({ step, smoking: null, pets: null });
    expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it('a smoking button after the step moved on changes nothing', async () => {
    seed({ step: 'pets', smoking: 'no' });
    const { reply } = await tap('rm:s:fine');

    expect(texts(reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askPets')]);
    expect(row()).toMatchObject({ step: 'pets', smoking: 'no' });
  });

  it('a pets button after the step moved on changes nothing', async () => {
    seed({ step: 'adult', pets: 'have' });
    const { reply } = await tap('rm:pt:no');

    expect(texts(reply)[0]).toBe(rt('ru', 'stepDone'));
    expect(row()).toMatchObject({ step: 'adult', pets: 'have' });
  });

  it('two smoking taps at once store one answer and advance once', async () => {
    seed({ step: 'smoking' });
    const first = fakeCtx();
    const second = fakeCtx();
    await Promise.all([tap('rm:s:no', first), tap('rm:s:fine', second)]);

    expect(row().step).toBe('pets');
    expect(['no', 'fine']).toContain(row().smoking);
    expect([...texts(first.reply), ...texts(second.reply)].sort()).toEqual(
      [rt('ru', 'askPets'), rt('ru', 'askPets'), rt('ru', 'stepDone')].sort(),
    );
  });

  it.each(['smoking', 'pets'])(
    'typed text at the %s step passes on and the step stays open',
    async (step) => {
      seed({ step });
      const { ctx, reply } = fakeCtx();

      expect(await handleRoommateText(ctx, 'chat-row', 'ru', 'не курю')).toBe('passed');
      expect(row()).toMatchObject({ step, smoking: null, pets: null });
      expect(reply).not.toHaveBeenCalled();
    },
  );

  it('neither step sends an event', async () => {
    seed({ step: 'smoking' });
    await tap('rm:s:outside');
    await tap('rm:pt:have');
    expect(mocks.track).not.toHaveBeenCalled();
  });
});

describe('step 9: 18+ and the save (FR-9, FR-12)', () => {
  /** A draft that answered steps 1 – 8, at the 18+ step. */
  const READY = {
    step: 'adult',
    districtSlugs: ['wola', 'mokotow'],
    budgetBand: 'b3',
    moveInMonth: new Date('2027-02-01T00:00:00.000Z'),
    languages: ['en', 'ru'],
    gender: 'woman',
    prefers: 'women',
    about: 'Мне 25, есть 2 кота',
    smoking: 'outside',
    pets: null,
  } satisfies Partial<RoommateProfile>;

  /** NOW + 30 days: February ends later (spec 06 §Retention). */
  const EXPIRES = '2027-01-04T10:00:00.000Z';

  const created = () =>
    mocks.track.mock.calls.filter(([, event]) => event === 'tg_roommate_profile_created');

  it('asks for the 18+ confirmation after pets, "I\'m 18+" above "I\'m under 18"', async () => {
    seed({ step: 'pets' });
    const { reply } = await tap('rm:pt:fine');

    expect(texts(reply)).toEqual([rt('ru', 'askAdult')]);
    expect(reply.mock.calls[0][1]).toMatchObject({ parse_mode: 'HTML' });
    expect(labels(replyKeyboard(reply))).toEqual([['Мне 18+'], ['Мне меньше 18']]);
    expect(data(replyKeyboard(reply))).toEqual([['rm:a:yes'], ['rm:a:no']]);
  });

  it('writes the 18+ step in the chat locale', async () => {
    mocks.touchChat.mockResolvedValue({ ...CHAT, locale: 'uk' });
    seed({ step: 'pets' });
    const { reply } = await tap('rm:pt:skip');

    expect(texts(reply)).toEqual([rt('uk', 'askAdult')]);
    expect(labels(replyKeyboard(reply))).toEqual([['Мені 18+'], ['Мені менше 18']]);
  });

  it('"I\'m 18+" saves the draft with the conditional update of §Save', async () => {
    seed(READY);
    await tap('rm:a:yes');

    expect(db.roommateProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'profile-1', status: 'draft' },
      data: {
        status: 'active',
        step: null,
        activatedAt: NOW,
        expiresAt: new Date(EXPIRES),
        adultConfirmedAt: NOW,
      },
    });
    expect(db.rows).toHaveLength(1);
    expect(row()).toMatchObject({ ...READY, status: 'active', step: null });
    expect(row().activatedAt?.toISOString()).toBe(NOW.toISOString());
    expect(row().adultConfirmedAt?.toISOString()).toBe(NOW.toISOString());
    expect(row().expiresAt?.toISOString()).toBe(EXPIRES);
  });

  it('hides at the end of the move-in month when it comes before 30 days', async () => {
    seed({ ...READY, moveInMonth: new Date('2026-12-01T00:00:00.000Z') });
    await tap('rm:a:yes');
    expect(row().expiresAt?.toISOString()).toBe('2026-12-31T22:59:59.000Z');
  });

  it('sends one tg_roommate_profile_created with exactly the properties of §Events', async () => {
    seed(READY);
    await tap('rm:a:yes');

    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_roommate_profile_created', {
      district_count: 2,
      any_district: false,
      budget_band: 'b3',
      move_in_offset_months: 2,
      language_count: 2,
      has_text: true,
      rule_count: 1,
      entry_source: 'tg',
      has_username: true,
    });
    // No gender, "live with", text, username or district slug reaches analytics (D51).
    expect(JSON.stringify(mocks.track.mock.calls)).not.toMatch(
      /woman|women|кота|anna|wola|mokotow|outside/,
    );
  });

  it('sends the minimal profile\'s properties for "any", no text and no rules', async () => {
    seed({
      step: 'adult',
      anyDistrict: true,
      budgetBand: 'b1',
      moveInMonth: new Date('2026-12-01T00:00:00.000Z'),
      languages: ['ru'],
      entrySource: 'bot_menu',
    });
    await tap('rm:a:yes');

    expect(created()).toEqual([
      [
        CHAT_ID,
        'tg_roommate_profile_created',
        {
          district_count: 0,
          any_district: true,
          budget_band: 'b1',
          move_in_offset_months: 0,
          language_count: 1,
          has_text: false,
          rule_count: 0,
          entry_source: 'bot_menu',
          has_username: true,
        },
      ],
    ]);
  });

  it('has_username is the username at the save, which is stored too', async () => {
    seed(READY);
    await tap('rm:a:yes', fakeCtx({ username: null }));

    expect(created()[0][2]).toMatchObject({ has_username: false });
    expect(row().tgUsername).toBeNull();
  });

  it('ends with the own card of the saved profile, then the counts reply', async () => {
    seed(READY);
    const { reply } = await tap('rm:a:yes');

    expect(texts(reply)).toHaveLength(2);
    // The person's own profile is never counted, so a first profile reads "nobody else yet".
    expect(texts(reply)[1]).toBe(`${rt('ru', 'countsNobodyElse')} ${rt('ru', 'countsOpensLater')}`);
    const card = texts(reply)[0] as string;
    expect(card.startsWith(`${rt('ru', 'cardHeader')}\n\n`)).toBe(true);
    expect(card).toContain('Районы: Wola, Mokotów');
    expect(card).toContain('Пол: Женщина');
    expect(card).toContain('Анкета скроется 4 января 2027.');
    expect(reply.mock.calls[0][1]).toMatchObject({ parse_mode: 'HTML' });
    expect(data(replyKeyboard(reply))).toEqual([
      ['rm:c:edit', 'rm:c:del'],
      ['rm:c:counts'],
      ['rm:c:optin'],
    ]);
  });

  it('a double tap on "I\'m 18+" gives one active row, one event, one card and one counts reply', async () => {
    seed(READY);
    const first = fakeCtx();
    const second = fakeCtx();
    await Promise.all([tap('rm:a:yes', first), tap('rm:a:yes', second)]);

    expect(db.rows).toHaveLength(1);
    expect(row()).toMatchObject({ status: 'active', step: null });
    expect(created()).toHaveLength(1);
    const replies = [...texts(first.reply), ...texts(second.reply)] as string[];
    expect(replies).toHaveLength(3);
    expect(replies.filter((text) => text.startsWith(rt('ru', 'cardHeader')))).toHaveLength(1);
    expect(replies.filter((text) => text.startsWith(rt('ru', 'countsNobodyElse')))).toHaveLength(1);
    expect(replies).toContain(rt('ru', 'stepDone'));
  });

  it('a second tap after the save says the step is done and sends nothing else', async () => {
    seed(READY);
    await tap('rm:a:yes');
    const again = await tap('rm:a:yes');

    expect(texts(again.reply)).toEqual([rt('ru', 'stepDone')]);
    expect(created()).toHaveLength(1);
    expect(row().activatedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it('an "I\'m 18+" button while the draft is still at pets saves nothing', async () => {
    seed({ ...READY, step: 'pets' });
    const { reply } = await tap('rm:a:yes');

    expect(texts(reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askPets')]);
    expect(row()).toMatchObject({ status: 'draft', step: 'pets', activatedAt: null });
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('"I\'m under 18" deletes the draft at once and says nothing was saved', async () => {
    seed(READY);
    const { reply, answerCallbackQuery } = await tap('rm:a:no');

    expect(db.roommateProfile.deleteMany).toHaveBeenCalledWith({
      where: { id: 'profile-1', status: 'draft' },
    });
    expect(db.rows).toHaveLength(0);
    expect(texts(reply)).toEqual([rt('ru', 'underAge')]);
    expect(rt('ru', 'underAge')).toContain('ничего не сохранили');
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('says it in the chat locale', async () => {
    mocks.touchChat.mockResolvedValue({ ...CHAT, locale: 'uk' });
    seed(READY);
    const { reply } = await tap('rm:a:no');
    expect(texts(reply)).toEqual([rt('uk', 'underAge')]);
  });

  it('a second "I\'m under 18" tap after the delete changes nothing', async () => {
    seed(READY);
    await tap('rm:a:no');
    const again = await tap('rm:a:no');

    expect(texts(again.reply)).toEqual([rt('ru', 'stepDone')]);
    expect(db.rows).toHaveLength(0);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('"I\'m under 18" after the save leaves the saved profile as it is', async () => {
    seed(READY);
    await tap('rm:a:yes');
    const late = await tap('rm:a:no');

    expect(texts(late.reply)).toEqual([rt('ru', 'stepDone')]);
    expect(row()).toMatchObject({ status: 'active' });
  });

  it('after "I\'m under 18" nothing is kept: /mate starts a new draft', async () => {
    seed(READY);
    await tap('rm:a:no');
    const start = fakeCtx();
    await handleMate(start.ctx as CommandContext<Context>);

    expect(db.rows).toHaveLength(1);
    expect(row()).toMatchObject({ status: 'draft', step: 'districts', districtSlugs: [] });
    expect(mocks.track.mock.calls.map(([, event]) => event)).toEqual(['tg_roommate_flow_started']);
  });

  it('typed text at the 18+ step passes on and the step stays open', async () => {
    seed(READY);
    const { ctx, reply } = fakeCtx();

    expect(await handleRoommateText(ctx, 'chat-row', 'ru', 'мне 25')).toBe('passed');
    expect(row()).toMatchObject({ status: 'draft', step: 'adult' });
    expect(reply).not.toHaveBeenCalled();
  });
});

describe('steps 1 – 9 in one run', () => {
  it('/mate through pets leaves one draft at the 18+ step, "I\'m 18+" makes it one active row', async () => {
    const start = fakeCtx();
    await handleMate(start.ctx as CommandContext<Context>);
    expect(texts(start.reply)[1]).toBe(askDistricts());

    await tap('rm:d:wola:1');
    await tap('rm:d:mokotow:1');
    await tap('rm:d:done');
    const typed = fakeCtx();
    expect(await handleRoommateText(typed.ctx, 'chat-row', 'ru', '1 650 zł')).toBe('used');
    await tap('rm:m:2027-02');
    expect(row()).toMatchObject({ step: 'languages', languages: ['ru'] });
    await tap('rm:l:en:1');
    await tap('rm:l:done');
    await tap('rm:g:skip');
    await tap('rm:p:women');
    const about = fakeCtx();
    expect(await handleRoommateText(about.ctx, 'chat-row', 'ru', 'пиши @anna_w')).toBe('used');
    expect(await handleRoommateText(about.ctx, 'chat-row', 'ru', 'Мне 25, есть 2 кота')).toBe(
      'used',
    );
    await tap('rm:s:outside');
    await tap('rm:pt:skip');

    expect(db.rows).toHaveLength(1);
    expect(row()).toMatchObject({
      status: 'draft',
      step: 'adult',
      districtSlugs: ['wola', 'mokotow'],
      anyDistrict: false,
      budgetBand: 'b3',
      languages: ['en', 'ru'],
      gender: null,
      prefers: 'women',
      about: 'Мне 25, есть 2 кота',
      smoking: 'outside',
      pets: null,
    });
    expect(row().moveInMonth?.toISOString()).toBe('2027-02-01T00:00:00.000Z');
    // The intake steps send no event; only the start of the flow does (spec 06 §Events), and
    // nothing about gender, "live with" or the short text reaches analytics (D51).
    expect(mocks.track.mock.calls.map(([, event]) => event)).toEqual(['tg_roommate_flow_started']);

    const saved = await tap('rm:a:yes');
    expect(db.rows).toHaveLength(1);
    expect(row()).toMatchObject({ status: 'active', step: null, budgetBand: 'b3' });
    expect(texts(saved.reply)[0]).toMatch(/^🏠 <b>Твоя анкета<\/b>/);
    expect(mocks.track.mock.calls.map(([, event]) => event)).toEqual([
      'tg_roommate_flow_started',
      'tg_roommate_profile_created',
    ]);
    expect(JSON.stringify(mocks.track.mock.calls)).not.toMatch(
      /gender|prefers|wom[ae]n|\bm[ae]n\b|anna|кота|smoking|outside|wola|mokotow/,
    );
  });
});
