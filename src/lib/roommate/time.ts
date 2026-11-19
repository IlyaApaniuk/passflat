/**
 * The Europe/Warsaw calendar of roommate profiles (spec 06 §Warsaw calendar; FR-6, FR-15, D68).
 *
 * Pure and independent of the server's time zone: every wall-clock reading goes through
 * `Intl.DateTimeFormat` with `timeZone: 'Europe/Warsaw'`, never through local `Date` getters.
 *
 * A "month" is the first day of that month as a UTC-midnight `Date`, the value Prisma reads from
 * and writes to the `@db.Date` column `move_in_month` (2026-12-01 → `2026-12-01T00:00:00.000Z`).
 * An instant (`now`, `from`, `expires_at`) is an ordinary `Date`.
 */
import { PROFILE_LIFE_DAYS } from './rules';

const WARSAW_TIME_ZONE = 'Europe/Warsaw';

/** The daily roommate messages go out in this Warsaw hour, whatever the UTC offset (D68). */
export const ROOMMATE_SEND_HOUR = 10;

/** The move-in step offers the current Warsaw month and the next three (FR-6). */
export const MOVE_IN_OPTION_COUNT = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

const warsawPartsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: WARSAW_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

type WarsawParts = {
  year: number;
  /** 1 – 12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function warsawParts(instant: Date): WarsawParts {
  const parts: Record<string, number> = {};
  for (const part of warsawPartsFormat.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Warsaw's UTC offset at `instant` in milliseconds (+1 h in winter, +2 h in summer). */
function warsawOffsetMs(instant: Date): number {
  const p = warsawParts(instant);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - (instant.getTime() - instant.getUTCMilliseconds());
}

/** The instant of midnight Warsaw time on the given day (never inside a DST gap: they are at 02:00). */
function warsawMidnight(year: number, monthIndex: number, day: number): Date {
  const wallAsUtc = Date.UTC(year, monthIndex, day);
  const guess = wallAsUtc - warsawOffsetMs(new Date(wallAsUtc));
  return new Date(wallAsUtc - warsawOffsetMs(new Date(guess)));
}

/** Months since year 0 of a month value (UTC calendar fields), for month arithmetic. */
function monthIndexOfMonth(month: Date): number {
  return month.getUTCFullYear() * 12 + month.getUTCMonth();
}

/** Months since year 0 of the Warsaw calendar month that `instant` falls in. */
function warsawMonthIndex(instant: Date): number {
  const p = warsawParts(instant);
  return p.year * 12 + (p.month - 1);
}

function monthFromIndex(index: number): Date {
  return new Date(Date.UTC(Math.floor(index / 12), index % 12, 1));
}

/** `YYYY-MM` of a month value, the form a move-in button carries (`rm:m:2026-12`). */
export function monthKey(month: Date): string {
  return `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The month value of a `YYYY-MM` key, or null when the key is not a real month. */
export function parseMonthKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return new Date(Date.UTC(Number(match[1]), month - 1, 1));
}

/** The current Warsaw month of `now` and the next three, as month values (FR-6). */
export function moveInMonthOptions(now: Date): Date[] {
  const current = warsawMonthIndex(now);
  return Array.from({ length: MOVE_IN_OPTION_COUNT }, (_, i) => monthFromIndex(current + i));
}

/** The last second of `month` in Warsaw: 23:59:59 on its last day, CET or CEST. */
export function endOfWarsawMonth(month: Date): Date {
  const nextMonth = monthFromIndex(monthIndexOfMonth(month) + 1);
  const nextMidnight = warsawMidnight(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), 1);
  return new Date(nextMidnight.getTime() - 1000);
}

/**
 * `expires_at` of a profile activated or renewed at `from` (spec 06 §Retention, D55): the earlier
 * of `from` + `PROFILE_LIFE_DAYS` days (24-hour days) and the end of the move-in month.
 */
export function computeExpiresAt(from: Date, moveInMonth: Date): Date {
  const lifeEnd = from.getTime() + PROFILE_LIFE_DAYS * DAY_MS;
  const monthEnd = endOfWarsawMonth(moveInMonth).getTime();
  return new Date(Math.min(lifeEnd, monthEnd));
}

/**
 * Whole months from the Warsaw month of `now` to `moveInMonth` (0 = this month; negative once
 * the month has passed). Feeds `move_in_offset_months` of `tg_roommate_profile_created`.
 */
export function monthOffset(moveInMonth: Date, now: Date): number {
  return monthIndexOfMonth(moveInMonth) - warsawMonthIndex(now);
}

/** True once the Warsaw calendar has left `moveInMonth` (a stale button, a renewal). */
export function isMoveInMonthPast(moveInMonth: Date, now: Date): boolean {
  return monthOffset(moveInMonth, now) < 0;
}

/**
 * True during the `ROOMMATE_SEND_HOUR` hour in Warsaw. The cron runs at 08:00 and 09:00 UTC; only
 * the run that falls on 10:xx Warsaw (09:00 UTC in winter, 08:00 UTC in summer) sends messages.
 */
export function isRoommateSendHour(now: Date): boolean {
  return warsawParts(now).hour === ROOMMATE_SEND_HOUR;
}

const monthNameFormats = {
  ru: new Intl.DateTimeFormat('ru', { month: 'long', timeZone: WARSAW_TIME_ZONE }),
  uk: new Intl.DateTimeFormat('uk', { month: 'long', timeZone: WARSAW_TIME_ZONE }),
  en: new Intl.DateTimeFormat('en', { month: 'long', timeZone: WARSAW_TIME_ZONE }),
};

/**
 * "декабрь 2026" / "грудень 2026" / "December 2026": the month in the nominative, then the year.
 * A `{ month: 'long' }`-only formatter gives the standalone (nominative) name; adding `year` would
 * give "декабрь 2026 г." / "грудень 2026 р.", and `day` the genitive "декабря".
 */
export function formatMoveInMonth(month: Date, locale: 'ru' | 'uk' | 'en'): string {
  const name = monthNameFormats[locale].format(month);
  return `${name} ${warsawParts(month).year}`;
}

const DATE_OPTIONS = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: WARSAW_TIME_ZONE,
} as const;

const dateFormats = {
  ru: new Intl.DateTimeFormat('ru', DATE_OPTIONS),
  uk: new Intl.DateTimeFormat('uk', DATE_OPTIONS),
  en: new Intl.DateTimeFormat('en', DATE_OPTIONS),
};

/**
 * The Warsaw calendar day of an instant, "2 января 2027" / "2 січня 2027" / "2 January 2027"
 * (the own card's hide date, spec 06 §Save and the own card). Built from the parts, because the
 * whole RU and UK forms end in "г." / "р.", which doubles the full stop of a sentence.
 */
export function formatWarsawDate(instant: Date, locale: 'ru' | 'uk' | 'en'): string {
  const parts = Object.fromEntries(
    dateFormats[locale].formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year}`;
}
