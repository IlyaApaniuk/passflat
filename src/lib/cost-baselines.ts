import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { computeStats, median, perAreaValues } from '@/lib/cost-stats';

/**
 * Median + typical p25–p75 band for one cost metric across an area's reports.
 * `null` everywhere when the area has no usable data for that metric.
 */
export type AreaMetric = { median: number | null; p25: number | null; p75: number | null };

/**
 * Area-level (district or city) cost statistics across all visible reports.
 * Powers the dashboard "you vs your area" comparison (position bars) and the
 * personal share landing (the Аренда/Расходы split + the typical range).
 */
export type AreaStats = {
  total: AreaMetric;
  rentPerM2: AreaMetric;
  totalPerM2: AreaMetric;
  /** Median rent and median expenses (total − rent), for the Аренда/Расходы split. */
  rentMedian: number | null;
  expensesMedian: number | null;
  count: number;
};

const num = (v: unknown) => (v == null ? null : Number(v));

const metricOf = (values: Array<number | null>): AreaMetric => {
  const s = computeStats(values);
  return s ? { median: s.median, p25: s.p25, p75: s.p75 } : { median: null, p25: null, p75: null };
};

async function computeAreaStats(buildingWhere: Record<string, unknown>): Promise<AreaStats> {
  const reports = await prisma.costReport.findMany({
    where: { building: buildingWhere, isVisible: true, totalMonthlyAvg: { not: null } },
    select: { totalMonthlyAvg: true, rent: true, areaM2: true },
    take: 5000,
  });

  const totals = reports.map((r) => num(r.totalMonthlyAvg));
  const rents = reports.map((r) => num(r.rent));
  const expenses = reports.map((r) => {
    const t = num(r.totalMonthlyAvg);
    const rent = num(r.rent);
    return t != null && rent != null ? t - rent : null;
  });

  return {
    total: metricOf(totals),
    rentPerM2: metricOf(
      perAreaValues(reports.map((r) => ({ value: num(r.rent), areaM2: num(r.areaM2) }))),
    ),
    totalPerM2: metricOf(
      perAreaValues(reports.map((r) => ({ value: num(r.totalMonthlyAvg), areaM2: num(r.areaM2) }))),
    ),
    rentMedian: median(rents),
    expensesMedian: median(expenses),
    count: reports.length,
  };
}

// React `cache()` = per-request memoization (NOT the Next data cache): a fresh
// submit still recomputes on the next request, but repeated lookups of the same
// district/city within one render (the dashboard fetches stats per report, many
// sharing a district) dedupe to a single query.
export const getDistrictCostStats = cache((districtId: string) => computeAreaStats({ districtId }));

export const getCityCostStats = cache((cityId: string) => computeAreaStats({ cityId }));
