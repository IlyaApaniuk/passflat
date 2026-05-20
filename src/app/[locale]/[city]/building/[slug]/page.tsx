import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { BuildingCostsClient } from "./client";
import { getAlternates } from "@/lib/seo";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ locale: string; city: string; slug: string }>;
}

type NumericField =
  | "rent"
  | "adminFee"
  | "electricityAvg"
  | "electricityWinter"
  | "electricitySummer"
  | "gas"
  | "heating"
  | "water"
  | "internet"
  | "otherCosts"
  | "totalMonthlyAvg";

function computeStats(
  reports: Array<Record<string, unknown>>,
  field: NumericField,
) {
  const values = reports
    .map((r) => r[field])
    .filter((v): v is NonNullable<typeof v> => v !== null && v !== undefined)
    .map(Number);
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    avg: Math.round(sum / values.length),
    min: Math.round(Math.min(...values)),
    max: Math.round(Math.max(...values)),
    count: values.length,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, city } = await params;

  const building = await prisma.building.findUnique({
    where: { id: slug },
    include: { district: true, city: true },
  });

  if (!building) return { title: "Building not found" };

  return {
    title: `${building.addressFull} — Cost Reports | Passflat`,
    description: `Real rental costs for ${building.addressFull}, ${building.district?.nameKey ?? building.city.nameKey}. Crowdsourced from actual tenants.`,
    alternates: getAlternates(`/${city}/building/${slug}`),
  };
}

export default async function BuildingCostsPage({ params }: PageProps) {
  const { city: citySlug, slug } = await params;

  const building = await prisma.building.findUnique({
    where: { id: slug },
    include: {
      district: true,
      city: true,
      costReports: {
        where: { isVisible: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!building) notFound();

  const reports = building.costReports;
  const reportCount = reports.length;

  const costs = reportCount > 0
    ? {
        rent: computeStats(reports as unknown as Array<Record<string, unknown>>, "rent"),
        adminFee: computeStats(reports as unknown as Array<Record<string, unknown>>, "adminFee"),
        electricity: computeStats(reports as unknown as Array<Record<string, unknown>>, "electricityAvg"),
        gas: computeStats(reports as unknown as Array<Record<string, unknown>>, "gas"),
        heating: computeStats(reports as unknown as Array<Record<string, unknown>>, "heating"),
        water: computeStats(reports as unknown as Array<Record<string, unknown>>, "water"),
        internet: computeStats(reports as unknown as Array<Record<string, unknown>>, "internet"),
        totalMonthlyAvg: computeStats(reports as unknown as Array<Record<string, unknown>>, "totalMonthlyAvg"),
      }
    : null;

  // District average
  let districtAvg: number | null = null;
  if (building.districtId) {
    const districtAgg = await prisma.costReport.aggregate({
      where: {
        building: { districtId: building.districtId },
        isVisible: true,
        totalMonthlyAvg: { not: null },
      },
      _avg: { totalMonthlyAvg: true },
    });
    districtAvg = districtAgg._avg.totalMonthlyAvg
      ? Math.round(Number(districtAgg._avg.totalMonthlyAvg))
      : null;
  }

  // City average
  const cityAgg = await prisma.costReport.aggregate({
    where: {
      building: { cityId: building.cityId },
      isVisible: true,
      totalMonthlyAvg: { not: null },
    },
    _avg: { totalMonthlyAvg: true },
  });
  const cityAvg = cityAgg._avg.totalMonthlyAvg
    ? Math.round(Number(cityAgg._avg.totalMonthlyAvg))
    : null;

  const lastUpdated = reports[0]?.createdAt.toISOString() ?? null;

  // Check unlock status
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
    <BuildingCostsClient
      building={{
        id: building.id,
        address: building.addressFull,
        district: building.district?.nameKey ?? "",
        districtSlug: building.district?.slug ?? "",
        city: building.city.nameKey,
      }}
      reports={reportCount}
      lastUpdated={lastUpdated}
      costs={costs}
      comparison={{
        thisBuilding: costs?.totalMonthlyAvg?.avg ?? null,
        districtAvg,
        cityAvg,
      }}
      hasContributed={hasContributed}
      citySlug={citySlug}
    />
  );
}
