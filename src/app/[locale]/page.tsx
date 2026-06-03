import { Suspense } from 'react';
import { unstable_cache } from 'next/cache';
import { Hero } from '@/components/landing/hero';
import { Districts } from '@/components/landing/districts';
import { BentoGrid } from '@/components/landing/bento-grid';
import { FeaturedListings } from '@/components/landing/featured-listings';
import type { FeaturedListingData } from '@/components/landing/featured-listings';
import { HowItWorks } from '@/components/landing/how-it-works';
import { CostTransparency } from '@/components/landing/cost-transparency';
import { ForWhom } from '@/components/landing/for-whom';
import { CityNotify } from '@/components/landing/city-notify';
import { FAQ } from '@/components/landing/faq';
import { Footer } from '@/components/landing/footer';
import { LandingContent } from '@/components/landing/landing-content';
import { prisma } from '@/lib/prisma';
import type { ListingType } from '@/lib/listings-data';

const DEFAULT_CITY = 'warsaw';

async function getFeaturedListings(): Promise<FeaturedListingData[]> {
  const promoted = await prisma.listing.findMany({
    where: { status: 'active', isPromoted: true },
    orderBy: { createdAt: 'desc' },
    take: 6,
    include: { building: { include: { district: true } } },
  });

  if (promoted.length < 3) return [];

  return promoted.map((listing) => ({
    id: listing.id,
    type: (listing.type as ListingType) ?? 'replacement',
    title: listing.title,
    address: listing.building.addressFull,
    totalCost: Number(listing.totalMonthly ?? 0),
    bedrooms: listing.rooms ?? 0,
    bathrooms: 1,
    area: Number(listing.areaM2 ?? 0),
    image: listing.photos[0] ?? '/placeholder.jpg',
    promoted: listing.isPromoted,
    availableFrom: listing.availableFrom?.toISOString() ?? '',
    pricePerPerson: listing.pricePerPerson ? Number(listing.pricePerPerson) : undefined,
    currentRoommates: listing.currentRoommates ?? undefined,
    roomType: (listing.roomType as 'private' | 'shared') ?? undefined,
    availableTo: listing.availableTo?.toISOString() ?? undefined,
    priceTotal: listing.priceTotal ? Number(listing.priceTotal) : undefined,
  }));
}

async function getStats() {
  const [listings, costReports, districts, buildings, users] = await Promise.all([
    prisma.listing.count({ where: { status: 'active' } }),
    prisma.costReport.count(),
    prisma.district.count(),
    prisma.building.count(),
    prisma.profile.count(),
  ]);
  return { listings, costReports, districts, buildings, users };
}

async function getTopBuildingCostData() {
  const building = await prisma.building.findFirst({
    orderBy: { costReports: { _count: 'desc' } },
    where: { costReports: { some: {} } },
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

  if (!building || building.costReports.length === 0) return undefined;

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
const getFeaturedListingsCached = unstable_cache(getFeaturedListings, ['home-featured-listings'], {
  revalidate: 300,
});
const getStatsCached = unstable_cache(getStats, ['home-stats'], { revalidate: 300 });
const getTopBuildingCostDataCached = unstable_cache(
  getTopBuildingCostData,
  ['home-top-building-cost'],
  { revalidate: 600 },
);

export default function Home() {
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
  const [featuredResult, statsResult, costResult] = await Promise.allSettled([
    getFeaturedListingsCached(),
    getStatsCached(),
    getTopBuildingCostDataCached(),
  ]);

  const featuredListings = featuredResult.status === 'fulfilled' ? featuredResult.value : [];
  const heroStats = statsResult.status === 'fulfilled' ? statsResult.value : undefined;
  const costBuildingData = costResult.status === 'fulfilled' ? costResult.value : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <LandingContent>
        <main className="flex-1">
          <Hero stats={heroStats} />
          <Districts />
          <BentoGrid />
          <FeaturedListings listings={featuredListings} citySlug={DEFAULT_CITY} />
          <HowItWorks />
          <CostTransparency buildingData={costBuildingData} />
          <ForWhom />
          <CityNotify />
          <FAQ />
        </main>
      </LandingContent>
      <Footer />
    </div>
  );
}
