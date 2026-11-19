import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseStartPayload, ROOMMATE_ENTRY_SOURCE } from './start-payload';

/**
 * The owner's posting kit (spec 05 §Posting kit, PRD 3 FR-41): every bot link
 * in `docs/marketing/roommate-posts.md` is a `mate_` link the bot attributes
 * (spec 04 §Start payloads), the templates and the BotFather texts keep the
 * honesty rules, and the posting log holds no people.
 */

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, 'docs/marketing', file), 'utf8');

const POSTS = read('roommate-posts.md');
const LOG = read('roommate-posting-log.md');
const PROFILE = read('bot-profile.md');

/** The sources a posted link may carry; `direct`, `web`, `bot_menu` and `other` come from elsewhere. */
const POSTING_SOURCES: readonly string[] = [
  ROOMMATE_ENTRY_SOURCE.tg,
  ROOMMATE_ENTRY_SOURCE.fb,
  ROOMMATE_ENTRY_SOURCE.ig,
  ROOMMATE_ENTRY_SOURCE.threads,
];

/** The body of each `## ` section, by its heading. */
function sections(markdown: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of markdown.split(/^## /m).slice(1)) {
    const newline = part.indexOf('\n');
    result.set(part.slice(0, newline).trim(), part.slice(newline + 1));
  }
  return result;
}

function section(markdown: string, heading: string): string {
  const body = sections(markdown).get(heading);
  if (body === undefined) throw new Error(`no "## ${heading}" section`);
  return body;
}

/** The contents of every ```text block: the texts the owner copies. */
function textBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```text\n([\s\S]*?)\n```/g)].map((match) => match[1]);
}

/** Every `?start=` payload of a t.me link. */
function startPayloads(text: string): string[] {
  return [...text.matchAll(/t\.me\/[^\s?]+\?start=([^\s)`'"]+)/g)].map((match) => match[1]);
}

/** The body rows of the first Markdown table in `body`, cells trimmed. */
function tableRows(body: string): { header: string[]; rows: string[][] } {
  const lines = body.split('\n').filter((line) => line.startsWith('|'));
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim());
  const [header, , ...rows] = lines;
  return { header: header ? cells(header) : [], rows: rows.map(cells) };
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
function brokenRules(text: string): string[] {
  const broken = FORBIDDEN.filter(({ pattern }) => pattern.test(text)).map(({ rule }) => rule);
  const withoutLinks = text.replace(/https?:\/\/\S+/g, '');
  for (const [number] of withoutLinks.matchAll(/\d+/g)) {
    if (!ALLOWED_NUMBERS.has(number)) broken.push(`number ${number}`);
  }
  return broken;
}

/** A filled group-key row's problems: the key shape, the source and the link it makes. */
function groupKeyProblems(row: string[]): string[] {
  const [key, source, group] = row;
  const problems: string[] = [];
  if (!/^[a-z0-9]{1,24}$/.test(key)) problems.push(`key "${key}" is not [a-z0-9]{1,24}`);
  if (!POSTING_SOURCES.includes(source))
    problems.push(`source "${source}" is not a posting source`);
  if (!group) problems.push(`key "${key}" names no group`);
  if (problems.length === 0) {
    const parsed = parseStartPayload(`mate_${source}_${key}`);
    if (!(parsed.kind === 'roommate' && parsed.source === source && parsed.detail === key)) {
      problems.push(`mate_${source}_${key} does not parse to its source and key`);
    }
  }
  return problems;
}

/** A log row's problems: the format of each column and no people in any cell. */
function logRowProblems(row: string[]): string[] {
  const [date, slot, minutes, , , , manual] = row;
  const problems: string[] = [];
  if (row.length !== 7) problems.push(`${row.length} cells, not 7`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push(`date "${date}" is not YYYY-MM-DD`);
  if (!['1', '2', 'review', 'none'].includes(slot)) problems.push(`slot "${slot}"`);
  if (!/^\d+$/.test(minutes)) problems.push(`minutes "${minutes}"`);
  if (!/^\d+$/.test(manual)) problems.push(`manual minutes "${manual}"`);
  for (const cell of row) {
    if (/@\w/.test(cell)) problems.push(`a handle in "${cell}"`);
    if (/\d{7,}/.test(cell)) problems.push(`a chat id-like number in "${cell}"`);
  }
  return problems;
}

describe('roommate posting kit: links', () => {
  const payloads = startPayloads(POSTS);

  it('has a link in every linked template', () => {
    expect(payloads.length).toBeGreaterThanOrEqual(6 * 3);
  });

  it.each(payloads.map((payload) => [payload]))(
    '%s parses as a roommate link with a posting source and a group key',
    (payload) => {
      const parsed = parseStartPayload(payload);
      expect(parsed).toMatchObject({ kind: 'roommate' });
      if (parsed.kind !== 'roommate') return;
      expect(parsed.source).not.toBe(ROOMMATE_ENTRY_SOURCE.other);
      expect(POSTING_SOURCES).toContain(parsed.source);
      expect(parsed.detail).toMatch(/^[a-z0-9]{1,24}$/);
    },
  );

  it('the link check catches a link that would land as "other"', () => {
    for (const bad of ['mate_tg_Group', 'mate_tg_group-1', 'mate_xx_group', 'mate_tg_<key>']) {
      const parsed = parseStartPayload(bad);
      expect(parsed.kind !== 'roommate' || parsed.source === ROOMMATE_ENTRY_SOURCE.other).toBe(
        true,
      );
    }
  });
});

describe('roommate posting kit: templates', () => {
  const templates = section(POSTS, 'Templates')
    .split(/^### /m)
    .slice(1)
    .map((part) => ({ title: part.slice(0, part.indexOf('\n')), blocks: textBlocks(part) }));

  it('starts with "Draft for the owner" and the rules of D53', () => {
    expect(POSTS.split('\n').slice(0, 4).join(' ')).toMatch(/Draft for the owner/);
    const rules = section(POSTS, 'Rules (D53)');
    for (const rule of [
      /Reply, do not broadcast/,
      /Vary the wording/,
      /At most 3 – 4 groups per slot/,
      /Ask the admins first/,
      /Prefer Telegram/,
      /Identical links across Facebook groups risk a block of\s+the passflat\.com domain/,
    ]) {
      expect(rules).toMatch(rule);
    }
  });

  it('has 6 – 8 templates, each in RU, UK and EN with exactly one link', () => {
    expect(templates.length).toBeGreaterThanOrEqual(6);
    expect(templates.length).toBeLessThanOrEqual(8);
    for (const { title, blocks } of templates) {
      expect(blocks, title).toHaveLength(3);
      for (const block of blocks)
        expect(startPayloads(block), `${title}: ${block}`).toHaveLength(1);
    }
  });

  it('words every template differently in each language', () => {
    for (const language of [0, 1, 2]) {
      const texts = templates.map(({ blocks }) => blocks[language].split('\n')[0]);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it('has a version without a link that names the bot by username, in RU, UK and EN', () => {
    const blocks = textBlocks(section(POSTS, 'Without a link'));
    expect(blocks).toHaveLength(3);
    for (const block of blocks) {
      expect(block).not.toMatch(/https?:|t\.me|www\./);
      expect(block).toMatch(/@<bot>/);
      expect(block).toMatch(/\/mate\b/);
    }
  });

  it('no copied text promises a match, a date or a result, names a figure or says "verified"', () => {
    const blocks = textBlocks(POSTS);
    expect(blocks.length).toBeGreaterThanOrEqual(6 * 3 + 3);
    for (const block of blocks) expect(brokenRules(block), block).toEqual([]);
  });

  it('the honesty check catches each kind of broken rule', () => {
    const cases: [string, string][] = [
      ['Все анкеты проверены вручную.', 'verified'],
      ['Verified profiles only.', 'verified'],
      ['Гарантируем соседа.', 'guarantee'],
      ['Найдём тебе соседа за неделю.', 'promise to find'],
      ["You'll find a flatmate here.", 'promise to find'],
      ['Подбор откроется скоро.', 'opening promise'],
      ['Matching opens in a week.', 'opening promise'],
      ['Ниже рынка.', 'market'],
      ['Вдвоём дешевле.', 'comparison'],
      ['Подбор с января.', 'month'],
      ['Підбір з лютого.', 'month'],
      ['Matching from January.', 'month'],
      ['Комната от 1500 zł.', 'number 1500'],
      ['Подбор с 7 числа.', 'number 7'],
    ];
    for (const [text, rule] of cases) expect(brokenRules(text), text).toContain(rule);
    expect(brokenRules('Только 18+. Анкета живёт 30 дней. Отправь /mate.')).toEqual([]);
    expect(brokenRules('Анкету можно удалить сразу. Найди бота.')).toEqual([]);
  });
});

describe('roommate posting kit: group keys', () => {
  const { header, rows } = tableRows(section(POSTS, 'Group keys'));

  it('has the table the owner fills', () => {
    expect(header.slice(0, 3)).toEqual(['Key', 'Source', 'Public group (handle or name)']);
  });

  it('every filled row has a valid, unique key and a posting source', () => {
    const filled = rows.filter((row) => row.some((cell) => cell !== ''));
    for (const row of filled) expect(groupKeyProblems(row), row.join(' | ')).toEqual([]);
    const keys = filled.map(([key]) => key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the row check rejects a bad key, a bad source and a missing group', () => {
    expect(groupKeyProblems(['kvartirawaw', 'tg', '@some_public_group'])).toEqual([]);
    expect(groupKeyProblems(['Kvartira', 'tg', '@g'])).toHaveLength(1);
    expect(groupKeyProblems(['kvartira_waw', 'tg', '@g'])).toHaveLength(1);
    expect(groupKeyProblems(['a'.repeat(25), 'fb', 'Group'])).toHaveLength(1);
    expect(groupKeyProblems(['kvartira', 'web', '@g'])).toHaveLength(1);
    expect(groupKeyProblems(['kvartira', 'tg', ''])).toHaveLength(1);
  });
});

describe('roommate posting log', () => {
  const { header, rows } = tableRows(section(LOG, 'Log'));

  it('has the columns of spec 05 §Posting kit', () => {
    expect(header).toEqual([
      'Date',
      'Slot',
      'Minutes',
      'Groups (keys)',
      'Link tags',
      'Removed posts or warnings',
      'Manual minutes',
    ]);
  });

  it('says that a week without entries is "missing" and that manual minutes include the review', () => {
    expect(LOG).toMatch(/A week without a row is "missing"/);
    expect(LOG).toMatch(/weekly review of hidden profiles and appeals/);
    expect(LOG).toMatch(/Switch on at:/);
  });

  it('holds no handles, chat ids or malformed rows', () => {
    for (const row of rows) expect(logRowProblems(row), row.join(' | ')).toEqual([]);
    expect(LOG).not.toMatch(/\d{7,}/);
  });

  it('the row check rejects a handle, a chat id and a free-form date', () => {
    const good = ['2026-12-01', '1', '30', 'key1, key2', 'mate_tg_key1, no-link', '0', '0'];
    expect(logRowProblems(good)).toEqual([]);
    expect(logRowProblems(good.map((cell, i) => (i === 3 ? '@anna_w' : cell)))).toHaveLength(1);
    expect(logRowProblems(good.map((cell, i) => (i === 5 ? 'chat 123456789' : cell)))).toHaveLength(
      1,
    );
    expect(logRowProblems(good.map((cell, i) => (i === 0 ? '1 Dec' : cell)))).toHaveLength(1);
  });
});

describe('bot profile texts', () => {
  const description = textBlocks(section(PROFILE, 'Description'));
  const about = textBlocks(section(PROFILE, 'About'));

  it('drafts the description and the about text in RU, UK and EN for the owner', () => {
    expect(PROFILE.split('\n').slice(0, 4).join(' ')).toMatch(/Draft for the owner/);
    expect(description).toHaveLength(3);
    expect(about).toHaveLength(3);
  });

  it('fits BotFather: description at most 512 characters, about at most 120', () => {
    for (const text of description) expect(text.length, text).toBeLessThanOrEqual(512);
    for (const text of about) expect(text.length, text).toBeLessThanOrEqual(120);
  });

  it('names the costs, the deposit helper and roommate matching in each description', () => {
    for (const text of description) {
      expect(text).toMatch(/\/mate\b/);
      expect(text).toMatch(/\/deposit\b/);
      expect(text).toMatch(/адрес|address/i);
    }
    const [, , en] = description;
    expect(en).toMatch(/deposit[^\n]*Russian or Ukrainian/);
  });

  it('promises no match, date or result, names no figure and never says "verified"', () => {
    for (const text of [...description, ...about]) expect(brokenRules(text), text).toEqual([]);
  });
});
