import { describe, expect, it } from 'vitest';
import { buildingDetailViewedProperties, reportSourceCounts } from './building-events';

describe('reportSourceCounts', () => {
  it('counts reports per source (spec example: user, user, scraped)', () => {
    expect(reportSourceCounts(['user', 'user', 'scraped'])).toEqual({
      report_count: 3,
      user_count: 2,
      import_count: 0,
      scraped_count: 1,
    });
  });

  it('gives all zeros for a building without reports', () => {
    expect(reportSourceCounts([])).toEqual({
      report_count: 0,
      user_count: 0,
      import_count: 0,
      scraped_count: 0,
    });
  });

  it('counts import reports', () => {
    expect(reportSourceCounts(['import', 'user', 'import'])).toEqual({
      report_count: 3,
      user_count: 1,
      import_count: 2,
      scraped_count: 0,
    });
  });

  it('keeps an unknown source in the total only', () => {
    expect(reportSourceCounts(['user', 'legacy'])).toEqual({
      report_count: 2,
      user_count: 1,
      import_count: 0,
      scraped_count: 0,
    });
  });
});

describe('buildingDetailViewedProperties', () => {
  it('keeps building_id, building_slug and city and adds the counts', () => {
    expect(
      buildingDetailViewedProperties(
        { id: 'b-1', slug: 'pulawska-10' },
        'warsaw',
        reportSourceCounts(['user', 'user', 'scraped']),
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
