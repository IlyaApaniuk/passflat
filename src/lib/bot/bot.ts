import {
  Bot,
  InlineKeyboard,
  type CallbackQueryContext,
  type CommandContext,
  type Context,
  type Filter,
} from 'grammy';

import { track } from './analytics';
import { checkEventProperties, districtCheckEventProperties } from './check-events';
import {
  cancelDepositFlow,
  handleDepositText,
  hasOpenIntake,
  maybeOfferDeposit,
  registerDepositFlow,
  startDepositFlow,
} from './deposit-flow';
import { dt } from './deposit-texts';
import { matchDistrict } from './districts';
import { geocodeAddress } from './geocode';
import {
  depositStatement,
  escapeHtml,
  renderDistrict,
  renderDistrictTable,
  renderLookup,
  submitLink,
  webLink,
} from './format';
import {
  getCity,
  getCityDepositFacts,
  getDistrictBySlug,
  getDistrictTable,
  lookupAddress,
  lookupBuilding,
  type AddressLookup,
} from './lookup';
import {
  addSubscription,
  listSubscriptions,
  removeSubscription,
  setChatLocale,
  touchChat,
} from './store';
import {
  ENTRY_SOURCE,
  parseStartPayload,
  recordedStartPayload,
  type EntrySource,
} from './start-payload';
import { normalizeLocale, peopleWord, t, type BotLocale } from './texts';

/**
 * The bot itself: a thin conversational shell over the same data the website's
 * checker reads. It holds no business logic of its own — everything lives in
 * lookup.ts so the numbers can never drift from the site's.
 */

let cached: Bot | null = null;

// Per-chat throttle. Geocoding is a paid API and a chat can hold the enter key.
const lastSeen = new Map<number, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 12;

function isRateLimited(chatId: number): boolean {
  const now = Date.now();
  const hits = (lastSeen.get(chatId) ?? []).filter((ts) => now - ts < RATE_WINDOW_MS);
  hits.push(now);
  lastSeen.set(chatId, hits);
  if (lastSeen.size > 5000) lastSeen.clear();
  return hits.length > RATE_MAX;
}

/**
 * Message text minus the leading command, e.g. "/start thr_med" → "thr_med".
 * The `?start=` payload is the whole attribution story for the bot: which post,
 * reply, or page sent this person here.
 */
function commandPayload(ctx: Context): string {
  const text = ctx.message?.text ?? '';
  const [, ...rest] = text.split(/\s+/);
  return rest.join(' ').trim();
}

function lookupKeyboard(lookup: AddressLookup, locale: BotLocale): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (lookup.level === 'building') {
    keyboard
      .url(t(locale, 'btnSubmit'), submitLink(lookup, locale))
      .row()
      .text(t(locale, 'subscribeBuilding'), `sub:b:${lookup.buildingId}`);
    if (lookup.buildingSlug) {
      keyboard
        .row()
        .url(
          t(locale, 'btnOpenSite'),
          webLink(`/${lookup.citySlug}/building/${lookup.buildingSlug}`, locale, 'building'),
        );
    }
    return keyboard;
  }

  keyboard.url(t(locale, 'btnBeFirst'), submitLink(lookup, locale)).row();
  if (lookup.districtSlug) {
    keyboard
      .text(
        t(locale, 'subscribeDistrict', { district: lookup.districtName ?? '' }),
        `sub:d:${lookup.districtSlug}`,
      )
      .row();
  }
  keyboard.text(t(locale, 'btnDistricts'), 'districts');
  return keyboard;
}

async function replyLookup(ctx: Context, locale: BotLocale, query: string) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  await ctx.replyWithChatAction('typing');

  const geo = await geocodeAddress(query);
  // The typed text never goes into an event (spec 04 §Typed text in bot events).
  if (!geo) {
    track(chatId, 'tg_address_not_found');
    await ctx.reply(t(locale, 'addressNotFound'), { parse_mode: 'HTML' });
    return;
  }

  const lookup = await lookupAddress(geo);
  if (!lookup) {
    // Another city is demand data, not a miss: offer a one-tap waitlist right
    // here, so the ask needs no email and the reply can come back to this chat.
    const city = geo.city;
    // Only the geocoded city name, and no property at all when none resolved.
    track(chatId, 'tg_address_outside_city', city ? { city } : {});
    // Callback data is capped at 64 bytes; a city name that does not fit is
    // answered without the button rather than with a truncated city.
    const callback = city ? `cw:${city}` : null;
    const fits = callback != null && Buffer.byteLength(callback, 'utf8') <= 64;
    await ctx.reply(
      city ? t(locale, 'outsideCityNamed', { city: escapeHtml(city) }) : t(locale, 'outsideCity'),
      {
        parse_mode: 'HTML',
        reply_markup:
          city && fits
            ? new InlineKeyboard().text(t(locale, 'btnCityWait', { city }), callback!)
            : undefined,
      },
    );
    return;
  }

  await replyCard(ctx, chatId, lookup, locale, ENTRY_SOURCE.typedAddress);
}

/**
 * A lookup's card with its buttons, the one way an address answer is sent, so a
 * typed address and a building link look the same, and the one place
 * `tg_address_checked` is sent. `note` is one extra line after the card.
 */
async function replyCard(
  ctx: Context,
  chatId: number,
  lookup: AddressLookup,
  locale: BotLocale,
  entrySource: EntrySource,
  note: string | null = null,
) {
  track(chatId, 'tg_address_checked', checkEventProperties(lookup, entrySource));

  const card = renderLookup(lookup, locale);
  await ctx.reply(note ? `${card}\n\n${note}` : card, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: lookupKeyboard(lookup, locale),
  });
}

/**
 * `/start b_<id>` (the website's checker link): that building's card at once,
 * as if its address had been typed (spec 04 §Building deep link). A link that
 * opens nothing says so and asks for the address; a malformed id (`buildingId`
 * null) is never looked up. An open deposit intake stays open, and the reply
 * says that /cancel leaves it, since the next typed message answers it.
 */
async function replyBuildingLink(
  ctx: Context,
  chatDbId: string,
  locale: BotLocale,
  buildingId: string | null,
) {
  const chatId = ctx.chat!.id;

  let lookup: AddressLookup | null;
  let intakeOpen: boolean;
  try {
    [lookup, intakeOpen] = await Promise.all([
      buildingId ? lookupBuilding(buildingId) : Promise.resolve(null),
      hasOpenIntake(chatDbId),
    ]);
  } catch (error) {
    console.error('[bot] building link lookup failed', error);
    await ctx.reply(t(locale, 'genericError'));
    return;
  }

  const note = intakeOpen ? t(locale, 'intakeStillOpen') : null;
  if (lookup) {
    await replyCard(ctx, chatId, lookup, locale, ENTRY_SOURCE.linkBuilding, note);
    return;
  }

  const lines = [t(locale, 'buildingLinkFailed'), '', t(locale, 'startAfterPayload')];
  if (note) lines.push('', note);
  await ctx.reply(lines.join('\n'), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
}

/**
 * A district's answer (`renderDistrict`) with its buttons, the one way a typed
 * district name and a `d_<slug>` link are answered. The save-interest button
 * (`sub:d:<slug>`) is the only thing that saves interest. False when the slug is
 * not a district of the checker city, so the caller can reply otherwise. The one
 * place `tg_district_checked` is sent.
 */
async function replyDistrict(
  ctx: Context,
  locale: BotLocale,
  slug: string,
  entrySource: EntrySource,
): Promise<boolean> {
  const chatId = ctx.chat?.id;
  if (!chatId) return false;

  const district = await getDistrictBySlug(slug);
  if (!district) return false;

  // `report_count` is the size of the group behind the district's single number
  // (D23), its `/districts` row; the card's figures come from its reference.
  track(
    chatId,
    'tg_district_checked',
    districtCheckEventProperties(
      {
        slug: district.slug,
        reportCount: district.figure?.reportCount ?? 0,
        reference: district.reference,
      },
      entrySource,
    ),
  );

  const keyboard = new InlineKeyboard()
    .text(t(locale, 'subscribeDistrict', { district: district.name }), `sub:d:${district.slug}`)
    .row()
    .text(t(locale, 'btnDistricts'), 'districts')
    .url(t(locale, 'btnSubmit'), webLink(`/${district.citySlug}/costs/submit`, locale, 'district'));

  await ctx.reply(
    renderDistrict(
      {
        name: district.name,
        reference: district.reference,
        deposit: district.deposit,
        rank: district.rank,
      },
      locale,
    ),
    { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: keyboard },
  );
  return true;
}

/** `/start [payload]`; exported so tests can call it with a fake context. */
export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
  const chatId = ctx.chat.id;
  const payload = commandPayload(ctx);
  const start = parseStartPayload(payload);
  // Raw only when it has a deep link's shape; typed text is recorded as 'invalid'.
  const recorded = recordedStartPayload(payload);
  const chat = await touchChat({
    chatId,
    locale: normalizeLocale(ctx.from?.language_code),
    startPayload: recorded,
  });
  const locale = chat.locale as BotLocale;

  track(chatId, 'tg_bot_started', { payload: recorded, is_new: chat.isNew });

  // "?start=dep" — shared in chats under "they won't return my deposit".
  if (start.kind === 'deposit') {
    await startDepositFlow(ctx, chat.id, locale);
    return;
  }

  // "b_<uuid>": the website checker's link opens that building.
  if (start.kind === 'building' || start.kind === 'invalid_building') {
    await replyBuildingLink(
      ctx,
      chat.id,
      locale,
      start.kind === 'building' ? start.buildingId : null,
    );
    return;
  }

  // "d_<slug>": that district's answer. Opening the link saves nothing; its
  // button does (spec 04 §District deep link). An unknown slug, "web_*" and
  // other payloads get the generic reply below.
  if (
    start.kind === 'district' &&
    (await replyDistrict(ctx, locale, start.slug, ENTRY_SOURCE.linkDistrict))
  ) {
    return;
  }

  await ctx.reply(t(locale, start.kind === 'none' ? 'start' : 'startAfterPayload'), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
}

/**
 * `/deposit`: the city's deposit statistic in the cards' wording and gate
 * (`depositStatement`), then the advice and the deposit helper. Exported so
 * tests can call it with a fake context.
 */
export async function handleDeposit(ctx: CommandContext<Context>): Promise<void> {
  const chat = await touchChat({ chatId: ctx.chat.id });
  const locale = chat.locale as BotLocale;
  track(ctx.chat.id, 'tg_deposit_viewed');

  const facts = await getCityDepositFacts();
  const statement = facts && depositStatement(facts.deposit, t(locale, 'cityName'), locale);
  const lines = [
    t(locale, 'depositHeader'),
    '',
    statement || t(locale, 'depositNoData'),
    '',
    t(locale, 'depositAdvice'),
    '',
    t(locale, 'cardFooter'),
  ];

  await ctx.reply(lines.join('\n'), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: new InlineKeyboard()
      .text(dt(locale, 'btnStartFlow'), 'dep:start')
      .row()
      .url(t(locale, 'btnSubmit'), webLink('/warsaw/costs/submit', locale, 'deposit')),
  });
}

/** Callback data of the save-interest buttons: `sub:b:<buildingId>`, `sub:d:<districtSlug>`. */
export const SUBSCRIBE_CALLBACK = /^sub:(b|d):(.+)$/;

/**
 * A save-interest button tap: the only place a building or district
 * `TelegramSubscription` is created. Names come from data, so they are escaped
 * for the HTML reply. Exported so tests can call it with a fake context.
 */
export async function handleSubscribe(ctx: CallbackQueryContext<Context>): Promise<void> {
  const chatId = ctx.chat!.id;
  const chat = await touchChat({ chatId });
  const locale = chat.locale as BotLocale;
  const [, kind, id] = ctx.match;

  if (kind === 'b') {
    const result = await addSubscription(chatId, { buildingId: id });
    await ctx.answerCallbackQuery();
    track(chatId, 'tg_subscribed', { target: 'building', already: !result.created });
    await ctx.reply(
      result.created
        ? t(locale, 'subscribedBuilding', { name: escapeHtml(result.name) })
        : t(locale, 'alreadySubscribed'),
      { parse_mode: 'HTML' },
    );
    return;
  }

  const district = await getDistrictBySlug(id);
  if (!district) {
    await ctx.answerCallbackQuery();
    return;
  }
  const result = await addSubscription(chatId, {
    districtSlug: district.slug,
    citySlug: district.citySlug,
  });
  await ctx.answerCallbackQuery();
  track(chatId, 'tg_subscribed', {
    target: 'district',
    district: district.slug,
    already: !result.created,
  });
  await ctx.reply(
    result.created
      ? t(locale, 'subscribedDistrict', { name: escapeHtml(district.name) })
      : t(locale, 'alreadySubscribed'),
    { parse_mode: 'HTML' },
  );
}

/**
 * `/my`: the chat's saved interests, each with a remove button
 * (`unsub:<targetKey>`). Exported so tests can call it with a fake context.
 */
export async function handleMy(ctx: CommandContext<Context>): Promise<void> {
  const chat = await touchChat({ chatId: ctx.chat.id });
  const locale = chat.locale as BotLocale;
  const subs = await listSubscriptions(ctx.chat.id);

  if (!subs.length) {
    await ctx.reply(t(locale, 'mySubsEmpty'));
    return;
  }

  const keyboard = new InlineKeyboard();
  const lines = [t(locale, 'mySubsHeader'), ''];
  for (const sub of subs) {
    lines.push(
      sub.isWaitlist
        ? `• ${escapeHtml(sub.name)} <i>(${t(locale, 'waitlistSuffix')})</i>`
        : `• ${escapeHtml(sub.name)}`,
    );
    keyboard.text(`✖️ ${sub.name}`, `unsub:${sub.targetKey}`).row();
  }

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: keyboard });
}

/** Callback data of the remove buttons in `/my`. */
export const UNSUBSCRIBE_CALLBACK = /^unsub:(.+)$/;

/** A remove-button tap in `/my`: deletes that saved interest. */
export async function handleUnsubscribe(ctx: CallbackQueryContext<Context>): Promise<void> {
  const chatId = ctx.chat!.id;
  const chat = await touchChat({ chatId });
  await removeSubscription(chatId, ctx.match[1]);
  await ctx.answerCallbackQuery();
  track(chatId, 'tg_unsubscribed');
  await ctx.reply(t(chat.locale as BotLocale, 'unsubscribed'));
}

/**
 * A text message that is not a command: a deposit-flow answer, a district name
 * or an address. Exported so tests can call it with a fake context.
 */
export async function handleText(ctx: Filter<Context, 'message:text'>): Promise<void> {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;

  const chat = await touchChat({
    chatId: ctx.chat.id,
    locale: normalizeLocale(ctx.from?.language_code),
  });
  const locale = chat.locale as BotLocale;

  // An answer to a deposit-flow question ("12.09", "4000") comes first, so it
  // is never mistaken for an address.
  if (await handleDepositText(ctx, chat.id, locale, text)) return;
  if (await maybeOfferDeposit(ctx, locale, text)) return;

  // A district name has no single point to geocode, so it is caught before
  // Google sees it — otherwise "Мокотов" came back as "address not found".
  const city = await getCity();
  const districtSlug = city ? matchDistrict(text, city.districts) : null;
  if (districtSlug) {
    await replyDistrict(ctx, locale, districtSlug, ENTRY_SOURCE.typedDistrict);
    return;
  }

  await replyLookup(ctx, locale, text);
}

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId && ctx.message?.text && isRateLimited(chatId)) {
      await ctx.reply(t(normalizeLocale(ctx.from?.language_code), 'tooManyRequests'));
      return;
    }
    await next();
  });

  bot.command('start', handleStart);

  bot.command('help', async (ctx) => {
    const chat = await touchChat({ chatId: ctx.chat.id });
    await ctx.reply(t(chat.locale as BotLocale, 'help'), { parse_mode: 'HTML' });
  });

  bot.command('districts', async (ctx) => {
    const chat = await touchChat({ chatId: ctx.chat.id });
    const locale = chat.locale as BotLocale;
    track(ctx.chat.id, 'tg_districts_viewed');
    const rows = await getDistrictTable();
    await ctx.reply(renderDistrictTable(rows, locale), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  });

  bot.command('deposit', handleDeposit);

  bot.command('cancel', async (ctx) => {
    const chat = await touchChat({ chatId: ctx.chat.id });
    await cancelDepositFlow(ctx, chat.id, chat.locale as BotLocale);
  });

  registerDepositFlow(bot);

  bot.command('my', handleMy);

  bot.command('lang', async (ctx) => {
    const chat = await touchChat({ chatId: ctx.chat.id });
    await ctx.reply(t(chat.locale as BotLocale, 'langPrompt'), {
      reply_markup: new InlineKeyboard().text('Русский', 'lang:ru').text('Українська', 'lang:uk'),
    });
  });

  bot.callbackQuery(/^lang:(ru|uk)$/, async (ctx) => {
    const locale = ctx.match![1] as BotLocale;
    await setChatLocale(ctx.chat!.id, locale);
    await ctx.answerCallbackQuery();
    await ctx.reply(t(locale, 'langSet'));
  });

  bot.callbackQuery('districts', async (ctx) => {
    const chat = await touchChat({ chatId: ctx.chat!.id });
    track(ctx.chat!.id, 'tg_districts_viewed', { via: 'button' });
    const rows = await getDistrictTable();
    await ctx.answerCallbackQuery();
    await ctx.reply(renderDistrictTable(rows, chat.locale as BotLocale), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  });

  bot.callbackQuery(SUBSCRIBE_CALLBACK, handleSubscribe);

  bot.callbackQuery(/^cw:(.+)$/, async (ctx) => {
    const chatId = ctx.chat!.id;
    const chat = await touchChat({ chatId });
    const locale = chat.locale as BotLocale;
    const city = ctx.match![1];

    const result = await addSubscription(chatId, { waitlistCity: city });
    await ctx.answerCallbackQuery();
    track(chatId, 'tg_city_requested', {
      city,
      city_key: result.targetKey,
      waiting: result.waiting,
      already: !result.created,
    });

    const waiting = result.waiting ?? 1;
    await ctx.reply(
      t(locale, result.created ? 'cityWaitAdded' : 'cityWaitAlready', {
        city: escapeHtml(city),
        count: String(waiting),
        people: peopleWord(locale, waiting),
      }),
      { parse_mode: 'HTML' },
    );
  });

  bot.callbackQuery(UNSUBSCRIBE_CALLBACK, handleUnsubscribe);

  // Anything else is treated as an address — the one thing the bot is for.
  bot.on('message:text', handleText);

  bot.catch((error) => {
    console.error('[bot] unhandled error', error);
  });

  return bot;
}

export function getBot(): Bot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (!cached) cached = createBot(token);
  return cached;
}
