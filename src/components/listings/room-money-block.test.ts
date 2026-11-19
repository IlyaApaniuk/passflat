import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { summarizeFigures, type AreaReference, type FigureReport } from '@/lib/cost-figures';

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
// serves it (`listings` and `costs` are in SHARED_CLIENT_NAMESPACES).
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
vi.mock('@/i18n/navigation', async () => {
  const { createElement: h } = await import('react');
  return {
    Link: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
      h('a', { href, ...rest }, children),
  };
});

import { RoomMoneyBlock, type RoomMoneyFigures } from './room-money-block';

function report(source: string, total: number, complete = true): FigureReport {
  return { source, rentalType: 'room', totalMonthlyAvg: total, utilitiesComplete: complete };
}

/** Warsaw rooms: three tenant all-in totals (median 1,700) and five asking prices (known part, median 1,550). */
const WARSAW_ROOMS = [
  report('user', 1_600),
  report('import', 1_800),
  report('user', 1_700),
  ...[1_400, 1_500, 1_550, 1_700, 2_000].map((total) => report('scraped', total, false)),
];

function cityReference(reports: FigureReport[]): AreaReference {
  return {
    level: 'city',
    slug: 'warsaw',
    name: 'city.warsaw',
    summary: summarizeFigures(reports, { level: 'city', rentalType: 'room' }),
  };
}

const FIGURES: RoomMoneyFigures = { reference: cityReference(WARSAW_ROOMS), areaName: 'Warsaw' };

function html(figures: RoomMoneyFigures | null, locale: Locale = 'en'): string {
  state.locale = locale;
  return renderToStaticMarkup(createElement(RoomMoneyBlock, { figures, citySlug: 'warsaw' }));
}

function text(figures: RoomMoneyFigures | null, locale: Locale = 'en'): string {
  return html(figures, locale)
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

/** The rendered `<li>` items of the checklist, as text. */
function checklistItems(figures: RoomMoneyFigures | null, locale: Locale): string[] {
  const list = html(figures, locale).match(/<ul class="mt-1 list-disc[^"]*">(.*?)<\/ul>/)?.[1];
  return [...(list ?? '').matchAll(/<li>(.*?)<\/li>/g)].map((match) =>
    match[1].replace(/<[^>]+>/g, '').trim(),
  );
}

const OUT_LINKS = [
  'https://www.olx.pl/nieruchomosci/stancje-pokoje/warszawa/',
  'https://www.otodom.pl/pl/wyniki/wynajem/pokoj/mazowieckie/warszawa/warszawa/warszawa',
  'https://www.facebook.com/search/groups/?q=pokoje%20warszawa',
];

describe('RoomMoneyBlock (spec 02 §Room money block)', () => {
  beforeEach(() => {
    capture.mockClear();
    namespaces.length = 0;
  });

  it('renders the EN copy: title, the Warsaw room figures per group with N, checklist and links', () => {
    expect(text(FIGURES)).toBe(
      'Found a room? What it will cost you per person, and is it safe to pay the deposit? ' +
        'A room in Warsaw, per month: ' +
        'Reference: tenant reports in Warsaw (3) Typical Monthly Total ≈ 1,700 PLN 3 reports ' +
        'Reference: asking prices from listings in Warsaw (5) Known part of the costs ≈ 1,550 PLN 5 listings ' +
        'Not all utilities were listed, so the full monthly cost may be higher ' +
        'Before you pay: See the room in person before you pay anything. ' +
        'Never pay a “reservation” before a viewing and a signed contract. ' +
        'Ask what the price includes: czynsz and media (utilities). ' +
        'At move-in, ask for a handover protocol (protokół zdawczo-odbiorczy). ' +
        'Check the address in Passflat. ' +
        'Rooms on other sites: OLX: rooms in Warsaw Otodom: rooms in Warsaw Facebook: Warsaw room groups',
    );
  });

  it('shows exactly the two group values of the contract, never one number over both groups', () => {
    const rendered = text(FIGURES);
    const values = [...rendered.matchAll(/≈ ([\d,]+) PLN/g)].map((match) => match[1]);
    expect(values).toEqual(['1,700', '1,550']);
    // The median over all eight reports would be 1,650.
    expect(rendered).not.toContain('1,650');
    expect(rendered).not.toMatch(/%|market|verified|cheaper/i);
  });

  it('no room figures: the block without the figures line, the rest unchanged', () => {
    const rendered = text(null);
    expect(rendered).not.toContain('A room in Warsaw, per month');
    expect(rendered).not.toContain('Reference:');
    expect(rendered).not.toContain('PLN');
    expect(rendered).toContain(
      'Found a room? What it will cost you per person, and is it safe to pay the deposit? Before you pay:',
    );
    expect(checklistItems(null, 'en')).toHaveLength(5);
    expect(rendered).toContain('Facebook: Warsaw room groups');
  });

  it('a group of one observation shows its value without ≈ or N and says the city, not an address', () => {
    const figures = { reference: cityReference([report('user', 1_650)]), areaName: 'Warsaw' };
    const rendered = text(figures);
    expect(rendered).toContain(
      'Reference: tenant reports in Warsaw (1) One observation in Warsaw so far',
    );
    expect(rendered).toContain('1,650 PLN');
    expect(rendered).not.toContain('≈');
    expect(rendered).not.toContain('at this address');
    expect(rendered).not.toContain('asking prices');
  });

  it('asking prices only: one labelled group, no tenant figure', () => {
    const figures = {
      reference: cityReference(
        [1_400, 1_500, 1_600].map((total) => report('scraped', total, false)),
      ),
      areaName: 'Warsaw',
    };
    const rendered = text(figures);
    expect(rendered).toContain('Reference: asking prices from listings in Warsaw (3)');
    expect(rendered).not.toContain('tenant reports');
  });

  it.each<[Locale, string, string]>([
    [
      'pl',
      'Masz pokój na oku? Ile zapłacisz na osobę i czy można bezpiecznie wpłacić kaucję?',
      'Dla orientacji: raporty najemców w mieście Warszawa (3)',
    ],
    [
      'ru',
      'Нашёл комнату? Сколько выйдет на человека и безопасно ли платить залог?',
      'Для ориентира: отчёты арендаторов по городу Варшава (3)',
    ],
    [
      'uk',
      'Знайшов кімнату? Скільки вийде на людину і чи безпечно платити заставу?',
      'Для орієнтиру: звіти орендарів у місті Варшава (3)',
    ],
  ])('renders the %s title and the figures through the shared labels', (locale, title, label) => {
    const areaName = locale === 'pl' ? 'Warszawa' : 'Варшава';
    const rendered = text({ reference: FIGURES.reference, areaName }, locale);
    expect(rendered.startsWith(title)).toBe(true);
    expect(rendered).toContain(label);
  });

  it.each(LOCALES)('%s: the checklist has five items, the last one the address check', (locale) => {
    const items = checklistItems(FIGURES, locale);
    expect(items).toHaveLength(5);
    expect(items.every((item) => item.length > 0)).toBe(true);
    const copy = (messages[locale].listings as { roomMoney: Record<string, string> }).roomMoney;
    expect(items).toEqual([
      copy.checklistSee,
      copy.checklistReservation,
      copy.checklistIncludes,
      copy.checklistProtocol,
      copy.checklistAddress,
    ]);
    expect(copy.checklistIncludes).toMatch(/czynsz/);
    expect(copy.checklistIncludes).toMatch(/media/);
    expect(copy.checklistProtocol).toContain('protokół zdawczo-odbiorczy');
  });

  it('the address check links to /warsaw/check and captures cost_data_cta_clicked {source: roommate_bridge}', () => {
    state.locale = 'en';
    const tree = RoomMoneyBlock({ figures: FIGURES, citySlug: 'warsaw' });
    const internal = findAll(tree, (el) => el.props.href === '/warsaw/check');
    expect(internal).toHaveLength(1);
    expect(internal[0].props.children).toBe('Check the address in Passflat.');
    expect(capture).not.toHaveBeenCalled();
    internal[0].props.onClick?.();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('cost_data_cta_clicked', {
      source: 'roommate_bridge',
      city: 'warsaw',
    });
  });

  it('the three links out: exact targets, a new tab, rel="nofollow noopener", no event', () => {
    state.locale = 'en';
    const tree = RoomMoneyBlock({ figures: FIGURES, citySlug: 'warsaw' });
    const outbound = findAll(tree, (el) => el.type === 'a');
    expect(outbound.map((el) => el.props.href)).toEqual(OUT_LINKS);
    for (const link of outbound) {
      expect(link.props.target).toBe('_blank');
      expect(link.props.rel).toBe('nofollow noopener');
      expect(link.props.onClick).toBeUndefined();
    }
    const rendered = html(FIGURES);
    for (const href of OUT_LINKS) {
      expect(rendered).toContain(
        `href="${href.replace(/&/g, '&amp;')}" target="_blank" rel="nofollow noopener"`,
      );
    }
  });

  it.each(LOCALES)('%s: each link out names its site', (locale) => {
    const copy = (messages[locale].listings as { roomMoney: Record<string, string> }).roomMoney;
    const { linkOlx: olx, linkOtodom: otodom, linkFacebook: facebook } = copy;
    expect(olx.startsWith('OLX')).toBe(true);
    expect(otodom.startsWith('Otodom')).toBe(true);
    expect(facebook.startsWith('Facebook')).toBe(true);
    const rendered = text(FIGURES, locale);
    for (const label of [olx, otodom, facebook]) expect(rendered).toContain(label);
  });

  it('reads only listings.roomMoney and the root translator of the figure helpers', () => {
    html(FIGURES);
    expect(new Set(namespaces)).toEqual(new Set(['listings.roomMoney', undefined]));
  });
});
