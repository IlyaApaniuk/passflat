/**
 * The surfaces that link to the Telegram bot from the website. `source` of `telegram_bot_opened`
 * and the `web_<source>` start payload both come from this union, so a new surface (PRD 2 adds
 * `guide_deposit`) is added here once.
 */
export type TelegramBotSource = 'checker' | 'empty';

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
