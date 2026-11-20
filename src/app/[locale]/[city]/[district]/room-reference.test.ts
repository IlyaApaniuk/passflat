import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlatmateBlockCounts } from '@/lib/roommate/flatmate-block';
import {
  findCity,
  findDistrict,
  findReports,
  GOLDEN_REPORTS,
  type FixtureReport,
} from '@/lib/roommate/room-costs-fixture.test-support';

// PRD 4 FR-27 (spec 09 §District section): the district page's room cost reference and the
// callout's per-person line, through the real page and the real figure loaders over one Prisma
// mock (spec 06's golden case). The page reads `loadRoomCostAreas(city, [district])[0]`, the
// bot's loader for a profile naming the district, so the consistency test compares the page's
// figures with `roomCostsReply`'s for the same fixture: median and N per group, and the split.

const en = JSON.parse(
  readFileSync(join(process.cwd(), 'src/i18n/messages/en.json'), 'utf8'),
) as Record<string, Record<string, string>>;

const h = vi.hoisted(() => ({
  reports: [] as FixtureReport[],
  cityFindUnique: vi.fn(),
  costReportFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: { findUnique: h.cityFindUnique },
    district: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => findDistrict(where.id)),
    },
    costReport: { findMany: h.costReportFindMany },
  },
}));
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock('@/lib/cost-aggregates', () => ({ getBuildingsData: async () => [] }));
vi.mock('@/lib/cost-figures-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cost-figures-query')>()),
  loadDistrictFigures: async () => [],
}));
vi.mock('@/lib/roommate/website-counts', () => ({
  loadFlatmateBlockCounts: async (): Promise<FlatmateBlockCounts> => ({
    status: 'counts',
    total: 5,
    top: [{ slug: 'mokotow', count: 2 }],
    byDistrict: { mokotow: 2 },
  }),
}));
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
// `AreaReferenceGroups` (a client component) reads the root translator over the layout's
// shared namespaces (`costs`).
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: () =>
      actual.createTranslator({
        locale: 'en',
        messages: { costs: en.costs } as never,
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

import { AreaReferenceGroups } from '@/components/buildings/figure-group-block';
import { FlatmateCallout } from '@/components/roommate/flatmate-callout';
import { groupFigureRows } from '@/lib/building-figures-view';
import { roomCostsReply } from '@/lib/bot/roommate-room-costs';
import type { AreaReference } from '@/lib/cost-figures';

import DistrictCostsPage from './page';

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

type Props = { children?: ReactNode; 'aria-labelledby'?: string };
type GroupsProps = Parameters<typeof AreaReferenceGroups>[0];
type CalloutProps = Parameters<typeof FlatmateCallout>[0];

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The real page for `district`, its roommate section's elements and the rendered parts. */
async function districtSection(district: string) {
  const page = (await DistrictCostsPage({
    params: Promise.resolve({ locale: 'en', city: 'warsaw', district }),
  })) as ReactElement;
  const all = elements(page);
  const sections = all.filter(
    (element) =>
      element.type === 'section' &&
      (element.props as Props)['aria-labelledby'] === 'district-roommate-title',
  );
  expect(sections).toHaveLength(1);
  const inside = elements((sections[0].props as Props).children);
  const groups = inside.filter((element) => element.type === AreaReferenceGroups) as Array<
    ReactElement<GroupsProps>
  >;
  const callouts = all.filter((element) => element.type === FlatmateCallout) as Array<
    ReactElement<CalloutProps>
  >;
  expect(callouts).toHaveLength(1);
  const calloutHtml = renderToStaticMarkup(await FlatmateCallout(callouts[0].props));
  return {
    inside,
    paragraphs: inside
      .filter((element) => element.type === 'p')
      .map((element) => String((element.props as Props).children)),
    groups,
    groupsText: groups[0]
      ? text(renderToStaticMarkup(createElement(AreaReferenceGroups, groups[0].props)))
      : null,
    callout: callouts[0].props,
    calloutText: text(calloutHtml),
  };
}

const PER_PERSON =
  /For two people about ([\d\s,]+) zł each \(half of the median flat, (\d+) tenant reports, ([^)]+)\)\./;

/** The page's figures: median and N of each group's headline, and the per-person line. */
function pageFigures(section: Awaited<ReturnType<typeof districtSection>>) {
  const reference = section.groups[0]?.props.reference as AreaReference | undefined;
  const headline = (key: 'tenant' | 'asking') => {
    const group = reference?.summary.groups[key];
    const row = group ? groupFigureRows(group).headline : null;
    return row && { median: row.figure.median, n: row.figure.n };
  };
  const line = PER_PERSON.exec(section.calloutText);
  return {
    tenant: headline('tenant'),
    asking: headline('asking'),
    split: line && {
      value: Number(line[1].replace(/[\s,]/g, '')),
      count: Number(line[2]),
      area: line[3],
    },
  };
}

/** The bot's figures for a profile naming `district` (EN), parsed back from its lines. */
async function botFigures(district: string) {
  const reply = await roomCostsReply({ districtSlugs: [district], anyDistrict: false }, 'en');
  expect(reply).not.toBeNull();
  const group = (pattern: RegExp) => {
    const match = pattern.exec(reply ?? '');
    return match && { median: Number(match[1].replace(/\s/g, '')), n: Number(match[2]) };
  };
  const split =
    /For two people about ([\d\s]+)\szł each \(half of the median flat, (\d+) tenant reports, ([^)]+)\)\./.exec(
      reply ?? '',
    );
  return {
    reply: reply ?? '',
    tenant: group(
      /tenant reports, [^:]+: <b>([\d\s]+)\szł<\/b> <i>\(median of (\d+) reports?\)<\/i>/,
    ),
    asking: group(
      /asking prices from listings, [^:]+: <b>([\d\s]+)\szł<\/b> <i>\(median of (\d+) listings?\)<\/i>/,
    ),
    split: split && {
      value: Number(split[1].replace(/\s/g, '')),
      count: Number(split[2]),
      area: split[3],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
  h.reports = GOLDEN_REPORTS;
  h.cityFindUnique.mockImplementation(async () => findCity());
  h.costReportFindMany.mockImplementation(
    async ({ where }: { where: Parameters<typeof findReports>[1] }) =>
      findReports(h.reports, where),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('district page room reference and per-person line (FR-27)', () => {
  it('getCity selects the districts with id, slug and nameKey; the room and flat loads are the district’s', async () => {
    await districtSection('mokotow');
    expect(h.cityFindUnique).toHaveBeenCalledWith({
      where: { slug: 'warsaw' },
      select: {
        id: true,
        slug: true,
        nameKey: true,
        districts: { select: { id: true, slug: true, nameKey: true } },
      },
    });
    const wheres = h.costReportFindMany.mock.calls.map(
      ([args]) => (args as { where: unknown }).where,
    );
    expect(wheres).toContainEqual({
      building: { districtId: 'd-mok' },
      isVisible: true,
      rentalType: 'room',
    });
    expect(wheres).toContainEqual({
      building: { districtId: 'd-mok' },
      isVisible: true,
      rentalType: 'apartment',
      rooms: { gte: 2 },
    });
  });

  it('Mokotów (PRD 4 §5 example 5): count line, lead-in, both groups with N, then the callout with the district split once', async () => {
    const section = await districtSection('mokotow');
    expect(section.paragraphs).toEqual([
      'Mokotów: 2 people with a profile name this district.',
      'Rooms: tenant reports and asking prices',
    ]);
    expect(section.groups).toHaveLength(1);
    expect(section.groups[0].props.area).toBe('Mokotów');
    expect(section.groups[0].props.oneObservationLabel).toBe(
      'One observation in the Mokotów district',
    );
    expect(section.groupsText).toContain('Reference: tenant reports in Mokotów (2)');
    expect(section.groupsText).toContain('≈ 1,700 PLN');
    expect(section.groupsText).toContain('Reference: asking prices from listings in Mokotów (5)');
    expect(section.groupsText).toContain('≈ 1,550 PLN');

    // Order: the count line, the room lines, then the callout.
    const order = section.inside.map((element) => element.type);
    expect(order.indexOf(AreaReferenceGroups)).toBeGreaterThan(order.indexOf('p'));
    expect(order.indexOf(FlatmateCallout)).toBeGreaterThan(order.indexOf(AreaReferenceGroups));

    expect(section.callout).toMatchObject({
      surface: 'district',
      split: { value: 2_450, n: 5, level: 'district', name: 'Mokotów' },
      splitArea: 'Mokotów',
    });
    const lines = section.calloutText.match(new RegExp(PER_PERSON.source, 'g')) ?? [];
    expect(lines).toEqual([
      'For two people about 2,450 zł each (half of the median flat, 5 tenant reports, Mokotów).',
    ]);
    expect(pageFigures(section).split).toEqual({ value: 2_450, count: 5, area: 'Mokotów' });
  });

  it('Wesoła: the city fallback line, the Warsaw groups, and the split named Warsaw', async () => {
    const section = await districtSection('wesola');
    expect(section.paragraphs).toContain('Wesoła has fewer than 5 room reports; Warsaw:');
    expect(section.groups[0].props.area).toBe('Warsaw');
    expect(section.groups[0].props.oneObservationLabel).toBe('One observation in Warsaw');
    expect(section.groupsText).toContain('Reference: tenant reports in Warsaw (3)');
    expect(section.callout.splitArea).toBe('Warsaw');
    expect(section.calloutText).toContain('5 tenant reports, Warsaw).');
  });

  it('a district without any report in the city: no figure lines and no per-person line', async () => {
    h.reports = [];
    const section = await districtSection('wola');
    expect(section.groups).toHaveLength(0);
    expect(section.paragraphs).toEqual([
      'Wola: nobody has named this district yet — be the first.',
    ]);
    expect(section.callout.split).toBeNull();
    expect(section.calloutText).not.toMatch(/For two people/);
  });

  it('a rejected room load: the section renders without figure lines and without the split, logging only the message', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.costReportFindMany.mockRejectedValue(new Error('db down'));
    const section = await districtSection('mokotow');
    expect(section.groups).toHaveLength(0);
    expect(section.paragraphs).toEqual(['Mokotów: 2 people with a profile name this district.']);
    expect(section.callout.split).toBeNull();
    expect(section.calloutText).not.toMatch(/For two people/);
    expect(error).toHaveBeenCalledWith('[district] room costs failed', 'db down');
  });
});

describe('the page and the bot agree (one loader, no second aggregation)', () => {
  it.each(['mokotow', 'wesola'])(
    '%s: the same median and N per group and the same split as roomCostsReply',
    async (district) => {
      const page = pageFigures(await districtSection(district));
      const bot = await botFigures(district);
      expect(page.tenant).not.toBeNull();
      expect(page.tenant).toEqual(bot.tenant);
      expect(page.asking).toEqual(bot.asking);
      expect(page.split).toEqual(bot.split);
    },
  );

  it('Mokotów: both say tenant 1,700 (2), asking 1,550 (5), 2,450 for two (5, Mokotów)', async () => {
    const bot = await botFigures('mokotow');
    expect(bot.tenant).toEqual({ median: 1_700, n: 2 });
    expect(bot.asking).toEqual({ median: 1_550, n: 5 });
    expect(bot.split).toEqual({ value: 2_450, count: 5, area: 'Mokotów' });
    expect(pageFigures(await districtSection('mokotow'))).toEqual({
      tenant: bot.tenant,
      asking: bot.asking,
      split: bot.split,
    });
  });
});
