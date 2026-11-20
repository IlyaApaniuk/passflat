import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlatmateBlockCounts } from '@/lib/roommate/flatmate-block';

// PRD 4 FR-26 (spec 09 §District section): the district page's "Room and shared renting" section
// after the buttons row and before the buildings heading: the h2, the count line from the
// website's `byDistrict` (n, nobody yet, or none when unavailable) and the flatmate callout with
// the counts. A rejected counts load renders the section without a count line; the page stays ISR.

const PAGE_SOURCE = readFileSync(
  join(process.cwd(), 'src/app/[locale]/[city]/[district]/page.tsx'),
  'utf8',
);
const en = JSON.parse(
  readFileSync(join(process.cwd(), 'src/i18n/messages/en.json'), 'utf8'),
) as Record<string, Record<string, string>>;

const { loadFlatmateBlockCounts } = vi.hoisted(() => ({ loadFlatmateBlockCounts: vi.fn() }));

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: {
      findUnique: async () => ({
        id: 'city-1',
        slug: 'warsaw',
        nameKey: 'city.warsaw',
        districts: [
          { id: 'd-mok', slug: 'mokotow', nameKey: 'Mokotów' },
          { id: 'd-waw', slug: 'wawer', nameKey: 'Wawer' },
        ],
      }),
    },
  },
}));
vi.mock('@/lib/cost-aggregates', () => ({ getBuildingsData: async () => [] }));
vi.mock('@/lib/cost-figures-query', () => ({ loadDistrictFigures: async () => [] }));
vi.mock('@/lib/roommate/website-counts', () => ({ loadFlatmateBlockCounts }));
// The room lines and the split (FR-27) are `room-reference.test.ts`; here no room figures.
vi.mock('@/lib/roommate/room-costs', () => ({ loadRoomCostAreas: async () => [] }));
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

import DistrictCostsPage, { revalidate } from './page';

/** PRD 4 §5 example 4 as the loader returns it. */
const EXAMPLE_4: FlatmateBlockCounts = {
  status: 'counts',
  total: 5,
  top: [
    { slug: 'mokotow', count: 2 },
    { slug: 'ochota', count: 2 },
    { slug: 'wola', count: 1 },
  ],
  byDistrict: { mokotow: 2, ochota: 2, wola: 1 },
};

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

async function districtPage(district: string): Promise<ReactElement[]> {
  const page = (await DistrictCostsPage({
    params: Promise.resolve({ locale: 'en', city: 'warsaw', district }),
  })) as ReactElement;
  return elements(page);
}

type Props = { children?: ReactNode; id?: string; 'aria-labelledby'?: string };

function roommateSection(all: ReactElement[]): ReactElement<Props> {
  const sections = all.filter(
    (element) =>
      element.type === 'section' &&
      (element.props as Props)['aria-labelledby'] === 'district-roommate-title',
  );
  expect(sections).toHaveLength(1);
  return sections[0] as ReactElement<Props>;
}

/** The visible text of the section's own paragraphs (the callout is rendered separately). */
function paragraphs(section: ReactElement<Props>): string[] {
  return elements(section.props.children)
    .filter((element) => element.type === 'p')
    .map((element) => String((element.props as Props).children));
}

describe('district page roommate section (FR-26)', () => {
  beforeEach(() => {
    loadFlatmateBlockCounts.mockReset();
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
  });

  it('sits after the buttons row and before the buildings heading, with its h2 and the callout', async () => {
    loadFlatmateBlockCounts.mockResolvedValue(EXAMPLE_4);
    const all = await districtPage('mokotow');
    const section = roommateSection(all);

    const share = all.findIndex((element) => element.type === ShareButton);
    const buildingsHeading = all.findIndex(
      (element) =>
        element.type === 'h2' && (element.props as Props).children === 'Buildings — Mokotów',
    );
    expect(share).toBeGreaterThan(-1);
    expect(buildingsHeading).toBeGreaterThan(-1);
    expect(share).toBeLessThan(all.indexOf(section));
    expect(all.indexOf(section)).toBeLessThan(buildingsHeading);

    const inside = elements(section.props.children);
    const heading = inside.find((element) => element.type === 'h2') as ReactElement<Props>;
    expect(heading.props.id).toBe('district-roommate-title');
    expect(heading.props.children).toBe('Room and shared renting: Mokotów');
    expect(en.costsSeo.districtRoommateHeading).toBe('Room and shared renting: {district}');

    // Heading, then the count line, then the callout with the same counts.
    const callouts = inside.filter((element) => element.type === FlatmateCallout);
    expect(callouts).toHaveLength(1);
    expect(callouts[0].props).toEqual({ surface: 'district', counts: EXAMPLE_4, split: null });
    const order = inside.map((element) => element.type);
    expect(order.indexOf('h2')).toBeLessThan(order.indexOf('p'));
    expect(order.indexOf('p')).toBeLessThan(order.indexOf(FlatmateCallout));
    expect(all.filter((element) => element.type === FlatmateCallout)).toHaveLength(1);
    expect(loadFlatmateBlockCounts).toHaveBeenCalledTimes(1);
  });

  it('n > 0: "Mokotów: 2 people with a profile name this district." (the district count, not the total)', async () => {
    loadFlatmateBlockCounts.mockResolvedValue(EXAMPLE_4);
    const section = roommateSection(await districtPage('mokotow'));
    expect(paragraphs(section)).toEqual(['Mokotów: 2 people with a profile name this district.']);
  });

  it('nobody names the district: "Wawer: nobody has named this district yet — be the first."', async () => {
    loadFlatmateBlockCounts.mockResolvedValue(EXAMPLE_4);
    const section = roommateSection(await districtPage('wawer'));
    expect(paragraphs(section)).toEqual([
      'Wawer: nobody has named this district yet — be the first.',
    ]);
  });

  it('counts unavailable: the section and the callout without a count line', async () => {
    loadFlatmateBlockCounts.mockResolvedValue({ status: 'unavailable' });
    const section = roommateSection(await districtPage('mokotow'));
    expect(paragraphs(section)).toEqual([]);
    const callout = elements(section.props.children).find(
      (element) => element.type === FlatmateCallout,
    );
    expect(callout?.props).toEqual({
      surface: 'district',
      counts: { status: 'unavailable' },
      split: null,
    });
  });

  it('a rejected counts load: the page renders, the section has no count line, the callout no counts', async () => {
    loadFlatmateBlockCounts.mockRejectedValue(new Error('db down'));
    const section = roommateSection(await districtPage('mokotow'));
    expect(paragraphs(section)).toEqual([]);
    const callout = elements(section.props.children).find(
      (element) => element.type === FlatmateCallout,
    ) as ReactElement<Parameters<typeof FlatmateCallout>[0]>;
    expect(callout.props).toEqual({ surface: 'district', counts: undefined, split: null });

    const html = renderToStaticMarkup(await FlatmateCallout(callout.props));
    expect(html).toMatch(/^<section aria-labelledby="flatmate-callout-district-title"/);
    expect(html).not.toContain('already ha');
    expect(html).toContain('https://t.me/passflat_test_bot?start=mate_web_district');
  });

  it('the callout renders with the Warsaw total and the district payload', async () => {
    loadFlatmateBlockCounts.mockResolvedValue(EXAMPLE_4);
    const section = roommateSection(await districtPage('mokotow'));
    const callout = elements(section.props.children).find(
      (element) => element.type === FlatmateCallout,
    ) as ReactElement<Parameters<typeof FlatmateCallout>[0]>;
    const html = renderToStaticMarkup(await FlatmateCallout(callout.props));
    expect(html).toContain('5 people in Warsaw already have a profile.');
    expect(html).toContain('href="/warsaw/roommate"');
    expect(html).toContain('https://t.me/passflat_test_bot?start=mate_web_district');
  });

  it('the counts join the page Promise.all; the page stays ISR', () => {
    expect(PAGE_SOURCE).toMatch(
      /Promise\.all\(\[[\s\S]*loadDistrictFigures\([\s\S]*loadFlatmateBlockCounts\(\)\.catch\(\(\) => undefined\)[\s\S]*\]\)/,
    );
    expect(revalidate).toBe(3600);
    expect(PAGE_SOURCE).not.toMatch(/next\/headers|cookies\(|headers\(|force-dynamic/);
  });
});
