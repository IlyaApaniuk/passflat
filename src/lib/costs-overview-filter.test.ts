import { describe, expect, it } from 'vitest';

import type { RentalTypeFilter, SingleNumberFigure } from './cost-figures';
import { buildingsForRentalType } from './costs-overview-filter';

function figure(
  value: number,
  n: number,
  overrides: Partial<SingleNumberFigure> = {},
): SingleNumberFigure {
  return {
    group: 'tenant',
    metric: 'completeTotal',
    value,
    n,
    reportCount: n,
    rent: null,
    expenses: null,
    rentPerM2: null,
    completeTotalPerM2: null,
    ...overrides,
  };
}

function building(
  id: string,
  figures: Record<RentalTypeFilter, SingleNumberFigure | null>,
  rentalType: string | null,
) {
  return { id, districtSlug: 'mokotow', rentalType, figures };
}

// A mixed building whose dominant type is the flat, a rooms-only building with asking prices,
// and a building whose reports carry no usable value.
const MIXED = building(
  'mixed',
  { all: figure(4300, 3), apartment: figure(4400, 2), room: figure(2200, 1) },
  'apartment',
);
const ROOMS = building(
  'rooms',
  {
    all: figure(2000, 3, { group: 'asking', metric: 'knownPartTotal' }),
    apartment: null,
    room: figure(2000, 3, { group: 'asking', metric: 'knownPartTotal' }),
  },
  'room',
);
const EMPTY = building('empty', { all: null, apartment: null, room: null }, null);
const ALL = [MIXED, ROOMS, EMPTY];

describe('buildingsForRentalType', () => {
  it('gives each building the figure of "all" and drops a building without a usable value', () => {
    const all = buildingsForRentalType(ALL, 'all');

    expect(all.map((b) => [b.id, b.figure.value, b.figure.n, b.rentalType])).toEqual([
      ['mixed', 4300, 3, 'apartment'],
      ['rooms', 2000, 3, 'room'],
    ]);
  });

  it('shows a mixed building under "room" with its room figure, tagged as a room', () => {
    const rooms = buildingsForRentalType(ALL, 'room');

    expect(rooms.map((b) => b.id)).toEqual(['mixed', 'rooms']);
    expect(rooms[0]).toMatchObject({
      id: 'mixed',
      rentalType: 'room',
      figure: { value: 2200, n: 1 },
    });
  });

  it('hides buildings without a figure of the type', () => {
    expect(buildingsForRentalType(ALL, 'apartment').map((b) => b.id)).toEqual(['mixed']);
    expect(buildingsForRentalType([EMPTY], 'room')).toEqual([]);
  });

  it("keeps each figure's group and metric as the contract chose them", () => {
    const [, rooms] = buildingsForRentalType(ALL, 'room');
    expect(rooms.figure).toMatchObject({ group: 'asking', metric: 'knownPartTotal' });
  });

  it('does not change the input buildings', () => {
    buildingsForRentalType(ALL, 'room');
    expect(MIXED).toEqual(
      building(
        'mixed',
        { all: figure(4300, 3), apartment: figure(4400, 2), room: figure(2200, 1) },
        'apartment',
      ),
    );
  });
});
