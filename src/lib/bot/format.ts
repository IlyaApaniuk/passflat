import type { AddressLookup, DistrictRow } from './lookup';
import { reportsWord, t, tenanciesWord, type BotLocale } from './texts';

/**
 * Message rendering.
 *
 * Every card is written to survive a forward into a building or district chat:
 * the address leads, the source of the numbers is stated, and the link at the
 * bottom works for someone who has never heard of us. Forwarding is the bot's
 * only free distribution, so the message is the ad.
 */

const NBSP = ' ';

export function money(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${Math.round(value).toLocaleString('ru-RU').replace(/\s/g, NBSP)}${NBSP}zł`;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://passflat.com').replace(/\/$/, '');
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

export function submitLink(
  lookup: Pick<AddressLookup, 'citySlug' | 'placeId'>,
  locale: BotLocale,
): string {
  const path = `/${lookup.citySlug}/costs/submit`;
  const url = new URL(appUrl(`/${locale}${path}`));
  if (lookup.placeId) url.searchParams.set('p', lookup.placeId);
  url.searchParams.set('source', 'tgbot');
  url.searchParams.set('utm_source', 'telegram');
  url.searchParams.set('utm_medium', 'bot');
  url.searchParams.set('utm_campaign', 'submit');
  return url.toString();
}

/** "12% дороже района" — a number means nothing without the comparison. */
function verdict(value: number | null, baseline: number | null, locale: BotLocale): string | null {
  if (value == null || baseline == null || baseline <= 0) return null;
  const diff = Math.round(((value - baseline) / baseline) * 100);
  if (Math.abs(diff) < 3) return t(locale, 'verdictSame');
  return diff > 0
    ? t(locale, 'verdictAbove', { pct: String(diff) })
    : t(locale, 'verdictBelow', { pct: String(Math.abs(diff)) });
}

function depositLine(lookup: AddressLookup, locale: BotLocale): string | null {
  const { returned, answered, medianDeposit } = lookup.deposit;
  if (answered < 3) return null;
  const pct = Math.round((returned / answered) * 100);
  const amount = money(medianDeposit);
  // The area is named because these figures are never building-level — under a
  // building card an unlabelled "88% returned" would read as this house's record.
  const area =
    lookup.areaIsCity || !lookup.districtName ? t(locale, 'cityNameIn') : lookup.districtName;
  return t(locale, 'depositLine', {
    area: escapeHtml(area),
    pct: String(pct),
    answered: String(answered),
    word: tenanciesWord(locale, answered),
    amount: amount ? ` ${t(locale, 'depositTypical', { amount })}` : '',
  });
}

/**
 * The building-level card: the case where we hold reports for this exact house.
 */
function buildingCard(lookup: AddressLookup, locale: BotLocale): string {
  const costs = lookup.building!;
  const lines: string[] = [`🏠 <b>${escapeHtml(lookup.address)}</b>`];
  if (lookup.districtName) lines.push(`<i>${escapeHtml(lookup.districtName)}</i>`);
  lines.push('');

  const total = money(costs.totalMedian);
  if (total) {
    const v = verdict(costs.totalMedian, lookup.area.total.median, locale);
    lines.push(t(locale, 'totalLine', { total, verdict: v ? ` — ${v}` : '' }));
  }

  const rent = money(costs.rentMedian);
  const expenses = money(costs.expensesMedian);
  if (rent || expenses) {
    lines.push(t(locale, 'splitLine', { rent: rent ?? '—', expenses: expenses ?? '—' }));
  }

  lines.push(
    t(locale, 'basedOn', {
      count: String(costs.reportCount),
      word: reportsWord(locale, costs.reportCount),
    }),
  );
  if (costs.reportCount < 2) lines.push(t(locale, 'thinBuilding'));

  const deposit = depositLine(lookup, locale);
  if (deposit) lines.push('', deposit);

  return lines.join('\n');
}

/**
 * The district-level card: what the bot says when this exact house is not in the
 * data — which, at ~300 covered buildings, is the common case. It must still be
 * worth the message, so it answers the question the address was really asking:
 * "is this a normal price for here?"
 */
function districtCard(lookup: AddressLookup, locale: BotLocale): string {
  const areaName = lookup.areaIsCity
    ? t(locale, 'cityName')
    : (lookup.districtName ?? t(locale, 'cityName'));
  const lines: string[] = [`📍 <b>${escapeHtml(lookup.address)}</b>`];

  // Say which level the numbers come from before showing them. A median silently
  // widened from the district to the city would read as a district figure.
  if (lookup.areaIsCity && lookup.districtName) {
    lines.push(t(locale, 'thinDistrict', { district: escapeHtml(lookup.districtName) }));
  } else {
    lines.push(lookup.imprecise ? t(locale, 'noHouseNumber') : t(locale, 'noBuildingData'));
  }

  lines.push(
    '',
    t(locale, lookup.areaIsCity ? 'cityHeader' : 'areaHeader', { area: escapeHtml(areaName) }),
  );

  const total = money(lookup.area.total.median);
  const rent = money(lookup.area.rentMedian);
  const expenses = money(lookup.area.expensesMedian);

  if (total) lines.push(t(locale, 'areaTotal', { total }));
  if (rent || expenses) {
    lines.push(t(locale, 'splitLine', { rent: rent ?? '—', expenses: expenses ?? '—' }));
  }
  const band =
    lookup.area.total.p25 != null && lookup.area.total.p75 != null
      ? `${money(lookup.area.total.p25)} – ${money(lookup.area.total.p75)}`
      : null;
  if (band) lines.push(t(locale, 'areaBand', { band }));
  lines.push(
    t(locale, 'basedOn', {
      count: String(lookup.area.count),
      word: reportsWord(locale, lookup.area.count),
    }),
  );

  if (lookup.neighbours.length) {
    lines.push('', t(locale, 'neighboursHeader'));
    for (const neighbour of lookup.neighbours) {
      const value = money(neighbour.totalMedian);
      lines.push(
        `• ${escapeHtml(neighbour.address)} — ${value ?? '—'} <i>(${neighbour.distanceM}${NBSP}м)</i>`,
      );
    }
  }

  const deposit = depositLine(lookup, locale);
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
