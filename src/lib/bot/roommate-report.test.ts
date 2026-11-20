import { Prisma, type RoommateProfile } from '@prisma/client';
import type { Api, Bot, Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Report" with its reasons and the receipt (PRD 3 FR-31, spec 07 §Report): who may report whom
 * (a card they may be shown, a reaction to the target, a reveal of it; the callback id checked,
 * never trusted), one report per reporter and target, `tg_roommate_reported` with the reason once,
 * the pair hidden from each other at once (counts, cards, compatibility), the receipt per case
 * (stored, already hidden), a repeat, and the switch off.
 *
 * Taps go through what `registerRoommateFlow`, `registerRoommateMatching` and
 * `registerRoommateSafety` register, over one in-memory Prisma fake whose reads apply their
 * `where` and return copies. Nothing reaches Telegram, PostHog or a database.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = {
    profiles: [] as Row[],
    chats: [] as Row[],
    reactions: [] as Row[],
    reports: [] as Row[],
  };
  const chatOf = (row: Row) => state.chats.find((chat) => chat.id === row.chatId) ?? {};
  const profileOf = (id: unknown) => state.profiles.find((row) => row.id === id) ?? {};

  /** `select` with the `chat` and `reporterProfile` relations (the messages of a hide). */
  function project(row: Row, select: Row): Row {
    return Object.fromEntries(
      Object.entries(select).map(([key, part]) => {
        if (part === true) return [key, structuredClone(row[key])];
        const related = key === 'chat' ? chatOf(row) : profileOf(row.reporterProfileId);
        return [key, project(related, (part as Row).select as Row)];
      }),
    );
  }

  /** `relation: { none | some: {...} }` on a profile: the table and the field that points at it. */
  const RELATIONS: Record<string, ['reactions' | 'reports', string]> = {
    reactionsGot: ['reactions', 'toProfileId'],
    reactionsGiven: ['reactions', 'fromProfileId'],
    reportsReceived: ['reports', 'targetProfileId'],
    reportsMade: ['reports', 'reporterProfileId'],
  };

  const time = (value: unknown) => (value instanceof Date ? value.getTime() : NaN);

  function matches(row: Row, where: Where): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (key === 'OR') return (cond as Where[]).some((part) => matches(row, part));
      if (key === 'chat') return matches(chatOf(row), cond as Where);
      if (key === 'reporterProfile')
        return matches(profileOf(row.reporterProfileId), cond as Where);
      if (key === 'targetProfile') return matches(profileOf(row.targetProfileId), cond as Where);
      if (key in RELATIONS) {
        const { none, some, ...rest } = cond as { none?: Where; some?: Where };
        const filter = none ?? some;
        if (!filter || (none && some) || Object.keys(rest).length) {
          throw new Error(`only none or some on ${key}`);
        }
        const [table, own] = RELATIONS[key];
        const found = state[table].some((item) => item[own] === row.id && matches(item, filter));
        return none ? !found : found;
      }
      const value = row[key] ?? null;
      if (cond === null) return value === null;
      if (cond instanceof Date) return time(value) === cond.getTime();
      if (typeof cond === 'object') {
        const {
          in: list,
          not,
          gt,
          lte,
          ...rest
        } = cond as { in?: unknown[]; not?: unknown; gt?: Date; lte?: Date };
        if (Object.keys(rest).length) throw new Error(`unsupported filter on ${key}`);
        if (list && !list.includes(value)) return false;
        if ('not' in (cond as object) && value === not) return false;
        if (gt && !(time(value) > gt.getTime())) return false;
        if (lte && !(time(value) <= lte.getTime())) return false;
        return true;
      }
      return value === cond;
    });
  }

  function updateMany(table: Row[], { where, data }: { where: Where; data: Row }) {
    const hits = table.filter((row) => matches(row, where));
    for (const row of hits) Object.assign(row, structuredClone(data));
    return { count: hits.length };
  }

  const fake = {
    state,
    prisma: {
      telegramChat: {
        findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select?: Row }) => {
          const chat = state.chats.find((row) => row.id === where.id);
          if (!chat) return null;
          if (select?.chatId) return { chatId: chat.chatId };
          const profile = state.profiles.find((row) => row.chatId === where.id);
          return {
            roommateBannedAt: chat.roommateBannedAt ?? null,
            roommateProfile: profile ? structuredClone(profile) : null,
          };
        }),
        /** The ban marker of an automatic hide (`hideAfterReport`). */
        updateMany: vi.fn(async (args: { where: Where; data: Row }) =>
          updateMany(state.chats, args),
        ),
      },
      roommateProfile: {
        findUnique: vi.fn(async ({ where }: { where: { chatId?: string; id?: string } }) => {
          const row = state.profiles.find((profile) =>
            where.id !== undefined ? profile.id === where.id : profile.chatId === where.chatId,
          );
          return row ? structuredClone(row) : null;
        }),
        findMany: vi.fn(async ({ where, select }: { where: Where; select?: Row }) =>
          state.profiles
            .filter((row) => matches(row, where))
            .map((row) => (select ? project(row, select) : structuredClone(row))),
        ),
        findFirst: vi.fn(async ({ where }: { where: Where }) => {
          const row = state.profiles.find((profile) => matches(profile, where));
          return row ? structuredClone(row) : null;
        }),
        updateMany: vi.fn(async (args: { where: Where; data: Row }) =>
          updateMany(state.profiles, args),
        ),
      },
      roommateReaction: {
        count: vi.fn(
          async ({ where }: { where: Where }) =>
            state.reactions.filter((row) => matches(row, where)).length,
        ),
        /** "Skip" (a card tap in one test): the unique pair, as in `roommate-switch.test.ts`. */
        createMany: vi.fn(async ({ data }: { data: Row[] }) => {
          let count = 0;
          for (const item of data) {
            const exists = state.reactions.some(
              (r) => r.fromProfileId === item.fromProfileId && r.toProfileId === item.toProfileId,
            );
            if (exists) continue;
            state.reactions.push({ id: `r-${state.reactions.length + 1}`, ...item });
            count += 1;
          }
          return { count };
        }),
      },
      roommateReport: {
        count: vi.fn(
          async ({ where }: { where: Where }) =>
            state.reports.filter((row) => matches(row, where)).length,
        ),
        /** The unique (reporter, target) pair and the foreign key to the target, as Postgres has them. */
        createMany: vi.fn(
          async ({ data, skipDuplicates }: { data: Row[]; skipDuplicates?: boolean }) => {
            let count = 0;
            for (const item of data) {
              if (!state.profiles.some((p) => p.id === item.targetProfileId)) {
                throw new Prisma.PrismaClientKnownRequestError('Foreign key constraint violated', {
                  code: 'P2003',
                  clientVersion: 'test',
                });
              }
              const exists = state.reports.some(
                (r) =>
                  r.reporterProfileId === item.reporterProfileId &&
                  r.targetProfileId === item.targetProfileId,
              );
              if (exists && skipDuplicates) continue;
              if (exists) throw new Error('unique violation');
              state.reports.push({
                id: `rep-${state.reports.length + 1}`,
                decision: 'none',
                automated: true,
                decidedAt: null,
                reporterNotifiedAt: null,
                ...structuredClone(item),
              });
              count += 1;
            }
            return { count };
          },
        ),
        /** The decisions of an automatic hide (`hideAfterReport`) and its notice claims. */
        updateMany: vi.fn(async (args: { where: Where; data: Row }) =>
          updateMany(state.reports, args),
        ),
        /** The statement's facts and the notices of a hide (`roommate-hide-messages.ts`). */
        findMany: vi.fn(async ({ where, select }: { where: Where; select: Row }) =>
          state.reports.filter((row) => matches(row, where)).map((row) => project(row, select)),
        ),
      },
    },
  };
  /** An interactive transaction (`hideAfterReport`) runs its callback over the same fake. */
  Object.assign(fake.prisma, {
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(fake.prisma)),
  });
  return fake;
});
const mocks = vi.hoisted(() => ({
  touchChat: vi.fn(),
  track: vi.fn(),
  hasOpenIntake: vi.fn(),
  getCity: vi.fn(),
  roomCostsReply: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }));
vi.mock('./store', () => ({ touchChat: mocks.touchChat }));
vi.mock('./analytics', () => ({ track: mocks.track }));
vi.mock('./deposit-flow', () => ({ hasOpenIntake: mocks.hasOpenIntake }));
vi.mock('./lookup', () => ({ getCity: mocks.getCity }));
vi.mock('./roommate-room-costs', () => ({ roomCostsReply: mocks.roomCostsReply }));

import { REPORT_REASONS } from '@/lib/roommate/rules';
import { findCompatible } from '@/lib/roommate/store';

import { registerRoommateFlow } from './roommate-flow';
import { registerRoommateMatching, renderRoommateCard } from './roommate-matching';
import { registerRoommateSafety } from './roommate-safety';
import { rt } from './roommate-texts';
import type { BotLocale } from './texts';

const NOW = new Date('2026-12-05T09:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const EXPIRES = new Date(NOW.getTime() + 30 * DAY);
const LOCALES: BotLocale[] = ['ru', 'uk', 'en'];
const DISTRICTS = [{ slug: 'mokotow', nameKey: 'Mokotów' }];

/** A profile id of the database's shape. */
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = uid(1);
const B = uid(2);
const C = uid(3);

/** The Telegram chat id of the chat of profile `id` (its `tg_<chatId>` identity). */
const tgChatOf = (id: string) => 7000 + Number(id.slice(-4));
const A_CHAT = tgChatOf(A);

/** Active and compatible with every other default profile. */
function profile(id: string, fields: Partial<RoommateProfile> = {}): Row {
  const value: RoommateProfile = {
    id,
    chatId: `chat-${id}`,
    status: 'active',
    step: null,
    entrySource: 'tg',
    districtSlugs: ['mokotow'],
    anyDistrict: false,
    budgetBand: 'b3',
    moveInMonth: new Date('2027-02-01T00:00:00.000Z'),
    languages: ['ru'],
    gender: null,
    prefers: 'anyone',
    about: null,
    smoking: null,
    pets: null,
    adultConfirmedAt: NOW,
    tgUsername: `user_${id.slice(-2)}`,
    activatedAt: new Date(NOW.getTime() - 10 * DAY),
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
  return value as unknown as Row;
}

/** Profiles in their own chats (RU unless named). */
function seed(rows: Row[], locales: Record<string, BotLocale> = {}) {
  db.state.profiles = rows;
  db.state.chats = rows.map((row) => ({
    id: row.chatId,
    chatId: BigInt(tgChatOf(row.id as string)),
    blockedAt: null,
    roommateBannedAt: null,
    locale: locales[row.id as string] ?? 'ru',
  }));
  db.state.reactions = [];
  db.state.reports = [];
}

/** A reaction from `from` to `to`; `revealed` marks a reveal of `to` already sent to `from`. */
function react(from: string, to: string, kind: 'interest' | 'skip', revealed = false) {
  db.state.reactions.push({
    id: `r-${db.state.reactions.length + 1}`,
    fromProfileId: from,
    toProfileId: to,
    kind,
    createdAt: NOW,
    matchedAt: revealed ? NOW : null,
    revealedAt: revealed ? NOW : null,
  });
}

/** A and B matched, and each has had the reveal of the other (spec 07 §Reveal). */
function revealed(x: string, y: string) {
  react(x, y, 'interest', true);
  react(y, x, 'interest', true);
}

const row = (id: string) => db.state.profiles.find((r) => r.id === id)!;
const snapshot = () => structuredClone(db.state);

type Button = { text: string; callback_data?: string };
type Options = { reply_markup?: { inline_keyboard: Button[][] }; parse_mode?: string };

const dataOf = (options?: Options) =>
  (options?.reply_markup?.inline_keyboard ?? []).map((r) => r.map((b) => b.callback_data));

type Handler = (ctx: Context) => Promise<void>;
type Route = [trigger: string | RegExp, handler: Handler];

const ROUTES: Route[] = [];
{
  const bot = {
    command: vi.fn(),
    callbackQuery: (trigger: string | RegExp, handler: Handler) => {
      ROUTES.push([trigger, handler]);
    },
  } as unknown as Bot;
  registerRoommateFlow(bot);
  registerRoommateMatching(bot);
  registerRoommateSafety(bot);
}

const routesFor = (data: string) =>
  ROUTES.filter(([trigger]) =>
    typeof trigger === 'string' ? trigger === data : trigger.test(data),
  );

type Who = { who?: string; locale?: BotLocale; username?: string | null };

/** A tap on a button with `data`, routed to the one handler registered for it. */
async function tap(data: string, { who = A, locale = 'ru', username }: Who = {}) {
  const routes = routesFor(data);
  expect(routes, `routes for ${data}`).toHaveLength(1);
  const [trigger, handler] = routes[0];
  mocks.touchChat.mockResolvedValue({ id: `chat-${who}`, locale, isNew: false });
  const name = username === undefined ? (row(who)?.tgUsername as string | null) : username;
  const reply = vi.fn().mockResolvedValue({});
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const ctx = {
    chat: { id: tgChatOf(who) },
    from: name ? { id: tgChatOf(who), username: name } : { id: tgChatOf(who) },
    callbackQuery: { id: 'q', data },
    match: typeof trigger === 'string' ? data : data.match(trigger),
    reply,
    answerCallbackQuery,
    editMessageReplyMarkup: vi.fn().mockResolvedValue(true),
    api: { sendMessage: vi.fn(), getChat: vi.fn() } as unknown as Api,
  };
  await handler(ctx as unknown as Context);
  return {
    answerCallbackQuery,
    replies: reply.mock.calls.map(([text, options]) => ({
      text: text as string,
      data: dataOf(options as Options | undefined),
      labels: ((options as Options | undefined)?.reply_markup?.inline_keyboard ?? []).map((r) =>
        r.map((b) => b.text),
      ),
    })),
  };
}

const texts = async (data: string, who: Who = {}) =>
  (await tap(data, who)).replies.map(({ text }) => text);

const events = () => mocks.track.mock.calls;

/** The receipt and the other replies of a report, as each locale reads them (agent drafts). */
const RECEIPT: Record<BotLocale, string> = {
  ru: 'Жалоба получена. Проверка автоматическая. Эта анкета теперь скрыта от тебя. От всех она скроется, когда пожалуется ещё один человек, а по причине «Похоже, младше 18» — сразу. Когда это случится, напишу тебе.',
  uk: 'Скаргу отримано. Перевірка автоматична. Ця анкета тепер прихована від тебе. Від усіх вона сховається, коли поскаржиться ще одна людина, а з причини «Схоже, молодше 18» — одразу. Коли це станеться, напишу тобі.',
  en: "Report received. The check is automated. This profile is now hidden from you. It is hidden from everyone once one more person reports it, or at once for 'Looks under 18'. I'll tell you when that happens.",
};
const RECEIPT_HIDDEN: Record<BotLocale, string> = {
  ru: 'Жалоба получена. Проверка автоматическая. Эта анкета уже скрыта от всех.',
  uk: 'Скаргу отримано. Перевірка автоматична. Ця анкета вже прихована від усіх.',
  en: 'Report received. The check is automated. This profile is already hidden from everyone.',
};
const ALREADY: Record<BotLocale, string> = {
  ru: 'Жалоба на эту анкету уже отправлена.',
  uk: 'Скаргу на цю анкету вже надіслано.',
  en: 'You already reported this profile.',
};
const UNAVAILABLE = 'Эта анкета больше недоступна.';

const REASON_LABELS: Record<BotLocale, string[]> = {
  ru: ['Просит деньги или залог', 'Фейковая анкета', 'Оскорбления', 'Похоже, младше 18', 'Другое'],
  uk: ['Просить гроші чи заставу', 'Фейкова анкета', 'Образи', 'Схоже, молодше 18', 'Інше'],
  en: ['Asks for money or a deposit', 'Fake profile', 'Offensive', 'Looks under 18', 'Other'],
};

const reasonRows = (id: string) => REPORT_REASONS.map((reason) => [`rm:rr:${reason}:${id}`]);

const cardOf = (id: string) =>
  renderRoommateCard(row(id) as unknown as RoommateProfile, DISTRICTS, 'ru');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
  mocks.hasOpenIntake.mockResolvedValue(false);
  mocks.getCity.mockResolvedValue({ districts: DISTRICTS });
  mocks.roomCostsReply.mockResolvedValue(null);
  seed([profile(A), profile(B), profile(C)]);
});

describe('"Report" (rm:r:<id>): the reasons', () => {
  it.each(LOCALES)(
    'a card shown now offers the five reasons, one per row, in %s',
    async (locale) => {
      const before = snapshot();
      const { replies, answerCallbackQuery } = await tap(`rm:r:${B}`, { locale });

      expect(replies).toHaveLength(1);
      expect(replies[0].text).toBe(
        {
          ru: 'Что не так с этой анкетой? Выбери причину.',
          uk: 'Що не так із цією анкетою? Обери причину.',
          en: "What's wrong with this profile? Pick a reason.",
        }[locale],
      );
      expect(replies[0].data).toEqual(reasonRows(B));
      expect(replies[0].labels).toEqual(REASON_LABELS[locale].map((label) => [label]));
      expect(db.state).toEqual(before);
      expect(events()).toEqual([]);
      expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    },
  );

  it('the reasons are the five of spec 07 §Report, and every callback fits in 64 bytes', () => {
    expect(REPORT_REASONS).toEqual(['money', 'fake', 'offensive', 'under_18', 'other']);
    for (const reason of REPORT_REASONS) {
      expect(Buffer.byteLength(`rm:rr:${reason}:${B}`)).toBeLessThanOrEqual(64);
      expect(routesFor(`rm:rr:${reason}:${B}`)).toHaveLength(1);
    }
    expect(routesFor(`rm:r:${B}`)).toHaveLength(1);
  });

  it('an unknown reason or a malformed callback reaches no handler', () => {
    for (const data of [`rm:rr:spam:${B}`, `rm:rr:money`, `rm:rr::${B}`, `rm:r:${B}:x`]) {
      expect(routesFor(data), data).toHaveLength(0);
    }
  });

  it('after a report the button answers "already reported" instead of the reasons', async () => {
    await tap(`rm:rr:fake:${B}`);
    const before = snapshot();
    expect(await texts(`rm:r:${B}`)).toEqual([ALREADY.ru]);
    expect(db.state).toEqual(before);
  });
});

describe('a stored report', () => {
  // `under_18` also hides the target at once: `roommate-hide.test.ts` (spec 07 §Automatic hiding).
  it.each(REPORT_REASONS.filter((reason) => reason !== 'under_18'))(
    '"%s": one row, one tg_roommate_reported with the reason, the receipt',
    async (reason) => {
      const { replies } = await tap(`rm:rr:${reason}:${B}`);

      expect(db.state.reports).toEqual([
        {
          id: 'rep-1',
          reporterProfileId: A,
          targetProfileId: B,
          reason,
          createdAt: NOW,
          decision: 'none',
          automated: true,
          decidedAt: null,
          reporterNotifiedAt: null,
        },
      ]);
      expect(events()).toEqual([[A_CHAT, 'tg_roommate_reported', { reason }]]);
      expect(replies.map(({ text }) => text)).toEqual([RECEIPT.ru]);
      expect(replies[0].data).toEqual([]);
    },
  );

  it('stores exactly one row through one createMany that skips a duplicate pair', async () => {
    await tap(`rm:rr:money:${B}`);
    expect(db.prisma.roommateReport.createMany).toHaveBeenCalledTimes(1);
    expect(db.prisma.roommateReport.createMany).toHaveBeenCalledWith({
      data: [{ reporterProfileId: A, targetProfileId: B, reason: 'money', createdAt: NOW }],
      skipDuplicates: true,
    });
  });

  it.each(LOCALES)(
    'the receipt in %s names the under-18 reason as its button does',
    async (locale) => {
      seed([profile(A), profile(B), profile(C)], { [A]: locale });
      expect(await texts(`rm:rr:other:${B}`, { locale })).toEqual([RECEIPT[locale]]);
      expect(RECEIPT[locale]).toContain(rt(locale, 'btnReportUnder18'));
    },
  );

  it('the event carries the reason only: no username, id, chat id or text', async () => {
    seed([profile(A), profile(B, { about: 'Пишите в whatsapp' }), profile(C)]);
    await tap(`rm:rr:money:${B}`);
    const [[, , properties]] = events();
    expect(properties).toEqual({ reason: 'money' });
    expect(JSON.stringify(events())).not.toMatch(new RegExp(`${B}|user_|whatsapp|chat-`));
  });

  it("stores the reporter's current username, like every roommate handler", async () => {
    await tap(`rm:r:${B}`, { username: 'renamed_a' });
    expect(row(A).tgUsername).toBe('renamed_a');
    await tap(`rm:rr:money:${B}`, { username: null });
    expect(row(A).tgUsername).toBeNull();
  });
});

describe('the target is hidden from the reporter at once, and the reporter from the target', () => {
  it('cards: the reporter is shown the next profile, and so is the target', async () => {
    expect((await tap('rm:show:c')).replies[0].text).toBe(cardOf(B));
    expect((await tap('rm:show:c', { who: B })).replies[0].text).toBe(cardOf(A));

    await tap(`rm:rr:fake:${B}`);

    expect((await tap('rm:show:c')).replies[0].text).toBe(cardOf(C));
    expect((await tap('rm:show:c', { who: B })).replies[0].text).toBe(cardOf(C));
    // Someone else still sees B: one report hides it from the reporter only.
    expect((await tap('rm:show:c', { who: C })).replies[0].text).toBe(cardOf(A));
    expect((await tap(`rm:x:${A}`, { who: C })).replies[0].text).toBe(cardOf(B));
  });

  it('compatibility: findCompatible leaves out the pair both ways, nobody else', async () => {
    await tap(`rm:rr:offensive:${B}`);
    const ids = async (id: string) =>
      (await findCompatible(row(id) as unknown as RoommateProfile, NOW)).map((p) => p.id);
    expect(await ids(A)).toEqual([C]);
    expect(await ids(B)).toEqual([C]);
    expect(await ids(C)).toEqual([A, B]);
  });

  it('counts: "How many are looking?" no longer counts the target', async () => {
    expect((await texts('rm:c:counts'))[0]).toMatch(/Mokotów — 2 человека/);
    await tap(`rm:rr:other:${B}`);
    expect((await texts('rm:c:counts'))[0]).toMatch(/Mokotów — 1 человек[,.]/);
    expect((await texts('rm:c:counts', { who: B }))[0]).toMatch(/Mokotów — 1 человек[,.]/);
    expect((await texts('rm:c:counts', { who: C }))[0]).toMatch(/Mokotów — 2 человека/);
  });

  it('a card button of the reported profile answers "no longer available"', async () => {
    await tap(`rm:rr:fake:${B}`);
    const before = snapshot();
    const replies = await texts(`rm:i:${B}`);
    expect(replies[0]).toBe(UNAVAILABLE);
    expect(db.state.reactions).toEqual(before.reactions);
  });
});

describe('who may report whom (spec 07 §Report)', () => {
  it('the Report button under a reveal works, though the partner is no longer a card', async () => {
    revealed(A, B);
    expect(await texts(`rm:i:${B}`)).toContain(UNAVAILABLE);

    const { replies } = await tap(`rm:r:${B}`);
    expect(replies[0].data).toEqual(reasonRows(B));

    expect(await texts(`rm:rr:money:${B}`)).toEqual([RECEIPT.ru]);
    expect(db.state.reports).toMatchObject([
      { reporterProfileId: A, targetProfileId: B, reason: 'money' },
    ]);
    expect(events()).toEqual([[A_CHAT, 'tg_roommate_reported', { reason: 'money' }]]);
  });

  it('the partner under the reveal can report back: one report per direction', async () => {
    revealed(A, B);
    await tap(`rm:rr:money:${B}`);
    expect(await texts(`rm:rr:fake:${A}`, { who: B })).toEqual([RECEIPT.ru]);
    expect(db.state.reports).toMatchObject([
      { reporterProfileId: A, targetProfileId: B },
      { reporterProfileId: B, targetProfileId: A },
    ]);
  });

  it('a card answered with Skip or Interested can still be reported', async () => {
    react(A, B, 'skip');
    react(A, C, 'interest');
    expect(await texts(`rm:rr:fake:${B}`)).toEqual([RECEIPT.ru]);
    expect(await texts(`rm:rr:other:${C}`)).toEqual([RECEIPT.ru]);
    expect(db.state.reports).toHaveLength(2);
  });

  it('an expired reporter or target with a reaction may report and be reported', async () => {
    seed([
      profile(A, { status: 'expired', expiresAt: new Date(NOW.getTime() - DAY) }),
      profile(B, { status: 'expired', expiresAt: new Date(NOW.getTime() - DAY) }),
    ]);
    revealed(A, B);
    expect(await texts(`rm:rr:money:${B}`)).toEqual([RECEIPT.ru]);
    expect(db.state.reports).toHaveLength(1);
  });

  it('a profile never shown to the reporter, without a reaction, cannot be reported', async () => {
    // B speaks another language: never a card for A. B's interest in A gives A nothing to report.
    seed([profile(A), profile(B, { languages: ['uk'] })]);
    react(B, A, 'interest');
    const before = snapshot();
    expect(await texts(`rm:r:${B}`)).toEqual([UNAVAILABLE]);
    expect(await texts(`rm:rr:money:${B}`)).toEqual([UNAVAILABLE]);
    expect(db.state).toEqual(before);
    expect(events()).toEqual([]);
  });

  it.each([
    ['the reporter itself', A],
    ['an id of the wrong shape', 'not-a-uuid'],
    ['an unknown id', uid(99)],
  ])('%s → "no longer available", nothing stored', async (_case, id) => {
    const before = snapshot();
    expect(await texts(`rm:r:${id}`)).toEqual([UNAVAILABLE]);
    expect(await texts(`rm:rr:fake:${id}`)).toEqual([UNAVAILABLE]);
    expect(db.state).toEqual(before);
    expect(events()).toEqual([]);
  });

  it.each([
    ['without a profile', () => seed([profile(B)])],
    ['with a draft', () => seed([profile(A, { status: 'draft', step: 'budget' }), profile(B)])],
    [
      'with a hidden profile',
      () => seed([profile(A, { status: 'hidden', hiddenAt: NOW }), profile(B)]),
    ],
  ])('a reporter %s → "no longer available", nothing stored', async (_case, arrange) => {
    arrange();
    react(A, B, 'skip');
    const before = snapshot();
    expect(await texts(`rm:r:${B}`)).toEqual([UNAVAILABLE]);
    expect(await texts(`rm:rr:fake:${B}`)).toEqual([UNAVAILABLE]);
    expect(db.state.reports).toEqual(before.reports);
    expect(events()).toEqual([]);
  });

  it('a target deleted between the check and the insert → "no longer available", no event', async () => {
    db.prisma.roommateReport.createMany.mockImplementationOnce(async () => {
      throw new Prisma.PrismaClientKnownRequestError('Foreign key constraint violated', {
        code: 'P2003',
        clientVersion: 'test',
      });
    });
    expect(await texts(`rm:rr:fake:${B}`)).toEqual([UNAVAILABLE]);
    expect(db.state.reports).toEqual([]);
    expect(events()).toEqual([]);
  });
});

describe('a repeat changes nothing', () => {
  it.each(LOCALES)(
    'the same or another reason again → "already reported" in %s',
    async (locale) => {
      seed([profile(A), profile(B), profile(C)], { [A]: locale });
      await tap(`rm:rr:fake:${B}`, { locale });
      const before = snapshot();
      mocks.track.mockClear();

      expect(await texts(`rm:rr:fake:${B}`, { locale })).toEqual([ALREADY[locale]]);
      expect(await texts(`rm:rr:money:${B}`, { locale })).toEqual([ALREADY[locale]]);
      expect(db.state).toEqual(before);
      expect(events()).toEqual([]);
    },
  );

  it('two overlapping taps store one report and send one event', async () => {
    const results = await Promise.all([texts(`rm:rr:money:${B}`), texts(`rm:rr:fake:${B}`)]);
    expect(db.state.reports).toHaveLength(1);
    expect(events()).toHaveLength(1);
    expect(results.flat().sort()).toEqual([ALREADY.ru, RECEIPT.ru].sort());
  });

  it('a repeat after the profile was hidden still says "already reported"', async () => {
    await tap(`rm:rr:fake:${B}`);
    row(B).status = 'hidden';
    expect(await texts(`rm:rr:money:${B}`)).toEqual([ALREADY.ru]);
  });
});

describe('the target is already hidden', () => {
  it.each(LOCALES)('the receipt of a hidden profile only, in %s', async (locale) => {
    seed([profile(A), profile(B, { status: 'hidden', hiddenAt: NOW, hiddenReason: 'reports' })], {
      [A]: locale,
    });
    revealed(A, B);
    const before = snapshot();

    expect(await texts(`rm:rr:money:${B}`, { locale })).toEqual([RECEIPT_HIDDEN[locale]]);
    expect(db.state).toEqual(before);
    expect(events()).toEqual([]);
  });

  it('its receipt promises no later message', () => {
    for (const locale of LOCALES) {
      expect(RECEIPT_HIDDEN[locale]).toBe(rt(locale, 'reportReceiptHidden'));
      expect(RECEIPT_HIDDEN[locale]).not.toMatch(/напишу|tell you/);
    }
  });

  it('a hidden profile the reporter never reacted to → "no longer available"', async () => {
    seed([profile(A), profile(B, { status: 'hidden', hiddenAt: NOW })]);
    expect(await texts(`rm:r:${B}`)).toEqual([UNAVAILABLE]);
    expect(await texts(`rm:rr:money:${B}`)).toEqual([UNAVAILABLE]);
  });
});

describe('the switch off (spec 07 §Switch: moderation keeps working)', () => {
  it.each(['', 'false', 'TRUE'])(
    'Report under a reveal and its reasons work with ROOMMATE_MATCHING_ENABLED=%j',
    async (value) => {
      revealed(A, B);
      vi.stubEnv('ROOMMATE_MATCHING_ENABLED', value);

      expect((await tap(`rm:r:${B}`)).replies[0].data).toEqual(reasonRows(B));
      expect(await texts(`rm:rr:money:${B}`)).toEqual([RECEIPT.ru]);
      expect(db.state.reports).toHaveLength(1);
      expect(events()).toEqual([[A_CHAT, 'tg_roommate_reported', { reason: 'money' }]]);
      expect(await texts(`rm:rr:fake:${B}`)).toEqual([ALREADY.ru]);
    },
  );

  it('a card shown before the switch went off can still be reported', async () => {
    expect((await tap('rm:show:c')).replies[0].text).toBe(cardOf(B));
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', '');
    expect(await texts(`rm:rr:under_18:${B}`)).toEqual([RECEIPT.ru]);
    expect(events()).toContainEqual([A_CHAT, 'tg_roommate_reported', { reason: 'under_18' }]);
  });
});
