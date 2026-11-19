import { NextRequest, NextResponse } from 'next/server';

import { requireCronAuth } from '@/lib/admin-auth';
import { getBot } from '@/lib/bot/bot';
import { runRoommateDaily } from '@/lib/bot/roommate-daily';
import { flushPostHog } from '@/lib/posthog-server';

/** Housekeeping plus the send-hour messages fit in one minute (spec 06 §Daily cron, Assumption). */
export const maxDuration = 60;

/**
 * Roommate matching's daily cron (spec 06 §Daily cron): the housekeeping of profiles and reports
 * every run, and the roommate messages only in the run at 10:xx Warsaw. Scheduled in vercel.json
 * at 08:00 and 09:00 UTC, because 10:00 Warsaw is 09:00 UTC in winter and 08:00 UTC in summer
 * (D68). Bearer-authenticated like the other crons; the response is counts only.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await runRoommateDaily(getBot()?.api ?? null, new Date());
    return NextResponse.json(result);
  } finally {
    // The run's bot events are delivered before the function ends.
    await flushPostHog();
  }
}
