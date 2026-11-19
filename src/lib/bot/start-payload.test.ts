import { describe, expect, it } from 'vitest';

import {
  ENTRY_SOURCE,
  ROOMMATE_ENTRY_SOURCE,
  parseStartPayload,
  recordedStartPayload,
  type StartPayload,
} from './start-payload';

const UUID = '3f2c8a1e-9b4d-4c7a-8e21-5d6f0a9b1c3e';

// One row per case of spec 04 §Start payloads, plus the edges around each rule.
const CASES: Array<[label: string, raw: string, expected: StartPayload]> = [
  ['empty', '', { kind: 'none' }],

  ['dep', 'dep', { kind: 'deposit' }],
  ['dep in another case', 'DEP', { kind: 'unknown' }],
  ['dep with a suffix (PRD 2 adds dep_<source>)', 'dep_threads', { kind: 'unknown' }],

  ['b_ with a lowercase uuid', `b_${UUID}`, { kind: 'building', buildingId: UUID }],
  ['b_ with an uppercase uuid', `b_${UUID.toUpperCase()}`, { kind: 'building', buildingId: UUID }],
  [
    'b_ with a mixed-case uuid',
    'b_3F2C8A1E-9b4d-4C7A-8e21-5D6F0A9B1C3E',
    { kind: 'building', buildingId: UUID },
  ],
  [
    'b_ with the nil uuid (any version passes the shape)',
    'b_00000000-0000-0000-0000-000000000000',
    { kind: 'building', buildingId: '00000000-0000-0000-0000-000000000000' },
  ],
  ['b_ with nothing after it', 'b_', { kind: 'invalid_building' }],
  ['b_ with a non-uuid', 'b_not-a-building', { kind: 'invalid_building' }],
  ['b_ with a uuid without hyphens', `b_${UUID.replace(/-/g, '')}`, { kind: 'invalid_building' }],
  ['b_ with a uuid and a trailing character', `b_${UUID}0`, { kind: 'invalid_building' }],
  [
    'b_ with a non-hex uuid',
    'b_3f2c8a1e-9b4d-4c7a-8e21-5d6f0a9b1c3g',
    { kind: 'invalid_building' },
  ],
  ['b_ with a numeric id', 'b_12345', { kind: 'invalid_building' }],

  ['d_ with a slug', 'd_mokotow', { kind: 'district', slug: 'mokotow' }],
  ['d_ with a hyphenated slug', 'd_praga-poludnie', { kind: 'district', slug: 'praga-poludnie' }],
  [
    'd_ with a 48-character slug',
    `d_${'a'.repeat(48)}`,
    { kind: 'district', slug: 'a'.repeat(48) },
  ],
  ['d_ with a 49-character slug', `d_${'a'.repeat(49)}`, { kind: 'unknown' }],
  ['d_ with nothing after it', 'd_', { kind: 'unknown' }],
  ['d_ with an uppercase slug', 'd_Mokotow', { kind: 'unknown' }],
  ['d_ with an underscore in the slug', 'd_praga_poludnie', { kind: 'unknown' }],

  ['web_ with a source', 'web_checker', { kind: 'web', source: 'checker' }],
  [
    'web_ with a compound source',
    'web_costs-submit_ok',
    { kind: 'web', source: 'costs-submit_ok' },
  ],
  ['web_ with nothing after it', 'web_', { kind: 'unknown' }],

  [
    'a 64-character payload is still read',
    `web_${'x'.repeat(60)}`,
    { kind: 'web', source: 'x'.repeat(60) },
  ],
  ['a 65-character payload', `web_${'x'.repeat(61)}`, { kind: 'unknown' }],
  ['a 65-character b_ payload', `b_${'a'.repeat(63)}`, { kind: 'unknown' }],
  ['a payload with a space', 'dep now', { kind: 'unknown' }],
  ['a b_ payload with a space', `b_${UUID} x`, { kind: 'unknown' }],
  ['a payload with a non-ASCII letter', 'd_mokotów', { kind: 'unknown' }],
  ['a payload with a slash', 'd_moko/tow', { kind: 'unknown' }],
  ['a whitespace-only payload', ' ', { kind: 'unknown' }],

  ['an attribution payload', 'thr_med', { kind: 'unknown' }],
  ['a bare word', 'hello', { kind: 'unknown' }],

  // PRD 3 FR-2: `mate` links (spec 04 §Start payloads, second table).
  ['mate', 'mate', { kind: 'roommate', source: 'direct' }],
  ['mate_tg', 'mate_tg', { kind: 'roommate', source: 'tg' }],
  ['mate_fb', 'mate_fb', { kind: 'roommate', source: 'fb' }],
  ['mate_ig', 'mate_ig', { kind: 'roommate', source: 'ig' }],
  ['mate_threads', 'mate_threads', { kind: 'roommate', source: 'threads' }],
  [
    'mate_fb_<detail>',
    'mate_fb_wawapolki2',
    { kind: 'roommate', source: 'fb', detail: 'wawapolki2' },
  ],
  ['mate_tg_<detail>', 'mate_tg_ukrwaw', { kind: 'roommate', source: 'tg', detail: 'ukrwaw' }],
  [
    'mate_threads_<detail>',
    'mate_threads_post1',
    { kind: 'roommate', source: 'threads', detail: 'post1' },
  ],
  [
    'mate_<source>_<detail> with a 24-character detail',
    `mate_ig_${'a'.repeat(24)}`,
    { kind: 'roommate', source: 'ig', detail: 'a'.repeat(24) },
  ],
  ['mate_web', 'mate_web', { kind: 'roommate', source: 'web' }],
  [
    'mate_web_roommate',
    'mate_web_roommate',
    { kind: 'roommate', source: 'web', detail: 'roommate' },
  ],
  ['mate_xyz (an unknown source)', 'mate_xyz', { kind: 'roommate', source: 'other' }],
  ['mate_tg_Bad (an uppercase detail)', 'mate_tg_Bad', { kind: 'roommate', source: 'other' }],
  ['matey', 'matey', { kind: 'roommate', source: 'other' }],
  ['mate_ (nothing after the underscore)', 'mate_', { kind: 'roommate', source: 'other' }],
  ['mate_tg_ (an empty detail)', 'mate_tg_', { kind: 'roommate', source: 'other' }],
  [
    'mate_<source>_<detail> with a 25-character detail',
    `mate_ig_${'a'.repeat(25)}`,
    { kind: 'roommate', source: 'other' },
  ],
  [
    'mate_fb_a_b (a detail with an underscore)',
    'mate_fb_a_b',
    { kind: 'roommate', source: 'other' },
  ],
  ['mate_fb_a-b (a detail with a hyphen)', 'mate_fb_a-b', { kind: 'roommate', source: 'other' }],
  ['mate_TG (an uppercase source)', 'mate_TG', { kind: 'roommate', source: 'other' }],
  [
    'mate_direct (direct is not a link source)',
    'mate_direct',
    { kind: 'roommate', source: 'other' },
  ],
  [
    'mate_bot_menu (bot_menu is not a link source)',
    'mate_bot_menu',
    { kind: 'roommate', source: 'other' },
  ],
  ['mate_other (other is not a link source)', 'mate_other', { kind: 'roommate', source: 'other' }],
  ['MATE in another case', 'MATE', { kind: 'unknown' }],
  [
    'a 64-character mate payload is still read',
    `mate_${'x'.repeat(59)}`,
    { kind: 'roommate', source: 'other' },
  ],
  ['a 65-character mate payload (the guard first)', `mate_${'x'.repeat(60)}`, { kind: 'unknown' }],
  ['a mate payload with a space (the guard first)', 'mate tg', { kind: 'unknown' }],
  ['a mate payload with a non-ASCII letter', 'mate_tg_łódź', { kind: 'unknown' }],
];

describe('parseStartPayload', () => {
  it.each(CASES)('%s', (_label, raw, expected) => {
    expect(parseStartPayload(raw)).toEqual(expected);
  });

  it('checks the length rule against a 65-character input', () => {
    expect(`web_${'x'.repeat(61)}`).toHaveLength(65);
    expect(`b_${'a'.repeat(63)}`).toHaveLength(65);
    expect(`web_${'x'.repeat(60)}`).toHaveLength(64);
    expect(`mate_${'x'.repeat(60)}`).toHaveLength(65);
    expect(`mate_${'x'.repeat(59)}`).toHaveLength(64);
  });

  it('gives every roommate result a source of ROOMMATE_ENTRY_SOURCE', () => {
    const sources = new Set<string>(Object.values(ROOMMATE_ENTRY_SOURCE));
    for (const [, raw] of CASES) {
      const parsed = parseStartPayload(raw);
      if (parsed.kind === 'roommate') expect(sources).toContain(parsed.source);
    }
  });
});

describe('ROOMMATE_ENTRY_SOURCE', () => {
  it('holds the eight roommate entry values of spec 04', () => {
    expect(Object.values(ROOMMATE_ENTRY_SOURCE).sort()).toEqual([
      'bot_menu',
      'direct',
      'fb',
      'ig',
      'other',
      'tg',
      'threads',
      'web',
    ]);
  });

  it('shares no value with the check-event ENTRY_SOURCE', () => {
    const checkValues = new Set<string>(Object.values(ENTRY_SOURCE));
    for (const value of Object.values(ROOMMATE_ENTRY_SOURCE)) {
      expect(checkValues.has(value)).toBe(false);
    }
  });
});

describe('ENTRY_SOURCE', () => {
  it('holds the four check-event values of spec 04', () => {
    expect(Object.values(ENTRY_SOURCE).sort()).toEqual([
      'link_building',
      'link_district',
      'typed_address',
      'typed_district',
    ]);
  });
});

// The privacy fix of spec 04 §Start payloads: only a deep link's shape is
// recorded as it is; text typed after /start never reaches an event.
describe('recordedStartPayload', () => {
  it.each([
    ['no payload', '', null],
    ['dep', 'dep', 'dep'],
    ['a building link', `b_${UUID.toUpperCase()}`, `b_${UUID.toUpperCase()}`],
    ['a malformed building link', 'b_12345', 'b_12345'],
    ['a district link', 'd_mokotow', 'd_mokotow'],
    ['a website link', 'web_checker', 'web_checker'],
    ['a roommate link', 'mate_fb_wawapolki2', 'mate_fb_wawapolki2'],
    ['an unknown mate payload', 'matey', 'matey'],
    ['an attribution payload', 'thr_med', 'thr_med'],
    ['a 64-character payload', `web_${'x'.repeat(60)}`, `web_${'x'.repeat(60)}`],
    ['a 65-character payload', `web_${'x'.repeat(61)}`, 'invalid'],
    ['a typed sentence', 'my landlord keeps my deposit', 'invalid'],
    ['a payload with a space', 'dep now', 'invalid'],
    ['a non-ASCII word', 'mokotów', 'invalid'],
    ['an e-mail address', 'jan@example.com', 'invalid'],
    ['a whitespace-only payload', ' ', 'invalid'],
  ])('%s', (_label, raw, expected) => {
    expect(recordedStartPayload(raw)).toBe(expected);
  });
});
