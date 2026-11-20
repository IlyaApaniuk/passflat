import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { pickMessages } from '@/i18n/messages';

// PRD 4 FR-15 (spec 08 §How it works, Help and About): the About page's first
// three pillars describe the thesis (someone to rent with, the per-person cost,
// the checker, calculator and guides) instead of the frozen listing types, and
// "No hidden information" speaks of the figures tenants reported.

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

/** The namespaces of the About page's scoped provider (`about/page.tsx`). */
const ABOUT_PROVIDER_NAMESPACES = ['about', 'common'];

const state = vi.hoisted(() => ({ locale: 'en' as 'pl' | 'en' | 'ru' | 'uk' }));

// The real ICU translator over the provider's messages only; a missing key
// throws instead of rendering its path.
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({
        locale: state.locale,
        messages: pickMessages(messages[state.locale], ABOUT_PROVIDER_NAMESPACES) as never,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      }),
  };
});

vi.mock('posthog-js/react', () => ({ useFeatureFlagEnabled: () => false }));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement('a', { href, ...rest }, children),
}));

import { AboutClient } from './client';

/** Listings, frozen and not promoted (D5); as in `src/i18n/honesty-copy.test.ts`. */
const LISTINGS: Record<Locale, RegExp> = {
  en: /listing/i,
  pl: /ogłosze/i,
  ru: /объявлен/i,
  uk: /оголошен/i,
};

const decode = (html: string) =>
  html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

const text = (html: string) =>
  decode(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const about = (locale: Locale, key: string) =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], {
    ...messages[locale].about,
  }) as string;

const render = (locale: Locale) => {
  state.locale = locale;
  return renderToStaticMarkup(createElement(AboutClient, {}));
};

/** The "Our Solution" section: the one that holds `solution.label`. */
const solutionSection = (html: string, locale: Locale) => {
  const section = html
    .split('<section')
    .find((chunk) => text(chunk).includes(about(locale, 'solution.label')));
  expect(section, `${locale}: solution section`).toBeDefined();
  return section as string;
};

/** Each pillar card: its icon class and its h3 title, in order. */
const pillars = (section: string) =>
  [...section.matchAll(/<svg[^>]*class="([^"]*)"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g)].map(
    ([, iconClass, title]) => ({ icon: iconClass, title: text(title) }),
  );

describe('About page copy (PRD 4 FR-15)', () => {
  it.each(LOCALES)(
    '%s: renders under the scoped provider (about, common) with no missing key',
    (locale) => {
      expect(() => render(locale)).not.toThrow();
    },
  );

  it('the EN pillar titles and principle are the PRD 4 §8 drafts', () => {
    expect(about('en', 'solution.pillar1Title')).toBe('Find someone to rent with');
    expect(about('en', 'solution.pillar2Title')).toBe('What it costs per person');
    expect(about('en', 'solution.pillar3Title')).toBe('Checker, calculator, guides');
    expect(about('en', 'values.principle1Desc')).toBe(
      'We show the figures tenants reported, with their counts — also when they are inconvenient.',
    );
  });

  it.each(LOCALES)(
    '%s: the first three pillars are the thesis, with matching icons, before costs',
    (locale) => {
      const cards = pillars(solutionSection(render(locale), locale));
      expect(cards.map((card) => card.title)).toEqual([
        about(locale, 'solution.pillar1Title'),
        about(locale, 'solution.pillar2Title'),
        about(locale, 'solution.pillar3Title'),
        about(locale, 'solution.pillar4Title'),
      ]);
      expect(cards[0].icon).toContain('lucide-users');
      expect(cards[1].icon).toContain('lucide-wallet');
      expect(cards[2].icon).toContain('lucide-search');
    },
  );

  it.each(LOCALES)('%s: the solution section names no listing type or listing', (locale) => {
    const section = text(solutionSection(render(locale), locale));
    for (const n of [1, 2, 3]) {
      expect(section).toContain(about(locale, `solution.pillar${n}Desc`));
    }
    expect(section).not.toMatch(LISTINGS[locale]);
  });

  it.each(LOCALES)(
    '%s: the team paragraph and the first principle render the new copy',
    (locale) => {
      const page = text(render(locale));
      expect(page).toContain(about(locale, 'team.description2'));
      expect(page).toContain(about(locale, 'values.principle1Desc'));
      expect(about(locale, 'team.description2')).not.toMatch(LISTINGS[locale]);
      expect(about(locale, 'values.principle1Desc')).not.toMatch(LISTINGS[locale]);
    },
  );
});
