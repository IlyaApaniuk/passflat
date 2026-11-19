import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEPOSIT_TEXT_KEYS, dt } from './deposit-texts';
import { ROOMMATE_TEXT_KEYS, rt, rtPeople } from './roommate-texts';
import {
  answeredWord,
  capabilityText,
  COMMAND_MENU,
  COMMAND_MENUS,
  listingsWord,
  normalizeLocale,
  observationsWord,
  peopleWord,
  reportsWord,
  TEXT_KEYS,
  t,
  type BotLocale,
  type CapabilityTextKey,
} from './texts';

/** Every locale of `texts.ts`, each one a chat can be answered in. */
const LOCALES: BotLocale[] = ['ru', 'uk', 'en'];

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
  // send-hour run's daily push writes when someone new fits.
  openNobodyDaily: 'the daily push of spec 07 FR-27: sendDailyPushes, roommate-daily.ts (T090)',
  // The opt-in reply's first sentence (spec 06 §Opt-in, FR-18): the send-hour
  // run writes once to every active opted-in profile when the switch is on.
  optInConfirm: 'the one-time message of FR-19: sendMatchingOpenMessages, roommate-daily.ts (T082)',
  // D64: the opt-in's closing sentence. The owner's manual route writes
  // `closingMessage` to every profile and deletes it (spec 06 §Closing route).
  optInClosing:
    'the closing route of FR-20: POST /api/cron/roommate-close, runRoommateClose, roommate-close.ts (T083)',
  // The report receipt (spec 07 §Report, FR-31): "I'll tell you when that
  // happens" is the notice to every reporter of a hidden profile (§Automatic
  // hiding, FR-32 criterion 4, DSA Art. 16(6)), sent by the request that hid it
  // and retried by the send-hour run.
  reportReceipt:
    'the hide notice to every reporter of spec 07 §Automatic hiding: sendHideMessages and retryHideNotices, roommate-hide-messages.ts (T095)',
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

/** The daily push sentence of the one-time message and the code that backs it (T090). */
const DAILY_PUSH_PROMISE_BACKING: Record<string, { file: string; holds: string[] }> = {
  openNobodyDaily: {
    file: 'src/lib/bot/roommate-daily.ts',
    holds: [
      'const sendDailyPushes: MessageJob',
      'switchOnOnly(sendDailyPushes)',
      'matchingOpenText(locale, count, !profile.pushOff)',
    ],
  },
};

/** The report receipt's promise and the code that backs it (T095): the hide's sends and the retry. */
const REPORT_RECEIPT_PROMISE_BACKING: Record<string, { file: string; holds: string[] }> = {
  reportReceipt: {
    file: 'src/lib/bot/roommate-hide-messages.ts',
    holds: [
      'export async function sendHideMessages(',
      'await sendHideNotices(sender, now, { targetProfileId });',
      "text: rt(roommateLocale(chat.locale), 'hideNotice'),",
      'export const retryHideNotices: MessageJob',
    ],
  },
  reportReceiptSender: {
    file: 'src/lib/bot/roommate-safety.ts',
    holds: ['await sendHideMessages('],
  },
  reportReceiptRetry: {
    file: 'src/lib/bot/roommate-daily.ts',
    holds: ['  retryHideNotices,\n'],
  },
};

const ROOMMATE_LOCALES: BotLocale[] = ['ru', 'uk', 'en'];

/** Words that would describe a notification as a feature. */
const NOT_A_CAPABILITY =
  /напишу|уведомл|сповіщ|подпис|підпис|слежу|следишь|стежу|стежиш|notif|subscri|alert|follow/i;

/** Both states of the matching switch (spec 07 §Switch). */
const SWITCH_STATES = [false, true] as const;

const CAPABILITY_KEYS: CapabilityTextKey[] = ['start', 'startAfterPayload', 'help'];

/** The capability list is the first paragraph of `help`. */
function capabilities(locale: BotLocale, matchingEnabled: boolean): string {
  return capabilityText(locale, 'help', matchingEnabled).split('\n\n')[0];
}

/** Per-locale wording the capability checks look for. */
const CAPABILITY_WORDING: Record<
  BotLocale,
  {
    address: RegExp;
    district: RegExp;
    profile: RegExp;
    counts: RegExp;
    opensLater: RegExp;
    mutual: RegExp;
    cancel: RegExp;
  }
> = {
  ru: {
    address: /^• Пришли адрес/,
    district: /^• Напиши район/,
    profile: /анкет/,
    counts: /сколько людей ищут в каждом районе/,
    opensLater: /подбор откроется позже$/,
    mutual: /взаимном интересе/,
    cancel: /о залоге или для анкеты$/,
  },
  uk: {
    address: /^• Надішли адресу/,
    district: /^• Напиши район/,
    profile: /анкет/,
    counts: /скільки людей шукають у кожному районі/,
    opensLater: /підбір відкриється пізніше$/,
    mutual: /взаємного інтересу/,
    cancel: /про заставу або для анкети$/,
  },
  en: {
    address: /^• Send an address/,
    district: /^• Type a district/,
    profile: /profile/,
    counts: /how many people are looking in each district/,
    opensLater: /matching opens later$/,
    mutual: /only when the interest is mutual$/,
    cancel: /about your deposit or for your profile$/,
  },
};

function bullets(list: string): string[] {
  return list.split('\n').filter((line) => line.startsWith('• '));
}

/** The command a bullet names, or null for the address and district checks. */
function bulletCommand(line: string): string | null {
  return /^• (\/[a-z0-9_]+) — /.exec(line)?.[1] ?? null;
}

describe('bot texts: no notification promises', () => {
  it('no RU, UK or EN text in texts.ts promises to write later', () => {
    const found: string[] = [];
    for (const locale of LOCALES) {
      for (const key of TEXT_KEYS) {
        for (const phrase of [...REMOVED_PROMISES, ...LATER_MESSAGE_PROMISES]) {
          if (phrase.test(t(locale, key))) found.push(`${locale}.${key} ~ ${phrase.source}`);
        }
      }
    }
    expect(found).toEqual([]);
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
    expect(t('en', 'subscribedBuilding', ru)).toMatch(
      /^✅ Saved your interest in <b>Mokotów<\/b>\./,
    );
    expect(t('en', 'subscribedDistrict', ru)).toMatch(
      /^✅ Saved your interest in the <b>Mokotów<\/b> district\./,
    );
    for (const key of ['subscribedBuilding', 'subscribedDistrict', 'mySubsEmpty'] as const) {
      expect(t('ru', key)).toContain('Автоматических уведомлений');
      expect(t('ru', key)).toMatch(/пока нет/);
      expect(t('uk', key)).toContain('Автоматичних сповіщень');
      expect(t('uk', key)).toMatch(/поки немає/);
      expect(t('en', key)).toMatch(/There are no automatic notifications( about new data)? yet\./);
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
    expect(t('en', 'cityWaitAdded', { ...vars, people: 'people' })).toMatch(
      /^✅ Noted that you’re waiting for <b>Kraków<\/b>\.[\s\S]*so far: 3 people\.$/,
    );
    expect(t('en', 'cityWaitAlready', vars)).toMatch(
      /^Already noted that you’re waiting for <b>Kraków<\/b>\./,
    );
    for (const key of ['cityWaitAdded', 'cityWaitAlready'] as const) {
      expect(t('ru', key, vars)).toContain('Автоматических сообщений о запуске пока нет.');
      expect(t('uk', key, vars)).toContain('Автоматичних повідомлень про запуск поки немає.');
      expect(t('en', key, vars)).toContain('There are no automatic launch messages yet.');
      expect(t('ru', key, vars)).toContain('Этот город');
    }
    expect(t('ru', 'outsideCityNamed', { city: 'Kraków' })).toContain(
      'запишу, что ты ждёшь этот город',
    );
    expect(t('uk', 'outsideCityNamed', { city: 'Kraków' })).toContain(
      'запишу, що ти чекаєш на це місто',
    );
    expect(t('en', 'outsideCityNamed', { city: 'Kraków' })).toContain(
      'I’ll note that you’re waiting for this city',
    );
  });

  it('save buttons read as saving interest, not as following', () => {
    expect(t('en', 'subscribeBuilding')).toBe('📌 Save interest in this building');
    expect(t('en', 'subscribeDistrict', { district: 'Mokotów' })).toBe(
      '📌 Save interest in Mokotów',
    );
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
        expect(t(locale, key)).not.toMatch(/🔔|Следить|Стежити|follow|subscri/i);
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

  it('allows exactly the four named promises, each with its backing code', () => {
    expect(Object.keys(ROOMMATE_PROMISE_EXCEPTIONS).sort()).toEqual([
      'openNobodyDaily',
      'optInClosing',
      'optInConfirm',
      'reportReceipt',
    ]);
    expect(ROOMMATE_PROMISE_EXCEPTIONS.reportReceipt).toMatch(/§Automatic hiding/);
    expect(ROOMMATE_PROMISE_EXCEPTIONS.reportReceipt).toMatch(/\bretryHideNotices\b/);
    expect(ROOMMATE_PROMISE_EXCEPTIONS.optInConfirm).toMatch(/\bsendMatchingOpenMessages\b/);
    expect(ROOMMATE_PROMISE_EXCEPTIONS.optInClosing).toMatch(/\/api\/cron\/roommate-close\b/);
    expect(ROOMMATE_PROMISE_EXCEPTIONS.openNobodyDaily).toMatch(/\bsendDailyPushes\b/);
    for (const [key, { file, holds }] of Object.entries({
      ...OPT_IN_PROMISE_BACKING,
      ...DAILY_PUSH_PROMISE_BACKING,
      ...REPORT_RECEIPT_PROMISE_BACKING,
    })) {
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
        expect(checks[0]).toMatch(CAPABILITY_WORDING[locale].address);
        expect(checks[1]).toMatch(CAPABILITY_WORDING[locale].district);

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
      const wording = CAPABILITY_WORDING[locale];
      const off = t(locale, 'capabilityMateOff');
      expect(off).toMatch(wording.profile);
      expect(off).toMatch(wording.counts);
      expect(off).toMatch(wording.opensLater);

      // On (stage 2): matching, contacts only on mutual interest; nothing says "later".
      const on = t(locale, 'capabilityMateOn');
      expect(on).toMatch(wording.mutual);
      expect(on).not.toMatch(/позже|пізніше|откроется|відкриється|later|opens/i);
    }
  });

  it('no capability text promises a date', () => {
    const MONTHS =
      /январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр|січ|лют|берез|квіт|травн|червн|липн|серп|верес|жовт|листопад|груд|january|february|march|april|\bmay\b|june|july|august|september|october|november|december/i;
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
  it('has the same commands in RU, UK and EN, with /mate, /cancel and /my as saved interests', () => {
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
    expect(commands('en')).toEqual(commands('ru'));

    const item = (locale: BotLocale, command: string) =>
      COMMAND_MENU[locale].find((entry) => entry.command === command)?.description;
    expect(item('ru', 'my')).toBe('Сохранённые интересы');
    expect(item('uk', 'my')).toBe('Збережені інтереси');
    expect(item('en', 'my')).toBe('Saved interests');
    expect(item('ru', 'mate')).toBe('Найти, с кем снять квартиру');
    expect(item('uk', 'mate')).toBe('Знайти, з ким зняти квартиру');
    expect(item('en', 'mate')).toBe('Find someone to rent a flat with');
  });

  it('describes /cancel for the deposit and the roommate questions alike', () => {
    for (const locale of LOCALES) {
      const cancel = COMMAND_MENU[locale].find((entry) => entry.command === 'cancel');
      expect(cancel?.description).not.toMatch(/залог|застав|deposit/i);
      const line = bullets(capabilities(locale, false)).find((entry) =>
        entry.startsWith('• /cancel — '),
      );
      expect(line).toMatch(CAPABILITY_WORDING[locale].cancel);
    }
    expect(COMMAND_MENU.ru.find((entry) => entry.command === 'cancel')?.description).toBe(
      'Выйти из вопросов',
    );
    expect(COMMAND_MENU.uk.find((entry) => entry.command === 'cancel')?.description).toBe(
      'Вийти з питань',
    );
    expect(COMMAND_MENU.en.find((entry) => entry.command === 'cancel')?.description).toBe(
      'Leave the questions',
    );
  });

  it('fits the Telegram limits and is translated for UK and EN', () => {
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
    for (const item of COMMAND_MENU.en) {
      expect(withoutLanguageNames(item.description), item.command).not.toMatch(CYRILLIC);
    }
  });
});

/** Cyrillic letters: an English text has none outside the language names. */
const CYRILLIC = /\p{Script=Cyrillic}/u;

/**
 * Russian and Ukrainian named in their own words (the /lang line, the language
 * prompt and the menu's /lang entry) are the only Cyrillic an English text may hold.
 */
function withoutLanguageNames(text: string): string {
  return text.replace(/русский|українська|Выбери язык|Обери мову|Язык|Мова/g, '');
}

function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
}

describe('bot texts: English (spec 04 §English bot locale)', () => {
  it('has a non-empty ru, uk and en value for every key', () => {
    expect(TEXT_KEYS.length).toBeGreaterThan(0);
    const missing: string[] = [];
    for (const key of TEXT_KEYS) {
      for (const locale of LOCALES) {
        const value: unknown = t(locale, key);
        if (typeof value !== 'string' || value.trim() === '') missing.push(`${locale}.${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('uses the same placeholders in every locale', () => {
    for (const key of TEXT_KEYS) {
      const ru = placeholders(t('ru', key));
      for (const locale of LOCALES) {
        expect(placeholders(t(locale, key)), `${locale}.${key}`).toEqual(ru);
      }
    }
  });

  it('writes English in Latin script, apart from the language names', () => {
    for (const key of TEXT_KEYS) {
      expect(withoutLanguageNames(t('en', key)), `en.${key}`).not.toMatch(CYRILLIC);
    }
    for (const enabled of SWITCH_STATES) {
      for (const key of CAPABILITY_KEYS) {
        expect(withoutLanguageNames(capabilityText('en', key, enabled)), key).not.toMatch(CYRILLIC);
      }
    }
  });

  it('says no "market", "verified", "checked", "actually" or percentage in English', () => {
    for (const key of TEXT_KEYS) {
      expect(t('en', key), `en.${key}`).not.toMatch(
        /market|verified|checked|actually|really|in full|%/i,
      );
    }
  });

  it('gives every counted word one / other forms in English', () => {
    const words = { reportsWord, listingsWord, observationsWord, answeredWord, peopleWord };
    const forms = Object.fromEntries(
      Object.entries(words).map(([name, word]) => [
        name,
        [1, 2, 5, 11, 21].map((n) => word('en', n)),
      ]),
    );
    expect(forms).toEqual({
      reportsWord: ['report', 'reports', 'reports', 'reports', 'reports'],
      listingsWord: ['listing', 'listings', 'listings', 'listings', 'listings'],
      observationsWord: [
        'observation',
        'observations',
        'observations',
        'observations',
        'observations',
      ],
      answeredWord: Array(5).fill('who answered'),
      peopleWord: ['person', 'people', 'people', 'people', 'people'],
    });
    expect([1, 2, 21].map((count) => rtPeople('en', count))).toEqual([
      'person',
      'people',
      'people',
    ]);
  });

  it('keeps the RU and UK forms as they were', () => {
    expect([1, 2, 5, 21].map((count) => peopleWord('ru', count))).toEqual([
      'человек',
      'человека',
      'человек',
      'человек',
    ]);
    expect([1, 3, 5].map((count) => observationsWord('uk', count))).toEqual([
      'спостереження',
      'спостереження',
      'спостережень',
    ]);
    expect(answeredWord('ru', 21)).toBe('ответившего');
    expect(listingsWord('uk', 11)).toBe('оголошеннями');
  });

  it('reads the English headline N as "median of N reports" and "from 1 listing"', () => {
    expect(t('en', 'medianN', { count: '2', word: reportsWord('en', 2) })).toBe(
      ' <i>(median of 2 reports)</i>',
    );
    expect(t('en', 'singleN', { count: '1', word: listingsWord('en', 1) })).toBe(
      ' <i>(from 1 listing)</i>',
    );
    expect(
      t('en', 'depositLine', {
        gotBack: '2',
        answered: '3',
        word: answeredWord('en', 3),
        area: 'Ochota',
      }),
    ).toBe('Got the deposit back, fully or partly: 2 of 3 who answered (Ochota)');
  });
});

describe('the en bot locale (spec 04 §English bot locale)', () => {
  it.each<[string | undefined, BotLocale]>([
    ['uk-UA', 'uk'],
    ['en-GB', 'en'],
    ['pl', 'en'],
    ['ru', 'ru'],
    ['de', 'ru'],
    [undefined, 'ru'],
  ])('detects %s as %s', (languageCode, locale) => {
    expect(normalizeLocale(languageCode)).toBe(locale);
  });

  it('detects the bare codes and any letter case the same way', () => {
    expect(['uk', 'UK', 'en', 'en-US', 'PL', 'pl-PL', 'ru-RU', ''].map(normalizeLocale)).toEqual([
      'uk',
      'uk',
      'en',
      'en',
      'en',
      'en',
      'ru',
      'ru',
    ]);
  });

  it('publishes the RU menu by default, UK for uk and EN for en and pl', () => {
    expect(COMMAND_MENUS).toEqual([
      { commands: COMMAND_MENU.ru },
      { languageCode: 'uk', commands: COMMAND_MENU.uk },
      { languageCode: 'en', commands: COMMAND_MENU.en },
      { languageCode: 'pl', commands: COMMAND_MENU.en },
    ]);
  });

  it('the menu of each client language is the locale the bot detects for it', () => {
    for (const { languageCode, commands } of COMMAND_MENUS) {
      expect(commands).toBe(COMMAND_MENU[normalizeLocale(languageCode)]);
    }
  });

  it('the webhook script publishes every menu of the table and no other', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/tg-webhook.ts'), 'utf8');
    expect(source).toContain("import { COMMAND_MENUS } from '../src/lib/bot/texts';");
    expect(source).toContain('for (const { languageCode, commands } of COMMAND_MENUS) {');
    expect(source.match(/setMyCommands\(/g)).toHaveLength(1);
    expect(source).toContain('languageCode ? { language_code: languageCode } : undefined');
  });

  it('the /lang line and prompt name all three languages', () => {
    for (const locale of LOCALES) {
      const line = bullets(capabilities(locale, false)).find((entry) =>
        entry.startsWith('• /lang'),
      );
      expect(line, locale).toMatch(/English/);
      expect(line, locale).toMatch(/русский/);
      expect(line, locale).toMatch(/українська/);
      expect(t(locale, 'langPrompt'), locale).toMatch(/Choose a language/);
      expect(t(locale, 'langPrompt'), locale).toMatch(/Выбери язык/);
      expect(t(locale, 'langPrompt'), locale).toMatch(/Обери мову/);
    }
    expect(t('en', 'langSet')).toBe('Done. Send an address.');
  });

  it('keeps the RU and UK /cancel replies and the deposit button as they were', () => {
    expect(t('ru', 'cancelled')).toBe('Ок, отменил. Если понадобится — напиши «залог».');
    expect(t('ru', 'remindersOff')).toBe('Напоминания отключены.');
    expect(t('ru', 'nothingToCancel')).toBe('Сейчас нечего отменять 🙂');
    expect(t('ru', 'btnStartFlow')).toBe('😤 Мне не возвращают залог');
    expect(t('uk', 'cancelled')).toBe('Ок, скасував. Якщо знадобиться — напиши «застава».');
    expect(t('uk', 'remindersOff')).toBe('Нагадування вимкнено.');
    expect(t('uk', 'nothingToCancel')).toBe('Зараз нема чого скасовувати 🙂');
    expect(t('uk', 'btnStartFlow')).toBe('😤 Мені не повертають заставу');
  });

  it('gives the /cancel replies, the deposit button and the gate in English', () => {
    expect(t('en', 'cancelled')).toBe('OK, cancelled. If you need it again, type “deposit”.');
    expect(t('en', 'remindersOff')).toBe('Reminders are off.');
    expect(t('en', 'nothingToCancel')).toBe('Nothing to cancel right now 🙂');
    expect(t('en', 'btnStartFlow')).toBe('😤 I’m not getting my deposit back');
    expect(t('en', 'depositGate')).toMatch(
      /^The deposit helper speaks Russian and Ukrainian for now\. /,
    );
  });

  it('moved the /cancel replies and the button out of the deposit copy', () => {
    for (const key of ['cancelled', 'remindersOff', 'nothingToCancel', 'btnStartFlow']) {
      expect(DEPOSIT_TEXT_KEYS as string[], key).not.toContain(key);
    }
  });
});
