import { InlineKeyboard, type Api } from 'grammy';

import {
  claimReveal,
  dueRevealPairs,
  loadMatchedPair,
  releaseReveal,
  setRoommateUsername,
  type RevealPair,
  type RevealSide,
} from '@/lib/roommate/store';

import { track } from './analytics';
import type { CronMessage, CronSender, MessageJob } from './roommate-daily';
import { roommateLocale, rt, type RoommateLocale } from './roommate-texts';

/**
 * The reveal of a formed pair (spec 07 §Reveal, FR-26 criteria 3 – 4, FR-30): "It's mutual.
 * Write to @<username>." with the safety lines (PRD 3 §8), the next steps and a Report button for
 * the partner, to the waiting person first and then to the completer, each claimed on that
 * person's `revealed_at`. Both the tap that forms the pair (`roommate-matching.ts`) and the
 * send-hour retry (`retryPendingReveals`, in `MESSAGE_JOBS` of `roommate-daily.ts`) send through
 * `createCronSender`, so a 403 marks the chat blocked and keeps the claim, and any other error
 * releases it for the retry.
 *
 * This module imports only types from `roommate-daily.ts` (which imports it) and nothing from
 * `roommate-flow.ts`. No username, profile id or chat id goes into an event or a log line.
 */

/** Done under a username prompt; `roommate-matching.ts` handles it (browse or reveal). */
export const USERNAME_DONE = 'rm:u:done';

/**
 * The next steps under a reveal (FR-30, **Assumption**: callback buttons, because a URL button
 * sends no callback and could not be counted), by callback suffix, with the `step` of
 * `tg_roommate_next_step`.
 */
export const NEXT_STEPS = {
  agreement: 'agreement',
  address: 'address_check',
  cost: 'cost',
} as const;

export type NextStepChoice = keyof typeof NEXT_STEPS;

/** Pairs one send-hour run reads at most (each sends up to two messages; the sender caps the run). */
const DUE_PAIRS_PER_RUN = 500;

/** The reveal's text: the match line with the partner's username, then the safety lines. */
export function revealText(locale: RoommateLocale, username: string): string {
  return `${rt(locale, 'revealMatch', { username })}\n\n${rt(locale, 'revealSafety')}`;
}

/** The three next steps (`rm:ns:<choice>`), then "Report" for the partner (`rm:r:<profileId>`). */
export function revealKeyboard(locale: RoommateLocale, partnerProfileId: string): InlineKeyboard {
  return InlineKeyboard.from([
    [InlineKeyboard.text(rt(locale, 'btnNextAgreement'), 'rm:ns:agreement')],
    [InlineKeyboard.text(rt(locale, 'btnNextAddress'), 'rm:ns:address')],
    [InlineKeyboard.text(rt(locale, 'btnNextCost'), 'rm:ns:cost')],
    [InlineKeyboard.text(rt(locale, 'btnReport'), `rm:r:${partnerProfileId}`)],
  ]);
}

/**
 * True while this side may get or be named in a reveal: an active profile not past `expires_at`
 * in a chat neither blocked nor banned (the counts' definition of active).
 */
function isRevealable({ profile, chat }: RevealSide, now: Date): boolean {
  return (
    profile.status === 'active' &&
    profile.expiresAt !== null &&
    profile.expiresAt > now &&
    chat.blockedAt === null &&
    chat.roommateBannedAt === null
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

/**
 * The username of the person about to be revealed, read from Telegram just before the send
 * (spec 07 §Usernames: a stored name can be stale, and a released one can belong to a stranger by
 * now), stored when it differs. A failed `getChat` uses the stored value.
 */
async function freshUsername(api: Api, side: RevealSide): Promise<string | null> {
  const stored = side.profile.tgUsername;
  let fresh: string | null;
  try {
    const chat = await api.getChat(Number(side.chat.chatId));
    fresh = ('username' in chat ? chat.username : undefined) ?? null;
  } catch (error) {
    // The message only: a GrammyError's payload holds the chat id.
    console.error('[bot/roommate] getChat before a reveal failed', errorMessage(error));
    return stored;
  }
  if (fresh !== stored) await setRoommateUsername(side.profile.id, fresh);
  return fresh;
}

/** "You have a mutual match. Set a Telegram username, then tap Done" (context `reveal`). */
function usernamePrompt(side: RevealSide): CronMessage {
  const locale = roommateLocale(side.chat.locale);
  const chatId = Number(side.chat.chatId);
  return {
    chatId: side.chat.chatId,
    blockedAt: side.chat.blockedAt,
    // Nothing to claim: the prompt is sent when the missing username is found.
    claim: async () => true,
    release: async () => {},
    text: rt(locale, 'usernamePromptReveal'),
    options: { reply_markup: new InlineKeyboard().text(rt(locale, 'btnDone'), USERNAME_DONE) },
    onSent: () => track(chatId, 'tg_roommate_username_prompted', { context: 'reveal' }),
  };
}

/** The reveal to `to`, naming `partner` by `username`, claimed on `to`'s reaction. */
function revealMessage(
  to: RevealSide,
  partner: RevealSide,
  username: string,
  now: Date,
): CronMessage {
  const locale = roommateLocale(to.chat.locale);
  const chatId = Number(to.chat.chatId);
  return {
    chatId: to.chat.chatId,
    blockedAt: to.chat.blockedAt,
    claim: () => claimReveal(to.reaction.id, now),
    release: () => releaseReveal(to.reaction.id, now),
    text: revealText(locale, username),
    options: { reply_markup: revealKeyboard(locale, partner.profile.id) },
    onSent: () => track(chatId, 'tg_roommate_contact_revealed'),
  };
}

/**
 * Reveals a formed pair (spec 07 §Reveal) and returns the ids of the profiles that got a message
 * from it (a reveal or a username prompt).
 *
 * - Either profile no longer active, or either chat blocked or banned → nothing (the pair stays
 *   matched; the retry picks it up once both are active again).
 * - Each message still due names the other person, whose username is refreshed first
 *   (`freshUsername`). One missing → that person gets the username prompt and both reveals wait
 *   for Done. A person whose stored username was already missing is not prompted again by a retry
 *   (`justFormed` false): they were prompted when it was found missing, and Done retries.
 * - Otherwise the waiting person first, then the completer, each claimed on their own reaction's
 *   `revealed_at`, with `tg_roommate_contact_revealed` per delivered message. When the first is not
 *   delivered the second waits: a 403 blocked that chat (no reveal at all), another error released
 *   the claim for the retry, a claim already taken means another request is revealing the pair.
 */
export async function revealPair(
  sender: CronSender,
  pair: RevealPair,
  now: Date,
  { justFormed = false }: { justFormed?: boolean } = {},
): Promise<Set<string>> {
  const messaged = new Set<string>();
  const { waiting, completer } = pair;
  if (!isRevealable(waiting, now) || !isRevealable(completer, now)) return messaged;

  const due = (
    [
      [waiting, completer],
      [completer, waiting],
    ] as const
  ).filter(([to]) => to.reaction.revealedAt === null);
  if (due.length === 0) return messaged;

  const usernames = new Map<string, string | null>();
  for (const [, partner] of due) {
    usernames.set(partner.profile.id, await freshUsername(sender.api, partner));
  }

  const missing = due.map(([, partner]) => partner).filter((s) => !usernames.get(s.profile.id));
  if (missing.length > 0) {
    for (const side of [waiting, completer]) {
      if (!missing.includes(side)) continue;
      if (!justFormed && side.profile.tgUsername === null) continue;
      if ((await sender.send(usernamePrompt(side))) === 'sent') messaged.add(side.profile.id);
    }
    return messaged;
  }

  for (const [to, partner] of due) {
    const username = usernames.get(partner.profile.id)!;
    if ((await sender.send(revealMessage(to, partner, username, now))) !== 'sent') break;
    messaged.add(to.profile.id);
  }
  return messaged;
}

/**
 * The send-hour retry of waiting reveals (spec 07 §Reveal; spec 06 §Daily cron, second in
 * priority, switch on or off): every pair matched with a reveal not claimed yet, both profiles
 * active, both chats unblocked and both usernames stored (`dueRevealPairs`) gets the missing
 * reveal(s) in the same order and with the same claims (`revealPair`). Through the run's sender,
 * so it shares the rate, the cap and the time budget; `sender.api` reads the usernames.
 */
export const retryPendingReveals: MessageJob = async (sender, now) => {
  for (const [x, y] of await dueRevealPairs(now, DUE_PAIRS_PER_RUN)) {
    if (sender.stopped) return;
    const pair = await loadMatchedPair(x, y);
    if (pair) await revealPair(sender, pair, now);
  }
};
