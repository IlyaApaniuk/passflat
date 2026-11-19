import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { trackCalls } from './track-calls.test-support';

/**
 * The bot README's "Events" tables against the code (spec 05 §PRD 3: roommate docs, FR-40): every
 * `tg_*` event a `track(` call sends has a row, every roommate event of specs 06 and 07 has a row,
 * and every property key the code sends with a roommate event is named in that row.
 */

const ROOT = process.cwd();
const README = readFileSync(join(ROOT, 'src/lib/bot/README.md'), 'utf8');

/** A cell's escaped `\|` (a value separator inside the cell), kept apart from the column split. */
const ESCAPED_PIPE = '\\|';
const PIPE_MARK = '<pipe>';

/** README table rows whose first cell is a `tg_*` event: event → its cells after the name. */
function readmeEventRows(): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  for (const line of README.split('\n')) {
    const row = /^\|\s*`(tg_[a-z_]+)`\s*\|(.*)\|\s*$/.exec(line);
    if (!row) continue;
    const cells = row[2].split(ESCAPED_PIPE).join(PIPE_MARK).split('|');
    rows.set(
      row[1],
      cells.map((cell) => cell.split(PIPE_MARK).join('|').trim()),
    );
  }
  return rows;
}

/** The roommate events a spec section names (`## Events …` up to the next `## `). */
function specEvents(file: string, heading: string): string[] {
  const spec = readFileSync(join(ROOT, file), 'utf8');
  const start = spec.indexOf(`\n${heading}\n`);
  if (start === -1) throw new Error(`${heading} not found in ${file}`);
  const end = spec.indexOf('\n## ', start + heading.length + 1);
  const section = spec.slice(start, end === -1 ? undefined : end);
  return [...new Set([...section.matchAll(/tg_roommate_[a-z_]+/g)].map((m) => m[0]))];
}

const CALLS = trackCalls();
const ROWS = readmeEventRows();
const ROOMMATE_CALLS = CALLS.filter((call) => call.event.startsWith('tg_roommate_'));

describe('the bot README events tables', () => {
  it('finds the track calls and the rows it checks', () => {
    expect(CALLS.length).toBeGreaterThan(40);
    expect(new Set(ROOMMATE_CALLS.map((call) => call.event)).size).toBe(20);
    const cardsViewed = ROOMMATE_CALLS.find((call) => call.event === 'tg_roommate_cards_viewed');
    expect(cardsViewed?.keys.sort()).toEqual(['results_band', 'via']);
    const flowStarted = ROOMMATE_CALLS.find((call) => call.event === 'tg_roommate_flow_started');
    expect(flowStarted?.keys.sort()).toEqual(['entry_detail', 'entry_source']);
    const created = ROOMMATE_CALLS.find((call) => call.event === 'tg_roommate_profile_created');
    expect(created?.keys).toContain('has_username');
    expect(ROWS.get('tg_bot_started')).toBeDefined();
  });

  it('has a row for every event a track call sends', () => {
    const missing = [...new Set(CALLS.map((call) => call.event))].filter((e) => !ROWS.has(e));
    expect(missing).toEqual([]);
  });

  it('has a row for every roommate event of specs 06 and 07', () => {
    const events = [
      ...specEvents('docs/specs/06-roommate-profiles.md', '## Events'),
      ...specEvents('docs/specs/07-roommate-matching.md', '## Events (stage 2)'),
    ];
    expect(events.length).toBeGreaterThanOrEqual(20);
    expect(events.filter((event) => !ROWS.has(event))).toEqual([]);
  });

  it('names every property key the code sends with a roommate event', () => {
    for (const call of ROOMMATE_CALLS) {
      expect(
        call.unknownBuilder,
        `${call.event} in ${call.file}: add its builder to track-calls.test-support.ts`,
      ).toBe(false);
      const properties = ROWS.get(call.event)?.[1] ?? '';
      for (const key of call.keys) {
        expect(properties, `${call.event}: ${key}`).toContain(`\`${key}\``);
      }
    }
  });

  it('says "none" exactly for the roommate events sent without properties', () => {
    const events = new Set(ROOMMATE_CALLS.map((call) => call.event));
    for (const event of events) {
      const sendsProperties = ROOMMATE_CALLS.some(
        (call) => call.event === event && call.keys.length > 0,
      );
      expect(ROWS.get(event)?.[1] === 'none', event).toBe(!sendsProperties);
    }
  });
});
