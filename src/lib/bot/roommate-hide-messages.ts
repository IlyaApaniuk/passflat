import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { REPORT_REASONS, type ReportReason } from '@/lib/roommate/rules';

import { escapeHtml, webLink } from './format';
import type { CronSender, MessageJob } from './roommate-daily';
import { roommateLocale, rt } from './roommate-texts';
import type { BotLocale } from './texts';

/**
 * The messages of an automatic hide (spec 07 §Automatic hiding, §Statement of reasons; FR-32
 * criterion 4, FR-33; DSA Art. 16(5) – (6), Art. 17):
 *
 * - the statement of reasons to the hidden person, claimed on `statement_sent_at`;
 * - the notice to every reporter of the target that it was hidden by an automated decision, each
 *   claimed on that report's `reporter_notified_at`.
 *
 * The request whose report hid the profile sends both right after the hide (`sendHideMessages`,
 * called by `roommate-safety.ts`); the send-hour run retries whatever is unsent (`retryStatements`
 * and `retryHideNotices` in `MESSAGE_JOBS` of `roommate-daily.ts`), with the switch on or off. All
 * go through `createCronSender`: any failure other than a 403 releases the claim for that retry. A
 * 403 keeps a notice's claim but releases the statement's (`releaseWhenBlocked`), so a blocked
 * chat keeps `statement_sent_at` null and gets the statement once it writes to the bot again.
 *
 * A statement states the number of reports and their reason categories, never a reporter or any
 * other profile; a notice states the outcome only. This module imports only types from
 * `roommate-daily.ts` (which imports it) and nothing from `roommate-flow.ts`. Nothing here sends an
 * event or logs a chat id.
 */

/** Rows one job reads at most; the sender caps the run at `MAX_MESSAGES_PER_RUN` anyway. */
const DUE_ROWS_PER_RUN = 1000;

/** The button label of each reason, in `REPORT_REASONS` order: also the statement's categories. */
export const REPORT_REASON_LABEL = {
  money: 'btnReportMoney',
  fake: 'btnReportFake',
  offensive: 'btnReportOffensive',
  under_18: 'btnReportUnder18',
  other: 'btnReportOther',
} as const satisfies Record<ReportReason, string>;

const CHAT_SELECT = { chatId: true, blockedAt: true, locale: true } as const;

function quoted(locale: BotLocale, label: string): string {
  return locale === 'en' ? `'${label}'` : `«${label}»`;
}

/**
 * The statement of reasons (spec 07 §Statement of reasons), HTML: what is restricted; the number
 * of the reports the hide decided and their reason categories as the Report buttons name them, in
 * `REPORT_REASONS` order (left out when no report is left); that the decision was automated, with
 * its rule (`hidden_reason`) and the terms' moderation section; the redress. Never a reporter.
 */
export function statementText(
  locale: BotLocale,
  hiddenReason: string | null,
  reasons: readonly string[],
): string {
  const categories = REPORT_REASONS.filter((reason) => reasons.includes(reason)).map((reason) =>
    quoted(locale, escapeHtml(rt(locale, REPORT_REASON_LABEL[reason]))),
  );
  const termsUrl = escapeHtml(webLink('/terms#matching', locale, 'roommate'));
  const ground = hiddenReason === 'under_18' ? 'statementGroundUnder18' : 'statementGroundReports';
  return [
    rt(locale, 'statementRestriction'),
    ...(reasons.length > 0
      ? [
          rt(locale, 'statementFacts', {
            count: String(reasons.length),
            reasons: categories.join(', '),
          }),
        ]
      : []),
    rt(locale, ground, { termsUrl }),
    rt(locale, 'statementRedress'),
  ].join('\n\n');
}

/**
 * Sends the statement to every hidden profile matching `where` whose statement is unsent and
 * whose chat is not blocked, the earliest hides first. The facts are the target's reports with
 * `decision=hidden`, the ones the hide decided.
 */
async function sendStatements(
  sender: CronSender,
  now: Date,
  where: Prisma.RoommateProfileWhereInput,
): Promise<void> {
  const due = await prisma.roommateProfile.findMany({
    where: { ...where, status: 'hidden', statementSentAt: null, chat: { blockedAt: null } },
    select: { id: true, hiddenReason: true, chat: { select: CHAT_SELECT } },
    orderBy: { hiddenAt: 'asc' },
    take: DUE_ROWS_PER_RUN,
  });

  for (const row of due) {
    if (sender.stopped) return;
    const reports = await prisma.roommateReport.findMany({
      where: { targetProfileId: row.id, decision: 'hidden' },
      select: { reason: true },
    });
    const locale = roommateLocale(row.chat.locale);
    await sender.send({
      chatId: row.chat.chatId,
      blockedAt: row.chat.blockedAt,
      claim: async () => {
        const { count } = await prisma.roommateProfile.updateMany({
          where: { id: row.id, status: 'hidden', statementSentAt: null },
          data: { statementSentAt: now },
        });
        return count === 1;
      },
      release: async () => {
        await prisma.roommateProfile.updateMany({
          where: { id: row.id, statementSentAt: now },
          data: { statementSentAt: null },
        });
      },
      releaseWhenBlocked: true,
      text: statementText(
        locale,
        row.hiddenReason,
        reports.map((report) => report.reason),
      ),
      options: { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    });
  }
}

/**
 * Sends the hide notice for every report matching `where` that a hide decided (`decision=hidden`),
 * whose notice is unsent and whose reporter's profile and chat still exist (the chat not blocked),
 * the oldest reports first. A target the owner unhid has its reports `lifted`: no notice.
 */
async function sendHideNotices(
  sender: CronSender,
  now: Date,
  where: Prisma.RoommateReportWhereInput,
): Promise<void> {
  const due = await prisma.roommateReport.findMany({
    where: {
      ...where,
      decision: 'hidden',
      reporterNotifiedAt: null,
      reporterProfileId: { not: null },
      reporterProfile: { chat: { blockedAt: null } },
    },
    select: { id: true, reporterProfile: { select: { chat: { select: CHAT_SELECT } } } },
    orderBy: { createdAt: 'asc' },
    take: DUE_ROWS_PER_RUN,
  });

  for (const { id, reporterProfile } of due) {
    if (sender.stopped) return;
    if (!reporterProfile) continue; // never: the filter leaves out deleted reporters
    const { chat } = reporterProfile;
    await sender.send({
      chatId: chat.chatId,
      blockedAt: chat.blockedAt,
      claim: async () => {
        const { count } = await prisma.roommateReport.updateMany({
          where: { id, decision: 'hidden', reporterNotifiedAt: null },
          data: { reporterNotifiedAt: now },
        });
        return count === 1;
      },
      release: async () => {
        await prisma.roommateReport.updateMany({
          where: { id, reporterNotifiedAt: now },
          data: { reporterNotifiedAt: null },
        });
      },
      text: rt(roommateLocale(chat.locale), 'hideNotice'),
    });
  }
}

/**
 * Right after a hide (spec 07 §Automatic hiding): the statement to the hidden person, then the
 * notice to each reporter of `targetProfileId`, the reporter of this request included. Only the
 * request whose update hid the profile calls it; the claims make a second call send nothing.
 */
export async function sendHideMessages(
  sender: CronSender,
  targetProfileId: string,
  now: Date,
): Promise<void> {
  await sendStatements(sender, now, { id: targetProfileId });
  await sendHideNotices(sender, now, { targetProfileId });
}

/** The send-hour retry of unsent statements (spec 06 §Daily cron, first in priority). */
export const retryStatements: MessageJob = (sender, now) => sendStatements(sender, now, {});

/** The send-hour retry of unsent hide notices (spec 06 §Daily cron, third in priority). */
export const retryHideNotices: MessageJob = (sender, now) => sendHideNotices(sender, now, {});
