import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlatmateBlockCounts } from '@/lib/roommate/flatmate-block';

// PRD 4 FR-9 (spec 08 §Home thesis section): the flatmate callout with the thesis sentence sits
// between the hero and the address check, and its counts join the home page's allSettled.

const en = JSON.parse(
  readFileSync(join(process.cwd(), 'src/i18n/messages/en.json'), 'utf8'),
) as Record<string, unknown>;

const { loadFlatmateBlockCounts } = vi.hoisted(() => ({ loadFlatmateBlockCounts: vi.fn() }));

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  return {
    setRequestLocale: vi.fn(),
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
// Every other home loader fails, as in a database outage: the callout must not depend on them.
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/home-figures', () => ({
  loadFeaturedBuilding: vi.fn(async () => {
    throw new Error('db down');
  }),
  loadHomeCityFigure: vi.fn(async () => {
    throw new Error('db down');
  }),
  loadHomeDistrictFigures: vi.fn(async () => {
    throw new Error('db down');
  }),
}));
vi.mock('@/lib/roommate/website-counts', () => ({ loadFlatmateBlockCounts }));
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));
for (const [path, name] of [
  ['@/components/landing/hero', 'Hero'],
  ['@/components/landing/check-address', 'CheckAddress'],
  ['@/components/landing/districts', 'Districts'],
  ['@/components/landing/bento-grid', 'BentoGrid'],
  ['@/components/landing/tools', 'Tools'],
  ['@/components/landing/how-it-works', 'HowItWorks'],
  ['@/components/landing/cost-transparency', 'CostTransparency'],
  ['@/components/landing/for-whom', 'ForWhom'],
  ['@/components/landing/city-notify', 'CityNotify'],
  ['@/components/landing/faq', 'FAQ'],
  ['@/components/landing/footer', 'Footer'],
] as const) {
  vi.doMock(path, () => ({ [name]: () => null }));
}

const COUNTS: FlatmateBlockCounts = { status: 'counts', total: 7, top: [] };

/** The component types under `node` in document order, without rendering any of them. */
function componentOrder(node: ReactNode, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) {
    for (const child of node) componentOrder(child, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  if (typeof node.type !== 'string') out.push(node.type);
  return componentOrder((node.props as { children?: ReactNode }).children, out);
}

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

/** `Home` → `<Suspense><HomeContent /></Suspense>`; runs the async HomeContent once. */
async function homeContent(): Promise<ReactElement> {
  const { default: Home } = await import('./page');
  const suspense = (await Home({ params: Promise.resolve({ locale: 'en' }) })) as ReactElement<{
    children: ReactElement;
  }>;
  const content = suspense.props.children;
  return (content.type as () => Promise<ReactElement>)();
}

describe('home thesis section (FR-9)', () => {
  beforeEach(() => {
    loadFlatmateBlockCounts.mockReset();
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', '');
  });

  it('renders FlatmateCallout surface="home" between Hero and CheckAddress inside main', async () => {
    loadFlatmateBlockCounts.mockResolvedValue(COUNTS);
    const { Hero } = await import('@/components/landing/hero');
    const { CheckAddress } = await import('@/components/landing/check-address');
    const { FlatmateCallout } = await import('@/components/roommate/flatmate-callout');

    const main = findElement(await homeContent(), (element) => element.type === 'main');
    expect(main).toBeDefined();
    const order = componentOrder((main?.props as { children: ReactNode }).children);
    expect(order.slice(0, 3)).toEqual([Hero, FlatmateCallout, CheckAddress]);
    expect(order.filter((type) => type === FlatmateCallout)).toHaveLength(1);

    const callout = findElement(main, (element) => element.type === FlatmateCallout);
    expect(callout?.props).toEqual({ surface: 'home', counts: COUNTS });
    expect(loadFlatmateBlockCounts).toHaveBeenCalledTimes(1);
  });

  it('counts resolved: the thesis h2 and the count line', async () => {
    loadFlatmateBlockCounts.mockResolvedValue(COUNTS);
    const { FlatmateCallout } = await import('@/components/roommate/flatmate-callout');
    const callout = findElement(await homeContent(), (element) => element.type === FlatmateCallout);
    const html = renderToStaticMarkup(
      await FlatmateCallout(callout?.props as Parameters<typeof FlatmateCallout>[0]),
    );
    expect(html).toMatch(/<h2 [^>]*>Passflat helps people in Warsaw find someone to rent with/);
    expect(html).toContain('7 people in Warsaw already have a profile.');
  });

  it('a rejected counts loader → no count line; the section renders with the links only', async () => {
    loadFlatmateBlockCounts.mockRejectedValue(new Error('db down'));
    const { FlatmateCallout } = await import('@/components/roommate/flatmate-callout');
    const callout = findElement(await homeContent(), (element) => element.type === FlatmateCallout);
    expect(callout?.props).toEqual({ surface: 'home', counts: undefined });

    const html = renderToStaticMarkup(
      await FlatmateCallout(callout?.props as Parameters<typeof FlatmateCallout>[0]),
    );
    expect(html).toMatch(/^<section /);
    expect(html).not.toContain('already ha');
    expect(html).not.toContain('Be among the first');
    expect(html).toContain('href="/warsaw/roommate"');
    expect(html).not.toContain('t.me');
  });
});
