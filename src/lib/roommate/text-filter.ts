/**
 * The contact filter of the roommate profile's short text (spec 06 §Text filter, FR-10, D54).
 *
 * Stage 1 shows nobody to anybody, and stage 2 reveals contacts only after mutual interest, so
 * the "about" text must not carry a contact. `checkAboutText` normalises the text with NFKC (so
 * full-width digits and letters cannot slip past), trims it and returns the value to store, or
 * what it found. Pure: it never logs the text.
 *
 * Agent's clarifications (spec 06 leaves them open):
 * - Length counts Unicode code points, as the `about varchar(280)` column does.
 * - Blank text (only spaces or invisible characters) is a skip: `{ ok: true, value: null }`.
 * - `too_long` also carries the length, for the reply.
 * - The checks run on a copy without invisible format characters (`\p{Cf}`, e.g. a zero-width
 *   space between digits); the stored value is the NFKC text as typed.
 * - "Dashes" are every Unicode dash (`\p{Pd}`), "brackets" are `()` and `[]`.
 * - One finding is reported, in this order: too_long, link, email, handle, iban, phone (an
 *   e-mail is checked before a handle so its `@` is not a handle; an IBAN before a phone because
 *   its digit run also matches the phone rule).
 */

export const ABOUT_MAX_LENGTH = 280;

export type AboutTextFinding = 'too_long' | 'link' | 'handle' | 'email' | 'phone' | 'iban';

type AboutTextResult =
  | { ok: true; value: string | null }
  | { ok: false; found: 'too_long'; length: number }
  | { ok: false; found: Exclude<AboutTextFinding, 'too_long'> };

const INVISIBLE = /\p{Cf}/gu;
const LINK = /https?:\/\/|www\.|t\.me\/|telegram\.me\//iu;
const EMAIL = /[\p{L}\p{N}._%+-]+@(?:[\p{L}\p{N}-]+\.)+\p{L}{2,}/u;
const HANDLE = /@\w{3,}/u;
const IBAN_PL = /PL(?:\s*\p{Nd}){26}/iu;
const DIGIT_RUN = /\p{Nd}{15,}/u;
const PHONE = /\p{Nd}(?:[\s\p{Pd}.()[\]+]*\p{Nd}){6,}/u;

const CONTACT_RULES: ReadonlyArray<readonly [Exclude<AboutTextFinding, 'too_long'>, RegExp]> = [
  ['link', LINK],
  ['email', EMAIL],
  ['handle', HANDLE],
  ['iban', IBAN_PL],
  ['iban', DIGIT_RUN],
  ['phone', PHONE],
];

export function checkAboutText(raw: string): AboutTextResult {
  const value = raw.normalize('NFKC').trim();
  const visible = value.replace(INVISIBLE, '');
  if (visible.trim() === '') return { ok: true, value: null };

  const length = [...value].length;
  if (length > ABOUT_MAX_LENGTH) return { ok: false, found: 'too_long', length };

  for (const [found, pattern] of CONTACT_RULES) {
    if (pattern.test(visible)) return { ok: false, found };
  }
  return { ok: true, value };
}
