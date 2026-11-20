import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// PRD 4 FR-15 / FR-16 (spec 08 §How it works, Help and About; D80): the home "how it
// works" section shows the bot's four roommate steps and nothing else. The cesja and
// sublet tabs are gone with their keys, so there is no tab strip.

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

// The real ICU translator; a missing key throws instead of rendering its path.
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  return {
    getTranslations: async (namespace?: string) =>
      createTranslator({
        locale: state.locale,
        messages: messages[state.locale] as never,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      }),
  };
});

import { HowItWorks } from './how-it-works';

const decode = (html: string) =>
  html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

const render = async (locale: Locale) => {
  state.locale = locale;
  return renderToStaticMarkup(await HowItWorks());
};

const howItWorks = (locale: Locale) =>
  messages[locale].landing.howItWorks as Record<string, unknown> & {
    roommate: Record<string, string>;
  };

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

describe('home "how it works" (PRD 4 FR-15, FR-16)', () => {
  it.each(LOCALES)('%s: the four roommate steps, in order, numbered 1 – 4', async (locale) => {
    const roommate = howItWorks(locale).roommate;
    const html = await render(locale);

    const titles = [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map(([, title]) => decode(title));
    const descriptions = [
      ...html.matchAll(/<p class="text-sm text-muted-foreground">([^<]*)<\/p>/g),
    ].map(([, description]) => decode(description));

    expect(titles).toEqual(STEP_NUMBERS.map((n) => roommate[`step${n}Title`]));
    expect(descriptions).toEqual(STEP_NUMBERS.map((n) => roommate[`step${n}Desc`]));
    expect(html.match(/<li /g)).toHaveLength(4);
    expect([...html.matchAll(/bg-violet-500[^"]*">(\d)<\/span>/g)].map(([, n]) => n)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(decode(html)).toContain(howItWorks(locale).subtitle as string);
  });

  it.each(LOCALES)('%s: no tab strip and no cesja or sublet step', async (locale) => {
    const html = await render(locale);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('aria-pressed');
    // Only the roommate block is left under landing.howItWorks.
    expect(Object.keys(howItWorks(locale)).sort()).toEqual(['roommate', 'subtitle', 'title']);
  });

  it('the EN roommate steps and subtitle are the PRD 4 §8 drafts', () => {
    expect(howItWorks('en').roommate).toEqual(EN_ROOMMATE_STEPS);
    expect(howItWorks('en').subtitle).toBe('How finding someone to rent with works');
  });

  it.each(LOCALES)(
    '%s: the subtitle does not say "three ways to find your next home"',
    (locale) => {
      expect(howItWorks(locale).subtitle).not.toMatch(THREE_WAYS[locale]);
    },
  );
});
