import { Bot, InlineKeyboard, type Context } from 'grammy';

import { getCityCostStats } from '@/lib/cost-baselines';
import { trackServerEvent } from '@/lib/posthog-server';

import { matchDistrict } from './districts';
import { geocodeAddress } from './geocode';
import {
  escapeHtml,
  money,
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
  MIN_AREA_REPORTS,
  type AddressLookup,
} from './lookup';
import {
  addSubscription,
  listSubscriptions,
  removeSubscription,
  setChatLocale,
  touchChat,
} from './store';
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

function track(chatId: number, event: string, properties?: Record<string, unknown>) {
  trackServerEvent(`tg_${chatId}`, event, { source: 'telegram_bot', ...properties });
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
  if (!geo) {
    track(chatId, 'tg_address_not_found', { query });
    await ctx.reply(t(locale, 'addressNotFound'), { parse_mode: 'HTML' });
    return;
  }

  const lookup = await lookupAddress(geo);
  if (!lookup) {
    // Another city is demand data, not a miss: offer a one-tap waitlist right
    // here, so the ask needs no email and the reply can come back to this chat.
    const city = geo.city;
    track(chatId, 'tg_address_outside_city', { query, city });
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

  track(chatId, 'tg_address_checked', {
    level: lookup.level,
    district: lookup.districtSlug,
    has_building: lookup.buildingId != null,
    report_count: lookup.building?.reportCount ?? 0,
  });

  await ctx.reply(renderLookup(lookup, locale), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: lookupKeyboard(lookup, locale),
  });
}

async function replyDistrict(ctx: Context, locale: BotLocale, slug: string) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const [district, table, city] = await Promise.all([
    getDistrictBySlug(slug),
    getDistrictTable(),
    getCity(),
  ]);
  if (!district) return;
  const cityStats = city ? await getCityCostStats(city.id) : null;

  const position = table.findIndex((row) => row.slug === slug);
  track(chatId, 'tg_district_checked', { district: slug, report_count: district.stats.count });

  const keyboard = new InlineKeyboard()
    .text(t(locale, 'subscribeDistrict', { district: district.name }), `sub:d:${district.slug}`)
    .row()
    .text(t(locale, 'btnDistricts'), 'districts')
    .url(t(locale, 'btnSubmit'), webLink(`/${district.citySlug}/costs/submit`, locale, 'district'));

  await ctx.reply(
    renderDistrict(
      {
        name: district.name,
        stats: district.stats,
        deposit: district.deposit,
        rank: position >= 0 ? { position: position + 1, total: table.length } : null,
        cityMedian: cityStats?.total.median ?? null,
      },
      locale,
      MIN_AREA_REPORTS,
    ),
    { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: keyboard },
  );
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

  bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    const payload = commandPayload(ctx);
    const chat = await touchChat({
      chatId,
      locale: normalizeLocale(ctx.from?.language_code),
      startPayload: payload || null,
    });
    const locale = chat.locale as BotLocale;

    track(chatId, 'tg_bot_started', { payload: payload || null, is_new: chat.isNew });

    // A deep link can carry a building the user already looked at on the site
    // ("b_<uuid>"), so honour it instead of asking for an address they just typed.
    if (payload.startsWith('d_')) {
      const districtSlug = payload.slice(2);
      const district = await getDistrictBySlug(districtSlug);
      if (district) {
        await addSubscription(chatId, { districtSlug: district.slug, citySlug: district.citySlug });
        await ctx.reply(t(locale, 'subscribedDistrict', { name: district.name }), {
          parse_mode: 'HTML',
        });
        return;
      }
    }

    await ctx.reply(t(locale, payload ? 'startAfterPayload' : 'start'), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  });

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

  bot.command('deposit', async (ctx) => {
    const chat = await touchChat({ chatId: ctx.chat.id });
    const locale = chat.locale as BotLocale;
    track(ctx.chat.id, 'tg_deposit_viewed');

    const facts = await getCityDepositFacts();
    const lines = [t(locale, 'depositHeader'), ''];

    if (facts && facts.deposit.answered >= 3) {
      lines.push(
        t(locale, 'depositStats', {
          amount: money(facts.deposit.medianDeposit) ?? '—',
          pct: String(Math.round((facts.deposit.returned / facts.deposit.answered) * 100)),
          answered: String(facts.deposit.answered),
        }),
      );
    } else {
      lines.push(t(locale, 'depositNoData'));
    }

    lines.push('', t(locale, 'depositAdvice'), '', t(locale, 'cardFooter'));

    await ctx.reply(lines.join('\n'), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: new InlineKeyboard().url(
        t(locale, 'btnSubmit'),
        webLink('/warsaw/costs/submit', locale, 'deposit'),
      ),
    });
  });

  bot.command('my', async (ctx) => {
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
  });

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

  bot.callbackQuery(/^sub:(b|d):(.+)$/, async (ctx) => {
    const chatId = ctx.chat!.id;
    const chat = await touchChat({ chatId });
    const locale = chat.locale as BotLocale;
    const [, kind, id] = ctx.match!;

    if (kind === 'b') {
      const result = await addSubscription(chatId, { buildingId: id });
      await ctx.answerCallbackQuery();
      track(chatId, 'tg_subscribed', { target: 'building', already: !result.created });
      await ctx.reply(
        result.created
          ? t(locale, 'subscribedBuilding', { name: result.name })
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
        ? t(locale, 'subscribedDistrict', { name: district.name })
        : t(locale, 'alreadySubscribed'),
      { parse_mode: 'HTML' },
    );
  });

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

  bot.callbackQuery(/^unsub:(.+)$/, async (ctx) => {
    const chatId = ctx.chat!.id;
    const chat = await touchChat({ chatId });
    await removeSubscription(chatId, ctx.match![1]);
    await ctx.answerCallbackQuery();
    track(chatId, 'tg_unsubscribed');
    await ctx.reply(t(chat.locale as BotLocale, 'unsubscribed'));
  });

  // Anything else is treated as an address — the one thing the bot is for.
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const chat = await touchChat({
      chatId: ctx.chat.id,
      locale: normalizeLocale(ctx.from?.language_code),
    });
    const locale = chat.locale as BotLocale;

    // A district name has no single point to geocode, so it is caught before
    // Google sees it — otherwise "Мокотов" came back as "address not found".
    const city = await getCity();
    const districtSlug = city ? matchDistrict(text, city.districts) : null;
    if (districtSlug) {
      await replyDistrict(ctx, locale, districtSlug);
      return;
    }

    await replyLookup(ctx, locale, text);
  });

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
