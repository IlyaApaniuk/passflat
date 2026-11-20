import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// PRD 4 FR-5, spec 08 §Header and footer entries: "Find a flatmate" leads the
// nav and the mobile pill; building reviews leave the header.

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as Record<string, Record<string, unknown>>,
  ]),
) as Record<Locale, Record<string, Record<string, unknown>>>;

const state = vi.hoisted(() => ({
  locale: 'en' as 'pl' | 'en' | 'ru' | 'uk',
  menuOpen: false,
  links: [] as { href: string; onClick?: () => void; children: import('react').ReactNode }[],
}));
const capture = vi.hoisted(() => vi.fn());

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    // The header's only `useState(false)` is the mobile menu: open it on demand.
    useState: (initial: unknown) =>
      initial === false ? [state.menuOpen, () => undefined] : actual.useState(initial),
  };
});
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
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
vi.mock('next/navigation', () => ({ useParams: () => ({ locale: state.locale }) }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    onClick,
    children,
  }: {
    href: string;
    onClick?: () => void;
    children: ReactNode;
  }) => {
    state.links.push({ href, onClick, children });
    return createElement('a', { href }, children);
  },
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/',
}));
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture }) }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signOut: async () => ({}),
    },
  }),
}));
vi.mock('@/app/[locale]/auth/actions', () => ({ signOut: vi.fn() }));
vi.mock('@/hooks/use-unread-count', () => ({ useUnreadCount: () => ({ unreadCount: 0 }) }));

import { Header } from './header';

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function render(menuOpen: boolean) {
  state.menuOpen = menuOpen;
  state.links = [];
  return renderToStaticMarkup(createElement(Header));
}

/** Every `<nav>` of the header as its `[href, label]` pairs, in order. */
function navs(html: string): [string, string][][] {
  return [...html.matchAll(/<nav[^>]*>([\s\S]*?)<\/nav>/g)].map(([, body]) =>
    [...body.matchAll(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(
      ([, href, label]) => [href, text(label)] as [string, string],
    ),
  );
}

function expectedNav(locale: Locale): [string, string][] {
  const { common, costs } = messages[locale];
  return [
    ['/warsaw/roommate', common.findFlatmate as string],
    ['/warsaw/costs', (costs as { title: string }).title],
    ['/warsaw/check', common.checkAddress as string],
  ];
}

describe('Header entries (PRD 4 FR-5)', () => {
  beforeEach(() => {
    state.locale = 'en';
    capture.mockClear();
  });

  it('lists Find a flatmate, the costs page and Check an address in the desktop nav', () => {
    const [desktop, ...rest] = navs(render(false));
    expect(rest).toEqual([]);
    expect(desktop).toEqual([
      ['/warsaw/roommate', 'Find a flatmate'],
      ['/warsaw/costs', 'Cost Transparency'],
      ['/warsaw/check', 'Check an address'],
    ]);
  });

  it('gives the mobile menu the same three items in the same order, in every locale', () => {
    for (const locale of LOCALES) {
      state.locale = locale;
      const all = navs(render(true));
      expect(all, locale).toHaveLength(2);
      const [desktop, mobile] = all;
      expect(desktop, locale).toEqual(expectedNav(locale));
      expect(mobile, locale).toEqual(desktop);
    }
  });

  it('no longer links building reviews anywhere in the header', () => {
    for (const menuOpen of [false, true]) {
      const html = render(menuOpen);
      expect(html).not.toContain('/warsaw/review');
      expect(text(html)).not.toContain('Building reviews');
    }
  });

  it('points the mobile pill to the roommate page with the findFlatmate label', () => {
    for (const locale of LOCALES) {
      state.locale = locale;
      render(false);
      // With the menu closed the pill is the only header link with a click handler.
      const pills = state.links.filter((link) => link.onClick);
      expect(
        pills.map((link) => link.href),
        locale,
      ).toEqual(['/warsaw/roommate']);
      expect(
        text(renderToStaticMarkup(createElement('div', null, pills[0].children))),
        locale,
      ).toBe(messages[locale].common.findFlatmate);
    }
  });

  // T120 measured 320 - 412px in a temporary Playwright run: with the wordmark,
  // the PL and UK pills pushed the hamburger out of the bar below about 400px.
  it('hides the wordmark visually below 410px so the long PL and UK pills fit', () => {
    const html = render(false);
    // Still in the markup: the logo link keeps its accessible name.
    expect(html).toMatch(/<span class="[^"]*max-\[410px\]:sr-only[^"]*">Passflat<\/span>/);
  });

  it("keeps the pill's cta_click {placement: 'header_mobile'}", () => {
    render(false);
    const [pill] = state.links.filter((link) => link.onClick);
    pill.onClick?.();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('cta_click', { placement: 'header_mobile' });
  });

  it('sends no event from the mobile menu links (they only close the menu)', () => {
    render(true);
    // In render order: the pill, then the three menu links (auth is still loading).
    const clickable = state.links.filter((link) => link.onClick);
    expect(clickable.map((link) => link.href)).toEqual([
      '/warsaw/roommate',
      '/warsaw/roommate',
      '/warsaw/costs',
      '/warsaw/check',
    ]);
    for (const link of clickable.slice(1)) link.onClick?.();
    expect(capture).not.toHaveBeenCalled();
  });
});

describe('Header copy keys', () => {
  it('drops common.costsShort, whose only reader was the old pill', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/landing/header.tsx'), 'utf8');
    expect(source).not.toContain('costsShort');
    for (const locale of LOCALES) {
      expect(messages[locale].common, locale).not.toHaveProperty('costsShort');
    }
  });
});
