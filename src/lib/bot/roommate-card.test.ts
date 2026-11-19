import type { RoommateProfile } from '@prisma/client';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The own card (spec 06 §Save and the own card), shown only to its owner when a saved profile is
 * opened: every chosen field (own gender and "live with" only here), the hide date in Warsaw
 * time, the opt-in or daily-message state by the switch, and the buttons for the switch off and
 * on, with Renew only within 3 days of the hide date or while expired. Prisma is mocked; nothing
 * reaches Telegram or a database.
 */

const db = vi.hoisted(() => ({
  telegramChat: { findUnique: vi.fn() },
  roommateProfile: { findUnique: vi.fn(), updateMany: vi.fn() },
}));
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

import { openRoommate } from './roommate-flow';
import { rt } from './roommate-texts';
import type { BotLocale } from './texts';

const CHAT = { id: 'chat-row', locale: 'ru', isNew: false };
const NOW = new Date('2026-12-05T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const DISTRICTS = [
  { id: 'd1', slug: 'wola', nameKey: 'Wola' },
  { id: 'd2', slug: 'mokotow', nameKey: 'Mokotów' },
  { id: 'd3', slug: 'ochota', nameKey: 'Ochota' },
];

/** A saved profile; `expiresAt` 2027-01-04 10:00 UTC (30 days after NOW). */
function profile(fields: Partial<RoommateProfile> = {}): RoommateProfile {
  return {
    id: 'profile-1',
    chatId: 'chat-row',
    status: 'active',
    step: null,
    entrySource: 'tg',
    districtSlugs: [],
    anyDistrict: true,
    budgetBand: 'b1',
    moveInMonth: new Date('2026-12-01T00:00:00.000Z'),
    languages: ['ru'],
    gender: null,
    prefers: 'anyone',
    about: null,
    smoking: null,
    pets: null,
    adultConfirmedAt: NOW,
    tgUsername: 'anna_w',
    activatedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 30 * DAY),
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

/** Every field chosen. */
const FULL = {
  districtSlugs: ['mokotow', 'wola', 'ochota'],
  anyDistrict: false,
  budgetBand: 'b3',
  moveInMonth: new Date('2027-02-01T00:00:00.000Z'),
  languages: ['en', 'ru'],
  gender: 'woman',
  prefers: 'women',
  about: 'Тихая, работаю в IT <3 & кот',
  smoking: 'outside',
  pets: 'have',
  notifyOnOpenAt: NOW,
} satisfies Partial<RoommateProfile>;

type Button = { text: string; callback_data?: string };

/** Opens the chat's saved profile and returns the one card reply: text (spaces plain) and buttons. */
async function openCard(fields: Partial<RoommateProfile>, locale: 'ru' | 'uk' | 'en' = 'ru') {
  const saved = profile(fields);
  db.telegramChat.findUnique.mockResolvedValue({ roommateBannedAt: null, roommateProfile: saved });
  db.roommateProfile.findUnique.mockResolvedValue(saved);
  const reply = vi.fn().mockResolvedValue({});
  const ctx = {
    chat: { id: 4242 },
    from: { id: 4242, username: 'anna_w' },
    reply,
    answerCallbackQuery: vi.fn(),
  } as unknown as Context;
  // `BotLocale` gains `en` with T099; the roommate copy already has it.
  await openRoommate(ctx, { ...CHAT, locale }, locale as BotLocale, { source: 'bot_menu' });

  expect(reply).toHaveBeenCalledTimes(1);
  const [text, options] = reply.mock.calls[0];
  expect(options).toMatchObject({ parse_mode: 'HTML' });
  const rows = (options.reply_markup as { inline_keyboard: Button[][] }).inline_keyboard;
  return {
    text: (text as string).replace(/\s/g, (space) => (space === '\n' ? '\n' : ' ')),
    data: rows.map((buttons) => buttons.map((button) => button.callback_data)),
    labels: rows.map((buttons) => buttons.map((button) => button.text)),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubEnv('ROOMMATE_MATCHING_ENABLED', '');
  mocks.touchChat.mockResolvedValue(CHAT);
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.getCity.mockResolvedValue({ id: 'city-1', slug: 'warsaw', districts: DISTRICTS });
  db.roommateProfile.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('the own card, switch off (stage 1)', () => {
  it('shows every field of a full profile, the hide date and the opt-in state', async () => {
    const card = await openCard(FULL);

    expect(card.text).toBe(
      [
        '🏠 <b>Твоя анкета</b>',
        '',
        'Районы: Mokotów, Wola, Ochota',
        'Бюджет на человека: 1 600 – 1 999 zł',
        'Заезд: февраль 2027',
        'Языки: Английский, Русский',
        'Пол: Женщина',
        'С кем жить: С женщинами',
        'О себе: Тихая, работаю в IT &lt;3 &amp; кот',
        'Курение: Только на улице',
        'Животные: У меня есть питомец',
        '',
        'Анкета скроется 4 января 2027.',
        'Сообщение, когда откроется подбор: включено',
        '<i>Пока подбор не открыт, анкету не видит никто.</i>',
        '<i>Пол и «с кем жить» видишь только ты.</i>',
      ].join('\n'),
    );
  });

  it('shows a minimal profile without the skipped fields, gender "not stated"', async () => {
    const card = await openCard({});

    expect(card.text).toBe(
      [
        '🏠 <b>Твоя анкета</b>',
        '',
        'Районы: любой',
        'Бюджет на человека: до 1 199 zł',
        'Заезд: декабрь 2026',
        'Языки: Русский',
        'Пол: не указан',
        'С кем жить: С кем угодно',
        '',
        'Анкета скроется 4 января 2027.',
        'Сообщение, когда откроется подбор: выключено',
        '<i>Пока подбор не открыт, анкету не видит никто.</i>',
        '<i>Пол и «с кем жить» видишь только ты.</i>',
      ].join('\n'),
    );
    expect(card.text).not.toMatch(/О себе|Курение|Животные/);
  });

  it('has Edit and Delete, "How many are looking?" and "Message me when matching opens"', async () => {
    const card = await openCard({});

    expect(card.data).toEqual([['rm:c:edit', 'rm:c:del'], ['rm:c:counts'], ['rm:c:optin']]);
    expect(card.labels).toEqual([
      [rt('ru', 'btnEdit'), rt('ru', 'btnDelete')],
      [rt('ru', 'btnCounts')],
      [rt('ru', 'btnOptIn')],
    ]);
  });

  it('offers to switch the opt-in off once it is on', async () => {
    const card = await openCard({ notifyOnOpenAt: NOW });

    expect(card.text).toContain(rt('ru', 'cardOptInOn'));
    expect(card.data).toEqual([['rm:c:edit', 'rm:c:del'], ['rm:c:counts'], ['rm:c:optout']]);
    expect(card.labels[2]).toEqual([rt('ru', 'btnOptOut')]);
  });

  it('shows no stage 2 button or daily-message line', async () => {
    const card = await openCard(FULL);

    expect(card.data.flat().some((data) => data?.startsWith('rm:show'))).toBe(false);
    expect(card.data.flat().some((data) => data?.startsWith('rm:push:'))).toBe(false);
    expect(card.text).not.toContain(rt('ru', 'cardPushOn'));
  });

  it('writes the card in UK and EN', async () => {
    const uk = await openCard(FULL, 'uk');
    expect(uk.text.split('\n').slice(0, 11)).toEqual([
      '🏠 <b>Твоя анкета</b>',
      '',
      'Райони: Mokotów, Wola, Ochota',
      'Бюджет на людину: 1 600 – 1 999 zł',
      'Заїзд: лютий 2027',
      'Мови: Англійська, Російська',
      'Стать: Жінка',
      'З ким жити: З жінками',
      'Про себе: Тихая, работаю в IT &lt;3 &amp; кот',
      'Куріння: Лише надворі',
      'Тварини: У мене є улюбленець',
    ]);
    expect(uk.text).toContain('Анкета сховається 4 січня 2027.');

    const en = await openCard({}, 'en');
    expect(en.text).toBe(
      [
        '🏠 <b>Your profile</b>',
        '',
        'Districts: any',
        'Budget per person: up to 1 199 zł',
        'Move-in: December 2026',
        'Languages: Russian',
        'Gender: not stated',
        'Live with: Anyone',
        '',
        'Your profile hides on 4 January 2027.',
        'Message when matching opens: off',
        '<i>Until matching opens, nobody sees your profile.</i>',
        "<i>Only you see your gender and who you'd live with.</i>",
      ].join('\n'),
    );
  });

  it('writes the hide date of a month-end expiry as the last day in Warsaw', async () => {
    const card = await openCard({ expiresAt: new Date('2026-12-31T22:59:59Z') });
    expect(card.text).toContain('Анкета скроется 31 декабря 2026.');
  });

  it('names a district missing from the table by its slug, escaped', async () => {
    const card = await openCard({ anyDistrict: false, districtSlugs: ['wola', 'old<slug>'] });
    expect(card.text).toContain('Районы: Wola, old&lt;slug&gt;');
  });
});

describe('the own card, switch on (stage 2 buttons are only rendered)', () => {
  beforeEach(() => {
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
  });

  it('shows the daily-message state instead of the opt-in, with "Show people"', async () => {
    const card = await openCard(FULL);

    expect(card.text).toContain(rt('ru', 'cardPushOn'));
    expect(card.text).not.toContain(rt('ru', 'cardOptInOn'));
    expect(card.text).not.toContain(rt('ru', 'cardHiddenUntilOpen'));
    expect(card.text).toContain(rt('ru', 'cardPrivateNote'));
    expect(card.data).toEqual([['rm:c:edit', 'rm:c:del'], ['rm:show:c'], ['rm:push:off']]);
    expect(card.labels.slice(1)).toEqual([[rt('ru', 'btnShowPeople')], [rt('ru', 'btnPushOff')]]);
  });

  it('offers to turn the daily messages back on once they are off', async () => {
    const card = await openCard({ pushOff: true });

    expect(card.text).toContain(rt('ru', 'cardPushOff'));
    expect(card.data).toEqual([['rm:c:edit', 'rm:c:del'], ['rm:show:c'], ['rm:push:on']]);
  });

  it('still shows own gender and "live with" to the owner', async () => {
    const card = await openCard(FULL);
    expect(card.text).toContain('Пол: Женщина');
    expect(card.text).toContain('С кем жить: С женщинами');
  });
});

describe('the Renew button (RENEWAL_REMINDER_DAYS = 3)', () => {
  const expiringIn = (days: number) => ({ expiresAt: new Date(NOW.getTime() + days * DAY) });

  it('is not on the card 4 days before the hide date', async () => {
    const card = await openCard(expiringIn(4));
    expect(card.data.flat()).not.toContain('rm:c:renew');
  });

  it.each([3, 0])('is the first row %i days before the hide date', async (days) => {
    const card = await openCard(expiringIn(days));
    expect(card.data[0]).toEqual(['rm:c:renew']);
    expect(card.labels[0]).toEqual([rt('ru', 'btnRenew')]);
    expect(card.data.slice(1)).toEqual([
      ['rm:c:edit', 'rm:c:del'],
      ['rm:c:counts'],
      ['rm:c:optin'],
    ]);
  });

  it('is on the card with the switch on too', async () => {
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
    const card = await openCard(expiringIn(1));
    expect(card.data).toEqual([
      ['rm:c:renew'],
      ['rm:c:edit', 'rm:c:del'],
      ['rm:show:c'],
      ['rm:push:off'],
    ]);
  });

  it('is on the card of an expired profile, which names the expiry and the deletion date', async () => {
    const card = await openCard({
      status: 'expired',
      expiresAt: new Date('2026-12-03T10:00:00Z'),
      expiredAt: new Date('2026-12-04T09:00:00Z'),
    });

    expect(card.data[0]).toEqual(['rm:c:renew']);
    expect(card.text).toContain(
      'Срок анкеты истёк 3 декабря 2026, сейчас её не учитывают. Продлить можно до 18 декабря 2026, потом анкета удалится.',
    );
    expect(card.text).not.toContain('Анкета скроется');
  });
});

describe('opening the card', () => {
  it('sends no event and writes nothing when the username is unchanged', async () => {
    await openCard(FULL);
    expect(mocks.track).not.toHaveBeenCalled();
    expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
  });
});
