import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BuildingCostsClient } from './client';
import { getAlternates, getOgImage } from '@/lib/seo';
import { computeStats, median, perAreaValues, type CostStats } from '@/lib/cost-stats';
import { periodicChargesMonthlyTotal } from '@/lib/periodic-charges';
import type { Metadata } from 'next';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ locale: string; city: string; slug: string }>;
}

type NumericField =
  | 'rent'
  | 'adminFee'
  | 'electricityAvg'
  | 'electricityWinter'
  | 'electricitySummer'
  | 'gas'
  | 'heating'
  | 'heatingWinter'
  | 'heatingSummer'
  | 'water'
  | 'internet'
  | 'otherCosts'
  | 'totalMonthlyAvg'
  | 'depositAmount';

type BoolField = 'electricityIncluded' | 'heatingIncluded' | 'waterIncluded';

function statsForField(
  reports: Array<Record<string, unknown>>,
  field: NumericField,
): CostStats | null {
  return computeStats(
    reports.map((r) => {
      const v = r[field];
      return v == null ? null : Number(v);
    }),
  );
}

// Per-square-metre statistics: compute value/area per report, then aggregate.
function statsPerM2(
  reports: Array<Record<string, unknown>>,
  field: NumericField,
): CostStats | null {
  return computeStats(
    perAreaValues(
      reports.map((r) => ({
        value: r[field] as number | null,
        areaM2: r.areaM2 as number | null,
      })),
    ),
  );
}

async function findBuildingBySlugOrUuid(citySlug: string, slug: string) {
  const city = await prisma.city.findUnique({ where: { slug: citySlug }, select: { id: true } });
  if (!city) return null;

  if (!UUID_RE.test(slug)) {
    return prisma.building.findUnique({
      where: { cityId_slug: { cityId: city.id, slug } },
      include: {
        district: true,
        city: true,
        costReports: {
          where: { isVisible: true },
          orderBy: { createdAt: 'desc' as const },
          include: { periodicCharges: true },
        },
      },
    });
  }

  return prisma.building.findUnique({
    where: { id: slug },
    include: {
      district: true,
      city: true,
      costReports: {
        where: { isVisible: true },
        orderBy: { createdAt: 'desc' as const },
        include: { periodicCharges: true },
      },
    },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, city } = await params;

  const cityRecord = await prisma.city.findUnique({ where: { slug: city }, select: { id: true } });
  if (!cityRecord) return { title: 'Building not found' };

  const building = UUID_RE.test(slug)
    ? await prisma.building.findUnique({
        where: { id: slug },
        include: { district: true, city: true },
      })
    : await prisma.building.findUnique({
        where: { cityId_slug: { cityId: cityRecord.id, slug } },
        include: { district: true, city: true },
      });

  if (!building) return { title: 'Building not found' };

  const t = await getTranslations();
  const cityName = t(building.city.nameKey);

  const title = `${building.addressFull} — Cost Reports | Passflat`;
  const description = `Real rental costs for ${building.addressFull}, ${building.district?.nameKey ?? cityName}. Crowdsourced from actual tenants.`;

  return {
    title,
    description,
    alternates: getAlternates(`/${city}/building/${building.slug}`),
    openGraph: {
      title,
      description,
      images: [getOgImage(building.addressFull, cityName)],
    },
  };
}

export default async function BuildingCostsPage({ params }: PageProps) {
  const { city: citySlug, slug } = await params;

  const building = await findBuildingBySlugOrUuid(citySlug, slug);

  if (!building) notFound();

  if (UUID_RE.test(slug)) {
    redirect(`/${citySlug}/building/${building.slug}`);
  }

  const reports = building.costReports;
  const reportCount = reports.length;

  const recs = reports as unknown as Array<Record<string, unknown>>;
  function countIncluded(field: BoolField) {
    return recs.filter((r) => r[field] === true).length;
  }

  const costs =
    reportCount > 0
      ? {
          rent: statsForField(recs, 'rent'),
          adminFee: statsForField(recs, 'adminFee'),
          electricity: statsForField(recs, 'electricityAvg'),
          electricityWinter: statsForField(recs, 'electricityWinter'),
          electricitySummer: statsForField(recs, 'electricitySummer'),
          gas: statsForField(recs, 'gas'),
          heating: statsForField(recs, 'heating'),
          heatingWinter: statsForField(recs, 'heatingWinter'),
          heatingSummer: statsForField(recs, 'heatingSummer'),
          water: statsForField(recs, 'water'),
          internet: statsForField(recs, 'internet'),
          otherCosts: statsForField(recs, 'otherCosts'),
          periodic: computeStats(
            reports.map((r) => {
              const total = periodicChargesMonthlyTotal(r.periodicCharges);
              return total > 0 ? total : null;
            }),
          ),
          totalMonthlyAvg: statsForField(recs, 'totalMonthlyAvg'),
          deposit: statsForField(recs, 'depositAmount'),
        }
      : null;

  // Per-m² metrics: only rent, czynsz (adminFee) and heating scale with area.
  // Metered utilities (water/gas/electricity/internet) are per-person/fixed.
  const perM2 =
    reportCount > 0
      ? {
          rent: statsPerM2(recs, 'rent'),
          adminFee: statsPerM2(recs, 'adminFee'),
          heating: statsPerM2(recs, 'heating'),
        }
      : null;

  const includedCounts =
    reportCount > 0
      ? {
          electricity: countIncluded('electricityIncluded'),
          heating: countIncluded('heatingIncluded'),
          water: countIncluded('waterIncluded'),
          total: reportCount,
        }
      : null;

  // Comparison baselines.
  //
  // Crowdsourced rents are right-skewed, so an arithmetic mean inflates the
  // baseline and makes buildings look artificially cheap. We therefore compute
  // the MEDIAN (with a p25–p75 spread, a sample size, the district rent/m² and
  // the building's percentile) from the raw per-report distributions. Each
  // distribution is fetched once and reused for all of those derived figures.
  const DISTRIBUTION_LIMIT = 5000;
  const buildingMedianTotal = costs?.totalMonthlyAvg?.median ?? null;

  type Baseline = {
    median: number;
    p25: number;
    p75: number;
    count: number;
    rentPerM2: number | null;
    percentile: number | null;
  };

  // Percentile = share of area reports priced ABOVE this building's median,
  // i.e. "cheaper than ~X% of reports in the area".
  function cheaperThanPercentile(values: number[], buildingMedian: number | null): number | null {
    if (buildingMedian == null || values.length === 0) return null;
    const pricier = values.filter((v) => v > buildingMedian).length;
    return Math.round((pricier / values.length) * 100);
  }

  let districtBaseline: Baseline | null = null;
  if (building.districtId) {
    const districtReports = await prisma.costReport.findMany({
      where: {
        building: { districtId: building.districtId },
        isVisible: true,
        totalMonthlyAvg: { not: null },
      },
      select: { totalMonthlyAvg: true, rent: true, areaM2: true },
      take: DISTRIBUTION_LIMIT,
    });
    const totals = districtReports
      .map((r) => (r.totalMonthlyAvg == null ? null : Number(r.totalMonthlyAvg)))
      .filter((v): v is number => v != null && Number.isFinite(v));
    const stats = computeStats(totals);
    if (stats) {
      districtBaseline = {
        median: stats.median,
        p25: stats.p25,
        p75: stats.p75,
        count: stats.count,
        rentPerM2: median(
          perAreaValues(
            districtReports.map((r) => ({
              value: r.rent == null ? null : Number(r.rent),
              areaM2: r.areaM2 == null ? null : Number(r.areaM2),
            })),
          ),
        ),
        percentile: cheaperThanPercentile(totals, buildingMedianTotal),
      };
    }
  }

  const cityReports = await prisma.costReport.findMany({
    where: {
      building: { cityId: building.cityId },
      isVisible: true,
      totalMonthlyAvg: { not: null },
    },
    select: { totalMonthlyAvg: true },
    take: DISTRIBUTION_LIMIT,
  });
  const cityTotals = cityReports
    .map((r) => (r.totalMonthlyAvg == null ? null : Number(r.totalMonthlyAvg)))
    .filter((v): v is number => v != null && Number.isFinite(v));
  const cityStats = computeStats(cityTotals);
  const cityBaseline: Baseline | null = cityStats
    ? {
        median: cityStats.median,
        p25: cityStats.p25,
        p75: cityStats.p75,
        count: cityStats.count,
        rentPerM2: null,
        percentile: cheaperThanPercentile(cityTotals, buildingMedianTotal),
      }
    : null;

  const lastUpdated = reports[0]?.createdAt.toISOString() ?? null;

  let hasContributedData = false;
  let costAccessUntil: string | null = null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const [existingReport, profile] = await Promise.all([
      prisma.costReport.findFirst({
        where: { authorId: user.id },
        select: { id: true },
      }),
      prisma.profile.findUnique({
        where: { id: user.id },
        select: { costAccessUntil: true },
      }),
    ]);
    hasContributedData = !!existingReport;
    if (profile?.costAccessUntil) {
      costAccessUntil = profile.costAccessUntil.toISOString();
    }
  }

  return (
    <BuildingCostsClient
      building={{
        id: building.id,
        slug: building.slug,
        address: building.addressFull,
        district: building.district?.nameKey ?? '',
        districtSlug: building.district?.slug ?? '',
        city: building.city.nameKey,
      }}
      reports={reportCount}
      lastUpdated={lastUpdated}
      costs={costs}
      perM2={perM2}
      comparison={{
        thisBuilding: buildingMedianTotal,
        thisBuildingRentPerM2: perM2?.rent?.median ?? null,
        district: districtBaseline,
        city: cityBaseline,
      }}
      includedCounts={includedCounts}
      hasContributedData={hasContributedData}
      costAccessUntil={costAccessUntil}
      citySlug={citySlug}
    />
  );
}
