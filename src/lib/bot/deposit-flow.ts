import { GrammyError, InlineKeyboard, type Api, type Bot, type Context } from 'grammy';

import { prisma } from '@/lib/prisma';

import { track } from './analytics';
import {
  assessDeposit,
  buildDemandLetter,
  DEPOSIT_PROTOCOLS,
  DEPOSIT_REASONS,
  formatPolishDate,
  parseAmount,
  parseMoveOutDate,
  startOfUtcDay,
  type DepositProtocol,
  type DepositReason,
} from './deposit';
import { dt } from './deposit-texts';
import { escapeHtml, money, submitLink } from './format';
import { touchChat } from './store';
import type { BotLocale } from './texts';

/**
 * The deposit-recovery conversation: five questions, a verdict, a demand
 * letter, then follow-ups on fixed dates.
 *
 * State lives in DepositCase rather than in memory, because the webhook runs
 * on serverless functions — each answer may arrive at a different instance.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const LETTER_FOLLOW_UP_DAYS = 8; // 7 days the letter gives, plus one for delivery
const OPEN_STATUSES = ['intake', 'verdict', 'letter_sent'];

type Step = 'moved_out' | 'deposit' | 'returned' | 'reason' | 'protocol';

const KEYWORDS = /залог|застав|kaucj|депозит|deposit/i;

type CaseRow = NonNullable<Awaited<ReturnType<typeof prisma.depositCase.findFirst>>>;

async function findOpenCase(chatDbId: string) {
  return prisma.depositCase.findFirst({
    where: { chatId: chatDbId, status: { in: OPEN_STATUSES } },
    orderBy: { createdAt: 'desc' },
  });
}

/** A case id from a button, but only if it belongs to the chat pressing it. */
async function findOwnCase(chatDbId: string, caseId: string) {
  return prisma.depositCase.findFirst({ where: { id: caseId, chatId: chatDbId } });
}

function reasonKeyboard(locale: BotLocale): InlineKeyboard {
  const labels: Record<DepositReason, Parameters<typeof dt>[1]> = {
    wear: 'reasonWear',
    paint: 'reasonPaint',
    damage: 'reasonDamage',
    bills: 'reasonBills',
    silent: 'reasonSilent',
    other: 'reasonOther',
  };
  const keyboard = new InlineKeyboard();
  for (const reason of DEPOSIT_REASONS)
    keyboard.text(dt(locale, labels[reason]), `dep:r:${reason}`).row();
  return keyboard;
}

function protocolKeyboard(locale: BotLocale): InlineKeyboard {
  const labels: Record<DepositProtocol, Parameters<typeof dt>[1]> = {
    both: 'protocolBoth',
    one: 'protocolOne',
    none: 'protocolNone',
  };
  const keyboard = new InlineKeyboard();
  for (const protocol of DEPOSIT_PROTOCOLS) {
    keyboard.text(dt(locale, labels[protocol]), `dep:p:${protocol}`).row();
  }
  return keyboard;
}

function outcomeKeyboard(locale: BotLocale, caseId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(dt(locale, 'btnOutcomeFull'), `dep:o:${caseId}:full`)
    .row()
    .text(dt(locale, 'btnOutcomePartial'), `dep:o:${caseId}:partial`)
    .row()
    .text(dt(locale, 'btnOutcomeNone'), `dep:o:${caseId}:none`);
}

function factsOf(row: CaseRow) {
  if (
    !row.movedOutAt ||
    row.depositAmount == null ||
    row.returnedAmount == null ||
    !row.reason ||
    !row.protocol
  ) {
    return null;
  }
  return {
    movedOutAt: row.movedOutAt,
    deposit: row.depositAmount,
    returned: row.returnedAmount,
    reason: row.reason as DepositReason,
    protocol: row.protocol as DepositProtocol,
  };
}

const STRENGTH_TEXT = {
  wear: 'strongWear',
  paint: 'mediumPaint',
  silent: 'strongSilent',
  bills: 'lawfulBills',
  other: 'mediumOther',
} as const;

function renderVerdict(row: CaseRow, locale: BotLocale, today: Date): string {
  const facts = factsOf(row)!;
  const verdict = assessDeposit(facts, today);
  const deadline = formatPolishDate(verdict.deadline);

  const deadlineLine = verdict.overdue
    ? dt(locale, 'deadlinePassed', { deadline, days: String(verdict.days) })
    : verdict.days === 0
      ? dt(locale, 'deadlineToday')
      : dt(locale, 'deadlineAhead', { deadline, days: String(verdict.days) });

  const strengthLine =
    facts.reason === 'damage'
      ? dt(locale, verdict.strength === 'weak' ? 'weakDamage' : 'mediumDamage')
      : dt(locale, STRENGTH_TEXT[facts.reason]);

  // "Wear" is only as solid as the record of the flat's condition: without a
  // protocol the landlord can call the same marks damage.
  const caveat = facts.reason === 'wear' && facts.protocol === 'none';

  return [
    dt(locale, 'verdictHeader'),
    '',
    dt(locale, 'claimLine', { claim: money(verdict.claim) ?? '' }),
    deadlineLine,
    dt(locale, 'contractNote'),
    '',
    strengthLine,
    ...(caveat ? ['', dt(locale, 'noProtocolNote')] : []),
    '',
    dt(locale, 'disclaimer'),
  ].join('\n');
}

function verdictKeyboard(row: CaseRow, locale: BotLocale, today: Date): InlineKeyboard {
  const verdict = assessDeposit(factsOf(row)!, today);
  const keyboard = new InlineKeyboard().text(dt(locale, 'btnLetter'), `dep:letter:${row.id}`);
  if (!verdict.overdue && verdict.days > 0) {
    keyboard.row().text(dt(locale, 'btnRemindDeadline'), `dep:remind:${row.id}`);
  }
  return keyboard;
}

export async function startDepositFlow(ctx: Context, chatDbId: string, locale: BotLocale) {
  const chatId = ctx.chat!.id;

  // One open case per chat: starting again abandons the previous one rather
  // than leaving two conversations competing for the same text answers.
  await prisma.depositCase.updateMany({
    where: { chatId: chatDbId, status: { in: OPEN_STATUSES } },
    data: { status: 'abandoned', followUpAt: null },
  });
  await prisma.depositCase.create({ data: { chatId: chatDbId, step: 'moved_out' } });

  track(chatId, 'tg_deposit_flow_started');
  await ctx.reply(dt(locale, 'intro'), { parse_mode: 'HTML' });
  await ctx.reply(dt(locale, 'askMovedOut'), { parse_mode: 'HTML' });
}

/**
 * Typed answers to the intake questions. Returns true when the message was
 * one, so the caller does not also treat "4000" as an address.
 */
export async function handleDepositText(
  ctx: Context,
  chatDbId: string,
  locale: BotLocale,
  text: string,
): Promise<boolean> {
  const row = await findOpenCase(chatDbId);
  if (!row || row.status !== 'intake') return false;
  const step = row.step as Step | null;
  const today = new Date();

  if (step === 'moved_out') {
    const date = parseMoveOutDate(text, today);
    if (!date) {
      await ctx.reply(dt(locale, 'badDate'), { parse_mode: 'HTML' });
      return true;
    }
    await prisma.depositCase.update({
      where: { id: row.id },
      data: { movedOutAt: date, step: 'deposit' },
    });
    await ctx.reply(dt(locale, 'askDeposit'), { parse_mode: 'HTML' });
    return true;
  }

  if (step === 'deposit') {
    const amount = parseAmount(text);
    if (!amount) {
      await ctx.reply(dt(locale, 'badAmount'), { parse_mode: 'HTML' });
      return true;
    }
    await prisma.depositCase.update({
      where: { id: row.id },
      data: { depositAmount: amount, step: 'returned' },
    });
    await ctx.reply(dt(locale, 'askReturned'), {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text(dt(locale, 'btnReturnedNone'), 'dep:ret0'),
    });
    return true;
  }

  if (step === 'returned') {
    const amount = parseAmount(text);
    if (!amount) {
      await ctx.reply(dt(locale, 'badAmount'), { parse_mode: 'HTML' });
      return true;
    }
    await saveReturned(ctx, row, locale, amount);
    return true;
  }

  // Waiting on a button (reason / protocol): a typed message is not an answer,
  // so let it through to the usual address lookup.
  return false;
}

async function saveReturned(ctx: Context, row: CaseRow, locale: BotLocale, returned: number) {
  if (row.depositAmount != null && returned >= row.depositAmount) {
    await prisma.depositCase.update({
      where: { id: row.id },
      data: { returnedAmount: returned, status: 'resolved', outcome: 'full', step: null },
    });
    await ctx.reply(dt(locale, 'nothingOwed'));
    return;
  }
  await prisma.depositCase.update({
    where: { id: row.id },
    data: { returnedAmount: returned, step: 'reason' },
  });
  await ctx.reply(dt(locale, 'askReason'), {
    parse_mode: 'HTML',
    reply_markup: reasonKeyboard(locale),
  });
}

/** Offers the flow when a message mentions a deposit but is not an address. */
export async function maybeOfferDeposit(ctx: Context, locale: BotLocale, text: string) {
  if (!KEYWORDS.test(text) || /\d/.test(text)) return false;
  track(ctx.chat!.id, 'tg_deposit_offered');
  await ctx.reply(dt(locale, 'keywordOffer'), {
    reply_markup: new InlineKeyboard().text(dt(locale, 'btnStartFlow'), 'dep:start'),
  });
  return true;
}

export async function cancelDepositFlow(ctx: Context, chatDbId: string, locale: BotLocale) {
  const { count } = await prisma.depositCase.updateMany({
    where: { chatId: chatDbId, status: 'intake' },
    data: { status: 'abandoned' },
  });
  await ctx.reply(dt(locale, count ? 'cancelled' : 'nothingToCancel'));
}

function botLink(payload: string): string | null {
  const username = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  return username ? `https://t.me/${username}?start=${payload}` : null;
}

export function registerDepositFlow(bot: Bot) {
  const localeOf = async (ctx: Context) => {
    const chat = await touchChat({ chatId: ctx.chat!.id });
    return { chat, locale: chat.locale as BotLocale };
  };

  bot.callbackQuery('dep:start', async (ctx) => {
    const { chat, locale } = await localeOf(ctx);
    await ctx.answerCallbackQuery();
    await startDepositFlow(ctx, chat.id, locale);
  });

  bot.callbackQuery('dep:ret0', async (ctx) => {
    const { chat, locale } = await localeOf(ctx);
    await ctx.answerCallbackQuery();
    const row = await findOpenCase(chat.id);
    if (!row || row.step !== 'returned') return;
    await saveReturned(ctx, row, locale, 0);
  });

  bot.callbackQuery(/^dep:r:(wear|paint|damage|bills|silent|other)$/, async (ctx) => {
    const { chat, locale } = await localeOf(ctx);
    await ctx.answerCallbackQuery();
    const row = await findOpenCase(chat.id);
    if (!row || row.step !== 'reason') return;
    await prisma.depositCase.update({
      where: { id: row.id },
      data: { reason: ctx.match![1], step: 'protocol' },
    });
    await ctx.reply(dt(locale, 'askProtocol'), {
      parse_mode: 'HTML',
      reply_markup: protocolKeyboard(locale),
    });
  });

  bot.callbackQuery(/^dep:p:(both|one|none)$/, async (ctx) => {
    const { chat, locale } = await localeOf(ctx);
    await ctx.answerCallbackQuery();
    const row = await findOpenCase(chat.id);
    if (!row || row.step !== 'protocol') return;

    const updated = await prisma.depositCase.update({
      where: { id: row.id },
      data: { protocol: ctx.match![1], step: null, status: 'verdict' },
    });
    const today = new Date();
    const facts = factsOf(updated)!;
    const verdict = assessDeposit(facts, today);
    track(ctx.chat!.id, 'tg_deposit_verdict', {
      reason: facts.reason,
      protocol: facts.protocol,
      strength: verdict.strength,
      overdue: verdict.overdue,
      claim: verdict.claim,
    });

    await ctx.reply(renderVerdict(updated, locale, today), {
      parse_mode: 'HTML',
      reply_markup: verdictKeyboard(updated, locale, today),
    });
  });

  bot.callbackQuery(/^dep:letter:([0-9a-f-]{36})$/, async (ctx) => {
    const { chat, locale } = await localeOf(ctx);
    await ctx.answerCallbackQuery();
    const row = await findOwnCase(chat.id, ctx.match![1]);
    const facts = row ? factsOf(row) : null;
    if (!row || !facts) {
      await ctx.reply(dt(locale, 'caseNotFound'));
      return;
    }

    const today = new Date();
    const verdict = assessDeposit(facts, today);
    const extraKey = {
      wear: 'letterExtraWear',
      paint: 'letterExtraPaint',
      damage: 'letterExtraDamage',
      bills: 'letterExtraBills',
    } as const;
    const extra =
      facts.reason in extraKey ? dt(locale, extraKey[facts.reason as keyof typeof extraKey]) : '';

    track(ctx.chat!.id, 'tg_deposit_letter_generated', { reason: facts.reason });

    await ctx.reply(dt(locale, 'letterIntro'), { parse_mode: 'HTML' });
    // <pre> so a single tap copies the whole letter on mobile.
    await ctx.reply(`<pre>${escapeHtml(buildDemandLetter({ ...facts, today }))}</pre>`, {
      parse_mode: 'HTML',
    });
    await ctx.reply(dt(locale, 'letterHowTo', { claim: money(verdict.claim) ?? '', extra }), {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text(dt(locale, 'btnLetterSent'), `dep:sent:${row.id}`),
    });
  });

  bot.callbackQuery(/^dep:sent:([0-9a-f-]{36})$/, async (ctx) => {
    const { chat, locale } = await localeOf(ctx);
    await ctx.answerCallbackQuery();
    const row = await findOwnCase(chat.id, ctx.match![1]);
    if (!row) return;
    const now = new Date();
    await prisma.depositCase.update({
      where: { id: row.id },
      data: {
        status: 'letter_sent',
        letterAt: now,
        followUpAt: new Date(startOfUtcDay(now).getTime() + LETTER_FOLLOW_UP_DAYS * DAY_MS),
        followUpKind: 'letter',
      },
    });
    track(ctx.chat!.id, 'tg_deposit_letter_sent');
    await ctx.reply(dt(locale, 'letterSentAck'));
  });

  bot.callbackQuery(/^dep:remind:([0-9a-f-]{36})$/, async (ctx) => {
    const { chat, locale } = await localeOf(ctx);
    await ctx.answerCallbackQuery();
    const row = await findOwnCase(chat.id, ctx.match![1]);
    const facts = row ? factsOf(row) : null;
    if (!row || !facts) return;
    const { deadline } = assessDeposit(facts, new Date());
    await prisma.depositCase.update({
      where: { id: row.id },
      data: { followUpAt: deadline, followUpKind: 'deadline' },
    });
    track(ctx.chat!.id, 'tg_deposit_reminder_set');
    await ctx.reply(dt(locale, 'remindSetAck', { deadline: formatPolishDate(deadline) }));
  });

  bot.callbackQuery(/^dep:o:([0-9a-f-]{36}):(full|partial|none)$/, async (ctx) => {
    const { chat, locale } = await localeOf(ctx);
    await ctx.answerCallbackQuery();
    const row = await findOwnCase(chat.id, ctx.match![1]);
    if (!row) return;
    const outcome = ctx.match![2];
    track(ctx.chat!.id, 'tg_deposit_outcome', { outcome, after: row.followUpKind });

    if (outcome === 'full') {
      await prisma.depositCase.update({
        where: { id: row.id },
        data: { status: 'resolved', outcome, outcomeAt: new Date(), followUpAt: null },
      });
      const keyboard = new InlineKeyboard();
      const share = botLink('dep');
      if (share) {
        keyboard
          .url(dt(locale, 'btnShareBot'), `https://t.me/share/url?url=${encodeURIComponent(share)}`)
          .row();
      }
      keyboard.url(
        dt(locale, 'btnLeaveReport'),
        submitLink({ citySlug: 'warsaw', placeId: null }, locale),
      );
      await ctx.reply(dt(locale, 'outcomeFull'), { reply_markup: keyboard });
      return;
    }

    // Before the letter: the landlord simply ran out the clock, so the next
    // step is the letter itself.
    if (row.followUpKind === 'deadline') {
      await prisma.depositCase.update({
        where: { id: row.id },
        data: { status: 'verdict', followUpAt: null },
      });
      await ctx.reply(dt(locale, 'outcomeTimeForLetter'), {
        reply_markup: new InlineKeyboard().text(dt(locale, 'btnLetter'), `dep:letter:${row.id}`),
      });
      return;
    }

    await prisma.depositCase.update({
      where: { id: row.id },
      data: { status: 'resolved', outcome, outcomeAt: new Date(), followUpAt: null },
    });
    await ctx.reply(dt(locale, 'outcomeLetterFailed'), {
      reply_markup: new InlineKeyboard().text(dt(locale, 'btnWantLawyer'), `dep:lawyer:${row.id}`),
    });
  });

  bot.callbackQuery(/^dep:lawyer:([0-9a-f-]{36})$/, async (ctx) => {
    const { chat, locale } = await localeOf(ctx);
    await ctx.answerCallbackQuery();
    const row = await findOwnCase(chat.id, ctx.match![1]);
    if (!row) return;
    await prisma.depositCase.update({ where: { id: row.id }, data: { wantsLawyer: true } });
    track(ctx.chat!.id, 'tg_lawyer_interest', {
      claim: row.depositAmount != null ? row.depositAmount - (row.returnedAmount ?? 0) : null,
    });
    await ctx.reply(dt(locale, 'lawyerAck'));
  });
}

/**
 * Sends every follow-up that has come due. Run daily by the cron route; the
 * bot writes first only on dates the person agreed to (the landlord's deadline,
 * or a week after their letter).
 */
export async function sendDueFollowUps(api: Api, now = new Date()) {
  const due = await prisma.depositCase.findMany({
    where: {
      followUpAt: { lte: now },
      status: { in: ['verdict', 'letter_sent'] },
      chat: { blockedAt: null },
    },
    include: { chat: { select: { chatId: true, locale: true } } },
    take: 200,
  });

  let sent = 0;
  let blocked = 0;
  for (const row of due) {
    const locale = row.chat.locale as BotLocale;
    const text = dt(
      locale,
      row.followUpKind === 'deadline' ? 'followUpDeadline' : 'followUpLetter',
    );
    try {
      await api.sendMessage(Number(row.chat.chatId), text, {
        parse_mode: 'HTML',
        reply_markup: outcomeKeyboard(locale, row.id),
      });
      sent += 1;
    } catch (error) {
      // 403 = the person blocked the bot; stop writing to them for good.
      if (error instanceof GrammyError && error.error_code === 403) {
        blocked += 1;
        await prisma.telegramChat.updateMany({
          where: { chatId: row.chat.chatId },
          data: { blockedAt: now },
        });
      } else {
        console.error('[bot/deposit] follow-up failed', error);
        continue; // leave it due; tomorrow's run retries
      }
    }
    // Clear the date but keep the kind: the outcome buttons read it.
    await prisma.depositCase.update({ where: { id: row.id }, data: { followUpAt: null } });
  }

  return { due: due.length, sent, blocked };
}
