import type { CallbackQueryContext, Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The "I want a lawyer" button and its confirmation (spec 04 §Lawyer interest,
 * FR-45, D27). There is no legal service yet: the texts say so and promise no
 * reply, date or consultation; the tap records interest and nothing else.
 */

const prismaFake = vi.hoisted(() => ({
  depositCase: { findFirst: vi.fn(), update: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaFake }));
vi.mock('./analytics', () => ({ track: vi.fn() }));
vi.mock('./contract', () => ({ readContract: vi.fn() }));
vi.mock('./store', () => ({ touchChat: vi.fn() }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));
vi.mock('@/lib/posthog-server', () => ({ flushPostHog: vi.fn(async () => {}) }));

import { track } from './analytics';
import { handleLawyerInterest, LAWYER_CALLBACK } from './deposit-flow';
import { dt, type DepositLocale } from './deposit-texts';
import { touchChat } from './store';

const CHAT_ID = 777000111;
const CHAT_DB_ID = 'chat-db-1';
const CASE_ID = '0b9f7c1e-2a4d-4e8f-9c3b-5d6a7e8f9a0b';

const LOCALES: DepositLocale[] = ['ru', 'uk'];

const APPROVED = {
  ru: {
    button: '⚖️ Хочу помощь юриста (сервиса пока нет — отметим интерес)',
    ack:
      'Записал твой интерес. Юридической помощи через Passflat пока нет, и мы не обещаем, ' +
      'что напишем об этом. Если срок важен, обратись к юристу напрямую.',
  },
  uk: {
    button: '⚖️ Хочу допомогу юриста (сервісу поки немає — відзначимо інтерес)',
    ack:
      'Записав твій інтерес. Юридичної допомоги через Passflat поки немає, і ми не обіцяємо, ' +
      'що напишемо про це. Якщо строк важливий, звернися до юриста напряму.',
  },
} as const;

/** Wording that would promise a reply, a date or a consultation (RU and UK). */
const PROMISES = [
  /напишу/i, // "I will write" (the old «напишу сюда первым»)
  /как только|щойно|коли домов/i, // "as soon as"
  /свяж|зв['’]яж/i, // "will contact"
  /ответ(им|ит)|відповім|відповімо/i, // "will answer"
  /в течение|протягом|до \d|через \d/i, // a response time
  /консультац/i, // a consultation
  /ищем юрист|шукаємо юрист/i, // the old partnership search
  /договоримся|домовимося/i,
];

function fakeTap(data = `dep:lawyer:${CASE_ID}`) {
  const reply = vi.fn();
  const answerCallbackQuery = vi.fn();
  const ctx = {
    chat: { id: CHAT_ID },
    match: data.match(LAWYER_CALLBACK),
    answerCallbackQuery,
    reply,
  } as unknown as CallbackQueryContext<Context>;
  return { ctx, reply, answerCallbackQuery };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('lawyer interest texts', () => {
  it.each(LOCALES)('%s: the button says there is no service yet', (locale) => {
    expect(dt(locale, 'btnWantLawyer')).toBe(APPROVED[locale].button);
  });

  it.each(LOCALES)('%s: the confirmation follows the approved wording', (locale) => {
    expect(dt(locale, 'lawyerAck')).toBe(APPROVED[locale].ack);
  });

  it.each(LOCALES)('%s: neither text promises a reply, a date or a consultation', (locale) => {
    for (const key of ['btnWantLawyer', 'lawyerAck'] as const) {
      for (const phrase of PROMISES) {
        expect(dt(locale, key), `${locale}.${key}`).not.toMatch(phrase);
      }
    }
  });
});

describe('handleLawyerInterest', () => {
  it('matches only the lawyer button of a case', () => {
    expect(`dep:lawyer:${CASE_ID}`).toMatch(LAWYER_CALLBACK);
    expect('dep:lawyer:not-a-case').not.toMatch(LAWYER_CALLBACK);
    expect(`dep:o:${CASE_ID}:none`).not.toMatch(LAWYER_CALLBACK);
  });

  it.each(LOCALES)(
    '%s: records the interest, sends tg_lawyer_interest only, replies with the confirmation',
    async (locale) => {
      vi.mocked(touchChat).mockResolvedValue({ id: CHAT_DB_ID, locale } as Awaited<
        ReturnType<typeof touchChat>
      >);
      prismaFake.depositCase.findFirst.mockResolvedValue({
        id: CASE_ID,
        chatId: CHAT_DB_ID,
        status: 'resolved',
        outcome: 'none',
        depositAmount: 3000,
        returnedAmount: 500,
      });

      const tap = fakeTap();
      await handleLawyerInterest(tap.ctx);

      expect(tap.answerCallbackQuery).toHaveBeenCalledTimes(1);
      expect(prismaFake.depositCase.findFirst).toHaveBeenCalledWith({
        where: { id: CASE_ID, chatId: CHAT_DB_ID },
      });
      // Only the interest flag: the case's status and outcome stay as they are.
      expect(prismaFake.depositCase.update).toHaveBeenCalledTimes(1);
      expect(prismaFake.depositCase.update).toHaveBeenCalledWith({
        where: { id: CASE_ID },
        data: { wantsLawyer: true },
      });
      // The event and its properties are unchanged, and no outcome event goes with it.
      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith(CHAT_ID, 'tg_lawyer_interest', { claim: 2500 });

      expect(tap.reply).toHaveBeenCalledTimes(1);
      expect(tap.reply.mock.calls[0]).toEqual([APPROVED[locale].ack]);
    },
  );

  it('an English chat with a case gets the confirmation in Russian (spec 04 §English bot locale)', async () => {
    vi.mocked(touchChat).mockResolvedValue({ id: CHAT_DB_ID, locale: 'en' } as Awaited<
      ReturnType<typeof touchChat>
    >);
    prismaFake.depositCase.findFirst.mockResolvedValue({
      id: CASE_ID,
      chatId: CHAT_DB_ID,
      depositAmount: 3000,
      returnedAmount: 500,
    });

    const tap = fakeTap();
    await handleLawyerInterest(tap.ctx);

    expect(prismaFake.depositCase.update).toHaveBeenCalledWith({
      where: { id: CASE_ID },
      data: { wantsLawyer: true },
    });
    expect(tap.reply.mock.calls).toEqual([[APPROVED.ru.ack]]);
  });

  it('sends a null claim when the deposit amount is unknown', async () => {
    vi.mocked(touchChat).mockResolvedValue({ id: CHAT_DB_ID, locale: 'ru' } as Awaited<
      ReturnType<typeof touchChat>
    >);
    prismaFake.depositCase.findFirst.mockResolvedValue({
      id: CASE_ID,
      chatId: CHAT_DB_ID,
      depositAmount: null,
      returnedAmount: null,
    });

    await handleLawyerInterest(fakeTap().ctx);

    expect(track).toHaveBeenCalledWith(CHAT_ID, 'tg_lawyer_interest', { claim: null });
  });

  it('does nothing for a case of another chat', async () => {
    vi.mocked(touchChat).mockResolvedValue({ id: CHAT_DB_ID, locale: 'ru' } as Awaited<
      ReturnType<typeof touchChat>
    >);
    prismaFake.depositCase.findFirst.mockResolvedValue(null);

    const tap = fakeTap();
    await handleLawyerInterest(tap.ctx);

    expect(tap.answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(prismaFake.depositCase.update).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(tap.reply).not.toHaveBeenCalled();
  });
});
