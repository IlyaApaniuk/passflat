/**
 * One place for the bot's username (D76): `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`,
 * the variable the website's bot links already read. The posting kit
 * (`docs/marketing/roommate-posts.md`) keeps a `<bot>` placeholder in the
 * repository, so no username is committed before the owner chooses one and the
 * dev bot's username never lands in a post; `scripts/tg-posts.ts`
 * (`npm run bot:posts`) prints a filled copy with the functions below.
 */

export const BOT_USERNAME_ENV = 'NEXT_PUBLIC_TELEGRAM_BOT_USERNAME';

/** The placeholder the posting kit holds in `t.me/<bot>` links and `@<bot>` mentions. */
export const BOT_PLACEHOLDER = '<bot>';

/** Telegram's rule for a bot username: 5 – 32 characters of `[A-Za-z0-9_]`, ending in `bot`. */
const USERNAME_CHARS = /^[A-Za-z0-9_]+$/;
const MIN_LENGTH = 5;
const MAX_LENGTH = 32;
const BOT_SUFFIX = /bot$/i;

/**
 * Why `value` is not a bot username, for a message, or null when it is one.
 * The reason never repeats the value: a token pasted into the wrong variable
 * must not be echoed.
 */
export function botUsernameProblem(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return 'is missing';
  if (typeof value !== 'string') return 'is not a string';
  if (value.startsWith('@')) return 'must be written without the leading @';
  if (!USERNAME_CHARS.test(value)) return 'may hold only letters, digits and underscores';
  if (value.length < MIN_LENGTH || value.length > MAX_LENGTH) {
    return `must be ${MIN_LENGTH} – ${MAX_LENGTH} characters long`;
  }
  if (!BOT_SUFFIX.test(value)) return 'must end in "bot"';
  return null;
}

/** Telegram's rule: 5 – 32 characters of `[A-Za-z0-9_]`, ending in `bot` in any case, no leading `@`. */
export function isValidBotUsername(value: unknown): value is string {
  return botUsernameProblem(value) === null;
}

/**
 * `markdown` with every `<bot>` replaced by `username`, in `t.me/<bot>` links
 * and `@<bot>` mentions alike. Refuses anything that is not a bot username, so
 * a missing variable never prints a kit with an empty link host.
 */
export function fillBotPlaceholder(markdown: string, username: string): string {
  const problem = botUsernameProblem(username);
  if (problem !== null) throw new Error(`${BOT_USERNAME_ENV} ${problem}.`);
  return markdown.split(BOT_PLACEHOLDER).join(username);
}
