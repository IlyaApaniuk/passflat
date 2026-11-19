import type { CommandContext, Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  summarizeDepositReturns,
  summarizeFigures,
  type AreaReference,
  type FigureReport,
} from '@/lib/cost-figures';

import { handleDeposit, handleStart } from './bot';
import { renderLookup } from './format';
import type { AddressLookup } from './lookup';
import { t } from './texts';

const mocks = vi.hoisted(() => ({
  touchChat: vi.fn(),
  addSubscription: vi.fn(),
  track: vi.fn(),
  startDepositFlow: vi.fn(),
  cancelDepositFlow: vi.fn(),
  hasOpenIntake: vi.fn(),
  getDistrictBySlug: vi.fn(),
  getCityDepositFacts: vi.fn(),
  lookupBuilding: vi.fn(),
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
  cancelDepositFlow: mocks.cancelDepositFlow,
  hasOpenIntake: mocks.hasOpenIntake,
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
  lookupBuilding: mocks.lookupBuilding,
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

/** The callback data and URLs of a reply's inline keyboard, row by row. */
function buttons(reply: ReturnType<typeof vi.fn>): string[] {
  const markup = reply.mock.calls[0][1]?.reply_markup as
    | { inline_keyboard: { callback_data?: string; url?: string }[][] }
    | undefined;
  return (markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data ?? b.url ?? '');
}

function report(source: string, fields: Partial<FigureReport> = {}): FigureReport {
  return { source, rentalType: 'apartment', utilitiesComplete: true, ...fields };
}

const areaReports = [3_700, 4_000, 4_400, 5_000, 5_400].map((total) =>
  report('user', { totalMonthlyAvg: total, rent: total - 800 }),
);

function areaReference(level: AreaReference['level']): AreaReference {
  return {
    level,
    slug: level === 'district' ? 'mokotow' : 'warsaw',
    name: level === 'district' ? 'Mokotów' : 'Warszawa',
    summary: summarizeFigures(areaReports, { level, rentalType: 'all' }),
  };
}

/** What `lookupBuilding` returns for building UUID: reported, district reference. */
function buildingLookup(overrides: Partial<AddressLookup> = {}): AddressLookup {
  return {
    level: 'building',
    address: 'Puławska 10',
    citySlug: 'warsaw',
    buildingId: UUID,
    buildingSlug: 'pulawska-10',
    placeId: 'place-1',
    districtSlug: 'mokotow',
    districtName: 'Mokotów',
    building: summarizeFigures(
      [report('user', { totalMonthlyAvg: 4_000, rent: 3_200 }), report('user', { rent: 3_400 })],
      { level: 'building', rentalType: 'all' },
    ),
    reference: areaReference('district'),
    neighbours: [],
    deposit: { answered: 0, gotBack: 0, full: 0, medianDeposit: null },
    imprecise: false,
    ...overrides,
  };
}

/** The checker created the row, nobody reported: the area card of its district. */
const unreportedLookup = () =>
  buildingLookup({
    level: 'district',
    building: summarizeFigures([], { level: 'building', rentalType: 'all' }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.touchChat.mockResolvedValue({ id: 'chat-row', locale: 'ru', isNew: true });
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.lookupBuilding.mockResolvedValue(null);
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
    expect(mocks.lookupBuilding).not.toHaveBeenCalled();
  });

  it('tracks and stores the raw payload, not the parsed one', async () => {
    mocks.touchChat.mockResolvedValue({ id: 'chat-row', locale: 'uk', isNew: false });
    const raw = `b_${UUID.toUpperCase()}`;
    const { ctx } = fakeContext(`/start ${raw}`);
    await handleStart(ctx);

    expect(mocks.touchChat).toHaveBeenCalledWith(expect.objectContaining({ startPayload: raw }));
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_bot_started', {
      payload: raw,
      is_new: false,
    });
    expect(mocks.lookupBuilding).toHaveBeenCalledWith(UUID);
  });
});

describe('handleStart with a building link (b_<uuid>)', () => {
  const fallback = (locale: 'ru' | 'uk') =>
    `${t(locale, 'buildingLinkFailed')}\n\n${t(locale, 'startAfterPayload')}`;

  it('replies at once with the building’s card and buttons, as for its typed address', async () => {
    const lookup = buildingLookup();
    mocks.lookupBuilding.mockResolvedValue(lookup);
    const { ctx, reply } = fakeContext(`/start b_${UUID}`);
    await handleStart(ctx);

    expect(mocks.lookupBuilding).toHaveBeenCalledWith(UUID);
    expect(replyKey(reply)).toBe(renderLookup(lookup, 'ru'));
    expect(reply.mock.calls[0][1]).toMatchObject({ parse_mode: 'HTML' });
    expect(buttons(reply)).toContain(`sub:b:${UUID}`);
    expect(buttons(reply).some((url) => url.includes('/warsaw/building/pulawska-10'))).toBe(true);
    // No request to type the address.
    expect(replyKey(reply)).not.toContain(t('ru', 'buildingLinkFailed'));
    expect(replyKey(reply)).not.toContain('Пришли адрес');
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_address_checked', {
      level: 'building',
      district: 'mokotow',
      has_building: true,
      report_count: 2,
    });
    expect(mocks.track.mock.calls.filter(([, e]) => e === 'tg_address_checked')).toHaveLength(1);
  });

  it('gives the area card starting with noBuildingData for a building without reports', async () => {
    mocks.lookupBuilding.mockResolvedValue(unreportedLookup());
    const { ctx, reply } = fakeContext(`/start b_${UUID}`);
    await handleStart(ctx);

    const text = replyKey(reply);
    expect(text).toBe(renderLookup(unreportedLookup(), 'ru'));
    expect(text.startsWith(`📍 <b>Puławska 10</b>\n${t('ru', 'noBuildingData')}\n`)).toBe(true);
    expect(text).toContain(t('ru', 'areaHeader', { area: 'Mokotów' }));
    expect(buttons(reply)).toContain('sub:d:mokotow');
  });

  it('gives the city reference for a building without coordinates or district', async () => {
    const lookup = buildingLookup({
      level: 'city',
      districtSlug: null,
      districtName: null,
      building: summarizeFigures([], { level: 'building', rentalType: 'all' }),
      reference: areaReference('city'),
    });
    mocks.lookupBuilding.mockResolvedValue(lookup);
    const { ctx, reply } = fakeContext(`/start b_${UUID}`);
    await handleStart(ctx);

    const text = replyKey(reply);
    expect(text).toBe(renderLookup(lookup, 'ru'));
    expect(text).toContain(t('ru', 'noBuildingData'));
    expect(text).toContain(t('ru', 'cityHeader', { area: 'Варшава' }));
    expect(text).not.toContain('данные по району');
  });

  it.each([
    ['an unknown id', null],
    ['a deleted building', null],
    ['a building outside the checker city', null],
  ])('gives the fallback and the address prompt for %s', async (_label, result) => {
    mocks.lookupBuilding.mockResolvedValue(result);
    const { ctx, reply } = fakeContext(`/start b_${UUID}`);
    await handleStart(ctx);

    expect(mocks.lookupBuilding).toHaveBeenCalledWith(UUID);
    expect(replyKey(reply)).toBe(fallback('ru'));
    expect(mocks.track).not.toHaveBeenCalledWith(CHAT_ID, 'tg_address_checked', expect.anything());
  });

  it.each(['b_123', 'b_', `b_${UUID}0`, `b_${UUID.replace(/-/g, '')}`])(
    'gives the fallback for the malformed %s without a building query',
    async (payload) => {
      const { ctx, reply } = fakeContext(`/start ${payload}`);
      await handleStart(ctx);

      expect(mocks.lookupBuilding).not.toHaveBeenCalled();
      expect(replyKey(reply)).toBe(fallback('ru'));
    },
  );

  it('answers in Ukrainian for a Ukrainian chat', async () => {
    mocks.touchChat.mockResolvedValue({ id: 'chat-row', locale: 'uk', isNew: false });
    const { ctx, reply } = fakeContext(`/start b_${UUID}`);
    await handleStart(ctx);
    expect(replyKey(reply)).toBe(fallback('uk'));

    mocks.lookupBuilding.mockResolvedValue(buildingLookup());
    const second = fakeContext(`/start b_${UUID}`);
    await handleStart(second.ctx);
    expect(replyKey(second.reply)).toBe(renderLookup(buildingLookup(), 'uk'));
  });

  it('replies genericError on a database error, never silence', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.lookupBuilding.mockRejectedValue(new Error('connection refused'));
    const { ctx, reply } = fakeContext(`/start b_${UUID}`);
    await handleStart(ctx);

    expect(replyKey(reply)).toBe(t('ru', 'genericError'));
    expect(mocks.track).not.toHaveBeenCalledWith(CHAT_ID, 'tg_address_checked', expect.anything());
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('keeps an open deposit intake open and mentions /cancel under the card', async () => {
    mocks.hasOpenIntake.mockResolvedValue(true);
    mocks.lookupBuilding.mockResolvedValue(buildingLookup());
    const { ctx, reply } = fakeContext(`/start b_${UUID}`);
    await handleStart(ctx);

    expect(mocks.hasOpenIntake).toHaveBeenCalledWith('chat-row');
    expect(replyKey(reply)).toBe(
      `${renderLookup(buildingLookup(), 'ru')}\n\n${t('ru', 'intakeStillOpen')}`,
    );
    expect(t('ru', 'intakeStillOpen')).toContain('/cancel');
    expect(t('uk', 'intakeStillOpen')).toContain('/cancel');
    expect(mocks.cancelDepositFlow).not.toHaveBeenCalled();
    expect(mocks.startDepositFlow).not.toHaveBeenCalled();
  });

  it('mentions /cancel under the fallback too, while an intake is open', async () => {
    mocks.hasOpenIntake.mockResolvedValue(true);
    const { ctx, reply } = fakeContext('/start b_123');
    await handleStart(ctx);

    expect(replyKey(reply)).toBe(`${fallback('ru')}\n\n${t('ru', 'intakeStillOpen')}`);
    expect(mocks.cancelDepositFlow).not.toHaveBeenCalled();
  });

  it('adds no intake line without an open intake', async () => {
    mocks.lookupBuilding.mockResolvedValue(buildingLookup());
    const { ctx, reply } = fakeContext(`/start b_${UUID}`);
    await handleStart(ctx);

    expect(replyKey(reply)).not.toContain('/cancel');
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
