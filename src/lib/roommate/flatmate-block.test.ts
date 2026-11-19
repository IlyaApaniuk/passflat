import { describe, expect, it } from 'vitest';

import { flatmateBlockView } from './flatmate-block';

const DISTRICTS = [
  { slug: 'mokotow', name: 'Mokotów' },
  { slug: 'wola', name: 'Wola' },
];

describe('flatmateBlockView', () => {
  it('counts: the total and the named districts with the website names, in the given order', () => {
    expect(
      flatmateBlockView(
        {
          status: 'counts',
          total: 5,
          top: [
            { slug: 'wola', count: 3 },
            { slug: 'mokotow', count: 2 },
          ],
        },
        DISTRICTS,
      ),
    ).toEqual({
      countLine: 'count',
      total: 5,
      districts: [
        { slug: 'wola', name: 'Wola', count: 3 },
        { slug: 'mokotow', name: 'Mokotów', count: 2 },
      ],
    });
  });

  it('a slug missing from the city districts stands for itself', () => {
    expect(
      flatmateBlockView(
        { status: 'counts', total: 1, top: [{ slug: 'ursus', count: 1 }] },
        DISTRICTS,
      ).districts,
    ).toEqual([{ slug: 'ursus', name: 'ursus', count: 1 }]);
  });

  it('zero: "be among the first", no number, no districts', () => {
    expect(flatmateBlockView({ status: 'counts', total: 0, top: [] }, DISTRICTS)).toEqual({
      countLine: 'first',
      total: 0,
      districts: [],
    });
  });

  it('a database error: no count sentence and no districts', () => {
    expect(flatmateBlockView({ status: 'unavailable' }, DISTRICTS)).toEqual({
      countLine: 'none',
      total: 0,
      districts: [],
    });
  });

  it('passes the per-district counts through and never adds them up', () => {
    // A profile naming two districts counts in each (spec 06 §Counts): 3 + 2 > total 4.
    const view = flatmateBlockView(
      {
        status: 'counts',
        total: 4,
        top: [
          { slug: 'wola', count: 3 },
          { slug: 'mokotow', count: 2 },
        ],
      },
      DISTRICTS,
    );
    expect(view.total).toBe(4);
    expect(view.districts.map((district) => district.count)).toEqual([3, 2]);
  });
});
