import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlatmateBlockCounts } from '@/lib/roommate/flatmate-block';

// PRD 4 FR-11 (spec 08 §Callout placements): the city hub shows the flatmate callout under its
// buttons row, with the profile count from `loadFlatmateBlockCounts()`; a rejected load renders
// the callout without a count line, and the hub stays ISR.

const PAGE_SOURCE = readFileSync(join(process.cwd(), 'src/app/[locale]/[city]/page.tsx'), 'utf8');
const en = JSON.parse(
  readFileSync(join(process.cwd(), 'src/i18n/messages/en.json'), 'utf8'),
) as Record<string, Record<string, string>>;

const { loadFlatmateBlockCounts, loadWarsawPerPersonSplit } = vi.hoisted(() => ({
  loadFlatmateBlockCounts: vi.fn(),
  loadWarsawPerPersonSplit: vi.fn(),
}));

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: {
      findUnique: async () => ({ id: 'city-1', slug: 'warsaw', nameKey: 'city.warsaw' }),
    },
  },
}));
vi.mock('@/lib/cost-figures-query', () => ({
  loadDistrictFigures: async () => [],
  loadCityFigure: async () => null,
}));
vi.mock('@/lib/roommate/website-counts', () => ({ loadFlatmateBlockCounts }));
vi.mock('@/lib/roommate/room-costs', () => ({ loadWarsawPerPersonSplit }));
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  return {
    setRequestLocale: vi.fn(),
    getLocale: async () => 'en',
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
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));
vi.mock('@/components/landing/footer', () => ({ Footer: () => null }));
vi.mock('@/components/costs/share-button', () => ({ ShareButton: () => null }));

import { ShareButton } from '@/components/costs/share-button';
import { FlatmateCallout } from '@/components/roommate/flatmate-callout';

import CityCostsHub, { revalidate } from './page';

const COUNTS: FlatmateBlockCounts = { status: 'counts', total: 7, top: [] };

/** Every element under `node`, in document order. */
function elements(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  out.push(node);
  return elements((node.props as { children?: ReactNode }).children, out);
}

async function hub(): Promise<ReactElement[]> {
  const page = (await CityCostsHub({
    params: Promise.resolve({ locale: 'en', city: 'warsaw' }),
  })) as ReactElement;
  return elements(page);
}

async function renderCallout(all: ReactElement[]): Promise<string> {
  const callout = all.find((element) => element.type === FlatmateCallout) as ReactElement<
    Parameters<typeof FlatmateCallout>[0]
  >;
  return renderToStaticMarkup(await FlatmateCallout(callout.props));
}

describe('city hub flatmate callout (FR-11)', () => {
  beforeEach(() => {
    loadFlatmateBlockCounts.mockReset();
    loadWarsawPerPersonSplit.mockReset();
    loadWarsawPerPersonSplit.mockResolvedValue(null);
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
  });

  it('sits under the buttons row and above the districts heading, once, with the counts', async () => {
    loadFlatmateBlockCounts.mockResolvedValue(COUNTS);
    const all = await hub();
    const callouts = all.filter((element) => element.type === FlatmateCallout);
    expect(callouts).toHaveLength(1);
    expect(callouts[0].props).toEqual({
      surface: 'hub',
      counts: COUNTS,
      split: null,
      splitArea: undefined,
    });
    expect(loadFlatmateBlockCounts).toHaveBeenCalledTimes(1);
    expect(loadWarsawPerPersonSplit).toHaveBeenCalledTimes(1);

    const share = all.findIndex((element) => element.type === ShareButton);
    const callout = all.indexOf(callouts[0]);
    const districtsHeading = all.findIndex(
      (element) =>
        element.type === 'h2' &&
        (element.props as { children?: ReactNode }).children === en.costsSeo.districtsHeading,
    );
    expect(share).toBeGreaterThan(-1);
    expect(districtsHeading).toBeGreaterThan(-1);
    expect(share).toBeLessThan(callout);
    expect(callout).toBeLessThan(districtsHeading);
  });

  it('counts resolved: the question, the count line, the roommate link and the bot button', async () => {
    loadFlatmateBlockCounts.mockResolvedValue(COUNTS);
    const html = await renderCallout(await hub());
    expect(html).toMatch(/^<section aria-labelledby="flatmate-callout-hub-title"/);
    expect(html).toContain('Looking for someone to rent with in Warsaw?');
    expect(html).toContain('7 people in Warsaw already have a profile.');
    expect(html).toContain('href="/warsaw/roommate"');
    expect(html).toContain('https://t.me/passflat_test_bot?start=mate_web_hub');
  });

  it('a rejected counts load → the callout without a count line; the page still renders', async () => {
    loadFlatmateBlockCounts.mockRejectedValue(new Error('db down'));
    const all = await hub();
    const callout = all.find((element) => element.type === FlatmateCallout);
    expect(callout?.props).toEqual({
      surface: 'hub',
      counts: undefined,
      split: null,
      splitArea: undefined,
    });

    const html = await renderCallout(all);
    expect(html).toMatch(/^<section /);
    expect(html).not.toContain('already ha');
    expect(html).not.toContain('Be among the first');
    expect(html).toContain('href="/warsaw/roommate"');
  });

  it('counts unavailable (database error caught in the loader) → no count line', async () => {
    loadFlatmateBlockCounts.mockResolvedValue({ status: 'unavailable' });
    const html = await renderCallout(await hub());
    expect(html).not.toContain('already ha');
    expect(html).not.toContain('Be among the first');
  });

  it('the per-person line (spec 08 §Per-person line): the split in the parallel load, its area named on the server', async () => {
    loadFlatmateBlockCounts.mockResolvedValue(COUNTS);
    loadWarsawPerPersonSplit.mockResolvedValue({
      value: 2_450,
      n: 5,
      level: 'city',
      name: 'city.warsaw',
    });
    const all = await hub();
    const callout = all.find((element) => element.type === FlatmateCallout);
    expect(callout?.props).toMatchObject({ surface: 'hub', splitArea: 'Warsaw' });
    const html = await renderCallout(all);
    expect(html).toContain(
      'For two people about 2,450 zł each (half of the median flat, 5 tenant reports, Warsaw).',
    );
    expect(html.match(/For two people/g)).toHaveLength(1);
    // The split joins the existing Promise.all, next to the counts.
    expect(PAGE_SOURCE).toMatch(
      /Promise\.all\(\[[\s\S]*loadFlatmateBlockCounts\(\)[\s\S]*loadWarsawPerPersonSplit\(\)[\s\S]*\]\)/,
    );
  });

  it('a rejected split → no per-person line; the page and its count still render', async () => {
    loadFlatmateBlockCounts.mockResolvedValue(COUNTS);
    loadWarsawPerPersonSplit.mockRejectedValue(new Error('db down'));
    const all = await hub();
    const callout = all.find((element) => element.type === FlatmateCallout);
    expect(callout?.props).toMatchObject({ split: null, splitArea: undefined });
    const html = await renderCallout(all);
    expect(html).not.toContain('For two people');
    expect(html).toContain('7 people in Warsaw already have a profile.');
  });

  it('the hub stays ISR: revalidate 3600, no request-time API', () => {
    expect(revalidate).toBe(3600);
    expect(PAGE_SOURCE).not.toMatch(/next\/headers|cookies\(|headers\(|force-dynamic/);
  });
});
