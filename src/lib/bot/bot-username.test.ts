import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BOT_PLACEHOLDER,
  BOT_USERNAME_ENV,
  botUsernameProblem,
  fillBotPlaceholder,
  isValidBotUsername,
} from './bot-username';
import { parseStartPayload } from './start-payload';

/**
 * One place for the production bot's username (D76, task T116): the posting
 * kit keeps `<bot>` in the repository and `npm run bot:posts` fills it from
 * `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` in a printed copy; no content file holds
 * a bot link with a username.
 */

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

const POSTS = read('docs/marketing/roommate-posts.md');

/** A test fixture, never a real bot. */
const USERNAME = 'passflat_test_bot';

/** The body of a `## ` section of a Markdown file, by its heading. */
function section(markdown: string, heading: string): string {
  const parts = markdown.split(/^## /m).slice(1);
  const part = parts.find(
    (candidate) => candidate.slice(0, candidate.indexOf('\n')).trim() === heading,
  );
  if (part === undefined) throw new Error(`no "## ${heading}" section`);
  return part.slice(part.indexOf('\n') + 1);
}

/** Every file under `dir`, recursively, as a repository-relative path. */
function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(ROOT, path)).isDirectory() ? walk(path) : [path];
  });
}

describe('isValidBotUsername', () => {
  it.each(['passflat_test_bot', 'PassflatBot', 'abbot', 'A_bot', 'x1_BOT', `${'x'.repeat(29)}bot`])(
    'accepts %s',
    (value) => {
      expect(isValidBotUsername(value)).toBe(true);
      expect(botUsernameProblem(value)).toBeNull();
    },
  );

  it.each<[unknown, string]>([
    ['', 'is missing'],
    [undefined, 'is missing'],
    [null, 'is missing'],
    ['@passflat_test_bot', 'without the leading @'],
    ['passflat', 'must end in "bot"'],
    ['botpassflat', 'must end in "bot"'],
    ['xbot', '5 – 32 characters'],
    [`${'x'.repeat(30)}bot`, '5 – 32 characters'],
    ['pass-flat_bot', 'letters, digits and underscores'],
    ['passflat bot', 'letters, digits and underscores'],
    ['t.me/passflat_test_bot', 'letters, digits and underscores'],
    ['https://t.me/passflat_test_bot', 'letters, digits and underscores'],
    ['<bot>', 'letters, digits and underscores'],
    ['123456789:AAEtoken_like_value_bot', 'letters, digits and underscores'],
    [42, 'is not a string'],
    [['passflat_test_bot'], 'is not a string'],
  ])('rejects %j', (value, reason) => {
    expect(isValidBotUsername(value)).toBe(false);
    expect(botUsernameProblem(value)).toContain(reason);
  });

  it('never repeats the rejected value in the reason', () => {
    for (const value of ['@passflat_test_bot', '123456789:AAEtoken_like_value_bot', 'short']) {
      expect(botUsernameProblem(value)).not.toContain(value);
    }
  });
});

describe('fillBotPlaceholder', () => {
  it('replaces every placeholder, in links and mentions alike', () => {
    const filled = fillBotPlaceholder(
      `https://t.me/${BOT_PLACEHOLDER}?start=mate_tg_key\n@${BOT_PLACEHOLDER} and /mate; ${BOT_PLACEHOLDER} again`,
      USERNAME,
    );
    expect(filled).toBe(
      `https://t.me/${USERNAME}?start=mate_tg_key\n@${USERNAME} and /mate; ${USERNAME} again`,
    );
    expect(filled).not.toContain(BOT_PLACEHOLDER);
  });

  it('leaves text without the placeholder as it is', () => {
    const text = 'Send /mate to the bot. <b>bold</b> stays, so does `<bot `.';
    expect(fillBotPlaceholder(text, USERNAME)).toBe(text);
  });

  it('refuses an invalid username, naming the variable and not the value', () => {
    for (const bad of ['', '@passflat_test_bot', 'passflat', 'pass-flat_bot', 'xbot']) {
      const call = () => fillBotPlaceholder(`t.me/${BOT_PLACEHOLDER}`, bad);
      expect(call).toThrow(BOT_USERNAME_ENV);
      if (bad !== '') expect(call).not.toThrow(bad);
    }
  });

  describe('the filled posting kit', () => {
    const filled = fillBotPlaceholder(POSTS, USERNAME);
    const links = [...filled.matchAll(/https:\/\/t\.me\/([^\s?]+)\?start=([^\s)`'"]+)/g)];
    const placeholderLinks = POSTS.match(/t\.me\/<bot>\?start=/g) ?? [];

    it('keeps the placeholder in the repository and none in the printed copy', () => {
      expect(POSTS).toContain(BOT_PLACEHOLDER);
      expect(filled).not.toContain(BOT_PLACEHOLDER);
    });

    it('turns every placeholder link into a link to the username', () => {
      expect(links.length).toBeGreaterThanOrEqual(6 * 3);
      expect(links.length).toBe(placeholderLinks.length);
      for (const [, host] of links) expect(host).toBe(USERNAME);
    });

    it('every filled link still parses as a roommate link', () => {
      for (const [link, , payload] of links) {
        expect(parseStartPayload(payload), link).toMatchObject({ kind: 'roommate' });
      }
    });

    it('mentions the username in the templates without a link', () => {
      expect(filled.match(/@<bot>/g)).toBeNull();
      expect(filled.match(new RegExp(`@${USERNAME}\\b`, 'g'))).toHaveLength(
        (POSTS.match(/@<bot>/g) ?? []).length,
      );
      // The three copied texts of "Without a link" (RU, UK, EN); the prose may mention it too.
      const copiedTexts = [...POSTS.matchAll(/```text\n([\s\S]*?)\n```/g)].map((m) => m[1]);
      expect(copiedTexts.filter((text) => text.includes('@<bot>'))).toHaveLength(3);
    });
  });
});

describe('one place for the username (D76)', () => {
  const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;

  it('the posting kit explains that it keeps the placeholder and how to print a filled copy', () => {
    const howTo = section(POSTS, 'How to use a template');
    expect(howTo).toMatch(/keeps `<bot>` on\s+purpose/);
    expect(howTo).toContain('npm run bot:posts');
    expect(howTo).toContain(`${BOT_USERNAME_ENV}=<production username> npm run bot:posts >`);
    expect(howTo).toMatch(/dev\s+bot's username never lands in a post/);
  });

  it('the posting log holds no placeholder', () => {
    expect(read('docs/marketing/roommate-posting-log.md')).not.toContain(BOT_PLACEHOLDER);
  });

  it('`npm run bot:posts` runs the script with the env flags of `bot:webhook`', () => {
    expect(scripts['bot:webhook']).toContain('scripts/tg-webhook.ts');
    expect(scripts['bot:posts']).toBe(
      scripts['bot:webhook'].replace('scripts/tg-webhook.ts', 'scripts/tg-posts.ts'),
    );
    expect(scripts['bot:posts']).toContain('scripts/tg-posts.ts');
  });

  it('the script reads the variable and the kit, prints, and writes nothing', () => {
    const script = read('scripts/tg-posts.ts');
    expect(script).toContain(`process.env[BOT_USERNAME_ENV]`);
    expect(script).toContain('docs/marketing/roommate-posts.md');
    expect(script).toContain('process.stdout.write(fillBotPlaceholder(');
    expect(script).toContain('process.exit(1)');
    expect(script).not.toMatch(/writeFile|createWriteStream|appendFile|renameSync|copyFile/);
    expect(script).not.toMatch(/grammy|fetch\(|https?:\/\/api\.telegram/);
  });

  it('the bot README and the workflow doc name the variable and the step', () => {
    const goingLive = section(read('src/lib/bot/README.md'), 'Going live');
    expect(goingLive).toContain(BOT_USERNAME_ENV);
    expect(goingLive).toContain('npm run bot:posts');
    expect(goingLive).toMatch(/one\s+place/);

    const effects = section(
      read('docs/development-workflow.md'),
      'Commands with additional effects',
    );
    expect(effects).toMatch(/^\|\s*`npm run bot:posts`\s*\|.*\|\s*$/m);
    expect(effects).toMatch(/`npm run bot:posts`[^\n]*(?:prints|Prints)[^\n]*no external effect/);
  });

  it('the environment is the only place: no module hardcodes a username next to the variable', () => {
    const module_ = read('src/lib/bot/bot-username.ts');
    expect(module_).toContain(`'${BOT_USERNAME_ENV}'`);
    expect(module_).not.toMatch(/[A-Za-z0-9_]bot['"`]/i);
  });
});

describe('no hardcoded bot link outside the placeholder', () => {
  /**
   * The content files the owner or the bot publish: the marketing kit and
   * guides, the bot's copy and the website's copy. Test fixtures
   * (`passflat_test_bot` in `*.test.ts`) are not in this set.
   */
  const FILES = [
    ...walk('docs/marketing'),
    'src/lib/bot/texts.ts',
    'src/lib/bot/deposit-texts.ts',
    'src/lib/bot/roommate-texts.ts',
    ...walk('src/i18n/messages'),
  ];

  /** A `t.me/…` link whose host is not the placeholder, an environment value or a non-bot path. */
  const botLinks = (text: string) =>
    text.match(/\bt(?:elegram)?\.me\/(?!<bot>|\$\{|share\/|joinchat\/|\+)[^\s)`'"<]+/g) ?? [];
  /** An `@…bot` mention that is not the placeholder. */
  const botMentions = (text: string) => text.match(/@(?!<bot>)[A-Za-z0-9_]{2,29}bot\b/gi) ?? [];

  it('scans the posting kit, the three bot text files and the four locale files', () => {
    expect(FILES).toContain('docs/marketing/roommate-posts.md');
    expect(FILES).toContain('docs/marketing/roommate-posting-log.md');
    expect(FILES.filter((file) => file.startsWith('src/i18n/messages/'))).toHaveLength(4);
    expect(FILES).toHaveLength(new Set(FILES).size);
  });

  it.each(FILES.map((file) => [file]))(
    '%s holds no bot link or mention with a username',
    (file) => {
      const text = read(file);
      expect(botLinks(text)).toEqual([]);
      expect(botMentions(text)).toEqual([]);
    },
  );

  it('the scan catches a link and a mention with a username, and allows the placeholder', () => {
    expect(botLinks(`https://t.me/${USERNAME}?start=mate_tg_key`)).toHaveLength(1);
    expect(botLinks(`see t.me/${USERNAME}`)).toHaveLength(1);
    expect(botLinks(`https://telegram.me/${USERNAME}`)).toHaveLength(1);
    expect(botMentions(`найди бота @${USERNAME} и отправь /mate`)).toHaveLength(1);
    expect(botMentions('@PassflatBot')).toHaveLength(1);

    const allowed = [
      'https://t.me/<bot>?start=mate_tg_group',
      '@<bot>',
      '@BotFather',
      'https://t.me/share/url?url=x',
      'https://t.me/+invite',
      '`https://t.me/${username}?start=${payload}`',
    ].join(' ');
    expect(botLinks(allowed)).toEqual([]);
    expect(botMentions(allowed)).toEqual([]);
  });
});
