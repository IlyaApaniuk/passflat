import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { activeProfilesWhere } from '@/lib/roommate/counts';
import {
  BUDGET_BANDS,
  DRAFT_LIFE_DAYS,
  GRACE_DAYS,
  OUTCOMES,
  OUTCOME_QUESTION_DAYS,
  PROFILE_LIFE_DAYS,
  RENEWAL_REMINDER_DAYS,
} from '@/lib/roommate/rules';

import { trackCalls } from './track-calls.test-support';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

/**
 * The roommate readout queries in `docs/analytics/activation-funnels.md` against the code (spec 05
 * §Stage 1 readout, FR-42, and §Stage 2 readout, FR-43): every event a HogQL query or the prose
 * names is sent by a `track` call, every property it reads is sent by one of the query's events,
 * every table and column of the read-only SQL is in `prisma/schema.prisma`, the stage 1 SQL's
 * "active" is the counts' rule, the stage 2 numbers follow spec 05's definitions, and no query
 * returns personal data. Nothing here runs a query.
 */

const ROOT = process.cwd();
const DOC = readFileSync(join(ROOT, 'docs/analytics/activation-funnels.md'), 'utf8');
const SCHEMA = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8');
const POSTING_LOG = readFileSync(join(ROOT, 'docs/marketing/roommate-posting-log.md'), 'utf8');
const MATCHING_SOURCE = readFileSync(join(ROOT, 'src/lib/bot/roommate-matching.ts'), 'utf8');
const STORE_SOURCE = readFileSync(join(ROOT, 'src/lib/roommate/store.ts'), 'utf8');

/** The text of the `## <n>. <title>` section, up to the next `## ` heading. */
function docSection(doc: string, title: string): string {
  const heading = new RegExp(`^## \\d+\\. ${title.replace(/[()]/g, '\\$&')}$`, 'm').exec(doc);
  if (!heading) throw new Error(`section "${title}" not found`);
  const start = heading.index;
  const end = doc.indexOf('\n## ', start + heading[0].length);
  return doc.slice(start, end === -1 ? undefined : end);
}

type Block = { kind: 'hogql' | 'sql' | 'unknown'; code: string };

/** The section's ```sql blocks, by their first comment: `-- HogQL.` or `-- Read-only SQL.`. */
function sqlBlocks(section: string): Block[] {
  return [...section.matchAll(/```sql\n([\s\S]*?)```/g)].map(([, code]) => ({
    kind: code.startsWith('-- HogQL.')
      ? 'hogql'
      : code.startsWith('-- Read-only SQL.')
        ? 'sql'
        : 'unknown',
    code,
  }));
}

function withoutComments(code: string): string {
  return code.replace(/--.*$/gm, '');
}

/** Table name → its column names (`@map` or the field name), scalar fields only. */
function schemaTables(schema: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  for (const [, body] of schema.matchAll(/^model \w+ \{\n([\s\S]*?)^\}/gm)) {
    const table = /@@map\("(\w+)"\)/.exec(body)?.[1];
    if (!table) continue;
    const columns = new Set<string>();
    for (const line of body.split('\n')) {
      const field =
        /^\s+(\w+)\s+(?:String|Boolean|Int|BigInt|Float|Decimal|DateTime|Json|Bytes)(?:\[\])?\??(?:\s|$)/.exec(
          line,
        );
      if (field) columns.add(/@map\("(\w+)"\)/.exec(line)?.[1] ?? field[1]);
    }
    tables.set(table, columns);
  }
  return tables;
}

/** Event name → every property key a `track` call sends with it. */
function keysByEvent(): Map<string, Set<string>> {
  const events = new Map<string, Set<string>>();
  for (const call of trackCalls()) {
    const keys = events.get(call.event) ?? new Set<string>();
    call.keys.forEach((key) => keys.add(key));
    events.set(call.event, keys);
  }
  return events;
}

/** Roommate event names in prose (`tg_roommate_…`, not the prefix itself). */
function roommateEventNames(text: string): string[] {
  return [...new Set([...text.matchAll(/\btg_roommate_[a-z_]+/g)].map((m) => m[0]))].filter(
    (name) => !name.endsWith('_'),
  );
}

/** Event names quoted in a query (`'tg_…'`; a prefix ending in `_` is not a name). */
function quotedEventNames(code: string): string[] {
  return [...new Set([...code.matchAll(/'(tg_[a-z_]*[a-z])'/g)].map((m) => m[1]))];
}

/** The problems of one HogQL block: unknown events or prefixes, unsent properties, listed persons. */
function hogqlProblems(block: string, sent: Map<string, Set<string>>): string[] {
  const code = withoutComments(block);
  const problems: string[] = [];
  const events = quotedEventNames(code);
  for (const event of events) if (!sent.has(event)) problems.push(`unknown event ${event}`);
  for (const [, prefix] of code.matchAll(/startsWith\(event, '(tg_[a-z_]+_)'\)/g)) {
    if (![...sent.keys()].some((event) => event.startsWith(prefix))) {
      problems.push(`no event starts with ${prefix}`);
    }
  }
  const keys = new Set(events.flatMap((event) => [...(sent.get(event) ?? [])]));
  for (const [, key] of code.matchAll(/properties\.(\w+)/g)) {
    if (!keys.has(key)) problems.push(`property ${key} is not sent by ${events.join(', ')}`);
  }
  const inner = code.indexOf('FROM (');
  if (inner === -1 || code.slice(0, inner).includes('distinct_id')) {
    problems.push('the outer SELECT must count persons, never list distinct_id');
  }
  return problems;
}

const NOT_ALIASES = new Set(['where', 'join', 'on', 'group', 'order', 'cross', 'left', 'inner']);

/**
 * The problems of one read-only SQL block: unknown tables, aliases or columns. A column of a
 * schema table's alias must be that table's; a column of a CTE's alias must be a column of the
 * block's tables or a name the block defines with `AS`. `checked` counts the references read.
 */
function sqlProblems(
  block: string,
  tables: Map<string, Set<string>>,
): { problems: string[]; checked: number } {
  const code = withoutComments(block);
  const problems: string[] = [];
  const ctes = new Set([...code.matchAll(/(?:\bWITH|,)\s*(\w+)\s+AS\s*\(/g)].map((m) => m[1]));
  const bindings = new Map<string, string>();
  for (const [, name, alias] of code.matchAll(/\b(?:FROM|JOIN)\s+(\w+)\s+(?:AS\s+)?(\w+)/g)) {
    if (NOT_ALIASES.has(alias.toLowerCase())) {
      problems.push(`${name} has no alias`);
      continue;
    }
    if (!tables.has(name) && !ctes.has(name)) problems.push(`unknown table ${name}`);
    bindings.set(alias, name);
  }
  const functionAliases = new Map<string, Set<string>>();
  for (const [, alias, columns] of code.matchAll(/\bAS\s+(\w+)\(([\w\s,]+)\)/g)) {
    functionAliases.set(alias, new Set(columns.split(',').map((column) => column.trim())));
  }
  const defined = [...code.matchAll(/\bAS\s+(\w+)\b(?!\s*\()/g)].map((m) => m[1]);
  const blockColumns = new Set([
    ...defined,
    ...[...bindings.values()].flatMap((name) => [...(tables.get(name) ?? [])]),
  ]);

  let checked = 0;
  for (const [reference, alias, column] of code.matchAll(/\b([a-z]\w*)\.([a-z_]\w*)\b/g)) {
    const bound = bindings.get(alias);
    const known = bound ? (tables.get(bound) ?? blockColumns) : functionAliases.get(alias);
    if (!known) {
      problems.push(`unknown alias in ${reference}`);
      continue;
    }
    if (!known.has(column)) problems.push(`unknown column ${reference}`);
    checked += 1;
  }
  return { problems, checked };
}

/** Every `tg_username` that is not read as `IS NULL` / `IS NOT NULL` (a username in a result). */
function readUsernames(code: string): string[] {
  return [
    ...withoutComments(code).matchAll(/\b\w*\.?tg_username\b(?!\s+IS\s+(?:NOT\s+)?NULL)/g),
  ].map((m) => m[0]);
}

/** The query block that starts `-- HogQL. Query <letter>,` or `-- Read-only SQL. Query <letter>,`. */
function queryBlock(blocks: Block[], letter: string): string {
  const pattern = new RegExp(`^-- (?:HogQL|Read-only SQL)\\. Query ${letter},`);
  const block = blocks.find(({ code }) => pattern.test(code));
  if (!block) throw new Error(`query ${letter} not found`);
  return withoutComments(block.code);
}

const SECTION = docSection(DOC, 'Roommate stage 1 (E14)');
const BLOCKS = sqlBlocks(SECTION);
const HOGQL = BLOCKS.filter((block) => block.kind === 'hogql');
const SQL = BLOCKS.filter((block) => block.kind === 'sql');
const SENT = keysByEvent();
const TABLES = schemaTables(SCHEMA);

/** spec 06 §Counts "active", as `activeProfilesWhere` builds it and the SQL writes it. */
const ACTIVE_SQL = [
  'JOIN telegram_chats c ON c.id = p.chat_id',
  "p.status = 'active'",
  'p.expires_at > now()',
  'c.blocked_at IS NULL',
  'c.roommate_banned_at IS NULL',
];

describe('the roommate stage 1 readout (activation-funnels.md)', () => {
  it('has the six parts of spec 05 §Stage 1 readout', () => {
    for (const part of [
      '### 7.1 HogQL',
      '### 7.2 Read-only SQL',
      '### 7.3 Rules',
      '### 7.4 The daily check from 2027-01-04 (D58)',
      '### 7.5 Worked examples',
      '### 7.6 No data, the PostHog project and the season',
    ]) {
      expect(SECTION).toContain(part);
    }
    for (const date of ['2027-01-07', '2027-01-18', '2027-01-20', '2027-02-28']) {
      expect(SECTION).toContain(date);
    }
    expect(SECTION).toContain('34 ÷ 27.5 = 1.24');
    expect((34 / 27.5).toFixed(2)).toBe('1.24');
    expect(SECTION).toContain('20 ÷ 16.7 = 1.2');
    expect(20 / (1000 / 60)).toBeCloseTo(1.2, 10);
    expect(SECTION).toContain('**No data, not 0.**');
  });

  it('marks every query as HogQL or read-only SQL', () => {
    expect(BLOCKS.filter((block) => block.kind === 'unknown')).toEqual([]);
    expect(HOGQL.length).toBeGreaterThanOrEqual(2);
    expect(SQL.length).toBeGreaterThanOrEqual(3);
  });

  it('reads only events the code sends, with properties those events carry', () => {
    expect(SENT.get('tg_roommate_flow_started')).toEqual(new Set(['entry_source', 'entry_detail']));
    for (const block of HOGQL) expect(hogqlProblems(block.code, SENT)).toEqual([]);
  });

  it('names only events the code sends, in the prose too', () => {
    const named = roommateEventNames(SECTION);
    expect(named).toContain('tg_roommate_profile_created');
    expect(named.filter((event) => !SENT.has(event))).toEqual([]);
  });

  it('reads only tables and columns of the schema', () => {
    let checked = 0;
    for (const block of SQL) {
      const result = sqlProblems(block.code, TABLES);
      expect(result.problems).toEqual([]);
      checked += result.checked;
    }
    expect(checked).toBeGreaterThanOrEqual(30);
  });

  it('counts "active" with the rule of the bot and the website (activeProfilesWhere)', () => {
    const now = new Date(Date.UTC(2027, 0, 18, 9));
    expect(activeProfilesWhere(now)).toEqual({
      status: 'active',
      expiresAt: { gt: now },
      chat: { blockedAt: null, roommateBannedAt: null },
    });
    const reading = SQL.filter((block) => block.code.includes('FROM roommate_profiles p'));
    expect(reading).toHaveLength(SQL.length);
    for (const block of reading) {
      for (const condition of ACTIVE_SQL) expect(block.code).toContain(condition);
    }
  });

  it('returns no personal data', () => {
    for (const block of BLOCKS) {
      const code = withoutComments(block.code);
      for (const forbidden of [
        'tg_username',
        '.about',
        '.gender',
        '.prefers',
        'c.chat_id',
        'start_payload',
        'SELECT *',
      ]) {
        expect(code, forbidden).not.toContain(forbidden);
      }
    }
  });

  it('states the budget bands and the draft lifetime of the code', () => {
    const text = SECTION.replace(/\s+/g, ' ');
    const amount = (n: number) => n.toLocaleString('en-US');
    const ranges = BUDGET_BANDS.map(({ band, min }, i) => {
      const upper = i + 1 < BUDGET_BANDS.length ? BUDGET_BANDS[i + 1].min - 1 : null;
      if (upper === null) return `${band} ≥ ${amount(min)}`;
      return i === 0 ? `${band} ≤ ${amount(upper)}` : `${band} ${amount(min)} – ${amount(upper)}`;
    });
    expect(ranges).toHaveLength(5);
    for (const range of ranges) expect(text).toContain(range);
    expect(text).toContain(`${DRAFT_LIFE_DAYS} days after its last answer`);
  });

  it('reads posting log columns the posting log has', () => {
    const header = POSTING_LOG.split('\n').find((line) => line.startsWith('| Date |')) ?? '';
    const columns = header.split('|').map((cell) => cell.trim());
    expect(columns).toContain('Minutes');
    expect(columns).toContain('Manual minutes');
    expect(POSTING_LOG).toMatch(/^Switch on at:/m);
    expect(SECTION).toContain('"Switch on at:"');
  });
});

const STAGE_2 = docSection(DOC, 'Roommate stage 2 (E15)');
const STAGE_2_BLOCKS = sqlBlocks(STAGE_2);
const STAGE_2_HOGQL = STAGE_2_BLOCKS.filter((block) => block.kind === 'hogql');
const STAGE_2_SQL = STAGE_2_BLOCKS.filter((block) => block.kind === 'sql');

/** `toDateTime('{switch_at}', ...)` / `{readout_at}` as the HogQL writes them. */
const AT = (name: 'switch_at' | 'readout_at') => `toDateTime\\('\\{${name}\\}', 'Europe/Warsaw'\\)`;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A Europe/Warsaw winter (CET) wall-clock moment, as the worked examples write it. */
const warsawWinter = (date: string, time = '00:00') => Date.parse(`${date}T${time}:00+01:00`);

type LifecycleEvent = { kind: string; at: number };

/**
 * D74 as query G reads it, per person: the last create, renewal, expiry or delete before the
 * switch is a create or a renewal, or a create falls between the switch and 14 days before the
 * readout.
 */
function qualifiesD74(events: LifecycleEvent[], switchAt: number, readoutAt: number): boolean {
  const before = events.filter((event) => event.at < switchAt).sort((a, b) => a.at - b.at);
  const last = before[before.length - 1]?.kind;
  const createdAfter = events.some(
    (event) =>
      event.kind === 'created' && event.at >= switchAt && event.at < readoutAt - 14 * DAY_MS,
  );
  return last === 'created' || last === 'renewed' || createdAfter;
}

/** E15's earlier definition, as query G's `earlier_qualifying` reads it. */
function qualifiesEarlier(events: LifecycleEvent[], switchAt: number, readoutAt: number): boolean {
  return (
    events.some(
      (event) =>
        (event.kind === 'created' || event.kind === 'renewed') &&
        event.at < readoutAt - 14 * DAY_MS,
    ) && !events.some((event) => event.kind === 'deleted' && event.at < switchAt)
  );
}

describe('the roommate stage 2 readout (activation-funnels.md)', () => {
  it('has the parts of spec 05 §Stage 2 readout', () => {
    for (const part of [
      '### 8.1 HogQL',
      '### 8.2 Read-only SQL',
      '### 8.3 Rules',
      '### 8.4 Worked examples',
      '### 8.5 No data, the PostHog project and the season',
    ]) {
      expect(STAGE_2).toContain(part);
    }
    const text = STAGE_2.replace(/\s+/g, ' ');
    expect(text).toContain('"Switch on at:"');
    expect(text).toContain('**No data, not 0.**');
    expect(text).not.toContain('**Open**');
    expect(text).toContain(
      "D74 (the owner's answer to PRD 3 Q-15, 2026-11-19); the rules (§8.3) read it",
    );
    expect(text).toContain(
      `${OUTCOME_QUESTION_DAYS} days after the match (\`OUTCOME_QUESTION_DAYS\`)`,
    );
  });

  it('marks every query as HogQL or read-only SQL, and each takes {switch_at}', () => {
    expect(STAGE_2_BLOCKS.filter((block) => block.kind === 'unknown')).toEqual([]);
    expect(STAGE_2_HOGQL.length).toBeGreaterThanOrEqual(3);
    expect(STAGE_2_SQL.length).toBeGreaterThanOrEqual(1);
    for (const block of STAGE_2_BLOCKS) {
      expect(withoutComments(block.code)).toContain("'{switch_at}'");
      expect(withoutComments(block.code)).toContain("'{readout_at}'");
    }
  });

  it('reads only events the code sends, with properties those events carry', () => {
    for (const block of STAGE_2_HOGQL) expect(hogqlProblems(block.code, SENT)).toEqual([]);
  });

  it('names only events the code sends, in the prose too', () => {
    const named = roommateEventNames(STAGE_2);
    expect(named).toEqual(
      expect.arrayContaining([
        'tg_roommate_matched',
        'tg_roommate_outcome',
        'tg_roommate_cards_viewed',
        'tg_roommate_push_sent',
        'tg_roommate_push_opted_out',
        'tg_roommate_username_prompted',
        'tg_roommate_username_set',
      ]),
    );
    expect(named.filter((event) => !SENT.has(event))).toEqual([]);
  });

  it('reads only tables and columns of the schema', () => {
    let checked = 0;
    for (const block of STAGE_2_SQL) {
      const result = sqlProblems(block.code, TABLES);
      expect(result.problems).toEqual([]);
      checked += result.checked;
    }
    expect(checked).toBeGreaterThanOrEqual(20);
  });

  it('counts qualifying persons (D74), the earlier E15 persons, pairs, outcome and browsing persons (query G)', () => {
    const g = queryBlock(STAGE_2_HOGQL, 'G');
    // D74: active at the switch = the last create, renewal, expiry or delete before it is a create
    // or a renewal; or created after the switch and at least 14 days before the readout.
    const activeAtSwitch = new RegExp(
      `\\(argMaxIf\\(event, timestamp, event IN \\('tg_roommate_profile_created',\\s+'tg_roommate_profile_renewed', 'tg_roommate_profile_expired',\\s+'tg_roommate_profile_deleted'\\)\\s+AND timestamp < ${AT('switch_at')}\\)\\s+IN \\('tg_roommate_profile_created', 'tg_roommate_profile_renewed'\\)\\) AS active_at_switch\\b`,
    );
    expect(g).toMatch(activeAtSwitch);
    const createdAfterSwitch = new RegExp(
      `\\(countIf\\(event = 'tg_roommate_profile_created'\\s+AND timestamp >= ${AT('switch_at')}\\s+AND timestamp < ${AT('readout_at')} - INTERVAL 14 DAY\\) > 0\\)\\s+AS created_after_switch\\b`,
    );
    expect(g).toMatch(createdAfterSwitch);
    // E15's earlier definition, reported without a rule (spec 05 §Stage 2 readout).
    const earlier = new RegExp(
      `event IN \\('tg_roommate_profile_created', 'tg_roommate_profile_renewed'\\)\\s+AND timestamp < ${AT('readout_at')} - INTERVAL 14 DAY\\) > 0\\s+AND countIf\\(event = 'tg_roommate_profile_deleted'\\s+AND timestamp < ${AT('switch_at')}\\) = 0\\)\\s+AS earlier_qualifying\\b`,
    );
    expect(g).toMatch(earlier);
    for (const column of [
      'countIf(active_at_switch OR created_after_switch) AS qualifying_persons',
      'countIf((active_at_switch OR created_after_switch) AND matched) AS qualifying_with_match',
      'countIf(active_at_switch) AS qualifying_active_at_switch',
      'countIf(earlier_qualifying) AS earlier_qualifying_persons',
      'countIf(earlier_qualifying AND matched) AS earlier_qualifying_with_match',
    ]) {
      expect(g).toContain(column);
    }
    expect(withoutComments(g)).not.toMatch(/\bAS qualifying\b/);
    // The prose reads the rates from these columns.
    const text = STAGE_2.replace(/\s+/g, ' ');
    expect(text).toContain('`qualifying_with_match` ÷ `qualifying_persons`');
    expect(text).toContain('`earlier_qualifying_with_match` ÷ `earlier_qualifying_persons`');
    expect(text).toContain('`qualifying_persons` = `qualifying_active_at_switch`');
    const inWindow = (event: string) =>
      new RegExp(
        `event = '${event}'(?:(?!countIf)[\\s\\S])*?AND timestamp >= ${AT('switch_at')}\\s+AND timestamp < ${AT('readout_at')}\\)`,
      );
    for (const event of [
      'tg_roommate_matched',
      'tg_roommate_outcome',
      'tg_roommate_cards_viewed',
    ]) {
      expect(g).toMatch(inWindow(event));
    }
    expect(g).toContain('countIf(matched AND good_outcome) AS outcome_persons');
    expect(g).toContain('countIf(browsing) AS browsing_persons');

    expect(g).toContain("coalesce(toString(properties.role), '') = 'completer'");
    expect(MATCHING_SOURCE).toContain(
      "track(ctx.chat!.id, 'tg_roommate_matched', { role: 'completer' })",
    );
    const outcomes = /properties\.outcome\), ''\) IN \(([^)]*)\)/.exec(g)?.[1] ?? '';
    expect(outcomes).toBe("'renting_together', 'talking'");
    expect(OUTCOMES).toEqual(expect.arrayContaining(['renting_together', 'talking']));
  });

  it('reads the push for H12 through via=push on the same Warsaw day (query H)', () => {
    const h = queryBlock(STAGE_2_HOGQL, 'H');
    expect(h).toContain("toDate(toTimeZone(timestamp, 'Europe/Warsaw')) AS day");
    expect(h).toContain('GROUP BY distinct_id, day');
    expect(h).toContain("countIf(event = 'tg_roommate_push_sent') > 0) AS pushed");
    expect(h).toMatch(
      /event = 'tg_roommate_cards_viewed'\s+AND coalesce\(toString\(properties\.via\), ''\) = 'push'\) > 0\) AS viewed_via_push/,
    );
    expect(h).toContain('countIf(pushed AND viewed_via_push) AS push_days_viewed');
    expect(h).toContain("countIf(event = 'tg_roommate_push_opted_out')");
    expect(MATCHING_SOURCE).toMatch(/const CARDS_VIA = \{[^}]*\bp: 'push'/);
  });

  it('reads A28 from has_username and the prompts by context (query I)', () => {
    const i = queryBlock(STAGE_2_HOGQL, 'I');
    expect(i).toContain('properties.has_username');
    for (const context of ['browse', 'reveal']) {
      expect(i).toContain(`coalesce(toString(properties.context), '') = '${context}'`);
      expect(MATCHING_SOURCE).toContain(`'tg_roommate_username_set', { context: '${context}' }`);
      expect(MATCHING_SOURCE).toContain(
        `'tg_roommate_username_prompted', { context: '${context}' }`,
      );
    }
  });

  it('cross-checks pairs as formMutualMatch forms them and counts pairs waiting on a username (query J)', () => {
    expect(STORE_SOURCE).toMatch(/WHERE kind = 'interest'\s+AND matched_at IS NULL/);
    expect(STORE_SOURCE).toMatch(/SET matched_at = \$\{now\}/);
    const j = queryBlock(STAGE_2_SQL, 'J');
    for (const condition of [
      'b.from_profile_id = r.to_profile_id AND b.to_profile_id = r.from_profile_id',
      "r.kind = 'interest'",
      "b.kind = 'interest'",
      'r.matched_at IS NOT NULL',
      'b.matched_at IS NOT NULL',
      'r.from_profile_id < r.to_profile_id',
      '(r.revealed_at IS NOT NULL AND b.revealed_at IS NOT NULL) AS revealed',
      '(p.tg_username IS NULL OR q.tg_username IS NULL) AS username_missing',
      'count(*) FILTER (WHERE NOT x.revealed AND x.username_missing) AS pairs_waiting_on_username',
    ]) {
      expect(j).toContain(condition);
    }
  });

  it('returns no personal data', () => {
    for (const block of STAGE_2_BLOCKS) {
      const code = withoutComments(block.code);
      expect(readUsernames(code)).toEqual([]);
      for (const forbidden of [
        'chat_id',
        '.about',
        '.gender',
        '.prefers',
        'start_payload',
        'SELECT *',
        'groupArray',
      ]) {
        expect(code, forbidden).not.toContain(forbidden);
      }
    }
  });

  it('states the rules of D52 and D60 and the worked examples', () => {
    const text = STAGE_2.replace(/\s+/g, ' ');
    for (const rule of [
      'if the match rate is ≥ 30 %',
      'fewer than 15 % of qualifying persons have a match',
      'no pair formed (`pairs = 0`) among 20 or more browsing persons',
      '**Fewer than 10 qualifying persons:** report counts only',
      'continue if there are ≥ 10 pairs and ≥ 3 outcome persons; **stop** (D60) below 10 pairs',
      'Outcomes are counted as persons (D60)',
      '`2027-04-01 00:00:00`',
    ]) {
      expect(text).toContain(rule);
    }
    for (const date of ['2027-01-08', '2027-01-22', '2027-03-31']) expect(text).toContain(date);
    expect(text).toContain('8 ÷ 24 = 33 %');
    expect(Math.round((8 / 24) * 100)).toBe(33);
    expect(text).toContain('3 ÷ 24 = 12.5 %');
    expect((3 / 24) * 100).toBe(12.5);
    expect(text).toContain('5 pairs so far');
    expect(text).toContain('22 browsing persons, no `completer` event');
    expect(text).toContain('"the rule cannot be read"');
  });

  it('applies D74 and the earlier E15 rule in the worked example, with the profile life and grace', () => {
    const text = STAGE_2.replace(/\s+/g, ' ');
    expect(text).toContain(
      'with the switch at 2027-01-08 10:30 and the readout at 2027-01-22 10:30',
    );
    const switchAt = warsawWinter('2027-01-08', '10:30');
    const readoutAt = warsawWinter('2027-01-22', '10:30');
    const finalAt = Date.parse('2027-04-01T00:00:00+02:00'); // `2027-04-01 00:00:00`, Warsaw summer time
    // At the 14-day readout nobody created after the switch is 14 days old yet.
    expect(readoutAt - 14 * DAY_MS).toBe(switchAt);

    const rows = [...STAGE_2.matchAll(/^\| ([A-F]) +\| (.+?) +\| (.+?) +\| (.+?) +\|$/gm)];
    expect(rows.map((row) => row[1])).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    const verdict = (cell: string) => /^(yes|no)\b/.exec(cell)?.[1];
    const atFinal = (cell: string) =>
      cell.includes('(at the final readout: yes)') ? 'yes' : verdict(cell);
    const word = (qualifies: boolean) => (qualifies ? 'yes' : 'no');
    const counted = { d74: [] as string[], earlier: [] as string[] };

    for (const [, person, eventsCell, d74Cell, earlierCell] of rows) {
      const events = [
        ...eventsCell.matchAll(/\b(created|renewed|expired|deleted) (\d{4}-\d{2}-\d{2})/g),
      ].map(([, kind, date]) => ({ kind, at: warsawWinter(date) }));
      expect(events.length, person).toBeGreaterThan(0);

      // The dates follow PROFILE_LIFE_DAYS, the renewal window and GRACE_DAYS.
      let life = NaN;
      let expiredAt = NaN;
      for (const event of events) {
        const days = (from: number) => (event.at - from) / DAY_MS;
        if (event.kind === 'renewed') {
          expect(PROFILE_LIFE_DAYS - days(life), person).toBeLessThanOrEqual(RENEWAL_REMINDER_DAYS);
        }
        if (event.kind === 'created' || event.kind === 'renewed') life = event.at;
        if (event.kind === 'expired') {
          expect(days(life), person).toBe(PROFILE_LIFE_DAYS);
          expiredAt = event.at;
        }
        if (event.kind === 'deleted' && !Number.isNaN(expiredAt)) {
          expect(days(expiredAt), person).toBe(GRACE_DAYS);
        }
      }
      const expires = /\(expires (\d{4}-\d{2}-\d{2})/.exec(eventsCell)?.[1];
      if (expires) expect((warsawWinter(expires) - life) / DAY_MS, person).toBe(PROFILE_LIFE_DAYS);

      expect(verdict(d74Cell), person).toBe(word(qualifiesD74(events, switchAt, readoutAt)));
      expect(verdict(earlierCell), person).toBe(
        word(qualifiesEarlier(events, switchAt, readoutAt)),
      );
      expect(atFinal(d74Cell), person).toBe(word(qualifiesD74(events, switchAt, finalAt)));
      expect(atFinal(earlierCell), person).toBe(word(qualifiesEarlier(events, switchAt, finalAt)));
      if (verdict(d74Cell) === 'yes') counted.d74.push(person);
      if (verdict(earlierCell) === 'yes') counted.earlier.push(person);
    }
    expect(counted).toEqual({ d74: ['C', 'D', 'E'], earlier: ['B', 'C', 'D'] });
    expect(text).toContain('D74 counts C, D and E; the earlier E15 rule counts B, C and D.');

    expect(text).toContain('30 − 7 + 1 = 24 qualifying persons');
    expect(30 - 7 + 1).toBe(24);
    expect(text).toContain('the match rate is 8 ÷ 24 = 33 % and the 14-day rule holds');
    expect(text).toContain("the earlier E15 rule's rate is 8 ÷ 30 = 26.7 %, between 15 % and 30 %");
    expect(((8 / 30) * 100).toFixed(1)).toBe('26.7');
  });
});

describe('the readout checks themselves', () => {
  it('catch a username read into a result', () => {
    expect(
      readUsernames(
        'SELECT p.tg_username, count(*) FROM roommate_profiles p WHERE q.tg_username IS NULL',
      ),
    ).toEqual(['p.tg_username']);
    expect(readUsernames('WHERE p.tg_username IS NOT NULL OR tg_username IS NULL')).toEqual([]);
  });

  it('catch an unknown event, prefix or property and a listed person', () => {
    const bad = [
      "SELECT distinct_id, countIf(event = 'tg_roommate_profile_saved') AS saved",
      "FROM events WHERE startsWith(event, 'tg_roomate_') AND properties.entry_src = 'tg'",
    ].join('\n');
    expect(hogqlProblems(bad, SENT)).toEqual([
      'unknown event tg_roommate_profile_saved',
      'no event starts with tg_roomate_',
      'property entry_src is not sent by tg_roommate_profile_saved',
      'the outer SELECT must count persons, never list distinct_id',
    ]);
    const good = [
      "SELECT countIf(x) FROM (SELECT distinct_id, countIf(event = 'tg_roommate_flow_started'",
      'AND properties.entry_detail IS NOT NULL) > 0 AS x FROM events GROUP BY distinct_id)',
    ].join('\n');
    expect(hogqlProblems(good, SENT)).toEqual([]);
  });

  it('catch an unknown table, alias or column', () => {
    const bad = [
      'WITH active AS (SELECT p.id FROM roommate_profiles p WHERE p.expire_at > now())',
      'SELECT count(*) FROM active a JOIN roommate_profile r ON r.id = a.id',
      'WHERE a.district AND q.status',
    ].join('\n');
    expect(sqlProblems(bad, TABLES).problems).toEqual([
      'unknown table roommate_profile',
      'unknown column p.expire_at',
      'unknown column a.district',
      'unknown alias in q.status',
    ]);
    const unaliased = 'SELECT count(*) FROM roommate_profiles WHERE status = 1';
    expect(sqlProblems(unaliased, TABLES).problems).toEqual(['roommate_profiles has no alias']);
    const good = [
      'SELECT d.slug, count(DISTINCT p.id) AS n FROM roommate_profiles p',
      'CROSS JOIN unnest(p.district_slugs) AS d(slug) GROUP BY d.slug',
    ].join('\n');
    expect(sqlProblems(good, TABLES)).toEqual({ problems: [], checked: 4 });
  });

  it('read the schema columns by their mapped names, scalar fields only', () => {
    const chats = [...(TABLES.get('telegram_chats') ?? [])];
    expect(chats).toEqual(expect.arrayContaining(['id', 'chat_id', 'blocked_at', 'locale']));
    expect(chats).toContain('roommate_banned_at');
    expect(chats).not.toContain('roommateBannedAt');
    expect(chats).not.toContain('roommateProfile');
    const profiles = [...(TABLES.get('roommate_profiles') ?? [])];
    expect(profiles).toEqual(expect.arrayContaining(['status', 'district_slugs', 'expires_at']));
  });
});
