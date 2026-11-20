import { NextRequest, NextResponse } from 'next/server';

import { requireCronAuth } from '@/lib/admin-auth';
import { getBot } from '@/lib/bot/bot';
import { runRoommateClose } from '@/lib/bot/roommate-close';
import { flushPostHog } from '@/lib/posthog-server';
import { isMatchingEnabled } from '@/lib/roommate/switch';

/** The closing messages share the daily cron's 45 s send budget (spec 06 §Closing route). */
export const maxDuration = 60;

/** Only the literal JSON body `{ "confirm": true }` confirms; anything else is a 400. */
async function isConfirmed(request: NextRequest): Promise<boolean> {
  try {
    const body: unknown = await request.json();
    return (
      typeof body === 'object' && body !== null && (body as { confirm?: unknown }).confirm === true
    );
  } catch {
    return false; // no body, or not JSON
  }
}

/**
 * The manual closing route of roommate matching (spec 06 §Closing route, FR-20, D64): the owner
 * calls it by hand when matching will not open; it is never scheduled (not in vercel.json). Every
 * profile gets the closing message and is deleted (`runRoommateClose`).
 *
 * Bearer-authenticated like the crons (401); without the JSON body `{ "confirm": true }` → 400;
 * with the matching switch on → 409 (closing applies only while matching is off); without a
 * configured bot → 503, because deleting without the message would break the opt-in's promise.
 * In each of these cases nothing changes. A run cut short says how many profiles remain; call it
 * again until `remaining` is 0. The response is counts only.
 */
export async function POST(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  if (!(await isConfirmed(request))) {
    return NextResponse.json({ error: 'Send the JSON body { "confirm": true }' }, { status: 400 });
  }
  if (isMatchingEnabled()) {
    return NextResponse.json(
      { error: 'Matching is on; the closing route runs only while it is off' },
      { status: 409 },
    );
  }
  const bot = getBot();
  if (!bot) {
    return NextResponse.json({ error: 'The bot is not configured' }, { status: 503 });
  }

  try {
    const result = await runRoommateClose(bot.api, new Date());
    return NextResponse.json(result);
  } finally {
    // The run's bot events are delivered before the function ends.
    await flushPostHog();
  }
}
