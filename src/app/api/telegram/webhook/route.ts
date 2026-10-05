import { webhookCallback } from 'grammy';
import { NextRequest, NextResponse } from 'next/server';

import { getBot } from '@/lib/bot/bot';

/**
 * Telegram webhook.
 *
 * Telegram authenticates itself with the secret token header set when the
 * webhook was registered (scripts/tg-webhook.ts), so the URL itself carries no
 * secret and this route needs no session.
 */

export const dynamic = 'force-dynamic';
// Contract reading runs after the response (next/server `after`) and counts
// toward this budget; it typically takes 6–10 s, up to a minute for long scans.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const bot = getBot();
  if (!bot) return NextResponse.json({ error: 'Bot is not configured.' }, { status: 503 });

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const handle = webhookCallback(bot, 'std/http');

  try {
    return await handle(request);
  } catch (error) {
    // Never 500 back at Telegram: it retries failed updates, and a retry loop on
    // a poisoned update would hammer the function. Swallow and log instead.
    console.error('[telegram/webhook] update failed', error);
    return new NextResponse(null, { status: 200 });
  }
}
