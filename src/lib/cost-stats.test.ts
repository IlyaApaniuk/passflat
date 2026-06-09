import { describe, expect, it } from 'vitest';

import { computeStats, confidenceTier, median, perAreaValues } from './cost-stats';

describe('median', () => {
  it('returns null for empty / all-invalid input', () => {
    expect(median([])).toBeNull();
    expect(median([null, undefined, NaN])).toBeNull();
  });

  it('ignores non-finite values and rounds the result', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, null, 2, undefined, 3, NaN, 4])).toBe(median([1, 2, 3, 4]));
  });

  it('interpolates between the two middle values for even counts', () => {
    // (2 + 4) / 2 = 3
    expect(median([2, 4])).toBe(3);
  });
});

describe('computeStats', () => {
  it('returns null when there is no usable data', () => {
    expect(computeStats([])).toBeNull();
    expect(computeStats([null, undefined])).toBeNull();
  });

  it('computes median-first statistics over a clean dataset', () => {
    const stats = computeStats([10, 20, 30, 40, 50]);
    expect(stats).not.toBeNull();
    expect(stats).toMatchObject({
      median: 30,
      p25: 20,
      p75: 40,
      min: 10,
      max: 50,
      avg: 30,
      count: 5,
    });
  });

  it('drops far outliers when trimOutliers is enabled', () => {
    // The 100000 spike should be trimmed; the kept count drops below the input length.
    const trimmed = computeStats([10, 11, 12, 13, 100000], { trimOutliers: true });
    expect(trimmed).not.toBeNull();
    expect(trimmed!.count).toBeLessThan(5);
    expect(trimmed!.max).toBeLessThan(100000);
  });
});

describe('confidenceTier', () => {
  it('treats a single report as low confidence', () => {
    expect(confidenceTier(0)).toBe('low');
    expect(confidenceTier(1)).toBe('low');
  });

  it('treats 2..4 reports as early/medium data', () => {
    expect(confidenceTier(2)).toBe('medium');
    expect(confidenceTier(4)).toBe('medium');
  });

  it('treats reliableMin+ reports as high confidence', () => {
    expect(confidenceTier(5)).toBe('high');
    expect(confidenceTier(20)).toBe('high');
  });
});

describe('perAreaValues', () => {
  it('computes per-report value/area ratios and skips bad rows', () => {
    const result = perAreaValues([
      { value: 100, areaM2: 50 }, // 2
      { value: 90, areaM2: 30 }, // 3
      { value: 100, areaM2: 0 }, // skipped (zero area)
      { value: null, areaM2: 40 }, // skipped (missing value)
      { value: 80, areaM2: null }, // skipped (missing area)
    ]);
    expect(result).toEqual([2, 3]);
  });
});
