import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { median, perAreaValues } from '@/lib/cost-stats';

/**
 * Cost aggregation for the SEO surfaces (city hub + district pages). The mapping
 * mirrors the costs-overview query (`costs/page.tsx`) field-for-field so the
 * numbers match exactly; kept as a separate cache key to avoid touching that
 * working page. Consolidate the two when the overview is next refactored. All
 * values are reduced to plain, JSON-serializable medians inside the cache so the
 * nested joins are not re-run on every request.
 */
export type BuildingCostData = {
  id: string;
  slug: string;
  address: string;
  district: string;
  districtSlug: string;
  reports: number;
  medianTotal: number;
  medianRent: number;
  medianAdminFee: number;
  medianRentPerM2: number | null;
  medianTotalPerM2: number | null;
  medianAdminFeePerM2: number | null;
  medianExpenses: number | null;
  lat: number | null;
  lng: number | null;
  rentalType: string | null;
};

// Buildings + their visible cost reports, reduced to per-building medians.
// Keyed by the arguments (city + filters). Only visible reports count.
export const getBuildingsData = unstable_cache(
  async (
    cityId: string,
    districtFilter: string | null,
    searchQuery: string | null,
  ): Promise<BuildingCostData[]> => {
    const buildingWhere: Record<string, unknown> = { cityId };
    if (districtFilter) buildingWhere.district = { slug: districtFilter };
    if (searchQuery) buildingWhere.addressFull = { contains: searchQuery, mode: 'insensitive' };

    const buildings = await prisma.building.findMany({
      where: { ...buildingWhere, costReports: { some: { isVisible: true } } },
      include: {
        district: true,
        costReports: {
          where: { isVisible: true },
          select: {
            rent: true,
            adminFee: true,
            totalMonthlyAvg: true,
            areaM2: true,
            rentalType: true,
            // FUTURE (paid utility analytics): add electricityAvg, gas, heating,
            // water here, then compute per-building medians in the .map() below.
          },
        },
      },
      orderBy: { costReports: { _count: 'desc' } },
    });

    return buildings.map((b) => {
      const reports = b.costReports;
      const count = reports.length;

      const rentalTypes = reports.map((r) => r.rentalType).filter((v): v is string => v !== null);
      const dominantRentalType =
        rentalTypes.length > 0
          ? Object.entries(
              rentalTypes.reduce<Record<string, number>>((acc, t) => {
                acc[t] = (acc[t] || 0) + 1;
                return acc;
              }, {}),
            ).sort((a, b) => b[1] - a[1])[0][0]
          : null;

      const num = (v: unknown) => (v == null ? null : Number(v));

      return {
        id: b.id,
        slug: b.slug,
        address: b.addressFull,
        district: b.district?.nameKey ?? '',
        districtSlug: b.district?.slug ?? '',
        reports: count,
        medianTotal: median(reports.map((r) => num(r.totalMonthlyAvg))) ?? 0,
        medianRent: median(reports.map((r) => num(r.rent))) ?? 0,
        medianAdminFee: median(reports.map((r) => num(r.adminFee))) ?? 0,
        // Per-report (total − rent) then median — the typical non-rent spend.
        medianExpenses: median(
          reports.map((r) => {
            const tot = num(r.totalMonthlyAvg);
            const rnt = num(r.rent);
            return tot != null && rnt != null ? tot - rnt : null;
          }),
        ),
        // Per-report ratio, then median — never average-of-averages.
        medianRentPerM2: median(
          perAreaValues(reports.map((r) => ({ value: num(r.rent), areaM2: num(r.areaM2) }))),
        ),
        medianTotalPerM2: median(
          perAreaValues(
            reports.map((r) => ({ value: num(r.totalMonthlyAvg), areaM2: num(r.areaM2) })),
          ),
        ),
        medianAdminFeePerM2: median(
          perAreaValues(reports.map((r) => ({ value: num(r.adminFee), areaM2: num(r.areaM2) }))),
        ),
        lat: b.lat ? Number(b.lat) : null,
        lng: b.lng ? Number(b.lng) : null,
        rentalType: dominantRentalType,
      };
    });
  },
  ['cost-aggregates-buildings'],
  { revalidate: 300, tags: ['costs'] },
);

export type DistrictRollup = {
  slug: string;
  name: string;
  buildingCount: number;
  reportCount: number;
  medianTotal: number;
  medianRent: number;
  medianAdminFee: number;
  medianRentPerM2: number;
  medianTotalPerM2: number;
  medianExpenses: number;
};

/**
 * Roll building-level medians up to a per-district median-of-medians. Districts
 * with no covered buildings are dropped; the rest are sorted by report volume.
 */
export function rollUpDistricts(
  buildings: BuildingCostData[],
  districts: Array<{ slug: string; nameKey: string }>,
): DistrictRollup[] {
  const medianOf = (values: number[]) => median(values.filter((v) => v > 0)) ?? 0;

  return districts
    .map((d) => {
      const dBuildings = buildings.filter((b) => b.districtSlug === d.slug);
      if (dBuildings.length === 0) return null;
      const reportCount = dBuildings.reduce((s, b) => s + b.reports, 0);
      return {
        slug: d.slug,
        name: d.nameKey,
        buildingCount: dBuildings.length,
        reportCount,
        medianTotal: medianOf(dBuildings.map((b) => b.medianTotal)),
        medianRent: medianOf(dBuildings.map((b) => b.medianRent)),
        medianAdminFee: medianOf(dBuildings.map((b) => b.medianAdminFee)),
        medianRentPerM2: medianOf(dBuildings.map((b) => b.medianRentPerM2 ?? 0)),
        medianTotalPerM2: medianOf(dBuildings.map((b) => b.medianTotalPerM2 ?? 0)),
        medianExpenses: medianOf(dBuildings.map((b) => b.medianExpenses ?? 0)),
      };
    })
    .filter((d): d is DistrictRollup => d !== null)
    .sort((a, b) => b.reportCount - a.reportCount);
}
