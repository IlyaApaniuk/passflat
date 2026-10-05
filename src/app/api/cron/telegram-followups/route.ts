import { NextRequest, NextResponse } from 'next/server';

import { requireCronAuth } from '@/lib/admin-auth';
import { getBot } from '@/lib/bot/bot';
import { clearStaleLetterParties, sendDueFollowUps } from '@/lib/bot/deposit-flow';

/**
 * Daily: the bot's deposit follow-ups — "today is your landlord's deadline"
 * and "a week since your letter, did you get the money back?". The answers are
 * how the deposit-outcome statistic accrues. Also clears names and addresses
 * read from contracts whose letter was never generated. Bearer-authenticated like the
 * other crons; scheduled in vercel.json.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const clearedParties = await clearStaleLetterParties();

  const bot = getBot();
  if (!bot) return NextResponse.json({ skipped: 'bot not configured', clearedParties });

  const result = await sendDueFollowUps(bot.api);
  return NextResponse.json({ ...result, clearedParties });
}
