import type { RoommateProfile } from '@prisma/client';
import { type Bot, type Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Edit one field from the own card (FR-12; spec 06 §Save and the own card, Edit): the field
 * picker (`rm:c:edit` → `rm:e:<field>`), each field reusing its intake step as `edit_<field>` on
 * the saved profile (which stays active), the answer changing only that field and returning to
 * the card with one `tg_roommate_profile_edited` (`field` only), the expiry rule of a month edit,
 * and typed text during `edit_about`. Taps go through the handlers `registerRoommateFlow`
 * registers, over an in-memory Prisma fake whose `updateMany` applies its `where`. Nothing reaches
 * Telegram or a database.
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

import { EDIT_FIELDS } from '@/lib/roommate/rules';

import {
  EDIT_PICK,
  PETS_TAP,
  PREFERS_TAP,
  cancelRoommate,
  handleRoommateText,
  registerRoommateFlow,
} from './roommate-flow';
import { rt } from './roommate-texts';

const CHAT_ID = 4242;
const CHAT = { id: 'chat-row', locale: 'ru', isNew: false };
const NOW = new Date('2026-12-05T10:00:00Z');
/** `computeExpiresAt(NOW, January 2027)`: the 30 days end first. */
const EXPIRES = new Date('2027-01-04T10:00:00.000Z');

const DISTRICTS = [
  { id: 'd1', slug: 'wola', nameKey: 'Wola' },
  { id: 'd2', slug: 'mokotow', nameKey: 'Mokotów' },
  { id: 'd3', slug: 'ochota', nameKey: 'Ochota' },
  { id: 'd4', slug: 'bielany', nameKey: 'Bielany' },
];

/** A saved (active) profile with every field answered. */
function saved(fields: Partial<RoommateProfile> = {}): RoommateProfile {
  return {
    id: 'profile-1',
    chatId: 'chat-row',
    status: 'active',
    step: null,
    entrySource: 'tg',
    districtSlugs: ['mokotow'],
    anyDistrict: false,
    budgetBand: 'b2',
    moveInMonth: new Date('2027-01-01T00:00:00.000Z'),
    languages: ['ru'],
    gender: 'woman',
    prefers: 'anyone',
    about: 'Тихая, работаю в IT',
    smoking: 'no',
    pets: null,
    adultConfirmedAt: NOW,
    tgUsername: 'anna_w',
    activatedAt: NOW,
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
}

/** The chat's one profile row; returns a copy of it as seeded. */
function seed(fields: Partial<RoommateProfile> = {}): RoommateProfile {
  db.rows.length = 0;
  const row = saved(fields);
  db.rows.push(row);
  return structuredClone(row);
}

const row = () => db.rows[0];

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

type Button = { text: string; callback_data?: string };
type Markup = { inline_keyboard: Button[][] };

function fakeCtx() {
  const reply = vi.fn().mockResolvedValue({});
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const editMessageReplyMarkup = vi.fn().mockResolvedValue(true);
  const ctx = {
    chat: { id: CHAT_ID },
    from: { id: CHAT_ID, username: 'anna_w' },
    message: { text: 'x' },
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

/** Typed text, as `handleText` hands it to the roommate flow first. */
async function type(text: string, fake = fakeCtx()) {
  const result = await handleRoommateText(fake.ctx, CHAT.id, 'ru', text);
  return { ...fake, result };
}

const texts = (reply: ReturnType<typeof vi.fn>) => reply.mock.calls.map((call) => call[0]);

function replyKeyboard(reply: ReturnType<typeof vi.fn>, index = 0): Button[][] {
  const markup = reply.mock.calls[index][1]?.reply_markup as Markup | undefined;
  return markup?.inline_keyboard ?? [];
}

const labels = (rows: Button[][]) => rows.map((r) => r.map((b) => b.text));
const data = (rows: Button[][]) => rows.map((r) => r.map((b) => b.callback_data));
const plain = (text: string) => text.replace(/\s/g, (space) => (space === '\n' ? '\n' : ' '));

const edited = (field: string) => [CHAT_ID, 'tg_roommate_profile_edited', { field }];

/** The question each field's edit opens with: its intake step's question. */
const QUESTIONS = {
  districts: rt('ru', 'askDistricts', { max: '3' }),
  budget: rt('ru', 'askBudget'),
  month: rt('ru', 'askMonth'),
  languages: rt('ru', 'askLanguages'),
  preferences: rt('ru', 'askGender'),
  about: rt('ru', 'askAbout'),
  rules: rt('ru', 'askSmoking'),
} as const;

/** Expect the reply pair that ends an edit: "updated", then the own card. */
function expectEditEnd(reply: ReturnType<typeof vi.fn>) {
  expect(texts(reply)).toHaveLength(2);
  expect(texts(reply)[0]).toBe(rt('ru', 'editSaved'));
  expect(texts(reply)[1]).toMatch(/^🏠 <b>Твоя анкета<\/b>/);
  expect(data(replyKeyboard(reply, 1))).toContainEqual(['rm:c:edit', 'rm:c:del']);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubEnv('ROOMMATE_MATCHING_ENABLED', '');
  db.rows.length = 0;
  mocks.touchChat.mockResolvedValue(CHAT);
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.getCity.mockResolvedValue({ id: 'city-1', slug: 'warsaw', districts: DISTRICTS });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('callback data of the edit', () => {
  it.each<[string, string | RegExp]>([
    ['rm:c:edit', 'rm:c:edit'],
    ...EDIT_FIELDS.map((field): [string, RegExp] => [`rm:e:${field}`, EDIT_PICK]),
    ['rm:e:back', EDIT_PICK],
    ['rm:p:anyone:woman', PREFERS_TAP],
    ['rm:p:men:skip', PREFERS_TAP],
    ['rm:pt:have:outside', PETS_TAP],
    ['rm:pt:skip:skip', PETS_TAP],
  ])('%s is routed to exactly one handler', (callbackData, trigger) => {
    const routes = routesFor(callbackData);
    expect(routes).toHaveLength(1);
    expect(routes[0][0]).toBe(trigger);
  });

  it('keeps every picker and two-part button within 64 bytes and routed', async () => {
    seed();
    const picker = await tap('rm:c:edit');
    await tap('rm:e:preferences');
    const prefers = await tap('rm:g:woman');
    await tap('rm:p:anyone:woman');
    await tap('rm:e:rules');
    const pets = await tap('rm:s:outside');

    const buttons = [
      ...replyKeyboard(picker.reply).flat(),
      ...replyKeyboard(prefers.reply).flat(),
      ...replyKeyboard(pets.reply).flat(),
    ];
    expect(buttons).toHaveLength(8 + 3 + 4);
    for (const button of buttons) {
      expect(Buffer.byteLength(button.callback_data!, 'utf8')).toBeLessThanOrEqual(64);
      expect(routesFor(button.callback_data!)).toHaveLength(1);
    }
  });
});

describe('the field picker (rm:c:edit)', () => {
  it('asks what to change with the seven fields two per row, then Back, and opens no step', async () => {
    const before = seed();
    const { reply, answerCallbackQuery } = await tap('rm:c:edit');

    expect(texts(reply)).toEqual([rt('ru', 'editPrompt')]);
    expect(labels(replyKeyboard(reply))).toEqual([
      ['Районы', 'Бюджет'],
      ['Месяц заезда', 'Языки'],
      ['Пол и с кем жить', 'О себе'],
      ['Курение и животные'],
      ['← Назад'],
    ]);
    expect(data(replyKeyboard(reply))).toEqual([
      ['rm:e:districts', 'rm:e:budget'],
      ['rm:e:month', 'rm:e:languages'],
      ['rm:e:preferences', 'rm:e:about'],
      ['rm:e:rules'],
      ['rm:e:back'],
    ]);
    expect(row()).toEqual(before);
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('labels the fields in Ukrainian', async () => {
    seed();
    mocks.touchChat.mockResolvedValue({ ...CHAT, locale: 'uk' });
    const { reply } = await tap('rm:c:edit');

    expect(texts(reply)).toEqual([rt('uk', 'editPrompt')]);
    expect(labels(replyKeyboard(reply)).flat()).toEqual([
      'Райони',
      'Бюджет',
      'Місяць заїзду',
      'Мови',
      'Стать і з ким жити',
      'Про себе',
      'Куріння і тварини',
      '← Назад',
    ]);
  });

  it('opens on an expired profile too, which stays expired', async () => {
    seed({ status: 'expired', expiredAt: NOW });
    const { reply } = await tap('rm:c:edit');
    expect(texts(reply)).toEqual([rt('ru', 'editPrompt')]);

    await tap('rm:e:budget');
    const { reply: end } = await tap('rm:b:b5');
    expect(row()).toMatchObject({ status: 'expired', budgetBand: 'b5', step: null });
    expect(texts(end)[0]).toBe(rt('ru', 'editSaved'));
  });

  it('answers a card button of a deleted profile with "already deleted"', async () => {
    const { reply } = await tap('rm:c:edit');
    expect(texts(reply)).toEqual([rt('ru', 'alreadyDeleted')]);
    expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a hidden profile with the FR-14 reply and its delete button', async () => {
    seed({ status: 'hidden', hiddenAt: NOW });
    for (const callbackData of ['rm:c:edit', 'rm:e:budget']) {
      const { reply } = await tap(callbackData);
      expect(texts(reply)).toEqual([rt('ru', 'banned')]);
      expect(data(replyKeyboard(reply))).toEqual([['rm:c:del']]);
    }
    expect(row().step).toBeNull();
  });

  it('treats an old card under a new draft as stale and repeats the draft step', async () => {
    seed({ status: 'draft', step: 'budget', expiresAt: null, activatedAt: null });
    const { reply } = await tap('rm:e:districts');
    expect(texts(reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askBudget')]);
    expect(row().step).toBe('budget');
  });
});

describe('each field reuses its intake step as edit_<field>', () => {
  it.each(EDIT_FIELDS)('rm:e:%s opens edit_%s and asks the intake question', async (field) => {
    const before = seed();
    const { reply } = await tap(`rm:e:${field}`);

    expect(row()).toEqual({ ...before, step: `edit_${field}` });
    expect(row().status).toBe('active');
    expect(texts(reply)).toEqual([QUESTIONS[field]]);
    expect(reply.mock.calls[0][1]).toMatchObject({ parse_mode: 'HTML' });
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('shows the stored districts and languages ticked', async () => {
    seed({ districtSlugs: ['wola', 'ochota'], languages: ['pl', 'ru'] });
    const districts = await tap('rm:e:districts');
    expect(data(replyKeyboard(districts.reply))).toEqual([
      ['rm:d:bielany:1', 'rm:d:mokotow:1'],
      ['rm:d:ochota:0', 'rm:d:wola:0'],
      ['rm:d:any'],
      ['rm:d:done'],
    ]);

    const languages = await tap('rm:e:languages');
    expect(data(replyKeyboard(languages.reply))).toEqual([
      ['rm:l:pl:0', 'rm:l:en:1'],
      ['rm:l:ru:0', 'rm:l:uk:1'],
      ['rm:l:done'],
    ]);
  });

  it('replaces an edit step already open when another field is picked', async () => {
    seed({ step: 'edit_districts' });
    await tap('rm:e:budget');
    expect(row().step).toBe('edit_budget');
  });

  it('does not open a step while the deposit questions are open', async () => {
    seed();
    mocks.hasOpenIntake.mockResolvedValue(true);
    const { reply } = await tap('rm:e:about');
    expect(texts(reply)).toEqual([rt('ru', 'depositQuestionsOpen')]);
    expect(row().step).toBeNull();
  });

  it('ignores an unknown field', async () => {
    const before = seed();
    const { reply, answerCallbackQuery } = await tap('rm:e:gender');
    expect(reply).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(row()).toEqual(before);
  });
});

describe('the answer changes only that field and returns to the card', () => {
  it('districts: each tap is stored, Done ends the edit with one event', async () => {
    const before = seed();
    await tap('rm:e:districts');
    const toggle = await tap('rm:d:wola:1');
    expect(row().districtSlugs).toEqual(['mokotow', 'wola']);
    expect(row().step).toBe('edit_districts');
    expect(toggle.editMessageReplyMarkup).toHaveBeenCalledTimes(1);
    await tap('rm:d:mokotow:0');
    expect(mocks.track).not.toHaveBeenCalled();

    const { reply } = await tap('rm:d:done');
    expect(row()).toEqual({ ...before, districtSlugs: ['wola'] });
    expect(mocks.track.mock.calls).toEqual([edited('districts')]);
    expectEditEnd(reply);
    expect(plain(texts(reply)[1])).toContain('Районы: Wola\n');
  });

  it('districts: "Any district", a 4th district refused, the last one kept', async () => {
    seed({ districtSlugs: ['mokotow', 'wola', 'ochota'] });
    await tap('rm:e:districts');
    const fourth = await tap('rm:d:bielany:1');
    expect(fourth.answerCallbackQuery).toHaveBeenCalledWith({
      text: rt('ru', 'districtLimit', { max: '3' }),
    });

    await tap('rm:d:any');
    expect(row()).toMatchObject({ districtSlugs: [], anyDistrict: true });
    await tap('rm:d:wola:1');
    const last = await tap('rm:d:wola:0');
    expect(last.answerCallbackQuery).toHaveBeenCalledWith({ text: rt('ru', 'districtsEmpty') });
    expect(last.editMessageReplyMarkup).not.toHaveBeenCalled();
    expect(row()).toMatchObject({ districtSlugs: ['wola'], anyDistrict: false });
  });

  it('districts: a typed name toggles like a tap; untyping the last one is refused', async () => {
    seed();
    await tap('rm:e:districts');
    const typed = await type('Ochota');
    expect(typed.result).toBe('used');
    expect(row().districtSlugs).toEqual(['mokotow', 'ochota']);
    expect(texts(typed.reply)).toEqual([QUESTIONS.districts]);

    await type('ochota');
    const last = await type('Mokotów');
    expect(texts(last.reply)).toEqual([rt('ru', 'districtsEmpty')]);
    expect(row().districtSlugs).toEqual(['mokotow']);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('budget: a tap stores only the band', async () => {
    const before = seed();
    await tap('rm:e:budget');
    const { reply } = await tap('rm:b:b4');

    expect(row()).toEqual({ ...before, budgetBand: 'b4' });
    expect(mocks.track.mock.calls).toEqual([edited('budget')]);
    expectEditEnd(reply);
  });

  it('budget: a typed amount is mapped to its band; text without one passes on', async () => {
    const before = seed();
    await tap('rm:e:budget');
    expect((await type('где дешевле?')).result).toBe('passed');
    expect(row().step).toBe('edit_budget');

    const { result, reply } = await type('2 100 zł');
    expect(result).toBe('used');
    expect(row()).toEqual({ ...before, budgetBand: 'b4' });
    expectEditEnd(reply);
  });

  it('languages: ticks are stored, the last one is kept, Done ends the edit', async () => {
    const before = seed();
    await tap('rm:e:languages');
    await tap('rm:l:pl:1');
    expect(row().languages).toEqual(['pl', 'ru']);
    await tap('rm:l:ru:0');
    const last = await tap('rm:l:pl:0');
    expect(last.answerCallbackQuery).toHaveBeenCalledWith({ text: rt('ru', 'languagesEmpty') });
    expect(row().languages).toEqual(['pl']);

    const { reply } = await tap('rm:l:done');
    expect(row()).toEqual({ ...before, languages: ['pl'] });
    expect(mocks.track.mock.calls).toEqual([edited('languages')]);
    expectEditEnd(reply);
  });

  it('preferences: the gender tap stores nothing; "live with" stores both in one write', async () => {
    const before = seed();
    await tap('rm:e:preferences');
    const gender = await tap('rm:g:man');
    expect(row()).toEqual({ ...before, step: 'edit_preferences' });
    expect(texts(gender.reply)).toEqual([rt('ru', 'askPrefers')]);
    expect(data(replyKeyboard(gender.reply))).toEqual([
      ['rm:p:anyone:man'],
      ['rm:p:women:man', 'rm:p:men:man'],
    ]);

    const { reply } = await tap('rm:p:women:man');
    expect(row()).toEqual({ ...before, gender: 'man', prefers: 'women' });
    expect(mocks.track.mock.calls).toEqual([edited('preferences')]);
    expectEditEnd(reply);
    expect(plain(texts(reply)[1])).toContain('Пол: Мужчина\nС кем жить: С женщинами');
  });

  it('preferences: skipping the own gender stores null', async () => {
    seed();
    await tap('rm:e:preferences');
    const gender = await tap('rm:g:skip');
    expect(data(replyKeyboard(gender.reply))[0]).toEqual(['rm:p:anyone:skip']);
    await tap('rm:p:anyone:skip');
    expect(row()).toMatchObject({ gender: null, prefers: 'anyone', step: null });
  });

  it('preferences: an intake "live with" button is stale here, and an edit one at the intake', async () => {
    const before = seed();
    await tap('rm:e:preferences');
    const stale = await tap('rm:p:men');
    expect(texts(stale.reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askGender')]);
    expect(row()).toEqual({ ...before, step: 'edit_preferences' });

    seed({ status: 'draft', step: 'prefers', expiresAt: null, activatedAt: null });
    const old = await tap('rm:p:men:woman');
    expect(texts(old.reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askPrefers')]);
    expect(row()).toMatchObject({ step: 'prefers', gender: 'woman', prefers: 'anyone' });
  });

  it.each(['rm:p:men:x', 'rm:p:any:woman'])('preferences: %s is ignored', async (forged) => {
    const before = seed({ step: 'edit_preferences' });
    const { reply } = await tap(forged);
    expect(reply).not.toHaveBeenCalled();
    expect(row()).toEqual(before);
  });

  it('about: typed text is checked, stored normalised and ends the edit', async () => {
    const before = seed();
    await tap('rm:e:about');
    const { result, reply } = await type('Ｐracuję zdalnie, nie palę');

    expect(result).toBe('used');
    expect(row()).toEqual({ ...before, about: 'Pracuję zdalnie, nie palę' });
    expect(mocks.track.mock.calls).toEqual([edited('about')]);
    expectEditEnd(reply);
    expect(plain(texts(reply)[1])).toContain('О себе: Pracuję zdalnie, nie palę');
  });

  it('about: refused text keeps the step open and the old text, with no event', async () => {
    const before = seed();
    await tap('rm:e:about');
    const { result, reply } = await type('пиши @anna_w');

    expect(result).toBe('used');
    expect(texts(reply)).toEqual([rt('ru', 'aboutRefused', { found: rt('ru', 'foundHandle') })]);
    expect(row()).toEqual({ ...before, step: 'edit_about' });

    const tooLong = await type('a'.repeat(281));
    expect(texts(tooLong.reply)).toEqual([rt('ru', 'aboutTooLong', { max: '280', length: '281' })]);
    expect(row().step).toBe('edit_about');
    expect(mocks.track).not.toHaveBeenCalled();

    await type('Мне 25, есть 2 кота');
    expect(row()).toEqual({ ...before, about: 'Мне 25, есть 2 кота' });
    expect(mocks.track.mock.calls).toEqual([edited('about')]);
  });

  it('about: typed text never passes on to the address lookup; spaces and Skip remove the text', async () => {
    const before = seed();
    await tap('rm:e:about');
    expect((await type('ul. Marszałkowska 10')).result).toBe('used');
    expect(row().about).toBe('ul. Marszałkowska 10');

    await tap('rm:e:about');
    await type('   ');
    expect(row()).toEqual({ ...before, about: null });

    seed();
    await tap('rm:e:about');
    const skip = await tap('rm:t:skip');
    expect(row()).toEqual({ ...before, about: null });
    expectEditEnd(skip.reply);
    expect(plain(texts(skip.reply)[1])).not.toContain('О себе');
  });

  it('rules: the smoking tap stores nothing; pets stores both in one write', async () => {
    const before = seed();
    await tap('rm:e:rules');
    const smoking = await tap('rm:s:outside');
    expect(row()).toEqual({ ...before, step: 'edit_rules' });
    expect(texts(smoking.reply)).toEqual([rt('ru', 'askPets')]);
    expect(data(replyKeyboard(smoking.reply))).toEqual([
      ['rm:pt:no:outside'],
      ['rm:pt:have:outside'],
      ['rm:pt:fine:outside'],
      ['rm:pt:skip:outside'],
    ]);

    const { reply } = await tap('rm:pt:have:outside');
    expect(row()).toEqual({ ...before, smoking: 'outside', pets: 'have' });
    expect(mocks.track.mock.calls).toEqual([edited('rules')]);
    expectEditEnd(reply);
  });

  it('rules: skip on both stores nulls; an intake pets button is stale here', async () => {
    const before = seed({ pets: 'fine' });
    await tap('rm:e:rules');
    await tap('rm:s:skip');
    const stale = await tap('rm:pt:no');
    expect(texts(stale.reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askSmoking')]);
    expect(row()).toEqual({ ...before, step: 'edit_rules' });

    await tap('rm:pt:skip:skip');
    expect(row()).toEqual({ ...before, smoking: null, pets: null });
  });

  it.each(['rm:pt:no:cat', 'rm:pt:dog:no'])('rules: %s is ignored', async (forged) => {
    const before = seed({ step: 'edit_rules' });
    const { reply } = await tap(forged);
    expect(reply).not.toHaveBeenCalled();
    expect(row()).toEqual(before);
  });
});

describe('the month edit and expires_at', () => {
  it('keeps expires_at when the new month ends after it, and never touches the languages', async () => {
    const before = seed({ languages: ['en'] });
    await tap('rm:e:month');
    const { reply } = await tap('rm:m:2027-02');

    expect(row()).toEqual({ ...before, moveInMonth: new Date('2027-02-01T00:00:00.000Z') });
    expect(row().expiresAt).toEqual(EXPIRES);
    expect(mocks.track.mock.calls).toEqual([edited('month')]);
    expectEditEnd(reply);
    expect(plain(texts(reply)[1])).toContain('Заезд: февраль 2027');
    expect(plain(texts(reply)[1])).toContain('Анкета скроется 4 января 2027.');
  });

  it('lowers expires_at to the end of a new month that ends before it', async () => {
    const before = seed();
    await tap('rm:e:month');
    const { reply } = await tap('rm:m:2026-12');

    const monthEnd = new Date('2026-12-31T22:59:59.000Z');
    expect(row()).toEqual({
      ...before,
      moveInMonth: new Date('2026-12-01T00:00:00.000Z'),
      expiresAt: monthEnd,
    });
    expect(plain(texts(reply)[1])).toContain('Анкета скроется 31 декабря 2026.');
  });

  it('never extends a profile: a later month keeps an earlier month-end expiry', async () => {
    const monthEnd = new Date('2026-12-31T22:59:59.000Z');
    seed({ moveInMonth: new Date('2026-12-01T00:00:00.000Z'), expiresAt: monthEnd });
    await tap('rm:e:month');
    await tap('rm:m:2027-03');
    expect(row()).toMatchObject({
      moveInMonth: new Date('2027-03-01T00:00:00.000Z'),
      expiresAt: monthEnd,
    });
  });

  it('answers a passed month with the current months and stores nothing', async () => {
    const before = seed();
    await tap('rm:e:month');
    const { reply } = await tap('rm:m:2026-11');
    expect(texts(reply)).toEqual([rt('ru', 'monthPassed'), rt('ru', 'askMonth')]);
    expect(row()).toEqual({ ...before, step: 'edit_month' });
  });
});

describe('one event per change, and leaving an edit', () => {
  it('a double tap stores once, sends one event and one card', async () => {
    seed();
    await tap('rm:e:budget');
    const first = await tap('rm:b:b3');
    const second = await tap('rm:b:b5');

    expect(row()).toMatchObject({ budgetBand: 'b3', step: null });
    expect(mocks.track.mock.calls).toEqual([edited('budget')]);
    expectEditEnd(first.reply);
    expect(texts(second.reply)).toEqual([rt('ru', 'stepDone')]);
  });

  it('two overlapping answers land once', async () => {
    seed();
    await tap('rm:e:budget');
    const [a, b] = await Promise.all([tap('rm:b:b3'), tap('rm:b:b4')]);
    expect(mocks.track).toHaveBeenCalledTimes(1);
    const cards = [...texts(a.reply), ...texts(b.reply)].filter((t) => t.startsWith('🏠'));
    expect(cards).toHaveLength(1);
    expect(row().step).toBeNull();
  });

  it('sends only the field, never a value', async () => {
    seed();
    await tap('rm:e:preferences');
    await tap('rm:g:woman');
    await tap('rm:p:men:woman');
    await tap('rm:e:about');
    await type('Тихая соседка');

    expect(mocks.track.mock.calls).toEqual([edited('preferences'), edited('about')]);
    for (const [, , properties] of mocks.track.mock.calls) {
      expect(Object.keys(properties)).toEqual(['field']);
    }
  });

  it('a stale intake button during an edit gets "this step is done" and the edit question', async () => {
    const before = seed();
    await tap('rm:e:budget');
    const { reply } = await tap('rm:a:yes');
    expect(texts(reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askBudget')]);
    expect(row()).toEqual({ ...before, step: 'edit_budget' });
  });

  it('Back closes an open edit step and shows the card, with no event', async () => {
    const before = seed();
    await tap('rm:e:about');
    const { reply } = await tap('rm:e:back');

    expect(row()).toEqual(before);
    expect(texts(reply)).toHaveLength(1);
    expect(texts(reply)[0]).toMatch(/^🏠 <b>Твоя анкета<\/b>/);
    expect((await type('ul. Marszałkowska 10')).result).toBe('none');
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('/cancel before "live with" leaves the profile as it was', async () => {
    const before = seed();
    await tap('rm:e:preferences');
    await tap('rm:g:man');
    const fake = fakeCtx();
    expect(await cancelRoommate(fake.ctx, CHAT.id, 'ru')).toBe(true);
    expect(texts(fake.reply)).toEqual([rt('ru', 'cancelledEdit')]);
    expect(row()).toEqual(before);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it.each(['districts', 'languages'])(
    '/cancel in the %s edit says the ticks are already stored',
    async (field) => {
      seed();
      await tap(`rm:e:${field}`);
      await tap(field === 'districts' ? 'rm:d:wola:1' : 'rm:l:pl:1');
      const fake = fakeCtx();
      expect(await cancelRoommate(fake.ctx, CHAT.id, 'ru')).toBe(true);
      expect(texts(fake.reply)).toEqual([rt('ru', 'cancelledEditPicked')]);
      expect(row()).toMatchObject({ status: 'active', step: null });
      expect(row()[field === 'districts' ? 'districtSlugs' : 'languages']).toHaveLength(2);
    },
  );
});
