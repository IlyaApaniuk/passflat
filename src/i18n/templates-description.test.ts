import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 08 §Home copy (PRD 4 FR-10): the home tools card names the four
// documents of public/documents/ as Polish originals with English, Russian
// and Ukrainian versions, and the files behind that sentence exist.

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];
type Language = 'pl' | 'en' | 'ru' | 'uk';

const KEY = 'landing.tools.templatesDescription';

/** The template stems the sentence names: each a Polish .docx and .pdf, plus translated PDFs. */
const TEMPLATE_STEMS = [
  'cesja-umowy-najmu',
  'protokol-zdawczo-odbiorczy',
  'umowa-podnajmu',
  'umowa-wspollokatorska',
] as const;
type Stem = (typeof TEMPLATE_STEMS)[number];

const TRANSLATIONS = ['en', 'ru', 'uk'] as const;

/** How each locale names the four languages (stems, so every case form matches). */
const LANGUAGE_WORDS: Record<Locale, Record<Language, RegExp>> = {
  en: { pl: /\bPolish\b/, en: /\bEnglish\b/, ru: /\bRussian\b/, uk: /\bUkrainian\b/ },
  pl: { pl: /polsk/i, en: /angielsk/i, ru: /rosyjsk/i, uk: /ukraińsk/i },
  ru: { pl: /польск/i, en: /английск/i, ru: /русск/i, uk: /украинск/i },
  uk: { pl: /польськ/i, en: /англійськ/i, ru: /російськ/i, uk: /українськ/i },
};

/** How each locale names the four documents. */
const DOCUMENT_WORDS: Record<Locale, Record<Stem, RegExp>> = {
  en: {
    'cesja-umowy-najmu': /lease assignment \(cesja\)/i,
    'protokol-zdawczo-odbiorczy': /handover protocol/i,
    'umowa-podnajmu': /sublease agreement/i,
    'umowa-wspollokatorska': /flatmate agreement/i,
  },
  pl: {
    'cesja-umowy-najmu': /cesja umowy najmu/i,
    'protokol-zdawczo-odbiorczy': /protokół zdawczo-odbiorczy/i,
    'umowa-podnajmu': /umowa podnajmu/i,
    'umowa-wspollokatorska': /umowa współlokatorska/i,
  },
  ru: {
    'cesja-umowy-najmu': /цессия договора аренды/i,
    'protokol-zdawczo-odbiorczy': /протокол приёма-передачи/i,
    'umowa-podnajmu': /договор субаренды/i,
    'umowa-wspollokatorska': /соглашение соседей/i,
  },
  uk: {
    'cesja-umowy-najmu': /цесія договору оренди/i,
    'protokol-zdawczo-odbiorczy': /акт приймання-передачі/i,
    'umowa-podnajmu': /договір суборенди/i,
    'umowa-wspollokatorska': /угода співмешканців/i,
  },
};

/** Words for a document the folder does not hold (the old sentence named them). */
const OLD_DOCUMENTS: Record<Locale, RegExp> = {
  en: /lease agreement,|termination notice/i,
  pl: /umowa najmu,|wypowiedzenie/i,
  ru: /договор аренды,|расторжение/i,
  uk: /договір оренди,|розірвання/i,
};

const description = (locale: Locale): string => {
  const parsed = JSON.parse(
    readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
  ) as Record<string, unknown>;
  const value = KEY.split('.').reduce<unknown>(
    (node, key) => (node as Record<string, unknown>)?.[key],
    parsed,
  );
  if (typeof value !== 'string') throw new Error(`${locale}: ${KEY} is missing`);
  return value;
};

const named = <K extends string>(value: string, words: Record<K, RegExp>): K[] =>
  (Object.keys(words) as K[]).filter((key) => words[key].test(value));

describe('the templates sentence (spec 08 §Home copy)', () => {
  it('public/documents/ holds exactly the four templates: Polish .docx and .pdf, -en, -ru, -uk PDFs', () => {
    const files = readdirSync(join(process.cwd(), 'public/documents')).sort();
    const expected = TEMPLATE_STEMS.flatMap((stem) => [
      `${stem}.docx`,
      `${stem}.pdf`,
      ...TRANSLATIONS.map((language) => `${stem}-${language}.pdf`),
    ]).sort();
    expect(files).toEqual(expected);
  });

  it.each(LOCALES)('%s names the same four languages', (locale) => {
    expect(named(description(locale), LANGUAGE_WORDS[locale]).sort()).toEqual(
      ['en', 'pl', 'ru', 'uk'].sort(),
    );
  });

  it.each(LOCALES)('%s names the four documents and no other', (locale) => {
    const value = description(locale);
    expect(named(value, DOCUMENT_WORDS[locale])).toEqual([...TEMPLATE_STEMS]);
    expect(value).not.toMatch(OLD_DOCUMENTS[locale]);
  });

  it('the EN sentence is the spec draft', () => {
    expect(description('en')).toBe(
      'Lease assignment (cesja), handover protocol, sublease agreement and flatmate agreement — Polish originals with English, Russian and Ukrainian versions.',
    );
  });

  it('the language check fails on the old two-language sentences', () => {
    expect(
      named(
        'Lease agreement, handover protocol and termination notice — ready-made templates in Polish and English.',
        LANGUAGE_WORDS.en,
      ),
    ).toEqual(['pl', 'en']);
    expect(
      named('Договор аренды, протокол приёма-передачи — на польском и русском.', LANGUAGE_WORDS.ru),
    ).toEqual(['pl', 'ru']);
  });
});
