import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import type { FigureReport } from '@/lib/cost-figures';

/**
 * The room cost reference under the roommate counts (PRD 3 FR-17, spec 06 §Room cost
 * reference) through the real figure loaders (`loadAreaReference`) over a Prisma mock that
 * serves reports by district or city and by rental type, as the database would. Golden case:
 * PRD 3 §5 example 2. Nothing reaches a database or Telegram.
 */

type Where = {
  rentalType?: string;
  rooms?: { gte: number };
  building?: { districtId?: string; cityId?: string };
};

const h = vi.hoisted(() => ({
  reports: [] as Array<Record<string, unknown> & { districtId: string }>,
  cityFindUnique: vi.fn(),
  districtFindUnique: vi.fn(),
  costReportFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: { findUnique: h.cityFindUnique },
    district: { findUnique: h.districtFindUnique },
    costReport: { findMany: h.costReportFindMany },
  },
}));

// The loaders' cache is Next's; here every call reads through.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

import { roomCostsReply } from './roommate-room-costs';
import type { BotLocale } from './texts';

const NBSP = String.fromCharCode(0xa0);
/** "1 700 zł" as `money()` writes it, with no-break spaces. */
const zl = (value: string) => `${value.replace(' ', NBSP)}${NBSP}zł`;

const DISTRICTS = [
  { id: 'd-mok', slug: 'mokotow', nameKey: 'Mokotów' },
  { id: 'd-wes', slug: 'wesola', nameKey: 'Wesoła' },
  { id: 'd-rem', slug: 'rembertow', nameKey: 'Rembertów' },
  { id: 'd-wol', slug: 'wola', nameKey: 'Wola' },
];

function room(source: string, total: number, complete = true): FigureReport {
  return { source, rentalType: 'room', totalMonthlyAvg: total, utilitiesComplete: complete };
}

function flat(
  source: string,
  total: number,
  complete = true,
  rooms: number | null = 2,
): FigureReport {
  return {
    source,
    rentalType: 'apartment',
    totalMonthlyAvg: total,
    utilitiesComplete: complete,
    rooms,
  };
}

/** PRD 3 §5 example 2: R1 user 1,600, R2 import 1,800, R3–R7 scraped known parts. */
const MOKOTOW_ROOMS = [
  room('user', 1_600),
  room('import', 1_800),
  ...[1_400, 1_500, 1_550, 1_700, 2_000].map((total) => room('scraped', total, false)),
];
/**
 * Tenant all-in totals of whole flats in Mokotów with rooms 1 / 2 / 2 / 3 / 2 / 3 (spec 06,
 * D71): the studio (4,200) is left out, so the split's median is 4,900 over N = 5 (D61 over
 * all six: 4,850, N = 6).
 */
const MOKOTOW_FLATS = (
  [
    [4_200, 1],
    [4_600, 2],
    [4_800, 2],
    [4_900, 3],
    [5_100, 2],
    [5_400, 3],
  ] as const
).map(([total, rooms]) => flat('user', total, true, rooms));
/** Two room reports: below MIN_AREA_REPORTS, so Wesoła answers with Warsaw. */
const WESOLA_ROOMS = [room('user', 1_500), room('scraped', 1_300, false)];

function serve(byDistrict: Record<string, FigureReport[]>) {
  h.reports = Object.entries(byDistrict).flatMap(([districtId, rows]) =>
    rows.map((row) => ({ ...row, districtId })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.cityFindUnique.mockImplementation(async (args: { include?: unknown }) => ({
    id: 'city-1',
    slug: 'warsaw',
    nameKey: 'city.warsaw',
    isActive: true,
    ...(args.include ? { districts: DISTRICTS } : {}),
  }));
  h.districtFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const district = DISTRICTS.find((row) => row.id === where.id);
    return district ? { slug: district.slug, nameKey: district.nameKey } : null;
  });
  h.costReportFindMany.mockImplementation(async ({ where }: { where: Where }) =>
    h.reports
      .filter((row) => !where.rentalType || row.rentalType === where.rentalType)
      // `rooms: { gte }` as SQL reads it: a null room count never passes.
      .filter(
        (row) => !where.rooms || (typeof row.rooms === 'number' && row.rooms >= where.rooms.gte),
      )
      .filter((row) =>
        where.building?.districtId
          ? row.districtId === where.building.districtId
          : where.building?.cityId === 'city-1',
      )
      .map(({ districtId: _districtId, ...row }) => row),
  );
  serve({ 'd-mok': [...MOKOTOW_ROOMS, ...MOKOTOW_FLATS], 'd-wes': WESOLA_ROOMS });
});

const districts = (...slugs: string[]) => ({ districtSlugs: slugs, anyDistrict: false });
const ANY = { districtSlugs: [], anyDistrict: true };

async function reply(
  profile: { districtSlugs: string[]; anyDistrict: boolean },
  locale: BotLocale = 'ru',
) {
  const text = await roomCostsReply(profile, locale);
  expect(text).not.toBeNull();
  return text!;
}

const RU_HEADER = '📊 <b>Для ориентира — комнаты</b>';
const RU_MOKOTOW_TENANT = `   отчёты жильцов, всего в месяц: <b>${zl('1 700')}</b> <i>(медиана по 2 отчётам)</i>`;
const RU_MOKOTOW_ASKING = `   цены из объявлений, известная часть расходов: <b>${zl('1 550')}</b> <i>(медиана по 5 объявлениям)</i>`;
const RU_MOKOTOW_SPLIT = `На двоих — примерно по ${zl('2 450')} с человека (половина медианы по целым квартирам, Mokotów; отчёты жильцов: 5).`;
/** Warsaw rooms: tenant 1,500 / 1,600 / 1,800 (N 3), asking 1,300 … 2,000 (N 6, median 1,525). */
const RU_WARSAW_TENANT = `   отчёты жильцов, всего в месяц: <b>${zl('1 600')}</b> <i>(медиана по 3 отчётам)</i>`;
const RU_WARSAW_ASKING = `   цены из объявлений, известная часть расходов: <b>${zl('1 525')}</b> <i>(медиана по 6 объявлениям)</i>`;
const RU_WARSAW_SPLIT = `На двоих — примерно по ${zl('2 450')} с человека (половина медианы по целым квартирам, Варшава; отчёты жильцов: 5).`;

describe('golden case (PRD 3 §5 example 2, D71)', () => {
  it('Mokotów: tenant reports 1,700 all-in (2), asking prices 1,550 known part (5), for two about 2,450 each (5 flats of 2+ rooms, Mokotów)', async () => {
    expect(await reply(districts('mokotow'))).toBe(
      [RU_HEADER, '<b>Mokotów</b>:', RU_MOKOTOW_TENANT, RU_MOKOTOW_ASKING, RU_MOKOTOW_SPLIT].join(
        '\n',
      ),
    );
  });

  it('in UK', async () => {
    expect(await reply(districts('mokotow'), 'uk')).toBe(
      [
        '📊 <b>Для орієнтиру — кімнати</b>',
        '<b>Mokotów</b>:',
        `   звіти мешканців, разом на місяць: <b>${zl('1 700')}</b> <i>(медіана за 2 звітами)</i>`,
        `   ціни з оголошень, відома частина витрат: <b>${zl('1 550')}</b> <i>(медіана за 5 оголошеннями)</i>`,
        `Удвох — приблизно по ${zl('2 450')} з людини (половина медіани за цілими квартирами, Mokotów; звіти мешканців: 5).`,
      ].join('\n'),
    );
  });

  it('in EN, now that texts.ts has English area texts', async () => {
    expect(await reply(districts('mokotow'), 'en')).toBe(
      [
        '📊 <b>For reference: rooms</b>',
        '<b>Mokotów</b>:',
        `   tenant reports, all-in a month: <b>${zl('1 700')}</b> <i>(median of 2 reports)</i>`,
        `   asking prices from listings, known part of the costs: <b>${zl('1 550')}</b> <i>(median of 5 listings)</i>`,
        `For two people about ${zl('2 450')} each (half of the median flat, 5 tenant reports, Mokotów).`,
      ].join('\n'),
    );
  });

  it('in EN, a district below the minimum says it answers with Warsaw', async () => {
    const text = await reply(districts('wesola'), 'en');
    expect(text).toContain('Wesoła has fewer than 5 room reports; Warsaw:');
    expect(text).toContain('5 tenant reports, Warsaw).');
    expect(text).not.toMatch(/\p{Script=Cyrillic}/u);
  });

  it('reads the room figures and the flat figures through the contract loaders, filtered by rental type', async () => {
    await reply(districts('mokotow'));
    const wheres = h.costReportFindMany.mock.calls.map(([args]) => args.where);
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
    expect(
      wheres.every((where) => where.rentalType === 'room' || where.rentalType === 'apartment'),
    ).toBe(true);
    // D71: the rooms filter is the split's alone; the room lines read every room report.
    expect(
      wheres.filter((where) => where.rentalType === 'room').some((where) => 'rooms' in where),
    ).toBe(false);
    expect(
      wheres
        .filter((where) => where.rentalType === 'apartment')
        .every((where) => where.rooms?.gte === 2),
    ).toBe(true);
  });
});

describe('the per-person split over flats with 2 or more rooms (D71)', () => {
  it('leaves the studio out: 2,450 from 5 flats, not D61’s 2,430 from all 6', async () => {
    const text = await reply(districts('mokotow'));
    expect(text).toContain(RU_MOKOTOW_SPLIT);
    expect(text).not.toContain(zl('2 430'));
    expect(text).not.toContain('отчёты жильцов: 6');
  });

  it('leaves out a flat without a room count', async () => {
    serve({
      'd-mok': [
        ...MOKOTOW_ROOMS,
        ...MOKOTOW_FLATS,
        ...[9_000, 9_200, 9_400].map((total) => flat('user', total, true, null)),
      ],
    });
    expect(await reply(districts('mokotow'))).toContain(RU_MOKOTOW_SPLIT);
  });

  it('the level is that of the filtered flats: 4 of 2+ rooms in Mokotów answer with Warsaw', async () => {
    // Seven flats would let Mokotów answer on its own (D61: 4,600 → 2,300, N 7); only four
    // have 2+ rooms, below MIN_AREA_REPORTS, so the split says Warsaw over the same four.
    serve({
      'd-mok': [
        ...MOKOTOW_ROOMS,
        ...[3_000, 3_100, 3_200].map((total) => flat('user', total, true, 1)),
        ...[4_600, 4_800, 5_000, 5_200].map((total) => flat('user', total, true, 2)),
      ],
    });
    const text = await reply(districts('mokotow'));
    expect(text).toContain('<b>Mokotów</b>:');
    expect(text).toContain(
      `примерно по ${zl('2 450')} с человека (половина медианы по целым квартирам, Варшава; отчёты жильцов: 4).`,
    );
    expect(text).not.toContain(zl('2 300'));
  });

  it('one flat of 2+ rooms beside studios is one observation: no split', async () => {
    serve({
      'd-mok': [
        ...MOKOTOW_ROOMS,
        flat('user', 4_800, true, 2),
        ...[3_000, 3_100, 3_200, 3_300].map((total) => flat('user', total, true, 1)),
      ],
    });
    expect(await reply(districts('mokotow'))).not.toContain('На двоих');
  });

  it('only studios: no split', async () => {
    serve({
      'd-mok': [...MOKOTOW_ROOMS, ...MOKOTOW_FLATS.map((row) => ({ ...row, rooms: 1 }))],
    });
    expect(await reply(districts('mokotow'))).not.toContain('На двоих');
  });
});

describe('the level of the figures', () => {
  it('Wesoła below 5 room reports: "Wesoła has fewer than 5 room reports; Warsaw:" and the city lines', async () => {
    expect(await reply(districts('wesola'))).toBe(
      [
        RU_HEADER,
        'В районе Wesoła меньше 5 отчётов по комнатам; Варшава:',
        RU_WARSAW_TENANT,
        RU_WARSAW_ASKING,
        RU_WARSAW_SPLIT,
      ].join('\n'),
    );
  });

  it('several fallbacks share the Warsaw lines once, introduced with all their names', async () => {
    const text = await reply(districts('wesola', 'rembertow'));
    expect(text).toBe(
      [
        RU_HEADER,
        'В районах Wesoła, Rembertów меньше 5 отчётов по комнатам в каждом; Варшава:',
        RU_WARSAW_TENANT,
        RU_WARSAW_ASKING,
        RU_WARSAW_SPLIT,
      ].join('\n'),
    );
  });

  it('a district that answers on its own comes first, then the Warsaw lines of the fallbacks', async () => {
    expect(await reply(districts('wesola', 'mokotow', 'rembertow'))).toBe(
      [
        RU_HEADER,
        '<b>Mokotów</b>:',
        RU_MOKOTOW_TENANT,
        RU_MOKOTOW_ASKING,
        RU_MOKOTOW_SPLIT,
        '',
        'В районах Wesoła, Rembertów меньше 5 отчётов по комнатам в каждом; Варшава:',
        RU_WARSAW_TENANT,
        RU_WARSAW_ASKING,
        RU_WARSAW_SPLIT,
      ].join('\n'),
    );
  });

  it('"any" gets Warsaw', async () => {
    expect(await reply(ANY)).toBe(
      [RU_HEADER, '<b>Варшава</b>:', RU_WARSAW_TENANT, RU_WARSAW_ASKING, RU_WARSAW_SPLIT].join(
        '\n',
      ),
    );
  });

  it('the flat figures have their own level: Wesoła rooms from Warsaw, Wesoła flats from Wesoła', async () => {
    serve({
      'd-mok': MOKOTOW_ROOMS,
      'd-wes': [
        ...WESOLA_ROOMS,
        ...[3_000, 3_200, 3_400, 3_600, 3_800].map((t) => flat('user', t)),
      ],
    });
    const text = await reply(districts('wesola'));
    expect(text).toContain('В районе Wesoła меньше 5 отчётов по комнатам; Варшава:');
    expect(text).toContain(
      `примерно по ${zl('1 700')} с человека (половина медианы по целым квартирам, Wesoła; отчёты жильцов: 5).`,
    );
  });

  it('a district with room figures of its own and flats from Warsaw says Warsaw on the split', async () => {
    serve({ 'd-mok': MOKOTOW_ROOMS, 'd-wol': MOKOTOW_FLATS.slice(0, 4) });
    const text = await reply(districts('mokotow'));
    expect(text).toContain('<b>Mokotów</b>:');
    // Mokotów holds no flat report, so the flats are Warsaw's: of 4,200 … 4,900 the studio is
    // left out (D71), 4,600 / 4,800 / 4,900 → 4,800 → 2,400.
    expect(text).toContain(
      `примерно по ${zl('2 400')} с человека (половина медианы по целым квартирам, Варшава; отчёты жильцов: 3).`,
    );
  });

  it('no room report at any level: "no room figures", and the split still from the flats', async () => {
    serve({ 'd-mok': MOKOTOW_FLATS });
    expect(await reply(districts('mokotow', 'wesola'))).toBe(
      [
        RU_HEADER,
        '<b>Mokotów, Wesoła</b>:',
        'Данных по комнатам здесь пока нет.',
        RU_MOKOTOW_SPLIT,
        RU_WARSAW_SPLIT,
      ].join('\n'),
    );
  });

  it('no report at all: "no room figures" and no split', async () => {
    serve({});
    expect(await reply(ANY)).toBe(
      [RU_HEADER, '<b>Варшава</b>:', 'Данных по комнатам здесь пока нет.'].join('\n'),
    );
    expect(await reply(ANY, 'uk')).toBe(
      [
        '📊 <b>Для орієнтиру — кімнати</b>',
        '<b>Варшава</b>:',
        'Даних про кімнати тут поки немає.',
      ].join('\n'),
    );
  });
});

describe('the figures of a group', () => {
  it('one tenant room report is one observation, without a median or N, as the cards', async () => {
    serve({
      'd-mok': [room('user', 1_650), ...MOKOTOW_ROOMS.slice(2)],
    });
    const text = await reply(districts('mokotow'));
    expect(text).toContain(
      `   отчёты жильцов, всего в месяц: <b>${zl('1 650')}</b> <i>(одно наблюдение)</i>`,
    );
    expect(text).not.toMatch(/по 1 отчёту/);
    expect(text).not.toContain('На двоих');
  });

  it('a group without an all-in total shows its known part, labelled', async () => {
    serve({
      'd-mok': [room('user', 1_600, false), room('user', 1_800, false), ...MOKOTOW_ROOMS.slice(2)],
    });
    expect(await reply(districts('mokotow'))).toContain(
      `   отчёты жильцов, известная часть расходов: <b>${zl('1 700')}</b> <i>(медиана по 2 отчётам)</i>`,
    );
  });

  it('a group of rent only says rent', async () => {
    serve({
      'd-mok': [
        { source: 'user', rentalType: 'room', rent: 1_200 },
        { source: 'user', rentalType: 'room', rent: 1_400 },
        ...MOKOTOW_ROOMS.slice(2),
      ],
    });
    expect(await reply(districts('mokotow'))).toContain(
      `   отчёты жильцов, аренда: <b>${zl('1 300')}</b> <i>(медиана по 2 отчётам)</i>`,
    );
  });

  it('only asking prices: one line, no tenant line, no split', async () => {
    serve({ 'd-mok': MOKOTOW_ROOMS.slice(2) });
    expect(await reply(districts('mokotow'))).toBe(
      [RU_HEADER, '<b>Mokotów</b>:', RU_MOKOTOW_ASKING].join('\n'),
    );
  });
});

describe('the per-person split (D61)', () => {
  it('needs 2 tenant all-in totals of flats', async () => {
    serve({ 'd-mok': [...MOKOTOW_ROOMS, flat('user', 4_800), flat('scraped', 4_000)] });
    expect(await reply(districts('mokotow'))).not.toContain('На двоих');
  });

  it('never from a known part of the flat costs', async () => {
    serve({
      'd-mok': [
        ...MOKOTOW_ROOMS,
        ...MOKOTOW_FLATS.map((row) => ({ ...row, utilitiesComplete: false })),
      ],
    });
    expect(await reply(districts('mokotow'))).not.toContain('На двоих');
  });

  it('never from asking prices of flats', async () => {
    serve({
      'd-mok': [...MOKOTOW_ROOMS, ...MOKOTOW_FLATS.map((row) => ({ ...row, source: 'scraped' }))],
    });
    expect(await reply(districts('mokotow'))).not.toContain('На двоих');
  });

  it('asking prices of flats beside the tenant totals do not move it', async () => {
    serve({
      'd-mok': [...MOKOTOW_ROOMS, ...MOKOTOW_FLATS, flat('scraped', 9_000), flat('scraped', 9_500)],
    });
    expect(await reply(districts('mokotow'))).toContain(RU_MOKOTOW_SPLIT);
  });

  it('rounds half up to 10 zł: 4,848 → 2,424 → 2,420', async () => {
    serve({ 'd-mok': [...MOKOTOW_ROOMS, flat('user', 4_798), flat('user', 4_898)] });
    expect(await reply(districts('mokotow'))).toContain(
      `примерно по ${zl('2 420')} с человека (половина медианы по целым квартирам, Варшава; отчёты жильцов: 2).`,
    );
  });
});

describe('honesty (CLAUDE.md, D23)', () => {
  const cases: Array<[string, () => void, { districtSlugs: string[]; anyDistrict: boolean }]> = [
    ['golden', () => undefined, districts('mokotow')],
    ['fallbacks', () => undefined, districts('mokotow', 'wesola', 'rembertow')],
    ['any', () => undefined, ANY],
    ['no rooms', () => serve({ 'd-mok': MOKOTOW_FLATS }), districts('mokotow')],
  ];

  it.each(cases)(
    'the %s reply has no "market", percentage, comparison or "verified"',
    async (_name, setup, profile) => {
      setup();
      for (const locale of ['ru', 'uk', 'en'] as const) {
        const text = await reply(profile, locale);
        expect(text).not.toMatch(
          /%|рын|ринк|market|дешев|дешевш|дорож|cheaper|verified|провер|перевір|рейтинг|место/i,
        );
      }
    },
  );

  it('no number blended over tenant reports and asking prices appears', async () => {
    // Over all seven Mokotów room reports the median would be 1,600 zł; it is never shown.
    const text = await reply(districts('mokotow'));
    expect(text).not.toContain(zl('1 600'));
    const values = [...text.matchAll(/<b>([^<]+zł)<\/b>/g)].map((match) => match[1]);
    expect(values).toEqual([zl('1 700'), zl('1 550')]);
  });
});

describe('when it is left out', () => {
  let errorLog: MockInstance<typeof console.error>;
  beforeEach(() => {
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorLog.mockRestore());

  it('a loader error leaves it out and logs only the message', async () => {
    h.costReportFindMany.mockRejectedValue(new Error('connection refused'));
    expect(await roomCostsReply(districts('mokotow'), 'ru')).toBeNull();
    expect(errorLog).toHaveBeenCalledWith('[bot/roommate] room costs failed', 'connection refused');
    expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(/mokotow|d-mok|city-1/);
  });

  it('no checker city: nothing', async () => {
    h.cityFindUnique.mockResolvedValue(null);
    expect(await roomCostsReply(districts('mokotow'), 'ru')).toBeNull();
    expect(errorLog).not.toHaveBeenCalled();
  });
});
