import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  summarizeDepositReturns,
  summarizeFigures,
  type AreaReference,
  type FigureReport,
  type SingleNumberFigure,
} from '@/lib/cost-figures';

import {
  depositStatement,
  money,
  renderDistrict,
  renderDistrictTable,
  renderLookup,
  submitLink,
  webLink,
} from './format';
import type { AddressLookup, DistrictRow } from './lookup';
import { plural, reportsWord, t, type BotLocale } from './texts';

const EN: BotLocale = 'en';
const CYRILLIC = /\p{Script=Cyrillic}/u;

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

describe('links to the website (spec 04 §Links to the website)', () => {
  const BUILDING_ID = '3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b';
  const UTM = { utm_source: 'telegram', utm_medium: 'bot' };

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://passflat.com');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function params(link: string): Record<string, string> {
    return Object.fromEntries(new URL(link).searchParams);
  }

  /** Only these parameters may ever leave the bot: nothing names the chat. */
  function expectOnlyKnownParams(link: string) {
    const allowed = ['b', 'p', 'source', 'utm_source', 'utm_medium', 'utm_campaign'];
    expect(Object.keys(params(link)).every((key) => allowed.includes(key))).toBe(true);
    expect(link).not.toMatch(/chat|tg_|\d{6,}/);
  }

  it('submitLink sends b, p, source=tgbot and the UTM when the lookup has a building', () => {
    const link = submitLink(lookup({ buildingId: BUILDING_ID, placeId: 'place-1' }), 'ru');

    expect(new URL(link).origin + new URL(link).pathname).toBe(
      'https://passflat.com/ru/warsaw/costs/submit',
    );
    expect(params(link)).toEqual({
      b: BUILDING_ID,
      p: 'place-1',
      source: 'tgbot',
      ...UTM,
      utm_campaign: 'submit',
    });
    expectOnlyKnownParams(link);
  });

  it('submitLink sends b at every answer level and for a building without a place id', () => {
    for (const level of ['building', 'district', 'city'] as const) {
      expect(params(submitLink(lookup({ level, buildingId: BUILDING_ID }), 'uk')).b).toBe(
        BUILDING_ID,
      );
    }
    const link = submitLink(lookup({ buildingId: BUILDING_ID, placeId: null }), 'uk');
    expect(params(link)).toEqual({
      b: BUILDING_ID,
      source: 'tgbot',
      ...UTM,
      utm_campaign: 'submit',
    });
    expect(new URL(link).pathname).toBe('/uk/warsaw/costs/submit');
  });

  it('submitLink without a building row sends p only, so the form opens without a prefill', () => {
    const link = submitLink(lookup({ buildingId: null, placeId: 'place-9' }), 'ru');
    expect(params(link)).toEqual({ p: 'place-9', source: 'tgbot', ...UTM, utm_campaign: 'submit' });
    expectOnlyKnownParams(link);
  });

  it('submitLink without a building or a place id sends only the attribution', () => {
    const link = submitLink({ citySlug: 'warsaw', placeId: null, buildingId: null }, 'ru');
    expect(params(link)).toEqual({ source: 'tgbot', ...UTM, utm_campaign: 'submit' });
    expectOnlyKnownParams(link);
  });

  it('webLink carries the UTM with its campaign and nothing else', () => {
    const link = webLink('/warsaw/building/pulawska-10', 'uk', 'building');
    expect(new URL(link).pathname).toBe('/uk/warsaw/building/pulawska-10');
    expect(params(link)).toEqual({ ...UTM, utm_campaign: 'building' });
    expectOnlyKnownParams(link);

    expect(params(webLink('warsaw/costs/submit', 'ru'))).toEqual({ ...UTM, utm_campaign: 'tgbot' });
  });

  it('links to the public site when the configured origin is not https', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    expect(new URL(submitLink(lookup(), 'ru')).origin).toBe('https://passflat.com');
    expect(new URL(webLink('/warsaw', 'ru')).origin).toBe('https://passflat.com');
  });
});

describe('plural', () => {
  it('agrees with Slavic count forms', () => {
    expect(reportsWord('ru', 1)).toBe('отчёту');
    expect(reportsWord('ru', 3)).toBe('отчётам');
    expect(reportsWord('ru', 11)).toBe('отчётам');
    expect(reportsWord('uk', 2)).toBe('звітами');
    expect(plural('ru', 21, ['a', 'b', 'c'])).toBe('a');
    expect(plural('uk', 112, ['a', 'b', 'c'])).toBe('c');
    expect(plural('ru', 23, ['a', 'b', 'c'])).toBe('b');
    expect(plural('uk', 0, ['a', 'b', 'c'])).toBe('c');
  });

  it('uses one / other in English', () => {
    expect([0, 1, 2, 5, 11, 21, 101].map((count) => plural('en', count, ['a', 'b']))).toEqual([
      'b',
      'a',
      'b',
      'b',
      'b',
      'b',
      'b',
    ]);
    expect(reportsWord('en', 1)).toBe('report');
    expect(reportsWord('en', 21)).toBe('reports');
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
    expect(text).toContain('ответивших (Варшава)');
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

  it('shows each neighbour with its group, label and own N (D23)', () => {
    const neighbours = [
      {
        address: 'Puławska 12',
        slug: 'pulawska-12',
        distanceM: 100,
        figure: { group: 'tenant', metric: 'completeTotal', value: 4_200, n: 2 },
      },
      {
        address: 'Puławska 14',
        slug: 'pulawska-14',
        distanceM: 200,
        figure: { group: 'asking', metric: 'knownPartTotal', value: 3_900, n: 1 },
      },
      {
        address: 'Puławska 16',
        slug: 'pulawska-16',
        distanceM: 300,
        figure: { group: 'tenant', metric: 'rent', value: 3_000, n: 5 },
      },
    ] as const;
    const text = renderLookup(lookup({ neighbours: [...neighbours] }), 'ru');
    expect(text).toContain(
      `• Puławska 12, отчёты жильцов: ${money(4200)} <i>(2 наблюдения, 100 м)</i>`,
    );
    expect(text).toContain(
      `• Puławska 14, цены из объявлений, известная часть расходов: ${money(3900)} <i>(1 наблюдение, 200 м)</i>`,
    );
    expect(text).toContain(
      `• Puławska 16, отчёты жильцов, аренда: ${money(3000)} <i>(5 наблюдений, 300 м)</i>`,
    );
    // An asking price is never labelled as tenants' reports.
    const asking = text.split('\n').find((line) => line.includes('Puławska 14'))!;
    expect(asking).not.toMatch(/жильц/);

    const uk = renderLookup(lookup({ neighbours: [...neighbours] }), 'uk');
    expect(uk).toContain(
      `• Puławska 12, звіти мешканців: ${money(4200)} <i>(2 спостереження, 100 м)</i>`,
    );
    expect(uk).toContain(
      `• Puławska 14, ціни з оголошень, відома частина витрат: ${money(3900)} <i>(1 спостереження, 200 м)</i>`,
    );
  });

  it('labels the deposit stat with the area it came from', () => {
    const text = renderLookup(lookup(), 'ru');
    expect(text).toContain('🔐 Вернули залог полностью или частично: 30 из 37 ответивших (Ochota)');
  });
});

/** Golden example 10 of spec 03: three ended tenancies answered, one current tenant did not. */
const depositReports: FigureReport[] = [
  report('user', { depositAmount: 4_000, depositReturned: true, depositReturnedAmount: 4_000 }),
  report('user', { depositAmount: 4_000, depositReturned: true, depositReturnedAmount: 2_500 }),
  report('user', { depositAmount: 4_000, depositReturned: false, depositReturnedAmount: 0 }),
  report('user', { depositAmount: 4_000, depositReturned: null, isCurrentTenant: true }),
];

describe('deposit statistic (spec 04 §Deposit statistics)', () => {
  const example10 = summarizeDepositReturns(depositReports);
  const RU_LINE = 'Вернули залог полностью или частично: 2 из 3 ответивших (Ochota)';
  const UK_LINE = 'Повернули заставу повністю або частково: 2 з 3 тих, хто відповів (Ochota)';

  it('renders example 10 as 2 of 3 with the district name, in RU and UK', () => {
    expect(example10).toMatchObject({ answered: 3, gotBack: 2, full: 1 });

    expect(renderLookup(lookup({ deposit: example10 }), 'ru')).toContain(`🔐 ${RU_LINE}`);
    expect(renderLookup(lookup({ deposit: example10 }), 'uk')).toContain(`🔐 ${UK_LINE}`);
    expect(depositStatement(example10, 'Ochota', 'ru')).toBe(RU_LINE);
    expect(depositStatement(example10, 'Ochota', 'uk')).toBe(UK_LINE);
  });

  it('shows the same line under a building card, named after the area', () => {
    const text = renderLookup(buildingLookup(mixedBuildingReports, { deposit: example10 }), 'ru');
    expect(text).toContain(`🔐 ${RU_LINE}`);
  });

  it('names the city when the reference is the city or missing', () => {
    for (const ref of [reference('city'), null]) {
      const text = renderLookup(
        lookup({ level: 'city', reference: ref, districtName: 'Rembertów', deposit: example10 }),
        'ru',
      );
      expect(text).toContain(
        '🔐 Вернули залог полностью или частично: 2 из 3 ответивших (Варшава)',
      );
      expect(text).not.toContain('ответивших (Rembertów)');
    }
  });

  it('renders no line from 2 answers', () => {
    const two = summarizeDepositReturns(depositReports.slice(1));
    expect(two.answered).toBe(2);

    expect(depositStatement(two, 'Ochota', 'ru')).toBeNull();
    expect(depositStatement(two, 'Ochota', 'uk')).toBeNull();
    for (const locale of ['ru', 'uk'] as const) {
      const text = renderLookup(lookup({ deposit: two }), locale);
      expect(text).not.toContain('🔐');
      expect(text).not.toMatch(/залог|застав/i);
    }
  });

  it('gives counts only: no percentage, no typical amount, no personal chance', () => {
    const deposit = { answered: 37, gotBack: 30, full: 22, medianDeposit: 4_756 };
    for (const locale of ['ru', 'uk'] as const) {
      const line = depositStatement(deposit, 'Ochota', locale)!;
      expect(line).not.toMatch(/%|шанс|ваш|твій|твой|zł|полностью в|повністю у/);
      expect(line).not.toContain(money(4_756)!);
    }
  });

  it('agrees the RU word with the count and escapes the area', () => {
    const deposit = { answered: 21, gotBack: 20, full: 0, medianDeposit: null };
    expect(depositStatement(deposit, 'Wola & <Koło>', 'ru')).toBe(
      'Вернули залог полностью или частично: 20 из 21 ответившего (Wola &amp; &lt;Koło&gt;)',
    );
  });

  it('puts the line in the typed-district answer too', () => {
    const text = renderDistrict(
      {
        name: 'Wola',
        reference: reference('district', areaReports, 'Wola'),
        deposit: example10,
        rank: null,
      },
      'uk',
    );
    expect(text).toContain(
      '🔐 Повернули заставу повністю або частково: 2 з 3 тих, хто відповів (Wola)',
    );
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
            figure: { group: 'tenant', metric: 'completeTotal', value: 4_000, n: 1 },
          },
        ],
      }),
      'ru',
    );
    expect(area).toContain('📊 <b>Wola &amp; &lt;Koło&gt;</b> — данные по району:');
    expect(area).toContain('• Obok &lt;script&gt;, отчёты жильцов: ');
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

  it('renders English from the English texts alone', () => {
    const text = renderLookup(buildingLookup(mixedBuildingReports), EN);
    expect(text).toContain('👥 <b>Tenant reports: 3</b> <i>(of which entered by Passflat: 1)</i>');
    expect(text).toContain(`All-in a month: <b>${money(3850)}</b> <i>(median of 2 reports)</i>`);
    expect(text).toContain('📰 <b>Asking prices from listings: 2</b>');
    expect(text).toContain('(median of 2 listings)');
    expect(text).toContain(
      '📊 <b>For reference</b> — figures for the district, not for this building:',
    );
    expect(text).toContain(`Ochota district, tenant reports: <b>${money(4400)}</b> (5)`);
    expect(text).toContain('Got the deposit back, fully or partly: 30 of 37 who answered (Ochota)');
    expect(text).not.toMatch(CYRILLIC);

    const area = renderLookup(lookup(), EN);
    expect(area).toContain('📊 <b>Ochota</b> — figures for the district:');
    expect(area).toContain('Add a report');
    expect(area).not.toMatch(CYRILLIC);
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

describe('renderDistrict (typed district on the contract)', () => {
  const noDeposit = { answered: 0, gotBack: 0, full: 0, medianDeposit: null };
  const answer = (overrides: Partial<Parameters<typeof renderDistrict>[0]> = {}) => ({
    name: 'Wola',
    reference: reference('district', areaReports, 'Wola'),
    deposit: noDeposit,
    rank: null,
    ...overrides,
  });

  /** The level header and the group blocks: what the district and area cards share. */
  const figures = (text: string, header: string) =>
    text.slice(text.indexOf(header), text.indexOf('\n\n👉'));

  it('shows each group of the district with its N and label', () => {
    const text = renderDistrict(answer(), 'ru');

    expect(text.startsWith('📊 <b>Wola</b> — данные по району:\n')).toBe(true);
    expect(text).toContain('👥 <b>Отчёты жильцов: 5</b> <i>(из них внесено Passflat: 1)</i>');
    expect(text).toContain(`Всего в месяц: <b>${money(4400)}</b> <i>(медиана по 5 отчётам)</i>`);
    expect(text).toContain(`Обычный диапазон: ${money(4000)} – ${money(5000)}`);
    expect(text).toContain(`Аренда: ${money(3500)} <i>(5)</i>`);
    expect(text).toContain('📰 <b>Цены из объявлений: 2</b>');
    expect(text).toContain(
      `Известная часть расходов: <b>${money(9250)}</b> <i>(медиана по 2 объявлениям)</i>`,
    );
    // Asking prices are never counted as tenants, and no blended figure is left.
    const asking = text.slice(text.indexOf('Цены из объявлений'), text.indexOf('\n\n👉'));
    expect(asking).not.toMatch(/жильц|отчёт(ам|у)\b/);
    expect(text).not.toMatch(/наблюдениям|Медиана:/);
    expect(text).toContain('Пришли адрес в этом районе');
    expect(text.endsWith(t('ru', 'cardFooter'))).toBe(true);
  });

  it('renders the same figures as the area card of an address in that district', () => {
    const ref = reference('district', areaReports, 'Wola');
    const header = '📊 <b>Wola</b> — данные по району:';
    for (const locale of ['ru', 'uk'] as const) {
      const localeHeader = locale === 'ru' ? header : '📊 <b>Wola</b> — дані по району:';
      const district = figures(renderDistrict(answer({ reference: ref }), locale), localeHeader);
      const area = figures(
        renderLookup(lookup({ reference: ref, districtName: 'Wola', deposit: noDeposit }), locale),
        localeHeader,
      );
      expect(district.length).toBeGreaterThan(localeHeader.length);
      expect(district).toBe(area);
    }
  });

  it('shows a rank line only for a comparable rank, none without one', () => {
    const text = renderDistrict(answer({ rank: { position: 2, total: 9 } }), 'ru');
    expect(text).toContain('🏷 2-е место из 9 по цене');
    // Under the bot's `all` filter `districtRank` gives null: no position, no "cheapest".
    const none = renderDistrict(answer({ rank: null }), 'ru');
    expect(none).not.toMatch(/место из|дешёв/);
  });

  it('says a thin district answers with the city, then shows the city groups with N', () => {
    const text = renderDistrict(
      answer({ name: 'Rembertów', reference: reference('city'), rank: { position: 9, total: 9 } }),
      'ru',
    );

    expect(text.split('\n')[0]).toBe(
      'По району <b>Rembertów</b> отчётов пока мало, чтобы считать медиану — показываю Варшаву целиком.',
    );
    expect(text).toContain('📊 <b>Варшава</b> — данные по городу:');
    expect(text).toContain(`Всего в месяц: <b>${money(4400)}</b> <i>(медиана по 5 отчётам)</i>`);
    expect(text).toContain('📰 <b>Цены из объявлений: 2</b>');
    expect(text).not.toContain('данные по району');
    // The city's figures carry no rank of the district.
    expect(text).not.toContain('место из');
    expect(text).toContain(t('ru', 'districtThinPrompt'));
    expect(text.endsWith(t('ru', 'cardFooter'))).toBe(true);
  });

  it('renders the thin branch in Ukrainian', () => {
    const text = renderDistrict(answer({ name: 'Wesoła', reference: reference('city') }), 'uk');
    expect(text).toContain('По району <b>Wesoła</b> звітів поки замало');
    expect(text).toContain('показую Варшаву цілком');
    expect(text).toContain('📊 <b>Варшава</b> — дані по місту:');
    expect(text).toContain('(медіана за 5 звітами)');
    expect(text).not.toMatch(/[ыэъё]/);
  });

  it('still answers when the city has no reference either', () => {
    const text = renderDistrict(answer({ reference: null }), 'ru');
    expect(text.split('\n')[0]).toBe(
      'По району <b>Wola</b> отчётов пока мало, чтобы считать медиану.',
    );
    expect(text).not.toContain('данные по');
    expect(text).toContain(t('ru', 'districtThinPrompt'));
  });

  it('escapes the district name in both branches', () => {
    for (const ref of [reference('district', areaReports, 'Wola'), reference('city'), null]) {
      const text = renderDistrict(answer({ name: 'Wola <b>&</b>', reference: ref }), 'ru');
      expect(text).toContain('Wola &lt;b&gt;&amp;&lt;/b&gt;');
      expect(text).not.toContain('<b>&</b>');
    }
  });
});

describe('renderDistrictTable (/districts on the single-number rule)', () => {
  const value = (v: number, n: number) => ({ value: v, n });
  const row = (
    name: string,
    figure: Pick<SingleNumberFigure, 'group' | 'metric' | 'value' | 'n'> &
      Partial<SingleNumberFigure>,
  ): DistrictRow => ({
    slug: name.toLowerCase(),
    name,
    figure: {
      reportCount: figure.n,
      rent: null,
      expenses: null,
      rentPerM2: null,
      completeTotalPerM2: null,
      adminFeePerM2: null,
      ...figure,
    },
  });
  const rows = [
    row('Mokotów', {
      group: 'tenant',
      metric: 'completeTotal',
      value: 3_900,
      n: 37,
      expenses: value(800, 36),
    }),
    row('Wola', {
      group: 'asking',
      metric: 'knownPartTotal',
      value: 3_200,
      n: 12,
      expenses: value(500, 12),
    }),
    row('Wawer', { group: 'tenant', metric: 'rent', value: 2_800, n: 2 }),
  ];

  it('lists each district with its group, N and label, expenses beside an all-in total only', () => {
    const text = renderDistrictTable(rows, 'ru');
    const lines = text.split('\n');

    expect(lines[0]).toBe('📊 <b>Районы Варшавы: расходы в месяц</b>');
    expect(lines).toContain(
      `• <b>Mokotów</b>, отчёты жильцов: ${money(3900)} <i>(37)</i>, из них расходы ${money(800)}`,
    );
    expect(lines).toContain(
      `• <b>Wola</b>, цены из объявлений, известная часть расходов: ${money(3200)} <i>(12)</i>`,
    );
    expect(lines).toContain(`• <b>Wawer</b>, отчёты жильцов, аренда: ${money(2800)} <i>(2)</i>`);
    expect(text).toContain(t('ru', 'districtTableFooter'));
    expect(text.endsWith(t('ru', 'cardFooter'))).toBe(true);
  });

  it('states no rank: no positions, no "cheapest", no blended median', () => {
    const text = renderDistrictTable(rows, 'ru');
    expect(text).not.toMatch(/^\d+\./m);
    expect(text).not.toMatch(/дешёв|место|реально|Медиана =/);
    const asking = text.split('\n').find((line) => line.includes('Wola'))!;
    expect(asking).not.toMatch(/жильц/);
  });

  it('renders Ukrainian without Russian strings', () => {
    const text = renderDistrictTable(rows, 'uk');
    expect(text.split('\n')[0]).toBe('📊 <b>Райони Варшави: витрати на місяць</b>');
    expect(text).toContain(
      `• <b>Mokotów</b>, звіти мешканців: ${money(3900)} <i>(37)</i>, з них витрати ${money(800)}`,
    );
    expect(text).toContain('• <b>Wola</b>, ціни з оголошень, відома частина витрат');
    expect(text).not.toMatch(/[ыэъё]/);
    expect(text).not.toMatch(/найдешевш|місце|реально/);
  });

  it('renders English without Cyrillic or a rank', () => {
    const text = renderDistrictTable(rows, EN);
    expect(text.split('\n')[0]).toBe('📊 <b>Warsaw districts: costs a month</b>');
    expect(text).toContain(
      `• <b>Mokotów</b>, tenant reports: ${money(3900)} <i>(37)</i>, of which expenses ${money(800)}`,
    );
    expect(text).toContain(
      `• <b>Wola</b>, asking prices from listings, known part of the costs: ${money(3200)} <i>(12)</i>`,
    );
    expect(text).toContain(`• <b>Wawer</b>, tenant reports, rent: ${money(2800)} <i>(2)</i>`);
    expect(text).not.toMatch(CYRILLIC);
    expect(text).not.toMatch(/cheapest|No\. \d/);
  });

  it('escapes district names and says so when there is no data', () => {
    const text = renderDistrictTable(
      [row('Wola <b>&</b>', { group: 'tenant', metric: 'completeTotal', value: 4_000, n: 5 })],
      'ru',
    );
    expect(text).toContain('• <b>Wola &lt;b&gt;&amp;&lt;/b&gt;</b>, отчёты жильцов');
    expect(renderDistrictTable([], 'ru')).toBe(t('ru', 'noDistrictData'));
  });
});
