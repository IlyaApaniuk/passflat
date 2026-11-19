import type { Api } from 'grammy';

import { prisma } from '@/lib/prisma';
import { liftHide, releaseUpheldHide, upholdHide } from '@/lib/roommate/store';

import { escapeHtml, webLink } from './format';
import { SYSTEM_CLOCK, createCronSender, type CronClock, type CronSender } from './roommate-daily';
import { roommateLocale, rt } from './roommate-texts';
import type { BotLocale } from './texts';

/**
 * The owner's decision on an appeal (spec 07 §Appeals and the owner's review, D73, PRD 3 Q-16;
 * DSA Art. 20): `POST /api/cron/roommate-appeal` (owner-triggered, never scheduled) delegates here
 * with one hidden profile and `lifted` or `upheld`. The bot is the only channel to the person.
 *
 * - `lifted`: `liftHide` unhides the profile, lifts its reports and clears the chat's ban in one
 *   transaction (`README.md` §Owner review, step 2), then `appealLifted` goes out. The
 *   unhide is the claim: a repeat call finds the profile visible and sends nothing. It is applied
 *   for a blocked chat too (`claimWhenBlocked`, the message is skipped), and a failed send is not
 *   retried: the profile is no longer hidden.
 * - `upheld`: nothing about the hide changes; `upholdHide` marks the reports the hide decided as
 *   reviewed by a person (`automated=false`, the claim), then the reasoned "the hide stays" goes
 *   out. A blocked chat is skipped before the claim; a 403 or any other failure gives the claim
 *   back (`releaseUpheldHide`), so the owner can call again.
 *
 * An unknown profile, or one that is not hidden, changes and sends nothing. The one message goes
 * through `createCronSender` (a 403 marks the chat blocked), in the chat's language. No event; the
 * switch is not read; nothing here logs a chat id, a text or an error object. The result is counts
 * only.
 */

export const APPEAL_DECISIONS = ['lifted', 'upheld'] as const;
export type AppealDecision = (typeof APPEAL_DECISIONS)[number];

type RoommateAppealResult = {
  /** 1 when this call applied the decision and kept it (lifted: the unhide; upheld: the claim). */
  decided: number;
  messages: ReturnType<CronSender['counts']>;
};

/**
 * The decision message, HTML. `lifted`: the profile is restored and the chat's restriction is
 * removed. `upheld`: the decision stands, why (the hide's rule by `hidden_reason`, as the statement
 * of reasons names it, with the terms' moderation section), and the redress left after the appeal.
 */
export function appealDecisionText(
  locale: BotLocale,
  decision: AppealDecision,
  hiddenReason: string | null,
): string {
  if (decision === 'lifted') return rt(locale, 'appealLifted');
  const termsUrl = escapeHtml(webLink('/terms#matching', locale, 'roommate'));
  const ground =
    hiddenReason === 'under_18' ? 'appealUpheldGroundUnder18' : 'appealUpheldGroundReports';
  return [
    rt(locale, 'appealUpheld'),
    rt(locale, ground, { termsUrl }),
    rt(locale, 'appealUpheldRedress'),
  ].join('\n\n');
}

export async function runRoommateAppeal(
  api: Api,
  { profileId, decision }: { profileId: string; decision: AppealDecision },
  now: Date,
  { clock = SYSTEM_CLOCK }: { clock?: CronClock } = {},
): Promise<RoommateAppealResult> {
  const sender = createCronSender(api, { now, startedAt: clock.now(), clock });
  const profile = await prisma.roommateProfile.findUnique({
    where: { id: profileId },
    select: {
      status: true,
      hiddenReason: true,
      chat: { select: { chatId: true, blockedAt: true, locale: true } },
    },
  });
  let decided = 0;

  if (profile?.status === 'hidden') {
    const { chat } = profile;
    const message = {
      chatId: chat.chatId,
      blockedAt: chat.blockedAt,
      text: appealDecisionText(roommateLocale(chat.locale), decision, profile.hiddenReason),
      options: { parse_mode: 'HTML', link_preview_options: { is_disabled: true } } as const,
    };
    await sender.send(
      decision === 'lifted'
        ? {
            ...message,
            claimWhenBlocked: true,
            claim: async () => {
              const lifted = await liftHide(profileId, now);
              if (lifted) decided = 1;
              return lifted;
            },
            // The unhide stands: nothing to give back, and a repeat call finds nothing to lift.
            release: async () => {},
          }
        : {
            ...message,
            releaseWhenBlocked: true,
            claim: async () => {
              const upheld = await upholdHide(profileId);
              if (upheld) decided = 1;
              return upheld;
            },
            release: async () => {
              decided = 0;
              await releaseUpheldHide(profileId);
            },
          },
    );
  }

  return { decided, messages: sender.counts() };
}
