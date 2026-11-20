/**
 * Local bot runner: long polling instead of a webhook, so the bot can be talked
 * to from a laptop with no tunnel. Production always runs the webhook route.
 *
 *   npm run bot:dev
 */
async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is missing — add it to .env.local');
    process.exit(1);
  }

  const { createBot } = await import('../src/lib/bot/bot');
  const bot = createBot(token);

  // A webhook registered against production would swallow every update, so
  // polling drops it first; re-register with `npm run bot:webhook` afterwards.
  await bot.api.deleteWebhook({ drop_pending_updates: true });

  const me = await bot.api.getMe();
  console.log(`Polling as @${me.username}. Ctrl+C to stop.`);

  process.once('SIGINT', () => void bot.stop());
  process.once('SIGTERM', () => void bot.stop());

  await bot.start({ onStart: () => console.log('Ready.') });
}

void main();
