import { describe, expect, it } from 'vitest';

import { brokenRules, readMarketingDoc, section, textBlocks } from './marketing-docs.test-support';
import {
  BOT_PROFILE,
  BOT_PROFILE_LANGUAGES,
  BOT_PROFILE_LIMITS,
  botProfileLimitBreaches,
  type BotProfileTexts,
} from './profile-texts';

/**
 * The bot profile texts (D77, spec 05 §Posting kit): within the Bot API limits, under the
 * posting kit's honesty rules, and equal to the human-readable copy in
 * `docs/marketing/bot-profile.md`.
 */

const PROFILE_DOC = readMarketingDoc('bot-profile.md');
const KEYS = Object.keys(BOT_PROFILE_LIMITS) as (keyof BotProfileTexts)[];
const allTexts = BOT_PROFILE_LANGUAGES.flatMap((language) =>
  KEYS.map((key) => ({ language, key, text: BOT_PROFILE[language][key] })),
);

describe('bot profile texts: shape and limits', () => {
  it('has the Bot API limits: name 64, description 512, short description 120', () => {
    expect(BOT_PROFILE_LIMITS).toEqual({ name: 64, description: 512, shortDescription: 120 });
  });

  it('has the default (RU), uk, en and pl, each with a name, a description and a short description', () => {
    expect(BOT_PROFILE_LANGUAGES).toEqual(['default', 'uk', 'en', 'pl']);
    expect(Object.keys(BOT_PROFILE).sort()).toEqual(['default', 'en', 'pl', 'uk']);
    for (const { language, key, text } of allTexts) {
      expect(text.trim(), `${language} ${key}`).not.toBe('');
    }
  });

  it('gives pl the EN texts (D68)', () => {
    expect(BOT_PROFILE.pl).toEqual(BOT_PROFILE.en);
  });

  it('keeps every text of every language within its limit', () => {
    for (const { language, key, text } of allTexts) {
      expect(text.length, `${language} ${key}`).toBeLessThanOrEqual(BOT_PROFILE_LIMITS[key]);
    }
    expect(botProfileLimitBreaches(BOT_PROFILE)).toEqual([]);
  });

  it('the limit check fails on a 513-character description and names the language and key', () => {
    const tooLong = { ...BOT_PROFILE, uk: { ...BOT_PROFILE.uk, description: 'а'.repeat(513) } };
    expect(botProfileLimitBreaches(tooLong)).toEqual(['uk description: 513 > 512']);
    const atLimit = { ...BOT_PROFILE, uk: { ...BOT_PROFILE.uk, description: 'а'.repeat(512) } };
    expect(botProfileLimitBreaches(atLimit)).toEqual([]);
    const longName = { ...BOT_PROFILE, default: { ...BOT_PROFILE.default, name: 'x'.repeat(65) } };
    expect(botProfileLimitBreaches(longName)).toEqual(['default name: 65 > 64']);
    const longAbout = {
      ...BOT_PROFILE,
      en: { ...BOT_PROFILE.en, shortDescription: 'x'.repeat(121) },
    };
    expect(botProfileLimitBreaches(longAbout)).toEqual(['en shortDescription: 121 > 120']);
  });
});

describe('bot profile texts: what they say', () => {
  it('names the costs, the deposit helper and roommate matching in each description', () => {
    for (const language of BOT_PROFILE_LANGUAGES) {
      const { description } = BOT_PROFILE[language];
      expect(description, language).toMatch(/\/mate\b/);
      expect(description, language).toMatch(/\/deposit\b/);
      expect(description, language).toMatch(/адрес|address/i);
    }
    expect(BOT_PROFILE.en.description).toMatch(/deposit[^\n]*Russian or Ukrainian/);
  });

  it('promises no match, date or result, names no figure and never says "verified"', () => {
    for (const { language, key, text } of allTexts) {
      expect(brokenRules(text), `${language} ${key}: ${text}`).toEqual([]);
    }
  });
});

describe('docs/marketing/bot-profile.md is the copy of the module', () => {
  it('says the module is the source of truth and the owner runs npm run bot:profile after --dry-run', () => {
    const header = PROFILE_DOC.split(/^## /m)[0];
    expect(header).toMatch(/Draft for the owner/);
    expect(header).toMatch(/source of\s+truth is `src\/lib\/bot\/profile-texts\.ts`/);
    expect(header).toContain('`npm run bot:profile`');
    expect(header).toContain('`npm run bot:profile -- --dry-run`');
    expect(header).toMatch(/instead of in\s+BotFather/);
  });

  it.each([
    ['Name', 'name'],
    ['Description', 'description'],
    ['About', 'shortDescription'],
  ] as const)('the "%s" blocks equal the RU (default), UK and EN %s', (heading, key) => {
    const blocks = textBlocks(section(PROFILE_DOC, heading));
    expect(blocks).toEqual([BOT_PROFILE.default[key], BOT_PROFILE.uk[key], BOT_PROFILE.en[key]]);
  });

  it('the copy check notices a changed text', () => {
    const changed = PROFILE_DOC.replace('Free. The bot speaks', 'Free! The bot speaks');
    expect(changed).not.toBe(PROFILE_DOC);
    expect(textBlocks(section(changed, 'Description'))[2]).not.toBe(BOT_PROFILE.en.description);
  });
});
