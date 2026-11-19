import type { RoommateProfile } from '@prisma/client';
import { InlineKeyboard, type Bot, type Context } from 'grammy';

import { REPORT_REASONS, type ReportReason } from '@/lib/roommate/rules';
import {
  findReportableProfile,
  findRoommateProfile,
  hideAfterReport,
  storeReport,
  telegramChatIdOf,
  type ReportableProfile,
} from '@/lib/roommate/store';

import { track } from './analytics';
import { createCronSender } from './roommate-daily';
import { matchGroups, rememberUsername, roommateCallback } from './roommate-flow';
import { REPORT_REASON_LABEL, sendHideMessages } from './roommate-hide-messages';
import { rt } from './roommate-texts';
import type { TouchedChat } from './store';
import type { BotLocale } from './texts';

/**
 * Moderation of roommate matching in the bot (spec 07 §Report – §Appeals; spec 06 §Module
 * layout): for now "Report" (`rm:r:<id>`, under every card and every reveal) and its reasons
 * (`rm:rr:<reason>:<id>`, §Report, FR-31), and the automatic hide a stored report may trigger
 * (§Automatic hiding, FR-32, FR-34) with its statement of reasons and the reporters' notices
 * (§Statement of reasons, FR-33; `roommate-hide-messages.ts`). The switch is not read: moderation
 * keeps working with it off (§Switch), so a Report under a card or a reveal sent before a
 * switch-off still works.
 *
 * Who may report whom is `findReportableProfile` (a reaction to the target, a reveal of it, or a
 * card it may show now), never the callback id alone. No event carries a reporter, a target, a
 * username or an id; `tg_roommate_reported` and `tg_roommate_profile_hidden` carry the reason only.
 */

const REPORT_TAP = /^rm:r:([^:]+)$/;
const REPORT_REASON_TAP = new RegExp(`^rm:rr:(${REPORT_REASONS.join('|')}):([^:]+)$`);

/** The five reasons, one per row, each carrying the target's profile id (`rm:rr:<reason>:<id>`). */
function reasonsKeyboard(targetId: string, locale: BotLocale): InlineKeyboard {
  return InlineKeyboard.from(
    REPORT_REASONS.map((reason) => [
      InlineKeyboard.text(rt(locale, REPORT_REASON_LABEL[reason]), `rm:rr:${reason}:${targetId}`),
    ]),
  );
}

/**
 * The target a Report button names when this chat may report it (spec 07 §Report): the chat's
 * profile is active or expired and `findReportableProfile` accepts the id. Otherwise "this profile
 * is no longer available" and null. The username is stored like every roommate handler's.
 */
async function reportable(
  ctx: Context,
  chat: TouchedChat,
  targetId: string,
  locale: BotLocale,
  now: Date,
): Promise<(ReportableProfile & { reporter: RoommateProfile }) | null> {
  const reporter = await findRoommateProfile(chat.id);
  if (reporter) await rememberUsername(ctx, reporter);
  const found =
    reporter && (reporter.status === 'active' || reporter.status === 'expired')
      ? await findReportableProfile(reporter, targetId, now)
      : null;
  if (!reporter || !found) {
    await ctx.reply(rt(locale, 'browseUnavailable'));
    return null;
  }
  return { ...found, reporter };
}

/**
 * `rm:r:<id>` ("Report"): the five reasons for a profile this person may report; "already
 * reported" when they did; otherwise "this profile is no longer available". Nothing is stored.
 */
const handleReportTap = roommateCallback(async (ctx, chat, locale) => {
  const [targetId] = matchGroups(ctx);
  const found = await reportable(ctx, chat, targetId, locale, new Date());
  if (!found) return;
  if (found.alreadyReported) {
    await ctx.reply(rt(locale, 'reportAlready'));
    return;
  }
  await ctx.reply(rt(locale, 'reportAsk'), {
    reply_markup: reasonsKeyboard(found.target.id, locale),
  });
});

/**
 * `rm:rr:<reason>:<id>` (a reason under "Report", spec 07 §Report, FR-31): one report per reporter
 * and target (`storeReport`, unique). A stored report sends `tg_roommate_reported` with `reason`,
 * runs the automatic hide (`hideIfDue`) and replies with the receipt; from then on the pair is out
 * of each other's counts, cards and compatibility (`notReportedWith`). When this report hid the
 * target, the statement of reasons and the reporters' notices follow the receipt, so this reporter
 * reads the receipt's rule before the notice that it was applied; through the cron's sender, so a
 * failed send is retried by the send-hour run. A repeat (or the second of two overlapping taps) →
 * "already reported" and nothing else; a target already hidden → the receipt of a hidden profile
 * only, nothing stored and no event; a target deleted since the check → "this profile is no longer
 * available".
 */
const handleReportReason = roommateCallback(async (ctx, chat, locale) => {
  const [reason, targetId] = matchGroups(ctx) as [ReportReason, string];
  const now = new Date();
  const found = await reportable(ctx, chat, targetId, locale, now);
  if (!found) return;
  if (found.alreadyReported) {
    await ctx.reply(rt(locale, 'reportAlready'));
    return;
  }
  if (found.target.status === 'hidden') {
    await ctx.reply(rt(locale, 'reportReceiptHidden'));
    return;
  }
  const stored = await storeReport(found.reporter.id, found.target.id, reason, now);
  if (stored !== 'stored') {
    await ctx.reply(rt(locale, stored === 'already' ? 'reportAlready' : 'browseUnavailable'));
    return;
  }
  track(ctx.chat!.id, 'tg_roommate_reported', { reason });
  const hid = await hideIfDue(found.target, reason, now);
  await ctx.reply(rt(locale, 'reportReceipt'));
  if (hid) {
    await sendHideMessages(
      createCronSender(ctx.api, { now, startedAt: Date.now() }),
      found.target.id,
      now,
    );
  }
});

/**
 * §Automatic hiding after a stored report (FR-32, FR-34): `hideAfterReport` hides the target, bans
 * its chat and decides its reports; only the request that hid it sends `tg_roommate_profile_hidden`
 * with the reason, as the hidden person (`tg_<their chatId>`), never naming a reporter, and returns
 * true (that request then sends the hide's messages). From then on the profile is out of every
 * count, card and push (`activeProfilesWhere`), and `/mate` and `mate` links give the FR-14 reply
 * (`openRoommate`).
 */
async function hideIfDue(
  target: RoommateProfile,
  reason: ReportReason,
  now: Date,
): Promise<boolean> {
  const hidden = await hideAfterReport(target, reason, now);
  if (!hidden) return false;
  const hiddenChatId = await telegramChatIdOf(target.chatId);
  if (hiddenChatId !== null) track(hiddenChatId, 'tg_roommate_profile_hidden', { reason: hidden });
  return true;
}

export function registerRoommateSafety(bot: Bot): void {
  bot.callbackQuery(REPORT_TAP, handleReportTap);
  bot.callbackQuery(REPORT_REASON_TAP, handleReportReason);
}
