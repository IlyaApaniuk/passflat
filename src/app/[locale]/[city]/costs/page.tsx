import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { CostsOverviewClient } from './client';
import { median, perAreaValues } from '@/lib/cost-stats';
import type { CityBounds } from '@/lib/listings-data';

interface PageProps {
  params: Promise<{ locale: string; city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CostsPage({ params, searchParams }: PageProps) {
  const { city: citySlug } = await params;
  const search = await searchParams;

  const city = await prisma.city.findUnique({
    where: { slug: citySlug },
    include: { districts: true },
  });

  if (!city) notFound();

  const cityBounds = city.bounds as CityBounds | null;

  const districtFilter = typeof search.district === 'string' ? search.district : undefined;
  const searchQuery = typeof search.q === 'string' ? search.q : undefined;

  const buildingWhere: Record<string, unknown> = { cityId: city.id };

  if (districtFilter) {
    buildingWhere.district = { slug: districtFilter };
  }

  if (searchQuery) {
    buildingWhere.addressFull = { contains: searchQuery, mode: 'insensitive' };
  }

  const buildings = await prisma.building.findMany({
    where: {
      ...buildingWhere,
      costReports: { some: { isVisible: true } },
    },
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

  // Median of building-level medians (used for district roll-ups).
  const medianOf = (values: number[]) => median(values.filter((v) => v > 0)) ?? 0;

  const buildingsData = buildings.map((b) => {
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

  const districts = city.districts.map((d) => ({
    slug: d.slug,
    name: d.nameKey,
    count: buildings.filter((b) => b.districtId === d.id).length,
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

  let hasContributedData = false;
  let isFlagged = false;
  let costAccessUntil: string | null = null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
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

    if (existingReport) {
      if (existingReport.verificationStatus === 'flagged' && !existingReport.isVisible) {
        isFlagged = true;
      } else {
        hasContributedData = true;
      }
    }

    if (profile?.costAccessUntil) {
      costAccessUntil = profile.costAccessUntil.toISOString();
    }
  }

  return (
    <CostsOverviewClient
      buildings={buildingsData}
      districts={districts}
      districtStats={districtStats}
      hasContributedData={hasContributedData}
      costAccessUntil={costAccessUntil}
      isFlagged={isFlagged}
      citySlug={citySlug}
      cityBounds={cityBounds ?? undefined}
      initialSearch={searchQuery ?? ''}
      initialDistrict={districtFilter ?? null}
    />
  );
}
