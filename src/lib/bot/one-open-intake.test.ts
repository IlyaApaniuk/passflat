import type { Bot, Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * One open intake per chat (spec 06 §Entry and routing), the deposit side: while
 * a roommate draft or edit step is open, the deposit questions do not start from
 * the `dep` link, the `dep:start` button or the keyword offer. The roommate side
 * (rule 5) is in `roommate-flow.test.ts`. Prisma is mocked.
 */

const db = vi.hoisted(() => ({
  roommateProfile: { findUnique: vi.fn() },
  depositCase: { updateMany: vi.fn(), create: vi.fn() },
}));
const mocks = vi.hoisted(() => ({ track: vi.fn(), touchChat: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('./analytics', () => ({ track: mocks.track }));
vi.mock('./contract', () => ({ readContract: vi.fn() }));
vi.mock('./store', () => ({ touchChat: mocks.touchChat }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));
vi.mock('@/lib/posthog-server', () => ({ flushPostHog: vi.fn(async () => {}) }));

import { maybeOfferDeposit, registerDepositFlow, startDepositFlow } from './deposit-flow';
import { dt } from './deposit-texts';
import { rt } from './roommate-texts';

const CHAT_ID = 4242;

function fakeCtx() {
  const reply = vi.fn().mockResolvedValue({});
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const ctx = { chat: { id: CHAT_ID }, reply, answerCallbackQuery } as unknown as Context;
  return { ctx, reply, answerCallbackQuery };
}

/** The handler `registerDepositFlow` registers for the `dep:start` button. */
function depStartHandler(): (ctx: Context) => Promise<void> {
  const handlers = new Map<unknown, (ctx: Context) => Promise<void>>();
  const bot = {
    callbackQuery: (trigger: unknown, handler: (ctx: Context) => Promise<void>) => {
      handlers.set(trigger, handler);
    },
    on: vi.fn(),
  } as unknown as Bot;
  registerDepositFlow(bot);
  return handlers.get('dep:start')!;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.touchChat.mockResolvedValue({ id: 'chat-row', locale: 'ru', isNew: false });
  db.roommateProfile.findUnique.mockResolvedValue(null);
  db.depositCase.updateMany.mockResolvedValue({ count: 0 });
  db.depositCase.create.mockResolvedValue({ id: 'case-1' });
});

describe('startDepositFlow (the dep link and dep:start)', () => {
  it.each([
    ['a roommate draft', { status: 'draft', step: 'districts' }],
    ['an edit step of a saved profile', { status: 'active', step: 'edit_budget' }],
  ])('does not start while %s is open, and says how to leave it', async (_label, row) => {
    db.roommateProfile.findUnique.mockResolvedValue(row);
    const { ctx, reply } = fakeCtx();
    await startDepositFlow(ctx, 'chat-row', 'uk');

    expect(db.roommateProfile.findUnique).toHaveBeenCalledWith({
      where: { chatId: 'chat-row' },
      select: { status: true, step: true },
    });
    expect(reply.mock.calls.map((c) => c[0])).toEqual([rt('uk', 'roommateQuestionsOpen')]);
    expect(rt('uk', 'roommateQuestionsOpen')).toContain('/cancel');
    expect(db.depositCase.updateMany).not.toHaveBeenCalled();
    expect(db.depositCase.create).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it.each([
    ['no roommate profile', null],
    ['a saved profile without a step', { status: 'active', step: null }],
    ['a hidden profile', { status: 'hidden', step: null }],
  ])('starts as today with %s', async (_label, row) => {
    db.roommateProfile.findUnique.mockResolvedValue(row);
    const { ctx, reply } = fakeCtx();
    await startDepositFlow(ctx, 'chat-row', 'ru');

    expect(db.depositCase.create).toHaveBeenCalledWith({
      data: { chatId: 'chat-row', step: 'moved_out' },
    });
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_deposit_flow_started');
    expect(reply.mock.calls.map((c) => c[0])).toEqual([dt('ru', 'intro'), dt('ru', 'askMovedOut')]);
  });

  it('the dep:start button is refused the same way and its tap is answered', async () => {
    db.roommateProfile.findUnique.mockResolvedValue({ status: 'draft', step: 'month' });
    const { ctx, reply, answerCallbackQuery } = fakeCtx();
    await depStartHandler()(ctx);

    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls.map((c) => c[0])).toEqual([rt('ru', 'roommateQuestionsOpen')]);
    expect(db.depositCase.create).not.toHaveBeenCalled();
  });
});

describe('maybeOfferDeposit (the keyword offer)', () => {
  it('replies with the roommate /cancel line instead of the offer while a roommate step is open', async () => {
    const { ctx, reply } = fakeCtx();

    expect(await maybeOfferDeposit(ctx, 'ru', 'как вернуть залог', true)).toBe(true);
    expect(reply.mock.calls.map((c) => c[0])).toEqual([rt('ru', 'roommateQuestionsOpen')]);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('offers the deposit flow as today otherwise', async () => {
    const { ctx, reply } = fakeCtx();

    expect(await maybeOfferDeposit(ctx, 'ru', 'как вернуть залог')).toBe(true);
    expect(reply.mock.calls[0][0]).toBe(dt('ru', 'keywordOffer'));
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_deposit_offered');
  });

  it('leaves a text without a deposit keyword alone either way', async () => {
    const { ctx, reply } = fakeCtx();

    expect(await maybeOfferDeposit(ctx, 'ru', 'Puławska 10', true)).toBe(false);
    expect(reply).not.toHaveBeenCalled();
  });
});
