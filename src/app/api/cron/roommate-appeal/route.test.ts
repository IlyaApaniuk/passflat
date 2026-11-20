import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ getBot: vi.fn(), runRoommateAppeal: vi.fn() }));

// Tests never reach Telegram or the database: the bot and the run are mocked; the run itself is
// tested in `src/lib/bot/roommate-appeal-decision.test.ts`.
vi.mock('@/lib/bot/bot', () => ({ getBot: h.getBot }));
vi.mock('@/lib/bot/roommate-appeal-decision', () => ({
  APPEAL_DECISIONS: ['lifted', 'upheld'],
  runRoommateAppeal: h.runRoommateAppeal,
}));

import * as routeModule from './route';
import { POST } from './route';

const SECRET = 'cron-test-secret';
const NOW = new Date('2026-12-10T12:00:00Z');
const PROFILE_ID = '00000000-0000-4000-8000-000000000010';
const RESULT = {
  decided: 1,
  messages: { sent: 1, blocked: 0, failed: 0, skipped: 0, stopped: null },
};
const HINT =
  'Send the JSON body { "profileId": "<uuid>", "decision": "lifted" | "upheld", "confirm": true }';

const body = (fields: Record<string, unknown>) =>
  JSON.stringify({ profileId: PROFILE_ID, decision: 'lifted', confirm: true, ...fields });

function req(payload: string | null = body({}), auth: string | null = `Bearer ${SECRET}`) {
  return new NextRequest('http://localhost/api/cron/roommate-appeal', {
    method: 'POST',
    headers: {
      ...(auth ? { authorization: auth } : {}),
      'content-type': 'application/json',
    },
    ...(payload === null ? {} : { body: payload }),
  });
}

function expectNothingRan() {
  expect(h.getBot).not.toHaveBeenCalled();
  expect(h.runRoommateAppeal).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubEnv('CRON_SECRET', SECRET);
  h.getBot.mockReturnValue({ api: { sendMessage: vi.fn() } });
  h.runRoommateAppeal.mockResolvedValue(RESULT);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('POST /api/cron/roommate-appeal: refusals change nothing', () => {
  it('401 without the cron secret or with a wrong one, even with a confirmed body', async () => {
    for (const auth of [null, 'Bearer wrong', SECRET]) {
      const response = await POST(req(body({}), auth));

      expect(response.status).toBe(401);
    }
    expectNothingRan();
  });

  it.each([
    ['no body', null],
    ['an empty body', ''],
    ['a body that is not JSON', 'confirm=true'],
    ['JSON null', 'null'],
    ['an array', `[${body({})}]`],
    ['no confirm', JSON.stringify({ profileId: PROFILE_ID, decision: 'lifted' })],
    ['confirm false', body({ confirm: false })],
    ['confirm as a string', body({ confirm: 'true' })],
    ['an unknown decision', body({ decision: 'deleted' })],
    ['the decision in capitals', body({ decision: 'LIFTED' })],
    ['no decision', body({ decision: undefined })],
    ['no profile id', body({ profileId: undefined })],
    ['a profile id that is not a uuid', body({ profileId: 'x; drop table' })],
    ['a numeric profile id', body({ profileId: 42 })],
  ])('400 with %s', async (_name, payload) => {
    const response = await POST(req(payload));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: HINT });
    expectNothingRan();
  });

  it('503 without a configured bot: no decision is applied without its message', async () => {
    h.getBot.mockReturnValue(null);

    const response = await POST(req());

    expect(response.status).toBe(503);
    expect(h.runRoommateAppeal).not.toHaveBeenCalled();
  });
});

describe('POST /api/cron/roommate-appeal: confirmed', () => {
  it.each(['lifted', 'upheld'])(
    '%s runs once with the bot api, the profile and the current time, and answers counts only',
    async (decision) => {
      const response = await POST(req(body({ decision })));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(RESULT);
      expect(h.runRoommateAppeal).toHaveBeenCalledTimes(1);
      expect(h.runRoommateAppeal).toHaveBeenCalledWith(
        h.getBot.mock.results[0].value.api,
        { profileId: PROFILE_ID, decision },
        NOW,
      );
    },
  );

  it('does not read the matching switch: moderation works with it on or off', async () => {
    for (const value of ['true', '']) {
      vi.stubEnv('ROOMMATE_MATCHING_ENABLED', value);

      expect((await POST(req())).status).toBe(200);
    }
    expect(h.runRoommateAppeal).toHaveBeenCalledTimes(2);
  });

  it('passes on a call that decided nothing (a repeat, or a profile that is not hidden)', async () => {
    const nothing = {
      decided: 0,
      messages: { sent: 0, blocked: 0, failed: 0, skipped: 0, stopped: null },
    };
    h.runRoommateAppeal.mockResolvedValueOnce(nothing);

    expect(await (await POST(req())).json()).toEqual(nothing);
  });

  it('is POST only', () => {
    expect(Object.keys(routeModule)).toEqual(['POST']);
  });
});

describe('vercel.json', () => {
  it('never schedules the appeal route (D73: the owner triggers it per decision)', () => {
    const raw = readFileSync(join(process.cwd(), 'vercel.json'), 'utf8');
    const config = JSON.parse(raw) as { crons: { path: string }[] };

    expect(config.crons.some((cron) => cron.path.includes('roommate-appeal'))).toBe(false);
    expect(raw).not.toContain('roommate-appeal');
  });
});
