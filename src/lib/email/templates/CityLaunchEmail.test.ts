import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sendEmail } from '../send';
import { localeUrl } from '../url';

// The city-launch e-mail (spec 02 §City-launch e-mail link and send guard, D47): its
// button opens /<city>/costs, so the body and button describe the costs page and never
// promise browsing or posting listings, which are frozen.

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

type CityLaunchCopy = Record<'subject' | 'heading' | 'intro' | 'body' | 'cta' | 'footer', string>;
const copy = (locale: Locale) =>
  (messages[locale].emails as Record<string, unknown>).cityLaunch as CityLaunchCopy;

// The owner's exact copy (D47).
const APPROVED: Record<Locale, { body: string; cta: string }> = {
  ru: {
    body: 'Посмотрите, во что обходится аренда вместе с коммуналкой в районах города.',
    cta: 'Посмотреть расходы',
  },
  pl: {
    body: 'Zobacz, ile kosztuje najem razem z mediami w poszczególnych dzielnicach.',
    cta: 'Zobacz koszty',
  },
  en: {
    body: 'See what renting costs with utilities included, district by district.',
    cta: 'See the costs',
  },
  uk: {
    body: 'Подивіться, скільки коштує оренда разом із комуналкою в районах міста.',
    cta: 'Переглянути витрати',
  },
};

// Any mention of listings, in the four languages (spec 02).
const LISTINGS = /объявлен|ogłosze|listing|оголошен/i;

const sent = vi.hoisted(() => ({
  emails: [] as { to: string; subject: string; html: string }[],
}));

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  return {
    getTranslations: async ({ locale, namespace }: { locale: Locale; namespace: string }) =>
      createTranslator({
        locale,
        messages: messages[locale] as never,
        namespace: namespace as never,
      }),
  };
});
// Resend is never reached: the client records what would have been sent.
vi.mock('../client', () => ({
  resend: {
    emails: {
      send: vi.fn(async (email: { to: string; subject: string; html: string }) => {
        sent.emails.push(email);
        return { data: { id: 'test-id' }, error: null };
      }),
    },
  },
}));
vi.mock('@/lib/posthog-server', () => ({
  captureServerException: vi.fn(),
  flushPostHog: vi.fn(async () => undefined),
}));

const text = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ') // `\s` below covers a literal U+00A0
    .replace(/\s+/g, ' ')
    .trim();

const anchors = (html: string) =>
  [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: m[1],
    label: text(m[2]),
  }));

async function renderCityLaunch(locale: Locale) {
  sent.emails = [];
  const cityUrl = localeUrl(locale, '/krakow/costs');
  const result = await sendEmail({
    to: 'subscriber@example.com',
    locale,
    template: 'cityLaunch',
    data: { cityName: 'Kraków', cityUrl },
  });
  expect(result.success).toBe(true);
  expect(sent.emails).toHaveLength(1);
  return { cityUrl, email: sent.emails[0] };
}

describe('city-launch e-mail copy (D47)', () => {
  beforeEach(() => {
    sent.emails = [];
  });

  it.each(LOCALES)('%s: body and button are the approved costs-page copy', (locale) => {
    expect(copy(locale).body).toBe(APPROVED[locale].body);
    expect(copy(locale).cta).toBe(APPROVED[locale].cta);
  });

  it.each(LOCALES)('%s: body and button do not mention listings', (locale) => {
    expect(copy(locale).body).not.toMatch(LISTINGS);
    expect(copy(locale).cta).not.toMatch(LISTINGS);
  });

  it.each(LOCALES)('%s: body has no {city} placeholder', (locale) => {
    expect(copy(locale).body).not.toMatch(/[{}]/);
  });

  it('the listings pattern catches the old copy in every language', () => {
    for (const old of [
      'You can now browse listings and post your own.',
      'Browse listings',
      'Możesz już przeglądać ogłoszenia i dodać własne.',
      'Смотреть объявления',
      'Переглянути оголошення',
    ]) {
      expect(old).toMatch(LISTINGS);
    }
  });

  it.each(LOCALES)(
    '%s: the rendered e-mail has the costs URL on the button and no listings promise',
    async (locale) => {
      const { cityUrl, email } = await renderCityLaunch(locale);
      expect(cityUrl).toBe(`https://passflat.com/${locale}/krakow/costs`);

      const button = anchors(email.html).find((a) => a.label === APPROVED[locale].cta);
      expect(button?.href).toBe(cityUrl);
      expect(anchors(email.html).some((a) => /replacement|listings/.test(a.href))).toBe(false);

      const visible = text(email.html);
      expect(visible).toContain(APPROVED[locale].body);
      expect(visible).not.toMatch(LISTINGS);
      expect(email.subject).not.toMatch(LISTINGS);
    },
  );

  it.each(LOCALES)(
    '%s: subject, heading and intro still name the city; no raw key',
    async (locale) => {
      const { email } = await renderCityLaunch(locale);
      const visible = text(email.html);
      expect(email.subject).toContain('Kraków');
      expect(visible).toContain(copy(locale).heading.replace('{city}', 'Kraków'));
      expect(visible).toContain(copy(locale).intro.replace('{city}', 'Kraków'));
      expect(visible).toContain(copy(locale).footer);
      expect(visible).not.toMatch(/cityLaunch\.|emails\./);
    },
  );
});
