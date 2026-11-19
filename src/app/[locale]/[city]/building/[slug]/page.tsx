import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { BuildingCostsClient } from './client';
import { getAlternates, getOgImage, getCostOgImage } from '@/lib/seo';
import { JsonLd, breadcrumbJsonLd, buildingPlaceJsonLd } from '@/lib/json-ld';
import { formatAddressDisplay } from '@/lib/address';
import { median } from '@/lib/cost-stats';
import { loadAreaReference, loadBuildingFigures } from '@/lib/cost-figures-query';
import type { AreaReference, FigureSummary } from '@/lib/cost-figures';
import { buildingTenantDetails } from '@/lib/building-tenant-details';
import { SCORE_VERSION } from '@/lib/location-score';
import { summarizeTagVotes } from '@/lib/building-tags';
import { findNuisances, type NuisanceResult } from '@/lib/nuisances';
import {
  formatDistanceM,
  NuisancesCard,
  nuisanceItems,
} from '@/components/buildings/nuisances-card';
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

/** Nuisances around the building, from the local POI table; none without coordinates. */
async function findBuildingNuisances(
  citySlug: string,
  building: { lat: unknown; lng: unknown },
): Promise<NuisanceResult[]> {
  if (building.lat == null || building.lng == null) return [];
  const origin = { lat: Number(building.lat), lng: Number(building.lng) };
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  return findNuisances(citySlug, origin);
}

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

  // Parallel: the building's figures and its area reference (district, else
  // city), both from the shared contract with tenant and asking groups apart.
  // The reference stands in, explicitly labelled, when the building has no
  // visible report (FR-33), and is the area side of the comparison (FR-29). No
  // auth read — the page is fully public; the detail gate is resolved on the client.
  const [figures, areaReference]: [FigureSummary, AreaReference | null] = await Promise.all([
    loadBuildingFigures(building.id),
    loadAreaReference({ districtId: building.districtId, cityId: building.cityId }),
  ]);
  const tenant = figures.groups.tenant;

  // The location facts that need no report (nuisances next to the location
  // score) are read only for a building without reports.
  const nuisances: NuisanceResult[] =
    figures.reportCount === 0 ? await findBuildingNuisances(citySlug, building) : [];
  const nuisancesCard =
    nuisances.length > 0 ? (
      <NuisancesCard
        title={t('checker.nuisances.title')}
        subtitle={t('checker.nuisances.subtitle')}
        items={nuisanceItems(
          nuisances,
          (key, values) => t(`checker.nuisances.${key}`, values),
          (distanceM) => formatDistanceM(locale, distanceM),
        )}
      />
    ) : null;

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
        areaReference={
          areaReference
            ? {
                level: areaReference.level,
                // A district's `nameKey` is its display name; a city's is a message key.
                areaName:
                  areaReference.level === 'district' ? areaReference.name : t(areaReference.name),
                summary: areaReference.summary,
              }
            : null
        }
        nuisancesCard={nuisancesCard}
        tenantDetails={tenantDetails}
        lastUpdated={lastUpdated}
        citySlug={citySlug}
        tenantTags={tenantTags}
        initialLocationScore={initialLocationScore}
      />
    </>
  );
}
