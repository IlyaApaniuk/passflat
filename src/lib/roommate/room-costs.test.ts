import { beforeEach, describe, expect, it, vi } from 'vitest';

import { summarizeFigures, type AreaReference, type FigureReport } from '@/lib/cost-figures';

/**
 * The room cost reference's data (PRD 3 FR-17, spec 06 §Room cost reference): the D61 split
 * rule over the figure contract, and which loader calls `loadRoomCostAreas` makes. The loader
 * is mocked here; `src/lib/bot/roommate-room-costs.test.ts` runs it over reports.
 */

const h = vi.hoisted(() => ({ loadAreaReference: vi.fn() }));
vi.mock('@/lib/cost-figures-query', () => ({ loadAreaReference: h.loadAreaReference }));

import { loadRoomCostAreas, perPersonSplit, roundHalfUpTo10 } from './room-costs';

function report(source: string, totalMonthlyAvg: number, utilitiesComplete = true): FigureReport {
  return { source, rentalType: 'apartment', totalMonthlyAvg, utilitiesComplete };
}

function reference(
  reports: FigureReport[],
  level: AreaReference['level'] = 'district',
): AreaReference {
  return {
    level,
    slug: level === 'district' ? 'mokotow' : 'warsaw',
    name: level === 'district' ? 'Mokotów' : 'city.warsaw',
    summary: summarizeFigures(reports, { level, rentalType: 'apartment' }),
  };
}

/** PRD 3 §5 example 2: Mokotów tenant apartment totals, median 4,850 zł, N = 6. */
const MOKOTOW_FLATS = [4_200, 4_600, 4_800, 4_900, 5_100, 5_400].map((total) =>
  report('user', total),
);

describe('roundHalfUpTo10', () => {
  it.each([
    [2_425, 2_430],
    [2_424, 2_420],
    [2_424.99, 2_420],
    [2_425.01, 2_430],
    [2_430, 2_430],
    [4_850 / 2, 2_430],
    [5, 10],
    [4, 0],
  ])('%s → %s', (value, expected) => {
    expect(roundHalfUpTo10(value)).toBe(expected);
  });
});

describe('perPersonSplit (D61)', () => {
  it('halves the tenant all-in median of whole flats: the golden case 4,850 → 2,430 (N 6, Mokotów)', () => {
    expect(perPersonSplit(reference(MOKOTOW_FLATS))).toEqual({
      value: 2_430,
      n: 6,
      level: 'district',
      name: 'Mokotów',
    });
  });

  it('takes the level and name of the flat figures, here the city', () => {
    expect(perPersonSplit(reference(MOKOTOW_FLATS, 'city'))).toMatchObject({
      level: 'city',
      name: 'city.warsaw',
    });
  });

  it('counts import reports as tenant reports', () => {
    const split = perPersonSplit(reference([report('user', 4_000), report('import', 5_000)]));
    expect(split).toMatchObject({ value: 2_250, n: 2 });
  });

  it('needs at least 2 tenant all-in totals', () => {
    expect(perPersonSplit(reference([report('user', 4_000)]))).toBeNull();
    // Three tenant reports, but only one is complete: the all-in median rests on N = 1.
    const oneComplete = [
      report('user', 4_000),
      report('user', 4_400, false),
      report('import', 4_600, false),
    ];
    expect(perPersonSplit(reference(oneComplete))).toBeNull();
  });

  it('never halves a known part of the costs', () => {
    const knownPart = [report('user', 4_000, false), report('user', 4_400, false)];
    expect(perPersonSplit(reference(knownPart))).toBeNull();
  });

  it('never uses asking prices, even when they are complete', () => {
    const asking = [report('scraped', 4_000), report('scraped', 4_400), report('scraped', 4_600)];
    expect(perPersonSplit(reference(asking))).toBeNull();
    // Beside tenant totals, the asking prices do not move the value or the N.
    const mixed = perPersonSplit(reference([...MOKOTOW_FLATS, ...asking, ...asking]));
    expect(mixed).toMatchObject({ value: 2_430, n: 6 });
  });

  it('is null without a reference or without tenant reports', () => {
    expect(perPersonSplit(null)).toBeNull();
    expect(perPersonSplit(reference([]))).toBeNull();
  });
});

describe('loadRoomCostAreas', () => {
  const city = {
    id: 'city-1',
    districts: [
      { id: 'd-mok', slug: 'mokotow', nameKey: 'Mokotów' },
      { id: 'd-wes', slug: 'wesola', nameKey: 'Wesoła' },
    ],
  };

  beforeEach(() => {
    h.loadAreaReference.mockReset();
    h.loadAreaReference.mockImplementation(async ({ rentalType }: { rentalType: string }) =>
      rentalType === 'apartment' ? reference(MOKOTOW_FLATS) : null,
    );
  });

  it('loads the room figures and the flat figures of each chosen district, in its order', async () => {
    const areas = await loadRoomCostAreas(city, ['wesola', 'mokotow']);

    expect(areas.map((area) => area.district)).toEqual([
      { slug: 'wesola', name: 'Wesoła' },
      { slug: 'mokotow', name: 'Mokotów' },
    ]);
    expect(h.loadAreaReference.mock.calls.map(([args]) => args)).toEqual([
      { districtId: 'd-wes', cityId: 'city-1', rentalType: 'room' },
      { districtId: 'd-wes', cityId: 'city-1', rentalType: 'apartment' },
      { districtId: 'd-mok', cityId: 'city-1', rentalType: 'room' },
      { districtId: 'd-mok', cityId: 'city-1', rentalType: 'apartment' },
    ]);
    expect(areas[0]).toMatchObject({ room: null, split: { value: 2_430, n: 6 } });
  });

  it('loads Warsaw for "any" (no district)', async () => {
    const areas = await loadRoomCostAreas(city, []);
    expect(areas).toHaveLength(1);
    expect(areas[0].district).toBeNull();
    expect(h.loadAreaReference.mock.calls.map(([args]) => args)).toEqual([
      { districtId: null, cityId: 'city-1', rentalType: 'room' },
      { districtId: null, cityId: 'city-1', rentalType: 'apartment' },
    ]);
  });

  it('leaves out a repeated slug and a slug the city does not have', async () => {
    const areas = await loadRoomCostAreas(city, ['mokotow', 'old-slug', 'mokotow']);
    expect(areas.map((area) => area.district?.slug)).toEqual(['mokotow']);
  });

  it('answers for Warsaw when no chosen district is in the city', async () => {
    const areas = await loadRoomCostAreas(city, ['old-slug']);
    expect(areas.map((area) => area.district)).toEqual([null]);
  });

  it('passes a loader error on', async () => {
    h.loadAreaReference.mockRejectedValue(new Error('db down'));
    await expect(loadRoomCostAreas(city, ['mokotow'])).rejects.toThrow('db down');
  });
});
