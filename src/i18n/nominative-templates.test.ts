import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FORBIDDEN } from './honesty-rules';

// Spec 09 §Nominative-safe templates (PRD 4 FR-22): `{district}` is a database display name and
// `{city}` a city name, both in the nominative. Polish, Russian and Ukrainian put a locative after
// "w / na / в / у / на" ("w Warszawa", "na Mokotów", «в Варшава»), so no template places a
// preposition directly before either placeholder: the name goes first before a colon or dash, or
// after a noun in apposition ("w dzielnicy {district}", «в районе {district}»), or the city is the
// literal "w Warszawie" while Warsaw is the only city (D6).

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];

/** The spec names pl and ru; uk has the same locative ("у Варшаві") and is scanned too. */
const SCANNED: Locale[] = ['pl', 'ru', 'uk'];

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as Record<string, unknown>,
  ]),
) as Record<Locale, Record<string, unknown>>;

function leaves(value: unknown, prefix = ''): Array<[string, string]> {
  if (value === null || typeof value !== 'object') return [[prefix, String(value)]];
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, prefix ? `${prefix}.${key}` : key),
  );
}

const valueAt = (locale: Locale, path: string) =>
  path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], {
    ...messages[locale],
  }) as string;

/**
 * A preposition (Latin "w", "na"; Cyrillic "в", "у", "на") as a whole word directly before
 * `{district}` or `{city}`. `\b` does not work next to Cyrillic or Polish letters, so the word
 * start is "not preceded by a letter". No `g` flag: `test` keeps no state between calls.
 */
const PREPOSITION_BEFORE_NAME = /(^|[^a-ząćęłńóśźżа-яёіїєґ'ʼ])(w|na|в|у|на)\s+\{(district|city)\}/i;

/** The keys spec 09's table shapes, and the keys the scan found with a preposition on 2026-11-20. */
const CHANGED_KEYS = [
  'costsSeo.districtH1',
  'costsSeo.buildingsHeading',
  'calculator.h1',
  'costsSeo.cityMetaDescription',
  'costsSeo.cityH1',
  'costsSeo.districtIntro',
  'emails.cityNotifyConfirmation.subject',
  'emails.cityNotifyConfirmation.body',
  'emails.cityLaunch.subject',
  'emails.cityLaunch.heading',
];

/** Warsaw in the case each locale's calculator title and h1 need (D6). */
const IN_WARSAW: Record<Locale, string> = {
  pl: 'w Warszawie',
  en: 'Warsaw',
  ru: 'в Варшаве',
  uk: 'у Варшаві',
};

describe('nominative-safe templates (spec 09, FR-22)', () => {
  it('no pl, ru or uk value puts a preposition directly before {district} or {city}', () => {
    const offenders = SCANNED.flatMap((locale) =>
      leaves(messages[locale])
        .filter(([, value]) => PREPOSITION_BEFORE_NAME.test(value))
        .map(([path, value]) => `${locale}: ${path} → ${value}`),
    );
    expect(offenders).toEqual([]);
  });

  it('the scan catches a preposition before either name and passes the safe shapes', () => {
    const caught = [
      'Wynajem w {district}',
      'Budynki w {district}',
      'Mieszkania na {district}',
      'W {city}: koszty',
      'Ile kosztuje wynajem w {city} z wszystkimi opłatami',
      `Passflat w${String.fromCharCode(0xa0)}{city}`,
      'Аренда в {district}',
      'Дома в {district}',
      'Квартиры на {district}',
      'Отзывы у {city}',
      'Оренда у {city}',
      'Будинки в {district}',
    ];
    const passed = [
      '{district}: koszty najmu',
      'Budynki — {district}',
      '{district}, {city} — koszty najmu i pokoju',
      'Koszty najmu w dzielnicy {district} ({city})',
      'Passflat w mieście {city}',
      'Kalkulator kosztów najmu w Warszawie: czynsz i media',
      'Budynków {district}',
      'Rent in {district}',
      'Расходы на аренду в районе {district} ({city})',
      'Мы запустились в городе {city}',
      'Дома — {district}',
      'Будинки — {district}',
      'Оренда у Варшаві',
    ];
    for (const text of caught) expect(text).toMatch(PREPOSITION_BEFORE_NAME);
    for (const text of passed) expect(text).not.toMatch(PREPOSITION_BEFORE_NAME);
    expect(PREPOSITION_BEFORE_NAME.flags).not.toContain('g');
  });

  it('the district h1 puts the name first before a colon (spec 09 table, appendix table C)', () => {
    expect(valueAt('pl', 'costsSeo.districtH1')).toBe('{district}: koszty najmu');
    expect(valueAt('en', 'costsSeo.districtH1')).toBe('{district}: rent costs');
    expect(valueAt('ru', 'costsSeo.districtH1')).toBe('{district}: расходы на аренду');
    expect(valueAt('uk', 'costsSeo.districtH1')).toBe('{district}: витрати на оренду');
  });

  it('the buildings heading puts the name after a dash (spec 09 table)', () => {
    expect(valueAt('pl', 'costsSeo.buildingsHeading')).toBe('Budynki — {district}');
    expect(valueAt('en', 'costsSeo.buildingsHeading')).toBe('Buildings — {district}');
    expect(valueAt('ru', 'costsSeo.buildingsHeading')).toBe('Дома — {district}');
    expect(valueAt('uk', 'costsSeo.buildingsHeading')).toBe('Будинки — {district}');
  });

  it('the district meta title already starts with the name (T138, table C)', () => {
    for (const locale of LOCALES) {
      expect(valueAt(locale, 'costsSeo.districtMetaTitle'), locale).toMatch(
        /^\{district\}(, | \()\{city\}/,
      );
    }
  });

  it('the calculator title and h1 name Warsaw literally in the right case (table G, D6)', () => {
    expect(valueAt('pl', 'calculator.h1')).toBe('Koszt najmu w Warszawie ze wszystkimi opłatami');
    for (const locale of LOCALES) {
      for (const key of ['calculator.metaTitle', 'calculator.h1']) {
        const value = valueAt(locale, key);
        expect(value, `${locale}: ${key}`).not.toContain('{');
        expect(value, `${locale}: ${key}`).toContain(IN_WARSAW[locale]);
      }
    }
  });

  it('every changed key keeps its placeholders and makes no claim about figures', () => {
    for (const locale of LOCALES) {
      for (const key of CHANGED_KEYS) {
        const value = valueAt(locale, key);
        expect(typeof value, `${locale}: ${key}`).toBe('string');
        expect(value, `${locale}: ${key}`).not.toMatch(FORBIDDEN[locale]);
      }
      for (const key of ['costsSeo.districtH1', 'costsSeo.buildingsHeading']) {
        expect(valueAt(locale, key), `${locale}: ${key}`).toContain('{district}');
      }
      for (const key of ['costsSeo.cityMetaDescription', 'costsSeo.cityH1']) {
        expect(valueAt(locale, key), `${locale}: ${key}`).toContain('{city}');
      }
      const intro = valueAt(locale, 'costsSeo.districtIntro');
      expect(intro, locale).toContain('{district}');
      expect(intro, locale).toContain('{city}');
      for (const key of CHANGED_KEYS.filter((path) => path.startsWith('emails.'))) {
        expect(valueAt(locale, key), `${locale}: ${key}`).toContain('{city}');
      }
    }
  });
});
