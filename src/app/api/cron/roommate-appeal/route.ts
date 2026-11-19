import { NextRequest, NextResponse } from 'next/server';

import { requireCronAuth } from '@/lib/admin-auth';
import { getBot } from '@/lib/bot/bot';
import {
  APPEAL_DECISIONS,
  runRoommateAppeal,
  type AppealDecision,
} from '@/lib/bot/roommate-appeal-decision';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BODY_HINT =
  'Send the JSON body { "profileId": "<uuid>", "decision": "lifted" | "upheld", "confirm": true }';

/** The decision of a body with `confirm: true`, a profile id and a known decision; else null. */
async function parseDecision(
  request: NextRequest,
): Promise<{ profileId: string; decision: AppealDecision } | null> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    const { profileId, decision, confirm } = body as Record<string, unknown>;
    if (confirm !== true) return null;
    if (typeof profileId !== 'string' || !UUID_SHAPE.test(profileId)) return null;
    if (!APPEAL_DECISIONS.some((known) => known === decision)) return null;
    return { profileId, decision: decision as AppealDecision };
  } catch {
    return null; // no body, or not JSON
  }
}

/**
 * The owner's decision on an appeal of roommate matching (spec 07 §Appeals and the owner's review,
 * D73, DSA Art. 20): called by hand per decision, never scheduled (not in vercel.json).
 *
 * Bearer-authenticated like the crons (401); without the JSON body
 * `{ "profileId": "<uuid>", "decision": "lifted" | "upheld", "confirm": true }` → 400; without a
 * configured bot → 503, because a decision must reach the person. In each of these cases nothing
 * changes. Otherwise `runRoommateAppeal` applies the decision to a hidden profile and sends its one
 * message; an unknown or visible profile changes and sends nothing. The response is counts only.
 */
export async function POST(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const parsed = await parseDecision(request);
  if (!parsed) return NextResponse.json({ error: BODY_HINT }, { status: 400 });

  const bot = getBot();
  if (!bot) {
    return NextResponse.json({ error: 'The bot is not configured' }, { status: 503 });
  }

  return NextResponse.json(await runRoommateAppeal(bot.api, parsed, new Date()));
}
