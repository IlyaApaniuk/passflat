import type { CommandContext, Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { summarizeDepositReturns, type FigureReport } from '@/lib/cost-figures';

import { handleDeposit, handleStart } from './bot';
import { t } from './texts';

const mocks = vi.hoisted(() => ({
  touchChat: vi.fn(),
  addSubscription: vi.fn(),
  track: vi.fn(),
  startDepositFlow: vi.fn(),
  getDistrictBySlug: vi.fn(),
  getCityDepositFacts: vi.fn(),
}));

vi.mock('./store', () => ({
  touchChat: mocks.touchChat,
  addSubscription: mocks.addSubscription,
  listSubscriptions: vi.fn(),
  removeSubscription: vi.fn(),
  setChatLocale: vi.fn(),
}));
vi.mock('./analytics', () => ({ track: mocks.track }));
vi.mock('./deposit-flow', () => ({
  startDepositFlow: mocks.startDepositFlow,
  cancelDepositFlow: vi.fn(),
  handleDepositText: vi.fn(),
  maybeOfferDeposit: vi.fn(),
  registerDepositFlow: vi.fn(),
}));
vi.mock('./lookup', () => ({
  getDistrictBySlug: mocks.getDistrictBySlug,
  getCity: vi.fn(),
  getCityDepositFacts: mocks.getCityDepositFacts,
  getDistrictTable: vi.fn(),
  lookupAddress: vi.fn(),
}));
vi.mock('@/lib/cost-baselines', () => ({ getCityCostStats: vi.fn() }));

const UUID = '3f2c8a1e-9b4d-4c7a-8e21-5d6f0a9b1c3e';
const CHAT_ID = 4242;

function fakeContext(text: string) {
  const reply = vi.fn();
  const ctx = {
    chat: { id: CHAT_ID },
    from: { language_code: 'ru' },
    message: { text },
    reply,
  } as unknown as CommandContext<Context>;
  return { ctx, reply };
}

function replyKey(reply: ReturnType<typeof vi.fn>): string {
  expect(reply).toHaveBeenCalledTimes(1);
  return reply.mock.calls[0][0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.touchChat.mockResolvedValue({ id: 'chat-row', locale: 'ru', isNew: true });
});

describe('handleStart', () => {
  it('greets a plain /start and records it without a payload', async () => {
    const { ctx, reply } = fakeContext('/start');
    await handleStart(ctx);

    expect(replyKey(reply)).toBe(t('ru', 'start'));
    expect(mocks.touchChat).toHaveBeenCalledWith({
      chatId: CHAT_ID,
      locale: 'ru',
      startPayload: null,
    });
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_bot_started', {
      payload: null,
      is_new: true,
    });
    expect(mocks.getDistrictBySlug).not.toHaveBeenCalled();
  });

  it('starts the deposit flow for dep', async () => {
    const { ctx, reply } = fakeContext('/start dep');
    await handleStart(ctx);

    expect(mocks.startDepositFlow).toHaveBeenCalledWith(ctx, 'chat-row', 'ru');
    expect(reply).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_bot_started', {
      payload: 'dep',
      is_new: true,
    });
  });

  it('subscribes to a known district as before', async () => {
    mocks.getDistrictBySlug.mockResolvedValue({
      citySlug: 'warsaw',
      slug: 'mokotow',
      name: 'Mokotów',
    });
    const { ctx, reply } = fakeContext('/start d_mokotow');
    await handleStart(ctx);

    expect(mocks.getDistrictBySlug).toHaveBeenCalledWith('mokotow');
    expect(mocks.addSubscription).toHaveBeenCalledWith(CHAT_ID, {
      districtSlug: 'mokotow',
      citySlug: 'warsaw',
    });
    expect(replyKey(reply)).toBe(t('ru', 'subscribedDistrict', { name: 'Mokotów' }));
  });

  it('falls back to the generic reply for an unknown district', async () => {
    mocks.getDistrictBySlug.mockResolvedValue(null);
    const { ctx, reply } = fakeContext('/start d_atlantis');
    await handleStart(ctx);

    expect(mocks.getDistrictBySlug).toHaveBeenCalledWith('atlantis');
    expect(mocks.addSubscription).not.toHaveBeenCalled();
    expect(replyKey(reply)).toBe(t('ru', 'startAfterPayload'));
  });

  it('does not look up a malformed district slug', async () => {
    const { ctx, reply } = fakeContext('/start d_Mokotow');
    await handleStart(ctx);

    expect(mocks.getDistrictBySlug).not.toHaveBeenCalled();
    expect(replyKey(reply)).toBe(t('ru', 'startAfterPayload'));
  });

  it.each([
    ['a building link', `b_${UUID}`],
    ['a malformed building link', 'b_123'],
    ['a website link', 'web_checker'],
    ['an attribution payload', 'thr_med'],
    ['a payload with a space', 'dep now'],
  ])('keeps the generic reply for %s', async (_label, payload) => {
    const { ctx, reply } = fakeContext(`/start ${payload}`);
    await handleStart(ctx);

    expect(replyKey(reply)).toBe(t('ru', 'startAfterPayload'));
    expect(mocks.startDepositFlow).not.toHaveBeenCalled();
    expect(mocks.getDistrictBySlug).not.toHaveBeenCalled();
    expect(mocks.addSubscription).not.toHaveBeenCalled();
  });

  it('tracks and stores the raw payload, not the parsed one', async () => {
    mocks.touchChat.mockResolvedValue({ id: 'chat-row', locale: 'uk', isNew: false });
    const raw = `b_${UUID.toUpperCase()}`;
    const { ctx, reply } = fakeContext(`/start ${raw}`);
    await handleStart(ctx);

    expect(mocks.touchChat).toHaveBeenCalledWith(expect.objectContaining({ startPayload: raw }));
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_bot_started', {
      payload: raw,
      is_new: false,
    });
    expect(replyKey(reply)).toBe(t('uk', 'startAfterPayload'));
  });
});

/** Golden example 10 of spec 03 (the deposit fields only): 2 of 3 answered got it back. */
const depositReports: FigureReport[] = [
  { source: 'user', depositAmount: 4_000, depositReturned: true, depositReturnedAmount: 4_000 },
  { source: 'user', depositAmount: 4_000, depositReturned: true, depositReturnedAmount: 2_500 },
  { source: 'user', depositAmount: 4_000, depositReturned: false, depositReturnedAmount: 0 },
  { source: 'user', depositAmount: 4_000, depositReturned: null, isCurrentTenant: true },
];

describe('handleDeposit', () => {
  it('states the city statistic as counts in the cards’ wording', async () => {
    mocks.getCityDepositFacts.mockResolvedValue({
      deposit: summarizeDepositReturns(depositReports),
    });
    const { ctx, reply } = fakeContext('/deposit');
    await handleDeposit(ctx);

    const text = replyKey(reply);
    expect(text).toContain(
      `${t('ru', 'depositHeader')}\n\nВернули залог полностью или частично: 2 из 3 ответивших (Варшава)\n`,
    );
    expect(text).toContain(t('ru', 'depositAdvice'));
    expect(text).not.toMatch(/%|Типичный залог|Возвращают полностью/);
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_deposit_viewed');
  });

  it('answers in Ukrainian for a Ukrainian chat', async () => {
    mocks.touchChat.mockResolvedValue({ id: 'chat-row', locale: 'uk', isNew: false });
    mocks.getCityDepositFacts.mockResolvedValue({
      deposit: summarizeDepositReturns(depositReports),
    });
    const { ctx, reply } = fakeContext('/deposit');
    await handleDeposit(ctx);

    expect(replyKey(reply)).toContain(
      'Повернули заставу повністю або частково: 2 з 3 тих, хто відповів (Варшава)',
    );
  });

  it('says data is thin below three answers, and when the city is missing', async () => {
    for (const facts of [{ deposit: summarizeDepositReturns(depositReports.slice(1)) }, null]) {
      mocks.getCityDepositFacts.mockResolvedValue(facts);
      const { ctx, reply } = fakeContext('/deposit');
      await handleDeposit(ctx);

      const text = replyKey(reply);
      expect(text).toContain(t('ru', 'depositNoData'));
      expect(text).not.toContain('ответивших');
    }
  });
});
