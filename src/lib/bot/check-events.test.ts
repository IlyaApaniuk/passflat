import { describe, expect, it } from 'vitest';

import {
  summarizeFigures,
  type AreaReference,
  type FigureReport,
  type FigureSummary,
} from '@/lib/cost-figures';

import { checkEventProperties, districtCheckEventProperties } from './check-events';
import type { AddressLookup } from './lookup';
import { ENTRY_SOURCE } from './start-payload';

function report(source: string, fields: Partial<FigureReport> = {}): FigureReport {
  return { source, rentalType: 'apartment', utilitiesComplete: true, ...fields };
}

const building = (reports: FigureReport[]): FigureSummary =>
  summarizeFigures(reports, { level: 'building', rentalType: 'all' });

function reference(level: AreaReference['level'], reports: FigureReport[]): AreaReference {
  return {
    level,
    slug: level === 'district' ? 'mokotow' : 'warsaw',
    name: level === 'district' ? 'Mokotów' : 'Warszawa',
    summary: summarizeFigures(reports, { level, rentalType: 'all' }),
  };
}

/** Five complete tenant totals and two asking prices in the area. */
const areaReports = [
  ...[3_700, 4_000, 4_400, 5_000, 5_400].map((total) =>
    report('user', { totalMonthlyAvg: total, rent: total - 800 }),
  ),
  report('scraped', { totalMonthlyAvg: 4_200, rent: 3_600, utilitiesComplete: false }),
  report('scraped', { totalMonthlyAvg: 4_600, rent: 3_900, utilitiesComplete: false }),
];

type LookupFields = Pick<
  AddressLookup,
  'level' | 'districtSlug' | 'buildingId' | 'building' | 'reference'
>;

const lookup = (fields: Partial<LookupFields> = {}): LookupFields => ({
  level: 'building',
  districtSlug: 'mokotow',
  buildingId: 'building-1',
  building: building([
    report('user', { totalMonthlyAvg: 4_000, rent: 3_200 }),
    report('import', { totalMonthlyAvg: 3_800, rent: 3_000 }),
  ]),
  reference: reference('district', areaReports),
  ...fields,
});

describe('checkEventProperties (tg_address_checked)', () => {
  it('keeps the four existing properties and adds the entry source and answer quality', () => {
    expect(checkEventProperties(lookup(), ENTRY_SOURCE.typedAddress)).toEqual({
      level: 'building',
      district: 'mokotow',
      has_building: true,
      report_count: 2,
      entry_source: 'typed_address',
      lookup_level: 'building',
      source_kind: 'tenant',
      n: 2,
      incomplete: false,
    });
  });

  it('records a building link as link_building', () => {
    expect(checkEventProperties(lookup(), ENTRY_SOURCE.linkBuilding)).toMatchObject({
      entry_source: 'link_building',
    });
  });

  it('describes the tenant group of a mixed building, the asking group only without tenants', () => {
    const mixed = building([
      report('user', { totalMonthlyAvg: 4_000, rent: 3_200 }),
      report('scraped', { totalMonthlyAvg: 4_500, rent: 3_800 }),
      report('scraped', { totalMonthlyAvg: 4_700, rent: 3_900 }),
    ]);
    expect(checkEventProperties(lookup({ building: mixed }), 'typed_address')).toMatchObject({
      source_kind: 'mixed',
      n: 1,
      report_count: 3,
    });

    const asking = building([
      report('scraped', { totalMonthlyAvg: 4_500, rent: 3_800 }),
      report('scraped', { totalMonthlyAvg: 4_700, rent: 3_900 }),
    ]);
    expect(checkEventProperties(lookup({ building: asking }), 'typed_address')).toMatchObject({
      source_kind: 'asking',
      n: 2,
      incomplete: false,
    });
  });

  it('flags a known-part headline as incomplete', () => {
    const knownPart = building([
      report('user', { totalMonthlyAvg: 3_900, rent: 3_200, utilitiesComplete: false }),
    ]);
    expect(checkEventProperties(lookup({ building: knownPart }), 'typed_address')).toMatchObject({
      source_kind: 'tenant',
      n: 1,
      incomplete: true,
    });
  });

  it('describes the district reference for a building nobody reported', () => {
    const props = checkEventProperties(
      lookup({ level: 'district', building: building([]) }),
      ENTRY_SOURCE.linkBuilding,
    );
    expect(props).toEqual({
      level: 'district',
      district: 'mokotow',
      has_building: true,
      report_count: 0,
      entry_source: 'link_building',
      lookup_level: 'district',
      source_kind: 'mixed',
      n: 5,
      incomplete: false,
    });
  });

  it('describes the city reference for an address without a building row', () => {
    const props = checkEventProperties(
      lookup({
        level: 'city',
        districtSlug: null,
        buildingId: null,
        building: null,
        reference: reference('city', areaReports.slice(0, 3)),
      }),
      ENTRY_SOURCE.typedAddress,
    );
    expect(props).toMatchObject({
      level: 'city',
      lookup_level: 'city',
      district: null,
      has_building: false,
      report_count: 0,
      source_kind: 'tenant',
      n: 3,
    });
  });

  it('answers none with N 0 when neither the building nor an area has a report', () => {
    expect(
      checkEventProperties(
        lookup({ level: 'city', building: building([]), reference: null }),
        'typed_address',
      ),
    ).toMatchObject({ lookup_level: 'city', source_kind: 'none', n: 0, incomplete: false });
  });

  it('carries no free text: only these keys, and no address or area name', () => {
    const props = checkEventProperties(lookup(), ENTRY_SOURCE.typedAddress);
    expect(Object.keys(props).sort()).toEqual([
      'district',
      'entry_source',
      'has_building',
      'incomplete',
      'level',
      'lookup_level',
      'n',
      'report_count',
      'source_kind',
    ]);
    const values = JSON.stringify(Object.values(props));
    expect(values).not.toContain('Mokotów');
    expect(values).not.toContain('Puławska');
  });
});

describe('districtCheckEventProperties (tg_district_checked)', () => {
  const district = (ref: AreaReference | null) => ({
    slug: 'mokotow',
    name: 'Mokotów',
    reportCount: 12,
    reference: ref,
  });

  it('keeps district and report_count and adds the entry source and answer quality', () => {
    expect(
      districtCheckEventProperties(
        district(reference('district', areaReports)),
        ENTRY_SOURCE.typedDistrict,
      ),
    ).toEqual({
      district: 'mokotow',
      report_count: 12,
      entry_source: 'typed_district',
      source_kind: 'mixed',
      n: 5,
      incomplete: false,
    });
  });

  it('records a district link as link_district', () => {
    expect(
      districtCheckEventProperties(
        district(reference('district', areaReports)),
        ENTRY_SOURCE.linkDistrict,
      ),
    ).toMatchObject({ entry_source: 'link_district' });
  });

  it('describes the city reference of a thin district', () => {
    const thin = { ...district(reference('city', areaReports.slice(0, 2))), reportCount: 2 };
    expect(districtCheckEventProperties(thin, 'typed_district')).toMatchObject({
      report_count: 2,
      source_kind: 'tenant',
      n: 2,
    });
  });

  it('answers none without a reference', () => {
    expect(districtCheckEventProperties(district(null), 'link_district')).toMatchObject({
      source_kind: 'none',
      n: 0,
      incomplete: false,
    });
  });

  it('carries no free text: only these keys, never the district name', () => {
    const props = districtCheckEventProperties(
      district(reference('district', areaReports)),
      'typed_district',
    );
    expect(Object.keys(props).sort()).toEqual([
      'district',
      'entry_source',
      'incomplete',
      'n',
      'report_count',
      'source_kind',
    ]);
    expect(JSON.stringify(Object.values(props))).not.toContain('Mokotów');
  });
});
