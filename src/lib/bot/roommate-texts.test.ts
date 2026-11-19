import { describe, expect, it } from 'vitest';

import { MAX_DISTRICTS, PROFILE_LIFE_DAYS } from '@/lib/roommate/rules';

import { ROOMMATE_TEXT_KEYS, rt, rtPeople } from './roommate-texts';
import type { BotLocale } from './texts';

const LOCALES: BotLocale[] = ['ru', 'uk', 'en'];

/** Placeholders a locale may leave out because its grammar needs no agreement word. */
const GRAMMAR_ONLY_VARS: Record<BotLocale, string[]> = { ru: [], uk: [], en: ['people'] };

function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
}

describe('roommate texts: every key in every locale', () => {
  it('has a non-empty ru, uk and en value for each key', () => {
    expect(ROOMMATE_TEXT_KEYS.length).toBeGreaterThan(0);
    const missing: string[] = [];
    for (const key of ROOMMATE_TEXT_KEYS) {
      for (const locale of LOCALES) {
        const value: unknown = rt(locale, key);
        if (typeof value !== 'string' || value.trim() === '') missing.push(`${locale}.${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('uses the same placeholders in every locale', () => {
    for (const key of ROOMMATE_TEXT_KEYS) {
      const ru = placeholders(rt('ru', key));
      for (const locale of LOCALES) {
        const expected = ru.filter((name) => !GRAMMAR_ONLY_VARS[locale].includes(name));
        expect(placeholders(rt(locale, key)), `${locale}.${key}`).toEqual(expected);
      }
    }
  });

  it('writes each locale in its own script', () => {
    for (const key of ROOMMATE_TEXT_KEYS) {
      expect(rt('en', key), `en.${key}`).not.toMatch(/\p{Script=Cyrillic}/u);
      expect(rt('uk', key), `uk.${key}`).not.toMatch(/[ыэъё]/i);
      expect(rt('ru', key), `ru.${key}`).not.toMatch(/[іїєґ]/i);
    }
  });

  it('says no "market", "verified" or percentage anywhere', () => {
    for (const locale of LOCALES) {
      for (const key of ROOMMATE_TEXT_KEYS) {
        expect(rt(locale, key), `${locale}.${key}`).not.toMatch(
          /market|рыноч|ринков|verified|проверен|перевірен|%/i,
        );
      }
    }
  });
});

describe('roommate texts: rt and rtPeople', () => {
  it('fills placeholders and leaves unknown ones as written', () => {
    expect(rt('ru', 'btnPicked', { name: 'Mokotów' })).toBe('✓ Mokotów');
    expect(rt('en', 'cardExpired', { date: '2 January 2027' })).toBe(
      'Your profile expired on 2 January 2027 and is not counted now. You can renew it until {deleteDate}; after that it is deleted.',
    );
  });

  it('agrees the people word in ru and uk and gives an English word', () => {
    expect([1, 2, 5, 21].map((count) => rtPeople('ru', count))).toEqual([
      'человек',
      'человека',
      'человек',
      'человек',
    ]);
    expect([1, 2, 5, 21].map((count) => rtPeople('uk', count))).toEqual([
      'людина',
      'людини',
      'людей',
      'людина',
    ]);
    expect([1, 2, 5].map((count) => rtPeople('en', count))).toEqual(['person', 'people', 'people']);
  });
});

describe('roommate texts: PRD 3 §8 drafts verbatim', () => {
  const url = 'https://passflat.com/ru/privacy#roommate-matching';

  it('intro with the privacy link', () => {
    expect(rt('ru', 'intro', { privacyUrl: url })).toBe(
      'Найдём, с кем снять квартиру. Ответь на несколько коротких вопросов: районы, бюджет на человека, месяц заезда, языки. Анкету никто не видит, пока не откроется подбор. Анкета живёт 30 дней, удалить её можно в любой момент. Только для 18+. Как мы храним данные: ' +
        `<a href="${url}">политика конфиденциальности</a>.`,
    );
    expect(rt('uk', 'intro', { privacyUrl: url })).toBe(
      'Знайдемо, з ким зняти квартиру. Дай відповідь на кілька коротких запитань: райони, бюджет на людину, місяць заїзду, мови. Анкету ніхто не бачить, доки не відкриється підбір. Анкета живе 30 днів, видалити її можна будь-коли. Лише для 18+. Як ми зберігаємо дані: ' +
        `<a href="${url}">політика конфіденційності</a>.`,
    );
    expect(rt('en', 'intro', { privacyUrl: url })).toBe(
      "Let's find someone to rent with. Answer a few short questions: districts, budget per person, move-in month, languages. Nobody sees your profile until matching opens. It lasts 30 days and you can delete it any time. 18+ only. How we keep your data: " +
        `<a href="${url}">privacy policy</a>.`,
    );
  });

  it('short text, adult confirmation and delete', () => {
    expect(rt('ru', 'askAbout')).toBe(
      'Пара слов о себе, до 280 знаков. Без ссылок, телефонов и @ников: контакты появятся, только если интерес взаимный. Не пиши о здоровье, религии и других личных вещах.',
    );
    expect(rt('uk', 'askAbout')).toBe(
      'Кілька слів про себе, до 280 знаків. Без посилань, телефонів і @ніків: контакти зʼявляться, лише якщо інтерес взаємний. Не пиши про здоровʼя, релігію та інші особисті речі.',
    );
    expect(rt('en', 'askAbout')).toBe(
      "A few words about you, up to 280 characters. No links, phone numbers or @handles: contacts appear only when the interest is mutual. Don't include health, religion or other personal details.",
    );

    const adult = (locale: BotLocale) =>
      (['askAdult', 'btnAdultYes', 'btnAdultNo', 'underAge'] as const).map((key) =>
        rt(locale, key),
      );
    expect(adult('ru')).toEqual([
      'Подтверди, что тебе 18 или больше.',
      'Мне 18+',
      'Мне меньше 18',
      'Подбор соседей только для взрослых. Мы ничего не сохранили.',
    ]);
    expect(adult('uk')).toEqual([
      'Підтверди, що тобі 18 або більше.',
      'Мені 18+',
      'Мені менше 18',
      'Підбір сусідів лише для дорослих. Ми нічого не зберегли.',
    ]);
    expect(adult('en')).toEqual([
      'Please confirm you are 18 or older.',
      "I'm 18+",
      "I'm under 18",
      'Matching is for adults only. We saved nothing.',
    ]);

    expect(rt('ru', 'deleteConfirm')).toBe(
      'Удалить анкету? Это сразу и навсегда. Если вы уже обменялись контактами, сообщение у другого человека останется.',
    );
    expect(rt('uk', 'deleteConfirm')).toBe(
      'Видалити анкету? Це одразу й назавжди. Якщо ви вже обмінялися контактами, повідомлення в іншої людини залишиться.',
    );
    expect(rt('en', 'deleteConfirm')).toBe(
      "Delete your profile? It's immediate and final. If you already swapped contacts, the other person keeps that message.",
    );
  });

  it('gender and live with keep the PRD sentences, one step each', () => {
    expect(rt('ru', 'askGender')).toContain('Кто ты: женщина / мужчина / пропустить.');
    expect(rt('ru', 'askPrefers')).toContain(
      'С кем готов(а) жить: с кем угодно / с женщинами / с мужчинами.',
    );
    expect(rt('uk', 'askGender')).toContain('Хто ти: жінка / чоловік / пропустити.');
    expect(rt('uk', 'askPrefers')).toContain(
      'З ким готовий(-а) жити: з ким завгодно / з жінками / з чоловіками.',
    );
    expect(rt('en', 'askGender')).toContain('You are: a woman / a man / skip.');
    expect(rt('en', 'askPrefers')).toContain("Who you'd live with: anyone / women / men.");
    const why: Record<BotLocale, string> = {
      ru: 'Это нужно только для взаимного подбора и никому не показывается.',
      uk: 'Це потрібно лише для взаємного підбору й нікому не показується.',
      en: 'Used only for mutual matching and never shown to anyone.',
    };
    for (const locale of LOCALES) {
      expect(rt(locale, 'askGender').endsWith(why[locale])).toBe(true);
      expect(rt(locale, 'askPrefers').endsWith(why[locale])).toBe(true);
    }
  });

  it('renewal reminder with the hide date and the opt-in button', () => {
    expect(rt('ru', 'renewalReminder', { date: '2 января' })).toBe(
      'Анкета скроется 2 января. Продлить на 30 дней?',
    );
    expect(rt('uk', 'renewalReminder', { date: '2 січня' })).toBe(
      'Анкета сховається 2 січня. Продовжити на 30 днів?',
    );
    expect(rt('en', 'renewalReminder', { date: '2 January' })).toBe(
      'Your profile hides on 2 January. Renew for 30 days?',
    );
    expect(LOCALES.map((locale) => rt(locale, 'btnOptIn'))).toEqual([
      'Напиши мне, когда откроется подбор',
      'Напиши мені, коли відкриється підбір',
      'Message me when matching opens',
    ]);
  });

  it('composes the counts of example 1 exactly', () => {
    const reply = (locale: BotLocale) => {
      const items = [
        rt(locale, 'countsItemPeople', {
          name: 'Mokotów',
          count: '2',
          people: rtPeople(locale, 2),
        }),
        rt(locale, 'countsItem', { name: 'Wola', count: '1' }),
        rt(locale, 'countsAnyItem', { count: '1' }),
      ].join(', ');
      return [
        rt(locale, 'countsLead', { items }),
        rt(locale, 'countsTotal', { count: '5', people: rtPeople(locale, 5) }),
        rt(locale, 'countsOpensLater'),
      ].join(' ');
    };
    expect(reply('ru')).toBe(
      'Кроме тебя, анкеты есть у: Mokotów — 2 человека, Wola — 1, готовы к любому району — 1. Всего в Варшаве — 5 человек. Подбор откроется, когда людей станет больше.',
    );
    expect(reply('uk')).toBe(
      'Окрім тебе, анкети мають: Mokotów — 2 людини, Wola — 1, готові до будь-якого району — 1. Усього у Варшаві — 5 людей. Підбір відкриється, коли людей стане більше.',
    );
    expect(reply('en')).toBe(
      'Besides you, people with a profile: Mokotów 2, Wola 1, open to any district 1. In Warsaw 5 in total. Matching opens when there are more people.',
    );
  });
});

describe('roommate texts: numbers agree with the rules', () => {
  it('names the profile life of rules.ts wherever it says the days', () => {
    for (const locale of LOCALES) {
      for (const key of ['intro', 'introMatching', 'renewalReminder', 'btnRenew'] as const) {
        expect(rt(locale, key), `${locale}.${key}`).toContain(String(PROFILE_LIFE_DAYS));
      }
    }
  });

  it('takes the district limit as a value', () => {
    for (const locale of LOCALES) {
      for (const key of ['askDistricts', 'districtLimit'] as const) {
        expect(rt(locale, key)).toContain('{max}');
        expect(rt(locale, key, { max: String(MAX_DISTRICTS) })).toContain(String(MAX_DISTRICTS));
      }
    }
  });
});
