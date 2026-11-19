import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlatmateBlockCounts } from '@/lib/roommate/flatmate-block';

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

// The real ICU rendering of the chosen locale file, as the shared locale layout's provider
// serves it (`listings` is in SHARED_CLIENT_NAMESPACES).
const { capture, state, namespaces } = vi.hoisted(() => ({
  capture: vi.fn(),
  state: { locale: 'en' as 'pl' | 'en' | 'ru' | 'uk' },
  namespaces: [] as (string | undefined)[],
}));
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: (namespace?: string) => {
      namespaces.push(namespace);
      return actual.createTranslator({
        locale: state.locale,
        messages: messages[state.locale] as never,
        namespace: namespace as never,
      });
    },
  };
});
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture }) }));

import { FindFlatmateBlock } from './find-flatmate-block';

const DISTRICTS = [
  { slug: 'mokotow', name: 'Mokotów' },
  { slug: 'wola', name: 'Wola' },
  { slug: 'praga-poludnie', name: 'Praga-Południe' },
];

const COUNTS: FlatmateBlockCounts = {
  status: 'counts',
  total: 7,
  top: [
    { slug: 'mokotow', count: 4 },
    { slug: 'wola', count: 2 },
    { slug: 'praga-poludnie', count: 1 },
  ],
};

function text(counts: FlatmateBlockCounts, locale: Locale = 'en'): string {
  state.locale = locale;
  const html = renderToStaticMarkup(
    createElement(FindFlatmateBlock, { counts, districts: DISTRICTS }),
  );
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type AnyElement = ReactElement<{
  children?: ReactNode;
  href?: string;
  target?: string;
  rel?: string;
  onClick?: () => void;
}>;

function findAll(node: ReactNode, match: (el: AnyElement) => boolean): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, match));
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const el = node as AnyElement;
  return [...(match(el) ? [el] : []), ...findAll(el.props.children, match)];
}

function botLink(counts: FlatmateBlockCounts = COUNTS): AnyElement | undefined {
  state.locale = 'en';
  const tree = FindFlatmateBlock({ counts, districts: DISTRICTS });
  return findAll(tree, (el) => el.type === 'a')[0];
}

describe('FindFlatmateBlock', () => {
  beforeEach(() => {
    capture.mockClear();
    namespaces.length = 0;
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the EN copy with the count, the named districts, how it works and the languages', () => {
    expect(text(COUNTS)).toBe(
      'Looking for someone to rent with? 7 people in Warsaw already have a profile. ' +
        'Districts named most often: Mokotów: 4 profiles Wola: 2 profiles Praga-Południe: 1 profile ' +
        'Create a profile in the Passflat bot on Telegram: district, budget per person, move-in month. ' +
        'Contacts appear only when the interest is mutual. ' +
        'The bot speaks English, Russian and Ukrainian. Open the bot in Telegram',
    );
  });

  it.each<[Locale, string, string, string]>([
    [
      'pl',
      'Szukasz kogoś do wspólnego wynajmu?',
      'W Warszawie profil ma już 7 osób.',
      'Otwórz bota w Telegramie',
    ],
    [
      'ru',
      'Ищешь, с кем снять квартиру?',
      'В Варшаве анкету уже создали 7 человек.',
      'Открыть бота в Telegram',
    ],
    [
      'uk',
      'Шукаєш, з ким зняти квартиру?',
      'У Варшаві анкету вже створили 7 людей.',
      'Відкрити бота в Telegram',
    ],
  ])('renders the %s title, count and button', (locale, title, count, button) => {
    const rendered = text(COUNTS, locale);
    expect(rendered.startsWith(`${title} ${count}`)).toBe(true);
    expect(rendered.endsWith(button)).toBe(true);
  });

  it.each<[Locale, string]>([
    ['pl', 'Bot mówi po angielsku, rosyjsku i ukraińsku.'],
    ['en', 'The bot speaks English, Russian and Ukrainian.'],
    ['ru', 'Бот говорит по-английски, по-русски и по-украински.'],
    ['uk', 'Бот говорить англійською, російською та українською.'],
  ])('names the bot languages in %s (D50)', (locale, languages) => {
    expect(text(COUNTS, locale)).toContain(languages);
  });

  it.each<[Locale, number, string]>([
    ['pl', 1, 'W Warszawie profil ma już 1 osoba.'],
    ['pl', 2, 'W Warszawie profil mają już 2 osoby.'],
    ['pl', 5, 'W Warszawie profil ma już 5 osób.'],
    ['pl', 22, 'W Warszawie profil mają już 22 osoby.'],
    ['en', 1, '1 person in Warsaw already has a profile.'],
    ['en', 2, '2 people in Warsaw already have a profile.'],
    ['ru', 1, 'В Варшаве анкету уже создал 1 человек.'],
    ['ru', 3, 'В Варшаве анкету уже создали 3 человека.'],
    ['ru', 11, 'В Варшаве анкету уже создали 11 человек.'],
    ['ru', 21, 'В Варшаве анкету уже создал 21 человек.'],
    ['uk', 1, 'У Варшаві анкету вже створила 1 людина.'],
    ['uk', 4, 'У Варшаві анкету вже створили 4 людини.'],
    ['uk', 5, 'У Варшаві анкету вже створили 5 людей.'],
  ])('ICU plural: %s with %i', (locale, total, sentence) => {
    expect(text({ status: 'counts', total, top: [] }, locale)).toContain(sentence);
  });

  it.each<[Locale, string]>([
    ['pl', 'Mokotów: 4 profile Wola: 2 profile Praga-Południe: 1 profil'],
    ['ru', 'Mokotów: 4 анкеты Wola: 2 анкеты Praga-Południe: 1 анкета'],
    ['uk', 'Mokotów: 4 анкети Wola: 2 анкети Praga-Południe: 1 анкета'],
  ])('district items in %s use the website names and their own counts', (locale, items) => {
    expect(text(COUNTS, locale)).toContain(items);
  });

  it('zero: "Be among the first", no number and no district list', () => {
    const rendered = text({ status: 'counts', total: 0, top: [] });
    expect(rendered).toContain('Be among the first.');
    expect(rendered).not.toMatch(/\d/);
    expect(rendered).not.toContain('Districts named most often');
    expect(rendered).toContain('The bot speaks English, Russian and Ukrainian.');
    expect(rendered).toContain('Open the bot in Telegram');
    expect(text({ status: 'counts', total: 0, top: [] }, 'pl')).toContain('Bądź wśród pierwszych.');
    expect(text({ status: 'counts', total: 0, top: [] }, 'ru')).toContain('Будь среди первых.');
    expect(text({ status: 'counts', total: 0, top: [] }, 'uk')).toContain('Будь серед перших.');
  });

  it('a database error: the block without counts (no count sentence, no districts, still the button)', () => {
    const rendered = text({ status: 'unavailable' });
    expect(rendered).toBe(
      'Looking for someone to rent with? ' +
        'Create a profile in the Passflat bot on Telegram: district, budget per person, move-in month. ' +
        'Contacts appear only when the interest is mutual. ' +
        'The bot speaks English, Russian and Ukrainian. Open the bot in Telegram',
    );
  });

  it('a total with no named district (all "any district") shows the count without the list', () => {
    const rendered = text({ status: 'counts', total: 3, top: [] });
    expect(rendered).toContain('3 people in Warsaw already have a profile.');
    expect(rendered).not.toContain('Districts named most often');
  });

  it('renders nothing without NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', '');
    expect(FindFlatmateBlock({ counts: COUNTS, districts: DISTRICTS })).toBeNull();
    expect(text(COUNTS)).toBe('');
    expect(capture).not.toHaveBeenCalled();
  });

  it('its own button: the roommate deep link, a new tab, mate_web_roommate', () => {
    const link = botLink();
    expect(link?.props.href).toBe('https://t.me/passflat_test_bot?start=mate_web_roommate');
    expect(link?.props.target).toBe('_blank');
    expect(link?.props.rel).toBe('noopener noreferrer');
    expect(
      findAll(FindFlatmateBlock({ counts: COUNTS, districts: DISTRICTS }), (el) => el.type === 'a'),
    ).toHaveLength(1);
  });

  it('fires one telegram_bot_opened per click with source=roommate and no building context', () => {
    const link = botLink();
    expect(capture).not.toHaveBeenCalled();
    link?.props.onClick?.();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('telegram_bot_opened', {
      source: 'roommate',
      has_building_context: false,
    });
    link?.props.onClick?.();
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('the same button in the zero and error states', () => {
    for (const counts of [
      { status: 'counts', total: 0, top: [] },
      { status: 'unavailable' },
    ] as FlatmateBlockCounts[]) {
      expect(botLink(counts)?.props.href).toBe(
        'https://t.me/passflat_test_bot?start=mate_web_roommate',
      );
    }
  });

  it('reads only the listings namespace', () => {
    text(COUNTS);
    expect(namespaces.length).toBeGreaterThan(0);
    expect(new Set(namespaces)).toEqual(new Set(['listings.findFlatmate']));
  });
});
