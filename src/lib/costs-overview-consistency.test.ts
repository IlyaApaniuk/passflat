// FR-34 for the costs overview (spec 03 §Single-number surfaces, T028): the same building shows
// the same value and N on `/[city]/costs` (map pin, popup, card) as the building page's headline
// of that group. Both paths read one Prisma mock holding the same reports.

import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ buildings: vi.fn(), reports: vi.fn() }));

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/prisma', () => ({
  prisma: { building: { findMany: h.buildings }, costReport: { findMany: h.reports } },
}));

import { groupFigureRows } from './building-figures-view';
import { getBuildingsData } from './cost-aggregates';
import { RENTAL_TYPE_FILTERS } from './cost-figures';
import { loadBuildingFigures } from './cost-figures-query';
import { buildingsForRentalType } from './costs-overview-filter';

type Row = Record<string, unknown> & { rentalType: string | null };

const decimal = (value: number) => new Prisma.Decimal(String(value));
function row(source: string, rentalType: string | null, total: number, complete: boolean): Row {
  return {
    source,
    rentalType,
    rent: decimal(total - 700),
    adminFee: decimal(500),
    totalMonthlyAvg: decimal(total),
    areaM2: decimal(50),
    utilitiesComplete: complete,
    createdAt: new Date('2026-05-02T10:00:00Z'),
    confirmedAt: null,
  };
}

// A mixed building (golden example 1 plus a room), an asking-only building, and a building whose
// only tenant report is a known part beside three asking prices (example 14).
const BUILDINGS: Record<string, Row[]> = {
  mixed: [
    row('user', 'apartment', 4000, true),
    row('import', 'apartment', 3700, true),
    row('user', 'apartment', 3900, false),
    row('scraped', 'apartment', 4100, false),
    row('scraped', 'apartment', 3900, false),
    row('user', 'room', 2200, true),
  ],
  asking: [row('scraped', 'apartment', 4100, false), row('scraped', 'room', 3900, false)],
  knownPart: [
    row('user', 'apartment', 3100, false),
    row('scraped', 'apartment', 5000, false),
    row('scraped', 'apartment', 5200, false),
    row('scraped', 'apartment', 5400, false),
  ],
};

beforeEach(() => {
  h.buildings.mockReset().mockResolvedValue(
    Object.entries(BUILDINGS).map(([id, costReports]) => ({
      id,
      slug: id,
      addressFull: `Address ${id}`,
      district: { nameKey: 'Mokotów', slug: 'mokotow' },
      lat: 52.2,
      lng: 21,
      costReports,
    })),
  );
  h.reports
    .mockReset()
    .mockImplementation(async (args: { where: { buildingId: string; rentalType?: string } }) =>
      BUILDINGS[args.where.buildingId].filter(
        (report) => !args.where.rentalType || report.rentalType === args.where.rentalType,
      ),
    );
});

describe('costs overview vs building page (FR-34)', () => {
  it.each(RENTAL_TYPE_FILTERS)(
    'shows the building page headline of the chosen group, value and N, under %s',
    async (rentalType) => {
      const overview = buildingsForRentalType(
        await getBuildingsData('city-1', null, null),
        rentalType,
      );
      expect(overview.length).toBeGreaterThan(0);

      for (const building of overview) {
        const page = await loadBuildingFigures(building.id, rentalType);
        const group = page.groups[building.figure.group];
        const headline = group ? groupFigureRows(group).headline : null;

        expect(headline, building.id).not.toBeNull();
        expect(building.figure.metric, building.id).toBe(headline!.key);
        expect(building.figure.value, building.id).toBe(headline!.figure.median);
        expect(building.figure.n, building.id).toBe(headline!.figure.n);
        // The tenant group is chosen whenever the building page has a tenant headline.
        if (page.groups.tenant && groupFigureRows(page.groups.tenant).headline) {
          expect(building.figure.group, building.id).toBe('tenant');
        }
      }
    },
  );

  it('picks tenant 3,700 (3), asking 4,000 (2) and the tenant known part 3,100 (1) under all', async () => {
    const overview = buildingsForRentalType(await getBuildingsData('city-1', null, null), 'all');
    expect(
      overview.map((b) => [b.id, b.figure.group, b.figure.metric, b.figure.value, b.figure.n]),
    ).toEqual([
      ['mixed', 'tenant', 'completeTotal', 3700, 3],
      ['asking', 'asking', 'knownPartTotal', 4000, 2],
      ['knownPart', 'tenant', 'knownPartTotal', 3100, 1],
    ]);
  });
});
