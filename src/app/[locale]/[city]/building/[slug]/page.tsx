import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { BuildingCostsClient } from './client';
import { getAlternates, getOgImage, getCostOgImage } from '@/lib/seo';
import { JsonLd, breadcrumbJsonLd, buildingPlaceJsonLd } from '@/lib/json-ld';
import { formatAddressDisplay } from '@/lib/address';
import { computeStats, median, perAreaValues } from '@/lib/cost-stats';
import { loadBuildingFigures } from '@/lib/cost-figures-query';
import { buildingTenantDetails } from '@/lib/building-tenant-details';
import { comparableTenantGroup } from '@/lib/building-figures-view';
import { SCORE_VERSION } from '@/lib/location-score';
import { summarizeTagVotes } from '@/lib/building-tags';
import type { Metadata } from 'next';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ISR: the page reads no per-request auth — the summary ("база") is public for
// everyone and crawlers, and the deeper per-utility detail is gated client-side
// (useHasContributed). A hard server-side withhold (Phase 2 monetization) would
// opt it back into dynamic.
// 1h window: reports are rare, but bots crawl ~1100 building-page variants
// (282 buildings x 4 locales) around the clock — the old 5-min window made every
// crawler hit a full re-render and burned the Vercel free tier (3h39m CPU /
// 71K ISR writes in 30 days at ~50 human visits/week).
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ locale: string; city: string; slug: string }>;
}

// ---------------------------------------------------------------------------
// React cache() wrappers — deduplicate across generateMetadata & page render
// ---------------------------------------------------------------------------

// The page's figures come from the figure contract (`loadBuildingFigures`). Its
// own reports feed only generateMetadata (frozen by Q-2), the items spec 03
// keeps on the page (`buildingTenantDetails`) and the freshness badge.
const costReportSelect = {
  // generateMetadata
  rent: true,
  totalMonthlyAvg: true,
  // buildingTenantDetails
  source: true,
  electricityWinter: true,
  electricitySummer: true,
  heatingWinter: true,
  heatingSummer: true,
  depositAmount: true,
  depositReturned: true,
  depositReturnedAmount: true,
  leaseType: true,
  isCurrentTenant: true,
  livedFrom: true,
  livedUntil: true,
  periodicCharges: { select: { amount: true, frequency: true, category: true } },
  // freshness badge
  createdAt: true,
  confirmedAt: true,
} as const;

const buildingQuery = {
  select: {
    id: true,
    slug: true,
    addressFull: true,
    cityId: true,
    districtId: true,
    // Centre of the location-score map. Null on buildings that were never
    // geocoded, which is what hides the map toggle client-side.
    lat: true,
    lng: true,
    // Deep-links the "tell us about this building" CTA straight into /review
    // with the address already resolved. Null on buildings that were never
    // created from a Places result (e.g. the scraped import).
    placeId: true,
    district: { select: { nameKey: true, slug: true } },
    city: { select: { nameKey: true } },
    locationScore: { select: { overall: true, categories: true, version: true } },
    costReports: {
      where: { isVisible: true },
      orderBy: { createdAt: 'desc' as const },
      select: costReportSelect,
    },
    // Moderated-out votes stop counting without losing the row, so the filter
    // has to happen here — the aggregate below trusts what it is handed.
    tags: {
      where: { isVisible: true },
      select: { tagKey: true, source: true, voterKey: true },
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
  { revalidate: 300, tags: ['costs'] },
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
  { revalidate: 300, tags: ['costs'] },
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
  const { locale, slug, city } = await params;
  setRequestLocale(locale);
  const building = await getBuilding(city, slug);
  if (!building) return { title: 'Building not found' };

  const t = await getTranslations();
  const cityName = t(building.city.nameKey);
  // District `nameKey` holds a plain display name (e.g. "Mokotów"), unlike city
  // nameKey which is a translation key — so it's used as-is, not through t().
  const districtName = building.district?.nameKey ?? cityName;
  const address = formatAddressDisplay(building.addressFull);

  const reports = building.costReports;
  const num = (v: unknown) => (v == null ? null : Number(v));
  const totalMedian = median(reports.map((r) => num(r.totalMonthlyAvg)));
  const rentMedian = median(reports.map((r) => num(r.rent)));
  const expensesMedian = median(
    reports.map((r) => {
      const tot = num(r.totalMonthlyAvg);
      const rnt = num(r.rent);
      return tot != null && rnt != null ? Math.max(0, tot - rnt) : null;
    }),
  );

  // These pages are found by searching a bare street address — "pańska 96
  // warszawa" — so the city belongs in the title, in the searcher's own
  // language, and the medians belong in the description: they are the only
  // thing on offer that the ten results above cannot show.
  const title = t('costsSeo.buildingMetaTitle', { address, city: cityName });
  const money = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const description =
    totalMedian != null && rentMedian != null && expensesMedian != null
      ? t('costsSeo.buildingMetaDescriptionWithData', {
          address,
          city: cityName,
          total: money.format(totalMedian),
          rent: money.format(rentMedian),
          expenses: money.format(expensesMedian),
          reports: t('costs.overview.nReports', { count: reports.length }),
        })
      : t('costsSeo.buildingMetaDescription', { address, city: cityName });

  // Rich cost share-card when the building has data (the viral artifact people
  // drop into chats); generic title/subtitle OG otherwise.
  const ogImage =
    totalMedian != null
      ? getCostOgImage({
          title: address,
          subtitle: `${districtName}, ${cityName} · ${t('costs.overview.nReports', { count: reports.length })}`,
          stat: `≈ ${totalMedian.toLocaleString()} zł`,
          statLabel: t('costs.building.medianMonthlyTotal'),
          split:
            rentMedian != null && expensesMedian != null
              ? `${t('costs.building.rent')} ≈ ${rentMedian.toLocaleString()} · ${t('costs.building.expenses')} ≈ ${expensesMedian.toLocaleString()}`
              : undefined,
        })
      : getOgImage(address, cityName);

  return {
    title,
    description,
    alternates: getAlternates(`/${city}/building/${building.slug}`, await getLocale()),
    openGraph: {
      title,
      description,
      images: [ogImage],
    },
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BuildingCostsPage({ params }: PageProps) {
  const { locale, city: citySlug, slug } = await params;
  setRequestLocale(locale);

  const building = await getBuilding(citySlug, slug);

  if (!building) notFound();

  if (UUID_RE.test(slug)) {
    redirect(`/${locale}/${citySlug}/building/${building.slug}`);
  }

  const t = await getTranslations();

  const reports = building.costReports;

  // Parallel: the building's figures (the shared contract, tenant and asking
  // groups apart) and the district + city baselines of the comparison. No auth
  // read — the page is fully public; the detail gate is resolved on the client.
  const [figures, cachedDistrict, cachedCity] = await Promise.all([
    loadBuildingFigures(building.id),
    building.districtId ? getDistrictBaseline(building.districtId) : Promise.resolve(null),
    getCityBaseline(building.cityId),
  ]);
  const tenant = figures.groups.tenant;

  // The items spec 03 keeps on the page (winter/summer, periodic charges,
  // deposit, tenure, lease type), over the tenant group's reports only.
  const tenantDetails = tenant
    ? buildingTenantDetails(reports, { tenantRentMedian: tenant.rent.median })
    : null;

  // What tenants said about the building itself — the second pillar next to the
  // numbers. Which of those votes may be shown is a product+legal decision
  // (positives publish on the first voice, negatives wait for a second one —
  // art. 212 k.k.), so it stays in `aggregateTagVotes`; this only shapes the
  // rows and counts the distinct voters behind them, the same way the checker
  // endpoint does.
  const tenantTags = (() => {
    // Null → the invitation renders instead of a card with no chips.
    return summarizeTagVotes(building.tags);
  })();

  // The building side of the comparison is the tenant group (never a blend of
  // tenant reports and asking prices), and never one observation (FR-24); the
  // comparison itself is reworked by spec 03 §Comparisons.
  const compared = comparableTenantGroup(figures);
  const buildingMedianTotal = compared?.completeTotal.median ?? null;

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

  // Freshness = the most recent confirmation across reports. A re-submit bumps
  // confirmedAt (even with no value change), so re-confirming clears the
  // "outdated" badge; legacy reports without confirmedAt fall back to createdAt.
  const lastUpdated = reports.length
    ? new Date(
        Math.max(...reports.map((r) => (r.confirmedAt ?? r.createdAt).getTime())),
      ).toISOString()
    : null;

  // Only seed from the stored score when it's the current version. A stale one
  // (older algorithm — e.g. renamed category keys) would render raw i18n keys,
  // so we pass null instead and let the component fetch a fresh, recomputed
  // score from the API (which recomputes when version < SCORE_VERSION).
  // Coordinates ride along so the map tab can centre without a second request
  // (Decimal → number, which is what crosses the server/client boundary).
  const initialLocationScore =
    building.locationScore && building.locationScore.version >= SCORE_VERSION
      ? {
          overall: building.locationScore.overall,
          categories: building.locationScore.categories as Array<{
            key: string;
            score: number;
            nearestM: number | null;
            name: string | null;
            nearby?: Array<{ name: string; lat: number; lng: number; distanceM: number }>;
          }>,
          lat: building.lat == null ? null : Number(building.lat),
          lng: building.lng == null ? null : Number(building.lng),
        }
      : null;

  const displayAddress = formatAddressDisplay(building.addressFull);
  const buildingPath = `/${citySlug}/building/${building.slug}`;

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t(building.city.nameKey), path: `/${citySlug}` },
          ...(building.district
            ? [
                {
                  name: building.district.nameKey,
                  path: `/${citySlug}/${building.district.slug}`,
                },
              ]
            : []),
          { name: displayAddress, path: buildingPath },
        ])}
      />
      <JsonLd
        data={buildingPlaceJsonLd({
          address: displayAddress,
          city: t(building.city.nameKey),
          district: building.district?.nameKey,
          url: getAlternates(buildingPath, locale).canonical,
          lat: building.lat == null ? null : Number(building.lat),
          lng: building.lng == null ? null : Number(building.lng),
        })}
      />
      <BuildingCostsClient
        building={{
          id: building.id,
          slug: building.slug,
          address: displayAddress,
          district: building.district?.nameKey ?? '',
          districtSlug: building.district?.slug ?? '',
          city: t(building.city.nameKey),
          placeId: building.placeId,
        }}
        figures={figures}
        tenantDetails={tenantDetails}
        lastUpdated={lastUpdated}
        comparison={{
          thisBuilding: buildingMedianTotal,
          thisBuildingRent: compared?.rent.median ?? null,
          thisBuildingRentPerM2: compared?.rentPerM2.median ?? null,
          thisBuildingTotalPerM2: compared?.completeTotalPerM2.median ?? null,
          thisBuildingExpenses: compared?.expenses.median ?? null,
          district: districtBaseline,
          city: cityBaseline,
        }}
        citySlug={citySlug}
        tenantTags={tenantTags}
        initialLocationScore={initialLocationScore}
      />
    </>
  );
}
