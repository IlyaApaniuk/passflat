import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getBot: vi.fn(),
  clearStaleLetterParties: vi.fn(),
  sendDueFollowUps: vi.fn(),
  flushPostHog: vi.fn(),
  calls: [] as string[],
}));

// Tests never reach Telegram: the bot and its follow-up sender are mocked.
vi.mock('@/lib/bot/bot', () => ({ getBot: h.getBot }));
vi.mock('@/lib/bot/deposit-flow', () => ({
  clearStaleLetterParties: h.clearStaleLetterParties,
  sendDueFollowUps: h.sendDueFollowUps,
}));
vi.mock('@/lib/posthog-server', () => ({ flushPostHog: h.flushPostHog }));

import { GET } from './route';

const SECRET = 'cron-test-secret';

function req(auth: string | null = `Bearer ${SECRET}`): NextRequest {
  return new NextRequest('http://localhost/api/cron/telegram-followups', {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', SECRET);
  h.calls.length = 0;
  const api = { sendMessage: vi.fn() };
  h.getBot.mockReturnValue({ api });
  h.clearStaleLetterParties.mockResolvedValue(0);
  h.sendDueFollowUps.mockImplementation(async () => {
    h.calls.push('send');
    return { sent: 2, failed: 0 };
  });
  // The flush resolves a tick later, so a missing await would show in `calls`.
  h.flushPostHog.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    h.calls.push('flushed');
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/cron/telegram-followups', () => {
  it('awaits the PostHog flush after sending the follow-ups, before answering', async () => {
    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 2, failed: 0, clearedParties: 0 });
    expect(h.sendDueFollowUps).toHaveBeenCalledWith(h.getBot.mock.results[0].value.api);
    expect(h.flushPostHog).toHaveBeenCalledTimes(1);
    expect(h.calls).toEqual(['send', 'flushed']);
  });

  it('refuses an unauthenticated call without sending or flushing', async () => {
    const response = await GET(req(null));

    expect(response.status).toBe(401);
    expect(h.sendDueFollowUps).not.toHaveBeenCalled();
    expect(h.flushPostHog).not.toHaveBeenCalled();
  });

  it('skips the follow-ups without a configured bot', async () => {
    h.getBot.mockReturnValue(null);

    const response = await GET(req());

    expect(await response.json()).toEqual({ skipped: 'bot not configured', clearedParties: 0 });
    expect(h.sendDueFollowUps).not.toHaveBeenCalled();
  });
});
