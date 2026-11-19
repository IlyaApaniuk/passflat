import type { Bot, CallbackQueryContext, Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The deposit gate of an English chat (spec 04 §English bot locale, D63): the
 * deposit helper speaks only Russian and Ukrainian, so every entry (the `dep`
 * link through `startDepositFlow`, the `dep:start` button, the keyword offer)
 * asks for one of them, and a language button sets the chat's locale and starts
 * the questions in it. A case already open goes on in Russian. Prisma is mocked.
 */

const db = vi.hoisted(() => ({
  roommateProfile: { findUnique: vi.fn() },
  depositCase: { updateMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
}));
const mocks = vi.hoisted(() => ({ track: vi.fn(), touchChat: vi.fn(), setChatLocale: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('./analytics', () => ({ track: mocks.track }));
vi.mock('./contract', () => ({ readContract: vi.fn() }));
vi.mock('./store', () => ({ touchChat: mocks.touchChat, setChatLocale: mocks.setChatLocale }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));
vi.mock('@/lib/posthog-server', () => ({ flushPostHog: vi.fn(async () => {}) }));

import {
  DEPOSIT_LANG_CALLBACK,
  handleDepositLanguage,
  handleDepositText,
  maybeOfferDeposit,
  registerDepositFlow,
  startDepositFlow,
} from './deposit-flow';
import { dt, type DepositLocale } from './deposit-texts';
import { rt } from './roommate-texts';
import { t } from './texts';

const CHAT_ID = 4242;
const GATE = 'The deposit helper speaks Russian and Ukrainian for now';

type Keyboard = { inline_keyboard: { text: string; callback_data?: string }[][] };

function fakeCtx(data?: string) {
  const reply = vi.fn().mockResolvedValue({});
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const ctx = {
    chat: { id: CHAT_ID },
    match: data?.match(DEPOSIT_LANG_CALLBACK) ?? undefined,
    reply,
    answerCallbackQuery,
  } as unknown as CallbackQueryContext<Context>;
  return { ctx, reply, answerCallbackQuery };
}

/** Each reply's text and its buttons as `text → callback`. */
function replies(reply: ReturnType<typeof vi.fn>) {
  return reply.mock.calls.map(([text, options]) => ({
    text: text as string,
    buttons: ((options?.reply_markup as Keyboard | undefined)?.inline_keyboard ?? [])
      .flat()
      .map((button) => `${button.text} → ${button.callback_data}`),
  }));
}

const GATE_REPLY = {
  text: t('en', 'depositGate'),
  buttons: ['Русский → dep:lang:ru', 'Українська → dep:lang:uk'],
};

/** The handlers `registerDepositFlow` registers, by trigger. */
function registered(): (trigger: string | RegExp) => (ctx: Context) => Promise<void> {
  const handlers = new Map<string, (ctx: Context) => Promise<void>>();
  const bot = {
    callbackQuery: (trigger: string | RegExp, handler: (ctx: Context) => Promise<void>) => {
      handlers.set(String(trigger), handler);
    },
    on: vi.fn(),
  } as unknown as Bot;
  registerDepositFlow(bot);
  return (trigger) => handlers.get(String(trigger))!;
}

function chat(locale: string) {
  mocks.touchChat.mockResolvedValue({ id: 'chat-row', locale, isNew: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  chat('en');
  db.roommateProfile.findUnique.mockResolvedValue(null);
  db.depositCase.updateMany.mockResolvedValue({ count: 0 });
  db.depositCase.create.mockResolvedValue({ id: 'case-1' });
  db.depositCase.findFirst.mockResolvedValue(null);
  db.depositCase.update.mockResolvedValue({});
  mocks.setChatLocale.mockResolvedValue(undefined);
});

describe('the deposit gate text', () => {
  it('says the helper speaks Russian and Ukrainian, with a button for each', () => {
    expect(GATE_REPLY.text.startsWith(`${GATE}.`)).toBe(true);
    expect('dep:lang:ru').toMatch(DEPOSIT_LANG_CALLBACK);
    expect('dep:lang:uk').toMatch(DEPOSIT_LANG_CALLBACK);
    expect('dep:lang:en').not.toMatch(DEPOSIT_LANG_CALLBACK);
    expect('dep:lang:pl').not.toMatch(DEPOSIT_LANG_CALLBACK);
  });
});

describe('every deposit entry in an English chat replies with the gate', () => {
  it('the dep link (startDepositFlow): no case, no deposit text, no event', async () => {
    const { ctx, reply } = fakeCtx();
    await startDepositFlow(ctx, 'chat-row', 'en');

    expect(replies(reply)).toEqual([GATE_REPLY]);
    expect(db.depositCase.updateMany).not.toHaveBeenCalled();
    expect(db.depositCase.create).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('the dep:start button under /deposit and the keyword offer', async () => {
    const { ctx, reply, answerCallbackQuery } = fakeCtx();
    await registered()('dep:start')(ctx);

    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(replies(reply)).toEqual([GATE_REPLY]);
    expect(db.depositCase.create).not.toHaveBeenCalled();
  });

  it('the keyword offer: the gate in place of the offer, still counted as an offer', async () => {
    const { ctx, reply } = fakeCtx();

    expect(await maybeOfferDeposit(ctx, 'en', 'how do I get my deposit back')).toBe(true);
    expect(replies(reply)).toEqual([GATE_REPLY]);
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_deposit_offered');
  });

  it('an open roommate step comes first: its English /cancel line, no gate', async () => {
    db.roommateProfile.findUnique.mockResolvedValue({ status: 'draft', step: 'districts' });
    const { ctx, reply } = fakeCtx();
    await startDepositFlow(ctx, 'chat-row', 'en');
    expect(replies(reply).map((r) => r.text)).toEqual([rt('en', 'roommateQuestionsOpen')]);

    reply.mockClear();
    expect(await maybeOfferDeposit(ctx, 'en', 'deposit', true)).toBe(true);
    expect(replies(reply).map((r) => r.text)).toEqual([rt('en', 'roommateQuestionsOpen')]);
  });

  it('a Russian or Ukrainian chat gets no gate', async () => {
    for (const locale of ['ru', 'uk'] as const) {
      const { ctx, reply } = fakeCtx();
      await startDepositFlow(ctx, 'chat-row', locale);
      expect(replies(reply).map((r) => r.text)).toEqual([
        dt(locale, 'intro'),
        dt(locale, 'askMovedOut'),
      ]);

      const offer = fakeCtx();
      await maybeOfferDeposit(offer.ctx, locale, 'залог');
      expect(replies(offer.reply)).toEqual([
        {
          text: dt(locale, 'keywordOffer'),
          buttons: [`${t(locale, 'btnStartFlow')} → dep:start`],
        },
      ]);
    }
  });
});

describe('a gate language button', () => {
  it.each<DepositLocale>(['ru', 'uk'])(
    'dep:lang:%s sets the chat locale and starts the questions in it',
    async (locale) => {
      const { ctx, reply, answerCallbackQuery } = fakeCtx(`dep:lang:${locale}`);
      await handleDepositLanguage(ctx);

      expect(mocks.setChatLocale).toHaveBeenCalledWith(CHAT_ID, locale);
      expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
      expect(db.depositCase.create).toHaveBeenCalledWith({
        data: { chatId: 'chat-row', step: 'moved_out' },
      });
      expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_deposit_flow_started');
      expect(replies(reply).map((r) => r.text)).toEqual([
        dt(locale, 'intro'),
        dt(locale, 'askMovedOut'),
      ]);
      // The locale is stored before the first deposit text goes out.
      expect(mocks.setChatLocale.mock.invocationCallOrder[0]).toBeLessThan(
        reply.mock.invocationCallOrder[0],
      );
    },
  );

  it('is registered for both buttons', async () => {
    const { ctx, reply } = fakeCtx('dep:lang:uk');
    await registered()(DEPOSIT_LANG_CALLBACK)(ctx);

    expect(mocks.setChatLocale).toHaveBeenCalledWith(CHAT_ID, 'uk');
    expect(replies(reply)[0].text).toBe(dt('uk', 'intro'));
  });
});

describe('a case already open in a chat that switched to English goes on in Russian', () => {
  it('the next intake question', async () => {
    db.depositCase.findFirst.mockResolvedValue({
      id: 'case-1',
      status: 'intake',
      step: 'moved_out',
      contractFiles: [],
    });
    const { ctx, reply } = fakeCtx();

    expect(await handleDepositText(ctx, 'chat-row', 'en', '12.09')).toBe(true);
    expect(replies(reply).map((r) => r.text)).toEqual([dt('ru', 'askDeposit')]);
  });

  it('a reason button', async () => {
    db.depositCase.findFirst.mockResolvedValue({ id: 'case-1', status: 'intake', step: 'reason' });
    const { ctx, reply } = fakeCtx();
    (ctx as unknown as { match: RegExpMatchArray }).match = 'dep:r:wear'.match(
      /^dep:r:(wear|paint|damage|bills|silent|other)$/,
    )!;
    await registered()(/^dep:r:(wear|paint|damage|bills|silent|other)$/)(ctx);

    expect(replies(reply)[0].text).toBe(dt('ru', 'askProtocol'));
    expect(replies(reply)[0].buttons[0]).toBe(`${dt('ru', 'protocolBoth')} → dep:p:both`);
  });
});
