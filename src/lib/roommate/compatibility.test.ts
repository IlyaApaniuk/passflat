import { describe, expect, it } from 'vitest';

import {
  BUDGET_BAND_TOLERANCE,
  MOVE_IN_MONTH_TOLERANCE,
  isCompatible,
  type CompatibilityProfile,
} from './compatibility';

/**
 * The compatibility rule of spec 07 §Compatibility (PRD 3 FR-24): every golden row of PRD 3 §5
 * example 3 in both argument orders, each "no" row turned into a "yes" by fixing only the field
 * its "Why" names (so the row fails for that reason alone), then each rule on its own and a
 * symmetry sweep. Month values are UTC-midnight dates, as `@db.Date` returns them.
 */

const month = (year: number, m: number) => new Date(Date.UTC(year, m - 1, 1));

function profile(fields: Partial<CompatibilityProfile> = {}): CompatibilityProfile {
  return {
    districtSlugs: ['mokotow'],
    anyDistrict: false,
    budgetBand: 'b3',
    moveInMonth: month(2027, 2),
    languages: ['ru'],
    gender: 'woman',
    prefers: 'anyone',
    ...fields,
  };
}

const any = { districtSlugs: [], anyDistrict: true };

/** A = Mokotów + Ochota, b3, February 2027, RU + EN, woman, live with women. */
const A = profile({
  districtSlugs: ['mokotow', 'ochota'],
  languages: ['ru', 'en'],
  prefers: 'women',
});

type GoldenRow = {
  name: string;
  b: CompatibilityProfile;
  expected: boolean;
  why: string;
  /** The one change that makes a "no" row compatible: the row fails for its reason alone. */
  fix: Partial<CompatibilityProfile>;
};

const GOLDEN: GoldenRow[] = [
  {
    name: 'B',
    b: profile({
      districtSlugs: ['ochota'],
      budgetBand: 'b4',
      moveInMonth: month(2027, 3),
      languages: ['en', 'pl'],
    }),
    expected: true,
    why: 'Ochota, adjacent bands, 1 month, EN',
    fix: {},
  },
  {
    name: 'C',
    b: profile({ districtSlugs: ['wola'] }),
    expected: false,
    why: 'no shared district',
    fix: { districtSlugs: ['wola', 'ochota'] },
  },
  {
    name: 'D',
    b: profile({ ...any, moveInMonth: month(2027, 4) }),
    expected: false,
    why: '2 months apart',
    fix: { moveInMonth: month(2027, 3) },
  },
  {
    name: 'E',
    b: profile({ gender: null }),
    expected: false,
    why: 'A accepts only a stated woman',
    fix: { gender: 'woman' },
  },
  {
    name: 'F',
    b: profile({ budgetBand: 'b1' }),
    expected: false,
    why: 'bands two steps apart',
    fix: { budgetBand: 'b2' },
  },
  {
    name: 'G',
    b: profile({ languages: ['uk'] }),
    expected: false,
    why: 'no shared language',
    fix: { languages: ['uk', 'en'] },
  },
  {
    name: 'H',
    b: profile({
      ...any,
      budgetBand: 'b2',
      moveInMonth: month(2027, 1),
      languages: ['ru', 'uk'],
      prefers: 'men',
    }),
    expected: false,
    why: 'H accepts only men',
    fix: { prefers: 'women' },
  },
];

describe('golden cases: PRD 3 §5 example 3', () => {
  it.each(GOLDEN)('A and $name: compatible $expected ($why)', ({ b, expected }) => {
    expect(isCompatible(A, b)).toBe(expected);
  });

  it.each(GOLDEN)(
    '$name and A, arguments swapped: compatible $expected ($why)',
    ({ b, expected }) => {
      expect(isCompatible(b, A)).toBe(expected);
    },
  );

  it.each(GOLDEN.filter(({ expected }) => !expected))(
    '$name fails only for its reason: fixing that field makes it compatible both ways',
    ({ b, fix }) => {
      const fixed = { ...b, ...fix };
      expect(isCompatible(A, fixed)).toBe(true);
      expect(isCompatible(fixed, A)).toBe(true);
    },
  );
});

describe('rule 1: districts', () => {
  it('one shared slug is enough', () => {
    expect(
      isCompatible(
        profile({ districtSlugs: ['wola', 'bemowo'] }),
        profile({ districtSlugs: ['ursus', 'bemowo'] }),
      ),
    ).toBe(true);
  });

  it('no shared slug fails', () => {
    expect(
      isCompatible(profile({ districtSlugs: ['wola'] }), profile({ districtSlugs: ['ursus'] })),
    ).toBe(false);
  });

  it('"any" on either side fits every district set, and two "any" fit each other', () => {
    const wola = profile({ districtSlugs: ['wola'] });
    expect(isCompatible(profile(any), wola)).toBe(true);
    expect(isCompatible(wola, profile(any))).toBe(true);
    expect(isCompatible(profile(any), profile(any))).toBe(true);
  });
});

describe('rule 2: budget bands', () => {
  it(`the tolerance is ${BUDGET_BAND_TOLERANCE} band`, () => {
    expect(BUDGET_BAND_TOLERANCE).toBe(1);
  });

  it.each([
    ['b3', 'b3', true],
    ['b2', 'b3', true],
    ['b4', 'b5', true],
    ['b1', 'b2', true],
    ['b2', 'b4', false],
    ['b1', 'b5', false],
    ['b3', 'b5', false],
  ])('%s and %s: %s, both ways', (x, y, expected) => {
    expect(isCompatible(profile({ budgetBand: x }), profile({ budgetBand: y }))).toBe(expected);
    expect(isCompatible(profile({ budgetBand: y }), profile({ budgetBand: x }))).toBe(expected);
  });

  it('a missing or unknown band fits nothing', () => {
    expect(isCompatible(profile({ budgetBand: null }), profile())).toBe(false);
    expect(isCompatible(profile(), profile({ budgetBand: null }))).toBe(false);
    expect(isCompatible(profile({ budgetBand: 'b6' }), profile({ budgetBand: 'b5' }))).toBe(false);
    expect(isCompatible(profile({ budgetBand: null }), profile({ budgetBand: null }))).toBe(false);
  });
});

describe('rule 3: move-in month', () => {
  it(`the tolerance is ${MOVE_IN_MONTH_TOLERANCE} calendar month`, () => {
    expect(MOVE_IN_MONTH_TOLERANCE).toBe(1);
  });

  it.each<[Date, Date, boolean]>([
    [month(2027, 2), month(2027, 2), true],
    [month(2027, 2), month(2027, 3), true],
    [month(2026, 12), month(2027, 1), true],
    [month(2026, 12), month(2027, 2), false],
    [month(2026, 11), month(2027, 11), false],
    [month(2027, 1), month(2026, 12), true],
  ])('%s and %s: %s, both ways', (x, y, expected) => {
    expect(isCompatible(profile({ moveInMonth: x }), profile({ moveInMonth: y }))).toBe(expected);
    expect(isCompatible(profile({ moveInMonth: y }), profile({ moveInMonth: x }))).toBe(expected);
  });

  it('a missing month fits nothing', () => {
    expect(isCompatible(profile({ moveInMonth: null }), profile())).toBe(false);
    expect(isCompatible(profile(), profile({ moveInMonth: null }))).toBe(false);
  });
});

describe('rule 4: languages', () => {
  it('one shared language is enough', () => {
    expect(
      isCompatible(profile({ languages: ['pl', 'en'] }), profile({ languages: ['uk', 'en'] })),
    ).toBe(true);
  });

  it('no shared language, or none at all, fails', () => {
    expect(isCompatible(profile({ languages: ['pl'] }), profile({ languages: ['uk'] }))).toBe(
      false,
    );
    expect(isCompatible(profile({ languages: [] }), profile({ languages: [] }))).toBe(false);
  });
});

describe('rule 5: "live with" is mutual', () => {
  const GENDERS = ['woman', 'man', null] as const;
  const PREFERS = ['anyone', 'women', 'men'] as const;
  const acceptsOne = (prefers: string, gender: string | null) =>
    prefers === 'anyone' ||
    (prefers === 'women' && gender === 'woman') ||
    (prefers === 'men' && gender === 'man');

  it.each<[string, string | null, boolean]>([
    ['anyone', 'woman', true],
    ['anyone', 'man', true],
    ['anyone', null, true],
    ['women', 'woman', true],
    ['women', 'man', false],
    ['women', null, false],
    ['men', 'man', true],
    ['men', 'woman', false],
    ['men', null, false],
  ])('a profile that lives with %s accepts gender %s: %s', (prefers, gender, expected) => {
    const other = profile({ gender, prefers: 'anyone' });
    expect(isCompatible(profile({ prefers }), other)).toBe(expected);
    expect(isCompatible(other, profile({ prefers }))).toBe(expected);
  });

  it('both sides must accept each other, for every combination', () => {
    for (const ga of GENDERS) {
      for (const pa of PREFERS) {
        for (const gb of GENDERS) {
          for (const pb of PREFERS) {
            const a = profile({ gender: ga, prefers: pa });
            const b = profile({ gender: gb, prefers: pb });
            expect(isCompatible(a, b)).toBe(acceptsOne(pa, gb) && acceptsOne(pb, ga));
          }
        }
      }
    }
  });

  it('an unknown "live with" value accepts nobody', () => {
    expect(isCompatible(profile({ prefers: 'others' }), profile())).toBe(false);
  });
});

describe('symmetry', () => {
  it('isCompatible(a, b) equals isCompatible(b, a) over a grid of profiles', () => {
    const grid: CompatibilityProfile[] = [];
    for (const districts of [['mokotow'], ['wola'], ['mokotow', 'wola'], 'any'] as const) {
      for (const budgetBand of ['b1', 'b2', 'b3', null]) {
        for (const moveInMonth of [month(2026, 12), month(2027, 1), month(2027, 3)]) {
          for (const languages of [['ru'], ['uk', 'en']]) {
            for (const [gender, prefers] of [
              ['woman', 'women'],
              ['man', 'anyone'],
              [null, 'anyone'],
              ['woman', 'men'],
            ] as const) {
              grid.push(
                profile({
                  ...(districts === 'any' ? any : { districtSlugs: [...districts] }),
                  budgetBand,
                  moveInMonth,
                  languages,
                  gender,
                  prefers,
                }),
              );
            }
          }
        }
      }
    }
    let compatiblePairs = 0;
    for (const a of grid) {
      for (const b of grid) {
        expect(isCompatible(a, b)).toBe(isCompatible(b, a));
        if (isCompatible(a, b)) compatiblePairs += 1;
      }
    }
    // The grid has both outcomes, so the sweep is not vacuous.
    expect(compatiblePairs).toBeGreaterThan(0);
    expect(compatiblePairs).toBeLessThan(grid.length * grid.length);
  });
});
