import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { FORBIDDEN, type HonestyLocale } from '@/i18n/honesty-rules';

import { countRoommates, type CountedProfile } from './counts';
import { districtRoommateSection } from './district-section';
import type { FlatmateBlockCounts } from './flatmate-block';

/**
 * The district page's count line (spec 09 §District section, PRD 4 FR-26): the three states of the
 * pure helper, the PRD 4 §5 example 4 golden case through the counting rule, and the drafts
 * rendered for real in the four locales (plural forms, the name first, no claim words).
 */

const LOCALES: HonestyLocale[] = ['en', 'pl', 'ru', 'uk'];

function translator(locale: HonestyLocale) {
  const messages = JSON.parse(
    readFileSync(join(process.cwd(), `src/i18n/messages/${locale}.json`), 'utf8'),
  ) as never;
  return createTranslator({
    locale,
    messages,
    onError: (error) => {
      throw error;
    },
  }) as unknown as (key: string, values?: Record<string, string | number>) => string;
}

/** The count line `districtRoommateSection` decides, rendered as the page renders it. */
function countLine(
  locale: HonestyLocale,
  slug: string,
  district: string,
  counts: FlatmateBlockCounts | undefined,
): string | null {
  const t = translator(locale);
  const { countLine: line } = districtRoommateSection({ slug, counts, translate: t });
  if (!line) return null;
  return line.key === 'costsSeo.districtProfileCount'
    ? t(line.key, { district, n: line.n })
    : t(line.key, { district });
}

const counted = (id: string, districts: string[] | 'any'): CountedProfile => ({
  id,
  districtSlugs: districts === 'any' ? [] : districts,
  anyDistrict: districts === 'any',
});

/** PRD 4 §5 example 4: the active profiles (P5 hidden, P6 expired, P9 blocked are not loaded). */
function example4(): FlatmateBlockCounts {
  const result = countRoommates(null, [
    counted('P1', ['mokotow', 'ochota']),
    counted('P2', ['mokotow']),
    counted('P3', 'any'),
    counted('P4', ['wola']),
    counted('P7', ['ochota']),
  ]);
  if (result.kind !== 'top' || !result.byDistrict) throw new Error('expected the website shape');
  return { status: 'counts', total: result.total, top: result.top, byDistrict: result.byDistrict };
}

describe('districtRoommateSection: the three count states', () => {
  const COUNTS: FlatmateBlockCounts = {
    status: 'counts',
    total: 4,
    top: [{ slug: 'mokotow', count: 3 }],
    byDistrict: { mokotow: 3 },
  };

  /** The count line alone, without a room area (the FR-26 part of the section). */
  const countOf = (slug: string, counts: FlatmateBlockCounts | undefined) =>
    districtRoommateSection({ slug, counts, translate: translator('en') }).countLine;

  it('n > 0: the count line with the district own count (not the Warsaw total)', () => {
    expect(countOf('mokotow', COUNTS)).toEqual({ key: 'costsSeo.districtProfileCount', n: 3 });
  });

  it('zero or the slug absent: "nobody has named this district yet"', () => {
    expect(countOf('wawer', COUNTS)).toEqual({ key: 'costsSeo.districtProfileNone' });
    expect(countOf('wawer', { ...COUNTS, byDistrict: { wawer: 0 } })).toEqual({
      key: 'costsSeo.districtProfileNone',
    });
    expect(countOf('wola', { status: 'counts', total: 0, top: [], byDistrict: {} })).toEqual({
      key: 'costsSeo.districtProfileNone',
    });
  });

  it('unavailable, a rejected load (absent) or an old cached shape without byDistrict: no line', () => {
    expect(countOf('mokotow', { status: 'unavailable' })).toBeNull();
    expect(countOf('mokotow', undefined)).toBeNull();
    const v1 = { status: 'counts', total: 4, top: [] } as unknown as FlatmateBlockCounts;
    expect(countOf('mokotow', v1)).toBeNull();
  });

  it('reads own properties only: a slug named like an Object.prototype member counts 0', () => {
    expect(countOf('constructor', COUNTS)).toEqual({ key: 'costsSeo.districtProfileNone' });
  });

  it('without a room area: no figure lines and no split', () => {
    expect(
      districtRoommateSection({ slug: 'mokotow', counts: COUNTS, translate: translator('en') }),
    ).toEqual({
      countLine: { key: 'costsSeo.districtProfileCount', n: 3 },
      room: null,
      split: null,
      splitArea: undefined,
    });
  });
});

describe('golden case: PRD 4 §5 example 4 on the district pages', () => {
  it('EN: Mokotów 2, Ochota 2, Wola 1, Wawer nobody yet; "any" (P3) counts in no district', () => {
    const counts = example4();
    expect(countLine('en', 'mokotow', 'Mokotów', counts)).toBe(
      'Mokotów: 2 people with a profile name this district.',
    );
    expect(countLine('en', 'ochota', 'Ochota', counts)).toBe(
      'Ochota: 2 people with a profile name this district.',
    );
    expect(countLine('en', 'wola', 'Wola', counts)).toBe(
      'Wola: 1 person with a profile names this district.',
    );
    expect(countLine('en', 'wawer', 'Wawer', counts)).toBe(
      'Wawer: nobody has named this district yet — be the first.',
    );
  });

  it('PL, RU, UK: the name first in the nominative, then the count', () => {
    const counts = example4();
    expect(countLine('pl', 'wola', 'Wola', counts)).toBe(
      'Wola: 1 osoba z profilem wskazała tę dzielnicę.',
    );
    expect(countLine('pl', 'mokotow', 'Mokotów', counts)).toBe(
      'Mokotów: 2 osoby z profilem wskazały tę dzielnicę.',
    );
    expect(countLine('ru', 'mokotow', 'Mokotów', counts)).toBe(
      'Mokotów: 2 человека с анкетой выбрали этот район.',
    );
    expect(countLine('uk', 'wola', 'Wola', counts)).toBe(
      'Wola: 1 людина з анкетою обрала цей район.',
    );
    expect(countLine('pl', 'wawer', 'Wawer', counts)).toBe(
      'Wawer: nikt jeszcze nie wskazał tej dzielnicy — bądź wśród pierwszych.',
    );
    expect(countLine('ru', 'wawer', 'Wawer', counts)).toBe(
      'Wawer: этот район пока никто не выбрал — будь среди первых.',
    );
    expect(countLine('uk', 'wawer', 'Wawer', counts)).toBe(
      'Wawer: цей район поки ніхто не обрав — будь серед перших.',
    );
  });
});

describe('the drafts in four locales', () => {
  const withCount = (n: number): FlatmateBlockCounts => ({
    status: 'counts',
    total: n,
    top: [{ slug: 'wola', count: n }],
    byDistrict: { wola: n },
  });

  it.each<[HonestyLocale, number, string]>([
    ['pl', 1, '1 osoba z profilem wskazała'],
    ['pl', 3, '3 osoby z profilem wskazały'],
    ['pl', 5, '5 osób z profilem wskazało'],
    ['pl', 22, '22 osoby z profilem wskazały'],
    ['ru', 1, '1 человек с анкетой выбрал'],
    ['ru', 3, '3 человека с анкетой выбрали'],
    ['ru', 5, '5 человек с анкетой выбрали'],
    ['ru', 21, '21 человек с анкетой выбрал'],
    ['uk', 1, '1 людина з анкетою обрала'],
    ['uk', 3, '3 людини з анкетою обрали'],
    ['uk', 5, '5 людей з анкетою обрали'],
    ['uk', 21, '21 людина з анкетою обрала'],
    ['en', 1, '1 person with a profile names'],
    ['en', 5, '5 people with a profile name'],
  ])('%s, n = %i: full plural forms (%s)', (locale, n, expected) => {
    expect(countLine(locale, 'wola', 'Wola', withCount(n))).toBe(
      `Wola: ${expected} ${locale === 'en' ? 'this district.' : expectedTail(locale)}`,
    );
  });

  function expectedTail(locale: HonestyLocale): string {
    return { pl: 'tę dzielnicę.', ru: 'этот район.', uk: 'цей район.', en: 'this district.' }[
      locale
    ];
  }

  it.each(LOCALES)(
    '%s: no percentage, rank, "cheapest", claim word or freshness in the section copy',
    (locale) => {
      const t = translator(locale);
      const lines = [
        t('costsSeo.districtRoommateHeading', { district: 'Wola' }),
        countLine(locale, 'wola', 'Wola', withCount(2)),
        countLine(locale, 'wola', 'Wola', withCount(1)),
        countLine(locale, 'wawer', 'Wawer', withCount(2)),
      ];
      for (const line of lines) {
        expect(line).toMatch(/^(Wola|Wawer|[^:]+: Wola)/);
        expect(line).not.toMatch(FORBIDDEN[locale]);
        expect(line).not.toMatch(
          /%|cheapest|najtań|дешевл|дешевш|rank|ranking|рейтинг|today|dziś|сегодня|сьогодні/i,
        );
      }
    },
  );

  it.each(LOCALES)(
    '%s: the heading keeps the district in the nominative after a colon',
    (locale) => {
      expect(translator(locale)('costsSeo.districtRoommateHeading', { district: 'Wola' })).toMatch(
        /: Wola$/,
      );
    },
  );
});
