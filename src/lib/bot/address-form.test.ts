import { describe, expect, it } from 'vitest';

import { DEPOSIT_TEXT_KEYS, dt } from './deposit-texts';
import { ROOMMATE_TEXT_KEYS, rt, rtPeople } from './roommate-texts';
import {
  answeredWord,
  COMMAND_MENU,
  listingsWord,
  observationsWord,
  peopleWord,
  reportsWord,
  t,
  TEXT_KEYS,
  type BotLocale,
} from './texts';

/**
 * The bot addresses the user with «ты» in RU and «ти» in UK everywhere (spec 04
 * §Address form «ты», D42). Every RU and UK string of `texts.ts`,
 * `deposit-texts.ts` and `roommate-texts.ts` is walked: each template as
 * written, each template filled with sample values, the plural helpers and the
 * command menu.
 */

/** A letter or a combining mark, or the apostrophe inside a UK word (з’явиться). */
const WORD_CHAR = String.raw`[\p{L}\p{M}'’ʼ]`;

/** No `g` flag: a global RegExp keeps `lastIndex` between `toMatch` calls. */
function wholeWords(words: string): RegExp {
  return new RegExp(`(?<!${WORD_CHAR})(?:${words})(?!${WORD_CHAR})`, 'iu');
}

function findAll(pattern: RegExp, text: string): string[] {
  return [...text.matchAll(new RegExp(pattern.source, 'giu'))].map((match) => match[0]);
}

/** «вы», «вас», «вам», «вами» and every word starting with «ваш», any letter case. */
const FORMAL_PRONOUNS: Record<BotLocale, RegExp> = {
  ru: wholeWords(String.raw`вы|вас|вам|вами|ваш\p{L}*`),
  uk: wholeWords(String.raw`ви|вас|вам|вами|ваш\p{L}*`),
};

/**
 * Plural-polite imperatives: RU «обратитесь», «напишите», «попробуйте»,
 * «оставьте»; UK «зверніться», «напишіть», «спробуйте». Both languages build
 * them from the singular form plus «-те» (RU) or «-іть» / «-те» (UK).
 */
const FORMAL_IMPERATIVES: Record<BotLocale, RegExp> = {
  ru: wholeWords(String.raw`\p{L}+(?:ите|йте|ьте)(?:сь)?`),
  uk: wholeWords(String.raw`\p{L}+(?:іть|йте|ьте)(?:ся|сь)?`),
};

/**
 * Words the imperative pattern catches that are not verbs, each with its reason.
 * Add a word only when it is not an address to the user.
 */
const NOT_IMPERATIVES: Record<BotLocale, Record<string, string>> = {
  ru: {
    сайте: 'prepositional of «сайт» («Открыть на сайте»), a noun',
  },
  uk: {},
};

/** Texts (by source) that may keep a «вы» / «ви» form, each with its reason. */
const FORMAL_ALLOWED: Record<string, string> = {
  'roommate-texts.deleteConfirm':
    'PRD 3 §8 verbatim: «если вы уже обменялись контактами» / «якщо ви вже обмінялися» means the person and the other person, a plural, not the polite address',
};

const LOCALES: BotLocale[] = ['ru', 'uk'];
const COUNTS = [1, 2, 5, 11, 21];

/** A sample value for each placeholder name the templates use. */
function sampleVars(locale: BotLocale): Record<string, string> {
  return {
    about: 'Спокойная, работаю в IT',
    address: 'Grójecka 45',
    answered: '21',
    area: 'Mokotów',
    band: '3 200–4 100 zł',
    basis: dt(locale, 'basisStatute'),
    city: 'Kraków',
    claim: '2 500 zł',
    count: '3',
    date: '2 января 2027',
    deadline: '02.11.2026',
    days: '5',
    deleteDate: '16 января 2027',
    distance: '120',
    district: 'Mokotów',
    districts: 'Mokotów, Wola',
    expenses: dt(locale, 'claimLine', { claim: '600 zł' }),
    extra: dt(locale, 'letterExtraWear'),
    found: rt(locale, 'foundPhone'),
    gotBack: '2',
    imported: t(locale, 'groupTenantImported', { count: '1' }),
    items: rt(locale, 'countsItem', { name: 'Wola', count: '1' }),
    languages: `${rt(locale, 'langPl')}, ${rt(locale, 'langEn')}`,
    length: '291',
    mate: t(locale, 'capabilityMateOff'),
    max: '3',
    metric: t(locale, 'referenceKnownPart'),
    min: '5',
    month: 'февраль 2027',
    n: t(locale, 'medianN', { count: '3', word: reportsWord(locale, 3) }),
    name: 'Mokotów',
    people: peopleWord(locale, 3),
    position: '2',
    privacyUrl: 'https://passflat.com/ru/privacy#roommate-matching',
    quote: 'Kaucja zostanie zwrócona w terminie 30 dni.',
    source: t(locale, 'figureSourceTenant'),
    term: dt(locale, 'termDays', { n: '30' }),
    total: '18',
    value: '4 100 zł',
    word: reportsWord(locale, 3),
  };
}

type BotString = { source: string; key: string; text: string; filled: boolean };

/** Every user-facing string of one locale, named by where it comes from. */
function botStrings(locale: BotLocale): BotString[] {
  const vars = sampleVars(locale);
  const strings: BotString[] = [];
  for (const key of TEXT_KEYS) {
    strings.push({ source: `texts.${key}`, key, text: t(locale, key), filled: false });
    strings.push({ source: `texts.${key}`, key, text: t(locale, key, vars), filled: true });
  }
  for (const key of DEPOSIT_TEXT_KEYS) {
    strings.push({ source: `deposit-texts.${key}`, key, text: dt(locale, key), filled: false });
    strings.push({
      source: `deposit-texts.${key}`,
      key,
      text: dt(locale, key, vars),
      filled: true,
    });
  }
  for (const key of ROOMMATE_TEXT_KEYS) {
    const source = `roommate-texts.${key}`;
    strings.push({ source, key, text: rt(locale, key), filled: false });
    strings.push({ source, key, text: rt(locale, key, vars), filled: true });
  }
  for (const item of COMMAND_MENU[locale]) {
    const source = `COMMAND_MENU.${item.command}`;
    strings.push({ source, key: source, text: item.description, filled: true });
  }
  const helpers = {
    reportsWord,
    listingsWord,
    observationsWord,
    answeredWord,
    peopleWord,
    rtPeople,
  };
  for (const [name, helper] of Object.entries(helpers)) {
    for (const count of COUNTS) {
      const source = `${name}(${count})`;
      strings.push({ source, key: name, text: helper(locale, count), filled: true });
    }
  }
  return strings;
}

describe('bot texts: the user is addressed with «ты» / «ти»', () => {
  it.each(LOCALES)('%s: walks every text of both files, the menu and the helpers', (locale) => {
    const strings = botStrings(locale);
    expect(new Set(strings.map((item) => item.source)).size).toBe(
      TEXT_KEYS.length +
        DEPOSIT_TEXT_KEYS.length +
        ROOMMATE_TEXT_KEYS.length +
        COMMAND_MENU[locale].length +
        6 * COUNTS.length,
    );
    for (const item of strings.filter((entry) => entry.filled)) {
      expect(item.text, `${locale} ${item.source}`).not.toMatch(/\{\w+\}/);
    }
  });

  it.each(LOCALES)('%s: no formal pronoun in any text', (locale) => {
    const found = botStrings(locale)
      .filter((item) => !(item.source in FORMAL_ALLOWED))
      .flatMap((item) =>
        findAll(FORMAL_PRONOUNS[locale], item.text).map((word) => `${item.source}: «${word}»`),
      );
    expect(found).toEqual([]);
  });

  it.each(LOCALES)('%s: no plural-polite imperative in any text', (locale) => {
    const found = botStrings(locale).flatMap((item) =>
      findAll(FORMAL_IMPERATIVES[locale], item.text)
        .filter((word) => !(word.toLowerCase() in NOT_IMPERATIVES[locale]))
        .map((word) => `${item.source}: «${word}»`),
    );
    expect(found).toEqual([]);
  });

  it('the checks catch the formal forms and pass the informal ones', () => {
    for (const formal of ['вы', 'Вы', 'вас', 'вам', 'вами', 'ваш', 'Вашему', 'вашем']) {
      expect(`Срок в ${formal} договоре`).toMatch(FORMAL_PRONOUNS.ru);
    }
    for (const formal of ['ви', 'Ви', 'вас', 'вам', 'вами', 'вашого', 'вашому']) {
      expect(`Строк у ${formal} договорі`).toMatch(FORMAL_PRONOUNS.uk);
    }
    expect('У вас-то договор есть?').toMatch(FORMAL_PRONOUNS.ru);
    expect('<b>Вы</b> выехали?').toMatch(FORMAL_PRONOUNS.ru);
    for (const informal of ['выйти', 'выбери', 'вывод', 'Выбери', 'твоём']) {
      expect(`Можно ${informal} сейчас`).not.toMatch(FORMAL_PRONOUNS.ru);
    }
    for (const informal of ['вийти', 'вимога', 'вирішує', 'твоєму', 'виїзду']) {
      expect(`Можна ${informal} зараз`).not.toMatch(FORMAL_PRONOUNS.uk);
    }
    expect('Если срок важен, обратитесь к юристу.').toMatch(FORMAL_IMPERATIVES.ru);
    expect('Если срок важен, обратись к юристу.').not.toMatch(FORMAL_IMPERATIVES.ru);
    expect('Напишите дату.').toMatch(FORMAL_IMPERATIVES.ru);
    expect('Якщо строк важливий, зверніться до юриста.').toMatch(FORMAL_IMPERATIVES.uk);
    expect('Якщо строк важливий, звернися до юриста.').not.toMatch(FORMAL_IMPERATIVES.uk);
    expect('Спробуйте ще раз.').toMatch(FORMAL_IMPERATIVES.uk);
  });

  it('the known switched texts read as the D42 drafts', () => {
    expect(dt('ru', 'generalRuleContractFailed')).toBe(
      'Договор прочитать не удалось, поэтому ниже — общее правило закона, а не вывод по твоему договору. Срок в твоём договоре может быть другим.',
    );
    expect(dt('uk', 'generalRuleNotLease')).toBe(
      'Це не схоже на договір оренди, тому нижче — загальне правило закону, а не висновок щодо твого договору. Строк у твоєму договорі може бути іншим.',
    );
    expect(dt('ru', 'letterHowTo')).toContain(
      '• дополнительно — копией на email или в мессенджер, где шла переписка с хозяином.',
    );
    expect(dt('uk', 'letterHowTo')).toContain(
      '• додатково — копією на email або в месенджер, де йшло листування з власником.',
    );
  });
});
