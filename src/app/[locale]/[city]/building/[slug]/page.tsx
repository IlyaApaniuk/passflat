import { cache } from 'react';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { BuildingCostsClient } from './client';
import { getAlternates, getOgImage } from '@/lib/seo';
import { computeStats, median, monthsSince, perAreaValues, type CostStats } from '@/lib/cost-stats';
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

// ---------------------------------------------------------------------------
// React cache() wrappers — deduplicate across generateMetadata & page render
// ---------------------------------------------------------------------------

const costReportSelect = {
  rent: true,
  adminFee: true,
  electricityAvg: true,
  electricityWinter: true,
  electricitySummer: true,
  electricityIncluded: true,
  gas: true,
  heating: true,
  heatingWinter: true,
  heatingSummer: true,
  heatingIncluded: true,
  water: true,
  waterIncluded: true,
  internet: true,
  otherCosts: true,
  totalMonthlyAvg: true,
  depositAmount: true,
  depositReturned: true,
  depositReturnedAmount: true,
  depositReturnDays: true,
  isCurrentTenant: true,
  livedFrom: true,
  livedUntil: true,
  areaM2: true,
  createdAt: true,
  periodicCharges: { select: { amount: true, frequency: true } },
} as const;

const buildingQuery = {
  select: {
    id: true,
    slug: true,
    addressFull: true,
    cityId: true,
    districtId: true,
    district: { select: { nameKey: true, slug: true } },
    city: { select: { nameKey: true } },
    locationScore: { select: { overall: true, categories: true } },
    costReports: {
      where: { isVisible: true },
      orderBy: { createdAt: 'desc' as const },
      select: costReportSelect,
    },
  },
} as const;

const getCityId = cache(async (citySlug: string) => {
  const city = await prisma.city.findUnique({ where: { slug: citySlug }, select: { id: true } });
  return city?.id ?? null;
});

const getBuilding = cache(async (citySlug: string, slug: string) => {
  const cityId = await getCityId(citySlug);
  if (!cityId) return null;

  if (UUID_RE.test(slug)) {
    return prisma.building.findUnique({ where: { id: slug }, ...buildingQuery });
  }

  return prisma.building.findUnique({
    where: { cityId_slug: { cityId, slug } },
    ...buildingQuery,
  });
});

// ---------------------------------------------------------------------------
// Auth: cookie short-circuit — skip network call for anonymous visitors
// ---------------------------------------------------------------------------

async function resolveUserId(): Promise<string | null> {
  const store = await cookies();
  const hasAuthCookie = store
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));
  if (!hasAuthCookie) return null;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

// ---------------------------------------------------------------------------
// unstable_cache: baseline distributions (revalidate every 10 min)
// ---------------------------------------------------------------------------

const DISTRIBUTION_LIMIT = 5000;

// Median + the typical p25–p75 band, for the district position bars.
type StatRange = { median: number; p25: number; p75: number };

const toRange = (values: Array<number | null | undefined>): StatRange | null => {
  const s = computeStats(values);
  return s ? { median: s.median, p25: s.p25, p75: s.p75 } : null;
};

type CachedDistrictBaseline = {
  median: number;
  p25: number;
  p75: number;
  count: number;
  rent: StatRange | null;
  expenses: StatRange | null;
  rentPerM2: StatRange | null;
  totalPerM2: StatRange | null;
  totals: number[];
};

type CachedCityBaseline = {
  median: number;
  p25: number;
  p75: number;
  count: number;
  totals: number[];
};

const getDistrictBaseline = unstable_cache(
  async (districtId: string): Promise<CachedDistrictBaseline | null> => {
    const reports = await prisma.costReport.findMany({
      where: {
        building: { districtId },
        isVisible: true,
        totalMonthlyAvg: { not: null },
      },
      select: { totalMonthlyAvg: true, rent: true, areaM2: true },
      take: DISTRIBUTION_LIMIT,
    });

    const totals = reports
      .map((r) => (r.totalMonthlyAvg == null ? null : Number(r.totalMonthlyAvg)))
      .filter((v): v is number => v != null && Number.isFinite(v));

    const stats = computeStats(totals);
    if (!stats) return null;

    return {
      median: stats.median,
      p25: stats.p25,
      p75: stats.p75,
      count: stats.count,
      rent: toRange(reports.map((r) => (r.rent == null ? null : Number(r.rent)))),
      expenses: toRange(
        reports.map((r) => {
          const total = r.totalMonthlyAvg == null ? null : Number(r.totalMonthlyAvg);
          const rentVal = r.rent == null ? null : Number(r.rent);
          if (total == null || rentVal == null) return null;
          return Math.max(0, total - rentVal);
        }),
      ),
      rentPerM2: toRange(
        perAreaValues(
          reports.map((r) => ({
            value: r.rent == null ? null : Number(r.rent),
            areaM2: r.areaM2 == null ? null : Number(r.areaM2),
          })),
        ),
      ),
      totalPerM2: toRange(
        perAreaValues(
          reports.map((r) => ({
            value: r.totalMonthlyAvg == null ? null : Number(r.totalMonthlyAvg),
            areaM2: r.areaM2 == null ? null : Number(r.areaM2),
          })),
        ),
      ),
      totals,
    };
  },
  ['building-district-baseline'],
  { revalidate: 600, tags: ['costs'] },
);

const getCityBaseline = unstable_cache(
  async (cityId: string): Promise<CachedCityBaseline | null> => {
    const reports = await prisma.costReport.findMany({
      where: {
        building: { cityId },
        isVisible: true,
        totalMonthlyAvg: { not: null },
      },
      select: { totalMonthlyAvg: true },
      take: DISTRIBUTION_LIMIT,
    });

    const totals = reports
      .map((r) => (r.totalMonthlyAvg == null ? null : Number(r.totalMonthlyAvg)))
      .filter((v): v is number => v != null && Number.isFinite(v));

    const stats = computeStats(totals);
    if (!stats) return null;

    return {
      median: stats.median,
      p25: stats.p25,
      p75: stats.p75,
      count: stats.count,
      totals,
    };
  },
  ['building-city-baseline'],
  { revalidate: 600, tags: ['costs'] },
);

// ---------------------------------------------------------------------------

function cheaperThanPercentile(values: number[], buildingMedian: number | null): number | null {
  if (buildingMedian == null || values.length === 0) return null;
  const pricier = values.filter((v) => v > buildingMedian).length;
  return Math.round((pricier / values.length) * 100);
}

type Baseline = {
  median: number;
  p25: number;
  p75: number;
  count: number;
  rent: StatRange | null;
  expenses: StatRange | null;
  rentPerM2: StatRange | null;
  totalPerM2: StatRange | null;
  percentile: number | null;
};

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, city } = await params;
  const building = await getBuilding(city, slug);
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BuildingCostsPage({ params }: PageProps) {
  const { city: citySlug, slug } = await params;

  const building = await getBuilding(citySlug, slug);

  if (!building) notFound();

  if (UUID_RE.test(slug)) {
    redirect(`/${citySlug}/building/${building.slug}`);
  }

  const t = await getTranslations();

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
          // Expenses = everything on top of rent (czynsz/komunalka + utilities +
          // periodic). Computed per report, then median — never median-of-medians.
          expenses: computeStats(
            reports.map((r) => {
              const total = r.totalMonthlyAvg == null ? null : Number(r.totalMonthlyAvg);
              const rentVal = r.rent == null ? null : Number(r.rent);
              if (total == null || rentVal == null) return null;
              return Math.max(0, total - rentVal);
            }),
          ),
        }
      : null;

  const perM2 =
    reportCount > 0
      ? {
          rent: statsPerM2(recs, 'rent'),
          total: statsPerM2(recs, 'totalMonthlyAvg'),
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

  // Deposit-return reliability — a unique trust signal. Only past tenants who
  // answered "did you get your deposit back?" count toward the rate.
  const depositReturn = (() => {
    const answered = reports.filter(
      (r) => r.isCurrentTenant === false && r.depositReturned != null,
    );
    if (answered.length === 0) return null;
    const returnedCount = answered.filter((r) => r.depositReturned === true).length;
    const medianDays = median(
      answered.map((r) => (r.depositReturnDays == null ? null : Number(r.depositReturnDays))),
    );
    return {
      sampleSize: answered.length,
      returnedRate: Math.round((returnedCount / answered.length) * 100),
      medianDays,
    };
  })();

  // Typical tenure — median months lived (move-in → move-out, or → now for
  // current tenants). Built from livedFrom; reports without it are skipped.
  const tenure = (() => {
    const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;
    const months = reports
      .map((r) => {
        if (!r.livedFrom) return null;
        // Past tenant: move-in → move-out. Current tenant (no livedUntil):
        // move-in → now, via monthsSince (keeps Date.now out of render).
        if (r.livedUntil) {
          const fromMs = new Date(r.livedFrom).getTime();
          const toMs = new Date(r.livedUntil).getTime();
          if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return null;
          const m = (toMs - fromMs) / MS_PER_MONTH;
          return m > 0 ? m : null;
        }
        const m = monthsSince(r.livedFrom);
        return m != null && m > 0 ? m : null;
      })
      .filter((v): v is number => v != null);
    if (months.length === 0) return null;
    return { sampleSize: months.length, medianMonths: median(months) };
  })();

  const buildingMedianTotal = costs?.totalMonthlyAvg?.median ?? null;

  // Parallel: baselines + auth (all independent of each other)
  const [cachedDistrict, cachedCity, userId] = await Promise.all([
    building.districtId ? getDistrictBaseline(building.districtId) : Promise.resolve(null),
    getCityBaseline(building.cityId),
    resolveUserId(),
  ]);

  const districtBaseline: Baseline | null = cachedDistrict
    ? {
        median: cachedDistrict.median,
        p25: cachedDistrict.p25,
        p75: cachedDistrict.p75,
        count: cachedDistrict.count,
        rent: cachedDistrict.rent,
        expenses: cachedDistrict.expenses,
        rentPerM2: cachedDistrict.rentPerM2,
        totalPerM2: cachedDistrict.totalPerM2,
        percentile: cheaperThanPercentile(cachedDistrict.totals, buildingMedianTotal),
      }
    : null;

  const cityBaseline: Baseline | null = cachedCity
    ? {
        median: cachedCity.median,
        p25: cachedCity.p25,
        p75: cachedCity.p75,
        count: cachedCity.count,
        rent: null,
        expenses: null,
        rentPerM2: null,
        totalPerM2: null,
        percentile: cheaperThanPercentile(cachedCity.totals, buildingMedianTotal),
      }
    : null;

  const lastUpdated = reports[0]?.createdAt.toISOString() ?? null;

  let hasContributedData = false;
  let costAccessUntil: string | null = null;

  if (userId) {
    const [existingReport, profile] = await Promise.all([
      prisma.costReport.findFirst({
        where: { authorId: userId },
        select: { id: true },
      }),
      prisma.profile.findUnique({
        where: { id: userId },
        select: { costAccessUntil: true },
      }),
    ]);
    hasContributedData = !!existingReport;
    if (profile?.costAccessUntil) {
      costAccessUntil = profile.costAccessUntil.toISOString();
    }
  }

  const initialLocationScore = building.locationScore
    ? {
        overall: building.locationScore.overall,
        categories: building.locationScore.categories as Array<{
          key: string;
          score: number;
          nearestM: number | null;
          name: string | null;
        }>,
      }
    : null;

  return (
    <BuildingCostsClient
      building={{
        id: building.id,
        slug: building.slug,
        address: building.addressFull,
        district: building.district?.nameKey ?? '',
        districtSlug: building.district?.slug ?? '',
        city: t(building.city.nameKey),
      }}
      reports={reportCount}
      lastUpdated={lastUpdated}
      costs={costs}
      comparison={{
        thisBuilding: buildingMedianTotal,
        thisBuildingRentPerM2: perM2?.rent?.median ?? null,
        thisBuildingTotalPerM2: perM2?.total?.median ?? null,
        thisBuildingExpenses: costs?.expenses?.median ?? null,
        district: districtBaseline,
        city: cityBaseline,
      }}
      includedCounts={includedCounts}
      depositReturn={depositReturn}
      tenure={tenure}
      hasContributedData={hasContributedData}
      costAccessUntil={costAccessUntil}
      citySlug={citySlug}
      initialLocationScore={initialLocationScore}
    />
  );
}
