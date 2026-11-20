import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// PRD 4 FR-15 (spec 08 §How it works, Help and About): the home "how it works"
// section opens on the roommate tab, whose four steps are the bot's; the cesja
// and sublet tabs stay after it until Q-3 (FR-16).

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

const state = vi.hoisted(() => ({ locale: 'en' as 'pl' | 'en' | 'ru' | 'uk' }));

// The real ICU translator over the `landing` namespace only (one of the locale
// layout's SHARED_CLIENT_NAMESPACES, which the home page's client tree gets); a
// missing key throws instead of rendering its path.
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({
        locale: state.locale,
        messages: { landing: messages[state.locale].landing } as never,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      }),
  };
});

import { HowItWorksTabs } from './how-it-works-tabs';

const decode = (html: string) =>
  html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

const render = (locale: Locale) => {
  state.locale = locale;
  return renderToStaticMarkup(createElement(HowItWorksTabs));
};

const buttons = (html: string) =>
  [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map(([, attributes, label]) => ({
    label: decode(label),
    pressed: /aria-pressed="true"/.test(attributes),
    attributes,
  }));

const steps = (html: string) => ({
  titles: [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map(([, title]) => decode(title)),
  descriptions: [...html.matchAll(/<p class="text-sm text-muted-foreground">([^<]*)<\/p>/g)].map(
    ([, description]) => decode(description),
  ),
});

const howItWorks = (locale: Locale) =>
  messages[locale].landing.howItWorks as Record<string, string> &
    Record<'roommate' | 'replacement' | 'sublet', Record<string, string>>;

const STEP_NUMBERS = [1, 2, 3, 4] as const;

/** The PRD 4 §8 drafts (EN). */
const EN_ROOMMATE_STEPS = {
  step1Title: 'Create a profile in the bot',
  step1Desc:
    'District, budget per person, move-in month, languages. In Telegram, in English, Russian or Ukrainian.',
  step2Title: 'See who else is looking',
  step2Desc: 'Honest counts per district and what a flat costs per person, from tenant reports.',
  step3Title: "Mark who you'd rent with",
  step3Desc:
    'Compatible people one at a time. Interested or skip; nobody sees your profile on the web.',
  step4Title: 'Contacts open on mutual interest',
  step4Desc:
    'Both Telegram usernames appear only when the interest is mutual. Never pay a reservation before a viewing and a signed contract.',
};

/** The old subtitle ("three ways to find your next home"), per locale. */
const THREE_WAYS: Record<Locale, RegExp> = {
  en: /three ways/i,
  pl: /trzy sposoby/i,
  ru: /три способа/i,
  uk: /три способи/i,
};

describe('HowItWorksTabs (PRD 4 FR-15)', () => {
  beforeEach(() => {
    state.locale = 'en';
  });

  it.each(LOCALES)('%s: the roommate tab comes first and is the only one selected', (locale) => {
    const copy = howItWorks(locale);
    const tabs = buttons(render(locale));

    expect(tabs.map((tab) => tab.label)).toEqual([
      copy.tabRoommate,
      copy.tabReplacement,
      copy.tabSublet,
    ]);
    expect(tabs.map((tab) => tab.pressed)).toEqual([true, false, false]);
    // The selected roommate tab wears the roommate colour.
    expect(tabs[0].attributes).toContain('border-violet-500/50');
    for (const tab of tabs) expect(tab.attributes).toContain('type="button"');
  });

  it.each(LOCALES)('%s: the default steps are the roommate steps, in order', (locale) => {
    const roommate = howItWorks(locale).roommate;
    const shown = steps(render(locale));

    expect(shown.titles).toEqual(STEP_NUMBERS.map((n) => roommate[`step${n}Title`]));
    expect(shown.descriptions).toEqual(STEP_NUMBERS.map((n) => roommate[`step${n}Desc`]));
    // Numbered 1 – 4 on the roommate colour.
    expect(render(locale).match(/bg-violet-500[^"]*">\d<\/span>/g)).toHaveLength(4);
  });

  it('the EN roommate steps and subtitle are the PRD 4 §8 drafts', () => {
    expect(howItWorks('en').roommate).toEqual(EN_ROOMMATE_STEPS);
    expect(howItWorks('en').subtitle).toBe('How finding someone to rent with works');
  });

  it.each(LOCALES)(
    '%s: the subtitle no longer says "three ways to find your next home"',
    (locale) => {
      expect(howItWorks(locale).subtitle).not.toMatch(THREE_WAYS[locale]);
    },
  );

  it.each(LOCALES)('%s: every tab keeps four titled steps', (locale) => {
    const copy = howItWorks(locale);
    for (const tab of ['roommate', 'replacement', 'sublet'] as const) {
      for (const n of STEP_NUMBERS) {
        expect(typeof copy[tab][`step${n}Title`], `${tab} ${n}`).toBe('string');
        expect(typeof copy[tab][`step${n}Desc`], `${tab} ${n}`).toBe('string');
      }
    }
  });
});
