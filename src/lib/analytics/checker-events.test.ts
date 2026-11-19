import { describe, expect, it } from 'vitest';

import {
  answerProperties,
  summarizeFigures,
  type AreaReference,
  type FigureReport,
} from '@/lib/cost-figures';
import { addressCheckedProperties } from './checker-events';

const building = { level: 'building', rentalType: 'all' } as const;
const report = (
  source: string,
  totalMonthlyAvg: number,
  utilitiesComplete: boolean,
): FigureReport => ({ source, rent: 3000, totalMonthlyAvg, utilitiesComplete });

const area = (level: AreaReference['level'], reports: FigureReport[]): AreaReference => ({
  level,
  slug: level === 'district' ? 'mokotow' : 'warsaw',
  name: level === 'district' ? 'Mokotów' : 'cities.warsaw',
  summary: summarizeFigures(reports, { level, rentalType: 'all' }),
});

const check = { buildingId: 'bld_1', hasData: true, source: 'address_search' } as const;

describe('addressCheckedProperties', () => {
  it('keeps the existing properties and adds the building answer', () => {
    const figures = summarizeFigures(
      [report('user', 4000, true), report('scraped', 4100, false)],
      building,
    );
    expect(addressCheckedProperties('warsaw', check, answerProperties(figures, null))).toEqual({
      city: 'warsaw',
      building_id: 'bld_1',
      has_data: true,
      source: 'address_search',
      answer_level: 'building',
      source_kind: 'mixed',
      n: 1,
      incomplete: false,
    });
  });

  it('reports a district reference for a building without reports', () => {
    const district = area('district', [
      report('user', 3900, false),
      report('user', 4000, false),
      report('import', 4100, false),
      report('user', 4200, false),
      report('user', 4300, false),
    ]);
    const props = addressCheckedProperties(
      'warsaw',
      { buildingId: 'bld_2', hasData: false, source: 'shared_url' },
      answerProperties(summarizeFigures([], building), district),
    );
    expect(props).toEqual({
      city: 'warsaw',
      building_id: 'bld_2',
      has_data: false,
      source: 'shared_url',
      answer_level: 'district',
      source_kind: 'tenant',
      n: 5,
      incomplete: true,
    });
  });

  it('reports a city reference of asking prices', () => {
    const city = area('city', [report('scraped', 3800, false), report('scraped', 3900, false)]);
    expect(
      addressCheckedProperties(
        'warsaw',
        { ...check, hasData: false },
        answerProperties(summarizeFigures([], building), city),
      ),
    ).toMatchObject({ has_data: false, answer_level: 'city', source_kind: 'asking', n: 2 });
  });

  it('reports no answer when neither the building nor the area has a report', () => {
    expect(
      addressCheckedProperties(
        'warsaw',
        { ...check, hasData: false },
        answerProperties(summarizeFigures([], building), null),
      ),
    ).toMatchObject({ answer_level: 'none', source_kind: 'none', n: 0, incomplete: false });
  });

  it('sends no free text, address or area name', () => {
    const props = addressCheckedProperties(
      'warsaw',
      check,
      answerProperties(summarizeFigures([report('user', 4000, true)], building), null),
    );
    expect(Object.keys(props).sort()).toEqual(
      [
        'answer_level',
        'building_id',
        'city',
        'has_data',
        'incomplete',
        'n',
        'source',
        'source_kind',
      ].sort(),
    );
  });
});
