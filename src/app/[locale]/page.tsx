import { Suspense } from 'react';
import { unstable_cache } from 'next/cache';
import { setRequestLocale } from 'next-intl/server';
import { Hero } from '@/components/landing/hero';
import { CheckAddress } from '@/components/landing/check-address';
import { Districts } from '@/components/landing/districts';
import { BentoGrid } from '@/components/landing/bento-grid';
import { Tools } from '@/components/landing/tools';
import { HowItWorks } from '@/components/landing/how-it-works';
import { CostTransparency } from '@/components/landing/cost-transparency';
import { ForWhom } from '@/components/landing/for-whom';
import { CityNotify } from '@/components/landing/city-notify';
import { FAQ } from '@/components/landing/faq';
import { Footer } from '@/components/landing/footer';
import { LandingContent } from '@/components/landing/landing-content';
import { prisma } from '@/lib/prisma';
import { median, perAreaValues } from '@/lib/cost-stats';

const DEFAULT_CITY = 'warsaw';

async function getStats() {
  const [listings, costReports, districts, buildings, users, buildingsWithCosts, perM2Reports] =
    await Promise.all([
      prisma.listing.count({ where: { status: 'active' } }),
      prisma.costReport.count(),
      prisma.district.count(),
      prisma.building.count(),
      prisma.profile.count(),
      // "Homes with prices": buildings that carry at least one visible cost
      // report (the dots you actually see on the /costs map), Warsaw-scoped.
      prisma.building.count({
        where: { city: { slug: DEFAULT_CITY }, costReports: { some: { isVisible: true } } },
      }),
      prisma.costReport.findMany({
        where: {
          building: { city: { slug: DEFAULT_CITY } },
          isVisible: true,
          totalMonthlyAvg: { not: null },
        },
        select: { totalMonthlyAvg: true, rent: true, areaM2: true },
        take: 5000,
      }),
    ]);

  // Deposit data lives on real reports regardless of whether they carry a
  // monthly total, so query it separately (no totalMonthlyAvg filter).
  const depositReports = await prisma.costReport.findMany({
    where: { building: { city: { slug: DEFAULT_CITY } }, isVisible: true },
    select: { depositAmount: true, depositReturned: true },
    take: 5000,
  });

  const round10 = (n: number) => Math.round(n / 10) * 10;

  // Median all-in cost per m² across Warsaw — same method as the /costs city
  // baseline (perAreaValues + median), so the hero figure matches the tool.
  const perM2 = median(
    perAreaValues(
      perM2Reports.map((r) => ({
        value: r.totalMonthlyAvg == null ? null : Number(r.totalMonthlyAvg),
        areaM2: r.areaM2 == null ? null : Number(r.areaM2),
      })),
    ),
  );
  const pricePerM2 = perM2 == null ? null : round10(perM2);

  // Median monthly "Расходы" = total − rent: the komunalka/utilities paid on top
  // of rent — the hidden cost listings never show. Same definition as the
  // Аренда/Расходы split on /costs.
  const expenses = median(
    perM2Reports.map((r) =>
      r.totalMonthlyAvg != null && r.rent != null
        ? Number(r.totalMonthlyAvg) - Number(r.rent)
        : null,
    ),
  );
  const expensesMonthly = expenses == null ? null : round10(expenses);

  // Deposit: median amount (rounded to hundreds — it's a large one-off sum) and
  // the share of past tenants who got it back. Real reports only (scraped
  // listings carry no deposit), so it's honest tenant data.
  const depositAmounts = depositReports
    .map((r) => (r.depositAmount == null ? null : Number(r.depositAmount)))
    .filter((v): v is number => v != null && v > 0);
  const depositMed = median(depositAmounts);
  const depositMedian = depositMed == null ? null : Math.round(depositMed / 100) * 100;
  const returnKnown = depositReports.filter((r) => r.depositReturned != null);
  const returnTrue = returnKnown.filter((r) => r.depositReturned === true);
  const depositReturnedPct = returnKnown.length
    ? Math.round((100 * returnTrue.length) / returnKnown.length)
    : null;

  return {
    listings,
    costReports,
    districts,
    buildings,
    users,
    buildingsWithCosts,
    pricePerM2,
    expensesMonthly,
    depositMedian,
    depositReturnedPct,
  };
}

// Rotate the featured cost building once per day instead of always showing the
// single top building. We take the top-N buildings by report count (best data)
// and deterministically pick one by the day (days since epoch), so the address
// is stable within a day and cycles between days. The pick lives inside the
// cached function (not in render) — within-day stability comes from the cache's
// revalidate, and the rotation flips on the first revalidate after midnight.
const FEATURED_BUILDING_POOL_SIZE = 20;

async function getTopBuildingCostData() {
  const dayBucket = Math.floor(Date.now() / 86_400_000);
  const buildings = await prisma.building.findMany({
    orderBy: { costReports: { _count: 'desc' } },
    where: { costReports: { some: { isVisible: true } } },
    take: FEATURED_BUILDING_POOL_SIZE,
    include: {
      district: true,
      costReports: {
        where: { isVisible: true },
        select: {
          rent: true,
          adminFee: true,
          electricityAvg: true,
          internet: true,
          gas: true,
          heating: true,
        },
      },
    },
  });

  const pool = buildings.filter((b) => b.costReports.length > 0);
  if (pool.length === 0) return undefined;

  const building = pool[dayBucket % pool.length];
  const reports = building.costReports;
  const avg = (field: keyof (typeof reports)[0]) => {
    const values = reports.map((r) => Number(r[field] ?? 0)).filter((v) => v > 0);
    return values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  };

  const avgRent = avg('rent');
  const avgAdminFee = avg('adminFee');
  const avgElectricity = avg('electricityAvg');
  const avgInternet = avg('internet');
  const avgGas = avg('gas');
  const avgHeating = avg('heating');
  const avgGasHeating = avgGas + avgHeating;
  const totalMonthly = avgRent + avgAdminFee + avgElectricity + avgInternet + avgGasHeating;

  return {
    address: building.addressFull,
    district: building.district?.nameKey ?? '',
    reportsCount: reports.length,
    avgRent,
    avgAdminFee,
    avgElectricity,
    avgInternet,
    avgGasHeating,
    totalMonthly,
  };
}

// Cache the request-independent landing data so locale switches and repeat
// visits don't re-run these queries on every render. These functions read
// only from the database (no cookies/headers), so they're safe to cache.
const getStatsCached = unstable_cache(getStats, ['home-stats'], { revalidate: 300 });
const getTopBuildingCostDataCached = unstable_cache(
  getTopBuildingCostData,
  ['home-top-building-cost'],
  { revalidate: 600 },
);

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // Opt this route into static prerendering for each locale.
  setRequestLocale(locale);

  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex min-h-screen items-center justify-center pt-24">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="mx-auto max-w-5xl text-center space-y-6">
            <div className="mx-auto h-10 w-48 rounded-full bg-muted animate-pulse" />
            <div className="mx-auto h-16 w-full max-w-3xl rounded-2xl bg-muted animate-pulse" />
            <div className="mx-auto h-6 w-full max-w-xl rounded-lg bg-muted animate-pulse" />
            <div className="mx-auto h-12 w-48 rounded-full bg-muted animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

async function HomeContent() {
  const [statsResult, costResult] = await Promise.allSettled([
    getStatsCached(),
    getTopBuildingCostDataCached(),
  ]);

  const heroStats = statsResult.status === 'fulfilled' ? statsResult.value : undefined;
  const costBuildingData = costResult.status === 'fulfilled' ? costResult.value : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <LandingContent>
        {/* Free probe first (check an address), then the data, then the ask.
            Listings stay frozen per the 2026-06-20 pivot, so the landing no
            longer showcases them; their pages remain reachable by direct link. */}
        <main className="flex-1">
          <Hero stats={heroStats} />
          <CheckAddress citySlug={DEFAULT_CITY} />
          <Districts />
          <BentoGrid />
          <HowItWorks />
          <CostTransparency buildingData={costBuildingData} />
          <Tools citySlug={DEFAULT_CITY} />
          <ForWhom />
          <CityNotify />
          <FAQ />
        </main>
      </LandingContent>
      <Footer />
    </div>
  );
}
