/**
 * Registers (or clears) the Telegram webhook and publishes the command menu.
 *
 *   npm run bot:webhook -- https://passflat.com
 *   npm run bot:webhook -- --delete
 */
import { Bot } from 'grammy';

import { COMMAND_MENU } from '../src/lib/bot/texts';

/**
 * The command menu, copy in `texts.ts`: RU is the default menu, UK is shown to
 * Telegram clients with `language_code: 'uk'`. Adds /cancel, /my is "saved
 * interests" (spec 04 §Promises and capabilities).
 */
const COMMANDS = COMMAND_MENU.ru;
const COMMANDS_UK = COMMAND_MENU.uk;

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is missing.');
    process.exit(1);
  }

  const bot = new Bot(token);
  const arg = process.argv[2];

  if (arg === '--delete') {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    console.log('Webhook deleted.');
    return;
  }

  const base = (arg || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  if (!base.startsWith('https://')) {
    console.error('Pass an https base URL, e.g. npm run bot:webhook -- https://passflat.com');
    process.exit(1);
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    console.error('TELEGRAM_WEBHOOK_SECRET is missing — the webhook route rejects unsigned calls.');
    process.exit(1);
  }

  await bot.api.setWebhook(`${base}/api/telegram/webhook`, {
    secret_token: secret,
    allowed_updates: ['message', 'callback_query', 'my_chat_member'],
  });
  await bot.api.setMyCommands(COMMANDS);
  await bot.api.setMyCommands(COMMANDS_UK, { language_code: 'uk' });

  const info = await bot.api.getWebhookInfo();
  console.log(`Webhook set: ${info.url}`);
}

void main();
