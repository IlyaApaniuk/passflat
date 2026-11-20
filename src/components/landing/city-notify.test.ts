import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// PRD 4 FR-19 (D79, spec 08 §Dead-end forms): the home city-notify form stays as a demand signal
// with the owner's copy. The component, the API call and the stored rows are unchanged; the one
// promised e-mail is the city-launch route's (D33, D47).

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as Record<string, unknown>,
  ]),
) as Record<Locale, Record<string, unknown>>;

const state = vi.hoisted(() => ({ locale: 'en' as 'pl' | 'en' | 'ru' | 'uk' }));

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useLocale: () => state.locale,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({
        locale: state.locale,
        messages: messages[state.locale] as never,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      }),
  };
});
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));

import { CityNotify } from './city-notify';

const copy = (locale: Locale) =>
  (messages[locale].landing as { cityNotify: Record<string, string> }).cityNotify;

const html = () => renderToStaticMarkup(createElement(CityNotify));

const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** The D87 line ("Warsaw only for now."), used as the badge (the agent's choice, spec 08). */
const BADGE: Record<Locale, string> = {
  en: 'Warsaw only for now.',
  pl: 'Na razie tylko Warszawa.',
  ru: 'Пока только Варшава.',
  uk: 'Поки лише Варшава.',
};

/** "If": the launch is "when", not "if" (D79). */
const IF: Record<Locale, RegExp> = {
  en: /\bif\b/i,
  pl: /\bjeśli|\bjeżeli|\bo ile\b/i,
  ru: /(^|[^а-яё])если/i,
  uk: /(^|[^а-яіїєґ'ʼ])якщо/i,
};

/** An e-mail notification: the one e-mail the city-launch route sends. */
const E_MAIL: Record<Locale, RegExp> = {
  en: /e-mail/i,
  pl: /e-mail/i,
  ru: /почт/i,
  uk: /пошт/i,
};

/** Expansion talk, which contradicts "we only work here for now" (D6). */
const EXPANDING: Record<Locale, RegExp> = {
  en: /expand|soon|europe/i,
  pl: /rozszerza|wkrótce|europ/i,
  ru: /расширя|скоро|европ/i,
  uk: /розширю|незабаром|європ/i,
};

const KEYS = [
  'badge',
  'cityPlaceholder',
  'consent',
  'consentRequired',
  'emailPlaceholder',
  'error',
  'privacyNote',
  'submit',
  'subtitle',
  'success',
  'title',
];

describe('city-notify form on the home page (PRD 4 FR-19, D79)', () => {
  beforeEach(() => {
    state.locale = 'en';
  });

  it('renders the owner copy: the EN of spec 08 and the owner RU', () => {
    const page = text(html());
    expect(page).toContain('Warsaw only for now. Live outside Warsaw?');
    expect(page).toContain(
      "We only work here for now. Tell us your city — that is how we see where people are waiting for us. When we open your city, we'll send you an e-mail.",
    );

    state.locale = 'ru';
    const ru = html();
    expect(ru).toMatch(/<h2 [^>]*>Живёте не в Варшаве\?<\/h2>/);
    expect(text(ru)).toContain(
      'Пока работаем только здесь. Напишите свой город — так мы видим, где нас ждут. Когда откроем ваш город, пришлём уведомление на почту.',
    );
  });

  it.each(LOCALES)(
    '%s: badge, h2 and subtitle in this order, the form kept as it was',
    (locale) => {
      state.locale = locale;
      const values = copy(locale);
      const markup = html();
      const page = text(markup);

      expect(values.badge).toBe(BADGE[locale]);
      expect(page.indexOf(values.badge)).toBeGreaterThanOrEqual(0);
      expect(page.indexOf(values.badge)).toBeLessThan(page.indexOf(values.title));
      expect(page.indexOf(values.title)).toBeLessThan(page.indexOf(values.subtitle));
      expect(markup.match(/<h2[ >]/g)).toHaveLength(1);

      // The form: e-mail, city, consent, privacy link, submit.
      expect(markup).toMatch(/<input [^>]*type="email"[^>]*required=""/);
      expect(markup).toContain(`placeholder="${values.emailPlaceholder}"`);
      expect(markup).toMatch(/<input [^>]*type="text"[^>]*required=""/);
      expect(markup).toContain(`placeholder="${values.cityPlaceholder}"`);
      expect(markup).toContain('id="city-notify-consent"');
      expect(markup).toContain('for="city-notify-consent"');
      expect(markup).toContain('href="/privacy"');
      expect(markup).toMatch(/<button [^>]*type="submit"/);
      expect(page).toContain(values.submit);
    },
  );

  it.each(LOCALES)('%s: "when", not "if"; an e-mail at the launch; no expansion talk', (locale) => {
    const values = copy(locale);
    expect(values.subtitle).not.toMatch(IF[locale]);
    expect(values.success).not.toMatch(IF[locale]);
    expect(values.subtitle).toMatch(E_MAIL[locale]);
    expect(values.success).toMatch(E_MAIL[locale]);
    for (const key of ['badge', 'title', 'subtitle', 'success']) {
      expect(values[key], `${locale}: ${key}`).not.toMatch(EXPANDING[locale]);
    }
  });

  it('the patterns catch the old copy', () => {
    expect('Expanding soon').toMatch(EXPANDING.en);
    expect("We're starting in Warsaw and expanding to other cities.").toMatch(EXPANDING.en);
    expect('Wkrótce w innych miastach').toMatch(EXPANDING.pl);
    expect('Скоро в других городах').toMatch(EXPANDING.ru);
    expect('Незабаром в інших містах').toMatch(EXPANDING.uk);
    expect("we'll e-mail you if we launch there").toMatch(IF.en);
    expect('Если откроем ваш город').toMatch(IF.ru);
    expect('Jeśli otworzymy').toMatch(IF.pl);
    expect('Якщо відкриємо').toMatch(IF.uk);
    expect('Thanks! We’ll keep you posted.').not.toMatch(E_MAIL.en);
  });

  it('currentCity is deleted and the key set is the same in four locales', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(copy(locale)).sort(), locale).toEqual(KEYS);
    }
  });

  it('posts to /api/city-notify with the same body as before', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/landing/city-notify.tsx'),
      'utf8',
    );
    expect(source).toContain("fetch('/api/city-notify', {");
    expect(source).toContain("method: 'POST'");
    expect(source).toContain('body: JSON.stringify({ email, city, consent: true, locale })');
  });
});
