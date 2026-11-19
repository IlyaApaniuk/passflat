/**
 * The surfaces that link to the Telegram bot from the website. `source` of `telegram_bot_opened`
 * and the start payload (`botStartPayload`) both come from this union, so a new surface (PRD 2
 * adds `guide_deposit`) is added here once. `roommate` is the "Looking for someone to rent with"
 * block on `/warsaw/roommate` (spec 02 §Find a flatmate).
 */
export type TelegramBotSource = 'checker' | 'empty' | 'roommate';

/**
 * The `/start` payload of a website bot link (spec 02 §Find a flatmate): a building's link
 * carries it into the bot (`b_<id>`), the roommate block opens the roommate entry with its
 * source (`mate_web_roommate`, spec 04 §Start payloads), any other surface sends `web_<source>`.
 */
export function botStartPayload(source: TelegramBotSource, buildingId?: string): string {
  if (buildingId) return `b_${buildingId}`;
  if (source === 'roommate') return 'mate_web_roommate';
  return `web_${source}`;
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
