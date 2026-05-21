import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CostsOverviewClient } from "./client";
import type { CityBounds } from "@/lib/listings-data";

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

  const districtFilter = typeof search.district === "string" ? search.district : undefined;
  const searchQuery = typeof search.q === "string" ? search.q : undefined;

  const buildingWhere: Record<string, unknown> = { cityId: city.id };

  if (districtFilter) {
    buildingWhere.district = { slug: districtFilter };
  }

  if (searchQuery) {
    buildingWhere.addressFull = { contains: searchQuery, mode: "insensitive" };
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
          electricityAvg: true,
          gas: true,
          heating: true,
          water: true,
          internet: true,
          rentalType: true,
        },
      },
    },
    orderBy: { costReports: { _count: "desc" } },
  });

  const avg = (values: (number | null)[]) => {
    const nums = values.filter((v): v is number => v !== null);
    if (nums.length === 0) return 0;
    return Math.round(nums.reduce((a, c) => a + c, 0) / nums.length);
  };

  const buildingsData = buildings.map((b) => {
    const reports = b.costReports;
    const count = reports.length;

    const rentalTypes = reports
      .map((r) => r.rentalType)
      .filter((v): v is string => v !== null);
    const dominantRentalType =
      rentalTypes.length > 0
        ? Object.entries(
            rentalTypes.reduce<Record<string, number>>((acc, t) => {
              acc[t] = (acc[t] || 0) + 1;
              return acc;
            }, {}),
          ).sort((a, b) => b[1] - a[1])[0][0]
        : null;

    return {
      id: b.id,
      slug: b.slug,
      address: b.addressFull,
      district: b.district?.nameKey ?? "",
      districtSlug: b.district?.slug ?? "",
      reports: count,
      avgTotal: avg(reports.map((r) => r.totalMonthlyAvg ? Number(r.totalMonthlyAvg) : null)),
      avgRent: avg(reports.map((r) => r.rent ? Number(r.rent) : null)),
      avgUtilities:
        avg(reports.map((r) => r.electricityAvg ? Number(r.electricityAvg) : null)) +
        avg(reports.map((r) => r.gas ? Number(r.gas) : null)) +
        avg(reports.map((r) => r.heating ? Number(r.heating) : null)) +
        avg(reports.map((r) => r.water ? Number(r.water) : null)) +
        avg(reports.map((r) => r.internet ? Number(r.internet) : null)),
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
        avgTotal: avg(dBuildings.map((b) => b.avgTotal || null)),
        avgRent: avg(dBuildings.map((b) => b.avgRent || null)),
        avgUtilities: avg(dBuildings.map((b) => b.avgUtilities || null)),
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .sort((a, b) => b.reportCount - a.reportCount);

  // Check if user has contributed and if their report is flagged
  let hasContributed = false;
  let isFlagged = false;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const existingReport = await prisma.costReport.findFirst({
      where: { authorId: user.id },
      select: { id: true, verificationStatus: true, isVisible: true },
    });

    if (existingReport) {
      if (existingReport.verificationStatus === 'flagged' && !existingReport.isVisible) {
        isFlagged = true;
      } else {
        hasContributed = true;
      }
    }
  }

  return (
    <CostsOverviewClient
      buildings={buildingsData}
      districts={districts}
      districtStats={districtStats}
      hasContributed={hasContributed}
      isFlagged={isFlagged}
      citySlug={citySlug}
      cityBounds={cityBounds ?? undefined}
      initialSearch={searchQuery ?? ""}
      initialDistrict={districtFilter ?? null}
    />
  );
}
