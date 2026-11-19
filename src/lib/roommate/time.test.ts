import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_LIFE_DAYS } from './rules';
import {
  MOVE_IN_OPTION_COUNT,
  ROOMMATE_SEND_HOUR,
  computeExpiresAt,
  endOfWarsawMonth,
  expiresAtAfterMonthEdit,
  formatMoveInMonth,
  formatWarsawDate,
  isMoveInMonthPast,
  isRoommateSendHour,
  monthKey,
  monthOffset,
  moveInMonthOptions,
  parseMonthKey,
} from './time';

/** An instant. */
const at = (iso: string) => new Date(iso);
/** A month value as Prisma reads `move_in_month` (`@db.Date`): UTC midnight of the first day. */
const month = (yyyyMm: string) => new Date(`${yyyyMm}-01T00:00:00.000Z`);
const iso = (dates: Date[]) => dates.map((d) => d.toISOString());

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('monthKey and parseMonthKey (the move-in button data rm:m:<YYYY-MM>)', () => {
  it('writes and reads YYYY-MM of a month value', () => {
    expect(monthKey(month('2026-12'))).toBe('2026-12');
    expect(monthKey(month('2027-03'))).toBe('2027-03');
    expect(parseMonthKey('2027-01')?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    for (const m of moveInMonthOptions(at('2026-12-05T10:00:00Z'))) {
      expect(parseMonthKey(monthKey(m))?.getTime()).toBe(m.getTime());
    }
  });

  it.each(['2027-13', '2027-00', '2027-1', '27-01', '2027-01-01', 'abc', ''])(
    'reads %j as no month',
    (key) => {
      expect(parseMonthKey(key)).toBeNull();
    },
  );

  it('does not depend on the process time zone', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    expect(monthKey(month('2027-01'))).toBe('2027-01');
    expect(parseMonthKey('2027-01')?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('constants (D68, FR-6)', () => {
  it('sends at 10 Warsaw, offers four months and lives 30 days', () => {
    expect(ROOMMATE_SEND_HOUR).toBe(10);
    expect(MOVE_IN_OPTION_COUNT).toBe(4);
    expect(PROFILE_LIFE_DAYS).toBe(30);
  });
});

describe('golden rows of spec 06 §Warsaw calendar', () => {
  it('moveInMonthOptions(2026-12-05T10:00Z) → December 2026 to March 2027', () => {
    expect(iso(moveInMonthOptions(at('2026-12-05T10:00:00Z')))).toEqual([
      '2026-12-01T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z',
      '2027-02-01T00:00:00.000Z',
      '2027-03-01T00:00:00.000Z',
    ]);
  });

  it('moveInMonthOptions(2026-12-31T23:30Z) starts with January 2027 (00:30 Warsaw, 1 Jan)', () => {
    const options = moveInMonthOptions(at('2026-12-31T23:30:00Z'));
    expect(options[0].toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(iso(options)).toEqual([
      '2027-01-01T00:00:00.000Z',
      '2027-02-01T00:00:00.000Z',
      '2027-03-01T00:00:00.000Z',
      '2027-04-01T00:00:00.000Z',
    ]);
  });

  it('endOfWarsawMonth(2026-12-01) → 2026-12-31T22:59:59Z (CET)', () => {
    expect(endOfWarsawMonth(month('2026-12')).toISOString()).toBe('2026-12-31T22:59:59.000Z');
  });

  it('endOfWarsawMonth(2027-03-01) → 2027-03-31T21:59:59Z (CEST from 2027-03-28)', () => {
    expect(endOfWarsawMonth(month('2027-03')).toISOString()).toBe('2027-03-31T21:59:59.000Z');
  });

  it('computeExpiresAt(2026-12-03T08:00Z, 2027-02-01) → 2027-01-02T08:00Z (30 days come first)', () => {
    expect(computeExpiresAt(at('2026-12-03T08:00:00Z'), month('2027-02')).toISOString()).toBe(
      '2027-01-02T08:00:00.000Z',
    );
  });

  it('computeExpiresAt(2026-12-20T12:00Z, 2026-12-01) → 2026-12-31T22:59:59Z (the month ends first)', () => {
    expect(computeExpiresAt(at('2026-12-20T12:00:00Z'), month('2026-12')).toISOString()).toBe(
      '2026-12-31T22:59:59.000Z',
    );
  });

  it('computeExpiresAt(2026-12-31T10:00Z renewal, 2027-02-01) → 2027-01-30T10:00Z', () => {
    expect(computeExpiresAt(at('2026-12-31T10:00:00Z'), month('2027-02')).toISOString()).toBe(
      '2027-01-30T10:00:00.000Z',
    );
  });

  it('isMoveInMonthPast(2026-12-01, 2027-01-02T10:00Z) → true', () => {
    expect(isMoveInMonthPast(month('2026-12'), at('2027-01-02T10:00:00Z'))).toBe(true);
  });

  it('isRoommateSendHour: 2026-12-30T09:15Z true, 08:15Z false (10:xx and 09:xx Warsaw, winter)', () => {
    expect(isRoommateSendHour(at('2026-12-30T09:15:00Z'))).toBe(true);
    expect(isRoommateSendHour(at('2026-12-30T08:15:00Z'))).toBe(false);
  });

  it('isRoommateSendHour: 2027-04-01T08:15Z true, 09:15Z false (summer time)', () => {
    expect(isRoommateSendHour(at('2027-04-01T08:15:00Z'))).toBe(true);
    expect(isRoommateSendHour(at('2027-04-01T09:15:00Z'))).toBe(false);
  });

  it('monthOffset(2027-02-01, 2026-12-05T10:00Z) → 2', () => {
    expect(monthOffset(month('2027-02'), at('2026-12-05T10:00:00Z'))).toBe(2);
  });
});

describe('moveInMonthOptions', () => {
  it('still offers December at 23:59 Warsaw on 31 December', () => {
    expect(moveInMonthOptions(at('2026-12-31T22:59:59Z'))[0].toISOString()).toBe(
      '2026-12-01T00:00:00.000Z',
    );
  });

  it('switches month at Warsaw midnight in summer (22:00 UTC)', () => {
    expect(moveInMonthOptions(at('2027-06-30T21:59:59Z'))[0].toISOString()).toBe(
      '2027-06-01T00:00:00.000Z',
    );
    expect(moveInMonthOptions(at('2027-06-30T22:00:00Z'))[0].toISOString()).toBe(
      '2027-07-01T00:00:00.000Z',
    );
  });

  it('rolls over the year in the middle of the list', () => {
    expect(iso(moveInMonthOptions(at('2027-10-15T12:00:00Z')))).toEqual([
      '2027-10-01T00:00:00.000Z',
      '2027-11-01T00:00:00.000Z',
      '2027-12-01T00:00:00.000Z',
      '2028-01-01T00:00:00.000Z',
    ]);
  });

  it('gives offsets 0 – 3 and none of the options is past', () => {
    const now = at('2026-12-05T10:00:00Z');
    const options = moveInMonthOptions(now);
    expect(options.map((m) => monthOffset(m, now))).toEqual([0, 1, 2, 3]);
    expect(options.map((m) => isMoveInMonthPast(m, now))).toEqual([false, false, false, false]);
  });
});

describe('endOfWarsawMonth', () => {
  it('handles the October month that ends on the day CEST ends (2027-10-31)', () => {
    expect(endOfWarsawMonth(month('2027-10')).toISOString()).toBe('2027-10-31T22:59:59.000Z');
  });

  it('handles a summer month and a leap February', () => {
    expect(endOfWarsawMonth(month('2027-07')).toISOString()).toBe('2027-07-31T21:59:59.000Z');
    expect(endOfWarsawMonth(month('2028-02')).toISOString()).toBe('2028-02-29T22:59:59.000Z');
    expect(endOfWarsawMonth(month('2027-02')).toISOString()).toBe('2027-02-28T22:59:59.000Z');
  });

  it('reads the month fields of a mid-month value too', () => {
    expect(endOfWarsawMonth(at('2026-12-17T00:00:00Z')).toISOString()).toBe(
      '2026-12-31T22:59:59.000Z',
    );
  });
});

describe('computeExpiresAt', () => {
  it('adds exactly 30 × 24 hours when the month ends later', () => {
    const from = at('2027-03-10T09:30:15.123Z');
    expect(computeExpiresAt(from, month('2027-06')).getTime() - from.getTime()).toBe(
      PROFILE_LIFE_DAYS * 24 * 60 * 60 * 1000,
    );
  });

  it('caps at the month end when both fall on the same instant', () => {
    const monthEnd = endOfWarsawMonth(month('2027-01'));
    const from = new Date(monthEnd.getTime() - PROFILE_LIFE_DAYS * 24 * 60 * 60 * 1000);
    expect(computeExpiresAt(from, month('2027-01')).toISOString()).toBe(monthEnd.toISOString());
  });

  it('lands on the month end for a move-in month that already passed', () => {
    expect(computeExpiresAt(at('2027-01-02T10:00:00Z'), month('2026-12')).toISOString()).toBe(
      '2026-12-31T22:59:59.000Z',
    );
  });
});

describe('expiresAtAfterMonthEdit (an edit never extends a profile, D55)', () => {
  const expires = at('2027-01-04T10:00:00Z');

  it('keeps expires_at when the new month ends after it', () => {
    expect(expiresAtAfterMonthEdit(expires, month('2027-01'))).toBe(expires);
    expect(expiresAtAfterMonthEdit(expires, month('2027-03'))).toBe(expires);
  });

  it('lowers it to the end of a new month that ends before it (CET)', () => {
    expect(expiresAtAfterMonthEdit(expires, month('2026-12'))?.toISOString()).toBe(
      '2026-12-31T22:59:59.000Z',
    );
  });

  it('lowers it to a summer-time month end (CEST)', () => {
    expect(
      expiresAtAfterMonthEdit(at('2027-04-20T08:00:00Z'), month('2027-03'))?.toISOString(),
    ).toBe('2027-03-31T21:59:59.000Z');
  });

  it('keeps an expiry equal to the month end, and a missing one stays missing', () => {
    const monthEnd = endOfWarsawMonth(month('2026-12'));
    expect(expiresAtAfterMonthEdit(monthEnd, month('2026-12'))).toBe(monthEnd);
    expect(expiresAtAfterMonthEdit(null, month('2026-12'))).toBeNull();
  });
});

describe('isMoveInMonthPast and monthOffset', () => {
  it('turns past at Warsaw midnight, not UTC midnight', () => {
    expect(isMoveInMonthPast(month('2026-12'), at('2026-12-31T22:59:59Z'))).toBe(false);
    expect(isMoveInMonthPast(month('2026-12'), at('2026-12-31T23:00:00Z'))).toBe(true);
    expect(monthOffset(month('2026-12'), at('2026-12-31T23:00:00Z'))).toBe(-1);
  });

  it('is false for the current and later months', () => {
    const now = at('2027-05-20T08:00:00Z');
    expect(isMoveInMonthPast(month('2027-05'), now)).toBe(false);
    expect(isMoveInMonthPast(month('2027-08'), now)).toBe(false);
    expect(isMoveInMonthPast(month('2027-04'), now)).toBe(true);
  });

  it('counts across years', () => {
    expect(monthOffset(month('2028-01'), at('2027-11-15T12:00:00Z'))).toBe(2);
    expect(monthOffset(month('2026-11'), at('2027-01-15T12:00:00Z'))).toBe(-2);
  });
});

describe('isRoommateSendHour', () => {
  it('covers the whole 10:xx Warsaw hour and nothing else (winter)', () => {
    expect(isRoommateSendHour(at('2026-12-30T08:59:59Z'))).toBe(false);
    expect(isRoommateSendHour(at('2026-12-30T09:00:00Z'))).toBe(true);
    expect(isRoommateSendHour(at('2026-12-30T09:59:59Z'))).toBe(true);
    expect(isRoommateSendHour(at('2026-12-30T10:00:00Z'))).toBe(false);
  });

  it('follows the clock change days (2027-03-28 CEST starts, 2026-10-25 CET starts)', () => {
    expect(isRoommateSendHour(at('2027-03-28T08:15:00Z'))).toBe(true);
    expect(isRoommateSendHour(at('2027-03-28T09:15:00Z'))).toBe(false);
    expect(isRoommateSendHour(at('2026-10-25T09:15:00Z'))).toBe(true);
    expect(isRoommateSendHour(at('2026-10-25T08:15:00Z'))).toBe(false);
  });

  it('matches exactly one of the two cron runs (08:00 and 09:00 UTC) every day of a year', () => {
    for (let day = 0; day < 366; day++) {
      const date = new Date(Date.UTC(2027, 0, 1 + day)).toISOString().slice(0, 10);
      const runs = [at(`${date}T08:00:00Z`), at(`${date}T09:00:00Z`)].filter(isRoommateSendHour);
      expect(runs, date).toHaveLength(1);
    }
  });
});

describe('formatMoveInMonth', () => {
  it('names the month in the nominative with the year', () => {
    expect(formatMoveInMonth(month('2026-12'), 'ru')).toBe('декабрь 2026');
    expect(formatMoveInMonth(month('2026-12'), 'uk')).toBe('грудень 2026');
    expect(formatMoveInMonth(month('2026-12'), 'en')).toBe('December 2026');
  });

  it('names every option of a December list without a year suffix', () => {
    const options = moveInMonthOptions(at('2026-12-05T10:00:00Z'));
    expect(options.map((m) => formatMoveInMonth(m, 'ru'))).toEqual([
      'декабрь 2026',
      'январь 2027',
      'февраль 2027',
      'март 2027',
    ]);
    expect(options.map((m) => formatMoveInMonth(m, 'uk'))).toEqual([
      'грудень 2026',
      'січень 2027',
      'лютий 2027',
      'березень 2027',
    ]);
    expect(options.map((m) => formatMoveInMonth(m, 'en'))).toEqual([
      'December 2026',
      'January 2027',
      'February 2027',
      'March 2027',
    ]);
  });
});

describe('independent of the process time zone', () => {
  it.each(['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati'])(
    'gives the same results under TZ=%s',
    (tz) => {
      vi.stubEnv('TZ', tz);
      expect(iso(moveInMonthOptions(at('2026-12-31T23:30:00Z')))[0]).toBe(
        '2027-01-01T00:00:00.000Z',
      );
      expect(endOfWarsawMonth(month('2027-03')).toISOString()).toBe('2027-03-31T21:59:59.000Z');
      expect(computeExpiresAt(at('2026-12-20T12:00:00Z'), month('2026-12')).toISOString()).toBe(
        '2026-12-31T22:59:59.000Z',
      );
      expect(isMoveInMonthPast(month('2026-12'), at('2026-12-31T23:00:00Z'))).toBe(true);
      expect(isRoommateSendHour(at('2027-04-01T08:15:00Z'))).toBe(true);
      expect(monthOffset(month('2027-02'), at('2026-12-05T10:00:00Z'))).toBe(2);
      expect(formatMoveInMonth(month('2026-12'), 'ru')).toBe('декабрь 2026');
      expect(formatWarsawDate(at('2026-12-31T23:30:00Z'), 'ru')).toBe('1 января 2027');
    },
  );
});

describe('formatWarsawDate (the own card hide date)', () => {
  it('writes day, month and year in each locale, with no "г." / "р." suffix', () => {
    expect(formatWarsawDate(at('2027-01-02T08:00:00Z'), 'ru')).toBe('2 января 2027');
    expect(formatWarsawDate(at('2027-01-02T08:00:00Z'), 'uk')).toBe('2 січня 2027');
    expect(formatWarsawDate(at('2027-01-02T08:00:00Z'), 'en')).toBe('2 January 2027');
  });

  it('reads the Warsaw calendar day: a month end hides on its last day', () => {
    const end = endOfWarsawMonth(month('2026-12'));
    expect(formatWarsawDate(end, 'ru')).toBe('31 декабря 2026');
    expect(formatWarsawDate(at('2027-03-31T21:59:59Z'), 'uk')).toBe('31 березня 2027');
  });

  it('turns the day at Warsaw midnight, not UTC midnight', () => {
    expect(formatWarsawDate(at('2026-12-31T22:59:59Z'), 'en')).toBe('31 December 2026');
    expect(formatWarsawDate(at('2026-12-31T23:00:00Z'), 'en')).toBe('1 January 2027');
  });
});
