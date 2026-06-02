// Robust statistics helpers for crowdsourced cost data.
//
// Crowdsourced rental costs are noisy and prone to typos/outliers, so we present
// the MEDIAN (with a p25–p75 spread) as the primary statistic rather than the mean.
// All helpers operate on plain number arrays and ignore non-finite values.

export interface CostStats {
  /** Median — the primary displayed value. */
  median: number;
  /** 25th percentile (lower end of the typical range). */
  p25: number;
  /** 75th percentile (upper end of the typical range). */
  p75: number;
  min: number;
  max: number;
  /** Arithmetic mean — kept as small secondary text only. */
  avg: number;
  /** Number of reports the statistic is based on. */
  count: number;
}

function clean(values: Array<number | null | undefined>): number[] {
  return values.filter((v): v is number => v != null && Number.isFinite(v));
}

/** Linear-interpolation quantile over an already-sorted ascending array. */
function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lower = sorted[base];
  const upper = sorted[base + 1] ?? lower;
  return lower + rest * (upper - lower);
}

export function median(values: Array<number | null | undefined>): number | null {
  const nums = clean(values);
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  return Math.round(quantileSorted(sorted, 0.5));
}

/**
 * Compute median-first statistics for a set of values.
 * Returns null when there is no usable data.
 *
 * `trimOutliers` (default off) drops values outside median ± 2.5·MAD before
 * computing the displayed statistics. Median is already robust, so this is a
 * mild belt-and-braces option for very dirty fields.
 */
export function computeStats(
  values: Array<number | null | undefined>,
  options: { trimOutliers?: boolean } = {},
): CostStats | null {
  let nums = clean(values);
  if (nums.length === 0) return null;

  if (options.trimOutliers && nums.length >= 4) {
    const sorted = [...nums].sort((a, b) => a - b);
    const med = quantileSorted(sorted, 0.5);
    const absDev = sorted.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
    const mad = quantileSorted(absDev, 0.5);
    if (mad > 0) {
      const bound = 2.5 * mad;
      const trimmed = nums.filter((v) => Math.abs(v - med) <= bound);
      if (trimmed.length > 0) nums = trimmed;
    }
  }

  const sorted = [...nums].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    median: Math.round(quantileSorted(sorted, 0.5)),
    p25: Math.round(quantileSorted(sorted, 0.25)),
    p75: Math.round(quantileSorted(sorted, 0.75)),
    min: Math.round(sorted[0]),
    max: Math.round(sorted[sorted.length - 1]),
    avg: Math.round(sum / sorted.length),
    count: sorted.length,
  };
}

/**
 * Per-report ratio values for a "per square metre" metric. Computes value/area
 * for each report individually (never average-of-averages) and skips reports
 * with a missing or zero area.
 */
export function perAreaValues(
  reports: Array<{ value: number | null | undefined; areaM2: number | null | undefined }>,
): number[] {
  return reports
    .map(({ value, areaM2 }) => {
      if (value == null || areaM2 == null) return null;
      const area = Number(areaM2);
      if (!Number.isFinite(area) || area <= 0) return null;
      const v = Number(value);
      if (!Number.isFinite(v)) return null;
      return v / area;
    })
    .filter((v): v is number => v !== null);
}

/** Number of months since the given date (returns null for missing dates). */
export function monthsSince(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  return diffMs / (1000 * 60 * 60 * 24 * 30.44);
}

export const TRUST_THRESHOLDS = {
  /** Below this many reports the figures are flagged as a preliminary estimate. */
  lowDataMax: 3,
  /** At/above this many reports the figures are flagged as reliable. */
  reliableMin: 5,
  /** Reports older than this many months are flagged as potentially outdated. */
  staleMonths: 12,
} as const;
