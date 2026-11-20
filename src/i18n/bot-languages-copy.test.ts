import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 04 §Website bot languages (PRD 3 FR-39, D50, D63): where website copy
// names the bot's languages, it says English, Russian and Ukrainian in all
// four locales. A line that speaks only of the deposit helper keeps "Russian
// and Ukrainian", because the deposit flow has no English (D63).

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];
type BotLanguage = 'en' | 'ru' | 'uk';
type Messages = Record<string, unknown>;

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as Messages,
  ]),
) as Record<Locale, Messages>;

function leaves(value: unknown, prefix = ''): Array<[string, string]> {
  if (value === null || typeof value !== 'object') return [[prefix, String(value)]];
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, prefix ? `${prefix}.${key}` : key),
  );
}

/** How each locale names the bot's three languages (stems, so every case form matches). */
const LANGUAGE_NAMES: Record<Locale, Record<BotLanguage, RegExp>> = {
  en: { en: /\bEnglish\b/, ru: /\bRussian\b/, uk: /\bUkrainian\b/ },
  pl: { en: /angielsk|English/i, ru: /rosyjsk/i, uk: /ukraińsk/i },
  ru: {
    en: /английск|англоязычн|English/i,
    ru: /русск/i,
    uk: /украинск|украиноязычн|українськ/i,
  },
  uk: {
    en: /англійськ|англомовн|English/i,
    ru: /російськ|російськомовн|русск/i,
    uk: /українськ|україномовн/i,
  },
};

/** A word for the bot (any case form) or Telegram; Cyrillic needs an explicit word start. */
const BOT_WORD: Record<Locale, RegExp> = {
  en: /\bbots?\b|telegram/i,
  pl: /\bbo(t[a-z]*|cie)\b|telegram/i,
  ru: /(^|[^а-яёa-z])бот|telegram/i,
  uk: /(^|[^а-яіїєґa-z'ʼ])бот|telegram/i,
};

/**
 * Lines that speak only of the deposit helper (D63): they name Russian and
 * Ukrainian and never English. None on the website as of 2026-11-19.
 */
const DEPOSIT_ONLY_LINES: Record<string, string> = {};

/** Lines that name languages of something other than the bot. */
const NOT_BOT_LINES: Record<string, string> = {
  'landing.tools.templatesDescription': 'the languages of the document templates',
  'helpCenter.general.a4': 'the languages of the website',
  'documents.resources.intro': 'the languages of the template PDFs',
};

type Line = { path: string; value: string; named: BotLanguage[] };
type Classified = {
  general: Line[];
  depositOnly: Line[];
  violations: string[];
};

function classify(
  locale: Locale,
  dictionary: Messages,
  depositOnly: Record<string, string> = DEPOSIT_ONLY_LINES,
  notBot: Record<string, string> = NOT_BOT_LINES,
): Classified {
  const result: Classified = { general: [], depositOnly: [], violations: [] };
  for (const [path, value] of leaves(dictionary)) {
    const named = (['en', 'ru', 'uk'] as const).filter((language) =>
      LANGUAGE_NAMES[locale][language].test(value),
    );
    if (named.length === 0) continue;
    const line = { path, value, named };
    if (path in notBot) continue;
    const isBotLine = BOT_WORD[locale].test(value) || /bot|telegram/i.test(path);

    if (path in depositOnly) {
      result.depositOnly.push(line);
      if (named.includes('en') || !named.includes('ru') || !named.includes('uk')) {
        result.violations.push(
          `${locale} ${path}: a deposit-only line names Russian and Ukrainian, not English (D63)`,
        );
      }
    } else if (isBotLine) {
      result.general.push(line);
      if (named.length < 3) {
        result.violations.push(
          `${locale} ${path}: a bot line names English, Russian and Ukrainian (FR-39); ` +
            `a deposit-only line goes into DEPOSIT_ONLY_LINES`,
        );
      }
    } else {
      result.violations.push(
        `${locale} ${path}: names a language without the bot; ` +
          `add it to NOT_BOT_LINES with a reason, or say "bot" in it`,
      );
    }
  }
  return result;
}

describe('website copy names the bot languages (spec 04 §Website bot languages)', () => {
  it.each(LOCALES)('%s: every bot-language line follows FR-39 and D63', (locale) => {
    expect(classify(locale, messages[locale]).violations).toEqual([]);
  });

  it('finds the roommate block line in every locale, with all three languages', () => {
    for (const locale of LOCALES) {
      const general = classify(locale, messages[locale]).general;
      expect(
        general.map((line) => line.path),
        locale,
      ).toContain('listings.findFlatmate.languages');
      for (const line of general) expect(line.named, `${locale} ${line.path}`).toHaveLength(3);
    }
  });

  it('reads the checker hint as a general bot line with all three languages (FR-14)', () => {
    for (const locale of LOCALES) {
      const hint = classify(locale, messages[locale]).general.find(
        (line) => line.path === 'checker.costs.telegramHint',
      );
      expect(hint?.named, locale).toEqual(['en', 'ru', 'uk']);
    }
  });

  it('the same keys are bot-language lines in all four locales', () => {
    const keys = (locale: Locale) => {
      const { general, depositOnly } = classify(locale, messages[locale]);
      return [...general, ...depositOnly].map((line) => line.path).sort();
    };
    for (const locale of LOCALES) expect(keys(locale), locale).toEqual(keys('en'));
  });

  it('every listed exception exists in all four locales', () => {
    for (const locale of LOCALES) {
      const paths = new Set(leaves(messages[locale]).map(([path]) => path));
      for (const path of [...Object.keys(NOT_BOT_LINES), ...Object.keys(DEPOSIT_ONLY_LINES)]) {
        expect(paths.has(path), `${locale} ${path}`).toBe(true);
      }
    }
  });

  describe('the check itself', () => {
    const sample = (value: string) => ({ block: { languages: value } });

    it.each<[Locale, string]>([
      ['en', 'The bot speaks Russian and Ukrainian.'],
      ['pl', 'Bot mówi po rosyjsku i ukraińsku.'],
      ['ru', 'Бот говорит по-русски и по-украински.'],
      ['uk', 'Бот говорить російською та українською.'],
      ['ru', 'Telegram-бот на русском и украинском.'],
      ['uk', 'Відкрий бота: він говорить російською та українською.'],
      ['pl', 'W bocie: po rosyjsku i ukraińsku.'],
    ])('%s: fails on a general bot line without English: %s', (locale, value) => {
      const { violations, general } = classify(locale, sample(value), {}, {});
      expect(general.map((line) => line.path)).toEqual(['block.languages']);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('FR-39');
    });

    it.each<[Locale, string]>([
      ['en', 'The bot speaks English, Russian and Ukrainian.'],
      ['pl', 'Bot mówi po angielsku, rosyjsku i ukraińsku.'],
      ['ru', 'Бот говорит по-английски, по-русски и по-украински.'],
      ['uk', 'Бот говорить англійською, російською та українською.'],
    ])('%s: passes a general bot line with all three: %s', (locale, value) => {
      expect(classify(locale, sample(value), {}, {}).violations).toEqual([]);
    });

    it('a deposit-only line keeps Russian and Ukrainian and fails with English', () => {
      const listed = { 'block.languages': 'the deposit helper' };
      expect(
        classify('en', sample('The deposit helper speaks Russian and Ukrainian.'), listed, {})
          .violations,
      ).toEqual([]);
      expect(
        classify(
          'en',
          sample('The deposit helper speaks English, Russian and Ukrainian.'),
          listed,
          {},
        ).violations[0],
      ).toContain('D63');
    });

    it('a language line without the bot must be listed', () => {
      const value = 'Templates in Polish and Russian.';
      expect(classify('en', sample(value), {}, {}).violations[0]).toContain('NOT_BOT_LINES');
      expect(
        classify('en', sample(value), {}, { 'block.languages': 'templates' }).violations,
      ).toEqual([]);
    });

    it('a Cyrillic word that only contains «бот» is not the bot', () => {
      const value = 'Шаблоны работают на польском и русском.';
      expect(classify('ru', sample(value), {}, {}).violations[0]).toContain('NOT_BOT_LINES');
    });
  });
});
