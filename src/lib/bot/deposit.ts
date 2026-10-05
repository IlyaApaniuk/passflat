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
 * - ustawa o ochronie praw lokatorów, art. 6e ust. 1 and Kodeks cywilny
 *   art. 681 — after moving out the tenant must "renew" the flat (painting),
 *   unless the contract says otherwise; the landlord may then deduct what the
 *   renewal actually cost, and must prove it (Kodeks cywilny art. 6);
 * - Kodeks cywilny art. 481 — statutory interest for late payment, due from the
 *   day after the deadline without any demand;
 * - Kodeks cywilny art. 112 and 115 — how a deadline set in months is counted,
 *   and that one ending on a Saturday or a public holiday moves to the next
 *   working day.
 *
 * Checked against the consolidated texts in October 2026. A contract may set a
 * different return deadline (a Szczecin court applied a two-month one in
 * III C 224/22), which is why the verdict tells people to check theirs.
 */

export type DepositReason = 'wear' | 'paint' | 'damage' | 'bills' | 'silent' | 'other';
export type DepositProtocol = 'both' | 'one' | 'none';

export const DEPOSIT_REASONS: DepositReason[] = [
  'wear',
  'paint',
  'damage',
  'bills',
  'silent',
  'other',
];
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
 * - medium: the landlord may have a claim but must prove it — damage, or the
 *   cost of repainting the tenant may owe under art. 6e;
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

// Easter Sunday by the anonymous Gregorian algorithm — two Polish public
// holidays (Easter Monday, Corpus Christi) move with it.
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month - 1, day);
}

/** Statutory days off (ustawa o dniach wolnych od pracy), Christmas Eve included from 2025. */
function isPolishPublicHoliday(date: Date): boolean {
  const year = date.getUTCFullYear();
  const md = `${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  const fixed = ['1-1', '1-6', '5-1', '5-3', '8-15', '11-1', '11-11', '12-25', '12-26'];
  if (year >= 2025) fixed.push('12-24');
  if (fixed.includes(md)) return true;

  const easter = easterSunday(year).getTime();
  const movable = [1, 60].map((offset) => new Date(easter + offset * DAY_MS)); // Easter Monday, Corpus Christi
  return movable.some((holiday) => holiday.getTime() === date.getTime());
}

/** Kodeks cywilny art. 115: a deadline on a Saturday, Sunday or holiday runs to the next working day. */
function toWorkingDay(date: Date): Date {
  let day = date;
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6 || isPolishPublicHoliday(day)) {
    day = new Date(day.getTime() + DAY_MS);
  }
  return day;
}

/** The last day the landlord has to return the deposit. */
export function depositDeadline(movedOutAt: Date): Date {
  return toWorkingDay(addOneMonth(startOfUtcDay(movedOutAt)));
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
  // The claim itself runs for six years (KC art. 118); older is almost surely a typo.
  if (base.getTime() - date.getTime() > 6 * 365 * DAY_MS) return null;
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
    case 'paint':
      return 'medium';
    case 'damage':
      return protocol === 'none' ? 'weak' : 'medium';
    default:
      return 'medium';
  }
}

export function assessDeposit(facts: DepositFactsInput, today: Date): DepositVerdict {
  const deadline = depositDeadline(facts.movedOutAt);
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
    'Proszę o wskazanie podstawy potrącenia wraz z dokumentami potwierdzającymi poniesione koszty.',
  paint:
    'W zakresie potrącenia kosztów odnowienia lokalu proszę o przedstawienie dokumentów ' +
    'potwierdzających faktyczne poniesienie tych kosztów i ich wysokość (faktury, rachunki). ' +
    'Ciężar wykazania zasadności potrącenia spoczywa na wynajmującym (art. 6 Kodeksu cywilnego). ' +
    'Potrącenie kwot nieudokumentowanych jest bezzasadne.',
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
      `należności wynajmującego z tytułu najmu lokalu. ${deadlineSentence}`,
    '',
    REASON_PARAGRAPH[input.reason],
    '',
    // Interest needs no demand: it runs from the day after the deadline (KC 481).
    verdict.overdue
      ? 'Od dnia ' +
        formatPolishDate(new Date(verdict.deadline.getTime() + DAY_MS)) +
        ' należą się odsetki ustawowe za opóźnienie (art. 481 Kodeksu cywilnego). ' +
        'W przypadku bezskutecznego upływu terminu sprawa zostanie skierowana na drogę ' +
        'postępowania sądowego, co narazi Pana/Panią na dodatkowe koszty postępowania.'
      : 'W przypadku braku zwrotu w terminie sprawa zostanie skierowana na drogę ' +
        'postępowania sądowego, co narazi Pana/Panią na dodatkowe koszty, w tym koszty ' +
        'postępowania oraz odsetki ustawowe za opóźnienie (art. 481 Kodeksu cywilnego).',
    '',
    '[Podpis]',
  ].join('\n');
}
