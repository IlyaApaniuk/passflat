import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CostsOverviewClient } from "./client";

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
        },
      },
    },
    orderBy: { costReports: { _count: "desc" } },
  });

  const buildingsData = buildings.map((b) => {
    const reports = b.costReports;
    const count = reports.length;

    const avg = (values: (number | null)[]) => {
      const nums = values.filter((v): v is number => v !== null);
      if (nums.length === 0) return 0;
      return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
    };

    return {
      id: b.id,
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
    };
  });

  const districts = city.districts.map((d) => ({
    slug: d.slug,
    name: d.nameKey,
    count: buildings.filter((b) => b.districtId === d.id).length,
  }));

  // Check if user has contributed
  let hasContributed = false;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { hasContributedCost: true },
    });
    hasContributed = profile?.hasContributedCost ?? false;
  }

  return (
    <CostsOverviewClient
      buildings={buildingsData}
      districts={districts}
      hasContributed={hasContributed}
      citySlug={citySlug}
      initialSearch={searchQuery ?? ""}
      initialDistrict={districtFilter ?? null}
    />
  );
}
