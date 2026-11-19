import { describe, expect, it } from 'vitest';

import { summarizeFigures, type AreaReference, type FigureReport } from '@/lib/cost-figures';

import { money, renderDistrict, renderLookup } from './format';
import type { AddressLookup } from './lookup';
import { plural, reportsWord, t } from './texts';

function report(source: string, fields: Partial<FigureReport> = {}): FigureReport {
  return { source, rentalType: 'apartment', utilitiesComplete: true, ...fields };
}

/** Five tenant reports (median total 4,400 zł, one entered by Passflat) and two asking prices. */
const areaReports = [
  report('user', { totalMonthlyAvg: 3_700, rent: 3_000 }),
  report('user', { totalMonthlyAvg: 4_000, rent: 3_200 }),
  report('import', { totalMonthlyAvg: 4_400, rent: 3_500 }),
  report('user', { totalMonthlyAvg: 5_000, rent: 4_000 }),
  report('user', { totalMonthlyAvg: 5_484, rent: 4_400 }),
  report('scraped', { totalMonthlyAvg: 9_000, rent: 8_000, utilitiesComplete: false }),
  report('scraped', { totalMonthlyAvg: 9_500, rent: 8_500, utilitiesComplete: false }),
];

/** Golden example 1 of spec 03: three tenant reports (one imported) and two asking prices. */
const mixedBuildingReports = [
  report('user', { rent: 3_200, totalMonthlyAvg: 4_000 }),
  report('import', { rent: 3_000, totalMonthlyAvg: 3_700 }),
  report('user', { rent: 3_400, totalMonthlyAvg: 3_900, utilitiesComplete: false }),
  report('scraped', { rent: 3_500, totalMonthlyAvg: 4_100, utilitiesComplete: false }),
  report('scraped', { rent: 3_300, totalMonthlyAvg: 3_900, utilitiesComplete: false }),
];

function reference(
  level: AreaReference['level'] = 'district',
  reports: FigureReport[] = areaReports,
  name = level === 'district' ? 'Ochota' : 'Warszawa',
): AreaReference {
  return {
    level,
    slug: level === 'district' ? 'ochota' : 'warsaw',
    name,
    summary: summarizeFigures(reports, { level, rentalType: 'all' }),
  };
}

function lookup(overrides: Partial<AddressLookup> = {}): AddressLookup {
  return {
    level: 'district',
    address: 'Grójecka 45',
    citySlug: 'warsaw',
    buildingId: null,
    buildingSlug: null,
    placeId: 'place-1',
    districtSlug: 'ochota',
    districtName: 'Ochota',
    building: null,
    reference: reference(),
    neighbours: [],
    deposit: { answered: 37, gotBack: 30, full: 22, medianDeposit: 4756 },
    imprecise: false,
    ...overrides,
  };
}

function buildingLookup(
  reports: FigureReport[],
  overrides: Partial<AddressLookup> = {},
): AddressLookup {
  return lookup({
    level: 'building',
    address: 'Marszałkowska 58',
    buildingId: 'b1',
    building: summarizeFigures(reports, { level: 'building', rentalType: 'all' }),
    ...overrides,
  });
}

/** The building's own figures: everything above the labelled reference. */
function buildingPart(text: string): string {
  return text.split('Для ориентира')[0];
}

const VERDICT = /дороже|дешевле|на уровне района|дорожче|дешевше|на рівні району/;

describe('plural', () => {
  it('agrees with Slavic count forms', () => {
    expect(reportsWord('ru', 1)).toBe('отчёту');
    expect(reportsWord('ru', 3)).toBe('отчётам');
    expect(reportsWord('ru', 11)).toBe('отчётам');
    expect(reportsWord('uk', 2)).toBe('звітами');
    expect(plural(21, ['a', 'b', 'c'])).toBe('a');
    expect(plural(112, ['a', 'b', 'c'])).toBe('c');
  });
});

describe('money', () => {
  it('formats whole złoty and drops empty values', () => {
    expect(money(4400)).toMatch(/^4.400.zł$/);
    expect(money(null)).toBeNull();
  });
});

describe('renderLookup: area card', () => {
  it('never returns an empty answer when the building is unknown', () => {
    const text = renderLookup(lookup(), 'ru');
    expect(text).toContain('По этому дому отчётов пока нет.');
    expect(text).toContain('📊 <b>Ochota</b> — данные по району:');
    // The whole point of the fallback: an uncovered address still gets a CTA.
    expect(text).toContain('Оставь отчёт');
  });

  it('shows each group of the district with its own N and source label', () => {
    const text = renderLookup(lookup(), 'ru');

    expect(text).toContain('👥 <b>Отчёты жильцов: 5</b> <i>(из них внесено Passflat: 1)</i>');
    expect(text).toContain(`Всего в месяц: <b>${money(4400)}</b> <i>(медиана по 5 отчётам)</i>`);
    expect(text).toContain(`Обычный диапазон: ${money(4000)} – ${money(5000)}`);
    expect(text).toContain(`Аренда: ${money(3500)} <i>(5)</i>`);

    expect(text).toContain('📰 <b>Цены из объявлений: 2</b>');
    expect(text).toContain(
      `Известная часть расходов: <b>${money(9250)}</b> <i>(медиана по 2 объявлениям)</i>`,
    );
    expect(text).toContain('Указаны не все коммунальные платежи');
    // No "typical range" from two listings.
    expect(text).not.toContain(`${money(9125)} – ${money(9375)}`);
    // Asking prices are never counted as tenants.
    const asking = text.slice(text.indexOf('Цены из объявлений'));
    expect(asking.split('🔐')[0]).not.toMatch(/жильц|отчёт(ам|у)\b/);
  });

  it('says the numbers widened to the city instead of implying they are the district', () => {
    const text = renderLookup(
      lookup({ level: 'city', reference: reference('city'), districtName: 'Rembertów' }),
      'ru',
    );
    expect(text).toContain('Rembertów');
    expect(text).toContain('показываю Варшаву целиком');
    expect(text).toContain('📊 <b>Варшава</b> — данные по городу:');
    expect(text).toContain('медиана по 5 отчётам');
    expect(text).toContain('По Варшаве: залог');
  });

  it('labels a single report of the area as one observation, without a median or N', () => {
    const text = renderLookup(
      lookup({
        reference: reference('district', [
          ...areaReports.slice(0, 5),
          report('scraped', { totalMonthlyAvg: 6_000, rent: 5_000, utilitiesComplete: false }),
        ]),
      }),
      'ru',
    );
    const asking = text.slice(text.indexOf('📰'));
    expect(asking).toContain('📰 <b>Цены из объявлений: 1</b>\n<i>Одно наблюдение</i>');
    expect(asking).toContain(`Известная часть расходов: <b>${money(6000)}</b>\n`);
    expect(asking).not.toContain('медиана');
    // "At this address" belongs to the building, not to a district's one listing.
    expect(text).not.toContain('по этому адресу');
  });

  it('still answers when the city has no reference at all', () => {
    const text = renderLookup(lookup({ level: 'city', reference: null }), 'ru');
    expect(text).toContain('По этому дому, району и городу отчётов пока нет.');
    expect(text).not.toContain('данные по');
    expect(text).toContain('Оставь отчёт');
  });

  it('shows each neighbour with its own N', () => {
    const text = renderLookup(
      lookup({
        neighbours: [
          {
            address: 'Puławska 12',
            slug: 'pulawska-12',
            distanceM: 100,
            totalMedian: 4_200,
            totalCount: 2,
            reportCount: 2,
          },
        ],
      }),
      'ru',
    );
    expect(text).toContain(`• Puławska 12 — ${money(4200)} <i>(2 наблюдения, 100 м)</i>`);
  });

  it('labels the deposit stat with the area it came from', () => {
    const text = renderLookup(lookup(), 'ru');
    expect(text).toContain('По Ochota: залог');
    // Got back fully or partly, in the old wording until the deposit line changes (T034).
    expect(text).toContain('в 81% случаев');
    expect(text).toContain('по 37');
  });

  it('hides the deposit stat below three answers', () => {
    const text = renderLookup(
      lookup({ deposit: { answered: 2, gotBack: 2, full: 2, medianDeposit: 4000 } }),
      'ru',
    );
    expect(text).not.toContain('залог');
  });
});

describe('renderLookup: building card', () => {
  it('shows a mixed building by group with each N, then the labelled district reference', () => {
    const text = renderLookup(buildingLookup(mixedBuildingReports), 'ru');
    const own = buildingPart(text);

    expect(own).toContain('👥 <b>Отчёты жильцов: 3</b> <i>(из них внесено Passflat: 1)</i>');
    expect(own).toContain(`Всего в месяц: <b>${money(3850)}</b> <i>(медиана по 2 отчётам)</i>`);
    expect(own).toContain(`Известная часть расходов: ${money(3900)} <i>(1)</i>`);
    expect(own).toContain(`Аренда: ${money(3200)} <i>(3)</i>`);
    expect(own).toContain(`Расходы: ${money(750)} <i>(2)</i>`);

    expect(own).toContain('📰 <b>Цены из объявлений: 2</b>');
    expect(own).toContain(
      `Известная часть расходов: <b>${money(4000)}</b> <i>(медиана по 2 объявлениям)</i>`,
    );
    expect(own.slice(own.indexOf('📰'))).not.toContain('жильц');

    expect(text).toContain('📊 <b>Для ориентира</b> — данные по району, а не по этому дому:');
    expect(text).toContain(`Район Ochota, отчёты жильцов: <b>${money(4400)}</b> (5)`);
    expect(text).toContain(
      `Район Ochota, цены из объявлений, известная часть расходов: <b>${money(9250)}</b> (2)`,
    );
    expect(text).not.toMatch(VERDICT);
  });

  it('shows one observation with its characteristics and no median or N', () => {
    const text = renderLookup(
      buildingLookup([
        report('user', { totalMonthlyAvg: 3_904, rent: 2_518, rooms: 2, areaM2: 47 }),
      ]),
      'ru',
    );
    const own = buildingPart(text);
    expect(own).toContain('👥 <b>Отчёты жильцов: 1</b>\n<i>Одно наблюдение по этому адресу</i>');
    expect(own).toContain('<i>Вся квартира · комнат: 2 · площадь ≈ 45 м²</i>');
    expect(own).toContain(`Всего в месяц: <b>${money(3904)}</b>\n`);
    expect(own).toContain(`Аренда: ${money(2518)}\n`);
    expect(own).toContain(`Расходы: ${money(1386)}`);
    expect(own).not.toMatch(/медиана|\(\d+\)/);
  });

  it('never calls a known part the monthly total', () => {
    const text = renderLookup(
      buildingLookup([
        report('user', { totalMonthlyAvg: 3_000, rent: 2_500, utilitiesComplete: false }),
        report('user', { totalMonthlyAvg: 3_400, rent: 2_700, utilitiesComplete: null }),
      ]),
      'ru',
    );
    const own = buildingPart(text);
    expect(own).toContain(
      `💸 Известная часть расходов: <b>${money(3200)}</b> <i>(медиана по 2 отчётам)</i>`,
    );
    expect(own).toContain('Указаны не все коммунальные платежи');
    expect(own).not.toContain('Всего в месяц');
    // Expenses need an all-in total, so a known part has none.
    expect(own).not.toContain('Расходы:');
  });

  it('labels a city reference as the city', () => {
    const text = renderLookup(
      buildingLookup(mixedBuildingReports, { reference: reference('city') }),
      'ru',
    );
    expect(text).toContain('📊 <b>Для ориентира</b> — данные по городу, а не по этому дому:');
    expect(text).toContain(`Варшава, отчёты жильцов: <b>${money(4400)}</b> (5)`);
    expect(text).not.toContain('Район Warszawa');
    expect(text).not.toMatch(VERDICT);
  });

  it('shows an asking-only building as listings, never as tenants', () => {
    const text = renderLookup(
      buildingLookup([
        report('scraped', { totalMonthlyAvg: 6_000, rent: 5_000, utilitiesComplete: false }),
        report('scraped', { totalMonthlyAvg: 6_400, rent: 5_200, utilitiesComplete: false }),
      ]),
      'ru',
    );
    const own = buildingPart(text);
    expect(own).toContain('📰 <b>Цены из объявлений: 2</b>');
    expect(own).toContain(`<b>${money(6200)}</b> <i>(медиана по 2 объявлениям)</i>`);
    expect(own).not.toMatch(/жильц|Отчёты/);
    expect(text).not.toMatch(VERDICT);
  });

  it('leaves the reference out when there is none', () => {
    const text = renderLookup(buildingLookup(mixedBuildingReports, { reference: null }), 'ru');
    expect(text).not.toContain('Для ориентира');
    expect(text).toContain(money(3850)!);
  });
});

describe('renderLookup: escaping and locales', () => {
  it('escapes every value that comes from data', () => {
    const text = renderLookup(
      buildingLookup(mixedBuildingReports, {
        address: 'Ulica <b>&</b> 1',
        districtName: 'Dzielnica <i>',
        reference: reference('district', areaReports, 'Wola & <Koło>'),
      }),
      'ru',
    );
    expect(text).toContain('🏠 <b>Ulica &lt;b&gt;&amp;&lt;/b&gt; 1</b>');
    expect(text).toContain('<i>Dzielnica &lt;i&gt;</i>');
    expect(text).toContain('Район Wola &amp; &lt;Koło&gt;, отчёты жильцов');
    expect(text).not.toContain('<Koło>');

    const area = renderLookup(
      lookup({
        reference: reference('district', areaReports, 'Wola & <Koło>'),
        neighbours: [
          {
            address: 'Obok <script>',
            slug: 'obok',
            distanceM: 50,
            totalMedian: 4_000,
            totalCount: 1,
            reportCount: 1,
          },
        ],
      }),
      'ru',
    );
    expect(area).toContain('📊 <b>Wola &amp; &lt;Koło&gt;</b> — данные по району:');
    expect(area).toContain('• Obok &lt;script&gt; — ');
    expect(area).not.toContain('<script>');
  });

  it('renders Ukrainian without falling back to Russian strings', () => {
    const text = renderLookup(buildingLookup(mixedBuildingReports), 'uk');
    expect(text).toContain('👥 <b>Звіти мешканців: 3</b> <i>(з них внесено Passflat: 1)</i>');
    expect(text).toContain(`Разом на місяць: <b>${money(3850)}</b> <i>(медіана за 2 звітами)</i>`);
    expect(text).toContain('📰 <b>Ціни з оголошень: 2</b>');
    expect(text).toContain('(медіана за 2 оголошеннями)');
    expect(text).toContain('📊 <b>Для орієнтиру</b> — дані по району, а не по цьому будинку:');
    expect(text).toContain(`Район Ochota, звіти мешканців: <b>${money(4400)}</b> (5)`);
    expect(text).not.toMatch(VERDICT);
    expect(text).not.toMatch(/Отчёты|жильцов|объявлени/);

    const area = renderLookup(lookup(), 'uk');
    expect(area).toContain('Залиш звіт');
    expect(area).not.toContain('Оставь отчёт');
  });

  it('no longer calls the figures "real costs" in the footer or the greeting', () => {
    for (const locale of ['ru', 'uk'] as const) {
      for (const key of ['cardFooter', 'start', 'startAfterPayload'] as const) {
        expect(t(locale, key)).not.toMatch(/реальн/i);
      }
    }
    expect(t('ru', 'cardFooter')).toContain('о которых сообщили жильцы');
    expect(t('uk', 'cardFooter')).toContain('про які повідомили мешканці');
  });
});

describe('renderDistrict', () => {
  it('counts the blended district figure as observations, not as tenant reports', () => {
    const text = renderDistrict(
      {
        name: 'Wola',
        stats: {
          total: { median: 4_400, p25: 4_000, p75: 5_000 },
          rentPerM2: { median: null, p25: null, p75: null },
          totalPerM2: { median: null, p25: null, p75: null },
          rentMedian: 3_500,
          expensesMedian: 900,
          count: 12,
        },
        deposit: { answered: 0, gotBack: 0, full: 0, medianDeposit: null },
        rank: null,
        cityMedian: null,
      },
      'ru',
      5,
    );
    expect(text).toContain('по 12 наблюдениям');
    expect(text).not.toContain('жильцов');
  });
});
