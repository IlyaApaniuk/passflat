import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// PRD 4 FR-12 (spec 08 §Callout placements): the calculator shows the flatmate callout under the
// result buttons. The server page renders it without counts (no counts on the calculator,
// Assumption) and hands it to the client as a ReactNode prop; the scoped provider stays
// `calculator`, `common`, `share`, because the callout's client links take their labels as props.

const DIR = join(process.cwd(), 'src/app/[locale]/[city]/calculator');
const CLIENT_SOURCE = readFileSync(join(DIR, 'client.tsx'), 'utf8');
const PAGE_SOURCE = readFileSync(join(DIR, 'page.tsx'), 'utf8');
const en = JSON.parse(
  readFileSync(join(process.cwd(), 'src/i18n/messages/en.json'), 'utf8'),
) as Record<string, Record<string, unknown>>;
const SCOPED_NAMESPACES = ['calculator', 'common', 'share'];

const { loadFlatmateBlockCounts, clientMessages } = vi.hoisted(() => ({
  loadFlatmateBlockCounts: vi.fn(),
  /** What the client tree's `useTranslations` reads: the scoped provider's messages. */
  clientMessages: { current: {} as Record<string, unknown> },
}));

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: {
      findUnique: async () => ({
        id: 'city-1',
        slug: 'warsaw',
        nameKey: 'city.warsaw',
        districts: [{ slug: 'mokotow', nameKey: 'Mokotów' }],
      }),
    },
  },
}));
vi.mock('@/lib/cost-figures-query', () => ({
  loadDistrictFigures: async () => [],
  loadCityFigure: async () => null,
}));
vi.mock('@/lib/roommate/website-counts', () => ({ loadFlatmateBlockCounts }));
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  return {
    setRequestLocale: vi.fn(),
    getLocale: async () => 'en',
    getMessages: async () => en,
    getTranslations: async (namespace?: string) =>
      createTranslator({
        locale: 'en',
        messages: en as never,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      }),
  };
});
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useLocale: () => 'en',
    // Client components see only the scoped provider's namespaces; a missing key throws.
    useTranslations: (namespace?: string) =>
      actual.createTranslator({
        locale: 'en',
        messages: clientMessages.current as never,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      }),
  };
});
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));
vi.mock('@/components/landing/footer', () => ({ Footer: () => null }));
vi.mock('@/components/costs/share-button', () => ({
  ShareButton: () => createElement('button', { 'data-share': 'calculator' }),
}));

import { FlatmateCallout } from '@/components/roommate/flatmate-callout';

import { CalculatorClient } from './client';
import CalculatorPage, { revalidate } from './page';

type ClientProps = Parameters<typeof CalculatorClient>[0];

function findElement(
  node: ReactNode,
  match: (element: ReactElement) => boolean,
): ReactElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, match);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  if (match(node)) return node;
  return findElement((node.props as { children?: ReactNode }).children, match);
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

async function page(): Promise<ReactElement> {
  return (await CalculatorPage({
    params: Promise.resolve({ locale: 'en', city: 'warsaw' }),
    searchParams: Promise.resolve({}),
  })) as ReactElement;
}

async function providerAndClient() {
  const tree = await page();
  const provider = findElement(tree, (element) => element.type === NextIntlClientProvider);
  expect(provider).toBeDefined();
  const client = findElement(
    (provider!.props as { children?: ReactNode }).children,
    (element) => element.type === CalculatorClient,
  );
  expect(client).toBeDefined();
  return {
    messages: (provider!.props as { messages: Record<string, unknown> }).messages,
    client: client as ReactElement<ClientProps>,
  };
}

describe('calculator client: the callout slot (static scan)', () => {
  it('places the flatmateCallout prop once', () => {
    expect(CLIENT_SOURCE.split('{flatmateCallout}').length - 1).toBe(1);
  });

  it('does not import the async server callout (a client module cannot)', () => {
    expect(CLIENT_SOURCE).not.toContain('roommate/flatmate-callout');
  });
});

describe('calculator server page → FlatmateCallout surface="calculator"', () => {
  beforeEach(() => {
    loadFlatmateBlockCounts.mockReset();
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
  });

  it('passes the callout as a ReactNode prop, without counts, and loads no counts', async () => {
    const { client } = await providerAndClient();
    const callout = client.props.flatmateCallout;
    expect(isValidElement(callout)).toBe(true);
    expect((callout as ReactElement).type).toBe(FlatmateCallout);
    expect((callout as ReactElement).props).toEqual({ surface: 'calculator' });
    expect(loadFlatmateBlockCounts).not.toHaveBeenCalled();
  });

  it('the scoped provider is unchanged: calculator, common, share', async () => {
    const { messages } = await providerAndClient();
    expect(Object.keys(messages)).toEqual(SCOPED_NAMESPACES);
    expect(PAGE_SOURCE).toContain("pickMessages(messages, ['calculator', 'common', 'share'])");
  });

  it('renders the question, no count line, the roommate link and the bot button', async () => {
    const { client } = await providerAndClient();
    const callout = client.props.flatmateCallout as ReactElement<
      Parameters<typeof FlatmateCallout>[0]
    >;
    const html = renderToStaticMarkup(await FlatmateCallout(callout.props));
    expect(html).toMatch(/^<section aria-labelledby="flatmate-callout-calculator-title"/);
    expect(text(html)).toContain('Looking for someone to rent with in Warsaw?');
    expect(html).not.toContain('already ha');
    expect(html).not.toContain('Be among the first');
    expect(html).toContain('href="/warsaw/roommate"');
    expect(html).toContain('https://t.me/passflat_test_bot?start=mate_web_calculator');
  });

  it('the whole client tree, callout included, renders with only the scoped namespaces, the callout under the result buttons', async () => {
    const { messages, client } = await providerAndClient();
    clientMessages.current = messages;
    const callout = client.props.flatmateCallout as ReactElement<
      Parameters<typeof FlatmateCallout>[0]
    >;
    const rendered = await FlatmateCallout(callout.props);
    const html = renderToStaticMarkup(
      createElement(CalculatorClient, { ...client.props, flatmateCallout: rendered }),
    );

    const section = html.indexOf('<section aria-labelledby="flatmate-callout-calculator-title"');
    expect(section).toBeGreaterThan(-1);
    expect(html.split('flatmate-callout-calculator-title').length - 1).toBe(2); // section + h2
    const seeData = html.indexOf('href="/warsaw/costs"');
    const submit = html.indexOf('href="/warsaw/costs/submit"');
    const share = html.indexOf('data-share="calculator"');
    const sources = html.indexOf((en.calculator.sourcesNote as string).slice(0, 20));
    for (const index of [seeData, submit, share, sources]) {
      expect(index).toBeGreaterThan(-1);
      expect(index).toBeLessThan(section);
    }
    expect(html).toContain('https://t.me/passflat_test_bot?start=mate_web_calculator');
  });

  it('the calculator stays ISR: revalidate 3600, no request-time API', () => {
    expect(revalidate).toBe(3600);
    expect(PAGE_SOURCE).not.toMatch(/next\/headers|cookies\(|headers\(|force-dynamic/);
  });
});
