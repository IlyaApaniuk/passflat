/**
 * Sets the bot's name, description, short description (default RU, plus `uk`, `en` and `pl`)
 * and profile photo through the Bot API (D77). The texts are `src/lib/bot/profile-texts.ts`,
 * the photo `public/bot-avatar.png`. Owner only: it changes the bot that TELEGRAM_BOT_TOKEN
 * belongs to.
 *
 *   npm run bot:profile -- --dry-run   # prints every call, sends nothing, needs no token
 *   TELEGRAM_BOT_TOKEN=<token> npm run bot:profile
 *
 * The token comes from the environment only; a value on the command line wins over
 * `.env.local`, which holds the dev bot's token (@passflatdev_bot).
 */
import { join } from 'node:path';

import { Bot } from 'grammy';

import { applyBotProfile } from '../src/lib/bot/profile';

const PHOTO_PATH = join(process.cwd(), 'public/bot-avatar.png');

async function main() {
  if (process.argv.slice(2).includes('--dry-run')) {
    await applyBotProfile(undefined, { dryRun: true, photoPath: PHOTO_PATH });
    console.log('Dry run: nothing was sent.');
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is missing.');
    console.error(
      'Usage: TELEGRAM_BOT_TOKEN=<token> npm run bot:profile (try npm run bot:profile -- --dry-run first)',
    );
    process.exit(1);
  }

  const bot = new Bot(token);
  const me = await bot.api.getMe();
  console.log(`Setting the profile of @${me.username}.`);
  await applyBotProfile(bot.api, { dryRun: false, photoPath: PHOTO_PATH });
  console.log('Bot profile set.');
}

main().catch((error: unknown) => {
  // Only the message: a GrammyError's payload holds the request.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
