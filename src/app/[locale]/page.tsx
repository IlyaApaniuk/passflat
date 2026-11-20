import { Suspense } from 'react';
import { unstable_cache } from 'next/cache';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getAlternates } from '@/lib/seo';
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
import { FlatmateCallout } from '@/components/roommate/flatmate-callout';
import { prisma } from '@/lib/prisma';
import { loadFlatmateBlockCounts } from '@/lib/roommate/website-counts';
import { loadWarsawPerPersonSplit } from '@/lib/roommate/room-costs';
import { perPersonSplitArea } from '@/lib/roommate/per-person-line';
import { depositClaim } from '@/lib/deposit-claim';
import {
  loadFeaturedBuilding,
  loadHomeCityFigure,
  loadHomeDistrictFigures,
} from '@/lib/home-figures';

const DEFAULT_CITY = 'warsaw';

// Only the four locales of the layout's `generateStaticParams` exist at `/[locale]`. A dotted
// path such as `/nonexistent.ext` skips the middleware and arrives here as a "locale"; it now gets
// the router's 404 instead of an on-demand render, which read next-intl's request header in a
// static route and never answered (FR-30).
export const dynamicParams = false;

async function getStats() {
  const [listings, costReports, districts, buildings, users, buildingsWithCosts, cityFigure] =
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
      // The city's single number (D23): the hero's per m² and expenses tiles come
      // from its group, labelled with that group and N.
      loadHomeCityFigure(DEFAULT_CITY),
    ]);

  // Deposit data lives on real reports regardless of whether they carry a
  // monthly total, so query it separately (no totalMonthlyAvg filter).
  const depositReports = await prisma.costReport.findMany({
    where: { building: { city: { slug: DEFAULT_CITY } }, isVisible: true },
    select: {
      source: true,
      depositAmount: true,
      depositReturned: true,
      depositReturnedAmount: true,
      isCurrentTenant: true,
    },
    take: 5000,
  });

  // Deposit: the tenant group's median amount and "X of N who answered got it
  // back, fully or partly" (spec 03 §Marketing copy), or nothing below
  // MIN_DEPOSIT_ANSWERS answers.
  const deposit = depositClaim(depositReports);

  return {
    listings,
    costReports,
    districts,
    buildings,
    users,
    buildingsWithCosts,
    cityFigure,
    deposit,
  };
}

// Rotate the featured cost building once per day instead of always showing the
// single top building: the most-reported buildings, one picked by the day (days
// since epoch), so the address is stable within a day and cycles between days.
// The pick lives inside the cached function (not in render) — within-day
// stability comes from the cache's revalidate, and the rotation flips on the
// first revalidate after midnight.
function getTopBuildingCostData() {
  return loadFeaturedBuilding(Math.floor(Date.now() / 86_400_000));
}

/**
 * Per-district single numbers for the district cards: the same
 * `loadDistrictFigures` the district pages read, so a card and the page it
 * links to can never disagree.
 */
function getDistrictMedians() {
  return loadHomeDistrictFigures(DEFAULT_CITY);
}

// Cache the request-independent landing data so locale switches and repeat
// visits don't re-run these queries on every render. These functions read
// only from the database (no cookies/headers), so they're safe to cache.
// Keys are renamed whenever the result shape changes (v3 / v2: D23 figures, T052).
const getStatsCached = unstable_cache(getStats, ['home-stats-v3'], { revalidate: 300 });
const getDistrictMediansCached = unstable_cache(getDistrictMedians, ['home-district-medians-v2'], {
  revalidate: 300,
  tags: ['costs'],
});
const getTopBuildingCostDataCached = unstable_cache(
  getTopBuildingCostData,
  ['home-top-building-cost-v2'],
  { revalidate: 600, tags: ['costs'] },
);

// Title, description and OG come from the locale layout; only the canonical
// has to be stated here, since the layout no longer sets one (a canonical there
// is inherited by every page that declares none).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: getAlternates('/', locale) };
}

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
  const [statsResult, costResult, districtResult, flatmateResult, splitResult] =
    await Promise.allSettled([
      getStatsCached(),
      getTopBuildingCostDataCached(),
      getDistrictMediansCached(),
      loadFlatmateBlockCounts(),
      loadWarsawPerPersonSplit(),
    ]);

  const heroStats = statsResult.status === 'fulfilled' ? statsResult.value : undefined;
  const costBuildingData = costResult.status === 'fulfilled' ? costResult.value : undefined;
  const districtMedians = districtResult.status === 'fulfilled' ? districtResult.value : [];
  // A rejection → no count line; the thesis section still renders with its links.
  const flatmateCounts = flatmateResult.status === 'fulfilled' ? flatmateResult.value : undefined;
  // Spec 08 §Per-person line: a rejection or null → no per-person line. The split's own area
  // is a city `nameKey`, resolved here on the server.
  const split = splitResult.status === 'fulfilled' ? splitResult.value : null;
  const splitArea = split ? perPersonSplitArea(split, await getTranslations()) : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <LandingContent>
        {/* Free probe first (check an address), then the data, then the ask.
            Listings stay frozen per the 2026-06-20 pivot, so the landing no
            longer showcases them; their pages remain reachable by direct link. */}
        <main className="flex-1">
          <Hero stats={heroStats} />
          {/* The thesis right under the hero (PRD 4 FR-9, D48). */}
          <div className="container mx-auto max-w-3xl px-4 pt-12 sm:px-6 sm:pt-16">
            <FlatmateCallout
              surface="home"
              counts={flatmateCounts}
              split={split}
              splitArea={splitArea}
            />
          </div>
          <CheckAddress citySlug={DEFAULT_CITY} />
          <Districts medians={districtMedians} />
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
