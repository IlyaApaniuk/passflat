import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  after: vi.fn(),
  getBot: vi.fn(),
  handle: vi.fn(),
  webhookCallback: vi.fn(),
  flushPostHog: vi.fn(),
}));

// `after` needs a live request scope; here it only records the callback.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: h.after,
}));
vi.mock('grammy', () => ({ webhookCallback: h.webhookCallback }));
vi.mock('@/lib/bot/bot', () => ({ getBot: h.getBot }));
vi.mock('@/lib/posthog-server', () => ({ flushPostHog: h.flushPostHog }));

import { POST } from './route';

const SECRET = 'test-secret';

function update(secret: string | null = SECRET) {
  return new NextRequest('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: secret ? { 'x-telegram-bot-api-secret-token': secret } : {},
    body: JSON.stringify({ update_id: 1 }),
  });
}

/** The callbacks the route registered with `after()`, run as Next runs them after the response. */
async function runAfterCallbacks() {
  for (const [callback] of h.after.mock.calls) await (callback as () => unknown)();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', SECRET);
  h.getBot.mockReturnValue({});
  h.webhookCallback.mockReturnValue(h.handle);
  h.handle.mockResolvedValue(new Response(null, { status: 200 }));
  h.flushPostHog.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/telegram/webhook', () => {
  it('flushes PostHog in after() once the update is handled', async () => {
    const response = await POST(update());

    expect(response.status).toBe(200);
    expect(h.handle).toHaveBeenCalledTimes(1);
    expect(h.after).toHaveBeenCalledTimes(1);
    expect(h.after).toHaveBeenCalledWith(h.flushPostHog);
    // Nothing is flushed before the response; the after() callback does it.
    expect(h.flushPostHog).not.toHaveBeenCalled();

    await runAfterCallbacks();
    expect(h.flushPostHog).toHaveBeenCalledTimes(1);
  });

  it('still flushes, and answers 200, when handling the update throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.handle.mockRejectedValue(new Error('poisoned update'));

    const response = await POST(update());

    expect(response.status).toBe(200);
    expect(h.after).toHaveBeenCalledWith(h.flushPostHog);
    await runAfterCallbacks();
    expect(h.flushPostHog).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('rejects a wrong secret without handling or flushing', async () => {
    const response = await POST(update('wrong'));

    expect(response.status).toBe(403);
    expect(h.handle).not.toHaveBeenCalled();
    expect(h.after).not.toHaveBeenCalled();
  });

  it('answers 503 without a configured bot', async () => {
    h.getBot.mockReturnValue(null);

    const response = await POST(update());

    expect(response.status).toBe(503);
    expect(h.after).not.toHaveBeenCalled();
  });
});
