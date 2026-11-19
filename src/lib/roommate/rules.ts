/**
 * Constants and pure rules of roommate profiles (spec 06 §Module layout): budget bands, district
 * picks, the value sets of the intake, retention numbers and event properties. Every number of
 * spec 06 §Retention is one constant here. Pure: no Prisma client, no Telegram, no clock.
 */
import type { RoommateProfile } from '@prisma/client';

// `time.ts` imports `PROFILE_LIFE_DAYS` from here; the cycle is safe because neither module reads
// the other's bindings while loading, only inside functions.
import { monthOffset } from './time';

// ---------------------------------------------------------------------------------------------
// Retention (spec 06 §Retention, D49, D55) and the interest limit (spec 07, D68)
// ---------------------------------------------------------------------------------------------

/** Days an active profile lives from activation or renewal, capped by its move-in month (D55). */
export const PROFILE_LIFE_DAYS = 30;

/** Days an expired profile stays renewable before it is deleted; also the hidden-profile grace. */
export const GRACE_DAYS = 14;

/** Days after the last `updated_at` of a draft that was never finished before it is deleted. */
export const DRAFT_LIFE_DAYS = 7;

/** Months after `created_at` that a report row is kept. */
export const REPORT_LIFE_MONTHS = 6;

/** Days before `expires_at` when the renewal reminder goes out and Renew shows (Assumption, D68). */
export const RENEWAL_REMINDER_DAYS = 3;

/** "Interested" taps one profile may store in 24 hours (spec 07 §Interest; Assumption, D68). */
export const INTEREST_DAILY_LIMIT = 20;

/**
 * Days after a profile's earliest `matched_at` when the outcome question goes out, once per profile
 * life (spec 07 §Outcome question, FR-29; Assumption, D68).
 */
export const OUTCOME_QUESTION_DAYS = 21;

/** The outcome question's answers, the values of `outcome` and of `tg_roommate_outcome.outcome`. */
export const OUTCOMES = ['renting_together', 'talking', 'no_fit', 'dont_ask'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/**
 * The reasons of a report, in button order (spec 07 §Report, FR-31; Assumption): asks for money or
 * a deposit, fake profile, offensive, looks under 18, other. The values of `roommate_reports.reason`
 * and of `tg_roommate_reported.reason`; `under_18` hides at once (§Automatic hiding).
 */
export const REPORT_REASONS = ['money', 'fake', 'offensive', 'under_18', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * Reports from this many different people hide a profile from everyone (spec 07 §Automatic
 * hiding, FR-32; Decided, D62); one `under_18` report hides it at once.
 */
export const HIDE_AT_REPORTERS = 2;

/** Why a profile was hidden automatically: `hidden_reason` and `tg_roommate_profile_hidden.reason`. */
export type HiddenReason = 'reports' | 'under_18';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The own card's Renew button (spec 06 §Save and the own card): shown while the profile is expired
 * (it is deleted after its grace period) or within `RENEWAL_REMINDER_DAYS` of `expires_at`; never
 * for a draft or a hidden profile.
 */
export function showsRenew(
  profile: Pick<RoommateProfile, 'status' | 'expiresAt'>,
  now: Date,
): boolean {
  if (profile.status === 'expired') return true;
  if (profile.status !== 'active' || !profile.expiresAt) return false;
  return profile.expiresAt.getTime() - now.getTime() <= RENEWAL_REMINDER_DAYS * DAY_MS;
}

/** When an expired profile is deleted: `GRACE_DAYS` after it expired (spec 06 §Retention). */
export function graceEnd(expiredAt: Date): Date {
  return new Date(expiredAt.getTime() + GRACE_DAYS * DAY_MS);
}

/**
 * What a Renew tap does (spec 06 §Renewal): `renew` for an expired profile inside its grace
 * period or an active one within `RENEWAL_REMINDER_DAYS` of `expires_at` (`showsRenew`);
 * `not_due` for an active profile further from it (an old reminder's button after a renewal);
 * `refused` for a hidden profile (never renewed, D55), a draft, and an expired profile past its
 * grace period (the next cron run deletes it).
 */
export function renewalCheck(
  profile: Pick<RoommateProfile, 'status' | 'expiresAt' | 'expiredAt'>,
  now: Date,
): 'renew' | 'not_due' | 'refused' {
  if (profile.status === 'expired') {
    const expiredAt = profile.expiredAt ?? profile.expiresAt;
    return expiredAt && now.getTime() < graceEnd(expiredAt).getTime() ? 'renew' : 'refused';
  }
  if (profile.status !== 'active') return 'refused';
  return showsRenew(profile, now) ? 'renew' : 'not_due';
}

// ---------------------------------------------------------------------------------------------
// Value sets of the intake (spec 06 §Intake steps, §Entry and routing callback data)
// ---------------------------------------------------------------------------------------------

/**
 * The intake's steps in their decided order (D54): `profile.step` of a draft holds the one
 * awaiting an answer. After `adult` the profile is saved (spec 06 §Save).
 */
export const INTAKE_STEPS = [
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
] as const;
export type IntakeStep = (typeof INTAKE_STEPS)[number];

/** The step after `step` in the intake; null after the last one or for a step outside the intake. */
export function nextIntakeStep(step: string): IntakeStep | null {
  const index = INTAKE_STEPS.indexOf(step as IntakeStep);
  return index === -1 ? null : (INTAKE_STEPS[index + 1] ?? null);
}

/** FR-7: the languages a person can pick, in button order. */
export const LANGUAGES = ['pl', 'en', 'ru', 'uk'] as const;
type Language = (typeof LANGUAGES)[number];

/** True for a code of `LANGUAGES`: a language button's data is checked before it is stored. */
export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

/** FR-7: the language ticked in advance on the languages step is the chat's bot language. */
export function languageOfLocale(locale: 'ru' | 'uk' | 'en'): Language {
  return locale;
}

/**
 * A language toggle (`rm:l:<code>:1|0`) carries its target state, so a redelivered tap sets the
 * same state instead of flipping it back. The result keeps the button order of `LANGUAGES`.
 */
export function setLanguage(languages: readonly string[], code: Language, on: boolean): Language[] {
  return LANGUAGES.filter((language) => (language === code ? on : languages.includes(language)));
}

/** FR-8: own gender; skipping keeps `gender = null`. Never counted or sent in an event (D51). */
export const GENDERS = ['woman', 'man'] as const;
type Gender = (typeof GENDERS)[number];

export function isGender(value: string): value is Gender {
  return (GENDERS as readonly string[]).includes(value);
}

/** FR-8: "live with"; the default and the skip value is `anyone`. Never in an event (D51). */
export const PREFERS = ['anyone', 'women', 'men'] as const;
type Prefers = (typeof PREFERS)[number];

export function isPrefers(value: string): value is Prefers {
  return (PREFERS as readonly string[]).includes(value);
}

/** FR-11: smoking (no / outside only / fine); skip stores null. */
export const SMOKING = ['no', 'outside', 'fine'] as const;
type Smoking = (typeof SMOKING)[number];

/** True for a value of `SMOKING`: a smoking button's data is checked before it is stored. */
export function isSmoking(value: string): value is Smoking {
  return (SMOKING as readonly string[]).includes(value);
}

/** FR-11: pets (no pets / I have a pet / fine with pets); skip stores null. */
export const PETS = ['no', 'have', 'fine'] as const;
type Pets = (typeof PETS)[number];

/** True for a value of `PETS`: a pets button's data is checked before it is stored. */
export function isPets(value: string): value is Pets {
  return (PETS as readonly string[]).includes(value);
}

/** Spec 06 §Save and the own card: the fields of the edit picker (`rm:e:<field>`). */
export const EDIT_FIELDS = [
  'districts',
  'budget',
  'month',
  'languages',
  'preferences',
  'about',
  'rules',
] as const;
export type RoommateEditField = (typeof EDIT_FIELDS)[number];

/** True for a field of `EDIT_FIELDS`: an edit button's data is checked before it opens a step. */
export function isEditField(value: string): value is RoommateEditField {
  return (EDIT_FIELDS as readonly string[]).includes(value);
}

/** The step an edit opens on a saved profile: `edit_<field>`. */
export function editStepOf(field: RoommateEditField): `edit_${RoommateEditField}` {
  return `edit_${field}`;
}

/**
 * The renewal's move-in question on a saved profile (spec 06 §Renewal): open while the person
 * picks a new month, because the old one has passed or ends within `RENEWAL_REMINDER_DAYS`.
 */
export const RENEW_MONTH_STEP = 'renew_month';

/** The field of an edit step (`edit_budget` → `budget`); null for an intake or renewal step. */
export function editFieldOf(step: string | null): RoommateEditField | null {
  if (!step?.startsWith('edit_')) return null;
  const field = step.slice('edit_'.length);
  return isEditField(field) ? field : null;
}

// ---------------------------------------------------------------------------------------------
// Budget bands (FR-5; the bands are an Assumption, D68)
// ---------------------------------------------------------------------------------------------

/**
 * Budget per person a month, all-in (rent, charges, utilities), in zł. A band runs from its `min`
 * up to the next band's `min` (exclusive): b1 ≤ 1,199; b2 1,200 – 1,599; b3 1,600 – 1,999;
 * b4 2,000 – 2,499; b5 ≥ 2,500. A change of the bands is a change of this one list.
 */
export const BUDGET_BANDS = [
  { band: 'b1', min: 0 },
  { band: 'b2', min: 1200 },
  { band: 'b3', min: 1600 },
  { band: 'b4', min: 2000 },
  { band: 'b5', min: 2500 },
] as const;
export type BudgetBand = (typeof BUDGET_BANDS)[number]['band'];

/** True for a band of `BUDGET_BANDS`: a budget button's data is checked before it is stored. */
export function isBudgetBand(value: string): value is BudgetBand {
  return BUDGET_BANDS.some(({ band }) => band === value);
}

/**
 * A typed number below this is not a monthly amount in zł ("2к", "1,5", "b3") and gets "tap a
 * band" instead of b1 (agent's clarification of FR-5's typed-number edge case).
 */
const MIN_TYPED_AMOUNT = 100;

/**
 * One number as people type it: digit groups of three after whitespace (`\s` includes the
 * no-break spaces), a dot or a comma are thousands ("1 650", "1.650", "1,650"); a dot or comma
 * before other digits is a decimal part ("1650,50"). Kept without the `g` flag; `bandForAmount`
 * builds a `g` copy.
 */
const AMOUNT = /(\d{1,3}(?:[\s.,]\d{3})+(?!\d)|\d+)(?:[.,](\d+))?/;

/**
 * The band of a typed budget (FR-5 edge case): `'1650'` → b3, `'1 650 zł'` → b3, `'2500'` → b5.
 * Text without a number, with more than one number (a range such as "1500-2000") or with an
 * amount under `MIN_TYPED_AMOUNT` → null, and the step answers "tap a band".
 */
export function bandForAmount(text: string): BudgetBand | null {
  const matches = [...text.matchAll(new RegExp(AMOUNT.source, 'g'))];
  if (matches.length !== 1) return null;
  const [, whole, fraction] = matches[0];
  const amount = Number(`${whole.replace(/[^\d]/g, '')}.${fraction ?? '0'}`);
  if (!Number.isFinite(amount) || amount < MIN_TYPED_AMOUNT) return null;
  let found: BudgetBand = BUDGET_BANDS[0].band;
  for (const { band, min } of BUDGET_BANDS) {
    if (amount >= min) found = band;
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// District picks (FR-4; at most 3 and "any" are an Assumption, D68)
// ---------------------------------------------------------------------------------------------

/** The most districts one profile names. */
export const MAX_DISTRICTS = 3;

export type DistrictPick = {
  districtSlugs: readonly string[];
  anyDistrict: boolean;
};

/**
 * A tap on the districts step. A district button carries its target state (`rm:d:<slug>:1|0`),
 * so a redelivered tap sets the same state instead of flipping it back; a typed district name is
 * passed with `on` = "not picked yet" (toggled like a tap).
 */
export type DistrictPickAction = { kind: 'district'; slug: string; on: boolean } | { kind: 'any' };

export type DistrictPickResult =
  | { ok: true; pick: DistrictPick }
  | { ok: false; refused: 'limit'; pick: DistrictPick };

/**
 * The district-pick reducer: a district toggles (picking one clears "any"); a 4th district is
 * refused and changes nothing ("up to 3 districts"); "Any district" clears the districts. Whether
 * a slug exists in the `District` table is the caller's check.
 */
export function reduceDistrictPick(
  pick: DistrictPick,
  action: DistrictPickAction,
): DistrictPickResult {
  if (action.kind === 'any') {
    return { ok: true, pick: { districtSlugs: [], anyDistrict: true } };
  }
  const { slug, on } = action;
  const picked = pick.districtSlugs.includes(slug);
  if (!on) {
    return {
      ok: true,
      pick: { districtSlugs: pick.districtSlugs.filter((s) => s !== slug), anyDistrict: false },
    };
  }
  if (picked) return { ok: true, pick: { districtSlugs: pick.districtSlugs, anyDistrict: false } };
  if (pick.districtSlugs.length >= MAX_DISTRICTS) return { ok: false, refused: 'limit', pick };
  return { ok: true, pick: { districtSlugs: [...pick.districtSlugs, slug], anyDistrict: false } };
}

/** "Done" moves on with 1 – 3 districts or "any"; with nothing picked the step asks again. */
export function isDistrictPickComplete(pick: DistrictPick): boolean {
  return pick.anyDistrict || pick.districtSlugs.length > 0;
}

// ---------------------------------------------------------------------------------------------
// Event properties (spec 06 §Events, spec 07 §Events)
// ---------------------------------------------------------------------------------------------

/** `count_band` and `results_band`: `0`, `1-2`, `3-5`, `6+` (PRD 3 §6). */
export type CountBand = '0' | '1-2' | '3-5' | '6+';

export function countBand(n: number): CountBand {
  if (n >= 6) return '6+';
  if (n >= 3) return '3-5';
  if (n >= 1) return '1-2';
  return '0';
}

/** The profile fields the created event reads; never gender, "live with" or a district slug. */
type CreatedProfile = Pick<
  RoommateProfile,
  | 'districtSlugs'
  | 'anyDistrict'
  | 'budgetBand'
  | 'moveInMonth'
  | 'languages'
  | 'about'
  | 'smoking'
  | 'pets'
  | 'entrySource'
  | 'tgUsername'
>;

export type ProfileCreatedProperties = {
  district_count: number;
  any_district: boolean;
  budget_band: string | null;
  move_in_offset_months: number | null;
  language_count: number;
  has_text: boolean;
  rule_count: number;
  entry_source: string | null;
  has_username: boolean;
};

/**
 * The properties of `tg_roommate_profile_created` (spec 06 §Events plus `has_username`): counts,
 * flags and bands only. The caller passes the profile after syncing `tg_username` from
 * `ctx.from.username` (spec 06 §Entry and routing), so `has_username` reflects the save moment.
 */
export function profileCreatedProperties(
  profile: CreatedProfile,
  now: Date,
): ProfileCreatedProperties {
  const offset = profile.moveInMonth ? monthOffset(profile.moveInMonth, now) : null;
  return {
    district_count: profile.districtSlugs.length,
    any_district: profile.anyDistrict,
    budget_band: profile.budgetBand,
    move_in_offset_months: offset === null ? null : Math.min(Math.max(offset, 0), 3),
    language_count: profile.languages.length,
    has_text: Boolean(profile.about?.trim()),
    rule_count: Number(profile.smoking !== null) + Number(profile.pets !== null),
    entry_source: profile.entrySource,
    has_username: Boolean(profile.tgUsername),
  };
}

/** The properties of `tg_roommate_profile_edited`: the field only, never its value. */
export function profileEditedProperties(field: RoommateEditField): { field: RoommateEditField } {
  return { field };
}
