import { describe, expect, it } from 'vitest';
import { buildingsForRentalType, type BuildingTypeFigures } from './costs-overview-filter';

const NONE: BuildingTypeFigures = { medianTotal: null, medianRent: null, reports: 0 };

function building(
  id: string,
  districtSlug: string,
  byType: { apartment: BuildingTypeFigures; room: BuildingTypeFigures },
  rentalType: string | null,
) {
  return {
    id,
    districtSlug,
    reports: byType.apartment.reports + byType.room.reports + 1,
    medianTotal: 4300,
    medianRent: 3500,
    medianAdminFee: 500,
    medianRentPerM2: 70,
    medianTotalPerM2: 86,
    medianAdminFeePerM2: 10,
    medianExpenses: 800,
    rentalType,
    byType,
  };
}

// A mixed building whose dominant type is the flat, a rooms-only building, and a building whose
// reports all lack a rental type.
const MIXED = building(
  'mixed',
  'mokotow',
  {
    apartment: { medianTotal: 4400, medianRent: 3600, reports: 2 },
    room: { medianTotal: 2200, medianRent: 1800, reports: 1 },
  },
  'apartment',
);
const ROOMS = building(
  'rooms',
  'wola',
  { apartment: NONE, room: { medianTotal: 2000, medianRent: 1600, reports: 3 } },
  'room',
);
const UNKNOWN = building('unknown', 'wola', { apartment: NONE, room: NONE }, null);
const ALL = [MIXED, ROOMS, UNKNOWN];

describe('buildingsForRentalType', () => {
  it('returns every building unchanged for "all"', () => {
    expect(buildingsForRentalType(ALL, 'all')).toBe(ALL);
  });

  it('shows a mixed building under "room" with its room figures, not its dominant type', () => {
    const rooms = buildingsForRentalType(ALL, 'room');

    expect(rooms.map((b) => b.id)).toEqual(['mixed', 'rooms']);
    expect(rooms[0]).toMatchObject({
      id: 'mixed',
      reports: 1,
      medianTotal: 2200,
      medianRent: 1800,
      rentalType: 'room',
    });
  });

  it('hides buildings without a report of the type', () => {
    expect(buildingsForRentalType(ALL, 'apartment').map((b) => b.id)).toEqual(['mixed']);
    expect(buildingsForRentalType([UNKNOWN], 'room')).toEqual([]);
  });

  it('makes report counts follow the filter', () => {
    const total = (type: 'all' | 'apartment' | 'room') =>
      buildingsForRentalType(ALL, type).reduce((sum, b) => sum + b.reports, 0);

    expect(total('all')).toBe(4 + 4 + 1);
    expect(total('room')).toBe(1 + 3);
    expect(total('apartment')).toBe(2);
  });

  it('clears the metrics byType does not carry instead of mixing types', () => {
    const [mixed] = buildingsForRentalType(ALL, 'apartment');

    expect(mixed).toMatchObject({
      medianTotal: 4400,
      medianRent: 3600,
      medianAdminFee: 0,
      medianRentPerM2: null,
      medianTotalPerM2: null,
      medianAdminFeePerM2: null,
      medianExpenses: null,
    });
  });

  it('does not change the input buildings', () => {
    buildingsForRentalType(ALL, 'room');
    expect(MIXED).toMatchObject({ reports: 4, medianTotal: 4300, rentalType: 'apartment' });
  });
});
