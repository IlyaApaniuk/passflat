import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { CostsOverviewClient, type CostAccess } from './client';
import { getAlternates, getOgImage } from '@/lib/seo';
import { median, perAreaValues } from '@/lib/cost-stats';
import type { CityBounds } from '@/lib/listings-data';

const ANON_ACCESS: CostAccess = {
  hasContributedData: false,
  costAccessUntil: null,
  isFlagged: false,
};

type BuildingData = {
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
  medianAdminFeePerM2: number | null;
  lat: number | null;
  lng: number | null;
  rentalType: string | null;
};

// Cache the city lookup; cities/districts change rarely.
const getCityForCosts = unstable_cache(
  (slug: string) => prisma.city.findUnique({ where: { slug }, include: { districts: true } }),
  ['costs-city'],
  { revalidate: 600, tags: ['costs'] },
);

// The expensive part: buildings + their visible cost reports, reduced to plain,
// JSON-serializable medians inside the cache so it's not re-run (with nested
// joins) on every request. Keyed by the arguments (city + filters).
const getBuildingsData = unstable_cache(
  async (
    cityId: string,
    districtFilter: string | null,
    searchQuery: string | null,
  ): Promise<BuildingData[]> => {
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
        // Per-report ratio, then median — never average-of-averages.
        medianRentPerM2: median(
          perAreaValues(reports.map((r) => ({ value: num(r.rent), areaM2: num(r.areaM2) }))),
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
  ['costs-buildings'],
  { revalidate: 300, tags: ['costs'] },
);

/**
 * Resolve the viewer's cost-access state. Reads auth cookies, so it's kept off
 * the critical render path: the page passes this promise to the client, which
 * unwraps it inside a Suspense boundary — the cost table renders (from cached
 * data) without waiting on auth. Never rejects, so the boundary can't error.
 */
async function getCostAccess(): Promise<CostAccess> {
  const empty: CostAccess = { hasContributedData: false, costAccessUntil: null, isFlagged: false };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return empty;

    const [existingReport, profile] = await Promise.all([
      prisma.costReport.findFirst({
        where: { authorId: user.id },
        select: { id: true, verificationStatus: true, isVisible: true },
      }),
      prisma.profile.findUnique({
        where: { id: user.id },
        select: { costAccessUntil: true },
      }),
    ]);

    let hasContributedData = false;
    let isFlagged = false;
    if (existingReport) {
      if (existingReport.verificationStatus === 'flagged' && !existingReport.isVisible) {
        isFlagged = true;
      } else {
        hasContributedData = true;
      }
    }

    return {
      hasContributedData,
      isFlagged,
      costAccessUntil: profile?.costAccessUntil ? profile.costAccessUntil.toISOString() : null,
    };
  } catch {
    return empty;
  }
}

interface PageProps {
  params: Promise<{ locale: string; city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city } = await params;
  const cityRecord = await prisma.city.findUnique({
    where: { slug: city },
    select: { nameKey: true },
  });
  const t = await getTranslations();
  const cityName = cityRecord ? t(cityRecord.nameKey) : city;
  const title = `${t('costs.title')} — ${cityName}`;
  const description = t('costs.subtitle');

  return {
    title,
    description,
    alternates: getAlternates(`/${city}/costs`),
    openGraph: {
      title,
      description,
      images: [getOgImage(title, description)],
    },
  };
}

export default async function CostsPage({ params, searchParams }: PageProps) {
  const { city: citySlug } = await params;
  const search = await searchParams;

  const city = await getCityForCosts(citySlug);

  if (!city) notFound();

  const cityBounds = city.bounds as CityBounds | null;

  const districtFilter = typeof search.district === 'string' ? search.district : undefined;
  const searchQuery = typeof search.q === 'string' ? search.q : undefined;

  // Cached, request-independent. The auth-specific state is streamed separately
  // below so this (and the rendered cost table) never blocks on it.
  const buildingsData = await getBuildingsData(
    city.id,
    districtFilter ?? null,
    searchQuery ?? null,
  );

  // Median of building-level medians (used for district roll-ups).
  const medianOf = (values: number[]) => median(values.filter((v) => v > 0)) ?? 0;

  const districts = city.districts.map((d) => ({
    slug: d.slug,
    name: d.nameKey,
    count: buildingsData.filter((b) => b.districtSlug === d.slug).length,
  }));

  const districtStats = city.districts
    .map((d) => {
      const dBuildings = buildingsData.filter((b) => b.districtSlug === d.slug);
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
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .sort((a, b) => b.reportCount - a.reportCount);

  // Fast cookie check: if no Supabase session cookie is present the visitor is
  // definitely anonymous — resolve to locked immediately (no skeleton, no TTFB
  // cost). Only start the expensive auth+DB round-trip for logged-in users.
  const cookieStore = await cookies();
  const hasSessionCookie = cookieStore.getAll().some((c) => /^sb-.*-auth-token/.test(c.name));

  const initialAccess: CostAccess | null = hasSessionCookie ? null : ANON_ACCESS;
  const accessPromise = hasSessionCookie ? getCostAccess() : undefined;

  return (
    <CostsOverviewClient
      buildings={buildingsData}
      districts={districts}
      districtStats={districtStats}
      initialAccess={initialAccess}
      accessPromise={accessPromise}
      citySlug={citySlug}
      cityBounds={cityBounds ?? undefined}
      initialSearch={searchQuery ?? ''}
      initialDistrict={districtFilter ?? null}
    />
  );
}
