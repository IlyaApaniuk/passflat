import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shared by the tests that parse `docs/marketing/` (the roommate posting kit and the bot
 * profile): the Markdown helpers and the honesty rules of every text the owner copies or the
 * bot profile script sets (spec 05 §Posting kit, D77). One list, so both tests check the same
 * rules.
 */

/** A file under `docs/marketing/`, as text. */
export function readMarketingDoc(file: string): string {
  return readFileSync(join(process.cwd(), 'docs/marketing', file), 'utf8');
}

/** The body of each `## ` section, by its heading. */
function sections(markdown: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of markdown.split(/^## /m).slice(1)) {
    const newline = part.indexOf('\n');
    result.set(part.slice(0, newline).trim(), part.slice(newline + 1));
  }
  return result;
}

export function section(markdown: string, heading: string): string {
  const body = sections(markdown).get(heading);
  if (body === undefined) throw new Error(`no "## ${heading}" section`);
  return body;
}

/** The contents of every ```text block: the texts the owner copies. */
export function textBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```text\n([\s\S]*?)\n```/g)].map((match) => match[1]);
}

/**
 * What no copied text may say (spec 05 §Posting kit): a "verified" claim, a
 * guarantee or a promise to find someone, a date of opening, "market", a
 * comparison, or a figure. The only numbers are the 18+ rule and the 30-day
 * profile life.
 */
const FORBIDDEN: { rule: string; pattern: RegExp }[] = [
  { rule: 'verified', pattern: /verif|checked|провер|перевір|подтвержд|підтвердж/i },
  { rule: 'guarantee', pattern: /guarant|гарант/i },
  {
    rule: 'promise to find',
    pattern: /(?:we|you)(?:'ll|’ll|\s+will)\s+find|найд[её](?:м|шь)|знайдемо|знайдеш/i,
  },
  {
    rule: 'opening promise',
    pattern: /\bwill open\b|\bopens (?:on|in)\b|откро[её]тся|відкриється/i,
  },
  { rule: 'market', pattern: /\bmarket|рын(?:ок|оч|к)|рин(?:ок|ков|ку)/i },
  { rule: 'comparison', pattern: /cheaper|дешевл|дешевш/i },
  {
    rule: 'month',
    pattern:
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/,
  },
  {
    rule: 'month',
    pattern:
      /январ|феврал|(?:^|[^\p{L}])(?:март[аеу]?|ма[яе])(?!\p{L})|апрел|июн|июл|август|сентябр|октябр|ноябр|декабр|січ(?:ень|ня|ні)|лют(?:ий|ого|ому)|берез(?:ень|ня|ні)|квіт(?:ень|ня|ні)|трав(?:ень|ня|ні)|черв(?:ень|ня|ні)|лип(?:ень|ня|ні)|серп(?:ень|ня|ні)|верес(?:ень|ня|ні)|жовт(?:ень|ня|ні)|листопад|груд(?:ень|ня|ні)/iu,
  },
];
const ALLOWED_NUMBERS = new Set(['18', '30']);

/** The rules a text breaks; links are left out of the number check (a group key may hold digits). */
export function brokenRules(text: string): string[] {
  const broken = FORBIDDEN.filter(({ pattern }) => pattern.test(text)).map(({ rule }) => rule);
  const withoutLinks = text.replace(/https?:\/\/\S+/g, '');
  for (const [number] of withoutLinks.matchAll(/\d+/g)) {
    if (!ALLOWED_NUMBERS.has(number)) broken.push(`number ${number}`);
  }
  return broken;
}
