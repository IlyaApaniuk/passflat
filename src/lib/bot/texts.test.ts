import { describe, expect, it } from 'vitest';

import { dt } from './deposit-texts';
import { COMMAND_MENU, TEXT_KEYS, t, type BotLocale } from './texts';

const LOCALES: BotLocale[] = ['ru', 'uk'];

/**
 * Promises of a message the bot never sends (spec 04 §Promises and
 * capabilities), RU and UK. The real deposit follow-ups live in
 * `deposit-texts.ts`, so every key of `texts.ts` is checked.
 */
const REMOVED_PROMISES = [
  /напишу,?\s*когда/i,
  /напишу\s+сюда/i,
  /напишу,?\s*как только/i,
  /напишу,?\s*коли/i,
  /напишу\s+сюди/i,
  /напишу,?\s*щойно/i,
];

/** Words that would describe a notification or a roommate search as a feature. */
const NOT_A_CAPABILITY =
  /напишу|уведомл|сповіщ|подпис|підпис|слежу|следишь|стежу|стежиш|соседа по квартире|сусіда по квартирі|roommate/i;

/** The capability list is the first paragraph of `help`. */
function capabilities(locale: BotLocale): string {
  return t(locale, 'help').split('\n\n')[0];
}

describe('bot texts: no notification promises', () => {
  it('no RU or UK text in texts.ts promises to write later', () => {
    for (const locale of LOCALES) {
      for (const key of TEXT_KEYS) {
        for (const phrase of REMOVED_PROMISES) {
          expect(t(locale, key), `${locale}.${key}`).not.toMatch(phrase);
        }
      }
    }
  });

  it('building and district interest is saved, with no automatic notifications', () => {
    const ru = { name: 'Mokotów' };
    expect(t('ru', 'subscribedBuilding', ru)).toMatch(
      /^✅ Сохранил интерес к дому <b>Mokotów<\/b>/,
    );
    expect(t('ru', 'subscribedDistrict', ru)).toMatch(
      /^✅ Сохранил интерес к району <b>Mokotów<\/b>/,
    );
    expect(t('uk', 'subscribedBuilding', ru)).toMatch(
      /^✅ Зберіг інтерес до будинку <b>Mokotów<\/b>/,
    );
    expect(t('uk', 'subscribedDistrict', ru)).toMatch(
      /^✅ Зберіг інтерес до району <b>Mokotów<\/b>/,
    );
    for (const key of ['subscribedBuilding', 'subscribedDistrict', 'mySubsEmpty'] as const) {
      expect(t('ru', key)).toContain('Автоматических уведомлений');
      expect(t('ru', key)).toMatch(/пока нет/);
      expect(t('uk', key)).toContain('Автоматичних сповіщень');
      expect(t('uk', key)).toMatch(/поки немає/);
    }
  });

  it('the city waitlist records the wait, with no automatic launch message', () => {
    const vars = { city: 'Kraków', count: '3', people: 'человека' };
    expect(t('ru', 'cityWaitAdded', vars)).toMatch(/^✅ Записал, что ты ждёшь <b>Kraków<\/b>\./);
    expect(t('ru', 'cityWaitAlready', vars)).toMatch(/^Уже записал, что ты ждёшь <b>Kraków<\/b>\./);
    expect(t('uk', 'cityWaitAdded', vars)).toMatch(/^✅ Записав, що ти чекаєш на <b>Kraków<\/b>\./);
    expect(t('uk', 'cityWaitAlready', vars)).toMatch(
      /^Уже записав, що ти чекаєш на <b>Kraków<\/b>\./,
    );
    for (const key of ['cityWaitAdded', 'cityWaitAlready'] as const) {
      expect(t('ru', key, vars)).toContain('Автоматических сообщений о запуске пока нет.');
      expect(t('uk', key, vars)).toContain('Автоматичних повідомлень про запуск поки немає.');
      expect(t('ru', key, vars)).toContain('Этот город');
    }
    expect(t('ru', 'outsideCityNamed', { city: 'Kraków' })).toContain(
      'запишу, что ты ждёшь этот город',
    );
    expect(t('uk', 'outsideCityNamed', { city: 'Kraków' })).toContain(
      'запишу, що ти чекаєш на це місто',
    );
  });

  it('save buttons read as saving interest, not as following', () => {
    expect(t('ru', 'subscribeBuilding')).toBe('📌 Сохранить интерес к дому');
    expect(t('ru', 'subscribeDistrict', { district: 'Mokotów' })).toBe(
      '📌 Сохранить интерес к району Mokotów',
    );
    expect(t('uk', 'subscribeBuilding')).toBe('📌 Зберегти інтерес до будинку');
    expect(t('uk', 'subscribeDistrict', { district: 'Mokotów' })).toBe(
      '📌 Зберегти інтерес до району Mokotów',
    );
    for (const locale of LOCALES) {
      for (const key of ['subscribeBuilding', 'subscribeDistrict', 'btnCityWait'] as const) {
        expect(t(locale, key)).not.toMatch(/🔔|Следить|Стежити/);
      }
    }
  });

  it('leaves the real deposit follow-ups promising what they do', () => {
    expect(dt('ru', 'remindSetAck')).toContain('Напомню {deadline}');
    expect(dt('uk', 'remindSetAck')).toContain('Нагадаю {deadline}');
  });
});

describe('bot texts: one set of real capabilities', () => {
  it('start, startAfterPayload and help list the same capabilities', () => {
    for (const locale of LOCALES) {
      const list = capabilities(locale);
      expect(t(locale, 'start')).toContain(list);
      expect(t(locale, 'startAfterPayload')).toContain(list);
      expect(t(locale, 'help').startsWith(list)).toBe(true);
    }
  });

  it('the list names the address or district check and every command of the menu', () => {
    for (const locale of LOCALES) {
      const list = capabilities(locale);
      const bullets = list.split('\n').filter((line) => line.startsWith('• '));
      expect(bullets).toHaveLength(7);
      expect(bullets[0]).toMatch(locale === 'ru' ? /^• Пришли адрес/ : /^• Надішли адресу/);
      expect(bullets[1]).toMatch(/^• Напиши район/);
      expect(bullets.slice(2).map((line) => line.split(' ')[1])).toEqual([
        '/districts',
        '/deposit',
        '/my',
        '/lang',
        '/cancel',
      ]);
      const menu = COMMAND_MENU[locale].map((item) => `/${item.command}`);
      for (const command of menu.filter((command) => command !== '/help')) {
        expect(list).toContain(`• ${command} — `);
      }
    }
  });

  it('describes no notifications and no roommate search', () => {
    for (const locale of LOCALES) {
      for (const key of ['start', 'startAfterPayload', 'help'] as const) {
        expect(t(locale, key), `${locale}.${key}`).not.toMatch(NOT_A_CAPABILITY);
      }
      for (const item of COMMAND_MENU[locale]) {
        expect(item.description).not.toMatch(NOT_A_CAPABILITY);
      }
    }
  });
});

describe('COMMAND_MENU', () => {
  it('has the same commands in RU and UK, with /cancel and /my as saved interests', () => {
    const commands = (locale: BotLocale) => COMMAND_MENU[locale].map((item) => item.command);
    expect(commands('ru')).toEqual(['districts', 'deposit', 'my', 'lang', 'cancel', 'help']);
    expect(commands('uk')).toEqual(commands('ru'));

    const my = (locale: BotLocale) => COMMAND_MENU[locale].find((item) => item.command === 'my');
    expect(my('ru')?.description).toBe('Сохранённые интересы');
    expect(my('uk')?.description).toBe('Збережені інтереси');
  });

  it('fits the Telegram limits and is translated for UK', () => {
    for (const locale of LOCALES) {
      for (const item of COMMAND_MENU[locale]) {
        expect(item.command).toMatch(/^[a-z0-9_]{1,32}$/);
        expect(item.description.length).toBeGreaterThanOrEqual(1);
        expect(item.description.length).toBeLessThanOrEqual(256);
      }
    }
    const uk = COMMAND_MENU.uk.filter((item) => item.command !== 'lang');
    for (const item of uk) {
      expect(item.description).not.toMatch(/[ыэъё]/i);
    }
  });
});
