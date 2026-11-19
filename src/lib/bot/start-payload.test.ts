import { describe, expect, it } from 'vitest';

import { ENTRY_SOURCE, parseStartPayload, type StartPayload } from './start-payload';

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
];

describe('parseStartPayload', () => {
  it.each(CASES)('%s', (_label, raw, expected) => {
    expect(parseStartPayload(raw)).toEqual(expected);
  });

  it('checks the length rule against a 65-character input', () => {
    expect(`web_${'x'.repeat(61)}`).toHaveLength(65);
    expect(`b_${'a'.repeat(63)}`).toHaveLength(65);
    expect(`web_${'x'.repeat(60)}`).toHaveLength(64);
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
