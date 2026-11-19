import type { RoommateProfile } from '@prisma/client';
import { GrammyError, type Bot, type CommandContext, type Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Intake steps 1 – 3 (spec 06 §Intake steps: districts, budget, move-in month) with the
 * callback data of §Entry and routing and the "Stale and repeated taps" rule. Taps go through
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
      updateMany: vi.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
          const hits = rows.filter((row) => matches(row, where));
          for (const row of hits) Object.assign(row, structuredClone(data));
          return { count: hits.length };
        },
      ),
      deleteMany: vi.fn(),
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
  MONTH_TAP,
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

describe('callback data of spec 06 §Entry and routing, steps 1 – 3', () => {
  it.each([
    ['rm:start', 'rm:start'],
    ['rm:d:wola:1', DISTRICT_TOGGLE],
    ['rm:d:praga-poludnie:0', DISTRICT_TOGGLE],
    ['rm:d:any', 'rm:d:any'],
    ['rm:d:done', 'rm:d:done'],
    ['rm:b:b3', BUDGET_TAP],
    ['rm:m:2026-12', MONTH_TAP],
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
    await tap('rm:m:2027-01');

    expect(row().moveInMonth?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(row().step).toBe('languages');
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

describe('steps 1 – 3 in one run', () => {
  it('/mate, two districts, a typed budget and a month leave one draft at the languages step', async () => {
    const start = fakeCtx();
    await handleMate(start.ctx as CommandContext<Context>);
    expect(texts(start.reply)[1]).toBe(askDistricts());

    await tap('rm:d:wola:1');
    await tap('rm:d:mokotow:1');
    await tap('rm:d:done');
    const typed = fakeCtx();
    expect(await handleRoommateText(typed.ctx, 'chat-row', 'ru', '1 650 zł')).toBe('used');
    await tap('rm:m:2027-02');

    expect(db.rows).toHaveLength(1);
    expect(row()).toMatchObject({
      status: 'draft',
      step: 'languages',
      districtSlugs: ['wola', 'mokotow'],
      anyDistrict: false,
      budgetBand: 'b3',
    });
    expect(row().moveInMonth?.toISOString()).toBe('2027-02-01T00:00:00.000Z');
    // The intake steps send no event; only the start of the flow does (spec 06 §Events).
    expect(mocks.track.mock.calls.map(([, event]) => event)).toEqual(['tg_roommate_flow_started']);
  });
});
