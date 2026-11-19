import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getBot: vi.fn(),
  runRoommateDaily: vi.fn(),
  flushPostHog: vi.fn(),
  calls: [] as string[],
}));

// Tests never reach Telegram or the database: the bot and the run are mocked; the run itself is
// tested in `src/lib/bot/roommate-daily.test.ts`.
vi.mock('@/lib/bot/bot', () => ({ getBot: h.getBot }));
vi.mock('@/lib/bot/roommate-daily', () => ({ runRoommateDaily: h.runRoommateDaily }));
vi.mock('@/lib/posthog-server', () => ({ flushPostHog: h.flushPostHog }));

import { GET, maxDuration } from './route';

const SECRET = 'cron-test-secret';
const NOW = new Date('2026-12-30T09:15:00Z');
const RESULT = {
  housekeeping: {
    draftsDeleted: 1,
    openStepsCleared: 0,
    expired: 2,
    deletedExpired: 0,
    deletedModeration: 0,
    reportsDeleted: 0,
  },
  messages: { sent: 0, blocked: 0, failed: 0, skipped: 0, stopped: null },
};

function req(auth: string | null = `Bearer ${SECRET}`): NextRequest {
  return new NextRequest('http://localhost/api/cron/roommate-daily', {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubEnv('CRON_SECRET', SECRET);
  h.calls.length = 0;
  h.getBot.mockReturnValue({ api: { sendMessage: vi.fn() } });
  h.runRoommateDaily.mockImplementation(async () => {
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

describe('GET /api/cron/roommate-daily', () => {
  it('refuses a call without the cron secret: 401, nothing runs or flushes', async () => {
    for (const auth of [null, 'Bearer wrong']) {
      const response = await GET(req(auth));

      expect(response.status).toBe(401);
    }
    expect(h.runRoommateDaily).not.toHaveBeenCalled();
    expect(h.flushPostHog).not.toHaveBeenCalled();
  });

  it('runs with the bot api and the current time, awaits the flush, and answers counts only', async () => {
    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(RESULT);
    expect(h.runRoommateDaily).toHaveBeenCalledWith(h.getBot.mock.results[0].value.api, NOW);
    expect(h.flushPostHog).toHaveBeenCalledTimes(1);
    expect(h.calls).toEqual(['run', 'flushed']);
  });

  it('without a configured bot passes no api, so the run does housekeeping only', async () => {
    h.getBot.mockReturnValue(null);

    await GET(req());

    expect(h.runRoommateDaily).toHaveBeenCalledWith(null, NOW);
  });

  it('flushes the events sent before a failure too', async () => {
    h.runRoommateDaily.mockRejectedValueOnce(new Error('database down'));

    await expect(GET(req())).rejects.toThrow('database down');
    expect(h.flushPostHog).toHaveBeenCalledTimes(1);
  });

  it('has a 60 s limit', () => {
    expect(maxDuration).toBe(60);
  });
});

describe('vercel.json', () => {
  it('schedules the route at 08:00 and 09:00 UTC, so one run falls on 10:00 Warsaw all year', () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };

    const schedules = config.crons
      .filter((cron) => cron.path === '/api/cron/roommate-daily')
      .map((cron) => cron.schedule);

    expect(schedules.sort()).toEqual(['0 8 * * *', '0 9 * * *']);
  });
});
