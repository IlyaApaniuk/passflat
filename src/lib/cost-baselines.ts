import { unstable_cache } from 'next/cache';
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

export const getDistrictCostMedians = unstable_cache(
  (districtId: string) => computeAreaMedians({ districtId }),
  ['area-district-medians'],
  { revalidate: 600, tags: ['costs'] },
);

export const getCityCostMedians = unstable_cache(
  (cityId: string) => computeAreaMedians({ cityId }),
  ['area-city-medians'],
  { revalidate: 600, tags: ['costs'] },
);
