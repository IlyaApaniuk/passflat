import type { Api } from 'grammy';

import { prisma } from '@/lib/prisma';

import { track } from './analytics';
import { SYSTEM_CLOCK, createCronSender, type CronClock, type CronSender } from './roommate-daily';
import { roommateLocale, rt } from './roommate-texts';

/**
 * The manual closing run (spec 06 §Closing route, FR-20, D64): when the owner decides that
 * matching will not open, `POST /api/cron/roommate-close` (owner-triggered, never scheduled)
 * delegates here. It backs the opt-in's closing sentence (`optInClosing`): every profile gets one
 * message and is deleted.
 *
 * Drafts are deleted silently. Every other profile (active, expired, hidden) is deleted first, by
 * its id (the claim: only the run whose delete lands goes on), then one
 * `tg_roommate_profile_deleted` with `reason=closed`, then `closingMessage` in the chat's language
 * when its chat is not blocked. Messages go through the daily cron's `createCronSender` (25 a
 * second, the per-run cap, the time budget, a 403 marks the chat blocked, a 429 stops the run);
 * once it stops, the rest wait for the next run. The row is gone before the send, so a failed
 * send is not retried. Reactions cascade; report references are nulled by their foreign keys, and
 * the reports themselves are deleted only when no profile row is left. Ban markers
 * (`telegram_chats.roommate_banned_at`) stay (D55).
 *
 * Nothing here logs a chat id, a username, a text or an error object; the result is counts only.
 */

type RoommateCloseResult = {
  draftsDeleted: number;
  /** Non-draft profiles whose delete landed in this run (each with its event). */
  profilesDeleted: number;
  messages: ReturnType<CronSender['counts']>;
  /** Profile rows of any status left after the run; above 0 means "run it again". */
  remaining: number;
  /** All `roommate_reports` rows, deleted only once `remaining` is 0. */
  reportsDeleted: number;
};

export async function runRoommateClose(
  api: Api,
  now: Date,
  { clock = SYSTEM_CLOCK }: { clock?: CronClock } = {},
): Promise<RoommateCloseResult> {
  const sender = createCronSender(api, { now, startedAt: clock.now(), clock });

  const drafts = await prisma.roommateProfile.deleteMany({ where: { status: 'draft' } });

  const profiles = await prisma.roommateProfile.findMany({
    where: { status: { not: 'draft' } },
    select: { id: true, chat: { select: { chatId: true, blockedAt: true, locale: true } } },
    orderBy: { createdAt: 'asc' },
  });

  let profilesDeleted = 0;
  for (const { id, chat } of profiles) {
    if (sender.stopped) break;
    await sender.send({
      chatId: chat.chatId,
      blockedAt: chat.blockedAt,
      claimWhenBlocked: true,
      claim: async () => {
        const { count } = await prisma.roommateProfile.deleteMany({ where: { id } });
        if (count !== 1) return false; // another run or the person's own delete got there first
        profilesDeleted += 1;
        track(Number(chat.chatId), 'tg_roommate_profile_deleted', { reason: 'closed' });
        return true;
      },
      // The row is already gone: nothing to give back, and nothing left to retry.
      release: async () => {},
      text: rt(roommateLocale(chat.locale), 'closingMessage'),
      options: { parse_mode: 'HTML' },
    });
  }

  const remaining = await prisma.roommateProfile.count();
  const reports = remaining === 0 ? await prisma.roommateReport.deleteMany({}) : { count: 0 };

  return {
    draftsDeleted: drafts.count,
    profilesDeleted,
    messages: sender.counts(),
    remaining,
    reportsDeleted: reports.count,
  };
}
