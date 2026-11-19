import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { rt } from '@/lib/bot/roommate-texts';
import type { BotLocale } from '@/lib/bot/texts';

// Spec 07 §Terms and privacy drafts (FR-36): the matching sections of the privacy policy
// (`#roommate-matching`, linked from the bot's intake intro) and of the terms (`#matching`,
// linked from the statement of reasons), rendered with the real locale files.

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];
type Tree = { [key: string]: string | Tree };

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as Tree,
  ]),
) as Record<Locale, Tree>;

// Every key the pages read must exist and parse: a missing key throws instead of rendering
// the key path.
const state = vi.hoisted(() => ({ locale: 'en' as 'pl' | 'en' | 'ru' | 'uk' }));
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: (namespace: string) =>
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

import { PrivacyClient } from '../privacy/client';
import { TermsClient } from './client';

function render(component: () => ReactNode, locale: Locale): string {
  state.locale = locale;
  return renderToStaticMarkup(createElement(component));
}

/** The text as React escapes it in markup. */
function escaped(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function branch(locale: Locale, path: string): Tree {
  return path.split('.').reduce((node, key) => node[key] as Tree, messages[locale]);
}

function leaf(locale: Locale, path: string): string {
  const parts = path.split('.');
  const value = branch(locale, parts.slice(0, -1).join('.'))[parts[parts.length - 1]];
  expect(typeof value, `${locale} ${path}`).toBe('string');
  return value as string;
}

/** The `<h2>` texts of the article, in page order. */
function h2Titles(html: string): string[] {
  return [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((match) => match[1]);
}

/** The markup from the `<h2>` with `id` up to the next `<h2>`. */
function sectionById(html: string, id: string): string {
  const start = html.indexOf(`<h2 id="${id}"`);
  expect(start, `no <h2 id="${id}">`).toBeGreaterThan(-1);
  const end = html.indexOf('<h2', start + 1);
  return html.slice(start, end === -1 ? undefined : end);
}

describe.each(LOCALES)('privacy policy, roommate matching section (%s)', (locale) => {
  const html = render(PrivacyClient, locale);
  const t = (path: string) => escaped(leaf(locale, `privacy.${path}`));

  it('renders the section with id="roommate-matching" and its title', () => {
    expect(html).toContain(
      `<h2 id="roommate-matching" class="scroll-mt-24">${t('roommateMatching.title')}</h2>`,
    );
    expect(html.match(/id="roommate-matching"/g)).toHaveLength(1);
  });

  it('sits right after "Data sharing" and before "Data retention"', () => {
    const titles = h2Titles(html);
    const at = titles.indexOf(t('roommateMatching.title'));
    expect(titles[at - 1]).toBe(t('dataSharing.title'));
    expect(titles[at + 1]).toBe(t('retention.title'));
  });

  it('renders every key of privacy.roommateMatching inside the section', () => {
    const section = sectionById(html, 'roommate-matching');
    const keys = Object.keys(branch(locale, 'privacy.roommateMatching'));
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) expect(section, key).toContain(t(`roommateMatching.${key}`));
  });

  it('renders the redrafted keys: matching recipients, Telegram, retention, automated decisions', () => {
    for (const path of [
      'dataSharing.item3',
      'dataSharing.processors.telegram',
      'retention.roommate',
      'transfers.processors',
      'automated.description',
    ]) {
      expect(html, path).toContain(t(path));
    }
    expect(leaf(locale, 'privacy.transfers.processors')).toContain('Telegram');
  });
});

describe.each(LOCALES)('terms, matching section (%s)', (locale) => {
  const html = render(TermsClient, locale);
  const t = (path: string) => escaped(leaf(locale, `termsPage.${path}`));

  it('renders the section with id="matching" and its title', () => {
    expect(html).toContain(`<h2 id="matching" class="scroll-mt-24">${t('matching.title')}</h2>`);
    expect(html.match(/id="matching"/g)).toHaveLength(1);
  });

  it('takes the next number after the content sections, before Contact and Changes', () => {
    const titles = h2Titles(html);
    // Every numbered title in page order is 1, 2, 3, … with no gap or repeat.
    expect(titles.map((title) => Number.parseInt(title, 10))).toEqual(
      titles.map((_, index) => index + 1),
    );
    const at = titles.indexOf(t('matching.title'));
    expect(titles[at - 1]).toBe(t('law.title'));
    expect(at).toBeLessThan(titles.indexOf(t('contact.title')));
    expect(at).toBeLessThan(titles.indexOf(t('changes.title')));
    expect(titles[titles.length - 1]).toBe(t('changes.title'));
  });

  it('renders every key of termsPage.matching inside the section', () => {
    const section = sectionById(html, 'matching');
    const keys = Object.keys(branch(locale, 'termsPage.matching'));
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) expect(section, key).toContain(t(`matching.${key}`));
  });
});

describe('the bot and the pages agree', () => {
  const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

  it('links the anchors the pages render', () => {
    expect(source('src/lib/bot/roommate-flow.ts')).toContain(
      "webLink('/privacy#roommate-matching'",
    );
    expect(source('src/lib/bot/roommate-hide-messages.ts')).toContain("webLink('/terms#matching'");
  });

  it.each<BotLocale>(['ru', 'uk', 'en'])(
    'the terms name the report reasons as the bot buttons do (%s)',
    (locale) => {
      const reports = leaf(locale, 'termsPage.matching.reports');
      for (const key of [
        'btnReportMoney',
        'btnReportFake',
        'btnReportOffensive',
        'btnReportUnder18',
        'btnReportOther',
      ] as const) {
        expect(reports, key).toContain(rt(locale, key));
      }
      // The statement of reasons states this rule; the terms state the same one.
      expect(leaf(locale, 'termsPage.matching.hiding')).toContain(rt(locale, 'btnReportUnder18'));
    },
  );
});
