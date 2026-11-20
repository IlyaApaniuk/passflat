import type { RoommateProfile } from '@prisma/client';
import { GrammyError, type Bot, type Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Delete at once with an optional reason (FR-13; spec 06 §Delete): `rm:c:del` asks with the PRD 3
 * §8 wording, `rm:c:delok` deletes the profile and (through the foreign keys) its reactions in the
 * same request while reports keep their rows with the reference nulled, one
 * `tg_roommate_profile_deleted` with `reason=user`, the optional reasons (`rm:dr:*`, "Found
 * someone here" only after a match) that work after the row is gone, the FR-14 reply's delete of
 * a hidden profile, and a new profile at once unless banned. Taps go through the handlers
 * `registerRoommateFlow` registers, over an in-memory Prisma fake. Nothing reaches Telegram or a
 * database.
 */

type Reaction = {
  id: string;
  fromProfileId: string;
  toProfileId: string;
  kind: string;
  matchedAt: Date | null;
};
type Report = {
  id: string;
  reporterProfileId: string | null;
  targetProfileId: string | null;
  reason: string;
  decision: string;
};

const db = vi.hoisted(() => {
  const rows: RoommateProfile[] = [];
  const reactions: Reaction[] = [];
  const reports: Report[] = [];
  const chat = { roommateBannedAt: null as Date | null };
  const matches = (row: object, where: Record<string, unknown>) =>
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
    reactions,
    reports,
    chat,
    telegramChat: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = byChat(where.id);
        return {
          roommateBannedAt: chat.roommateBannedAt,
          roommateProfile: row ? structuredClone(row) : null,
        };
      }),
    },
    roommateProfile: {
      findUnique: vi.fn(async ({ where }: { where: { chatId: string } }) => {
        const row = byChat(where.chatId);
        return row ? structuredClone(row) : null;
      }),
      create: vi.fn(async ({ data }: { data: Partial<RoommateProfile> }) => {
        const row = draftRow(data);
        rows.push(row);
        return structuredClone(row);
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
          const hits = rows.filter((row) => matches(row, where));
          for (const row of hits) Object.assign(row, structuredClone(data));
          return { count: hits.length };
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const hits = rows.filter((row) => matches(row, where));
        for (const hit of hits) {
          rows.splice(rows.indexOf(hit), 1);
          // The migration's foreign keys (proven in `migration.test.ts`): reactions cascade,
          // report references are set to null.
          for (const reaction of [...reactions]) {
            if (reaction.fromProfileId === hit.id || reaction.toProfileId === hit.id) {
              reactions.splice(reactions.indexOf(reaction), 1);
            }
          }
          for (const report of reports) {
            if (report.reporterProfileId === hit.id) report.reporterProfileId = null;
            if (report.targetProfileId === hit.id) report.targetProfileId = null;
          }
        }
        return { count: hits.length };
      }),
    },
    roommateReaction: {
      count: vi.fn(
        async ({ where }: { where: { matchedAt: { not: null }; OR: Record<string, string>[] } }) =>
          reactions.filter(
            (reaction) =>
              reaction.matchedAt !== null &&
              where.OR.some((condition) => matches(reaction, condition)),
          ).length,
      ),
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

import { DELETE_REASON, registerRoommateFlow } from './roommate-flow';
import { rt } from './roommate-texts';

const CHAT_ID = 4242;
const CHAT = { id: 'chat-row', locale: 'ru', isNew: false };
const NOW = new Date('2026-12-05T10:00:00Z');
const EXPIRES = new Date('2027-01-04T10:00:00.000Z');
const PROFILE_ID = 'profile-1';
const OTHER_ID = 'profile-9';

/** The PRD 3 §8 "Delete" drafts, verbatim. */
const PRD_DELETE_WORDING = {
  ru: 'Удалить анкету? Это сразу и навсегда. Если вы уже обменялись контактами, сообщение у другого человека останется.',
  uk: 'Видалити анкету? Це одразу й назавжди. Якщо ви вже обмінялися контактами, повідомлення в іншої людини залишиться.',
  en: "Delete your profile? It's immediate and final. If you already swapped contacts, the other person keeps that message.",
} as const;

/** A saved (active) profile with every field answered. */
function saved(fields: Partial<RoommateProfile> = {}): RoommateProfile {
  return {
    id: PROFILE_ID,
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

/** The row `createDraft` writes, with the column defaults. */
function draftRow(data: Partial<RoommateProfile>): RoommateProfile {
  return saved({
    id: 'profile-2',
    districtSlugs: [],
    budgetBand: null,
    moveInMonth: null,
    languages: [],
    gender: null,
    about: null,
    smoking: null,
    adultConfirmedAt: null,
    activatedAt: null,
    expiresAt: null,
    ...data,
  });
}

function seed(fields: Partial<RoommateProfile> = {}): void {
  db.rows.length = 0;
  db.rows.push(saved(fields));
}

function reaction(fields: Partial<Reaction>): Reaction {
  return {
    id: `r-${db.reactions.length + 1}`,
    fromProfileId: PROFILE_ID,
    toProfileId: OTHER_ID,
    kind: 'interest',
    matchedAt: null,
    ...fields,
  };
}

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

/**
 * One bot message with buttons, as Telegram keeps it: removing its buttons works once; a second
 * removal is refused with "message is not modified".
 */
function messageWithButtons() {
  let hasButtons = true;
  return vi.fn(async () => {
    if (!hasButtons) throw notModified();
    hasButtons = false;
    return true;
  });
}

function fakeCtx(editMessageReplyMarkup = vi.fn().mockResolvedValue(true)) {
  const reply = vi.fn().mockResolvedValue({});
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const ctx = {
    chat: { id: CHAT_ID },
    from: { id: CHAT_ID, username: 'anna_w' },
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

function replyKeyboard(reply: ReturnType<typeof vi.fn>, index = 0): Button[][] {
  const markup = reply.mock.calls[index][1]?.reply_markup as Markup | undefined;
  return markup?.inline_keyboard ?? [];
}

const labels = (rows: Button[][]) => rows.map((r) => r.map((b) => b.text));
const data = (rows: Button[][]) => rows.map((r) => r.map((b) => b.callback_data));

const DELETED_EVENT = [CHAT_ID, 'tg_roommate_profile_deleted', { reason: 'user' }];
const OUTCOME_EVENT = [
  CHAT_ID,
  'tg_roommate_outcome',
  { outcome: 'renting_together', asked: 'delete' },
];
const deletedReply = (locale: 'ru' | 'uk' = 'ru') =>
  `${rt(locale, 'deleted')}\n\n${rt(locale, 'deleteReasonPrompt')}`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubEnv('ROOMMATE_MATCHING_ENABLED', '');
  db.rows.length = 0;
  db.reactions.length = 0;
  db.reports.length = 0;
  db.chat.roommateBannedAt = null;
  mocks.touchChat.mockResolvedValue(CHAT);
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.getCity.mockResolvedValue({
    id: 'city-1',
    slug: 'warsaw',
    districts: [{ id: 'd2', slug: 'mokotow', nameKey: 'Mokotów' }],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('callback data of the delete', () => {
  it.each<[string, string | RegExp]>([
    ['rm:c:del', 'rm:c:del'],
    ['rm:c:delok', 'rm:c:delok'],
    ['rm:c:keep', 'rm:c:keep'],
    ['rm:dr:here', DELETE_REASON],
    ['rm:dr:elsewhere', DELETE_REASON],
    ['rm:dr:other', DELETE_REASON],
  ])('%s is routed to exactly one handler', (callbackData, trigger) => {
    const routes = routesFor(callbackData);
    expect(routes).toHaveLength(1);
    expect(routes[0][0]).toBe(trigger);
  });

  it('keeps every button of the confirmation and the reasons within 64 bytes and routed', async () => {
    seed();
    db.reactions.push(reaction({ matchedAt: NOW }));
    const confirm = await tap('rm:c:del');
    const done = await tap('rm:c:delok');

    const buttons = [...replyKeyboard(confirm.reply).flat(), ...replyKeyboard(done.reply).flat()];
    expect(buttons).toHaveLength(2 + 3);
    for (const button of buttons) {
      expect(Buffer.byteLength(button.callback_data!, 'utf8')).toBeLessThanOrEqual(64);
      expect(routesFor(button.callback_data!)).toHaveLength(1);
    }
  });
});

describe('the confirmation (rm:c:del)', () => {
  it('asks with the PRD 3 §8 wording, "Yes, delete" and "Keep", and deletes nothing', async () => {
    seed();
    const { reply, answerCallbackQuery } = await tap('rm:c:del');

    expect(texts(reply)).toEqual([PRD_DELETE_WORDING.ru]);
    expect(labels(replyKeyboard(reply))).toEqual([['Да, удалить', 'Оставить']]);
    expect(data(replyKeyboard(reply))).toEqual([['rm:c:delok', 'rm:c:keep']]);
    expect(db.rows).toHaveLength(1);
    expect(db.roommateProfile.deleteMany).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it.each(['uk', 'en'] as const)('uses the PRD 3 §8 wording in %s', async (locale) => {
    seed();
    mocks.touchChat.mockResolvedValue({ ...CHAT, locale });
    const { reply } = await tap('rm:c:del');

    expect(texts(reply)).toEqual([PRD_DELETE_WORDING[locale]]);
    expect(labels(replyKeyboard(reply))).toEqual([
      [rt(locale, 'btnDeleteConfirm'), rt(locale, 'btnKeep')],
    ]);
  });

  it('replies "already deleted" when the chat has no profile', async () => {
    const { reply } = await tap('rm:c:del');
    expect(texts(reply)).toEqual([rt('ru', 'alreadyDeleted')]);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('treats an old card of a profile started again as a stale tap and keeps the draft', async () => {
    seed({ status: 'draft', step: 'budget', activatedAt: null, expiresAt: null });
    const { reply } = await tap('rm:c:del');

    expect(texts(reply)).toEqual([rt('ru', 'stepDone'), rt('ru', 'askBudget')]);
    expect(db.rows).toHaveLength(1);
    expect(db.roommateProfile.deleteMany).not.toHaveBeenCalled();
  });

  it('"Keep" leaves the profile as it was, removes the confirmation buttons and sends nothing', async () => {
    seed();
    const before = structuredClone(db.rows[0]);
    const { reply, editMessageReplyMarkup } = await tap('rm:c:keep');

    expect(texts(reply)).toEqual([rt('ru', 'kept')]);
    expect(editMessageReplyMarkup).toHaveBeenCalledWith();
    expect(db.rows).toEqual([before]);
    expect(mocks.track).not.toHaveBeenCalled();
  });
});

describe('a confirmed delete (rm:c:delok)', () => {
  it('deletes the profile and its reactions at once, keeps reports with the reference nulled, and sends one event', async () => {
    seed();
    db.reactions.push(
      reaction({ id: 'mine-out', fromProfileId: PROFILE_ID, toProfileId: OTHER_ID }),
      reaction({ id: 'mine-in', fromProfileId: OTHER_ID, toProfileId: PROFILE_ID, kind: 'skip' }),
      reaction({ id: 'others', fromProfileId: OTHER_ID, toProfileId: 'profile-8' }),
    );
    db.reports.push(
      {
        id: 'on-me',
        reporterProfileId: OTHER_ID,
        targetProfileId: PROFILE_ID,
        reason: 'spam',
        decision: 'none',
      },
      {
        id: 'by-me',
        reporterProfileId: PROFILE_ID,
        targetProfileId: OTHER_ID,
        reason: 'fake',
        decision: 'hidden',
      },
    );
    const { reply, editMessageReplyMarkup, answerCallbackQuery } = await tap('rm:c:delok');

    expect(db.rows).toEqual([]);
    expect(db.reactions.map((r) => r.id)).toEqual(['others']);
    expect(db.reports).toEqual([
      {
        id: 'on-me',
        reporterProfileId: OTHER_ID,
        targetProfileId: null,
        reason: 'spam',
        decision: 'none',
      },
      {
        id: 'by-me',
        reporterProfileId: null,
        targetProfileId: OTHER_ID,
        reason: 'fake',
        decision: 'hidden',
      },
    ]);
    expect(db.roommateProfile.deleteMany).toHaveBeenCalledWith({
      where: { id: PROFILE_ID, status: { in: ['active', 'expired', 'hidden'] } },
    });
    expect(mocks.track.mock.calls).toEqual([DELETED_EVENT]);
    expect(texts(reply)).toEqual([deletedReply()]);
    expect(editMessageReplyMarkup).toHaveBeenCalledWith();
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it('reads the match before the delete and, without one, offers only the other two reasons', async () => {
    seed();
    db.reactions.push(reaction({ kind: 'interest', matchedAt: null }));
    const { reply } = await tap('rm:c:delok');

    expect(db.roommateReaction.count).toHaveBeenCalledWith({
      where: {
        matchedAt: { not: null },
        OR: [{ fromProfileId: PROFILE_ID }, { toProfileId: PROFILE_ID }],
      },
    });
    expect(db.roommateReaction.count.mock.invocationCallOrder[0]).toBeLessThan(
      db.roommateProfile.deleteMany.mock.invocationCallOrder[0],
    );
    expect(labels(replyKeyboard(reply))).toEqual([['Нашёлся сосед в другом месте'], ['Другое']]);
    expect(data(replyKeyboard(reply))).toEqual([['rm:dr:elsewhere'], ['rm:dr:other']]);
  });

  it.each([
    ['a reaction it sent', { fromProfileId: PROFILE_ID, toProfileId: OTHER_ID }],
    ['a reaction it received', { fromProfileId: OTHER_ID, toProfileId: PROFILE_ID }],
  ])('offers "Found someone here" first after a match on %s', async (_name, pair) => {
    seed();
    db.reactions.push(reaction({ ...pair, matchedAt: NOW }));
    const { reply } = await tap('rm:c:delok');

    expect(db.reactions).toEqual([]);
    expect(labels(replyKeyboard(reply))).toEqual([
      ['Нашёлся сосед здесь'],
      ['Нашёлся сосед в другом месте'],
      ['Другое'],
    ]);
    expect(data(replyKeyboard(reply))).toEqual([
      ['rm:dr:here'],
      ['rm:dr:elsewhere'],
      ['rm:dr:other'],
    ]);
  });

  it('does not count a match of two other profiles', async () => {
    seed();
    db.reactions.push(
      reaction({ fromProfileId: OTHER_ID, toProfileId: 'profile-8', matchedAt: NOW }),
    );
    const { reply } = await tap('rm:c:delok');
    expect(data(replyKeyboard(reply))).toEqual([['rm:dr:elsewhere'], ['rm:dr:other']]);
  });

  it.each([
    ['an expired profile', { status: 'expired', expiredAt: EXPIRES }],
    ['a profile with an open edit step', { step: 'edit_about' }],
  ])('deletes %s too', async (_name, fields) => {
    seed(fields);
    const { reply } = await tap('rm:c:delok');

    expect(db.rows).toEqual([]);
    expect(mocks.track.mock.calls).toEqual([DELETED_EVENT]);
    expect(texts(reply)).toEqual([deletedReply()]);
  });

  it('replies in UK', async () => {
    seed();
    mocks.touchChat.mockResolvedValue({ ...CHAT, locale: 'uk' });
    const { reply } = await tap('rm:c:delok');

    expect(texts(reply)).toEqual([deletedReply('uk')]);
    expect(labels(replyKeyboard(reply))).toEqual([
      [rt('uk', 'reasonFoundElsewhere')],
      [rt('uk', 'reasonOther')],
    ]);
  });

  it('answers a second confirm tap with "already deleted" and sends nothing', async () => {
    seed();
    await tap('rm:c:delok');
    mocks.track.mockClear();
    db.roommateProfile.deleteMany.mockClear();

    const second = await tap('rm:c:delok');
    expect(texts(second.reply)).toEqual([rt('ru', 'alreadyDeleted')]);
    expect(second.editMessageReplyMarkup).not.toHaveBeenCalled();
    expect(db.roommateProfile.deleteMany).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(second.answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it('gives two overlapping confirms one delete, one event and one reasons reply', async () => {
    seed();
    const [first, second] = await Promise.all([tap('rm:c:delok'), tap('rm:c:delok')]);

    expect(db.rows).toEqual([]);
    expect(mocks.track.mock.calls).toEqual([DELETED_EVENT]);
    expect([...texts(first.reply), ...texts(second.reply)].sort()).toEqual(
      [deletedReply(), rt('ru', 'alreadyDeleted')].sort(),
    );
  });

  it('puts no personal value into the event', async () => {
    seed();
    await tap('rm:c:delok');
    const [, , properties] = mocks.track.mock.calls[0];
    expect(Object.keys(properties)).toEqual(['reason']);
  });
});

describe('the optional reason (rm:dr:*)', () => {
  it('"Found someone here" sends one tg_roommate_outcome after the row is gone and removes the buttons', async () => {
    expect(db.rows).toEqual([]);
    const { reply, editMessageReplyMarkup } = await tap('rm:dr:here');

    expect(mocks.track.mock.calls).toEqual([OUTCOME_EVENT]);
    expect(texts(reply)).toEqual([rt('ru', 'reasonThanks')]);
    expect(editMessageReplyMarkup).toHaveBeenCalledWith();
    expect(editMessageReplyMarkup.mock.invocationCallOrder[0]).toBeLessThan(
      reply.mock.invocationCallOrder[0],
    );
  });

  it.each(['elsewhere', 'other'])('"%s" thanks and sends no event', async (reason) => {
    const { reply, editMessageReplyMarkup } = await tap(`rm:dr:${reason}`);

    expect(mocks.track).not.toHaveBeenCalled();
    expect(texts(reply)).toEqual([rt('ru', 'reasonThanks')]);
    expect(editMessageReplyMarkup).toHaveBeenCalledWith();
  });

  it.each(['here', 'elsewhere', 'other'])(
    'a second tap on "%s" of the same message sends nothing',
    async (reason) => {
      const message = messageWithButtons();
      await tap(`rm:dr:${reason}`, fakeCtx(message));
      mocks.track.mockClear();

      const second = await tap(`rm:dr:${reason}`, fakeCtx(message));
      expect(second.reply).not.toHaveBeenCalled();
      expect(mocks.track).not.toHaveBeenCalled();
      expect(second.answerCallbackQuery).toHaveBeenCalledTimes(1);
    },
  );

  it('ignores a reason it never offers', async () => {
    const { reply, editMessageReplyMarkup } = await tap('rm:dr:moved');
    expect(reply).not.toHaveBeenCalled();
    expect(editMessageReplyMarkup).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('thanks in UK', async () => {
    mocks.touchChat.mockResolvedValue({ ...CHAT, locale: 'uk' });
    const { reply } = await tap('rm:dr:other');
    expect(texts(reply)).toEqual([rt('uk', 'reasonThanks')]);
  });

  it('runs the whole delete with a match: one deleted event, then one outcome', async () => {
    seed();
    db.reactions.push(reaction({ matchedAt: NOW }));
    await tap('rm:c:del');
    const done = await tap('rm:c:delok');
    const reasonButtons = data(replyKeyboard(done.reply)).flat();
    expect(reasonButtons[0]).toBe('rm:dr:here');

    const message = messageWithButtons();
    await tap(reasonButtons[0]!, fakeCtx(message));
    await tap(reasonButtons[0]!, fakeCtx(message));

    expect(mocks.track.mock.calls).toEqual([DELETED_EVENT, OUTCOME_EVENT]);
  });
});

describe('a hidden profile and a new profile after the delete', () => {
  it('the FR-14 reply\'s "Delete my profile" deletes a hidden profile; the ban marker and the reports stay', async () => {
    const bannedAt = new Date('2026-12-01T09:00:00Z');
    db.chat.roommateBannedAt = bannedAt;
    seed({ status: 'hidden', hiddenAt: bannedAt, hiddenReason: 'reports' });
    db.reports.push({
      id: 'on-me',
      reporterProfileId: OTHER_ID,
      targetProfileId: PROFILE_ID,
      reason: 'scam',
      decision: 'hidden',
    });

    const entry = await tap('rm:start');
    expect(texts(entry.reply)).toEqual([rt('ru', 'banned')]);
    expect(data(replyKeyboard(entry.reply))).toEqual([['rm:c:del']]);

    const confirm = await tap(replyKeyboard(entry.reply)[0][0].callback_data!);
    expect(texts(confirm.reply)).toEqual([PRD_DELETE_WORDING.ru]);

    const done = await tap('rm:c:delok');
    expect(texts(done.reply)).toEqual([deletedReply()]);
    expect(db.rows).toEqual([]);
    expect(db.chat.roommateBannedAt).toBe(bannedAt);
    expect(db.reports).toEqual([
      {
        id: 'on-me',
        reporterProfileId: OTHER_ID,
        targetProfileId: null,
        reason: 'scam',
        decision: 'hidden',
      },
    ]);
    expect(mocks.track.mock.calls).toEqual([DELETED_EVENT]);

    // Banned: no new profile, and the FR-14 reply now has no delete button.
    const again = await tap('rm:start');
    expect(texts(again.reply)).toEqual([rt('ru', 'banned')]);
    expect(again.reply.mock.calls[0][1]).toBeUndefined();
    expect(db.roommateProfile.create).not.toHaveBeenCalled();
    expect(mocks.track.mock.calls).toEqual([DELETED_EVENT]);
  });

  it('deletes a hidden profile without a ban marker too', async () => {
    seed({ status: 'hidden' });
    await tap('rm:c:delok');
    expect(db.rows).toEqual([]);
    expect(mocks.track.mock.calls).toEqual([DELETED_EVENT]);
  });

  it('lets a chat that is not banned start a new profile at once', async () => {
    seed();
    await tap('rm:c:delok');
    const entry = await tap('rm:start');

    expect(db.roommateProfile.create).toHaveBeenCalledTimes(1);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ status: 'draft', step: 'districts' });
    expect(mocks.track.mock.calls).toEqual([
      DELETED_EVENT,
      [CHAT_ID, 'tg_roommate_flow_started', { entry_source: 'bot_menu' }],
    ]);
    expect(texts(entry.reply)[1]).toBe(rt('ru', 'askDistricts', { max: '3' }));
  });

  it('an old confirmation after the new draft is a stale tap and keeps the draft', async () => {
    seed();
    await tap('rm:c:delok');
    await tap('rm:start');
    const stale = await tap('rm:c:delok');

    expect(texts(stale.reply)[0]).toBe(rt('ru', 'stepDone'));
    expect(db.rows).toHaveLength(1);
    expect(mocks.track).toHaveBeenCalledTimes(2);
  });
});
