import type { RoommateProfile } from '@prisma/client';
import { InlineKeyboard, type Bot, type Context } from 'grammy';

import { countBand, INTEREST_DAILY_LIMIT } from '@/lib/roommate/rules';
import {
  countRecentInterests,
  findCompatible,
  findRoommateProfile,
  findVisibleProfile,
  formMutualMatch,
  loadMatchedPair,
  loadRoommateEntry,
  pendingRevealPartners,
  storeInterest,
  storeSkip,
  telegramChatIdOf,
} from '@/lib/roommate/store';
import { isMatchingEnabled } from '@/lib/roommate/switch';

import { track } from './analytics';
import { documentLink, escapeHtml, webLink } from './format';
import { createCronSender } from './roommate-daily';
import {
  cardFieldLines,
  cityDistricts,
  matchGroups,
  openRoommate,
  pushStateLine,
  pushToggleButton,
  rememberUsername,
  roommateCallback,
  type District,
} from './roommate-flow';
import { NEXT_STEPS, USERNAME_DONE, revealPair, type NextStepChoice } from './roommate-reveal';
import { rt, type RoommateLocale } from './roommate-texts';
import { ROOMMATE_ENTRY_SOURCE } from './start-payload';
import type { TouchedChat } from './store';
import type { BotLocale } from './texts';

/**
 * Stage 2 of roommate matching in the bot (spec 07; spec 06 §Module layout): for now the cards
 * (§Cards, FR-25), one at a time with "Interested" (`rm:i:<id>`, §Interest and mutual match,
 * FR-26, FR-28), "Skip" (`rm:x:<id>`) and "Report" (`rm:r:<id>`, T093), the username prompt before
 * them (§Usernames), the reveal of a formed pair (§Reveal, `roommate-reveal.ts`) with its next
 * steps (`rm:ns:<choice>`, FR-30), and "matching is paused" while the switch is off (§Switch).
 * Every card handler reads the switch per tap; the next steps under a reveal already sent keep
 * working with the switch off (reveals already sent stay).
 *
 * No card ever names gender, "live with", a name, a username or an id, and no event carries one
 * (nor a partner id or a match id); the callback ids are checked against the visibility rule
 * (`findVisibleProfile`), never trusted.
 */

/** `via` of `tg_roommate_cards_viewed` by the letter of `rm:show:<via>` (spec 07 §Cards, §Events). */
const CARDS_VIA = { c: 'card', o: 'open_message', p: 'push', n: 'next' } as const;
type CardsVia = (typeof CARDS_VIA)[keyof typeof CARDS_VIA];

/**
 * "Show people": `c` from the own card, `o` from the one-time message, `p` from the daily push,
 * `n` from "That's everyone". The bare `rm:show` (spec 06's short form) counts as the card's.
 */
const SHOW_TAP = /^rm:show(?::([conp]))?$/;
const INTEREST_TAP = /^rm:i:([^:]+)$/;
const SKIP_TAP = /^rm:x:([^:]+)$/;
const NEXT_STEP_TAP = /^rm:ns:(agreement|address|cost)$/;

/**
 * A card of another person's profile (spec 07 §Cards, `renderRoommateCard`, pure): districts (or
 * "any district"), the budget band, the move-in month, languages, the short text (escaped) and
 * the answered house rules, through the own card's `cardFieldLines` without its private lines.
 * Never gender, "live with", a name, a username or any identifier.
 */
export function renderRoommateCard(
  profile: RoommateProfile,
  districts: readonly District[],
  locale: RoommateLocale,
): string {
  return [
    rt(locale, 'browseCardHeader'),
    cardFieldLines(profile, districts, locale, 'browseAbout').join('\n'),
  ].join('\n\n');
}

/** "Interested" and "Skip" in one row, "Report" below; each carries the card's profile id. */
function cardKeyboard(profileId: string, locale: BotLocale): InlineKeyboard {
  return InlineKeyboard.from([
    [
      InlineKeyboard.text(rt(locale, 'btnInterested'), `rm:i:${profileId}`),
      InlineKeyboard.text(rt(locale, 'btnCardSkip'), `rm:x:${profileId}`),
    ],
    [InlineKeyboard.text(rt(locale, 'btnReport'), `rm:r:${profileId}`)],
  ]);
}

/** True while the profile is active by the counts' definition: `status=active`, not past `expires_at`. */
function isLive(profile: RoommateProfile, now: Date): boolean {
  return profile.status === 'active' && profile.expiresAt !== null && profile.expiresAt > now;
}

/**
 * The person's own profile when they may browse now (spec 07 §Cards). Otherwise the reply that
 * takes the cards' place, and null: "matching is paused" with the switch off (§Switch); "renew to
 * keep browsing" with Renew for an expired profile (also one the daily cron has not marked yet);
 * and for no profile "create a profile first" before the intake starts (reciprocity), where a
 * banned chat, a hidden profile, a draft or open deposit questions get what `/mate` gives them.
 */
async function browsingProfile(
  ctx: Context,
  chat: TouchedChat,
  locale: BotLocale,
  now: Date,
): Promise<RoommateProfile | null> {
  if (!isMatchingEnabled()) {
    await ctx.reply(rt(locale, 'matchingPaused'));
    return null;
  }
  const state = await loadRoommateEntry(chat.id);
  const profile = state?.roommateProfile ?? null;
  const banned = Boolean(state?.roommateBannedAt);
  if (profile && !banned && (profile.status === 'active' || profile.status === 'expired')) {
    await rememberUsername(ctx, profile);
    if (isLive(profile, now)) return profile;
    await ctx.reply(rt(locale, 'browseRenew'), {
      reply_markup: new InlineKeyboard().text(rt(locale, 'btnRenew'), 'rm:c:renew'),
    });
    return null;
  }
  if (!profile && !banned) await ctx.reply(rt(locale, 'browseCreateFirst'));
  await openRoommate(ctx, chat, locale, { source: ROOMMATE_ENTRY_SOURCE.botMenu });
  return null;
}

/**
 * The username prompt before the cards (spec 07 §Usernames, context `browse`): no card until the
 * person has a Telegram username, which a mutual match reveals. Each prompt sends
 * `tg_roommate_username_prompted`.
 */
async function promptUsername(ctx: Context, locale: BotLocale): Promise<void> {
  track(ctx.chat!.id, 'tg_roommate_username_prompted', { context: 'browse' });
  await ctx.reply(rt(locale, 'usernamePromptBrowse'), {
    reply_markup: new InlineKeyboard().text(rt(locale, 'btnDone'), USERNAME_DONE),
  });
}

/**
 * The next card for `viewer`: the first profile of `findCompatible` (newest first), or "That's
 * everyone for now" with the daily-message state, "Show people" again (`rm:show:n`) and the
 * daily-message toggle. Without a Telegram username the prompt replaces the card. A "Show people"
 * tap passes its `via`, and only then one `tg_roommate_cards_viewed` goes out with the number of
 * compatible profiles at that moment as `results_band` (also when the username prompt follows).
 */
async function showNextCard(
  ctx: Context,
  viewer: RoommateProfile,
  locale: BotLocale,
  now: Date,
  via?: CardsVia,
): Promise<void> {
  const candidates = await findCompatible(viewer, now);
  if (via) {
    track(ctx.chat!.id, 'tg_roommate_cards_viewed', {
      results_band: countBand(candidates.length),
      via,
    });
  }
  if (!ctx.from?.username) {
    await promptUsername(ctx, locale);
    return;
  }
  const [next] = candidates;
  if (!next) {
    await ctx.reply(`${rt(locale, 'browseNoneLeft')}\n\n${pushStateLine(viewer, locale)}`, {
      reply_markup: InlineKeyboard.from([
        [InlineKeyboard.text(rt(locale, 'btnShowPeople'), 'rm:show:n')],
        [pushToggleButton(viewer, locale)],
      ]),
    });
    return;
  }
  const districts = next.districtSlugs.length > 0 ? await cityDistricts() : [];
  await ctx.reply(renderRoommateCard(next, districts, locale), {
    parse_mode: 'HTML',
    reply_markup: cardKeyboard(next.id, locale),
  });
}

/**
 * The profile a card button names, when it is still visible to `viewer` (`findVisibleProfile`).
 * Otherwise "this profile is no longer available", the next card, and null.
 */
async function cardTarget(
  ctx: Context,
  viewer: RoommateProfile,
  targetId: string,
  locale: BotLocale,
  now: Date,
): Promise<RoommateProfile | null> {
  const target = await findVisibleProfile(viewer, targetId, now);
  if (target) return target;
  await ctx.reply(rt(locale, 'browseUnavailable'));
  await showNextCard(ctx, viewer, locale, now);
  return null;
}

/** `rm:show:<via>` ("Show people"): one `tg_roommate_cards_viewed` and the first card. */
const handleShowTap = roommateCallback(async (ctx, chat, locale) => {
  const [letter] = matchGroups(ctx);
  const now = new Date();
  const viewer = await browsingProfile(ctx, chat, locale, now);
  if (!viewer) return;
  await showNextCard(
    ctx,
    viewer,
    locale,
    now,
    CARDS_VIA[(letter ?? 'c') as keyof typeof CARDS_VIA],
  );
});

/**
 * `rm:x:<id>` ("Skip"): stores one `skip` reaction for a profile still visible to this person, so
 * it is never shown to them again, then the next card. No event.
 */
const handleSkipTap = roommateCallback(async (ctx, chat, locale) => {
  const [targetId] = matchGroups(ctx);
  const now = new Date();
  const viewer = await browsingProfile(ctx, chat, locale, now);
  if (!viewer) return;
  const target = await cardTarget(ctx, viewer, targetId, locale, now);
  if (!target) return;
  await storeSkip(viewer.id, target.id);
  await showNextCard(ctx, viewer, locale, now);
});

/**
 * The reveal sender of one tap: the cron's claim-send-release rules (a 403 marks the chat
 * blocked, any other error releases the claim for the send-hour retry), with this tap's clock.
 */
function tapSender(ctx: Context, now: Date) {
  return createCronSender(ctx.api, { now, startedAt: Date.now() });
}

/**
 * `rm:i:<id>` ("Interested", spec 07 §Interest and mutual match): for a profile still visible to
 * this person, under the daily limit (`INTEREST_DAILY_LIMIT` `interest` reactions in 24 hours;
 * at the limit "that's the limit for today", nothing stored, no event), one `interest` reaction
 * and `tg_roommate_interest_sent`. Then `formMutualMatch`: the request that formed the pair sends
 * `tg_roommate_matched` with `role=completer` for this person and `role=waiting` for the other,
 * then reveals the pair (§Reveal: the waiting person first). The reveal, or the reveal's username
 * prompt, takes the next card's place for this person; when it sends this person nothing (the
 * other chat blocked, the other's username missing, a failed send) the next card follows. No
 * interest back yet sends nothing to the other person, and the next card follows. A reaction
 * already stored (a double tap) → "already answered" and the next card; the profile deleted since
 * the check → "no longer available" and the next card.
 */
const handleInterestTap = roommateCallback(async (ctx, chat, locale) => {
  const [targetId] = matchGroups(ctx);
  const now = new Date();
  const viewer = await browsingProfile(ctx, chat, locale, now);
  if (!viewer) return;
  const target = await cardTarget(ctx, viewer, targetId, locale, now);
  if (!target) return;
  if ((await countRecentInterests(viewer.id, now)) >= INTEREST_DAILY_LIMIT) {
    await ctx.reply(rt(locale, 'interestLimit', { limit: String(INTEREST_DAILY_LIMIT) }));
    return;
  }
  const stored = await storeInterest(viewer.id, target.id, now);
  if (stored !== 'stored') {
    await ctx.reply(rt(locale, stored === 'already' ? 'interestAlready' : 'browseUnavailable'));
    await showNextCard(ctx, viewer, locale, now);
    return;
  }
  track(ctx.chat!.id, 'tg_roommate_interest_sent');
  if (await formMutualMatch(viewer.id, target.id, now)) {
    track(ctx.chat!.id, 'tg_roommate_matched', { role: 'completer' });
    const waitingChatId = await telegramChatIdOf(target.chatId);
    if (waitingChatId !== null) track(waitingChatId, 'tg_roommate_matched', { role: 'waiting' });
    const pair = await loadMatchedPair(viewer.id, target.id);
    if (pair) {
      const messaged = await revealPair(tapSender(ctx, now), pair, now, { justFormed: true });
      if (messaged.has(viewer.id)) return;
    }
  }
  await showNextCard(ctx, viewer, locale, now);
});

/**
 * `rm:u:done` (Done under a username prompt): the tap's own update carries the current username,
 * which `browsingProfile` stores. With formed pairs of this profile still waiting on a reveal
 * (context `reveal`): no username → the reveal's prompt again; one found sends
 * `tg_roommate_username_set` and retries every waiting pair (`revealPair`, the waiting person of
 * each first); when none of them sends this person a message the browsing continues with the next
 * card. Without waiting pairs (context `browse`): one found sends `tg_roommate_username_set` and
 * the next card; none found gets the browse prompt again.
 */
const handleUsernameDone = roommateCallback(async (ctx, chat, locale) => {
  const now = new Date();
  const viewer = await browsingProfile(ctx, chat, locale, now);
  if (!viewer) return;
  const partners = await pendingRevealPartners(viewer.id);
  if (partners.length === 0) {
    if (ctx.from?.username) track(ctx.chat!.id, 'tg_roommate_username_set', { context: 'browse' });
    await showNextCard(ctx, viewer, locale, now);
    return;
  }
  if (!ctx.from?.username) {
    track(ctx.chat!.id, 'tg_roommate_username_prompted', { context: 'reveal' });
    await ctx.reply(rt(locale, 'usernamePromptReveal'), {
      reply_markup: new InlineKeyboard().text(rt(locale, 'btnDone'), USERNAME_DONE),
    });
    return;
  }
  track(ctx.chat!.id, 'tg_roommate_username_set', { context: 'reveal' });
  const sender = tapSender(ctx, now);
  let messaged = false;
  for (const partnerId of partners) {
    const pair = await loadMatchedPair(viewer.id, partnerId);
    if (pair && (await revealPair(sender, pair, now)).has(viewer.id)) messaged = true;
  }
  if (!messaged) await showNextCard(ctx, viewer, locale, now);
});

/** The reply of each next step under a reveal (FR-30): links carry the bot's UTM, no chat id. */
function nextStepText(choice: NextStepChoice, locale: BotLocale): string {
  if (choice === 'agreement') {
    return rt(locale, 'nextStepAgreement', {
      url: escapeHtml(documentLink(`umowa-wspollokatorska-${locale}.pdf`, 'roommate')),
      originalUrl: escapeHtml(documentLink('umowa-wspollokatorska.pdf', 'roommate')),
    });
  }
  if (choice === 'address') return rt(locale, 'nextStepAddress');
  return rt(locale, 'nextStepCost', {
    url: escapeHtml(webLink('/warsaw/costs', locale, 'roommate')),
  });
}

/**
 * `rm:ns:<agreement|address|cost>` (the next steps under a reveal, spec 07 §Reveal, FR-30): one
 * `tg_roommate_next_step` with `step` and the reply: the roommate agreement template in the
 * person's language with the Polish original next to it, the bot's address prompt (a typed
 * address is then looked up as usual), or the costs page. The username is stored like every
 * roommate handler's; the switch is not read (the reveal was already sent).
 */
const handleNextStepTap = roommateCallback(async (ctx, chat, locale) => {
  const [choice] = matchGroups(ctx) as [NextStepChoice];
  const profile = await findRoommateProfile(chat.id);
  if (profile) await rememberUsername(ctx, profile);
  track(ctx.chat!.id, 'tg_roommate_next_step', { step: NEXT_STEPS[choice] });
  await ctx.reply(nextStepText(choice, locale), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
});

export function registerRoommateMatching(bot: Bot): void {
  bot.callbackQuery(SHOW_TAP, handleShowTap);
  bot.callbackQuery(INTEREST_TAP, handleInterestTap);
  bot.callbackQuery(SKIP_TAP, handleSkipTap);
  bot.callbackQuery(USERNAME_DONE, handleUsernameDone);
  bot.callbackQuery(NEXT_STEP_TAP, handleNextStepTap);
}
