import { describe, expect, it } from 'vitest';
import { summarizeFigures, type FigureReport } from '@/lib/cost-figures';
import { buildingDetailViewedProperties, reportSourceCounts } from './building-events';

const countsOf = (sources: string[]) =>
  reportSourceCounts(
    summarizeFigures(
      sources.map((source): FigureReport => ({ source, rent: 3000 })),
      { level: 'building', rentalType: 'all' },
    ),
  );

describe('reportSourceCounts', () => {
  it('takes the counts from the contract (spec example: user, user, scraped)', () => {
    expect(countsOf(['user', 'user', 'scraped'])).toEqual({
      report_count: 3,
      user_count: 2,
      import_count: 0,
      scraped_count: 1,
    });
  });

  it('gives all zeros for a building without reports', () => {
    expect(countsOf([])).toEqual({
      report_count: 0,
      user_count: 0,
      import_count: 0,
      scraped_count: 0,
    });
  });

  it('counts import reports', () => {
    expect(countsOf(['import', 'user', 'import'])).toEqual({
      report_count: 3,
      user_count: 1,
      import_count: 2,
      scraped_count: 0,
    });
  });

  it('leaves out a report whose source is in no figure group, as the contract does', () => {
    expect(countsOf(['user', 'legacy'])).toEqual({
      report_count: 1,
      user_count: 1,
      import_count: 0,
      scraped_count: 0,
    });
  });

  it('maps reportCount and sourceCounts one to one', () => {
    expect(
      reportSourceCounts({ reportCount: 9, sourceCounts: { user: 4, import: 2, scraped: 3 } }),
    ).toEqual({ report_count: 9, user_count: 4, import_count: 2, scraped_count: 3 });
  });
});

describe('buildingDetailViewedProperties', () => {
  it('keeps building_id, building_slug and city and adds the counts', () => {
    expect(
      buildingDetailViewedProperties(
        { id: 'b-1', slug: 'pulawska-10' },
        'warsaw',
        countsOf(['user', 'user', 'scraped']),
      ),
    ).toEqual({
      building_id: 'b-1',
      building_slug: 'pulawska-10',
      city: 'warsaw',
      report_count: 3,
      user_count: 2,
      import_count: 0,
      scraped_count: 1,
    });
  });
});
