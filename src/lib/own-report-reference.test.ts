import { describe, expect, it } from 'vitest';

import { summarizeFigures, type AreaReference, type FigureReport } from '@/lib/cost-figures';
import {
  ownReportReference,
  ownReportRows,
  type OwnReportFigures,
  type OwnReportReference,
} from './own-report-reference';

const districtLevel = { level: 'district', rentalType: 'all' } as const;
const report = (
  source: string,
  rent: number,
  totalMonthlyAvg: number,
  utilitiesComplete: boolean | null,
  areaM2: number | null = 50,
): FigureReport => ({
  source,
  rentalType: 'apartment',
  rent,
  totalMonthlyAvg,
  utilitiesComplete,
  areaM2,
});

/** Golden example 1 of spec 03 as a district: tenant 3 reports, asking 2. */
const goldenDistrict: AreaReference = {
  level: 'district',
  slug: 'mokotow',
  name: 'Mokotów',
  summary: summarizeFigures(
    [
      report('user', 3200, 4000, true),
      report('import', 3000, 3700, true),
      report('user', 3400, 3900, false),
      report('scraped', 3500, 4100, false),
      report('scraped', 3300, 3900, false),
    ],
    districtLevel,
  ),
};

const completeOwn: OwnReportFigures = {
  total: 4200,
  rent: 3500,
  areaM2: 50,
  utilitiesComplete: true,
};

describe('ownReportReference (spec 03 §Comparisons)', () => {
  it('keeps the level, the name source and the tenant group with its N, nothing else', () => {
    const reference = ownReportReference(goldenDistrict);
    expect(reference).toEqual({
      level: 'district',
      slug: 'mokotow',
      name: 'Mokotów',
      tenant: {
        key: 'tenant',
        reportCount: 3,
        completeTotal: goldenDistrict.summary.groups.tenant!.completeTotal,
        rentPerM2: goldenDistrict.summary.groups.tenant!.rentPerM2,
        completeTotalPerM2: goldenDistrict.summary.groups.tenant!.completeTotalPerM2,
      },
    });
    // Asking prices are not what tenants pay: they never reach this block.
    expect(JSON.stringify(reference)).not.toContain('asking');
    expect(reference!.tenant.completeTotal).toMatchObject({ median: 3850, n: 2 });
  });

  it('is null without a reference, without tenant reports or for one observation', () => {
    expect(ownReportReference(null)).toBeNull();
    const askingOnly: AreaReference = {
      ...goldenDistrict,
      level: 'city',
      summary: summarizeFigures(
        [report('scraped', 3500, 4100, false), report('scraped', 3300, 3900, false)],
        { level: 'city', rentalType: 'all' },
      ),
    };
    expect(ownReportReference(askingOnly)).toBeNull();
    const oneTenant: AreaReference = {
      ...goldenDistrict,
      level: 'city',
      summary: summarizeFigures([report('user', 3200, 4000, true)], {
        level: 'city',
        rentalType: 'all',
      }),
    };
    expect(ownReportReference(oneTenant)).toBeNull();
  });
});

describe('ownReportRows (FR-25, FR-29)', () => {
  const reference = ownReportReference(goldenDistrict) as OwnReportReference;

  it('sets a complete report beside the tenant figure of the same metric, each with its N', () => {
    const { rows, knownPart } = ownReportRows(completeOwn, reference);
    expect(knownPart).toBe(false);
    expect(
      rows.map((row) => [row.key, row.labelKey, row.own, row.area?.median, row.area?.n]),
    ).toEqual([
      ['completeTotal', 'costs.compare.colTotal', 4200, 3850, 2],
      ['rentPerM2', 'costs.building.rentPerM2Compare', 70, 64, 3],
      ['completeTotalPerM2', 'costs.building.totalPerM2Compare', 84, 77, 2],
    ]);
  });

  it('labels an incomplete total as the known part and sets it beside nothing', () => {
    const { rows, knownPart } = ownReportRows(
      { ...completeOwn, utilitiesComplete: false },
      reference,
    );
    expect(knownPart).toBe(true);
    expect(rows.map((row) => row.key)).toEqual(['knownPartTotal', 'rentPerM2']);
    expect(rows[0]).toMatchObject({
      labelKey: 'costs.building.figures.knownPart',
      own: 4200,
      area: null,
    });
    // Rent per m² stays: rent is rent whatever the utilities.
    expect(rows[1].area).toMatchObject({ n: 3 });
  });

  it('treats a legacy null like the contract does (LEGACY_NULL_IS_COMPLETE = false)', () => {
    const { rows, knownPart } = ownReportRows(
      { ...completeOwn, utilitiesComplete: null },
      reference,
    );
    expect(knownPart).toBe(true);
    expect(rows[0].key).toBe('knownPartTotal');
  });

  it('shows the own values alone without a reference, and per-m² only with an area', () => {
    const alone = ownReportRows(completeOwn, null);
    expect(alone.rows.map((row) => row.area)).toEqual([null, null, null]);
    const noArea = ownReportRows({ ...completeOwn, areaM2: null }, reference);
    expect(noArea.rows.map((row) => row.key)).toEqual(['completeTotal']);
    expect(ownReportRows({ ...completeOwn, total: null, rent: null }, reference).rows).toEqual([]);
  });

  it('leaves the area side empty when the area has no value of that metric', () => {
    const noComplete: OwnReportReference = {
      ...reference,
      tenant: { ...reference.tenant, completeTotal: { median: null, p25: null, p75: null, n: 0 } },
    };
    const { rows } = ownReportRows(completeOwn, noComplete);
    expect(rows[0]).toMatchObject({ key: 'completeTotal', area: null });
  });
});
