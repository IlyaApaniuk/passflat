/**
 * Registers (or clears) the Telegram webhook and publishes the command menu.
 *
 *   npm run bot:webhook -- https://passflat.com
 *   npm run bot:webhook -- --delete
 */
import { Bot } from 'grammy';

const COMMANDS = [
  { command: 'districts', description: 'Районы Варшавы по расходам' },
  { command: 'deposit', description: 'Залог: сколько и как часто возвращают' },
  { command: 'my', description: 'Мои подписки' },
  { command: 'lang', description: 'Язык / Мова' },
  { command: 'help', description: 'Что умеет бот' },
];

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

  const info = await bot.api.getWebhookInfo();
  console.log(`Webhook set: ${info.url}`);
}

void main();
