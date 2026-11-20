import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { pickMessages } from '@/i18n/messages';

// PRD 4 FR-16 (spec 08 §How it works, Help and About; D80, "nothing is paid today"):
// the Help page has no payments section (with its 14-day withdrawal answer) and no
// promotion answer, and "Is Passflat free?" says Passflat is free today, nothing about
// later prices. No answer names a price.

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];
type Dictionary = Record<string, Record<string, unknown>>;

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as Dictionary,
  ]),
) as Record<Locale, Dictionary>;

/** The namespaces of the Help page's scoped provider (`help/page.tsx`). */
const HELP_PROVIDER_NAMESPACES = ['helpCenter', 'common'];

const state = vi.hoisted(() => ({ locale: 'en' as 'pl' | 'en' | 'ru' | 'uk' }));

// The real ICU translator over the provider's messages only; a missing key throws
// instead of rendering its path.
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({
        locale: state.locale,
        messages: pickMessages(messages[state.locale], HELP_PROVIDER_NAMESPACES) as never,
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

// Radix renders a closed accordion item without its answer; plain elements show every
// question and answer, so the whole page text is checked.
vi.mock('@/components/ui/accordion', () => ({
  Accordion: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  AccordionItem: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  AccordionTrigger: ({ children }: { children?: ReactNode }) => createElement('h3', null, children),
  AccordionContent: ({ children }: { children?: ReactNode }) => createElement('p', null, children),
}));

import { HelpCenterClient } from './client';

const decode = (html: string) =>
  html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

const text = (html: string) =>
  decode(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const help = (locale: Locale) =>
  messages[locale].helpCenter as Record<string, Record<string, string>>;

const render = (locale: Locale) => {
  state.locale = locale;
  return renderToStaticMarkup(createElement(HelpCenterClient));
};

/** Each rendered question followed by its answer. */
const pairs = (html: string) =>
  [...html.matchAll(/<h3>([\s\S]*?)<\/h3><p>([\s\S]*?)<\/p>/g)].map(([, q, a]) => ({
    q: text(q),
    a: text(a),
  }));

/** "PLN", or "zł" as a word ("Znalazłam" holds the letters, not a price); as in honesty-copy. */
const PRICE = /PLN|(^|[^a-ząćęłńóśźż])zł(?![a-ząćęłńóśźż])/i;

/** "Forever" and "always free": a statement about later prices (D80). */
const FOREVER: Record<Locale, RegExp> = {
  en: /forever|always|for now|later|future/i,
  pl: /zawsze|na zawsze|na razie|później|w przyszłości/i,
  ru: /навсегда|всегда|пока что|потом|в будущем/i,
  uk: /назавжди|завжди|поки що|згодом|у майбутньому/i,
};

describe('Help page (PRD 4 FR-16, D80)', () => {
  it.each(LOCALES)(
    '%s: the sections are general, cesja, costs, account and GDPR; no payments',
    (locale) => {
      const html = render(locale);
      const titles = [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map(([, title]) =>
        decode(title),
      );
      const copy = help(locale);
      expect(titles).toEqual([
        copy.general.title,
        copy.leaseTakeovers.title,
        copy.costTransparency.title,
        copy.account.title,
        copy.gdprRights.title,
        // The closing "Still have questions?" block.
        (messages[locale].helpCenter as Record<string, string>).stillHaveQuestions,
      ]);
      expect(copy.payments, `${locale}: helpCenter.payments`).toBeUndefined();
    },
  );

  it.each(LOCALES)('%s: the promotion question and answer are gone', (locale) => {
    const copy = help(locale).leaseTakeovers;
    expect(
      Object.keys(copy)
        .filter((key) => /^[qa]\d$/.test(key))
        .sort(),
    ).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'q1', 'q2', 'q3', 'q4', 'q5']);
    expect(pairs(render(locale)).map((pair) => pair.q)).toContain(copy.q5);
  });

  it.each(LOCALES)('%s: "Is Passflat free?" says free today and nothing about later', (locale) => {
    const general = help(locale).general;
    const shown = pairs(render(locale)).find((pair) => pair.q === general.q2);
    expect(shown?.a).toBe(general.a2);
    expect(general.a2).toMatch(/bezpłat|free|бесплатн|безкоштовн/i);
    expect(general.a2).not.toMatch(FOREVER[locale]);
    expect(general.a2).not.toMatch(/\d|€/);
    expect(general.a2).not.toMatch(PRICE);
    expect(general.a2).not.toMatch(/listing|ogłosze|объявлен|оголошен/i);
  });

  it('the EN answer is the spec 08 draft', () => {
    expect(help('en').general.a2).toBe(
      'Yes. Everything on Passflat is free today: the figures, the address check, the calculator, the guides, the templates and the Telegram bot.',
    );
  });

  it.each(LOCALES)('%s: no answer on the page names a price or a payment method', (locale) => {
    const page = text(render(locale));
    expect(page).not.toMatch(PRICE);
    expect(page).not.toContain('€');
    expect(page).not.toMatch(/Stripe|BLIK|Przelewy24/);
    // The old payments section's withdrawal answer named 14 days.
    expect(page).not.toMatch(/14/);
  });
});
