import { prisma } from '@/lib/prisma';
import { median, perAreaValues } from '@/lib/cost-stats';

/**
 * Median total + per-m² (rent and total) across all visible cost reports in an
 * area (district or city). Powers the dashboard "you vs your area" comparison.
 * Cached + tagged 'costs' so it invalidates with the rest of the cost data.
 */
export type AreaCostMedians = {
  total: number | null;
  rentPerM2: number | null;
  totalPerM2: number | null;
  count: number;
};

const num = (v: unknown) => (v == null ? null : Number(v));
const roundOrNull = (v: number | null) => (v == null ? null : Math.round(v));

async function computeAreaMedians(
  buildingWhere: Record<string, unknown>,
): Promise<AreaCostMedians> {
  const reports = await prisma.costReport.findMany({
    where: { building: buildingWhere, isVisible: true, totalMonthlyAvg: { not: null } },
    select: { totalMonthlyAvg: true, rent: true, areaM2: true },
    take: 5000,
  });
  return {
    total: roundOrNull(median(reports.map((r) => num(r.totalMonthlyAvg)))),
    rentPerM2: roundOrNull(
      median(perAreaValues(reports.map((r) => ({ value: num(r.rent), areaM2: num(r.areaM2) })))),
    ),
    totalPerM2: roundOrNull(
      median(
        perAreaValues(
          reports.map((r) => ({ value: num(r.totalMonthlyAvg), areaM2: num(r.areaM2) })),
        ),
      ),
    ),
    count: reports.length,
  };
}

// Deliberately NOT cached: the dashboard is per-user and dynamic, and a fresh
// submit must reflect immediately. Each call is two scoped median queries —
// cheap at this scale. (unstable_cache + revalidateTag proved unreliable for
// on-demand busting under Next 16's legacy cache, so we just read live here.)
export const getDistrictCostMedians = (districtId: string) => computeAreaMedians({ districtId });

export const getCityCostMedians = (cityId: string) => computeAreaMedians({ cityId });
