import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { CostsOverviewClient, type CostAccess } from './client';
import { getAlternates, getOgImage } from '@/lib/seo';
import { median } from '@/lib/cost-stats';
import { getBuildingsData } from '@/lib/cost-aggregates';
import type { CityBounds } from '@/lib/listings-data';

const ANON_ACCESS: CostAccess = {
  hasContributedData: false,
  costAccessUntil: null,
  isFlagged: false,
};

// Cache the city lookup; cities/districts change rarely.
const getCityForCosts = unstable_cache(
  (slug: string) => prisma.city.findUnique({ where: { slug }, include: { districts: true } }),
  ['costs-city'],
  { revalidate: 600, tags: ['costs'] },
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
        medianTotalPerM2: medianOf(dBuildings.map((b) => b.medianTotalPerM2 ?? 0)),
        medianExpenses: medianOf(dBuildings.map((b) => b.medianExpenses ?? 0)),
        // FUTURE (paid utility analytics): add medianElectricity/Gas/Heating/Water
        // here (same medianOf pattern) and surface them in a gated "utilities" tab.
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
