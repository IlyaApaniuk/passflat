import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FLATMATE_SURFACES, type FlatmateSurface } from '@/lib/analytics/telegram-events';
import type { FlatmateBlockCounts } from '@/lib/roommate/flatmate-block';

// PRD 4 FR-8 (spec 08 §Flatmate callout): the shared callout, rendered with the real locale files.

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

const { capture, state, namespaces } = vi.hoisted(() => ({
  capture: vi.fn(),
  state: { locale: 'en' as 'pl' | 'en' | 'ru' | 'uk' },
  namespaces: [] as (string | undefined)[],
}));

// The client links read no message namespace (they also render under the calculator's scoped
// provider): any `useTranslations` call fails the render.
vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useTranslations: () => {
    throw new Error('FlatmateCalloutLinks must not read a message namespace');
  },
}));
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  return {
    // A missing key throws instead of rendering its path.
    getTranslations: async (namespace?: string) => {
      namespaces.push(namespace);
      return createTranslator({
        locale: state.locale,
        messages: messages[state.locale] as never,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      });
    },
  };
});
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture }) }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    className,
    onClick,
    children,
  }: {
    href: string;
    className?: string;
    onClick?: () => void;
    children: ReactNode;
  }) => createElement('a', { href, className, onClick }, children),
}));

import { TrackedLink } from '@/components/analytics/tracked-link';

import { FlatmateCallout } from './flatmate-callout';
import { FLATMATE_CALLOUT_ROOMMATE_PATH, FlatmateCalloutLinks } from './flatmate-callout-links';

const COUNTS: FlatmateBlockCounts = { status: 'counts', total: 7, top: [] };
const BOT = 'passflat_test_bot';

const at = (locale: Locale, path: string) =>
  path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], messages[locale]) as
    | string
    | undefined;

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

type Anchor = { href: string; target?: string; rel?: string; label: string };

const anchors = (html: string): Anchor[] =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, inner]) => ({
    href: /href="([^"]*)"/.exec(attrs)?.[1] ?? '',
    target: /target="([^"]*)"/.exec(attrs)?.[1],
    rel: /rel="([^"]*)"/.exec(attrs)?.[1],
    label: text(inner),
  }));

async function render(
  surface: FlatmateSurface,
  counts?: FlatmateBlockCounts,
  locale: Locale = 'en',
): Promise<string> {
  state.locale = locale;
  return renderToStaticMarkup(await FlatmateCallout({ surface, counts }));
}

/** Depth-first search of an element tree for the first element of `type`. */
function findElement(node: ReactNode, type: unknown): ReactElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  if (node.type === type) return node;
  return findElement((node.props as { children?: ReactNode }).children, type);
}

type LinksProps = Parameters<typeof FlatmateCalloutLinks>[0];

/** The links element the server callout hands to the client, with its props. */
async function linksOf(surface: FlatmateSurface): Promise<LinksProps> {
  state.locale = 'en';
  const tree = await FlatmateCallout({ surface });
  const links = findElement(tree, FlatmateCalloutLinks);
  if (!links) throw new Error('no FlatmateCalloutLinks in the callout');
  return links.props as LinksProps;
}

/** Calls the two click handlers the way a click would, without a DOM. */
function clickHandlers(props: LinksProps): { bot?: () => void; roommate: () => void } {
  const root = FlatmateCalloutLinks(props);
  const botAnchor = findElement(root, 'a') as ReactElement<{ onClick: () => void }> | undefined;
  const tracked = findElement(root, TrackedLink) as ReactElement<Parameters<typeof TrackedLink>[0]>;
  const link = TrackedLink(tracked.props) as ReactElement<{ onClick: (event: unknown) => void }>;
  return {
    bot: botAnchor?.props.onClick,
    roommate: () => link.props.onClick({}),
  };
}

describe('FlatmateCallout', () => {
  beforeEach(() => {
    capture.mockClear();
    namespaces.length = 0;
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', BOT);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('home in EN: the thesis h2, how, languages, the count, the bot button, the roommate link', async () => {
    const html = await render('home', COUNTS);
    expect(html).toMatch(/^<section aria-labelledby="flatmate-callout-home-title"/);
    expect(html).toMatch(
      /<h2 id="flatmate-callout-home-title"[^>]*>Passflat helps people in Warsaw/,
    );
    expect(text(html)).toBe(
      [
        'Passflat helps people in Warsaw find someone to rent with and see what it costs per person',
        'Create a profile in the Passflat bot on Telegram: district, budget per person, move-in month. Contacts appear only when the interest is mutual.',
        'The bot speaks English, Russian and Ukrainian.',
        '7 people in Warsaw already have a profile.',
        'Open the bot in Telegram',
        'See the figures per person and the profiles',
      ].join(' '),
    );
    expect(anchors(html)).toEqual([
      {
        href: `https://t.me/${BOT}?start=mate_web_home`,
        target: '_blank',
        rel: 'noopener noreferrer',
        label: 'Open the bot in Telegram',
      },
      {
        href: '/warsaw/roommate',
        target: undefined,
        rel: undefined,
        label: 'See the figures per person and the profiles',
      },
    ]);
  });

  it.each(FLATMATE_SURFACES.filter((surface) => surface !== 'home'))(
    '%s: the question as h2, its own heading id and bot payload',
    async (surface) => {
      const html = await render(surface);
      expect(html).toContain(`aria-labelledby="flatmate-callout-${surface}-title"`);
      expect(html).toMatch(
        new RegExp(
          `<h2 id="flatmate-callout-${surface}-title"[^>]*>Looking for someone to rent with in Warsaw\\?</h2>`,
        ),
      );
      expect(anchors(html).map((anchor) => anchor.href)).toEqual([
        `https://t.me/${BOT}?start=mate_web_${surface}`,
        FLATMATE_CALLOUT_ROOMMATE_PATH,
      ]);
    },
  );

  it.each(LOCALES)('%s: every text comes from its key', async (locale) => {
    const home = text(await render('home', COUNTS, locale));
    const other = text(await render('guide', { status: 'counts', total: 0, top: [] }, locale));
    for (const key of [
      'listings.flatmateCallout.homeTitle',
      'listings.findFlatmate.how',
      'listings.findFlatmate.languages',
      'listings.findFlatmate.button',
      'listings.flatmateCallout.roommateLink',
    ]) {
      expect(home).toContain(text(at(locale, key) ?? `missing ${key}`));
    }
    expect(other).toContain(text(at(locale, 'listings.flatmateCallout.title') ?? 'missing'));
    expect(other).toContain(text(at(locale, 'listings.findFlatmate.first') ?? 'missing'));
    expect(other).not.toContain(
      text(at(locale, 'listings.flatmateCallout.homeTitle') ?? 'missing'),
    );
  });

  it('the count line: a number, "be among the first" at 0, nothing when unavailable or absent', async () => {
    expect(text(await render('hub', COUNTS))).toContain(
      '7 people in Warsaw already have a profile.',
    );
    const zero = text(await render('hub', { status: 'counts', total: 0, top: [] }));
    expect(zero).toContain('Be among the first.');
    expect(zero).not.toMatch(/\d/);
    for (const counts of [{ status: 'unavailable' } as const, undefined]) {
      const none = text(await render('hub', counts));
      expect(none).not.toContain('already ha');
      expect(none).not.toContain('Be among the first');
    }
  });

  it('without the username: never empty, the roommate link stays, no bot button', async () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', '');
    const html = await render('home', COUNTS);
    expect(html).toMatch(/^<section /);
    expect(text(html)).toContain('Passflat helps people in Warsaw');
    expect(text(html)).not.toContain('Open the bot in Telegram');
    expect(html).not.toContain('t.me');
    expect(anchors(html)).toEqual([
      {
        href: '/warsaw/roommate',
        target: undefined,
        rel: undefined,
        label: 'See the figures per person and the profiles',
      },
    ]);
    expect((await linksOf('home')).bot).toBeUndefined();
  });

  it('reads only the listings namespace on the server; the client links get string labels', async () => {
    const props = await linksOf('calculator');
    expect(namespaces).toEqual(['listings']);
    expect(props).toEqual({
      surface: 'calculator',
      placement: 'flatmate_callout_calculator',
      roommateLabel: 'See the figures per person and the profiles',
      bot: {
        href: `https://t.me/${BOT}?start=mate_web_calculator`,
        label: 'Open the bot in Telegram',
      },
    });
    // The links file imports no translation hook at all.
    const source = readFileSync(
      join(process.cwd(), 'src/components/roommate/flatmate-callout-links.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/from 'next-intl/);
  });

  describe.each(FLATMATE_SURFACES)('clicks on %s', (surface) => {
    it('the roommate link captures exactly cta_click {placement: flatmate_callout_<surface>}', async () => {
      clickHandlers(await linksOf(surface)).roommate();
      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture).toHaveBeenCalledWith('cta_click', {
        placement: `flatmate_callout_${surface}`,
      });
    });

    it('the bot button captures exactly telegram_bot_opened {source: <surface>, no building}', async () => {
      const { bot } = clickHandlers(await linksOf(surface));
      expect(capture).not.toHaveBeenCalled();
      bot?.();
      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture).toHaveBeenCalledWith('telegram_bot_opened', {
        source: surface,
        has_building_context: false,
      });
    });
  });
});
