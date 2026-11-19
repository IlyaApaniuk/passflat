import type { RoommateProfile } from '@prisma/client';
import type { Bot } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/appeal` (PRD 3 FR-35, spec 07 §Appeals and the owner's review, D65): the four cases. A hidden
 * profile with `appealed_at` null → `appealed_at` and the acknowledgement; a second `/appeal` →
 * "already received", nothing changes; a banned chat without a hidden profile → the e-mail address;
 * any other chat → "nothing to appeal". Not in `COMMAND_MENU`; no event; the switch is not read.
 *
 * The command runs through what `registerRoommateSafety` registers, over an in-memory Prisma fake
 * of the chat's entry (`loadRoommateEntry`) and the profile's conditional updates. A real hide
 * followed by `/appeal`, an owner's unhide and a re-hide are in `roommate-hide.test.ts`.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = { profiles: [] as Row[], chats: [] as Row[] };
  const matches = (row: Row, where: Where) =>
    Object.entries(where).every(([key, cond]) =>
      cond === null ? (row[key] ?? null) === null : row[key] === cond,
    );
  const prisma = {
    telegramChat: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const chat = state.chats.find((row) => row.id === where.id);
        if (!chat) return null;
        const profile = state.profiles.find((row) => row.chatId === where.id);
        return {
          roommateBannedAt: chat.roommateBannedAt ?? null,
          roommateProfile: profile ? structuredClone(profile) : null,
        };
      }),
    },
    roommateProfile: {
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
        const hits = state.profiles.filter((row) => matches(row, where));
        for (const row of hits) Object.assign(row, structuredClone(data));
        return { count: hits.length };
      }),
    },
  };
  return { state, prisma };
});
const mocks = vi.hoisted(() => ({ touchChat: vi.fn(), track: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }));
vi.mock('./store', () => ({ touchChat: mocks.touchChat }));
vi.mock('./analytics', () => ({ track: mocks.track }));

import { recordAppeal } from '@/lib/roommate/store';

import { handleAppeal, registerRoommateSafety } from './roommate-safety';
import { ROOMMATE_TEXT_KEYS, rt, type RoommateLocale } from './roommate-texts';
import { COMMAND_MENU, type BotLocale } from './texts';

const NOW = new Date('2026-12-05T09:00:00Z');
const HIDDEN_AT = new Date('2026-12-01T09:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const LOCALES: RoommateLocale[] = ['ru', 'uk', 'en'];
const APPEAL_KEYS = ['appealReceived', 'appealAlready', 'appealByEmail', 'appealNothing'] as const;
const PROFILE_ID = '00000000-0000-4000-8000-000000000010';
const CHAT = 'chat-x';
const TG_CHAT = 7010;

/** The chat's profile, hidden by reports four days ago unless `fields` say otherwise. */
function profile(fields: Partial<RoommateProfile> = {}): Row {
  return {
    id: PROFILE_ID,
    chatId: CHAT,
    status: 'hidden',
    step: null,
    tgUsername: 'user_x',
    expiresAt: new Date(NOW.getTime() + 20 * DAY),
    expiredAt: null,
    hiddenAt: HIDDEN_AT,
    hiddenReason: 'reports',
    statementSentAt: HIDDEN_AT,
    appealedAt: null,
    ...fields,
  };
}

/** One chat, banned when `banned`, with `rows` as its profile (none, or one). */
function seed(rows: Row[], { banned = true, locale = 'ru' as string } = {}) {
  db.state.profiles = rows;
  db.state.chats = [{ id: CHAT, locale, roommateBannedAt: banned ? HIDDEN_AT : null }];
}

const row = () => db.state.profiles[0];
const snapshot = () => structuredClone(db.state);

/** `/appeal` from the chat, its stored language `locale`; returns the reply texts. */
async function appeal({
  locale = 'ru',
  username = 'user_x' as string | null,
}: { locale?: string; username?: string | null } = {}) {
  mocks.touchChat.mockResolvedValue({ id: CHAT, locale, isNew: false });
  const reply = vi.fn().mockResolvedValue({});
  const ctx = {
    chat: { id: TG_CHAT, type: 'private' },
    from: username ? { id: TG_CHAT, username } : { id: TG_CHAT },
    message: { text: '/appeal' },
    reply,
  };
  await handleAppeal(ctx as unknown as Parameters<typeof handleAppeal>[0]);
  return reply.mock.calls.map(([text]) => text as string);
}

/** The writes of `appealed_at` (not the username's). */
const appealWrites = () =>
  db.prisma.roommateProfile.updateMany.mock.calls.filter(([args]) => 'appealedAt' in args.data);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
  seed([profile()]);
});

describe('/appeal: a hidden profile not appealed yet', () => {
  it.each(LOCALES)(
    '%s: sets appealed_at with one conditional update and acknowledges',
    async (locale) => {
      seed([profile()], { locale });

      expect(await appeal({ locale })).toEqual([rt(locale, 'appealReceived')]);
      expect(row()).toMatchObject({ status: 'hidden', appealedAt: NOW, hiddenAt: HIDDEN_AT });
      expect(appealWrites()).toEqual([
        [
          {
            where: { id: PROFILE_ID, status: 'hidden', appealedAt: null },
            data: { appealedAt: NOW },
          },
        ],
      ]);
    },
  );

  it('the acknowledgement names contact@passflat.com and promises no time, in every locale', () => {
    for (const locale of LOCALES) {
      const text = rt(locale, 'appealReceived');
      expect(text, locale).toContain('contact@passflat.com');
      expect(text, locale).not.toMatch(/\d/);
      expect(text, locale).not.toMatch(
        /сегодня|завтра|скоро|сутк|недел|часов|сьогодні|незабаром|тижн|годин|today|tomorrow|soon|hour|day|week/i,
      );
    }
  });

  it('a hidden, expired profile and a hidden profile in a chat without a ban are appealed too', async () => {
    seed([profile({ expiredAt: HIDDEN_AT })], { banned: true });
    expect(await appeal()).toEqual([rt('ru', 'appealReceived')]);

    seed([profile()], { banned: false });
    expect(await appeal()).toEqual([rt('ru', 'appealReceived')]);
    expect(row()!.appealedAt).toEqual(NOW);
  });

  it('stores a changed username like every roommate handler, and sends no event', async () => {
    expect(await appeal({ username: 'new_name' })).toEqual([rt('ru', 'appealReceived')]);
    expect(row()!.tgUsername).toBe('new_name');
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('works the same with the switch off', async () => {
    for (const value of ['', 'false', 'TRUE']) {
      vi.stubEnv('ROOMMATE_MATCHING_ENABLED', value);
      seed([profile()]);
      expect(await appeal(), value).toEqual([rt('ru', 'appealReceived')]);
      expect(row()!.appealedAt, value).toEqual(NOW);
    }
  });
});

describe('/appeal: a second /appeal', () => {
  it.each(LOCALES)('%s: "already received", nothing changes', async (locale) => {
    const EARLIER = new Date(NOW.getTime() - DAY);
    seed([profile({ appealedAt: EARLIER })], { locale });
    const before = snapshot();

    expect(await appeal({ locale })).toEqual([rt(locale, 'appealAlready')]);
    expect(snapshot()).toEqual(before);
    expect(appealWrites()).toEqual([]);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('right after the first: the first appeal time stays', async () => {
    expect(await appeal()).toEqual([rt('ru', 'appealReceived')]);
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));

    expect(await appeal()).toEqual([rt('ru', 'appealAlready')]);
    expect(row()!.appealedAt).toEqual(NOW);
    expect(appealWrites()).toHaveLength(1);
  });

  it('two at once: one is recorded, the other is "already received"', async () => {
    const replies = await Promise.all([appeal(), appeal()]);

    expect(replies.flat().sort()).toEqual(
      [rt('ru', 'appealAlready'), rt('ru', 'appealReceived')].sort(),
    );
    expect(row()!.appealedAt).toEqual(NOW);
  });

  it('recordAppeal changes only a hidden profile not appealed yet', async () => {
    expect(await recordAppeal(PROFILE_ID, NOW)).toBe(true);
    expect(await recordAppeal(PROFILE_ID, new Date(NOW.getTime() + DAY))).toBe(false);
    expect(row()!.appealedAt).toEqual(NOW);

    seed([profile({ status: 'active', hiddenAt: null, hiddenReason: null })]);
    expect(await recordAppeal(PROFILE_ID, NOW)).toBe(false);
    expect(row()!.appealedAt).toBeNull();
  });
});

describe('/appeal: a banned chat whose profile is already deleted', () => {
  it.each(LOCALES)('%s: the e-mail address, nothing written', async (locale) => {
    seed([], { banned: true, locale });
    const before = snapshot();

    const replies = await appeal({ locale });
    expect(replies).toEqual([rt(locale, 'appealByEmail')]);
    expect(replies[0]).toContain('contact@passflat.com');
    expect(snapshot()).toEqual(before);
    expect(db.prisma.roommateProfile.updateMany).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('a banned chat whose profile the owner unhid but kept the ban: the e-mail address too', async () => {
    for (const status of ['active', 'expired']) {
      seed([profile({ status, hiddenAt: null, hiddenReason: null, appealedAt: NOW })]);
      expect(await appeal(), status).toEqual([rt('ru', 'appealByEmail')]);
      expect(appealWrites(), status).toEqual([]);
    }
  });
});

describe('/appeal: any other chat', () => {
  it.each(LOCALES)(
    '%s: a chat without a profile or a ban → "nothing to appeal"',
    async (locale) => {
      seed([], { banned: false, locale });
      const before = snapshot();

      expect(await appeal({ locale })).toEqual([rt(locale, 'appealNothing')]);
      expect(snapshot()).toEqual(before);
      expect(mocks.track).not.toHaveBeenCalled();
    },
  );

  it('an active, expired or draft profile in a chat without a ban → "nothing to appeal"', async () => {
    for (const fields of [
      { status: 'active', hiddenAt: null, hiddenReason: null },
      { status: 'expired', hiddenAt: null, hiddenReason: null, expiredAt: HIDDEN_AT },
      { status: 'draft', step: 'districts', hiddenAt: null, hiddenReason: null },
      // Unhidden by the owner with the ban cleared, after an earlier appeal.
      { status: 'active', hiddenAt: null, hiddenReason: null, appealedAt: HIDDEN_AT },
    ] as Partial<RoommateProfile>[]) {
      seed([profile(fields)], { banned: false });
      const before = snapshot();
      expect(await appeal(), fields.status).toEqual([rt('ru', 'appealNothing')]);
      expect(snapshot(), fields.status).toEqual(before);
    }
  });

  it('a chat the database does not hold → "nothing to appeal"', async () => {
    db.state.chats = [];
    db.state.profiles = [];
    expect(await appeal()).toEqual([rt('ru', 'appealNothing')]);
  });

  it("an English chat's stored language is used, not the sender's Telegram language", async () => {
    seed([], { banned: false, locale: 'en' });
    expect(await appeal({ locale: 'en' })).toEqual([rt('en', 'appealNothing')]);
    expect(mocks.touchChat).toHaveBeenCalledWith({ chatId: TG_CHAT, locale: 'ru' });
  });
});

describe('/appeal: registration and copy', () => {
  it('registerRoommateSafety registers the command; COMMAND_MENU does not list it', () => {
    const commands = new Map<string, unknown>();
    registerRoommateSafety({
      command: (name: string, handler: unknown) => commands.set(name, handler),
      callbackQuery: () => {},
    } as unknown as Bot);
    expect(commands.get('appeal')).toBe(handleAppeal);

    for (const locale of ['ru', 'uk'] as BotLocale[]) {
      expect(COMMAND_MENU[locale].map((item) => item.command)).not.toContain('appeal');
    }
  });

  it('the statement of reasons names /appeal in every locale', () => {
    for (const locale of LOCALES) {
      expect(rt(locale, 'statementRedress'), locale).toContain('/appeal');
    }
  });

  it('the four replies are different roommate keys in every locale', () => {
    for (const key of APPEAL_KEYS) expect(ROOMMATE_TEXT_KEYS).toContain(key);
    for (const locale of LOCALES) {
      const values = APPEAL_KEYS.map((key) => rt(locale, key));
      expect(new Set(values).size, locale).toBe(APPEAL_KEYS.length);
    }
  });
});
