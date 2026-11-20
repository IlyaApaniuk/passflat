import type { RoommateProfile } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  BUDGET_BANDS,
  DRAFT_LIFE_DAYS,
  EDIT_FIELDS,
  GENDERS,
  GRACE_DAYS,
  INTAKE_STEPS,
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
  editFieldOf,
  editStepOf,
  graceEnd,
  isBudgetBand,
  isDistrictPickComplete,
  isEditField,
  isGender,
  isLanguage,
  isPets,
  isPrefers,
  isSmoking,
  languageOfLocale,
  nextIntakeStep,
  profileCreatedProperties,
  profileEditedProperties,
  RENEW_MONTH_STEP,
  SAVE_MONTH_STEP,
  reduceDistrictPick,
  renewalCheck,
  setLanguage,
  showsRenew,
  type DistrictPick,
} from './rules';

const NBSP = String.fromCharCode(0xa0);
const NARROW_NBSP = String.fromCharCode(0x202f);

describe('showsRenew (the own card Renew button, spec 06 §Save and the own card)', () => {
  const NOW = new Date('2026-12-05T10:00:00Z');
  const DAY = 24 * 60 * 60 * 1000;
  const expiringIn = (days: number) => new Date(NOW.getTime() + days * DAY);

  it('is hidden 4 days before expiry and shown at 3 and 0 days (RENEWAL_REMINDER_DAYS = 3)', () => {
    expect(showsRenew({ status: 'active', expiresAt: expiringIn(4) }, NOW)).toBe(false);
    expect(showsRenew({ status: 'active', expiresAt: expiringIn(3) }, NOW)).toBe(true);
    expect(showsRenew({ status: 'active', expiresAt: expiringIn(0) }, NOW)).toBe(true);
  });

  it('turns on exactly at expires_at − 3 days', () => {
    const justOutside = new Date(expiringIn(3).getTime() + 1000);
    expect(showsRenew({ status: 'active', expiresAt: justOutside }, NOW)).toBe(false);
  });

  it('is shown while expired and never for a draft or a hidden profile', () => {
    expect(showsRenew({ status: 'expired', expiresAt: expiringIn(-2) }, NOW)).toBe(true);
    expect(showsRenew({ status: 'hidden', expiresAt: expiringIn(1) }, NOW)).toBe(false);
    expect(showsRenew({ status: 'draft', expiresAt: null }, NOW)).toBe(false);
    expect(showsRenew({ status: 'active', expiresAt: null }, NOW)).toBe(false);
  });

  it('graceEnd is GRACE_DAYS after the expiry', () => {
    expect(graceEnd(NOW).getTime() - NOW.getTime()).toBe(GRACE_DAYS * DAY);
  });
});

describe('renewalCheck (what a Renew tap does, spec 06 §Renewal)', () => {
  const NOW = new Date('2026-12-30T10:00:00Z');
  const DAY = 24 * 60 * 60 * 1000;
  const shift = (days: number, ms = 0) => new Date(NOW.getTime() + days * DAY + ms);
  const active = (expiresAt: Date | null) => ({ status: 'active', expiresAt, expiredAt: null });

  it('renews an active profile within RENEWAL_REMINDER_DAYS of expires_at, the same rule as the card', () => {
    expect(renewalCheck(active(shift(3)), NOW)).toBe('renew');
    expect(renewalCheck(active(shift(0, 1000)), NOW)).toBe('renew');
    expect(renewalCheck(active(shift(3, 1000)), NOW)).toBe('not_due');
    expect(renewalCheck(active(shift(10)), NOW)).toBe('not_due');
    for (const days of [4, 3, 0]) {
      const profile = active(shift(days));
      expect(renewalCheck(profile, NOW) === 'renew').toBe(showsRenew(profile, NOW));
    }
  });

  it('renews an expired profile until GRACE_DAYS after expired_at, then refuses', () => {
    const expired = (expiredAt: Date) => ({ status: 'expired', expiresAt: expiredAt, expiredAt });
    expect(renewalCheck(expired(shift(-1)), NOW)).toBe('renew');
    expect(renewalCheck(expired(shift(-GRACE_DAYS, 1000)), NOW)).toBe('renew');
    expect(renewalCheck(expired(shift(-GRACE_DAYS)), NOW)).toBe('refused');
    expect(renewalCheck(expired(shift(-20)), NOW)).toBe('refused');
  });

  it('falls back to expires_at for an expired row without expired_at', () => {
    expect(renewalCheck({ status: 'expired', expiresAt: shift(-2), expiredAt: null }, NOW)).toBe(
      'renew',
    );
    expect(renewalCheck({ status: 'expired', expiresAt: null, expiredAt: null }, NOW)).toBe(
      'refused',
    );
  });

  it('never renews a hidden profile or a draft (D55)', () => {
    expect(renewalCheck({ status: 'hidden', expiresAt: shift(1), expiredAt: null }, NOW)).toBe(
      'refused',
    );
    expect(renewalCheck({ status: 'draft', expiresAt: null, expiredAt: null }, NOW)).toBe(
      'refused',
    );
    expect(renewalCheck(active(null), NOW)).toBe('not_due');
  });

  it('the renewal step is not an edit step', () => {
    expect(RENEW_MONTH_STEP).toBe('renew_month');
    expect(editFieldOf(RENEW_MONTH_STEP)).toBeNull();
  });

  it("the save's month step is neither an edit step nor followed by another intake step", () => {
    expect(SAVE_MONTH_STEP).toBe('save_month');
    expect(editFieldOf(SAVE_MONTH_STEP)).toBeNull();
    expect(nextIntakeStep(SAVE_MONTH_STEP)).toBeNull();
  });
});

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

describe('value checks of the callback data', () => {
  it('isLanguage accepts pl, en, ru and uk only', () => {
    expect(LANGUAGES.every(isLanguage)).toBe(true);
    expect(['de', 'RU', '', 'ru ', 'done'].some(isLanguage)).toBe(false);
  });

  it('isGender accepts woman and man only (skip is the button, not a value)', () => {
    expect(GENDERS.every(isGender)).toBe(true);
    expect(['skip', 'other', 'Woman', ''].some(isGender)).toBe(false);
  });

  it('isPrefers accepts anyone, women and men only', () => {
    expect(PREFERS.every(isPrefers)).toBe(true);
    expect(['skip', 'woman', 'all', ''].some(isPrefers)).toBe(false);
  });

  it('isSmoking accepts no, outside and fine only (skip is the button, not a value)', () => {
    expect(SMOKING.every(isSmoking)).toBe(true);
    expect(['skip', 'have', 'yes', 'No', ''].some(isSmoking)).toBe(false);
  });

  it('isPets accepts no, have and fine only (skip is the button, not a value)', () => {
    expect(PETS.every(isPets)).toBe(true);
    expect(['skip', 'outside', 'cat', 'Have', ''].some(isPets)).toBe(false);
  });
});

describe('languages step (FR-7)', () => {
  it('ticks the chat bot language in advance: ru → ru, uk → uk, en → en', () => {
    expect(languageOfLocale('ru')).toBe('ru');
    expect(languageOfLocale('uk')).toBe('uk');
    expect(languageOfLocale('en')).toBe('en');
  });

  it('sets the target state and keeps the button order of LANGUAGES', () => {
    expect(setLanguage(['ru'], 'pl', true)).toEqual(['pl', 'ru']);
    expect(setLanguage(['ru'], 'uk', true)).toEqual(['ru', 'uk']);
    expect(setLanguage(['pl', 'ru'], 'ru', false)).toEqual(['pl']);
    expect(setLanguage(['ru'], 'ru', false)).toEqual([]);
  });

  it('sets the same state on a repeated tap instead of flipping it back', () => {
    expect(setLanguage(['pl', 'ru'], 'pl', true)).toEqual(['pl', 'ru']);
    expect(setLanguage([], 'uk', false)).toEqual([]);
  });

  it('drops a stored code outside LANGUAGES and never mutates its input', () => {
    const stored = Object.freeze(['uk', 'xx', 'ru']);
    expect(setLanguage(stored, 'en', true)).toEqual(['en', 'ru', 'uk']);
    expect(stored).toEqual(['uk', 'xx', 'ru']);
  });
});

describe('INTAKE_STEPS and nextIntakeStep', () => {
  it('keeps the decided order of spec 06 §Intake steps (D54)', () => {
    expect(INTAKE_STEPS).toEqual([
      'districts',
      'budget',
      'month',
      'languages',
      'gender',
      'prefers',
      'about',
      'smoking',
      'pets',
      'adult',
    ]);
  });

  it('gives the following step, and null after the last one or for a step outside the intake', () => {
    expect(nextIntakeStep('districts')).toBe('budget');
    expect(nextIntakeStep('budget')).toBe('month');
    expect(nextIntakeStep('month')).toBe('languages');
    expect(nextIntakeStep('languages')).toBe('gender');
    expect(nextIntakeStep('gender')).toBe('prefers');
    expect(nextIntakeStep('prefers')).toBe('about');
    expect(nextIntakeStep('adult')).toBeNull();
    expect(nextIntakeStep('edit_budget')).toBeNull();
  });
});

describe('isBudgetBand', () => {
  it('accepts b1 – b5 only', () => {
    expect(['b1', 'b2', 'b3', 'b4', 'b5'].every(isBudgetBand)).toBe(true);
    expect(['b0', 'b6', 'B1', '', 'b1 '].some(isBudgetBand)).toBe(false);
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

describe('edit steps (spec 06 §Save and the own card, Edit)', () => {
  it.each(EDIT_FIELDS)('%s opens edit_%s and maps back to its field', (field) => {
    expect(isEditField(field)).toBe(true);
    expect(editStepOf(field)).toBe(`edit_${field}`);
    expect(editFieldOf(editStepOf(field))).toBe(field);
  });

  it.each(['gender', 'prefers', 'smoking', 'back', ''])('%s is not an edit field', (value) => {
    expect(isEditField(value)).toBe(false);
  });

  it.each([null, 'budget', 'renew_month', 'edit_', 'edit_gender', 'xedit_budget'])(
    'the step %s has no edit field',
    (step) => {
      expect(editFieldOf(step)).toBeNull();
    },
  );
});
