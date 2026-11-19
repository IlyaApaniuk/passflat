import type { AddressLookup, DistrictRow } from './lookup';
import {
  groupFigureRows,
  isOneObservation,
  orderedFigureGroups,
  type GroupFigureKey,
} from '@/lib/building-figures-view';
import {
  MIN_AREA_REPORTS,
  MIN_DEPOSIT_ANSWERS,
  type AreaReference,
  type DepositReturns,
  type FigureGroup,
} from '@/lib/cost-figures';
import {
  answeredWord,
  listingsWord,
  observationsWord,
  reportsWord,
  t,
  type BotLocale,
  type TextKey,
} from './texts';

/**
 * Message rendering.
 *
 * Every card is written to survive a forward into a building or district chat:
 * the address leads, the source of the numbers is stated, and the link at the
 * bottom works for someone who has never heard of us. Forwarding is the bot's
 * only free distribution, so the message is the ad.
 *
 * Figures follow the shared contract (spec 04 §Cards on the shared contract):
 * tenant reports and asking prices are separate groups, each figure carries its
 * own N, and the district or city is a labelled reference shown next to the
 * building, never a "pricier / cheaper than the district" verdict. The headline
 * of a group is picked by `groupFigureRows`, the website checker's rule.
 */

const NBSP = ' ';

export function money(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${Math.round(value).toLocaleString('ru-RU').replace(/\s/g, NBSP)}${NBSP}zł`;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const PUBLIC_ORIGIN = 'https://passflat.com';

/**
 * Telegram rejects inline buttons pointing at localhost (BUTTON_URL_INVALID),
 * which fails the whole reply, not just the button. So a dev bot running
 * against http://localhost links to the public site instead.
 */
function appUrl(path: string): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const base = configured.startsWith('https://') ? configured : PUBLIC_ORIGIN;
  return `${base}${path}`;
}

export function webLink(path: string, locale: BotLocale, source = 'tgbot'): string {
  const localePath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(appUrl(`/${locale}${localePath}`));
  url.searchParams.set('utm_source', 'telegram');
  url.searchParams.set('utm_medium', 'bot');
  url.searchParams.set('utm_campaign', source);
  return url.toString();
}

/**
 * The cost form, prefilled with the looked-up building (spec 04 §Links to the
 * website). The form prefills only from an existing building row, and the bot
 * never creates one, so `b` is the building id whenever the lookup found a row
 * (at any answer level) and `p` stays as before; without a row the form opens
 * empty. `source=tgbot` attributes `cost_form_started`. Nothing identifying the
 * chat goes into the URL.
 */
export function submitLink(
  lookup: Pick<AddressLookup, 'citySlug' | 'placeId' | 'buildingId'>,
  locale: BotLocale,
): string {
  const path = `/${lookup.citySlug}/costs/submit`;
  const url = new URL(appUrl(`/${locale}${path}`));
  if (lookup.buildingId) url.searchParams.set('b', lookup.buildingId);
  if (lookup.placeId) url.searchParams.set('p', lookup.placeId);
  url.searchParams.set('source', 'tgbot');
  url.searchParams.set('utm_source', 'telegram');
  url.searchParams.set('utm_medium', 'bot');
  url.searchParams.set('utm_campaign', 'submit');
  return url.toString();
}

/**
 * The deposit statistic as counts with the area it came from (spec 04 §Deposit
 * statistics): "2 of 3 who answered got it back, fully or partly (Ochota)". No
 * percentage, no typical amount (it has no N of its own) and no chance for the
 * reader's own case. Null below MIN_DEPOSIT_ANSWERS answers. The cards and the
 * /deposit command both use it, so the wording and the gate cannot drift.
 */
export function depositStatement(
  deposit: DepositReturns,
  area: string,
  locale: BotLocale,
): string | null {
  const { gotBack, answered } = deposit;
  if (answered < MIN_DEPOSIT_ANSWERS) return null;
  return t(locale, 'depositLine', {
    gotBack: String(gotBack),
    answered: String(answered),
    word: answeredWord(locale, answered),
    area: escapeHtml(area),
  });
}

function depositLine(deposit: DepositReturns, area: string, locale: BotLocale): string | null {
  const statement = depositStatement(deposit, area, locale);
  return statement && `🔐 ${statement}`;
}

/** True when the reference is the whole city (or there is none), not the district. */
function areaIsCity(lookup: AddressLookup): boolean {
  return lookup.reference?.level !== 'district';
}

/**
 * Deposit figures are never building-level, so the area is always named — under
 * a building card an unlabelled "2 of 3" would read as this house's record.
 */
function lookupDepositLine(lookup: AddressLookup, locale: BotLocale): string | null {
  const area =
    areaIsCity(lookup) || !lookup.districtName ? t(locale, 'cityName') : lookup.districtName;
  return depositLine(lookup.deposit, area, locale);
}

/** A headline label per metric; a known part is never called the monthly total (FR-25). */
const HEADLINE_KEY: Partial<Record<GroupFigureKey, TextKey>> = {
  completeTotal: 'headlineTotal',
  knownPartTotal: 'headlineKnownPart',
  rent: 'headlineRent',
};

/** The figures shown under the headline; per m² stays on the website. */
const DETAIL_KEY: Partial<Record<GroupFigureKey, TextKey>> = {
  knownPartTotal: 'detailKnownPart',
  rent: 'detailRent',
  expenses: 'detailExpenses',
};

/** What a reference line adds after the group label; nothing for the all-in total. */
const REFERENCE_METRIC_KEY: Partial<Record<GroupFigureKey, TextKey>> = {
  knownPartTotal: 'referenceKnownPart',
  rent: 'referenceRent',
};

/** "отчётам" for tenant reports, "объявлениям" for asking prices: never "жильцов" for listings. */
function groupNWord(group: Pick<FigureGroup, 'key'>, locale: BotLocale, count: number): string {
  return group.key === 'tenant' ? reportsWord(locale, count) : listingsWord(locale, count);
}

/** The headline's N: "(медиана по 2 отчётам)", or "(по 1 объявлению)" for a single value. */
function headlineN(group: FigureGroup, n: number, locale: BotLocale): string {
  return t(locale, n === 1 ? 'singleN' : 'medianN', {
    count: String(n),
    word: groupNWord(group, locale, n),
  });
}

function groupTitle(group: FigureGroup, locale: BotLocale): string {
  const count = String(group.reportCount);
  if (group.key === 'asking') return t(locale, 'groupAsking', { count });
  const imported = group.sourceCounts.import;
  return t(locale, 'groupTenant', {
    count,
    imported: imported > 0 ? t(locale, 'groupTenantImported', { count: String(imported) }) : '',
  });
}

/** Rental type, rooms and area of a one-observation group, as the building page lists them. */
function characteristicsLine(group: FigureGroup, locale: BotLocale): string | null {
  const characteristics = group.characteristics;
  if (!characteristics) return null;
  const parts: string[] = [];
  if (characteristics.rentalType === 'apartment') parts.push(t(locale, 'characteristicApartment'));
  else if (characteristics.rentalType === 'room') parts.push(t(locale, 'characteristicRoom'));
  if (characteristics.rooms != null && characteristics.rooms > 0) {
    parts.push(t(locale, 'characteristicRooms', { count: String(characteristics.rooms) }));
  }
  if (characteristics.areaM2 != null) {
    parts.push(t(locale, 'characteristicArea', { area: String(characteristics.areaM2) }));
  }
  return parts.length ? `<i>${parts.join(' · ')}</i>` : null;
}

type CardScope = 'building' | 'area';

/**
 * One group's block: its label and size, then the headline with its N and the
 * other figures with theirs. One observation shows its values without a median
 * or N (FR-24); a known part says it is not the full monthly cost.
 */
function groupLines(group: FigureGroup, scope: CardScope, locale: BotLocale): string[] {
  const { headline, rows, knownPart } = groupFigureRows(group);
  const one = isOneObservation(group);
  const lines = [groupTitle(group, locale)];

  if (one) {
    lines.push(t(locale, scope === 'building' ? 'oneObservation' : 'oneObservationArea'));
    const characteristics = scope === 'building' ? characteristicsLine(group, locale) : null;
    if (characteristics) lines.push(characteristics);
  }

  const headlineKey = headline ? HEADLINE_KEY[headline.key] : undefined;
  if (!headline || !headlineKey) return lines;
  lines.push(
    t(locale, headlineKey, {
      value: money(headline.figure.median) ?? '—',
      n: one ? '' : headlineN(group, headline.figure.n, locale),
    }),
  );

  // A "typical range" of a couple of values describes the sample, not the area.
  const { p25, p75, n } = headline.figure;
  if (scope === 'area' && n >= MIN_AREA_REPORTS && p25 != null && p75 != null) {
    lines.push(t(locale, 'areaBand', { band: `${money(p25)} – ${money(p75)}` }));
  }

  for (const row of rows) {
    const key = DETAIL_KEY[row.key];
    if (!key) continue;
    lines.push(
      t(locale, key, {
        value: money(row.figure.median) ?? '—',
        n: one ? '' : ` <i>(${row.figure.n})</i>`,
      }),
    );
  }

  if (knownPart) lines.push(t(locale, 'knownPartHint'));
  return lines;
}

/** Blocks of every group with reports, tenant reports first, separated by a blank line. */
function groupBlocks(groups: FigureGroup[], scope: CardScope, locale: BotLocale): string[] {
  return groups.flatMap((group, index) => [
    ...(index > 0 ? [''] : []),
    ...groupLines(group, scope, locale),
  ]);
}

/** "Район Mokotów" or "Варшава", already escaped. */
function referenceAreaName(reference: AreaReference, locale: BotLocale): string {
  return reference.level === 'district'
    ? t(locale, 'referenceDistrictName', { name: escapeHtml(reference.name) })
    : t(locale, 'cityName');
}

/**
 * The area a building is set against, labelled with its level, group and N:
 * "Район Mokotów, отчёты жильцов: 3 900 zł (37)". Values side by side, never a
 * conclusion (spec 03 §Comparisons).
 */
function referenceLines(reference: AreaReference | null, locale: BotLocale): string[] {
  if (!reference) return [];
  const area = referenceAreaName(reference, locale);
  const lines: string[] = [];
  for (const group of orderedFigureGroups(reference.summary)) {
    const { headline } = groupFigureRows(group);
    if (!headline || !HEADLINE_KEY[headline.key]) continue;
    const metricKey = REFERENCE_METRIC_KEY[headline.key];
    lines.push(
      t(locale, group.key === 'tenant' ? 'referenceTenant' : 'referenceAsking', {
        area,
        metric: metricKey ? t(locale, metricKey) : '',
        value: money(headline.figure.median) ?? '—',
        count: String(headline.figure.n),
      }),
    );
  }
  if (!lines.length) return [];
  const header = reference.level === 'district' ? 'referenceHeaderDistrict' : 'referenceHeaderCity';
  return [t(locale, header), ...lines];
}

/**
 * The building-level card: the case where we hold reports for this exact house.
 */
function buildingCard(lookup: AddressLookup, locale: BotLocale): string {
  const lines: string[] = [`🏠 <b>${escapeHtml(lookup.address)}</b>`];
  if (lookup.districtName) lines.push(`<i>${escapeHtml(lookup.districtName)}</i>`);
  lines.push('');

  if (lookup.building) {
    lines.push(...groupBlocks(orderedFigureGroups(lookup.building), 'building', locale));
  }

  const reference = referenceLines(lookup.reference, locale);
  if (reference.length) lines.push('', ...reference);

  const deposit = lookupDepositLine(lookup, locale);
  if (deposit) lines.push('', deposit);

  return lines.join('\n');
}

/**
 * The district-level card: what the bot says when this exact house is not in the
 * data — which, at ~300 covered buildings, is the common case. It must still be
 * worth the message, so it answers the question the address was really asking:
 * "what do people pay around here?", with the level it answers from stated.
 */
function districtCard(lookup: AddressLookup, locale: BotLocale): string {
  const { reference } = lookup;
  const lines: string[] = [`📍 <b>${escapeHtml(lookup.address)}</b>`];

  // Say which level the numbers come from before showing them. A median silently
  // widened from the district to the city would read as a district figure.
  if (!reference) {
    lines.push(t(locale, 'noAreaData'));
  } else if (reference.level === 'city' && lookup.districtName) {
    lines.push(t(locale, 'thinDistrict', { district: escapeHtml(lookup.districtName) }));
  } else {
    lines.push(lookup.imprecise ? t(locale, 'noHouseNumber') : t(locale, 'noBuildingData'));
  }

  if (reference) {
    const isCity = reference.level === 'city';
    const area = isCity ? t(locale, 'cityName') : escapeHtml(reference.name);
    lines.push('', t(locale, isCity ? 'cityHeader' : 'areaHeader', { area }));
    lines.push(...groupBlocks(orderedFigureGroups(reference.summary), 'area', locale));
  }

  if (lookup.neighbours.length) {
    lines.push('', t(locale, 'neighboursHeader'));
    for (const neighbour of lookup.neighbours) {
      lines.push(
        t(locale, 'neighbourLine', {
          address: escapeHtml(neighbour.address),
          value: money(neighbour.totalMedian) ?? '—',
          count: String(neighbour.totalCount),
          word: observationsWord(locale, neighbour.totalCount),
          distance: String(neighbour.distanceM),
        }),
      );
    }
  }

  const deposit = lookupDepositLine(lookup, locale);
  if (deposit) lines.push('', deposit);

  lines.push('', t(locale, 'beFirstPrompt'));

  return lines.join('\n');
}

export function renderLookup(lookup: AddressLookup, locale: BotLocale): string {
  const card =
    lookup.level === 'building' ? buildingCard(lookup, locale) : districtCard(lookup, locale);
  return `${card}\n\n${t(locale, 'cardFooter')}`;
}

export function renderDistrictTable(rows: DistrictRow[], locale: BotLocale): string {
  if (!rows.length) return t(locale, 'noDistrictData');

  const lines = [t(locale, 'districtTableHeader'), ''];
  rows.forEach((row, index) => {
    const total = money(row.median);
    const expenses = money(row.expensesMedian);
    lines.push(
      `${index + 1}. <b>${escapeHtml(row.name)}</b> — ${total ?? '—'}` +
        (expenses ? ` <i>(${t(locale, 'ofWhichExpenses', { expenses })})</i>` : ''),
    );
  });

  lines.push('', t(locale, 'districtTableFooter'), '', t(locale, 'cardFooter'));
  return lines.join('\n');
}

export interface DistrictAnswer {
  name: string;
  /**
   * The district from MIN_AREA_REPORTS reports, else the city
   * (`loadAreaReference`); null when the city has no report either.
   */
  reference: AreaReference | null;
  /** The district's own deposit statistic. */
  deposit: DepositReturns;
  /**
   * 1-based position in the cheapest-first league table, when it has one: the
   * blended `cost-baselines` table, frozen by Q-2 (spec 03 §Single-number surfaces).
   */
  rank: { position: number; total: number } | null;
}

/**
 * The answer to a district name typed on its own ("Мокотов", "wola") — the
 * question "how much does it cost to live here?" asked before there is an
 * address to ask about. The figures are the area card's: one block per group
 * with its N and label. Below MIN_AREA_REPORTS district reports the reference
 * is the city, and the answer says so before the numbers.
 */
export function renderDistrict(district: DistrictAnswer, locale: BotLocale): string {
  const name = escapeHtml(district.name);
  const { reference } = district;

  if (reference?.level !== 'district') {
    const lines = [t(locale, reference ? 'thinDistrict' : 'districtThin', { district: name })];
    if (reference) {
      lines.push('', t(locale, 'cityHeader', { area: t(locale, 'cityName') }));
      lines.push(...groupBlocks(orderedFigureGroups(reference.summary), 'area', locale));
    }
    lines.push('', t(locale, 'districtThinPrompt'), '', t(locale, 'cardFooter'));
    return lines.join('\n');
  }

  const lines = [
    t(locale, 'areaHeader', { area: name }),
    ...groupBlocks(orderedFigureGroups(reference.summary), 'area', locale),
  ];

  if (district.rank) {
    lines.push(
      '',
      t(locale, 'districtRank', {
        position: String(district.rank.position),
        total: String(district.rank.total),
      }),
    );
  }

  const deposit = depositLine(district.deposit, district.name, locale);
  if (deposit) lines.push('', deposit);

  lines.push('', t(locale, 'districtAskAddress'), '', t(locale, 'cardFooter'));
  return lines.join('\n');
}
