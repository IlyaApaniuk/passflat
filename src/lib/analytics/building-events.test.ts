import { describe, expect, it } from 'vitest';
import { answerProperties, summarizeFigures, type FigureReport } from '@/lib/cost-figures';
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

const summaryOf = (reports: FigureReport[], level: 'building' | 'district' | 'city') =>
  summarizeFigures(reports, { level, rentalType: 'all' });

describe('buildingDetailViewedProperties', () => {
  const building = { id: 'b-1', slug: 'pulawska-10' };

  it('keeps building_id, building_slug and city and adds the counts and the answer quality', () => {
    const figures = summaryOf(
      [
        { source: 'user', rent: 3000, totalMonthlyAvg: 3800, utilitiesComplete: true },
        { source: 'user', rent: 3200, totalMonthlyAvg: 3900, utilitiesComplete: false },
        { source: 'scraped', rent: 3300 },
      ],
      'building',
    );
    expect(
      buildingDetailViewedProperties(
        building,
        'warsaw',
        reportSourceCounts(figures),
        answerProperties(figures, null),
      ),
    ).toEqual({
      building_id: 'b-1',
      building_slug: 'pulawska-10',
      city: 'warsaw',
      report_count: 3,
      user_count: 2,
      import_count: 0,
      scraped_count: 1,
      answer_level: 'building',
      source_kind: 'mixed',
      n: 1,
      incomplete: false,
    });
  });

  it('reports a district reference for a building without reports, with its headline N', () => {
    const figures = summaryOf([], 'building');
    const reference = {
      level: 'district' as const,
      summary: summaryOf(
        [
          { source: 'user', totalMonthlyAvg: 3900, utilitiesComplete: false },
          { source: 'import', totalMonthlyAvg: 3700, utilitiesComplete: false },
          { source: 'user', totalMonthlyAvg: 3600, utilitiesComplete: null },
          { source: 'user', rent: 3000 },
          { source: 'user', rent: 3100 },
        ],
        'district',
      ),
    };
    expect(
      buildingDetailViewedProperties(
        building,
        'warsaw',
        reportSourceCounts(figures),
        answerProperties(figures, reference),
      ),
    ).toMatchObject({
      report_count: 0,
      answer_level: 'district',
      source_kind: 'tenant',
      n: 3,
      incomplete: true,
    });
  });

  it('reports a city reference and no answer at all', () => {
    const figures = summaryOf([], 'building');
    const city = {
      level: 'city' as const,
      summary: summaryOf([{ source: 'scraped', rent: 3300 }], 'city'),
    };
    expect(
      buildingDetailViewedProperties(
        building,
        'warsaw',
        reportSourceCounts(figures),
        answerProperties(figures, city),
      ),
    ).toMatchObject({ answer_level: 'city', source_kind: 'asking', n: 1, incomplete: false });
    expect(
      buildingDetailViewedProperties(
        building,
        'warsaw',
        reportSourceCounts(figures),
        answerProperties(figures, null),
      ),
    ).toMatchObject({ answer_level: 'none', source_kind: 'none', n: 0, incomplete: false });
  });
});
