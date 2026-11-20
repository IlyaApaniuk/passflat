import { Prisma, type RoommateProfile } from '@prisma/client';
import { GrammyError, type CallbackQueryContext, type CommandContext, type Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The roommate entry and its routing (spec 06 §Entry and routing): the six cases
 * of "What opens" in order, usernames, typed text at a text step and at a button
 * step, /cancel and the callback wrapper. Prisma is mocked; nothing reaches
 * Telegram or a database.
 */

const db = vi.hoisted(() => ({
  telegramChat: { findUnique: vi.fn() },
  roommateProfile: {
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
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

import { escapeHtml, webLink } from './format';
import {
  cancelRoommate,
  handleMate,
  handleRoommateStartTap,
  handleRoommateText,
  openRoommate,
} from './roommate-flow';
import { rt } from './roommate-texts';

const CHAT_ID = 4242;
const CHAT = { id: 'chat-row', locale: 'ru', isNew: false };
const NOW = new Date('2026-12-05T10:00:00Z');

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

/** The chat's ban marker and profile, as `loadRoommateEntry` reads them. */
function entryState(roommateProfile: RoommateProfile | null, roommateBannedAt: Date | null = null) {
  db.telegramChat.findUnique.mockResolvedValue({ roommateBannedAt, roommateProfile });
  db.roommateProfile.findUnique.mockResolvedValue(roommateProfile);
}

function fakeCtx({ username = 'anna_w' as string | null, languageCode = 'ru' } = {}) {
  const reply = vi.fn().mockResolvedValue({});
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const from = username
    ? { id: CHAT_ID, username, language_code: languageCode }
    : { id: CHAT_ID, language_code: languageCode };
  const ctx = {
    chat: { id: CHAT_ID },
    from,
    message: { text: '/mate' },
    reply,
    answerCallbackQuery,
  } as unknown as Context;
  return { ctx, reply, answerCallbackQuery };
}

type Button = { text: string; callback_data?: string };

/** The inline keyboard of reply number `index`, row by row. */
function keyboard(reply: ReturnType<typeof vi.fn>, index = 0): Button[][] {
  const markup = reply.mock.calls[index][1]?.reply_markup as
    | { inline_keyboard: Button[][] }
    | undefined;
  return markup?.inline_keyboard ?? [];
}

const callbackRows = (rows: Button[][]) => rows.map((row) => row.map((b) => b.callback_data));
const texts = (reply: ReturnType<typeof vi.fn>) => reply.mock.calls.map((call) => call[0]);

const askDistricts = (locale: 'ru' | 'uk' = 'ru') => rt(locale, 'askDistricts', { max: '3' });

const roommateEvents = () =>
  mocks.track.mock.calls.filter(([, event]) => String(event).startsWith('tg_roommate_'));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.touchChat.mockResolvedValue(CHAT);
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.getCity.mockResolvedValue({ id: 'city-1', slug: 'warsaw', districts: DISTRICTS });
  db.roommateProfile.updateMany.mockResolvedValue({ count: 1 });
  db.roommateProfile.deleteMany.mockResolvedValue({ count: 1 });
  db.roommateProfile.create.mockImplementation(async ({ data }) => profile({ ...data }));
  entryState(null);
});

describe('openRoommate: what opens, in the order of spec 06', () => {
  it('1. a banned chat gets the FR-14 reply and nothing else', async () => {
    entryState(null, NOW);
    const { ctx, reply } = fakeCtx();
    await openRoommate(ctx, CHAT, 'ru', { source: 'tg' });

    expect(texts(reply)).toEqual([rt('ru', 'banned')]);
    expect(keyboard(reply)).toEqual([]);
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.hasOpenIntake).not.toHaveBeenCalled();
    expect(db.roommateProfile.create).not.toHaveBeenCalled();
    expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
  });

  it('1. a banned chat that still has its hidden profile can delete it', async () => {
    entryState(profile({ status: 'hidden', step: null, tgUsername: 'old' }), NOW);
    const { ctx, reply } = fakeCtx();
    await openRoommate(ctx, CHAT, 'uk', { source: 'bot_menu' });

    expect(texts(reply)).toEqual([rt('uk', 'banned')]);
    expect(keyboard(reply)).toEqual([
      [
        expect.objectContaining({
          text: rt('uk', 'btnDeleteMyProfile'),
          callback_data: 'rm:c:del',
        }),
      ],
    ]);
    expect(mocks.track).not.toHaveBeenCalled();
    expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
  });

  it.each(['active', 'expired'])(
    '2. an %s profile gets its own card, no start event',
    async (status) => {
      entryState(profile({ status, step: null, activatedAt: NOW, expiresAt: NOW }));
      const { ctx, reply } = fakeCtx();
      await openRoommate(ctx, CHAT, 'ru', { source: 'fb', detail: 'grp' });

      expect(texts(reply)).toHaveLength(1);
      expect(texts(reply)[0].startsWith(`${rt('ru', 'cardHeader')}\n\n`)).toBe(true);
      expect(callbackRows(keyboard(reply))).toContainEqual(['rm:c:edit', 'rm:c:del']);
      expect(mocks.track).not.toHaveBeenCalled();
      expect(db.roommateProfile.create).not.toHaveBeenCalled();
      expect(mocks.hasOpenIntake).not.toHaveBeenCalled();
    },
  );

  it('3. a hidden profile without a ban marker gets the FR-14 reply with delete', async () => {
    entryState(profile({ status: 'hidden', step: null }));
    const { ctx, reply } = fakeCtx();
    await openRoommate(ctx, CHAT, 'ru', { source: 'tg' });

    expect(texts(reply)).toEqual([rt('ru', 'banned')]);
    expect(callbackRows(keyboard(reply))).toEqual([['rm:c:del']]);
    expect(mocks.track).not.toHaveBeenCalled();
    expect(db.roommateProfile.create).not.toHaveBeenCalled();
  });

  it('4. a draft gets its current step again, with its picks, and no second start event', async () => {
    entryState(profile({ districtSlugs: ['mokotow'], entrySource: 'tg' }));
    const { ctx, reply } = fakeCtx();
    await openRoommate(ctx, CHAT, 'ru', { source: 'fb', detail: 'grp' });

    expect(texts(reply)).toEqual([askDistricts()]);
    expect(keyboard(reply)[0]).toEqual([
      { text: 'Bielany', callback_data: 'rm:d:bielany:1' },
      { text: rt('ru', 'btnPicked', { name: 'Mokotów' }), callback_data: 'rm:d:mokotow:0' },
    ]);
    expect(mocks.track).not.toHaveBeenCalled();
    expect(db.roommateProfile.create).not.toHaveBeenCalled();
    // The draft keeps its first entry_source: nothing but a username would be written.
    expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
  });

  it('4 before 5: a draft is resent even while a deposit intake is open', async () => {
    entryState(profile());
    mocks.hasOpenIntake.mockResolvedValue(true);
    const { ctx, reply } = fakeCtx();
    await openRoommate(ctx, CHAT, 'ru', { source: 'tg' });

    expect(texts(reply)).toEqual([askDistricts()]);
  });

  it('5. an open deposit intake keeps the roommate intake from starting', async () => {
    mocks.hasOpenIntake.mockResolvedValue(true);
    const { ctx, reply } = fakeCtx();
    await openRoommate(ctx, CHAT, 'ru', { source: 'bot_menu' });

    expect(mocks.hasOpenIntake).toHaveBeenCalledWith('chat-row');
    expect(texts(reply)).toEqual([rt('ru', 'depositQuestionsOpen')]);
    expect(rt('ru', 'depositQuestionsOpen')).toContain('/cancel');
    expect(db.roommateProfile.create).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('6. otherwise creates the draft, sends one start event, the intro and the districts step', async () => {
    const { ctx, reply } = fakeCtx();
    await openRoommate(ctx, CHAT, 'ru', { source: 'fb', detail: 'wawapolki2' });

    expect(db.roommateProfile.create).toHaveBeenCalledWith({
      data: {
        chatId: 'chat-row',
        status: 'draft',
        step: 'districts',
        entrySource: 'fb',
        tgUsername: 'anna_w',
      },
    });
    expect(mocks.track.mock.calls).toEqual([
      [CHAT_ID, 'tg_roommate_flow_started', { entry_source: 'fb', entry_detail: 'wawapolki2' }],
    ]);

    const privacyUrl = escapeHtml(webLink('/privacy#roommate-matching', 'ru', 'roommate'));
    expect(texts(reply)).toEqual([rt('ru', 'intro', { privacyUrl }), askDistricts()]);
    expect(reply.mock.calls[0][1]).toMatchObject({ parse_mode: 'HTML' });
    expect(reply.mock.calls[0][0]).toContain(`<a href="${privacyUrl}">`);
    expect(privacyUrl).toContain('/ru/privacy?');
    expect(privacyUrl).toContain('utm_campaign=roommate');
    expect(privacyUrl.endsWith('#roommate-matching')).toBe(true);

    // Districts by their Polish name, two per row, then "Any district" and "Done".
    expect(callbackRows(keyboard(reply, 1))).toEqual([
      ['rm:d:bielany:1', 'rm:d:mokotow:1'],
      ['rm:d:ochota:1', 'rm:d:srodmiescie:1'],
      ['rm:d:wola:1'],
      ['rm:d:any'],
      ['rm:d:done'],
    ]);
    expect(keyboard(reply, 1)[3][0].text).toBe(rt('ru', 'btnAnyDistrict'));
    expect(keyboard(reply, 1)[4][0].text).toBe(rt('ru', 'btnDone'));
  });

  it('6. leaves entry_detail out when the entry has none, and stores a missing username as null', async () => {
    const { ctx } = fakeCtx({ username: null });
    await openRoommate(ctx, CHAT, 'uk', { source: 'bot_menu' });

    expect(mocks.track.mock.calls).toEqual([
      [CHAT_ID, 'tg_roommate_flow_started', { entry_source: 'bot_menu' }],
    ]);
    expect(db.roommateProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tgUsername: null }),
    });
  });

  it('6. a double tap that loses the race sends the step once more and no second event', async () => {
    db.roommateProfile.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    db.roommateProfile.findUnique.mockResolvedValue(profile());
    const { ctx, reply } = fakeCtx();
    await openRoommate(ctx, CHAT, 'ru', { source: 'bot_menu' });

    expect(mocks.track).not.toHaveBeenCalled();
    expect(texts(reply)).toEqual([askDistricts()]);
  });

  it('skips a district whose callback data would exceed 64 bytes', async () => {
    mocks.getCity.mockResolvedValue({
      id: 'city-1',
      slug: 'warsaw',
      districts: [...DISTRICTS, { id: 'dx', slug: 'x'.repeat(60), nameKey: 'Long' }],
    });
    const { ctx, reply } = fakeCtx();
    await openRoommate(ctx, CHAT, 'ru', { source: 'bot_menu' });

    const data = callbackRows(keyboard(reply, 1)).flat();
    expect(data).not.toContain(`rm:d:${'x'.repeat(60)}:1`);
    expect(data.every((d) => Buffer.byteLength(String(d), 'utf8') <= 64)).toBe(true);
  });
});

describe('usernames (spec 07 §Usernames)', () => {
  it('stores a changed username on the profile', async () => {
    entryState(profile({ tgUsername: 'old_name' }));
    const { ctx } = fakeCtx({ username: 'new_name' });
    await openRoommate(ctx, CHAT, 'ru', { source: 'bot_menu' });

    expect(db.roommateProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: { tgUsername: 'new_name' },
    });
  });

  it('stores null when the person removed the username', async () => {
    entryState(profile({ status: 'active', step: null, tgUsername: 'old_name' }));
    const { ctx } = fakeCtx({ username: null });
    await openRoommate(ctx, CHAT, 'ru', { source: 'bot_menu' });

    expect(db.roommateProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: { tgUsername: null },
    });
  });

  it('writes nothing when the username is unchanged', async () => {
    entryState(profile({ tgUsername: 'anna_w' }));
    const { ctx } = fakeCtx({ username: 'anna_w' });
    await openRoommate(ctx, CHAT, 'ru', { source: 'bot_menu' });

    expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
  });

  it('never puts the username into an event', async () => {
    const { ctx } = fakeCtx({ username: 'anna_w' });
    await openRoommate(ctx, CHAT, 'ru', { source: 'tg' });

    expect(JSON.stringify(mocks.track.mock.calls)).not.toContain('anna_w');
  });
});

describe('the ways in: /mate and the start button (rm:start)', () => {
  it('/mate opens the flow from the bot menu', async () => {
    const { ctx, reply } = fakeCtx({ languageCode: 'uk' });
    await handleMate(ctx as CommandContext<Context>);

    expect(mocks.touchChat).toHaveBeenCalledWith({ chatId: CHAT_ID, locale: 'uk' });
    expect(roommateEvents()).toEqual([
      [CHAT_ID, 'tg_roommate_flow_started', { entry_source: 'bot_menu' }],
    ]);
    expect(texts(reply)[0]).toContain(webLink('/privacy', 'ru', 'roommate').split('?')[0]);
  });

  it('the start button opens the flow from the bot menu and answers the tap once', async () => {
    const { ctx, answerCallbackQuery } = fakeCtx();
    await handleRoommateStartTap(ctx as CallbackQueryContext<Context>);

    expect(mocks.touchChat).toHaveBeenCalledWith({ chatId: CHAT_ID });
    expect(roommateEvents()).toEqual([
      [CHAT_ID, 'tg_roommate_flow_started', { entry_source: 'bot_menu' }],
    ]);
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it('the start button of a banned chat sends no roommate event', async () => {
    entryState(null, NOW);
    const { ctx, reply, answerCallbackQuery } = fakeCtx();
    await handleRoommateStartTap(ctx as CallbackQueryContext<Context>);

    expect(texts(reply)).toEqual([rt('ru', 'banned')]);
    expect(mocks.track).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it('ignores "message is not modified" and still answers the tap', async () => {
    const { ctx, reply, answerCallbackQuery } = fakeCtx();
    reply.mockRejectedValue(
      new GrammyError(
        "Call to 'editMessageText' failed!",
        {
          ok: false,
          error_code: 400,
          description: 'Bad Request: message is not modified: specified new message content',
        },
        'editMessageText',
        {},
      ),
    );
    await expect(
      handleRoommateStartTap(ctx as CallbackQueryContext<Context>),
    ).resolves.toBeUndefined();
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it('rethrows any other error after answering the tap', async () => {
    const { ctx, reply, answerCallbackQuery } = fakeCtx();
    reply.mockRejectedValue(new Error('network down'));
    await expect(handleRoommateStartTap(ctx as CallbackQueryContext<Context>)).rejects.toThrow(
      'network down',
    );
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });
});

describe('handleRoommateText: typed text while a roommate step is open', () => {
  it('is none without a profile or without an open step', async () => {
    const { ctx, reply } = fakeCtx();
    expect(await handleRoommateText(ctx, 'chat-row', 'ru', 'Mokotów')).toBe('none');

    db.roommateProfile.findUnique.mockResolvedValue(profile({ status: 'active', step: null }));
    expect(await handleRoommateText(ctx, 'chat-row', 'ru', 'Mokotów')).toBe('none');

    db.roommateProfile.findUnique.mockResolvedValue(
      profile({ status: 'hidden', step: 'districts' }),
    );
    expect(await handleRoommateText(ctx, 'chat-row', 'ru', 'Mokotów')).toBe('none');
    expect(reply).not.toHaveBeenCalled();
  });

  it('at the districts step a typed district name is picked like a tap', async () => {
    db.roommateProfile.findUnique.mockResolvedValue(profile({ anyDistrict: true }));
    const { ctx, reply } = fakeCtx();

    expect(await handleRoommateText(ctx, 'chat-row', 'ru', 'Мокотув')).toBe('used');
    expect(db.roommateProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'profile-1', step: 'districts' },
      data: { districtSlugs: ['mokotow'], anyDistrict: false },
    });
    expect(texts(reply)).toEqual([askDistricts()]);
    const picked = keyboard(reply).flat();
    expect(picked).toContainEqual({
      text: rt('ru', 'btnPicked', { name: 'Mokotów' }),
      callback_data: 'rm:d:mokotow:0',
    });
    expect(picked).toContainEqual({ text: rt('ru', 'btnAnyDistrict'), callback_data: 'rm:d:any' });
  });

  it('a district typed again is unpicked', async () => {
    db.roommateProfile.findUnique.mockResolvedValue(
      profile({ districtSlugs: ['mokotow', 'wola'] }),
    );
    const { ctx } = fakeCtx();

    expect(await handleRoommateText(ctx, 'chat-row', 'ru', 'Mokotów')).toBe('used');
    expect(db.roommateProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'profile-1', step: 'districts' },
      data: { districtSlugs: ['wola'], anyDistrict: false },
    });
  });

  it('a 4th typed district is refused and changes nothing', async () => {
    db.roommateProfile.findUnique.mockResolvedValue(
      profile({ districtSlugs: ['mokotow', 'wola', 'ochota'] }),
    );
    const { ctx, reply } = fakeCtx();

    expect(await handleRoommateText(ctx, 'chat-row', 'ru', 'Bielany')).toBe('used');
    expect(texts(reply)).toEqual([rt('ru', 'districtLimit', { max: '3' })]);
    expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
  });

  it('a step that moved on meanwhile says so and sends the current step', async () => {
    db.roommateProfile.findUnique
      .mockResolvedValueOnce(profile())
      .mockResolvedValueOnce(profile({ step: 'districts', districtSlugs: ['wola'] }));
    db.roommateProfile.updateMany.mockResolvedValue({ count: 0 });
    const { ctx, reply } = fakeCtx();

    expect(await handleRoommateText(ctx, 'chat-row', 'ru', 'Mokotów')).toBe('used');
    expect(texts(reply)).toEqual([rt('ru', 'stepDone'), askDistricts()]);
  });

  it('text the districts step cannot use (an address) passes on, the step stays open', async () => {
    db.roommateProfile.findUnique.mockResolvedValue(profile());
    const { ctx, reply } = fakeCtx();

    expect(await handleRoommateText(ctx, 'chat-row', 'ru', 'Puławska 10')).toBe('passed');
    expect(reply).not.toHaveBeenCalled();
    expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
    expect(db.roommateProfile.deleteMany).not.toHaveBeenCalled();
  });

  it.each([
    ['a button-only intake step', profile({ step: 'month' })],
    ['an edit step', profile({ status: 'active', step: 'edit_month' })],
  ])('text at %s passes on', async (_label, row) => {
    db.roommateProfile.findUnique.mockResolvedValue(row);
    const { ctx, reply } = fakeCtx();

    expect(await handleRoommateText(ctx, 'chat-row', 'ru', 'Mokotów')).toBe('passed');
    expect(reply).not.toHaveBeenCalled();
  });

  it('stores a changed username on the way', async () => {
    db.roommateProfile.findUnique.mockResolvedValue(profile({ step: 'month', tgUsername: null }));
    const { ctx } = fakeCtx({ username: 'anna_w' });
    await handleRoommateText(ctx, 'chat-row', 'ru', 'hello');

    expect(db.roommateProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: { tgUsername: 'anna_w' },
    });
  });
});

describe('cancelRoommate (/cancel)', () => {
  it('deletes a draft at once', async () => {
    db.roommateProfile.findUnique.mockResolvedValue(profile({ step: 'budget' }));
    const { ctx, reply } = fakeCtx();

    expect(await cancelRoommate(ctx, 'chat-row', 'ru')).toBe(true);
    expect(db.roommateProfile.deleteMany).toHaveBeenCalledWith({
      where: { id: 'profile-1', status: 'draft' },
    });
    expect(texts(reply)).toEqual([rt('ru', 'cancelledDraft')]);
  });

  it('clears an edit step and keeps the saved profile', async () => {
    db.roommateProfile.findUnique.mockResolvedValue(
      profile({ status: 'active', step: 'edit_budget' }),
    );
    const { ctx, reply } = fakeCtx();

    expect(await cancelRoommate(ctx, 'chat-row', 'uk')).toBe(true);
    expect(db.roommateProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'profile-1', step: 'edit_budget', status: { in: ['active', 'expired'] } },
      data: { step: null },
    });
    expect(db.roommateProfile.deleteMany).not.toHaveBeenCalled();
    expect(texts(reply)).toEqual([rt('uk', 'cancelledEdit')]);
  });

  it.each([
    ['no profile', null],
    ['a saved profile without an open step', profile({ status: 'active', step: null })],
    ['a hidden profile', profile({ status: 'hidden', step: null })],
  ])('leaves /cancel to the deposit flow with %s', async (_label, row) => {
    db.roommateProfile.findUnique.mockResolvedValue(row);
    const { ctx, reply } = fakeCtx();

    expect(await cancelRoommate(ctx, 'chat-row', 'ru')).toBe(false);
    expect(reply).not.toHaveBeenCalled();
    expect(db.roommateProfile.deleteMany).not.toHaveBeenCalled();
    expect(db.roommateProfile.updateMany).not.toHaveBeenCalled();
  });

  it('says nothing when the draft was already gone', async () => {
    db.roommateProfile.findUnique.mockResolvedValue(profile());
    db.roommateProfile.deleteMany.mockResolvedValue({ count: 0 });
    const { ctx, reply } = fakeCtx();

    expect(await cancelRoommate(ctx, 'chat-row', 'ru')).toBe(false);
    expect(reply).not.toHaveBeenCalled();
  });
});
