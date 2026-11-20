/**
 * The surfaces that carry the shared flatmate callout (spec 08 §Flatmate callout, PRD 4 FR-8).
 * `report` is the data report `/blog/warsaw-rent-prices`, kept apart from the guides so the
 * readout can tell them apart.
 */
export const FLATMATE_SURFACES = [
  'home',
  'building',
  'district',
  'hub',
  'calculator',
  'guide',
  'report',
] as const;

export type FlatmateSurface = (typeof FLATMATE_SURFACES)[number];

/**
 * The surfaces that link to the Telegram bot from the website. `source` of `telegram_bot_opened`
 * and the start payload (`botStartPayload`) both come from this union, so a new surface (PRD 2
 * adds `guide_deposit`) is added here once. `roommate` is the "Looking for someone to rent with"
 * block on `/warsaw/roommate` (spec 02 §Find a flatmate); the flatmate surfaces are the
 * callout's bot button (spec 01 §PRD 4 values).
 */
export type TelegramBotSource = 'checker' | 'empty' | 'roommate' | FlatmateSurface;

/**
 * The `/start` payload of a website bot link (spec 02 §Find a flatmate, spec 08 §Flatmate
 * callout): a building's link carries it into the bot (`b_<id>`); the checker and its empty state
 * send `web_<source>`; the roommate block and every flatmate callout open the roommate entry with
 * their surface (`mate_web_<source>`, which the bot reads as `entry_detail`, spec 04 §Start
 * payloads).
 */
export function botStartPayload(source: TelegramBotSource, buildingId?: string): string {
  if (buildingId) return `b_${buildingId}`;
  if (source === 'checker' || source === 'empty') return `web_${source}`;
  return `mate_web_${source}`;
}

/** The `t.me` deep link for `username` with the payload of `botStartPayload`. */
export function botStartUrl(
  username: string,
  source: TelegramBotSource,
  buildingId?: string,
): string {
  return `https://t.me/${username}?start=${encodeURIComponent(botStartPayload(source, buildingId))}`;
}

/**
 * Properties of `telegram_bot_opened` (spec 01, FR-11), fired when a visitor clicks the website's
 * bot link. `has_building_context` tells a link that carries a building into the bot from one
 * that does not. Page context (`page_type`, `locale`, `city`, ...) is added by the `before_send`
 * hook, not here.
 */
export function telegramBotOpenedProperties(
  source: TelegramBotSource,
  buildingId?: string,
): { source: TelegramBotSource; has_building_context: boolean } {
  return { source, has_building_context: Boolean(buildingId) };
}
