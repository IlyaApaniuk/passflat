import type { RoommateProfile } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  BUDGET_BANDS,
  DRAFT_LIFE_DAYS,
  EDIT_FIELDS,
  GENDERS,
  GRACE_DAYS,
  INTEREST_DAILY_LIMIT,
  LANGUAGES,
  MAX_DISTRICTS,
  PETS,
  PREFERS,
  PROFILE_LIFE_DAYS,
  RENEWAL_REMINDER_DAYS,
  REPORT_LIFE_MONTHS,
  SMOKING,
  bandForAmount,
  countBand,
  isDistrictPickComplete,
  profileCreatedProperties,
  profileEditedProperties,
  reduceDistrictPick,
  type DistrictPick,
} from './rules';

const NBSP = String.fromCharCode(0xa0);
const NARROW_NBSP = String.fromCharCode(0x202f);

describe('retention and limit constants', () => {
  it('holds every number of spec 06 §Retention and the interest limit of spec 07', () => {
    expect(PROFILE_LIFE_DAYS).toBe(30);
    expect(GRACE_DAYS).toBe(14);
    expect(DRAFT_LIFE_DAYS).toBe(7);
    expect(REPORT_LIFE_MONTHS).toBe(6);
    expect(RENEWAL_REMINDER_DAYS).toBe(3);
    expect(INTEREST_DAILY_LIMIT).toBe(20);
    expect(MAX_DISTRICTS).toBe(3);
  });
});

describe('value sets', () => {
  it('match the callback data of spec 06 §Entry and routing and the schema comments', () => {
    expect(LANGUAGES).toEqual(['pl', 'en', 'ru', 'uk']);
    expect(GENDERS).toEqual(['woman', 'man']);
    expect(PREFERS).toEqual(['anyone', 'women', 'men']);
    expect(SMOKING).toEqual(['no', 'outside', 'fine']);
    expect(PETS).toEqual(['no', 'have', 'fine']);
    expect(EDIT_FIELDS).toEqual([
      'districts',
      'budget',
      'month',
      'languages',
      'preferences',
      'about',
      'rules',
    ]);
  });
});

describe('BUDGET_BANDS', () => {
  it('is b1 – b5 with the lower bounds of spec 06 step 2', () => {
    expect(BUDGET_BANDS.map((b) => [b.band, b.min])).toEqual([
      ['b1', 0],
      ['b2', 1200],
      ['b3', 1600],
      ['b4', 2000],
      ['b5', 2500],
    ]);
  });

  it.each([
    ['100', 'b1'],
    ['1199', 'b1'],
    ['1200', 'b2'],
    ['1599', 'b2'],
    ['1600', 'b3'],
    ['1999', 'b3'],
    ['2000', 'b4'],
    ['2499', 'b4'],
    ['2500', 'b5'],
    ['12000', 'b5'],
  ])('puts %s zł in %s', (text, band) => {
    expect(bandForAmount(text)).toBe(band);
  });
});

describe('bandForAmount', () => {
  it.each([
    ['1650', 'b3'],
    ['1 650 zł', 'b3'],
    ['2500', 'b5'],
  ])('maps the golden case %j to %s', (text, band) => {
    expect(bandForAmount(text)).toBe(band);
  });

  it.each([
    [`1${NBSP}650`, 'b3'],
    [`1${NARROW_NBSP}650 zł`, 'b3'],
    ['1.650', 'b3'],
    ['1,650', 'b3'],
    ['2 500', 'b5'],
    ['2,500.50', 'b5'],
    ['1650,50 zł', 'b3'],
    ['1199,99', 'b1'],
    ['~1800 zł/mies.', 'b3'],
    ['до 1500 в месяц', 'b2'],
    ['1650zł', 'b3'],
  ])('reads %j as one amount in %s', (text, band) => {
    expect(bandForAmount(text)).toBe(band);
  });

  it.each([[''], ['   '], ['около двух тысяч'], ['не знаю'], ['tap']])(
    'returns null for %j (no number)',
    (text) => {
      expect(bandForAmount(text)).toBeNull();
    },
  );

  it.each([['1500-2000'], ['от 1500 до 2000'], ['1650 zł na 2 osoby'], ['1 6500']])(
    'returns null for %j (more than one number)',
    (text) => {
      expect(bandForAmount(text)).toBeNull();
    },
  );

  it.each([['2к'], ['1,5'], ['b3'], ['99']])(
    'returns null for %j (under the smallest monthly amount)',
    (text) => {
      expect(bandForAmount(text)).toBeNull();
    },
  );
});

describe('reduceDistrictPick', () => {
  const none: DistrictPick = Object.freeze({
    districtSlugs: Object.freeze([]),
    anyDistrict: false,
  });
  const three: DistrictPick = Object.freeze({
    districtSlugs: Object.freeze(['mokotow', 'ochota', 'wola']),
    anyDistrict: false,
  });

  it('turns a district on and off', () => {
    const on = reduceDistrictPick(none, { kind: 'district', slug: 'mokotow', on: true });
    expect(on).toEqual({ ok: true, pick: { districtSlugs: ['mokotow'], anyDistrict: false } });
    const off = reduceDistrictPick(on.pick, { kind: 'district', slug: 'mokotow', on: false });
    expect(off).toEqual({ ok: true, pick: { districtSlugs: [], anyDistrict: false } });
  });

  it('keeps the pick order of the districts', () => {
    let pick = none;
    for (const slug of ['wola', 'mokotow', 'ochota']) {
      pick = reduceDistrictPick(pick, { kind: 'district', slug, on: true }).pick;
    }
    expect(pick.districtSlugs).toEqual(['wola', 'mokotow', 'ochota']);
  });

  it('sets the same state on a repeated tap instead of flipping it back', () => {
    const once = reduceDistrictPick(none, { kind: 'district', slug: 'wola', on: true });
    const twice = reduceDistrictPick(once.pick, { kind: 'district', slug: 'wola', on: true });
    expect(twice).toEqual({ ok: true, pick: { districtSlugs: ['wola'], anyDistrict: false } });
    const offTwice = reduceDistrictPick(none, { kind: 'district', slug: 'wola', on: false });
    expect(offTwice).toEqual({ ok: true, pick: { districtSlugs: [], anyDistrict: false } });
  });

  it('refuses a 4th district and changes nothing', () => {
    const result = reduceDistrictPick(three, { kind: 'district', slug: 'bemowo', on: true });
    expect(result).toEqual({ ok: false, refused: 'limit', pick: three });
    expect(result.pick).toBe(three);
  });

  it('still lets a full pick re-confirm or drop one of its three districts', () => {
    expect(reduceDistrictPick(three, { kind: 'district', slug: 'wola', on: true })).toEqual({
      ok: true,
      pick: { districtSlugs: ['mokotow', 'ochota', 'wola'], anyDistrict: false },
    });
    expect(reduceDistrictPick(three, { kind: 'district', slug: 'ochota', on: false })).toEqual({
      ok: true,
      pick: { districtSlugs: ['mokotow', 'wola'], anyDistrict: false },
    });
  });

  it('"any" clears the districts', () => {
    expect(reduceDistrictPick(three, { kind: 'any' })).toEqual({
      ok: true,
      pick: { districtSlugs: [], anyDistrict: true },
    });
  });

  it('a district picked after "any" clears "any"', () => {
    const any = reduceDistrictPick(none, { kind: 'any' }).pick;
    expect(reduceDistrictPick(any, { kind: 'district', slug: 'praga-poludnie', on: true })).toEqual(
      { ok: true, pick: { districtSlugs: ['praga-poludnie'], anyDistrict: false } },
    );
  });

  it('never mutates its input (frozen inputs would throw)', () => {
    reduceDistrictPick(none, { kind: 'district', slug: 'wola', on: true });
    reduceDistrictPick(three, { kind: 'district', slug: 'wola', on: false });
    reduceDistrictPick(three, { kind: 'any' });
    expect(three.districtSlugs).toEqual(['mokotow', 'ochota', 'wola']);
  });
});

describe('isDistrictPickComplete', () => {
  it('needs 1 – 3 districts or "any"', () => {
    expect(isDistrictPickComplete({ districtSlugs: [], anyDistrict: false })).toBe(false);
    expect(isDistrictPickComplete({ districtSlugs: ['wola'], anyDistrict: false })).toBe(true);
    expect(isDistrictPickComplete({ districtSlugs: [], anyDistrict: true })).toBe(true);
  });
});

describe('countBand', () => {
  it.each([
    [0, '0'],
    [1, '1-2'],
    [2, '1-2'],
    [3, '3-5'],
    [5, '3-5'],
    [6, '6+'],
    [250, '6+'],
  ])('puts %i in %s', (n, band) => {
    expect(countBand(n)).toBe(band);
  });
});

const NOW = new Date('2026-12-05T10:00:00Z');

function profile(overrides: Partial<RoommateProfile> = {}): RoommateProfile {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    chatId: '00000000-0000-4000-8000-000000000002',
    status: 'draft',
    step: 'adult',
    entrySource: 'fb',
    districtSlugs: ['mokotow', 'ochota'],
    anyDistrict: false,
    budgetBand: 'b3',
    moveInMonth: new Date('2027-02-01T00:00:00Z'),
    languages: ['ru', 'pl'],
    gender: 'woman',
    prefers: 'women',
    about: 'Pracuję w IT, spokojna, nie palę',
    smoking: 'no',
    pets: 'have',
    adultConfirmedAt: null,
    tgUsername: 'anna_w_secret',
    activatedAt: null,
    expiresAt: null,
    renewalRemindedAt: null,
    expiredAt: null,
    renewedAt: null,
    notifyOnOpenAt: null,
    notifiedOpenAt: null,
    pushOff: false,
    lastPushAt: null,
    hiddenAt: null,
    hiddenReason: null,
    statementSentAt: null,
    appealedAt: null,
    outcomeAskedAt: null,
    outcome: null,
    createdAt: new Date('2026-12-05T09:50:00Z'),
    updatedAt: new Date('2026-12-05T09:59:00Z'),
    ...overrides,
  };
}

const CREATED_KEYS = [
  'any_district',
  'budget_band',
  'district_count',
  'entry_source',
  'has_text',
  'has_username',
  'language_count',
  'move_in_offset_months',
  'rule_count',
];

describe('profileCreatedProperties', () => {
  it('returns exactly the keys of spec 06 §Events plus has_username', () => {
    expect(Object.keys(profileCreatedProperties(profile(), NOW)).sort()).toEqual(CREATED_KEYS);
    expect(
      Object.keys(
        profileCreatedProperties(
          profile({ anyDistrict: true, districtSlugs: [], about: null, tgUsername: null }),
          NOW,
        ),
      ).sort(),
    ).toEqual(CREATED_KEYS);
  });

  it('summarises a full profile with counts, flags and bands', () => {
    expect(profileCreatedProperties(profile(), NOW)).toEqual({
      district_count: 2,
      any_district: false,
      budget_band: 'b3',
      move_in_offset_months: 2,
      language_count: 2,
      has_text: true,
      rule_count: 2,
      entry_source: 'fb',
      has_username: true,
    });
  });

  it('never carries gender, "live with", the text, a district slug or the username', () => {
    const properties = profileCreatedProperties(profile(), NOW);
    const keys = Object.keys(properties);
    for (const forbidden of [
      'gender',
      'prefers',
      'about',
      'text',
      'district_slugs',
      'districts',
      'username',
      'tg_username',
      'chat_id',
    ]) {
      expect(keys).not.toContain(forbidden);
    }
    const values = JSON.stringify(Object.values(properties));
    for (const leaked of ['woman', 'women', 'Pracuję', 'mokotow', 'ochota', 'anna_w_secret']) {
      expect(values).not.toContain(leaked);
    }
  });

  it('describes a minimal profile ("any", no text, no rules, no username)', () => {
    expect(
      profileCreatedProperties(
        profile({
          anyDistrict: true,
          districtSlugs: [],
          about: null,
          smoking: null,
          pets: null,
          gender: null,
          prefers: 'anyone',
          tgUsername: null,
          languages: ['uk'],
          entrySource: 'bot_menu',
          moveInMonth: new Date('2026-12-01T00:00:00Z'),
        }),
        NOW,
      ),
    ).toEqual({
      district_count: 0,
      any_district: true,
      budget_band: 'b3',
      move_in_offset_months: 0,
      language_count: 1,
      has_text: false,
      rule_count: 0,
      entry_source: 'bot_menu',
      has_username: false,
    });
  });

  it('counts each answered house rule once', () => {
    expect(
      profileCreatedProperties(profile({ smoking: 'outside', pets: null }), NOW).rule_count,
    ).toBe(1);
    expect(profileCreatedProperties(profile({ smoking: null, pets: 'fine' }), NOW).rule_count).toBe(
      1,
    );
  });

  it('treats a blank text and an empty username as absent', () => {
    const properties = profileCreatedProperties(profile({ about: '   ', tgUsername: '' }), NOW);
    expect(properties.has_text).toBe(false);
    expect(properties.has_username).toBe(false);
  });

  it('keeps move_in_offset_months within 0 – 3 (Warsaw months)', () => {
    const offset = (month: string, now: Date = NOW) =>
      profileCreatedProperties(profile({ moveInMonth: new Date(`${month}T00:00:00Z`) }), now)
        .move_in_offset_months;
    expect(offset('2026-12-01')).toBe(0);
    expect(offset('2027-01-01')).toBe(1);
    expect(offset('2027-03-01')).toBe(3);
    expect(offset('2027-06-01')).toBe(3);
    expect(offset('2026-11-01')).toBe(0);
    // 2026-12-31T23:30Z is already January in Warsaw.
    expect(offset('2027-01-01', new Date('2026-12-31T23:30:00Z'))).toBe(0);
    expect(
      profileCreatedProperties(profile({ moveInMonth: null }), NOW).move_in_offset_months,
    ).toBe(null);
  });
});

describe('profileEditedProperties', () => {
  it.each(EDIT_FIELDS)('sends only the field name for %s', (field) => {
    expect(profileEditedProperties(field)).toEqual({ field });
    expect(Object.keys(profileEditedProperties(field))).toEqual(['field']);
  });
});
