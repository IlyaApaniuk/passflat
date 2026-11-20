import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getBot: vi.fn(),
  runRoommateClose: vi.fn(),
  flushPostHog: vi.fn(),
  calls: [] as string[],
}));

// Tests never reach Telegram or the database: the bot and the run are mocked; the run itself is
// tested in `src/lib/bot/roommate-close.test.ts`.
vi.mock('@/lib/bot/bot', () => ({ getBot: h.getBot }));
vi.mock('@/lib/bot/roommate-close', () => ({ runRoommateClose: h.runRoommateClose }));
vi.mock('@/lib/posthog-server', () => ({ flushPostHog: h.flushPostHog }));

import * as routeModule from './route';
import { POST, maxDuration } from './route';

const SECRET = 'cron-test-secret';
const NOW = new Date('2027-01-21T11:00:00Z');
const RESULT = {
  draftsDeleted: 1,
  profilesDeleted: 3,
  messages: { sent: 2, blocked: 0, failed: 0, skipped: 1, stopped: null },
  remaining: 0,
  reportsDeleted: 2,
};
const CONFIRM = JSON.stringify({ confirm: true });

function req(body: string | null = CONFIRM, auth: string | null = `Bearer ${SECRET}`) {
  return new NextRequest('http://localhost/api/cron/roommate-close', {
    method: 'POST',
    headers: {
      ...(auth ? { authorization: auth } : {}),
      'content-type': 'application/json',
    },
    ...(body === null ? {} : { body }),
  });
}

/** Nothing ran, nothing was flushed. */
function expectNothingChanged() {
  expect(h.getBot).not.toHaveBeenCalled();
  expect(h.runRoommateClose).not.toHaveBeenCalled();
  expect(h.flushPostHog).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.stubEnv('ROOMMATE_MATCHING_ENABLED', '');
  h.calls.length = 0;
  h.getBot.mockReturnValue({ api: { sendMessage: vi.fn() } });
  h.runRoommateClose.mockImplementation(async () => {
    h.calls.push('run');
    return RESULT;
  });
  // The flush resolves a tick later, so a missing await would show in `calls`.
  h.flushPostHog.mockImplementation(async () => {
    await new Promise((resolve) => setImmediate(resolve));
    h.calls.push('flushed');
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('POST /api/cron/roommate-close: refusals change nothing', () => {
  it('401 without the cron secret or with a wrong one, even with confirm and the switch on', async () => {
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
    for (const auth of [null, 'Bearer wrong', SECRET]) {
      const response = await POST(req(CONFIRM, auth));

      expect(response.status).toBe(401);
    }
    expectNothingChanged();
  });

  it.each([
    ['no body', null],
    ['an empty body', ''],
    ['a body that is not JSON', 'confirm=true'],
    ['an empty object', '{}'],
    ['confirm false', '{"confirm":false}'],
    ['confirm as a string', '{"confirm":"true"}'],
    ['confirm as a number', '{"confirm":1}'],
    ['JSON null', 'null'],
    ['JSON true', 'true'],
    ['an array', '[{"confirm":true}]'],
  ])('400 with %s', async (_name, body) => {
    const response = await POST(req(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Send the JSON body { "confirm": true }' });
    expectNothingChanged();
  });

  it('400 before 409: without confirm the switch is not even read', async () => {
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');

    expect((await POST(req('{}'))).status).toBe(400);
    expectNothingChanged();
  });

  it('409 with the matching switch on', async () => {
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');

    const response = await POST(req());

    expect(response.status).toBe(409);
    expectNothingChanged();
  });

  it('503 without a configured bot: no profile is deleted without its message', async () => {
    h.getBot.mockReturnValue(null);

    const response = await POST(req());

    expect(response.status).toBe(503);
    expect(h.runRoommateClose).not.toHaveBeenCalled();
    expect(h.flushPostHog).not.toHaveBeenCalled();
  });
});

describe('POST /api/cron/roommate-close: confirmed', () => {
  it.each(['', 'false', 'TRUE', '1'])(
    'with the switch off (%j) runs with the bot api and the current time, awaits the flush and answers counts only',
    async (value) => {
      vi.stubEnv('ROOMMATE_MATCHING_ENABLED', value);

      const response = await POST(req());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(RESULT);
      expect(h.runRoommateClose).toHaveBeenCalledTimes(1);
      expect(h.runRoommateClose).toHaveBeenCalledWith(h.getBot.mock.results[0].value.api, NOW);
      expect(h.calls).toEqual(['run', 'flushed']);
    },
  );

  it('passes on how many profiles remain after a run cut short', async () => {
    const cut = {
      ...RESULT,
      messages: { ...RESULT.messages, stopped: 'time_budget' },
      remaining: 7,
      reportsDeleted: 0,
    };
    h.runRoommateClose.mockResolvedValueOnce(cut);

    expect(await (await POST(req())).json()).toEqual(cut);
  });

  it('flushes the events sent before a failure too', async () => {
    h.runRoommateClose.mockRejectedValueOnce(new Error('database down'));

    await expect(POST(req())).rejects.toThrow('database down');
    expect(h.flushPostHog).toHaveBeenCalledTimes(1);
  });

  it('is POST only and has a 60 s limit', () => {
    expect(Object.keys(routeModule).sort()).toEqual(['POST', 'maxDuration']);
    expect(maxDuration).toBe(60);
  });
});

describe('vercel.json', () => {
  it('never schedules the closing route (D64: the owner triggers it by hand)', () => {
    const raw = readFileSync(join(process.cwd(), 'vercel.json'), 'utf8');
    const config = JSON.parse(raw) as { crons: { path: string }[] };

    expect(config.crons.some((cron) => cron.path.includes('roommate-close'))).toBe(false);
    expect(raw).not.toContain('roommate-close');
  });
});
