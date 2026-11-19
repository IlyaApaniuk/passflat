import type { RoommateProfile } from '@prisma/client';
import {
  GrammyError,
  InlineKeyboard,
  type Bot,
  type CallbackQueryContext,
  type CommandContext,
  type Context,
} from 'grammy';

import { MAX_DISTRICTS, reduceDistrictPick, type DistrictPick } from '@/lib/roommate/rules';
import {
  clearEditStep,
  createDraft,
  deleteDraft,
  findRoommateProfile,
  isStepOpen,
  loadRoommateEntry,
  setDistrictPick,
  setRoommateUsername,
} from '@/lib/roommate/store';

import { track } from './analytics';
import { hasOpenIntake } from './deposit-flow';
import { matchDistrict } from './districts';
import { escapeHtml, webLink } from './format';
import { getCity } from './lookup';
import { rt } from './roommate-texts';
import { ROOMMATE_ENTRY_SOURCE, type RoommateEntrySource } from './start-payload';
import { touchChat, type TouchedChat } from './store';
import { normalizeLocale, type BotLocale } from './texts';

/**
 * The roommate conversation in the bot (spec 06): the entry and its routing for
 * now; the intake steps, the own card, edit, delete, renew, the counts reply and
 * the opt-in are added here by their tasks.
 *
 * State lives in `roommate_profiles` (`status`, `step`), never in memory, because
 * the webhook runs on serverless functions. Nothing here logs: a profile holds
 * personal data (spec 06 §Boundaries). Every value from data or from the person
 * passes through `escapeHtml` before an HTML reply.
 */

/** How the person came in: a `mate` link's source and detail, or the bot menu. */
export type RoommateEntry = { source: RoommateEntrySource; detail?: string };

type District = { slug: string; nameKey: string };

/** Telegram's limit on callback data. */
const MAX_CALLBACK_BYTES = 64;

/** The FR-14 reply's button; its handler is the delete flow (spec 06 §Delete). */
const DELETE_CALLBACK = 'rm:c:del';

/**
 * Stores `ctx.from.username` (or null) on the profile when it differs from the
 * stored one (spec 07 §Usernames): the one helper every roommate handler calls.
 * The username is never logged and never put into an event.
 */
async function rememberUsername(
  ctx: Context,
  profile: Pick<RoommateProfile, 'id' | 'tgUsername'>,
): Promise<void> {
  const username = ctx.from?.username ?? null;
  if (profile.tgUsername === username) return;
  await setRoommateUsername(profile.id, username);
}

/** Telegram refuses an in-place edit that changes nothing; for a toggle that is not an error. */
function isMessageNotModified(error: unknown): boolean {
  return (
    error instanceof GrammyError &&
    error.error_code === 400 &&
    error.description.includes('message is not modified')
  );
}

/**
 * Wraps every `rm:` callback handler: resolves the chat and its locale, answers
 * the callback query (with the handler's toast, e.g. "up to 3 districts", when it
 * returns one) and ignores "message is not modified" from an in-place edit.
 */
function roommateCallback(
  handler: (
    ctx: CallbackQueryContext<Context>,
    chat: TouchedChat,
    locale: BotLocale,
  ) => Promise<string | void>,
) {
  return async (ctx: CallbackQueryContext<Context>): Promise<void> => {
    const chat = await touchChat({ chatId: ctx.chat!.id });
    let toast: string | void = undefined;
    try {
      toast = await handler(ctx, chat, chat.locale as BotLocale);
    } catch (error) {
      if (!isMessageNotModified(error)) {
        await ctx.answerCallbackQuery().catch(() => {});
        throw error;
      }
    }
    await ctx.answerCallbackQuery(toast ? { text: toast } : undefined);
  };
}

/** The checker city's districts by their Polish name, the order of the step's buttons. */
async function cityDistricts(): Promise<District[]> {
  const city = await getCity();
  return [...(city?.districts ?? [])].sort((a, b) => a.nameKey.localeCompare(b.nameKey, 'pl'));
}

/**
 * The districts step's buttons: two districts per row, each carrying its target
 * state (`rm:d:<slug>:1` to pick, `:0` to unpick) and ✓ when picked, then "Any
 * district" (✓ when chosen) and "Done". District names are the Polish `nameKey`
 * in every locale.
 */
function districtsKeyboard(
  districts: District[],
  pick: DistrictPick,
  locale: BotLocale,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const buttons = districts
    .map((district) => {
      const picked = pick.districtSlugs.includes(district.slug);
      return {
        label: picked ? rt(locale, 'btnPicked', { name: district.nameKey }) : district.nameKey,
        data: `rm:d:${district.slug}:${picked ? 0 : 1}`,
      };
    })
    .filter((button) => Buffer.byteLength(button.data, 'utf8') <= MAX_CALLBACK_BYTES);

  buttons.forEach((button, index) => {
    keyboard.text(button.label, button.data);
    if (index % 2 === 1) keyboard.row();
  });
  if (buttons.length % 2 === 1) keyboard.row();

  const any = rt(locale, 'btnAnyDistrict');
  return keyboard
    .text(pick.anyDistrict ? rt(locale, 'btnPicked', { name: any }) : any, 'rm:d:any')
    .row()
    .text(rt(locale, 'btnDone'), 'rm:d:done');
}

async function sendDistrictsStep(
  ctx: Context,
  pick: DistrictPick,
  locale: BotLocale,
  districts: District[],
): Promise<void> {
  await ctx.reply(rt(locale, 'askDistricts', { max: String(MAX_DISTRICTS) }), {
    parse_mode: 'HTML',
    reply_markup: districtsKeyboard(districts, pick, locale),
  });
}

/** The question of the profile's open step, sent again (a draft reopened, a stale answer). */
async function sendStep(ctx: Context, profile: RoommateProfile, locale: BotLocale): Promise<void> {
  switch (profile.step) {
    case 'districts':
      await sendDistrictsStep(ctx, profile, locale, await cityDistricts());
      return;
    default:
      // The later steps (T071 – T075) add their questions here.
      await ctx.reply(rt(locale, 'tapButton'));
  }
}

/** "This step is done", then the step the profile is at now, if one is open. */
async function resendCurrentStep(ctx: Context, chatDbId: string, locale: BotLocale) {
  await ctx.reply(rt(locale, 'stepDone'));
  const profile = await findRoommateProfile(chatDbId);
  if (profile && isStepOpen(profile)) await sendStep(ctx, profile, locale);
}

/**
 * The own card (spec 06 §Save and the own card), shown only to its owner. T074
 * renders every chosen field, the hide date and the card's buttons.
 */
async function sendOwnCard(ctx: Context, _profile: RoommateProfile, locale: BotLocale) {
  await ctx.reply(rt(locale, 'cardHeader'), { parse_mode: 'HTML' });
}

/**
 * FR-14: the chat cannot create a matching profile. A chat that still has its
 * (hidden) profile can delete it at once (D49); the ban marker and the reports
 * stay (D55).
 */
async function replyRefused(ctx: Context, locale: BotLocale, hasProfile: boolean) {
  await ctx.reply(
    rt(locale, 'banned'),
    hasProfile
      ? {
          reply_markup: new InlineKeyboard().text(
            rt(locale, 'btnDeleteMyProfile'),
            DELETE_CALLBACK,
          ),
        }
      : undefined,
  );
}

/**
 * Every way into the roommate flow (`/mate`, the start button `rm:start`, a
 * `mate` deep link) opens here, deciding in the order of spec 06 §Entry and
 * routing: 1 banned, 2 active or expired, 3 hidden, 4 draft, 5 an open deposit
 * intake, 6 a new draft. Only a new draft sends `tg_roommate_flow_started`.
 */
export async function openRoommate(
  ctx: Context,
  chat: TouchedChat,
  locale: BotLocale,
  entry: RoommateEntry,
): Promise<void> {
  const state = await loadRoommateEntry(chat.id);
  const profile = state?.roommateProfile ?? null;

  // 1. Banned: the FR-14 reply and nothing else, no event.
  if (state?.roommateBannedAt) {
    await replyRefused(ctx, locale, profile != null);
    return;
  }

  if (profile) {
    // 2. A saved profile: its card, no second start.
    if (profile.status === 'active' || profile.status === 'expired') {
      await rememberUsername(ctx, profile);
      await sendOwnCard(ctx, profile, locale);
      return;
    }
    // 3. Hidden without a ban marker (cannot happen after spec 07 §Automatic hiding): as rule 1.
    if (profile.status === 'hidden') {
      await replyRefused(ctx, locale, true);
      return;
    }
    // 4. A draft: its current step again; it keeps its first `entry_source`.
    await rememberUsername(ctx, profile);
    await sendStep(ctx, profile, locale);
    return;
  }

  // 5. One open intake per chat: the deposit questions come first.
  if (await hasOpenIntake(chat.id)) {
    await ctx.reply(rt(locale, 'depositQuestionsOpen'));
    return;
  }

  // 6. A new draft.
  const draft = await createDraft(chat.id, entry.source, ctx.from?.username ?? null);
  if (!draft) {
    // Another update (a double tap) created the profile a moment ago: no second start.
    const existing = await findRoommateProfile(chat.id);
    if (existing && isStepOpen(existing)) await sendStep(ctx, existing, locale);
    return;
  }

  track(
    ctx.chat!.id,
    'tg_roommate_flow_started',
    entry.detail
      ? { entry_source: entry.source, entry_detail: entry.detail }
      : { entry_source: entry.source },
  );
  const privacyUrl = escapeHtml(webLink('/privacy#roommate-matching', locale, 'roommate'));
  await ctx.reply(rt(locale, 'intro', { privacyUrl }), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
  await sendStep(ctx, draft, locale);
}

/**
 * A typed district name at the districts step, toggled like a tap. False when
 * it names no district of the checker city, so the text goes on to the address
 * lookup.
 */
async function districtsText(
  ctx: Context,
  profile: RoommateProfile,
  locale: BotLocale,
  text: string,
): Promise<boolean> {
  const districts = await cityDistricts();
  const slug = matchDistrict(text, districts);
  if (!slug) return false;

  const result = reduceDistrictPick(profile, {
    kind: 'district',
    slug,
    on: !profile.districtSlugs.includes(slug),
  });
  if (!result.ok) {
    await ctx.reply(rt(locale, 'districtLimit', { max: String(MAX_DISTRICTS) }));
    return true;
  }
  if (!(await setDistrictPick(profile.id, profile.step!, result.pick))) {
    await resendCurrentStep(ctx, profile.chatId, locale);
    return true;
  }
  await sendDistrictsStep(ctx, result.pick, locale, districts);
  return true;
}

/**
 * The steps that take typed text, each returning false for text it cannot use.
 * The budget number (T071), the short text (T073) and the edit steps (T075)
 * join them.
 */
const TEXT_STEPS: Record<
  string,
  | ((ctx: Context, profile: RoommateProfile, locale: BotLocale, text: string) => Promise<boolean>)
  | undefined
> = {
  districts: districtsText,
};

/**
 * Typed text while a roommate step is open, asked before anything else reads the
 * text: `used` when the open step took it (it never reaches the deposit flow, the
 * district check or the address lookup); `passed` when the step is button-only or
 * cannot use this text (the caller answers it as usual and adds the "/cancel
 * leaves the roommate questions" line; the step stays open); `none` without an
 * open step.
 */
export async function handleRoommateText(
  ctx: Context,
  chatDbId: string,
  locale: BotLocale,
  text: string,
): Promise<'none' | 'used' | 'passed'> {
  const profile = await findRoommateProfile(chatDbId);
  if (!profile || !isStepOpen(profile)) return 'none';
  await rememberUsername(ctx, profile);

  const handler = TEXT_STEPS[profile.step!];
  if (handler && (await handler(ctx, profile, locale, text))) return 'used';
  return 'passed';
}

/**
 * `/cancel` with a roommate draft (deleted) or an edit step (cleared; the saved
 * profile stays). False when no roommate step is open, so the caller runs the
 * deposit behaviour instead.
 */
export async function cancelRoommate(
  ctx: Context,
  chatDbId: string,
  locale: BotLocale,
): Promise<boolean> {
  const profile = await findRoommateProfile(chatDbId);
  if (!profile || !isStepOpen(profile)) return false;

  if (profile.status === 'draft') {
    if (!(await deleteDraft(profile.id))) return false;
    await ctx.reply(rt(locale, 'cancelledDraft'));
    return true;
  }
  if (!(await clearEditStep(profile.id, profile.step!))) return false;
  await ctx.reply(rt(locale, 'cancelledEdit'));
  return true;
}

/** `/mate`: the bot menu's way in. Exported so tests can call it with a fake context. */
export async function handleMate(ctx: CommandContext<Context>): Promise<void> {
  const chat = await touchChat({
    chatId: ctx.chat.id,
    locale: normalizeLocale(ctx.from?.language_code),
  });
  await openRoommate(ctx, chat, chat.locale as BotLocale, {
    source: ROOMMATE_ENTRY_SOURCE.botMenu,
  });
}

/** The start button "Find someone to rent with" (`rm:start`) under `start` and `startAfterPayload`. */
export const handleRoommateStartTap = roommateCallback(async (ctx, chat, locale) => {
  await openRoommate(ctx, chat, locale, { source: ROOMMATE_ENTRY_SOURCE.botMenu });
});

export function registerRoommateFlow(bot: Bot): void {
  bot.command('mate', handleMate);
  bot.callbackQuery('rm:start', handleRoommateStartTap);
}
