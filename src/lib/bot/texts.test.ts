import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dt } from './deposit-texts';
import { ROOMMATE_TEXT_KEYS, rt, type RoommateLocale } from './roommate-texts';
import {
  capabilityText,
  COMMAND_MENU,
  TEXT_KEYS,
  t,
  type BotLocale,
  type CapabilityTextKey,
} from './texts';

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

/**
 * Any first-person promise to write later, RU, UK and EN. The roommate texts
 * get it on top of REMOVED_PROMISES: there every "we will write" fails except
 * the keys of ROOMMATE_PROMISE_EXCEPTIONS (spec 06 §Opt-in). `напиши` /
 * "message me" is the person's request, not a promise, and passes.
 */
const LATER_MESSAGE_PROMISES = [
  /напиш(?:у|ем)(?!\p{L})/iu,
  /сообщ(?:у|им)(?!\p{L})/iu,
  /уведом(?:лю|им)(?!\p{L})/iu,
  /напиш(?:у|емо)(?!\p{L})/iu,
  /повідом(?:лю|имо)(?!\p{L})/iu,
  /сповіщ(?:у|имо)(?!\p{L})/iu,
  /\b(?:I|we)(?:'ll|’ll|\s+will)\s+(?:write|message|text|notify|tell|send|remind|let you know)\b/i,
];

/**
 * Roommate keys that may promise a message, each with the code that sends it.
 * Every other promise fails.
 */
const ROOMMATE_PROMISE_EXCEPTIONS: Record<string, string> = {
  // Sent only with the switch on and the push on (`matchingOpenText`); the
  // switch stays off until T090 builds the push.
  openNobodyDaily: 'the daily push of spec 07 FR-27: sendDailyPushes, roommate-daily.ts (T090)',
  // The opt-in reply's first sentence (spec 06 §Opt-in, FR-18): the send-hour
  // run writes once to every active opted-in profile when the switch is on.
  optInConfirm: 'the one-time message of FR-19: sendMatchingOpenMessages, roommate-daily.ts (T082)',
  // D64: the opt-in's closing sentence. The owner's manual route writes
  // `closingMessage` to every profile and deletes it (spec 06 §Closing route).
  optInClosing:
    'the closing route of FR-20: POST /api/cron/roommate-close, runRoommateClose, roommate-close.ts (T083)',
};

/**
 * The opt-in's two sentences (spec 06 §Opt-in) and the source that must hold
 * their backing code, so a renamed or removed sender fails here.
 */
const OPT_IN_PROMISE_BACKING: Record<string, { file: string; holds: string[] }> = {
  optInConfirm: {
    file: 'src/lib/bot/roommate-daily.ts',
    holds: ['const sendMatchingOpenMessages: MessageJob', 'switchOnOnly(sendMatchingOpenMessages)'],
  },
  optInClosing: {
    file: 'src/app/api/cron/roommate-close/route.ts',
    holds: ['export async function POST', 'await runRoommateClose('],
  },
};

const ROOMMATE_LOCALES: RoommateLocale[] = ['ru', 'uk', 'en'];

/** Words that would describe a notification as a feature. */
const NOT_A_CAPABILITY = /напишу|уведомл|сповіщ|подпис|підпис|слежу|следишь|стежу|стежиш/i;

/** Both states of the matching switch (spec 07 §Switch). */
const SWITCH_STATES = [false, true] as const;

const CAPABILITY_KEYS: CapabilityTextKey[] = ['start', 'startAfterPayload', 'help'];

/** The capability list is the first paragraph of `help`. */
function capabilities(locale: BotLocale, matchingEnabled: boolean): string {
  return capabilityText(locale, 'help', matchingEnabled).split('\n\n')[0];
}

function bullets(list: string): string[] {
  return list.split('\n').filter((line) => line.startsWith('• '));
}

/** The command a bullet names, or null for the address and district checks. */
function bulletCommand(line: string): string | null {
  return /^• (\/[a-z0-9_]+) — /.exec(line)?.[1] ?? null;
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

  it('no roommate text promises to write later, outside the named exceptions', () => {
    const found: string[] = [];
    for (const locale of ROOMMATE_LOCALES) {
      for (const key of ROOMMATE_TEXT_KEYS) {
        if (key in ROOMMATE_PROMISE_EXCEPTIONS) continue;
        for (const phrase of [...REMOVED_PROMISES, ...LATER_MESSAGE_PROMISES]) {
          if (phrase.test(rt(locale, key))) found.push(`${locale}.${key} ~ ${phrase.source}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('every promise exception is a roommate key whose text the check would catch', () => {
    for (const key of Object.keys(ROOMMATE_PROMISE_EXCEPTIONS)) {
      expect(ROOMMATE_TEXT_KEYS as string[], key).toContain(key);
      for (const locale of ROOMMATE_LOCALES) {
        const text = rt(locale, key as (typeof ROOMMATE_TEXT_KEYS)[number]);
        expect(
          LATER_MESSAGE_PROMISES.some((phrase) => phrase.test(text)),
          `${locale}.${key}`,
        ).toBe(true);
      }
    }
  });

  it('allows exactly the three named promises, the opt-in two each with its backing code', () => {
    expect(Object.keys(ROOMMATE_PROMISE_EXCEPTIONS).sort()).toEqual([
      'openNobodyDaily',
      'optInClosing',
      'optInConfirm',
    ]);
    expect(ROOMMATE_PROMISE_EXCEPTIONS.optInConfirm).toMatch(/\bsendMatchingOpenMessages\b/);
    expect(ROOMMATE_PROMISE_EXCEPTIONS.optInClosing).toMatch(/\/api\/cron\/roommate-close\b/);
    for (const [key, { file, holds }] of Object.entries(OPT_IN_PROMISE_BACKING)) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      for (const code of holds) expect(source, `${key}: ${file}`).toContain(code);
    }
  });

  it('the opt-in reply promises only in its two keys; the "already on" lead-in promises nothing', () => {
    for (const locale of ROOMMATE_LOCALES) {
      const promising = (text: string) =>
        [...REMOVED_PROMISES, ...LATER_MESSAGE_PROMISES].some((phrase) => phrase.test(text));
      expect(promising(rt(locale, 'optInAlready')), `${locale}.optInAlready`).toBe(false);
      for (const key of Object.keys(OPT_IN_PROMISE_BACKING)) {
        expect(promising(rt(locale, key as (typeof ROOMMATE_TEXT_KEYS)[number])), key).toBe(true);
      }
    }
  });

  it('the later-message check catches promises and passes requests', () => {
    const promises = [
      'Напишу один раз, когда подбор откроется.',
      'Если подбор не откроется, напишем об этом.',
      'Сообщим, когда появятся люди.',
      'Напишу один раз, коли підбір відкриється.',
      'Повідомимо, коли зʼявляться люди.',
      "I'll message you once when matching opens.",
      "If matching does not open, we'll tell you and delete your profile.",
      'We will notify you.',
    ];
    for (const text of promises) {
      expect(
        LATER_MESSAGE_PROMISES.some((phrase) => phrase.test(text)),
        text,
      ).toBe(true);
    }
    const requests = [
      'Напиши мне, когда откроется подбор',
      'Напиши мені, коли відкриється підбір',
      'Message me when matching opens',
      'Сообщение, когда откроется подбор: включено',
      'Повідомлення, коли відкриється підбір: увімкнено',
    ];
    for (const text of requests) {
      expect(
        LATER_MESSAGE_PROMISES.some((phrase) => phrase.test(text)),
        text,
      ).toBe(false);
    }
  });

  it('leaves the real deposit follow-ups promising what they do', () => {
    expect(dt('ru', 'remindSetAck')).toContain('Напомню {deadline}');
    expect(dt('uk', 'remindSetAck')).toContain('Нагадаю {deadline}');
  });
});

describe('bot texts: one set of real capabilities', () => {
  it.each(SWITCH_STATES)(
    'start, startAfterPayload and help list the same capabilities (switch on: %s)',
    (enabled) => {
      for (const locale of LOCALES) {
        const list = capabilities(locale, enabled);
        expect(capabilityText(locale, 'start', enabled)).toContain(list);
        expect(capabilityText(locale, 'startAfterPayload', enabled)).toContain(list);
        expect(capabilityText(locale, 'help', enabled).startsWith(list)).toBe(true);
        for (const key of CAPABILITY_KEYS) {
          expect(capabilityText(locale, key, enabled), `${locale}.${key}`).not.toMatch(/\{\w+\}/);
        }
      }
    },
  );

  it.each(SWITCH_STATES)(
    'every listed capability has a command in the menu, and every menu command is listed (switch on: %s)',
    (enabled) => {
      for (const locale of LOCALES) {
        const lines = bullets(capabilities(locale, enabled));
        const menu = COMMAND_MENU[locale].map((item) => `/${item.command}`);

        // The two checks without a command: a typed address and a typed district.
        const checks = lines.filter((line) => bulletCommand(line) === null);
        expect(checks).toHaveLength(2);
        expect(checks[0]).toMatch(locale === 'ru' ? /^• Пришли адрес/ : /^• Надішли адресу/);
        expect(checks[1]).toMatch(/^• Напиши район/);

        // Every other line names a menu command, in the menu's order; /help is the list itself.
        const listed = lines.map(bulletCommand).filter((command) => command !== null);
        expect(listed).toEqual(menu.filter((command) => command !== '/help'));
        for (const command of listed) expect(menu, `${locale} ${command}`).toContain(command);
      }
    },
  );

  it('the roommate line names /mate and is worded by the switch', () => {
    for (const locale of LOCALES) {
      const mateLine = (enabled: boolean) =>
        bullets(capabilities(locale, enabled)).filter((line) => line.includes('/mate'));

      expect(mateLine(false)).toEqual([`• /mate — ${t(locale, 'capabilityMateOff')}`]);
      expect(mateLine(true)).toEqual([`• /mate — ${t(locale, 'capabilityMateOn')}`]);
      expect(t(locale, 'capabilityMateOn')).not.toBe(t(locale, 'capabilityMateOff'));

      // Off (stage 1): a profile, the counts per district, matching later.
      const off = t(locale, 'capabilityMateOff');
      expect(off).toMatch(/анкет/);
      expect(off).toMatch(
        locale === 'ru'
          ? /сколько людей ищут в каждом районе/
          : /скільки людей шукають у кожному районі/,
      );
      expect(off).toMatch(
        locale === 'ru' ? /подбор откроется позже$/ : /підбір відкриється пізніше$/,
      );

      // On (stage 2): matching, contacts only on mutual interest; nothing says "later".
      const on = t(locale, 'capabilityMateOn');
      expect(on).toMatch(locale === 'ru' ? /взаимном интересе/ : /взаємного інтересу/);
      expect(on).not.toMatch(/позже|пізніше|откроется|відкриється/);
    }
  });

  it('no capability text promises a date', () => {
    const MONTHS =
      /январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр|січ|лют|берез|квіт|травн|червн|липн|серп|верес|жовт|листопад|груд/i;
    for (const locale of LOCALES) {
      for (const key of ['capabilityMateOff', 'capabilityMateOn'] as const) {
        expect(t(locale, key), `${locale}.${key}`).not.toMatch(/\d/);
        expect(t(locale, key), `${locale}.${key}`).not.toMatch(MONTHS);
        expect(t(locale, key), `${locale}.${key}`).not.toMatch(/скоро|незабаром|soon/i);
      }
    }
  });

  it('describes no notifications in either switch state or in the menu', () => {
    for (const locale of LOCALES) {
      for (const enabled of SWITCH_STATES) {
        for (const key of CAPABILITY_KEYS) {
          expect(capabilityText(locale, key, enabled), `${locale}.${key}`).not.toMatch(
            NOT_A_CAPABILITY,
          );
        }
      }
      for (const item of COMMAND_MENU[locale]) {
        expect(item.description).not.toMatch(NOT_A_CAPABILITY);
      }
    }
  });
});

describe('COMMAND_MENU', () => {
  it('has the same commands in RU and UK, with /mate, /cancel and /my as saved interests', () => {
    const commands = (locale: BotLocale) => COMMAND_MENU[locale].map((item) => item.command);
    expect(commands('ru')).toEqual([
      'mate',
      'districts',
      'deposit',
      'my',
      'lang',
      'cancel',
      'help',
    ]);
    expect(commands('uk')).toEqual(commands('ru'));

    const item = (locale: BotLocale, command: string) =>
      COMMAND_MENU[locale].find((entry) => entry.command === command)?.description;
    expect(item('ru', 'my')).toBe('Сохранённые интересы');
    expect(item('uk', 'my')).toBe('Збережені інтереси');
    expect(item('ru', 'mate')).toBe('Найти, с кем снять квартиру');
    expect(item('uk', 'mate')).toBe('Знайти, з ким зняти квартиру');
  });

  it('describes /cancel for the deposit and the roommate questions alike', () => {
    for (const locale of LOCALES) {
      const cancel = COMMAND_MENU[locale].find((entry) => entry.command === 'cancel');
      expect(cancel?.description).not.toMatch(/залог|застав/i);
      const line = bullets(capabilities(locale, false)).find((entry) =>
        entry.startsWith('• /cancel — '),
      );
      expect(line).toMatch(
        locale === 'ru' ? /о залоге или для анкеты$/ : /про заставу або для анкети$/,
      );
    }
    expect(COMMAND_MENU.ru.find((entry) => entry.command === 'cancel')?.description).toBe(
      'Выйти из вопросов',
    );
    expect(COMMAND_MENU.uk.find((entry) => entry.command === 'cancel')?.description).toBe(
      'Вийти з питань',
    );
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
