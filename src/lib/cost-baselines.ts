import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { computeStats, median, perAreaValues } from '@/lib/cost-stats';

/**
 * Median + typical p25–p75 band for one cost metric across an area's reports.
 * `null` everywhere when the area has no usable data for that metric.
 */
type AreaMetric = { median: number | null; p25: number | null; p75: number | null };

/**
 * District cost statistics across all visible reports (one blended number).
 * Powers only the bot's cheapest-first district table and rank, which T054
 * moves to the single-number rule (spec 03 §Single-number surfaces). Every
 * other surface reads the figure contract (`cost-figures-query.ts`).
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
// district within one render (the share page reads it for its metadata and its
// body) dedupe to a single query.
export const getDistrictCostStats = cache((districtId: string) => computeAreaStats({ districtId }));
