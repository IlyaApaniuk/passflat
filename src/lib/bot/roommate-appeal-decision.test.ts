import { GrammyError, type Api } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The owner's decision on an appeal (spec 07 §Appeals and the owner's review, D73, PRD 3 Q-16, DSA
 * Art. 20) through the real `createCronSender` and the real store functions (`liftHide`,
 * `upholdHide`, `releaseUpheldHide`), over an in-memory Prisma fake whose `updateMany` applies its
 * `where` (the `targetProfile` relation included) and whose interactive `$transaction` runs its
 * callback over the fake itself. Telegram is a fake `api.sendMessage`; nothing reaches Telegram,
 * PostHog or a database.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;
type Select = Record<string, true | { select: Select }>;

const db = vi.hoisted(() => {
  const state = { profiles: [] as Row[], chats: [] as Row[], reports: [] as Row[] };
  const chatOf = (profile: Row) => state.chats.find((chat) => chat.id === profile.chatId);
  const profileOf = (id: unknown) => state.profiles.find((profile) => profile.id === id);

  function matches(row: Row | undefined, where: Where): boolean {
    if (!row) return false;
    return Object.entries(where).every(([key, cond]) => {
      if (key === 'targetProfile') return matches(profileOf(row.targetProfileId), cond as Where);
      if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
        throw new Error(`filter on ${key}`);
      }
      return row[key] === cond;
    });
  }

  function project(row: Row, select: Select): Row {
    return Object.fromEntries(
      Object.entries(select).map(([key, value]) =>
        value === true
          ? [key, structuredClone(row[key])]
          : [key, project(chatOf(row) ?? {}, value.select)],
      ),
    );
  }

  function updateMany(rows: () => Row[]) {
    return vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
      const hits = rows().filter((row) => matches(row, where));
      for (const row of hits) Object.assign(row, structuredClone(data));
      return { count: hits.length };
    });
  }

  const client = {
    roommateProfile: {
      findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select: Select }) => {
        const row = profileOf(where.id);
        return row ? project(row, select) : null;
      }),
      updateMany: updateMany(() => state.profiles),
    },
    roommateReport: { updateMany: updateMany(() => state.reports) },
    telegramChat: { updateMany: updateMany(() => state.chats) },
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(client)),
  };
  return { state, prisma: client };
});

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }));

import { appealDecisionText, runRoommateAppeal } from './roommate-appeal-decision';
import type { CronClock } from './roommate-daily';
import { rt } from './roommate-texts';
import type { BotLocale } from './texts';

const NOW = new Date('2026-12-10T12:00:00Z');
const HIDDEN_AT = new Date('2026-12-01T09:00:00Z');
const APPEALED_AT = new Date('2026-12-02T09:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const X = '00000000-0000-4000-8000-000000000010';
const OTHER = '00000000-0000-4000-8000-000000000020';
const TG_X = 7_010;
const LOCALES: BotLocale[] = ['ru', 'uk', 'en'];

/** The profile X, hidden by reports, appealed, its chat banned; `fields` and `chat` override. */
function seed(fields: Row = {}, chat: Row = {}) {
  db.state.chats = [
    {
      id: 'chat-x',
      chatId: BigInt(TG_X),
      locale: 'ru',
      blockedAt: null,
      roommateBannedAt: HIDDEN_AT,
      ...chat,
    },
    { id: 'chat-o', chatId: BigInt(7_020), locale: 'ru', blockedAt: null, roommateBannedAt: null },
  ];
  db.state.profiles = [
    {
      id: X,
      chatId: 'chat-x',
      status: 'hidden',
      expiresAt: new Date(NOW.getTime() + 10 * DAY),
      expiredAt: null,
      hiddenAt: HIDDEN_AT,
      hiddenReason: 'reports',
      statementSentAt: HIDDEN_AT,
      appealedAt: APPEALED_AT,
      ...fields,
    },
    { id: OTHER, chatId: 'chat-o', status: 'active', hiddenAt: null, hiddenReason: null },
  ];
  const report = (id: string, reason: string, target: string, decision = 'hidden') => ({
    id,
    reporterProfileId: `reporter-${id}`,
    targetProfileId: target,
    reason,
    decision,
    automated: true,
    decidedAt: decision === 'none' ? null : HIDDEN_AT,
  });
  db.state.reports = [
    report('r1', 'fake', X),
    report('r2', 'money', X),
    report('r3', 'other', OTHER, 'none'),
  ];
}

const profileX = () => db.state.profiles.find((row) => row.id === X)!;
const chatX = () => db.state.chats.find((row) => row.id === 'chat-x')!;
const reportsOf = (target: string) => db.state.reports.filter((r) => r.targetProfileId === target);
const snapshot = () => structuredClone(db.state);

function fakeApi() {
  const sendMessage = vi.fn(async (..._args: unknown[]) => ({}));
  return { api: { sendMessage } as unknown as Api, sendMessage };
}

function fakeClock(): CronClock {
  let t = 1_000_000;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

function decide(api: Api, decision: 'lifted' | 'upheld', profileId = X) {
  return runRoommateAppeal(api, { profileId, decision }, NOW, { clock: fakeClock() });
}

function telegramError(code: number, description: string) {
  return new GrammyError(
    "Call to 'sendMessage' failed!",
    { ok: false, error_code: code, description },
    'sendMessage',
    { chat_id: TG_X, text: 'decision' },
  );
}

const counts = (
  fields: Partial<Record<'sent' | 'blocked' | 'failed' | 'skipped', number>> = {},
) => ({
  sent: 0,
  blocked: 0,
  failed: 0,
  skipped: 0,
  stopped: null,
  ...fields,
});

/** The upheld message for a hide by `reason`, from its parts. */
function upheldText(locale: BotLocale, ground: 'Reports' | 'Under18') {
  const termsUrl = `https://passflat.com/${locale}/terms?utm_source=telegram&amp;utm_medium=bot&amp;utm_campaign=roommate#matching`;
  return [
    rt(locale, 'appealUpheld'),
    rt(locale, `appealUpheldGround${ground}`, { termsUrl }),
    rt(locale, 'appealUpheldRedress'),
  ].join('\n\n');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
  seed();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('lifted: the unhide, the lifted reports, the cleared ban, then one message', () => {
  it('a profile whose expires_at is ahead goes back to active; appealed_at and the statement stay', async () => {
    const { api, sendMessage } = fakeApi();

    const result = await decide(api, 'lifted');

    expect(result).toEqual({ decided: 1, messages: counts({ sent: 1 }) });
    expect(profileX()).toMatchObject({
      status: 'active',
      expiredAt: null,
      hiddenAt: null,
      hiddenReason: null,
      appealedAt: APPEALED_AT,
      statementSentAt: HIDDEN_AT,
    });
    expect(reportsOf(X)).toEqual([
      expect.objectContaining({ id: 'r1', decision: 'lifted', automated: false, decidedAt: NOW }),
      expect.objectContaining({ id: 'r2', decision: 'lifted', automated: false, decidedAt: NOW }),
    ]);
    expect(chatX().roommateBannedAt).toBeNull();
    expect(sendMessage.mock.calls).toEqual([
      [TG_X, rt('ru', 'appealLifted'), expect.objectContaining({ parse_mode: 'HTML' })],
    ]);
  });

  it('leaves every other profile, report and chat alone', async () => {
    const before = snapshot();

    await decide(fakeApi().api, 'lifted');

    expect(db.state.profiles.find((row) => row.id === OTHER)).toEqual(before.profiles[1]);
    expect(reportsOf(OTHER)).toEqual([before.reports[2]]);
    expect(db.state.chats[1]).toEqual(before.chats[1]);
  });

  it('a profile past its expires_at goes back to expired with expired_at = expires_at', async () => {
    const expiresAt = new Date(NOW.getTime() - 2 * DAY);
    seed({ expiresAt });

    await decide(fakeApi().api, 'lifted');

    expect(profileX()).toMatchObject({ status: 'expired', expiredAt: expiresAt, hiddenAt: null });
  });

  it('an expired_at already set is kept', async () => {
    const expiredAt = new Date(NOW.getTime() - DAY);
    seed({ expiresAt: new Date(NOW.getTime() - 3 * DAY), expiredAt });

    await decide(fakeApi().api, 'lifted');

    expect(profileX()).toMatchObject({ status: 'expired', expiredAt });
  });

  it('lifts a report the hide had not decided too, as the README unhide does', async () => {
    db.state.reports.push({ ...db.state.reports[0], id: 'r4', decision: 'none', decidedAt: null });

    await decide(fakeApi().api, 'lifted');

    expect(reportsOf(X).map((r) => [r.id, r.decision])).toEqual([
      ['r1', 'lifted'],
      ['r2', 'lifted'],
      ['r4', 'lifted'],
    ]);
  });

  it('runs the unhide in one transaction', async () => {
    await decide(fakeApi().api, 'lifted');

    expect(db.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('upheld: the hide and the ban stay, the reasoned message goes out once', () => {
  it('changes nothing about the hide; the decided reports are marked reviewed by a person', async () => {
    const before = snapshot();
    const { api, sendMessage } = fakeApi();

    const result = await decide(api, 'upheld');

    expect(result).toEqual({ decided: 1, messages: counts({ sent: 1 }) });
    expect(db.state.profiles).toEqual(before.profiles);
    expect(db.state.chats).toEqual(before.chats);
    expect(reportsOf(X)).toEqual([
      { ...before.reports[0], automated: false },
      { ...before.reports[1], automated: false },
    ]);
    expect(reportsOf(OTHER)).toEqual([before.reports[2]]);
    expect(sendMessage.mock.calls).toEqual([
      [
        TG_X,
        upheldText('ru', 'Reports'),
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
      ],
    ]);
  });

  it('names the under-18 rule for a profile hidden by a "looks under 18" report', async () => {
    seed({ hiddenReason: 'under_18' });
    const { api, sendMessage } = fakeApi();

    await decide(api, 'upheld');

    expect(sendMessage.mock.calls[0][1]).toBe(upheldText('ru', 'Under18'));
  });

  it('the message names no reporter, no report count and no other profile', async () => {
    const { api, sendMessage } = fakeApi();

    await decide(api, 'upheld');

    const text = sendMessage.mock.calls[0][1] as string;
    for (const leak of ['reporter-', OTHER, X, 'fake', 'money', '7020']) {
      expect(text).not.toContain(leak);
    }
  });
});

describe('the message in the chat locale', () => {
  it.each(LOCALES)('%s: lifted and upheld', async (locale) => {
    seed({}, { locale });
    const lifted = fakeApi();
    await decide(lifted.api, 'lifted');
    expect(lifted.sendMessage.mock.calls[0][1]).toBe(rt(locale, 'appealLifted'));

    seed({}, { locale });
    const upheld = fakeApi();
    await decide(upheld.api, 'upheld');
    expect(upheld.sendMessage.mock.calls[0][1]).toBe(upheldText(locale, 'Reports'));
  });

  it('an unknown stored locale gets Russian', async () => {
    seed({}, { locale: 'pl' });
    const { api, sendMessage } = fakeApi();

    await decide(api, 'lifted');

    expect(sendMessage.mock.calls[0][1]).toBe(rt('ru', 'appealLifted'));
  });

  it.each(LOCALES)('%s: appealDecisionText links the moderation section of the terms', (locale) => {
    const text = appealDecisionText(locale, 'upheld', 'reports');

    expect(text).toContain(`href="https://passflat.com/${locale}/terms?`);
    expect(text).toContain('#matching"');
    expect(appealDecisionText(locale, 'lifted', 'reports')).not.toContain('href');
  });
});

describe('a repeat call sends nothing', () => {
  it.each(['lifted', 'upheld'] as const)(
    '%s twice → one message; the second changes nothing',
    async (decision) => {
      const { api, sendMessage } = fakeApi();
      await decide(api, decision);
      const after = snapshot();

      const second = await decide(api, decision);

      expect(second).toEqual({ decided: 0, messages: counts() });
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(snapshot()).toEqual(after);
    },
  );

  it.each(['lifted', 'upheld'] as const)('%s twice at once → one message', async (decision) => {
    const { api, sendMessage } = fakeApi();

    const results = await Promise.all([decide(api, decision), decide(api, decision)]);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.decided).sort()).toEqual([0, 1]);
  });

  it('upheld after lifted, or lifted after upheld, sends nothing more than the first', async () => {
    const { api, sendMessage } = fakeApi();
    await decide(api, 'lifted');

    expect(await decide(api, 'upheld')).toEqual({ decided: 0, messages: counts() });
    expect(sendMessage).toHaveBeenCalledTimes(1);

    seed();
    const next = fakeApi();
    await decide(next.api, 'upheld');
    // Upheld keeps the profile hidden, so the owner can still change their mind and lift it.
    expect(await decide(next.api, 'lifted')).toEqual({ decided: 1, messages: counts({ sent: 1 }) });
    expect(next.sendMessage.mock.calls.map(([, text]) => text)).toEqual([
      upheldText('ru', 'Reports'),
      rt('ru', 'appealLifted'),
    ]);
  });
});

describe('a profile that is unknown or not hidden changes and sends nothing', () => {
  it.each([
    ['an unknown id', {}, '00000000-0000-4000-8000-000000000099'],
    ['an active profile', { status: 'active', hiddenAt: null, hiddenReason: null }, X],
    ['an expired profile', { status: 'expired', hiddenAt: null, hiddenReason: null }, X],
    ['a draft', { status: 'draft', hiddenAt: null, hiddenReason: null }, X],
  ])('%s', async (_name, fields, profileId) => {
    for (const decision of ['lifted', 'upheld'] as const) {
      seed(fields);
      const before = snapshot();
      const { api, sendMessage } = fakeApi();

      expect(await decide(api, decision, profileId)).toEqual({ decided: 0, messages: counts() });
      expect(snapshot()).toEqual(before);
      expect(sendMessage).not.toHaveBeenCalled();
    }
  });
});

describe('a chat that blocked the bot, and failed sends', () => {
  it('lifted with the chat marked blocked: applied, the message skipped', async () => {
    seed({}, { blockedAt: HIDDEN_AT });
    const { api, sendMessage } = fakeApi();

    expect(await decide(api, 'lifted')).toEqual({ decided: 1, messages: counts({ skipped: 1 }) });
    expect(profileX().status).toBe('active');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('upheld with the chat marked blocked: nothing changes, so a later call can still tell', async () => {
    seed({}, { blockedAt: HIDDEN_AT });
    const before = snapshot();
    const { api, sendMessage } = fakeApi();

    expect(await decide(api, 'upheld')).toEqual({ decided: 0, messages: counts({ skipped: 1 }) });
    expect(snapshot()).toEqual(before);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('lifted, 403: the unhide stays and the chat is marked blocked', async () => {
    const { api, sendMessage } = fakeApi();
    sendMessage.mockRejectedValueOnce(telegramError(403, 'Forbidden: bot was blocked by the user'));

    expect(await decide(api, 'lifted')).toEqual({ decided: 1, messages: counts({ blocked: 1 }) });
    expect(profileX().status).toBe('active');
    expect(chatX().blockedAt).toEqual(NOW);
  });

  it('upheld, 403: the claim is given back and the chat is marked blocked', async () => {
    const { api, sendMessage } = fakeApi();
    sendMessage.mockRejectedValueOnce(telegramError(403, 'Forbidden: bot was blocked by the user'));

    expect(await decide(api, 'upheld')).toEqual({ decided: 0, messages: counts({ blocked: 1 }) });
    expect(reportsOf(X).map((r) => r.automated)).toEqual([true, true]);
    expect(chatX().blockedAt).toEqual(NOW);
  });

  it('upheld, another failure: the claim is given back and a second call sends', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { api, sendMessage } = fakeApi();
    sendMessage.mockRejectedValueOnce(new Error('network down'));

    expect(await decide(api, 'upheld')).toEqual({ decided: 0, messages: counts({ failed: 1 }) });
    expect(reportsOf(X).map((r) => r.automated)).toEqual([true, true]);

    expect(await decide(api, 'upheld')).toEqual({ decided: 1, messages: counts({ sent: 1 }) });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(
      '[bot/roommate] cron message failed',
      'network down',
    );
  });

  it('lifted, another failure: the unhide stays and a second call sends nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { api, sendMessage } = fakeApi();
    sendMessage.mockRejectedValueOnce(new Error('network down'));

    expect(await decide(api, 'lifted')).toEqual({ decided: 1, messages: counts({ failed: 1 }) });
    expect(profileX().status).toBe('active');

    expect(await decide(api, 'lifted')).toEqual({ decided: 0, messages: counts() });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('the result', () => {
  it('holds counts only: no chat id, no profile id, no text', async () => {
    const result = await decide(fakeApi().api, 'upheld');

    const json = JSON.stringify(result);
    expect(json).not.toContain(String(TG_X));
    expect(json).not.toContain(X);
    expect(Object.keys(result).sort()).toEqual(['decided', 'messages']);
  });
});
