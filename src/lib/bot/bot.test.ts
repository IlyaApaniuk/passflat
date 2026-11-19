import type { CallbackQueryContext, CommandContext, Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  summarizeDepositReturns,
  summarizeFigures,
  type AreaReference,
  type FigureReport,
} from '@/lib/cost-figures';

import {
  SUBSCRIBE_CALLBACK,
  UNSUBSCRIBE_CALLBACK,
  handleDeposit,
  handleMy,
  handleStart,
  handleSubscribe,
  handleText,
  handleUnsubscribe,
} from './bot';
import { renderDistrict, renderLookup } from './format';
import type { AddressLookup } from './lookup';
import { t } from './texts';

const mocks = vi.hoisted(() => ({
  touchChat: vi.fn(),
  addSubscription: vi.fn(),
  listSubscriptions: vi.fn(),
  removeSubscription: vi.fn(),
  track: vi.fn(),
  startDepositFlow: vi.fn(),
  cancelDepositFlow: vi.fn(),
  hasOpenIntake: vi.fn(),
  getDistrictBySlug: vi.fn(),
  getCityDepositFacts: vi.fn(),
  lookupBuilding: vi.fn(),
  getCity: vi.fn(),
  getDistrictTable: vi.fn(),
  lookupAddress: vi.fn(),
  geocodeAddress: vi.fn(),
  handleDepositText: vi.fn(),
  maybeOfferDeposit: vi.fn(),
}));

vi.mock('./store', () => ({
  touchChat: mocks.touchChat,
  addSubscription: mocks.addSubscription,
  listSubscriptions: mocks.listSubscriptions,
  removeSubscription: mocks.removeSubscription,
  setChatLocale: vi.fn(),
}));
vi.mock('./analytics', () => ({ track: mocks.track }));
vi.mock('./deposit-flow', () => ({
  startDepositFlow: mocks.startDepositFlow,
  cancelDepositFlow: mocks.cancelDepositFlow,
  hasOpenIntake: mocks.hasOpenIntake,
  handleDepositText: mocks.handleDepositText,
  maybeOfferDeposit: mocks.maybeOfferDeposit,
  registerDepositFlow: vi.fn(),
}));
vi.mock('./lookup', () => ({
  getDistrictBySlug: mocks.getDistrictBySlug,
  getCity: mocks.getCity,
  getCityDepositFacts: mocks.getCityDepositFacts,
  getDistrictTable: mocks.getDistrictTable,
  lookupAddress: mocks.lookupAddress,
  lookupBuilding: mocks.lookupBuilding,
}));
// Geocoding is a paid Google call: never made from a test.
vi.mock('./geocode', () => ({ geocodeAddress: mocks.geocodeAddress }));

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
  mocks.getDistrictTable.mockResolvedValue([]);
  mocks.getCity.mockResolvedValue(null);
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
      entry_source: 'link_building',
      lookup_level: 'building',
      source_kind: 'tenant',
      n: 1,
      incomplete: false,
    });
    expect(mocks.track.mock.calls.filter(([, e]) => e === 'tg_address_checked')).toHaveLength(1);
    // The link never goes through the typed-address path.
    expect(mocks.geocodeAddress).not.toHaveBeenCalled();
    expect(mocks.lookupAddress).not.toHaveBeenCalled();
  });

  it('records a building without reports as link_building with its district reference', async () => {
    mocks.lookupBuilding.mockResolvedValue(unreportedLookup());
    const { ctx } = fakeContext(`/start b_${UUID}`);
    await handleStart(ctx);

    const checks = mocks.track.mock.calls.filter(([, e]) => e === 'tg_address_checked');
    expect(checks).toEqual([
      [
        CHAT_ID,
        'tg_address_checked',
        expect.objectContaining({
          entry_source: 'link_building',
          lookup_level: 'district',
          has_building: true,
          report_count: 0,
          source_kind: 'tenant',
          n: 5,
        }),
      ],
    ]);
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

/** What `getDistrictBySlug('mokotow')` returns: by default a district with its own reference. */
/**
 * What `getDistrictBySlug` returns: the reference, the district's single number
 * (its `/districts` row: tenant group of 12 reports) and no rank, as under the
 * bot's `all` filter.
 */
function district(
  name = 'Mokotów',
  reference: AreaReference | null = areaReference('district'),
  figure: { reportCount: number } | null = { reportCount: 12 },
  rank: { position: number; total: number } | null = null,
) {
  return {
    citySlug: 'warsaw',
    slug: 'mokotow',
    name,
    deposit: { answered: 0, gotBack: 0, full: 0, medianDeposit: null },
    reference,
    figure,
    rank,
  };
}

/** The texts of a reply's inline buttons. */
function buttonTexts(reply: ReturnType<typeof vi.fn>): string[] {
  const markup = reply.mock.calls[0][1]?.reply_markup as
    | { inline_keyboard: { text: string }[][] }
    | undefined;
  return (markup?.inline_keyboard ?? []).flat().map((b) => b.text);
}

/** A tap on an inline button with this callback data, matched as the bot matches it. */
function fakeCallback(data: string) {
  const reply = vi.fn();
  const answerCallbackQuery = vi.fn();
  const ctx = {
    chat: { id: CHAT_ID },
    match: data.match(SUBSCRIBE_CALLBACK),
    answerCallbackQuery,
    reply,
  } as unknown as CallbackQueryContext<Context>;
  return { ctx, reply, answerCallbackQuery };
}

describe('handleStart with a district link (d_<slug>)', () => {
  beforeEach(() => {
    mocks.getDistrictBySlug.mockResolvedValue(district());
    mocks.getCity.mockResolvedValue({ id: 'city-1', slug: 'warsaw', districts: [] });
  });

  const card = (
    locale: 'ru' | 'uk',
    reference: AreaReference | null = areaReference('district'),
    rank: { position: number; total: number } | null = null,
  ) => renderDistrict({ name: 'Mokotów', reference, deposit: district().deposit, rank }, locale);

  it('answers with the district card and a save-interest button, saving nothing', async () => {
    const { ctx, reply } = fakeContext('/start d_mokotow');
    await handleStart(ctx);

    expect(mocks.getDistrictBySlug).toHaveBeenCalledWith('mokotow');
    expect(replyKey(reply)).toBe(card('ru'));
    // The district's groups with N, from its reference on the contract.
    expect(replyKey(reply)).toContain('📊 <b>Mokotów</b> — данные по району:');
    expect(replyKey(reply)).toContain('👥 <b>Отчёты жильцов: 5</b>');
    expect(replyKey(reply)).toContain('(медиана по 5 отчётам)');
    // No rank under `all` (golden example 16), and no league table is read.
    expect(replyKey(reply)).not.toContain('место из');
    expect(mocks.getDistrictTable).not.toHaveBeenCalled();
    // The blended city median is no longer read: the card needs no city lookup.
    expect(mocks.getCity).not.toHaveBeenCalled();
    expect(reply.mock.calls[0][1]).toMatchObject({ parse_mode: 'HTML' });
    expect(buttons(reply)).toContain('sub:d:mokotow');
    expect(buttonTexts(reply)).toContain(t('ru', 'subscribeDistrict', { district: 'Mokotów' }));
    expect(buttons(reply)).toContain('districts');
    expect(mocks.addSubscription).not.toHaveBeenCalled();
    expect(replyKey(reply)).not.toContain(t('ru', 'subscribedDistrict', { name: 'Mokotów' }));
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_district_checked', {
      district: 'mokotow',
      report_count: 12,
      entry_source: 'link_district',
      source_kind: 'tenant',
      n: 5,
      incomplete: false,
    });
    expect(mocks.track.mock.calls.filter(([, e]) => e === 'tg_district_checked')).toHaveLength(1);
  });

  it('answers in Ukrainian for a Ukrainian chat', async () => {
    mocks.touchChat.mockResolvedValue({ id: 'chat-row', locale: 'uk', isNew: false });
    const { ctx, reply } = fakeContext('/start d_mokotow');
    await handleStart(ctx);

    expect(replyKey(reply)).toBe(card('uk'));
    expect(buttonTexts(reply)).toContain(t('uk', 'subscribeDistrict', { district: 'Mokotów' }));
    expect(mocks.addSubscription).not.toHaveBeenCalled();
  });

  it('escapes the district name in the card', async () => {
    mocks.getDistrictBySlug.mockResolvedValue(district('Mokotów <i>&</i>'));
    const { ctx, reply } = fakeContext('/start d_mokotow');
    await handleStart(ctx);

    expect(replyKey(reply)).toContain('Mokotów &lt;i&gt;&amp;&lt;/i&gt;');
    expect(replyKey(reply)).not.toContain('<i>&</i>');
  });

  it('answers a thin district with the city reference; report_count stays the district’s', async () => {
    mocks.getDistrictBySlug.mockResolvedValue(
      district('Mokotów', areaReference('city'), { reportCount: 2 }),
    );
    const { ctx, reply } = fakeContext('/start d_mokotow');
    await handleStart(ctx);

    const text = replyKey(reply);
    expect(text).toBe(card('ru', areaReference('city')));
    expect(text).toContain('показываю Варшаву целиком');
    expect(text).toContain('📊 <b>Варшава</b> — данные по городу:');
    expect(text).toContain('(медиана по 5 отчётам)');
    expect(buttons(reply)).toContain('sub:d:mokotow');
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_district_checked', {
      district: 'mokotow',
      report_count: 2,
      entry_source: 'link_district',
      source_kind: 'tenant',
      n: 5,
      incomplete: false,
    });
  });

  it('passes a comparable rank through to the card', async () => {
    mocks.getDistrictBySlug.mockResolvedValue(
      district(
        'Mokotów',
        areaReference('district'),
        { reportCount: 12 },
        { position: 2, total: 2 },
      ),
    );
    const { ctx, reply } = fakeContext('/start d_mokotow');
    await handleStart(ctx);

    expect(replyKey(reply)).toBe(card('ru', areaReference('district'), { position: 2, total: 2 }));
    expect(replyKey(reply)).toContain('🏷 2-е место из 2 по цене');
  });

  it('records report_count 0 and no rank for a district without a usable value', async () => {
    mocks.getDistrictBySlug.mockResolvedValue(district('Mokotów', null, null));
    const { ctx, reply } = fakeContext('/start d_mokotow');
    await handleStart(ctx);

    expect(replyKey(reply)).toBe(card('ru', null, null));
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_district_checked', {
      district: 'mokotow',
      report_count: 0,
      entry_source: 'link_district',
      source_kind: 'none',
      n: 0,
      incomplete: false,
    });
  });

  it('saves the interest only when its button is tapped', async () => {
    const { ctx, reply } = fakeContext('/start d_mokotow');
    await handleStart(ctx);
    expect(mocks.addSubscription).not.toHaveBeenCalled();

    const data = buttons(reply).find((b) => b.startsWith('sub:d:'))!;
    mocks.addSubscription.mockResolvedValue({ created: true, name: 'Mokotów', targetKey: 'd:x' });
    const tap = fakeCallback(data);
    await handleSubscribe(tap.ctx);

    expect(mocks.addSubscription).toHaveBeenCalledTimes(1);
    expect(mocks.addSubscription).toHaveBeenCalledWith(CHAT_ID, {
      districtSlug: 'mokotow',
      citySlug: 'warsaw',
    });
    expect(replyKey(tap.reply)).toBe(t('ru', 'subscribedDistrict', { name: 'Mokotów' }));
  });
});

/** A typed message that is not a command, as `bot.on('message:text')` receives it. */
function fakeText(text: string) {
  const reply = vi.fn();
  const ctx = {
    chat: { id: CHAT_ID },
    from: { language_code: 'ru' },
    message: { text },
    reply,
    replyWithChatAction: vi.fn(),
  } as unknown as Parameters<typeof handleText>[0];
  return { ctx, reply };
}

describe('handleText (typed address or district)', () => {
  beforeEach(() => {
    mocks.handleDepositText.mockResolvedValue(false);
    mocks.maybeOfferDeposit.mockResolvedValue(false);
    mocks.getCity.mockResolvedValue({
      id: 'city-1',
      slug: 'warsaw',
      districts: [{ id: 'district-mokotow', slug: 'mokotow', nameKey: 'Mokotów' }],
    });
    mocks.getDistrictBySlug.mockResolvedValue(district());
  });

  it('records a typed address as typed_address, once, with the answer quality', async () => {
    mocks.geocodeAddress.mockResolvedValue({ placeId: 'place-1', city: 'Warszawa' });
    mocks.lookupAddress.mockResolvedValue(buildingLookup());
    const { ctx, reply } = fakeText('Puławska 10');
    await handleText(ctx);

    expect(replyKey(reply)).toBe(renderLookup(buildingLookup(), 'ru'));
    const checks = mocks.track.mock.calls.filter(([, e]) => e === 'tg_address_checked');
    expect(checks).toEqual([
      [
        CHAT_ID,
        'tg_address_checked',
        {
          level: 'building',
          district: 'mokotow',
          has_building: true,
          report_count: 2,
          entry_source: 'typed_address',
          lookup_level: 'building',
          source_kind: 'tenant',
          n: 1,
          incomplete: false,
        },
      ],
    ]);
    expect(mocks.lookupBuilding).not.toHaveBeenCalled();
  });

  it('records a typed district name as typed_district, once', async () => {
    const { ctx, reply } = fakeText('Mokotów');
    await handleText(ctx);

    expect(mocks.getDistrictBySlug).toHaveBeenCalledWith('mokotow');
    expect(mocks.geocodeAddress).not.toHaveBeenCalled();
    expect(buttons(reply)).toContain('sub:d:mokotow');
    const checks = mocks.track.mock.calls.filter(([, e]) => e === 'tg_district_checked');
    expect(checks).toEqual([
      [
        CHAT_ID,
        'tg_district_checked',
        {
          district: 'mokotow',
          report_count: 12,
          entry_source: 'typed_district',
          source_kind: 'tenant',
          n: 5,
          incomplete: false,
        },
      ],
    ]);
  });

  it('sends no check event for an address Google cannot find', async () => {
    mocks.geocodeAddress.mockResolvedValue(null);
    const { ctx, reply } = fakeText('Nowhere 999');
    await handleText(ctx);

    expect(replyKey(reply)).toBe(t('ru', 'addressNotFound'));
    expect(mocks.track).not.toHaveBeenCalledWith(CHAT_ID, 'tg_address_checked', expect.anything());
  });
});

describe('links to the cost form (spec 04 §Links to the website)', () => {
  /** The card's button that opens the cost form, parsed. */
  function submitButton(reply: ReturnType<typeof vi.fn>): URL {
    const url = buttons(reply).find((value) => value.includes('/costs/submit'));
    expect(url).toBeDefined();
    return new URL(url as string);
  }

  function expectNoChatId(url: URL) {
    expect(url.toString()).not.toContain(String(CHAT_ID));
    expect(url.toString()).not.toContain('tg_');
  }

  it('sends the building id from a b_ link with a reported building', async () => {
    mocks.lookupBuilding.mockResolvedValue(buildingLookup());
    const { ctx, reply } = fakeContext(`/start b_${UUID}`);
    await handleStart(ctx);

    const url = submitButton(reply);
    expect(url.pathname).toBe('/ru/warsaw/costs/submit');
    expect(url.searchParams.get('b')).toBe(UUID);
    expect(url.searchParams.get('p')).toBe('place-1');
    expect(url.searchParams.get('source')).toBe('tgbot');
    expect(url.searchParams.get('utm_source')).toBe('telegram');
    expect(url.searchParams.get('utm_medium')).toBe('bot');
    expect(url.searchParams.get('utm_campaign')).toBe('submit');
    expectNoChatId(url);
  });

  it('sends the building id for a building without reports (area card)', async () => {
    mocks.lookupBuilding.mockResolvedValue(unreportedLookup());
    const { ctx, reply } = fakeContext(`/start b_${UUID}`);
    await handleStart(ctx);

    const url = submitButton(reply);
    expect(url.searchParams.get('b')).toBe(UUID);
    expect(url.searchParams.get('source')).toBe('tgbot');
    expectNoChatId(url);
  });

  it('sends only p for a typed address without a building row', async () => {
    mocks.handleDepositText.mockResolvedValue(false);
    mocks.maybeOfferDeposit.mockResolvedValue(false);
    mocks.getCity.mockResolvedValue({ id: 'city-1', slug: 'warsaw', districts: [] });
    mocks.geocodeAddress.mockResolvedValue({ placeId: 'place-9', city: 'Warszawa' });
    mocks.lookupAddress.mockResolvedValue(
      buildingLookup({
        level: 'district',
        buildingId: null,
        buildingSlug: null,
        placeId: 'place-9',
        building: null,
      }),
    );
    const { ctx, reply } = fakeText('Puławska 99');
    await handleText(ctx);

    const url = submitButton(reply);
    expect(url.searchParams.has('b')).toBe(false);
    expect(url.searchParams.get('p')).toBe('place-9');
    expect(url.searchParams.get('source')).toBe('tgbot');
    expect(url.searchParams.get('utm_campaign')).toBe('submit');
    expectNoChatId(url);
  });
});

describe('handleSubscribe (save-interest buttons)', () => {
  beforeEach(() => {
    mocks.getDistrictBySlug.mockResolvedValue(district());
    mocks.addSubscription.mockResolvedValue({ created: true, name: 'Mokotów', targetKey: 'd:x' });
  });

  it('saves a district interest and tracks it', async () => {
    const { ctx, reply, answerCallbackQuery } = fakeCallback('sub:d:mokotow');
    await handleSubscribe(ctx);

    expect(mocks.getDistrictBySlug).toHaveBeenCalledWith('mokotow');
    expect(mocks.addSubscription).toHaveBeenCalledWith(CHAT_ID, {
      districtSlug: 'mokotow',
      citySlug: 'warsaw',
    });
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_subscribed', {
      target: 'district',
      district: 'mokotow',
      already: false,
    });
    expect(replyKey(reply)).toBe(t('ru', 'subscribedDistrict', { name: 'Mokotów' }));
    expect(reply.mock.calls[0][1]).toMatchObject({ parse_mode: 'HTML' });
  });

  it('saves a building interest and tracks it', async () => {
    mocks.addSubscription.mockResolvedValue({
      created: true,
      name: 'Puławska 10',
      targetKey: `b:${UUID}`,
    });
    const { ctx, reply } = fakeCallback(`sub:b:${UUID}`);
    await handleSubscribe(ctx);

    expect(mocks.addSubscription).toHaveBeenCalledWith(CHAT_ID, { buildingId: UUID });
    expect(mocks.getDistrictBySlug).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_subscribed', {
      target: 'building',
      already: false,
    });
    expect(replyKey(reply)).toBe(t('ru', 'subscribedBuilding', { name: 'Puławska 10' }));
  });

  it('escapes district and building names in the reply', async () => {
    mocks.getDistrictBySlug.mockResolvedValue(district('Mokotów <i>&</i>'));
    const districtTap = fakeCallback('sub:d:mokotow');
    await handleSubscribe(districtTap.ctx);
    expect(replyKey(districtTap.reply)).toBe(
      t('ru', 'subscribedDistrict', { name: 'Mokotów &lt;i&gt;&amp;&lt;/i&gt;' }),
    );

    mocks.addSubscription.mockResolvedValue({
      created: true,
      name: 'Puławska 10 <b>A & B</b>',
      targetKey: `b:${UUID}`,
    });
    const buildingTap = fakeCallback(`sub:b:${UUID}`);
    await handleSubscribe(buildingTap.ctx);
    const text = replyKey(buildingTap.reply);
    expect(text).toBe(
      t('ru', 'subscribedBuilding', { name: 'Puławska 10 &lt;b&gt;A &amp; B&lt;/b&gt;' }),
    );
    expect(text).not.toContain('<b>A & B</b>');
  });

  it('says it is already saved on a repeat tap', async () => {
    mocks.addSubscription.mockResolvedValue({ created: false, name: 'Mokotów', targetKey: 'd:x' });
    const { ctx, reply } = fakeCallback('sub:d:mokotow');
    await handleSubscribe(ctx);

    expect(replyKey(reply)).toBe(t('ru', 'alreadySubscribed'));
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_subscribed', {
      target: 'district',
      district: 'mokotow',
      already: true,
    });
  });

  it('saves nothing for an unknown district and only answers the tap', async () => {
    mocks.getDistrictBySlug.mockResolvedValue(null);
    const { ctx, reply, answerCallbackQuery } = fakeCallback('sub:d:atlantis');
    await handleSubscribe(ctx);

    expect(mocks.addSubscription).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(reply).not.toHaveBeenCalled();
  });

  it('answers in Ukrainian for a Ukrainian chat', async () => {
    mocks.touchChat.mockResolvedValue({ id: 'chat-row', locale: 'uk', isNew: false });
    const { ctx, reply } = fakeCallback('sub:d:mokotow');
    await handleSubscribe(ctx);

    expect(replyKey(reply)).toBe(t('uk', 'subscribedDistrict', { name: 'Mokotów' }));
  });

  it('says the interest is saved and that nothing is sent automatically', async () => {
    mocks.getDistrictBySlug.mockResolvedValue(district());
    mocks.addSubscription.mockResolvedValue({ created: true, name: 'Mokotów', targetKey: 'd:x' });
    const { ctx, reply } = fakeCallback('sub:d:mokotow');
    await handleSubscribe(ctx);

    const text = replyKey(reply);
    expect(text).toContain('Сохранил интерес к району <b>Mokotów</b>');
    expect(text).toContain('Автоматических уведомлений о новых данных пока нет');
    expect(text).not.toMatch(/напишу|слежу/i);
  });
});

describe('handleMy and the remove button', () => {
  function fakeUnsubscribe(data: string) {
    const reply = vi.fn();
    const answerCallbackQuery = vi.fn();
    const ctx = {
      chat: { id: CHAT_ID },
      match: data.match(UNSUBSCRIBE_CALLBACK),
      answerCallbackQuery,
      reply,
    } as unknown as CallbackQueryContext<Context>;
    return { ctx, reply, answerCallbackQuery };
  }

  it('lists saved interests under the new header with one remove button each', async () => {
    mocks.listSubscriptions.mockResolvedValue([
      { targetKey: 'b:building-1', name: 'Puławska 10', isWaitlist: false },
      { targetKey: 'c:krakow', name: 'Kraków', isWaitlist: true },
    ]);
    const { ctx, reply } = fakeContext('/my');
    await handleMy(ctx);

    expect(replyKey(reply)).toBe(
      `${t('ru', 'mySubsHeader')}\n\n• Puławska 10\n• Kraków <i>(${t('ru', 'waitlistSuffix')})</i>`,
    );
    expect(t('ru', 'mySubsHeader')).toContain('Сохранённые интересы');
    expect(buttons(reply)).toEqual(['unsub:b:building-1', 'unsub:c:krakow']);
    expect(mocks.listSubscriptions).toHaveBeenCalledWith(CHAT_ID);
  });

  it('answers an empty list without promising a message', async () => {
    mocks.listSubscriptions.mockResolvedValue([]);
    const { ctx, reply } = fakeContext('/my');
    await handleMy(ctx);

    expect(replyKey(reply)).toBe(t('ru', 'mySubsEmpty'));
    expect(t('ru', 'mySubsEmpty')).not.toMatch(/напишу/i);
  });

  it('removes the tapped interest and confirms it', async () => {
    const { ctx, reply, answerCallbackQuery } = fakeUnsubscribe('unsub:b:building-1');
    await handleUnsubscribe(ctx);

    expect(mocks.removeSubscription).toHaveBeenCalledWith(CHAT_ID, 'b:building-1');
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith(CHAT_ID, 'tg_unsubscribed');
    expect(replyKey(reply)).toBe(t('ru', 'unsubscribed'));
  });

  it('removes a waitlisted city and answers in Ukrainian', async () => {
    mocks.touchChat.mockResolvedValue({ id: 'chat-row', locale: 'uk', isNew: false });
    const { ctx, reply } = fakeUnsubscribe('unsub:c:krakow');
    await handleUnsubscribe(ctx);

    expect(mocks.removeSubscription).toHaveBeenCalledWith(CHAT_ID, 'c:krakow');
    expect(replyKey(reply)).toBe(t('uk', 'unsubscribed'));
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
