import type { RoommateProfile } from '@prisma/client';
import {
  GrammyError,
  InlineKeyboard,
  type Bot,
  type CallbackQueryContext,
  type CommandContext,
  type Context,
} from 'grammy';

import {
  BUDGET_BANDS,
  EDIT_FIELDS,
  LANGUAGES,
  MAX_DISTRICTS,
  PETS,
  RENEW_MONTH_STEP,
  SMOKING,
  bandForAmount,
  editFieldOf,
  editStepOf,
  graceEnd,
  isBudgetBand,
  isDistrictPickComplete,
  isEditField,
  isGender,
  isLanguage,
  isPets,
  isPrefers,
  isSmoking,
  languageOfLocale,
  nextIntakeStep,
  profileCreatedProperties,
  profileEditedProperties,
  reduceDistrictPick,
  renewalCheck,
  setLanguage,
  showsRenew,
  type BudgetBand,
  type DistrictPick,
  type RoommateEditField,
} from '@/lib/roommate/rules';
import {
  advanceStep,
  clearEditStep,
  createDraft,
  deleteDraft,
  deleteProfile,
  findRoommateProfile,
  hasMatchedReaction,
  isStepOpen,
  loadRoommateEntry,
  openEditStep,
  renewProfile,
  saveEdit,
  saveProfile,
  setDistrictPick,
  setLanguages,
  setRoommateUsername,
  type StepAnswer,
} from '@/lib/roommate/store';
import { isMatchingEnabled } from '@/lib/roommate/switch';
import {
  ABOUT_MAX_LENGTH,
  checkAboutText,
  type AboutTextFinding,
} from '@/lib/roommate/text-filter';
import {
  expiresAtAfterMonthEdit,
  formatMoveInMonth,
  formatWarsawDate,
  isMoveInMonthPast,
  monthKey,
  moveInMonthOptions,
  parseMonthKey,
  renewalNeedsNewMonth,
} from '@/lib/roommate/time';

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
 * The roommate conversation in the bot (spec 06): the entry and its routing, the
 * nine intake steps (districts, budget, move-in month, languages, own gender,
 * "live with", the short text, smoking and pets, 18+), the save, the own card,
 * its Edit (each field reuses its intake step as `edit_<field>`), its Delete
 * (with the optional reason) and Renew (with the move-in question as
 * `renew_month` when the month has passed or ends soon); the counts reply and the
 * opt-in (the handlers of the other card buttons) are added here by their tasks.
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

/** Amounts as the bot's cards write them: "1 199" with no-break spaces, in every locale. */
function amount(value: number): string {
  return value.toLocaleString('ru-RU').replace(/\s/g, String.fromCharCode(0xa0));
}

/**
 * A band's label from the bounds in `BUDGET_BANDS`: "до 1 199 zł", "1 200 – 1 599 zł",
 * "2 500 zł и больше". A band runs up to the next band's `min` minus one złoty.
 */
function budgetBandLabel(band: BudgetBand, locale: BotLocale): string {
  const index = BUDGET_BANDS.findIndex((b) => b.band === band);
  const next = BUDGET_BANDS[index + 1];
  if (index === 0) return rt(locale, 'bandUpTo', { max: amount(next.min - 1) });
  if (!next) return rt(locale, 'bandFrom', { min: amount(BUDGET_BANDS[index].min) });
  return rt(locale, 'bandRange', {
    min: amount(BUDGET_BANDS[index].min),
    max: amount(next.min - 1),
  });
}

/** Step 2: one band per row, cheapest first (`rm:b:<band>`). */
async function sendBudgetStep(ctx: Context, locale: BotLocale): Promise<void> {
  const keyboard = InlineKeyboard.from(
    BUDGET_BANDS.map(({ band }) => [
      InlineKeyboard.text(budgetBandLabel(band, locale), `rm:b:${band}`),
    ]),
  );
  await ctx.reply(rt(locale, 'askBudget'), { parse_mode: 'HTML', reply_markup: keyboard });
}

/** "декабрь 2026" → "Декабрь 2026" on a button. */
function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

/**
 * Step 3: the current Warsaw month and the next three at `now`, two per row, in the
 * locale's month names (`rm:m:<YYYY-MM>`).
 */
async function sendMonthStep(ctx: Context, locale: BotLocale, now: Date): Promise<void> {
  const buttons = moveInMonthOptions(now).map((month) =>
    InlineKeyboard.text(capitalize(formatMoveInMonth(month, locale)), `rm:m:${monthKey(month)}`),
  );
  const keyboard = InlineKeyboard.from([buttons]).toFlowed(2);
  await ctx.reply(rt(locale, 'askMonth'), { parse_mode: 'HTML', reply_markup: keyboard });
}

const LANGUAGE_LABEL = { pl: 'langPl', en: 'langEn', ru: 'langRu', uk: 'langUk' } as const;

/**
 * Step 4's buttons: the four languages two per row, each carrying its target
 * state (`rm:l:<code>:1` to tick, `:0` to untick) and ✓ when ticked, then "Done".
 */
function languagesKeyboard(languages: readonly string[], locale: BotLocale): InlineKeyboard {
  const buttons = LANGUAGES.map((code) => {
    const name = rt(locale, LANGUAGE_LABEL[code]);
    const ticked = languages.includes(code);
    return InlineKeyboard.text(
      ticked ? rt(locale, 'btnPicked', { name }) : name,
      `rm:l:${code}:${ticked ? 0 : 1}`,
    );
  });
  return InlineKeyboard.from([buttons]).toFlowed(2).row().text(rt(locale, 'btnDone'), 'rm:l:done');
}

async function sendLanguagesStep(
  ctx: Context,
  languages: readonly string[],
  locale: BotLocale,
): Promise<void> {
  await ctx.reply(rt(locale, 'askLanguages'), {
    parse_mode: 'HTML',
    reply_markup: languagesKeyboard(languages, locale),
  });
}

/** Step 5 (FR-8): "a woman / a man" in one row, "skip" below (`rm:g:<woman|man|skip>`). */
async function sendGenderStep(ctx: Context, locale: BotLocale): Promise<void> {
  const keyboard = InlineKeyboard.from([
    [
      InlineKeyboard.text(rt(locale, 'btnWoman'), 'rm:g:woman'),
      InlineKeyboard.text(rt(locale, 'btnMan'), 'rm:g:man'),
    ],
    [InlineKeyboard.text(rt(locale, 'btnSkip'), 'rm:g:skip')],
  ]);
  await ctx.reply(rt(locale, 'askGender'), { parse_mode: 'HTML', reply_markup: keyboard });
}

/**
 * Step 6 (FR-8): "anyone" in one row, "women / men" below (`rm:p:<anyone|women|men>`). In the
 * preferences edit the buttons also carry the own gender just tapped
 * (`rm:p:<prefers>:<woman|man|skip>`), so both are stored in one write and `/cancel` before
 * "live with" leaves the profile as it was.
 */
async function sendPrefersStep(ctx: Context, locale: BotLocale, gender?: string): Promise<void> {
  const suffix = gender ? `:${gender}` : '';
  const keyboard = InlineKeyboard.from([
    [InlineKeyboard.text(rt(locale, 'btnPrefersAnyone'), `rm:p:anyone${suffix}`)],
    [
      InlineKeyboard.text(rt(locale, 'btnPrefersWomen'), `rm:p:women${suffix}`),
      InlineKeyboard.text(rt(locale, 'btnPrefersMen'), `rm:p:men${suffix}`),
    ],
  ]);
  await ctx.reply(rt(locale, 'askPrefers'), { parse_mode: 'HTML', reply_markup: keyboard });
}

/**
 * Step 7 (FR-10): the short text is typed (`aboutText`); the one button is
 * "Skip" (`rm:t:skip`). The question asks not to write sensitive facts.
 */
async function sendAboutStep(ctx: Context, locale: BotLocale): Promise<void> {
  const keyboard = new InlineKeyboard().text(rt(locale, 'btnSkip'), 'rm:t:skip');
  await ctx.reply(rt(locale, 'askAbout'), { parse_mode: 'HTML', reply_markup: keyboard });
}

const SMOKING_LABEL = { no: 'smokingNo', outside: 'smokingOutside', fine: 'smokingFine' } as const;
const PETS_LABEL = { no: 'petsNo', have: 'petsHave', fine: 'petsFine' } as const;

/** Step 8a (FR-11): smoking, one option per row, then "Skip" (`rm:s:<no|outside|fine|skip>`). */
async function sendSmokingStep(ctx: Context, locale: BotLocale): Promise<void> {
  const keyboard = InlineKeyboard.from([
    ...SMOKING.map((value) => [
      InlineKeyboard.text(rt(locale, SMOKING_LABEL[value]), `rm:s:${value}`),
    ]),
    [InlineKeyboard.text(rt(locale, 'btnSkip'), 'rm:s:skip')],
  ]);
  await ctx.reply(rt(locale, 'askSmoking'), { parse_mode: 'HTML', reply_markup: keyboard });
}

/**
 * Step 8b (FR-11): pets, one option per row, then "Skip" (`rm:pt:<no|have|fine|skip>`). In the
 * house-rules edit the buttons also carry the smoking answer just tapped
 * (`rm:pt:<pets>:<smoking>`), so both are stored in one write.
 */
async function sendPetsStep(ctx: Context, locale: BotLocale, smoking?: string): Promise<void> {
  const suffix = smoking ? `:${smoking}` : '';
  const keyboard = InlineKeyboard.from([
    ...PETS.map((value) => [
      InlineKeyboard.text(rt(locale, PETS_LABEL[value]), `rm:pt:${value}${suffix}`),
    ]),
    [InlineKeyboard.text(rt(locale, 'btnSkip'), `rm:pt:skip${suffix}`)],
  ]);
  await ctx.reply(rt(locale, 'askPets'), { parse_mode: 'HTML', reply_markup: keyboard });
}

/** Step 9 (FR-9): "I'm 18+" saves (`rm:a:yes`), "I'm under 18" deletes the draft (`rm:a:no`). */
async function sendAdultStep(ctx: Context, locale: BotLocale): Promise<void> {
  const keyboard = InlineKeyboard.from([
    [InlineKeyboard.text(rt(locale, 'btnAdultYes'), 'rm:a:yes')],
    [InlineKeyboard.text(rt(locale, 'btnAdultNo'), 'rm:a:no')],
  ]);
  await ctx.reply(rt(locale, 'askAdult'), { parse_mode: 'HTML', reply_markup: keyboard });
}

/**
 * The question of the profile's open step, sent again (a draft reopened, a stale answer). An edit
 * step (`edit_<field>`) asks its intake step's question; the preferences edit starts with the own
 * gender and the house-rules edit with smoking.
 */
async function sendStep(ctx: Context, profile: RoommateProfile, locale: BotLocale): Promise<void> {
  switch (profile.step) {
    case 'districts':
    case 'edit_districts':
      await sendDistrictsStep(ctx, profile, locale, await cityDistricts());
      return;
    case 'budget':
    case 'edit_budget':
      await sendBudgetStep(ctx, locale);
      return;
    case 'month':
    case 'edit_month':
    case RENEW_MONTH_STEP:
      await sendMonthStep(ctx, locale, new Date());
      return;
    case 'languages':
    case 'edit_languages':
      await sendLanguagesStep(ctx, profile.languages, locale);
      return;
    case 'gender':
    case 'edit_preferences':
      await sendGenderStep(ctx, locale);
      return;
    case 'prefers':
      await sendPrefersStep(ctx, locale);
      return;
    case 'about':
    case 'edit_about':
      await sendAboutStep(ctx, locale);
      return;
    case 'smoking':
    case 'edit_rules':
      await sendSmokingStep(ctx, locale);
      return;
    case 'pets':
      await sendPetsStep(ctx, locale);
      return;
    case 'adult':
      await sendAdultStep(ctx, locale);
      return;
    default:
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
 * The chat's profile when it is at one of `steps`, the steps a tapped button
 * belongs to (an intake step and the edit step that reuses it). Otherwise (an
 * older message, a repeated tap after the step moved on, a draft already
 * closed) "this step is done", the current step again if one is open, and null
 * (spec 06 "Stale and repeated taps").
 */
async function profileAtStep(
  ctx: Context,
  chatDbId: string,
  locale: BotLocale,
  ...steps: string[]
): Promise<RoommateProfile | null> {
  const profile = await findRoommateProfile(chatDbId);
  if (profile && profile.status !== 'hidden') await rememberUsername(ctx, profile);
  if (profile && isStepOpen(profile) && steps.includes(profile.step!)) return profile;

  await ctx.reply(rt(locale, 'stepDone'));
  if (profile && isStepOpen(profile)) await sendStep(ctx, profile, locale);
  return null;
}

/**
 * Ends an edit (spec 06 §Save and the own card, Edit): stores the answer (that
 * field only) and closes the step in one conditional write, so only the write
 * that lands sends one `tg_roommate_profile_edited` (the field, never its
 * value), "updated" and the card again. A month edit keeps `expires_at` unless
 * the new month ends before it.
 */
async function finishEdit(
  ctx: Context,
  profile: RoommateProfile,
  locale: BotLocale,
  field: RoommateEditField,
  answer: StepAnswer,
): Promise<void> {
  const data: Parameters<typeof saveEdit>[2] = { ...answer };
  if (answer.moveInMonth) {
    data.expiresAt = expiresAtAfterMonthEdit(profile.expiresAt, answer.moveInMonth);
  }
  if (!(await saveEdit(profile.id, profile.step!, data))) {
    await resendCurrentStep(ctx, profile.chatId, locale);
    return;
  }
  track(ctx.chat!.id, 'tg_roommate_profile_edited', profileEditedProperties(field));
  await ctx.reply(rt(locale, 'editSaved'));
  await sendOwnCard(ctx, { ...profile, ...data, step: null }, locale);
}

/**
 * Stores the open step's answer and asks the next question, through the
 * conditional write of `advanceStep`; when another update moved the step on
 * meanwhile, nothing is stored and the current step is sent again. At an edit
 * step the answer ends the edit instead (`finishEdit`).
 */
async function moveOn(
  ctx: Context,
  profile: RoommateProfile,
  locale: BotLocale,
  answer: StepAnswer = {},
): Promise<void> {
  const from = profile.step!;
  const field = editFieldOf(from);
  if (field) {
    await finishEdit(ctx, profile, locale, field, answer);
    return;
  }
  const to = nextIntakeStep(from);
  if (!(await advanceStep(profile.id, from, to, answer))) {
    await resendCurrentStep(ctx, profile.chatId, locale);
    return;
  }
  await sendStep(ctx, { ...profile, ...answer, step: to }, locale);
}

const GENDER_LABEL = { woman: 'btnWoman', man: 'btnMan' } as const;
const PREFERS_LABEL = {
  anyone: 'btnPrefersAnyone',
  women: 'btnPrefersWomen',
  men: 'btnPrefersMen',
} as const;

/** The copy key a stored value maps to, or null for no value (or one outside the map). */
function labelKey<M extends Record<string, string>>(
  map: M,
  value: string | null,
): M[keyof M] | null {
  return value !== null && Object.hasOwn(map, value) ? map[value as keyof M] : null;
}

/**
 * The own card's text (spec 06 §Save and the own card): every field the person
 * chose (a skipped optional field has no line; own gender and "live with" are
 * shown here and nowhere else), the hide date in Warsaw time, and the opt-in
 * state with the switch off or the daily-message state with it on.
 */
function ownCardText(
  profile: RoommateProfile,
  districts: District[],
  locale: BotLocale,
  matchingEnabled: boolean,
): string {
  const names = new Map(districts.map((district) => [district.slug, district.nameKey]));
  const fields = [
    profile.anyDistrict
      ? rt(locale, 'cardAnyDistrict')
      : rt(locale, 'cardDistricts', {
          districts: profile.districtSlugs
            .map((slug) => escapeHtml(names.get(slug) ?? slug))
            .join(', '),
        }),
  ];
  if (profile.budgetBand && isBudgetBand(profile.budgetBand)) {
    fields.push(rt(locale, 'cardBudget', { band: budgetBandLabel(profile.budgetBand, locale) }));
  }
  if (profile.moveInMonth) {
    fields.push(rt(locale, 'cardMonth', { month: formatMoveInMonth(profile.moveInMonth, locale) }));
  }
  const languages = profile.languages.filter(isLanguage);
  if (languages.length > 0) {
    fields.push(
      rt(locale, 'cardLanguages', {
        languages: languages.map((code) => rt(locale, LANGUAGE_LABEL[code])).join(', '),
      }),
    );
  }
  fields.push(
    rt(locale, 'cardGender', {
      value: rt(locale, labelKey(GENDER_LABEL, profile.gender) ?? 'cardGenderNone'),
    }),
    rt(locale, 'cardPrefers', {
      value: rt(locale, labelKey(PREFERS_LABEL, profile.prefers) ?? 'btnPrefersAnyone'),
    }),
  );
  if (profile.about) fields.push(rt(locale, 'cardAbout', { about: escapeHtml(profile.about) }));
  const smoking = labelKey(SMOKING_LABEL, profile.smoking);
  if (smoking) fields.push(rt(locale, 'cardSmoking', { value: rt(locale, smoking) }));
  const pets = labelKey(PETS_LABEL, profile.pets);
  if (pets) fields.push(rt(locale, 'cardPets', { value: rt(locale, pets) }));

  const state: string[] = [];
  if (profile.status === 'expired' && profile.expiresAt) {
    state.push(
      rt(locale, 'cardExpired', {
        date: formatWarsawDate(profile.expiresAt, locale),
        deleteDate: formatWarsawDate(graceEnd(profile.expiredAt ?? profile.expiresAt), locale),
      }),
    );
  } else if (profile.expiresAt) {
    state.push(rt(locale, 'cardExpires', { date: formatWarsawDate(profile.expiresAt, locale) }));
  }
  if (matchingEnabled) {
    state.push(rt(locale, profile.pushOff ? 'cardPushOff' : 'cardPushOn'));
  } else {
    state.push(rt(locale, profile.notifyOnOpenAt ? 'cardOptInOn' : 'cardOptInOff'));
    state.push(rt(locale, 'cardHiddenUntilOpen'));
  }
  state.push(rt(locale, 'cardPrivateNote'));

  return [rt(locale, 'cardHeader'), fields.join('\n'), state.join('\n')].join('\n\n');
}

/**
 * The own card's buttons (spec 06 §Save and the own card): Renew only within
 * `RENEWAL_REMINDER_DAYS` of the hide date or while expired, then Edit and
 * Delete; with the switch off "How many are looking?" and the opt-in toggle,
 * with it on "Show people" and the daily-message toggle (spec 07). The handlers
 * of counts, opt-in and stage 2 come with their tasks.
 */
function ownCardKeyboard(
  profile: RoommateProfile,
  locale: BotLocale,
  now: Date,
  matchingEnabled: boolean,
): InlineKeyboard {
  const rows = [];
  if (showsRenew(profile, now))
    rows.push([InlineKeyboard.text(rt(locale, 'btnRenew'), 'rm:c:renew')]);
  rows.push([
    InlineKeyboard.text(rt(locale, 'btnEdit'), 'rm:c:edit'),
    InlineKeyboard.text(rt(locale, 'btnDelete'), DELETE_CALLBACK),
  ]);
  if (matchingEnabled) {
    rows.push(
      [InlineKeyboard.text(rt(locale, 'btnShowPeople'), 'rm:show')],
      [
        profile.pushOff
          ? InlineKeyboard.text(rt(locale, 'btnPushOn'), 'rm:push:on')
          : InlineKeyboard.text(rt(locale, 'btnPushOff'), 'rm:push:off'),
      ],
    );
  } else {
    rows.push(
      [InlineKeyboard.text(rt(locale, 'btnCounts'), 'rm:c:counts')],
      [
        profile.notifyOnOpenAt
          ? InlineKeyboard.text(rt(locale, 'btnOptOut'), 'rm:c:optout')
          : InlineKeyboard.text(rt(locale, 'btnOptIn'), 'rm:c:optin'),
      ],
    );
  }
  return InlineKeyboard.from(rows);
}

/**
 * The own card (spec 06 §Save and the own card), shown only to its owner: after
 * the save and whenever a saved (active or expired) profile is opened. The
 * switch is read at reply time, so the card and the menu never disagree.
 */
async function sendOwnCard(ctx: Context, profile: RoommateProfile, locale: BotLocale) {
  const matchingEnabled = isMatchingEnabled();
  const districts = profile.districtSlugs.length > 0 ? await cityDistricts() : [];
  await ctx.reply(ownCardText(profile, districts, locale, matchingEnabled), {
    parse_mode: 'HTML',
    reply_markup: ownCardKeyboard(profile, locale, new Date(), matchingEnabled),
  });
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
 * True when a districts edit would store an empty pick. The edit stores each
 * tap as the intake does, so a saved profile always keeps one district or "any",
 * also when the edit is left with `/cancel`; the intake's "Done" checks a draft.
 */
function keepsNoDistrict(profile: RoommateProfile, pick: DistrictPick): boolean {
  return profile.step === 'edit_districts' && !isDistrictPickComplete(pick);
}

/**
 * A typed district name at the districts step (or its edit), toggled like a
 * tap. False when it names no district of the checker city, so the text goes on
 * to the address lookup.
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
  if (keepsNoDistrict(profile, result.pick)) {
    await ctx.reply(rt(locale, 'districtsEmpty'));
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
 * A typed amount at the budget step ("1650", "1 650 zł") stored as its band
 * (`bandForAmount`). False for text without one amount, so the text goes on to
 * the district check or the address lookup (spec 06 §Entry and routing).
 */
async function budgetText(
  ctx: Context,
  profile: RoommateProfile,
  locale: BotLocale,
  text: string,
): Promise<boolean> {
  const band = bandForAmount(text);
  if (!band) return false;
  await moveOn(ctx, profile, locale, { budgetBand: band });
  return true;
}

/** What `checkAboutText` found, as the refusal names it. */
const FOUND_LABEL = {
  link: 'foundLink',
  email: 'foundEmail',
  handle: 'foundHandle',
  phone: 'foundPhone',
  iban: 'foundIban',
} as const satisfies Record<Exclude<AboutTextFinding, 'too_long'>, string>;

/**
 * The short text (FR-10) through `checkAboutText`: accepted text is stored
 * NFKC-normalised and the intake moves on; blank text is a skip (null); a
 * refused text gets a reply naming what was found (the length when too long),
 * stores nothing and the step stays open. Always true: every text at this step
 * is its answer and never reaches the district check or the address lookup.
 */
async function aboutText(
  ctx: Context,
  profile: RoommateProfile,
  locale: BotLocale,
  text: string,
): Promise<boolean> {
  const result = checkAboutText(text);
  if (result.ok) {
    await moveOn(ctx, profile, locale, { about: result.value });
    return true;
  }
  const refusal =
    result.found === 'too_long'
      ? rt(locale, 'aboutTooLong', { max: String(ABOUT_MAX_LENGTH), length: String(result.length) })
      : rt(locale, 'aboutRefused', { found: rt(locale, FOUND_LABEL[result.found]) });
  await ctx.reply(refusal, { parse_mode: 'HTML' });
  return true;
}

/**
 * The steps that take typed text, each returning false for text it cannot use;
 * an edit step takes the same text as the intake step it reuses.
 */
const TEXT_STEPS: Record<
  string,
  | ((ctx: Context, profile: RoommateProfile, locale: BotLocale, text: string) => Promise<boolean>)
  | undefined
> = {
  districts: districtsText,
  budget: budgetText,
  about: aboutText,
  edit_districts: districtsText,
  edit_budget: budgetText,
  edit_about: aboutText,
};

// ---------------------------------------------------------------------------------------------
// Intake buttons, steps 1 – 3 (spec 06 §Intake steps; callback data of §Entry and routing)
// ---------------------------------------------------------------------------------------------

/** A district toggle carries its target state: `1` picks, `0` unpicks. */
export const DISTRICT_TOGGLE = /^rm:d:([^:]+):([01])$/;
export const BUDGET_TAP = /^rm:b:([^:]+)$/;
export const MONTH_TAP = /^rm:m:([^:]+)$/;

/** The capture groups of a regex-triggered callback. */
function matchGroups(ctx: CallbackQueryContext<Context>): string[] {
  return typeof ctx.match === 'string' ? [] : [...ctx.match].slice(1);
}

/**
 * `rm:d:<slug>:<1|0>`: sets the district to the button's target state, so a
 * repeated tap sets the same state; a 4th district is refused with a toast and
 * changes nothing; a slug outside the `District` table is ignored. The keyboard
 * is edited in place.
 */
const handleDistrictToggle = roommateCallback(async (ctx, chat, locale) => {
  const [slug, state] = matchGroups(ctx);
  const districts = await cityDistricts();
  if (!districts.some((district) => district.slug === slug)) return;

  const profile = await profileAtStep(ctx, chat.id, locale, 'districts', 'edit_districts');
  if (!profile) return;

  const result = reduceDistrictPick(profile, { kind: 'district', slug, on: state === '1' });
  if (!result.ok) return rt(locale, 'districtLimit', { max: String(MAX_DISTRICTS) });
  if (keepsNoDistrict(profile, result.pick)) return rt(locale, 'districtsEmpty');
  if (!(await setDistrictPick(profile.id, profile.step!, result.pick))) {
    await resendCurrentStep(ctx, chat.id, locale);
    return;
  }
  await ctx.editMessageReplyMarkup({
    reply_markup: districtsKeyboard(districts, result.pick, locale),
  });
});

/** `rm:d:any`: "Any district" stores `any_district=true` and no districts. */
const handleAnyDistrict = roommateCallback(async (ctx, chat, locale) => {
  const profile = await profileAtStep(ctx, chat.id, locale, 'districts', 'edit_districts');
  if (!profile) return;

  const result = reduceDistrictPick(profile, { kind: 'any' });
  if (!(await setDistrictPick(profile.id, profile.step!, result.pick))) {
    await resendCurrentStep(ctx, chat.id, locale);
    return;
  }
  await ctx.editMessageReplyMarkup({
    reply_markup: districtsKeyboard(await cityDistricts(), result.pick, locale),
  });
});

/**
 * `rm:d:done`: moves on to the budget (or ends the districts edit) with 1 – 3
 * districts or "any"; with nothing picked, asks again.
 */
const handleDistrictsDone = roommateCallback(async (ctx, chat, locale) => {
  const profile = await profileAtStep(ctx, chat.id, locale, 'districts', 'edit_districts');
  if (!profile) return;
  if (!isDistrictPickComplete(profile)) return rt(locale, 'districtsEmpty');
  await moveOn(ctx, profile, locale);
});

/** `rm:b:<b1..b5>`: stores the band and moves on to the month; an unknown band is ignored. */
const handleBudgetTap = roommateCallback(async (ctx, chat, locale) => {
  const [band] = matchGroups(ctx);
  if (!isBudgetBand(band)) return;

  const profile = await profileAtStep(ctx, chat.id, locale, 'budget', 'edit_budget');
  if (!profile) return;
  await moveOn(ctx, profile, locale, { budgetBand: band });
});

/**
 * `rm:m:<YYYY-MM>`: stores the first day of the month and moves on. A month that
 * has passed (an older message) gets the step again with the current months; a
 * month the step never offers is ignored. At `renew_month` the month renews the
 * profile (`finishRenewal`).
 */
const handleMonthTap = roommateCallback(async (ctx, chat, locale) => {
  const [key] = matchGroups(ctx);
  const month = parseMonthKey(key);
  if (!month) return;

  const profile = await profileAtStep(
    ctx,
    chat.id,
    locale,
    'month',
    'edit_month',
    RENEW_MONTH_STEP,
  );
  if (!profile) return;

  const now = new Date();
  if (isMoveInMonthPast(month, now)) {
    await ctx.reply(rt(locale, 'monthPassed'));
    await sendMonthStep(ctx, locale, now);
    return;
  }
  if (!moveInMonthOptions(now).some((option) => option.getTime() === month.getTime())) return;
  if (profile.step === RENEW_MONTH_STEP) {
    // The grace period can end while the question is open; the next cron run deletes the profile.
    if (renewalCheck(profile, now) === 'refused') {
      await ctx.reply(rt(locale, 'renewRefused'));
      return;
    }
    await finishRenewal(ctx, profile, locale, now, month, RENEW_MONTH_STEP);
    return;
  }
  if (profile.step === 'edit_month') {
    await moveOn(ctx, profile, locale, { moveInMonth: month });
    return;
  }
  // FR-7: the languages step opens with the chat's bot language ticked in advance.
  const languages = profile.languages.length > 0 ? profile.languages : [languageOfLocale(locale)];
  await moveOn(ctx, profile, locale, { moveInMonth: month, languages });
});

// ---------------------------------------------------------------------------------------------
// Intake buttons, steps 4 – 6 (FR-7, FR-8)
// ---------------------------------------------------------------------------------------------

/** A language toggle carries its target state: `1` ticks, `0` unticks. */
export const LANGUAGE_TOGGLE = /^rm:l:([^:]+):([01])$/;
export const GENDER_TAP = /^rm:g:([^:]+)$/;
/** "Live with", and in the preferences edit the own gender tapped before it. */
export const PREFERS_TAP = /^rm:p:([^:]+)(?::([^:]+))?$/;

/**
 * `rm:l:<code>:<1|0>`: sets the language to the button's target state, so a
 * repeated tap sets the same state; a code outside `LANGUAGES` is ignored. The
 * keyboard is edited in place.
 */
const handleLanguageToggle = roommateCallback(async (ctx, chat, locale) => {
  const [code, state] = matchGroups(ctx);
  if (!isLanguage(code)) return;

  const profile = await profileAtStep(ctx, chat.id, locale, 'languages', 'edit_languages');
  if (!profile) return;

  const languages = setLanguage(profile.languages, code, state === '1');
  // The edit stores each tap, so a saved profile always keeps one language (see `keepsNoDistrict`).
  if (profile.step === 'edit_languages' && languages.length === 0) {
    return rt(locale, 'languagesEmpty');
  }
  if (!(await setLanguages(profile.id, profile.step!, languages))) {
    await resendCurrentStep(ctx, chat.id, locale);
    return;
  }
  await ctx.editMessageReplyMarkup({ reply_markup: languagesKeyboard(languages, locale) });
});

/**
 * `rm:l:done`: moves on to the own gender (or ends the languages edit) with at
 * least one language; with none, asks again.
 */
const handleLanguagesDone = roommateCallback(async (ctx, chat, locale) => {
  const profile = await profileAtStep(ctx, chat.id, locale, 'languages', 'edit_languages');
  if (!profile) return;
  if (profile.languages.length === 0) return rt(locale, 'languagesEmpty');
  await moveOn(ctx, profile, locale);
});

/**
 * `rm:g:<woman|man|skip>`: stores the own gender (skip keeps null) and moves on
 * to "live with". In the preferences edit nothing is stored yet: "live with"
 * follows with buttons that carry this answer.
 */
const handleGenderTap = roommateCallback(async (ctx, chat, locale) => {
  const [value] = matchGroups(ctx);
  if (value !== 'skip' && !isGender(value)) return;

  const profile = await profileAtStep(ctx, chat.id, locale, 'gender', 'edit_preferences');
  if (!profile) return;
  if (profile.step === 'edit_preferences') {
    await sendPrefersStep(ctx, locale, value);
    return;
  }
  await moveOn(ctx, profile, locale, { gender: value === 'skip' ? null : value });
});

/**
 * `rm:p:<anyone|women|men>`: stores "live with" as chosen, also "women" or "men"
 * without an own gender (FR-8 edge case), and moves on to the short text.
 * `rm:p:<prefers>:<woman|man|skip>` belongs to the preferences edit and stores
 * both answers in one write; each form is stale at the other's step.
 */
const handlePrefersTap = roommateCallback(async (ctx, chat, locale) => {
  const [value, gender] = matchGroups(ctx);
  if (!isPrefers(value)) return;

  if (gender === undefined) {
    const profile = await profileAtStep(ctx, chat.id, locale, 'prefers');
    if (!profile) return;
    await moveOn(ctx, profile, locale, { prefers: value });
    return;
  }
  if (gender !== 'skip' && !isGender(gender)) return;
  const profile = await profileAtStep(ctx, chat.id, locale, 'edit_preferences');
  if (!profile) return;
  await moveOn(ctx, profile, locale, {
    gender: gender === 'skip' ? null : gender,
    prefers: value,
  });
});

// ---------------------------------------------------------------------------------------------
// Intake buttons, steps 7 – 8 (FR-10, FR-11)
// ---------------------------------------------------------------------------------------------

export const SMOKING_TAP = /^rm:s:([^:]+)$/;
/** Pets, and in the house-rules edit the smoking answer tapped before it. */
export const PETS_TAP = /^rm:pt:([^:]+)(?::([^:]+))?$/;

/**
 * `rm:t:skip`: no short text (`about = null`); moves on to smoking. In the
 * short-text edit it removes the stored text.
 */
const handleAboutSkip = roommateCallback(async (ctx, chat, locale) => {
  const profile = await profileAtStep(ctx, chat.id, locale, 'about', 'edit_about');
  if (!profile) return;
  await moveOn(ctx, profile, locale, { about: null });
});

/**
 * `rm:s:<no|outside|fine|skip>`: stores smoking (skip stores null) and moves on
 * to pets. In the house-rules edit nothing is stored yet: pets follows with
 * buttons that carry this answer.
 */
const handleSmokingTap = roommateCallback(async (ctx, chat, locale) => {
  const [value] = matchGroups(ctx);
  if (value !== 'skip' && !isSmoking(value)) return;

  const profile = await profileAtStep(ctx, chat.id, locale, 'smoking', 'edit_rules');
  if (!profile) return;
  if (profile.step === 'edit_rules') {
    await sendPetsStep(ctx, locale, value);
    return;
  }
  await moveOn(ctx, profile, locale, { smoking: value === 'skip' ? null : value });
});

/**
 * `rm:pt:<no|have|fine|skip>`: stores pets (skip stores null) and moves on to
 * the 18+ step. `rm:pt:<pets>:<smoking>` belongs to the house-rules edit and
 * stores both answers in one write; each form is stale at the other's step.
 */
const handlePetsTap = roommateCallback(async (ctx, chat, locale) => {
  const [value, smoking] = matchGroups(ctx);
  if (value !== 'skip' && !isPets(value)) return;
  const pets = value === 'skip' ? null : value;

  if (smoking === undefined) {
    const profile = await profileAtStep(ctx, chat.id, locale, 'pets');
    if (!profile) return;
    await moveOn(ctx, profile, locale, { pets });
    return;
  }
  if (smoking !== 'skip' && !isSmoking(smoking)) return;
  const profile = await profileAtStep(ctx, chat.id, locale, 'edit_rules');
  if (!profile) return;
  await moveOn(ctx, profile, locale, { smoking: smoking === 'skip' ? null : smoking, pets });
});

// ---------------------------------------------------------------------------------------------
// Step 9 and the save (FR-9, FR-12; spec 06 §Save and the own card)
// ---------------------------------------------------------------------------------------------

/**
 * `rm:a:yes`: saves the draft through the conditional write of `saveProfile`.
 * Only the tap whose write lands sends `tg_roommate_profile_created` and the own
 * card, so a double tap gives one active row and one event; the other tap gets
 * "this step is done". The counts reply after the card comes with T079.
 */
const handleAdultYes = roommateCallback(async (ctx, chat, locale) => {
  const profile = await profileAtStep(ctx, chat.id, locale, 'adult');
  if (!profile) return;
  // The month step always stores one before the intake reaches this step.
  if (!profile.moveInMonth) throw new Error('roommate draft at the 18+ step without a month');

  const now = new Date();
  const result = await saveProfile(profile.id, profile.moveInMonth, now);
  if (!result.saved) {
    await resendCurrentStep(ctx, chat.id, locale);
    return;
  }
  const saved: RoommateProfile = {
    ...profile,
    status: 'active',
    step: null,
    activatedAt: now,
    expiresAt: result.expiresAt,
    adultConfirmedAt: now,
    tgUsername: ctx.from?.username ?? null,
  };
  track(ctx.chat!.id, 'tg_roommate_profile_created', profileCreatedProperties(saved, now));
  await sendOwnCard(ctx, saved, locale);
});

/** `rm:a:no`: deletes the draft at once and says that matching is for adults and nothing was saved. */
const handleAdultNo = roommateCallback(async (ctx, chat, locale) => {
  const profile = await profileAtStep(ctx, chat.id, locale, 'adult');
  if (!profile) return;
  if (!(await deleteDraft(profile.id))) {
    await resendCurrentStep(ctx, chat.id, locale);
    return;
  }
  await ctx.reply(rt(locale, 'underAge'));
});

// ---------------------------------------------------------------------------------------------
// Edit from the own card (FR-12; spec 06 §Save and the own card, Edit)
// ---------------------------------------------------------------------------------------------

const EDIT_LABEL = {
  districts: 'editDistricts',
  budget: 'editBudget',
  month: 'editMonth',
  languages: 'editLanguages',
  preferences: 'editPreferences',
  about: 'editAbout',
  rules: 'editRules',
} as const satisfies Record<RoommateEditField, string>;

/** `rm:e:<field>` from the picker; `rm:e:back` returns to the card. */
export const EDIT_PICK = /^rm:e:([^:]+)$/;

/** The field picker: the seven fields two per row (`rm:e:<field>`), then "Back" (`rm:e:back`). */
function editPickerKeyboard(locale: BotLocale): InlineKeyboard {
  const buttons = EDIT_FIELDS.map((field) =>
    InlineKeyboard.text(rt(locale, EDIT_LABEL[field]), `rm:e:${field}`),
  );
  return InlineKeyboard.from([buttons]).toFlowed(2).row().text(rt(locale, 'btnBack'), 'rm:e:back');
}

/**
 * The chat's saved (active or expired) profile for a card button. Otherwise
 * "already deleted" when there is none, the FR-14 reply for a hidden profile
 * (unless `allowHidden`: delete holds for every profile, D49), and for a draft
 * (an old card of a profile deleted and started again) "this step is done" with
 * its current step; then null.
 */
async function savedProfileFor(
  ctx: Context,
  chatDbId: string,
  locale: BotLocale,
  allowHidden = false,
): Promise<RoommateProfile | null> {
  const profile = await findRoommateProfile(chatDbId);
  if (!profile) {
    await ctx.reply(rt(locale, 'alreadyDeleted'));
    return null;
  }
  if (profile.status === 'hidden') {
    if (allowHidden) return profile;
    await replyRefused(ctx, locale, true);
    return null;
  }
  await rememberUsername(ctx, profile);
  if (profile.status === 'draft') {
    await ctx.reply(rt(locale, 'stepDone'));
    if (isStepOpen(profile)) await sendStep(ctx, profile, locale);
    return null;
  }
  return profile;
}

/** `rm:c:edit`: the field picker under "What do you want to change?". Opens no step yet. */
const handleEditTap = roommateCallback(async (ctx, chat, locale) => {
  const profile = await savedProfileFor(ctx, chat.id, locale);
  if (!profile) return;
  await ctx.reply(rt(locale, 'editPrompt'), { reply_markup: editPickerKeyboard(locale) });
});

/**
 * `rm:e:<field>`: opens that field's intake step as `edit_<field>` on the saved
 * profile, which stays active and counted; another open edit step is replaced.
 * Not while the deposit questions are open (one open intake per chat). An
 * unknown field is ignored. `rm:e:back` closes an open edit step, so the next
 * typed text is not taken as its answer, and sends the card again.
 */
const handleEditPick = roommateCallback(async (ctx, chat, locale) => {
  const [value] = matchGroups(ctx);
  if (value !== 'back' && !isEditField(value)) return;

  const profile = await savedProfileFor(ctx, chat.id, locale);
  if (!profile) return;

  if (value === 'back') {
    if (editFieldOf(profile.step)) await clearEditStep(profile.id, profile.step!);
    await sendOwnCard(ctx, { ...profile, step: null }, locale);
    return;
  }
  if (await hasOpenIntake(chat.id)) {
    await ctx.reply(rt(locale, 'depositQuestionsOpen'));
    return;
  }
  const step = editStepOf(value);
  if (!(await openEditStep(profile.id, step))) {
    await resendCurrentStep(ctx, chat.id, locale);
    return;
  }
  await sendStep(ctx, { ...profile, step }, locale);
});

// ---------------------------------------------------------------------------------------------
// Delete at once, with the optional reason (FR-13; spec 06 §Delete)
// ---------------------------------------------------------------------------------------------

/** The optional reasons after a delete; "here" is offered only when the profile had a match. */
const DELETE_REASONS = ['here', 'elsewhere', 'other'] as const;
type DeleteReason = (typeof DELETE_REASONS)[number];

const REASON_LABEL = {
  here: 'reasonFoundHere',
  elsewhere: 'reasonFoundElsewhere',
  other: 'reasonOther',
} as const satisfies Record<DeleteReason, string>;

function isDeleteReason(value: string | undefined): value is DeleteReason {
  return (DELETE_REASONS as readonly (string | undefined)[]).includes(value);
}

/** `rm:dr:<here|elsewhere|other>`: carries no id, so it works after the row is gone. */
export const DELETE_REASON = /^rm:dr:([^:]+)$/;

/**
 * `rm:c:del` (the own card, the FR-14 reply, the renewal reminder): asks first, saying that the
 * deletion is immediate and final and that a contact already revealed stays with the other person
 * (PRD 3 §8 "Delete"), with "Yes, delete" (`rm:c:delok`) and "Keep" (`rm:c:keep`). A hidden
 * profile can be deleted too (D49).
 */
const handleDeleteTap = roommateCallback(async (ctx, chat, locale) => {
  const profile = await savedProfileFor(ctx, chat.id, locale, true);
  if (!profile) return;
  const keyboard = new InlineKeyboard()
    .text(rt(locale, 'btnDeleteConfirm'), 'rm:c:delok')
    .text(rt(locale, 'btnKeep'), 'rm:c:keep');
  await ctx.reply(rt(locale, 'deleteConfirm'), { reply_markup: keyboard });
});

/**
 * `rm:c:delok`: deletes the profile at once through `deleteProfile` (its reactions cascade,
 * reports keep their rows with the reference nulled, the ban marker stays). Whether it was in a
 * matched pair is read first, because the delete removes its reactions. Only the confirm whose
 * delete lands sends one `tg_roommate_profile_deleted` (`reason=user`) and the reply with the
 * optional reasons; a second confirm gets "already deleted" and sends nothing. The chat can start
 * a new profile at once unless it is banned (`openRoommate`).
 */
const handleDeleteConfirm = roommateCallback(async (ctx, chat, locale) => {
  const profile = await savedProfileFor(ctx, chat.id, locale, true);
  if (!profile) return;

  const matched = await hasMatchedReaction(profile.id);
  if (!(await deleteProfile(profile.id))) {
    await ctx.reply(rt(locale, 'alreadyDeleted'));
    return;
  }
  track(ctx.chat!.id, 'tg_roommate_profile_deleted', { reason: 'user' });
  // A used confirmation cannot delete a later profile of this chat; a failed edit changes nothing.
  await ctx.editMessageReplyMarkup().catch(() => {});

  const reasons = DELETE_REASONS.filter((reason) => reason !== 'here' || matched);
  const keyboard = InlineKeyboard.from(
    reasons.map((reason) => [
      InlineKeyboard.text(rt(locale, REASON_LABEL[reason]), `rm:dr:${reason}`),
    ]),
  );
  await ctx.reply(`${rt(locale, 'deleted')}\n\n${rt(locale, 'deleteReasonPrompt')}`, {
    reply_markup: keyboard,
  });
});

/** `rm:c:keep`: the profile stays as it was; the confirmation's buttons are removed. */
const handleKeepTap = roommateCallback(async (ctx, chat, locale) => {
  const profile = await savedProfileFor(ctx, chat.id, locale, true);
  if (!profile) return;
  await ctx.editMessageReplyMarkup().catch(() => {});
  await ctx.reply(rt(locale, 'kept'));
});

/**
 * `rm:dr:<here|elsewhere|other>`: the optional reason after a delete; nothing is stored (the
 * profile is gone). The reply's buttons are removed first: on a second tap or a redelivered update
 * Telegram refuses that edit ("message is not modified", which `roommateCallback` ignores), so
 * nothing is sent twice. "Found someone here" sends `tg_roommate_outcome` with
 * `outcome=renting_together`, `asked=delete`; the other two send nothing.
 */
const handleDeleteReason = roommateCallback(async (ctx, _chat, locale) => {
  const [reason] = matchGroups(ctx);
  if (!isDeleteReason(reason)) return;

  await ctx.editMessageReplyMarkup();
  if (reason === 'here') {
    track(ctx.chat!.id, 'tg_roommate_outcome', { outcome: 'renting_together', asked: 'delete' });
  }
  await ctx.reply(rt(locale, 'reasonThanks'));
});

// ---------------------------------------------------------------------------------------------
// Renew (FR-15; spec 06 §Renewal)
// ---------------------------------------------------------------------------------------------

/** The own card again as stored now (a lost race, a Renew that is not due), or what replaces it. */
async function sendCurrentCard(ctx: Context, chatDbId: string, locale: BotLocale): Promise<void> {
  const profile = await savedProfileFor(ctx, chatDbId, locale);
  if (profile) await sendOwnCard(ctx, profile, locale);
}

/**
 * Renews the profile through the conditional write of `renewProfile` (with `step`, the new month
 * from `renew_month`). Only the write that lands sends one `tg_roommate_profile_renewed` (no
 * properties), "renewed" with the new hide date and the card; a lost race gets the current step
 * or card.
 */
async function finishRenewal(
  ctx: Context,
  profile: RoommateProfile,
  locale: BotLocale,
  now: Date,
  moveInMonth: Date,
  step?: string,
): Promise<void> {
  const result = await renewProfile(profile, moveInMonth, now, step);
  if (!result.renewed) {
    if (step) await resendCurrentStep(ctx, profile.chatId, locale);
    else await sendCurrentCard(ctx, profile.chatId, locale);
    return;
  }
  track(ctx.chat!.id, 'tg_roommate_profile_renewed');
  await ctx.reply(rt(locale, 'renewed', { date: formatWarsawDate(result.expiresAt, locale) }));
  await sendOwnCard(
    ctx,
    {
      ...profile,
      status: 'active',
      renewedAt: now,
      expiresAt: result.expiresAt,
      renewalRemindedAt: null,
      expiredAt: null,
      moveInMonth,
      step: step ? null : profile.step,
    },
    locale,
  );
}

/**
 * `rm:c:renew` (the renewal reminder, the own card, an expired card inside the grace period):
 * renews for `PROFILE_LIFE_DAYS`, capped by the move-in month. A month that has passed or ends
 * within `RENEWAL_REMINDER_DAYS` is asked first (`renew_month`, not while the deposit questions
 * are open). A hidden profile is never renewed (D55), nor an expired one past its grace period; an
 * active profile not yet due (an old reminder after a renewal) gets its card.
 */
const handleRenewTap = roommateCallback(async (ctx, chat, locale) => {
  const profile = await savedProfileFor(ctx, chat.id, locale, true);
  if (!profile) return;

  const now = new Date();
  const check = renewalCheck(profile, now);
  if (check === 'refused') {
    await ctx.reply(rt(locale, 'renewRefused'));
    return;
  }
  if (check === 'not_due') {
    await sendOwnCard(ctx, profile, locale);
    return;
  }
  if (profile.moveInMonth && !renewalNeedsNewMonth(profile.moveInMonth, now)) {
    await finishRenewal(ctx, profile, locale, now, profile.moveInMonth);
    return;
  }
  if (await hasOpenIntake(chat.id)) {
    await ctx.reply(rt(locale, 'depositQuestionsOpen'));
    return;
  }
  if (!(await openEditStep(profile.id, RENEW_MONTH_STEP))) {
    await sendCurrentCard(ctx, chat.id, locale);
    return;
  }
  await ctx.reply(rt(locale, 'renewMonthFirst'));
  await sendMonthStep(ctx, locale, now);
});

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
  // The districts and languages edits store each tick as it is tapped; the others store nothing before their answer.
  const ticksStored = profile.step === 'edit_districts' || profile.step === 'edit_languages';
  await ctx.reply(rt(locale, ticksStored ? 'cancelledEditPicked' : 'cancelledEdit'));
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
  bot.callbackQuery(DISTRICT_TOGGLE, handleDistrictToggle);
  bot.callbackQuery('rm:d:any', handleAnyDistrict);
  bot.callbackQuery('rm:d:done', handleDistrictsDone);
  bot.callbackQuery(BUDGET_TAP, handleBudgetTap);
  bot.callbackQuery(MONTH_TAP, handleMonthTap);
  bot.callbackQuery(LANGUAGE_TOGGLE, handleLanguageToggle);
  bot.callbackQuery('rm:l:done', handleLanguagesDone);
  bot.callbackQuery(GENDER_TAP, handleGenderTap);
  bot.callbackQuery(PREFERS_TAP, handlePrefersTap);
  bot.callbackQuery('rm:t:skip', handleAboutSkip);
  bot.callbackQuery(SMOKING_TAP, handleSmokingTap);
  bot.callbackQuery(PETS_TAP, handlePetsTap);
  bot.callbackQuery('rm:a:yes', handleAdultYes);
  bot.callbackQuery('rm:a:no', handleAdultNo);
  bot.callbackQuery('rm:c:edit', handleEditTap);
  bot.callbackQuery(EDIT_PICK, handleEditPick);
  bot.callbackQuery(DELETE_CALLBACK, handleDeleteTap);
  bot.callbackQuery('rm:c:delok', handleDeleteConfirm);
  bot.callbackQuery('rm:c:keep', handleKeepTap);
  bot.callbackQuery(DELETE_REASON, handleDeleteReason);
  bot.callbackQuery('rm:c:renew', handleRenewTap);
}
