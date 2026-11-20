/**
 * Prints the roommate posting kit (`docs/marketing/roommate-posts.md`) to
 * stdout with every `<bot>` placeholder filled from
 * NEXT_PUBLIC_TELEGRAM_BOT_USERNAME, the one place for the production bot's
 * username (D76). It reads the repository and writes nothing into it; redirect
 * stdout to a file outside the repository and copy templates from there:
 *
 *   NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=<production username> npm run bot:posts > ~/roommate-posts.md
 *
 * A value on the command line wins over `.env.local`, which may hold the dev
 * bot's username. Exits 1 with a message when the variable is missing or is
 * not a bot username. Nothing is sent anywhere.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BOT_PLACEHOLDER,
  BOT_USERNAME_ENV,
  botUsernameProblem,
  fillBotPlaceholder,
  isValidBotUsername,
} from '../src/lib/bot/bot-username';

const POSTING_KIT = 'docs/marketing/roommate-posts.md';

function main() {
  const username = process.env[BOT_USERNAME_ENV];
  if (!isValidBotUsername(username)) {
    console.error(
      `${BOT_USERNAME_ENV} ${botUsernameProblem(username)}: set it to the production bot's username without the @.`,
    );
    console.error(
      `Usage: ${BOT_USERNAME_ENV}=<production username> npm run bot:posts > <a file outside the repository>`,
    );
    process.exit(1);
  }

  const kit = readFileSync(join(process.cwd(), POSTING_KIT), 'utf8');
  process.stdout.write(fillBotPlaceholder(kit, username));
  console.error(`${POSTING_KIT}: every ${BOT_PLACEHOLDER} filled with "${username}".`);
}

main();
