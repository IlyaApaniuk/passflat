/**
 * Deposit recovery: the rules, with no Telegram or database in sight.
 *
 * The verdict is deliberately rule-based rather than generated. It tells a
 * person whether the law is on their side over money, so the same facts must
 * always get the same answer, and every answer must trace back to a statute.
 *
 * Legal basis (Polish law):
 * - ustawa o ochronie praw lokatorów, art. 6 ust. 4 — the deposit is returned
 *   within a month of the flat being vacated, less the landlord's claims under
 *   the tenancy;
 * - Kodeks cywilny art. 675 § 1 — the tenant is not liable for wear resulting
 *   from proper use;
 * - Kodeks cywilny art. 481 — statutory interest for late payment;
 * - Kodeks cywilny art. 112 — how a deadline set in months is counted.
 */

export type DepositReason = 'wear' | 'damage' | 'bills' | 'silent' | 'other';
export type DepositProtocol = 'both' | 'one' | 'none';

export const DEPOSIT_REASONS: DepositReason[] = ['wear', 'damage', 'bills', 'silent', 'other'];
export const DEPOSIT_PROTOCOLS: DepositProtocol[] = ['both', 'one', 'none'];

export interface DepositFactsInput {
  movedOutAt: Date;
  deposit: number;
  returned: number;
  reason: DepositReason;
  protocol: DepositProtocol;
}

/**
 * How the case looks against the law:
 * - strong: the deduction has no legal footing (ordinary wear, no explanation);
 * - medium: the landlord must prove damage, and a handover protocol helps;
 * - weak: damage is claimed and there is no protocol — word against word;
 * - lawful: unpaid bills are a legitimate deduction, if real and documented.
 */
export type DepositStrength = 'strong' | 'medium' | 'weak' | 'lawful';

export interface DepositVerdict {
  claim: number;
  deadline: Date;
  overdue: boolean;
  /** Days left until the deadline, or days past it when overdue. */
  days: number;
  strength: DepositStrength;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

export function startOfUtcDay(date: Date): Date {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * One month on, the way Kodeks cywilny art. 112 counts it: the same day number
 * next month, or that month's last day when it has no such day (31 January →
 * 28/29 February).
 */
export function addOneMonth(date: Date): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return utcDate(year, month, Math.min(date.getUTCDate(), lastDay));
}

const TODAY_WORDS = ['сегодня', 'сьогодні', 'dziś', 'dzis', 'dzisiaj', 'today'];
const YESTERDAY_WORDS = ['вчера', 'вчора', 'wczoraj', 'yesterday'];

/**
 * A move-out date as people type it in a chat: "12.09", "12.09.2026",
 * "12/09/26", "вчера". Returns null for anything unparseable, in the future,
 * or old enough that it is almost certainly a typo.
 */
export function parseMoveOutDate(text: string, today: Date): Date | null {
  const value = text.trim().toLowerCase();
  const base = startOfUtcDay(today);

  if (TODAY_WORDS.includes(value)) return base;
  if (YESTERDAY_WORDS.includes(value)) return new Date(base.getTime() - DAY_MS);

  const match = value.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4}))?$/);
  if (!match) return null;

  const day = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  let year = match[3] ? Number(match[3]) : base.getUTCFullYear();
  if (year < 100) year += 2000;
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;

  let date = utcDate(year, monthIndex, day);
  // Reject 31.02 and the like rather than letting Date roll it into March.
  if (date.getUTCMonth() !== monthIndex) return null;

  // "12.12" typed in January means last December.
  if (!match[3] && date > base) date = utcDate(year - 1, monthIndex, day);

  if (date > base) return null;
  if (base.getTime() - date.getTime() > 3 * 365 * DAY_MS) return null;
  return date;
}

/** "3 600", "3600 zł", "3 600,00" → 3600. Whole złoty; null when not a sane amount. */
export function parseAmount(text: string): number | null {
  const cleaned = text
    .toLowerCase()
    .replace(/zł|zl|злот\S*|pln/g, '')
    .replace(/[\s\u00A0]/g, '')
    .replace(/,\d{1,2}$/, '')
    .replace(/\.\d{1,2}$/, '');
  if (!/^\d{1,6}$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  return amount > 0 && amount <= 200_000 ? amount : null;
}

function assessStrength(reason: DepositReason, protocol: DepositProtocol): DepositStrength {
  switch (reason) {
    case 'wear':
    case 'silent':
      return 'strong';
    case 'bills':
      return 'lawful';
    case 'damage':
      return protocol === 'none' ? 'weak' : 'medium';
    default:
      return 'medium';
  }
}

export function assessDeposit(facts: DepositFactsInput, today: Date): DepositVerdict {
  const deadline = addOneMonth(startOfUtcDay(facts.movedOutAt));
  const base = startOfUtcDay(today);
  const overdue = base > deadline;
  const days = Math.round(Math.abs(base.getTime() - deadline.getTime()) / DAY_MS);

  return {
    claim: Math.max(0, facts.deposit - facts.returned),
    deadline,
    overdue,
    days,
    strength: assessStrength(facts.reason, facts.protocol),
  };
}

export function formatPolishDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${date.getUTCFullYear()}`;
}

function formatPolishAmount(amount: number): string {
  return `${amount.toLocaleString('pl-PL').replace(/\s/g, '\u00A0')},00\u00A0zł`;
}

// The paragraph answering the landlord's stated reason. Each one points the
// landlord at what the law requires of them rather than arguing the facts.
const REASON_PARAGRAPH: Record<DepositReason, string> = {
  wear:
    'Wskazane potrącenie dotyczy zużycia lokalu będącego następstwem jego prawidłowego używania, ' +
    'za które – zgodnie z art. 675 § 1 Kodeksu cywilnego – najemca nie ponosi odpowiedzialności. ' +
    'Potrącenie z tego tytułu jest bezzasadne.',
  damage:
    'W przypadku zgłaszania roszczeń z tytułu uszkodzeń lokalu proszę o wskazanie ich zakresu ' +
    'wraz z dowodami (protokół zdawczo-odbiorczy, dokumentacja zdjęciowa) oraz kalkulacją kosztów ' +
    'ich usunięcia. Potrącenie kwot nieudokumentowanych jest bezzasadne.',
  bills:
    'W przypadku potrącenia należności z tytułu opłat eksploatacyjnych proszę o przedstawienie ' +
    'ich rozliczenia wraz z dokumentami źródłowymi (rozliczenie wspólnoty lub spółdzielni, faktury) ' +
    'oraz o zwrot pozostałej części kaucji.',
  silent:
    'Do dnia sporządzenia niniejszego wezwania nie otrzymałem/am zwrotu kaucji ani informacji ' +
    'o ewentualnych potrąceniach i ich podstawie.',
  other:
    'Nie zgadzam się z dokonanym potrąceniem. Proszę o wskazanie jego podstawy prawnej ' +
    'i faktycznej wraz z dokumentami.',
};

export interface DepositLetterInput extends DepositFactsInput {
  today: Date;
}

/**
 * A wezwanie do zapłaty, in Polish, filled with everything the bot knows and
 * bracketed placeholders for the personal data it deliberately never asks for
 * (names, addresses, bank account) — the letter is complete without the bot
 * storing a single piece of it.
 */
export function buildDemandLetter(input: DepositLetterInput): string {
  const verdict = assessDeposit(input, input.today);
  const deadlineSentence = verdict.overdue
    ? `Termin ten upłynął w dniu ${formatPolishDate(verdict.deadline)}.`
    : `Termin ten upływa w dniu ${formatPolishDate(verdict.deadline)}.`;

  return [
    `[Miejscowość], dnia ${formatPolishDate(input.today)}`,
    '',
    '[Imię i nazwisko najemcy]',
    '[Adres do korespondencji]',
    '',
    '[Imię i nazwisko lub nazwa wynajmującego]',
    '[Adres wynajmującego]',
    '',
    'WEZWANIE DO ZAPŁATY',
    '',
    `Wzywam do zwrotu kaucji w kwocie ${formatPolishAmount(verdict.claim)}, wpłaconej na ` +
      'podstawie umowy najmu lokalu położonego przy [adres lokalu], w terminie 7 dni od dnia ' +
      'doręczenia niniejszego wezwania, na rachunek bankowy nr [numer rachunku].',
    '',
    `Lokal został opróżniony i wydany w dniu ${formatPolishDate(input.movedOutAt)}. ` +
      'Zgodnie z art. 6 ust. 4 ustawy z dnia 21 czerwca 2001 r. o ochronie praw lokatorów ' +
      'kaucja podlega zwrotowi w ciągu miesiąca od dnia opróżnienia lokalu, po potrąceniu ' +
      `należności wynajmującego z tytułu najmu. ${deadlineSentence}`,
    '',
    REASON_PARAGRAPH[input.reason],
    '',
    'W przypadku bezskutecznego upływu terminu sprawa zostanie skierowana na drogę ' +
      'postępowania sądowego, co narazi Pana/Panią na dodatkowe koszty, w tym koszty ' +
      'postępowania oraz odsetki ustawowe za opóźnienie (art. 481 Kodeksu cywilnego).',
    '',
    '[Podpis]',
  ].join('\n');
}
