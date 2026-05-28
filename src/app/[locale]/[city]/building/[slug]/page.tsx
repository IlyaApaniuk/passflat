import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BuildingCostsClient } from "./client";
import { getAlternates } from "@/lib/seo";
import type { Metadata } from "next";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  | "heatingWinter"
  | "heatingSummer"
  | "water"
  | "internet"
  | "otherCosts"
  | "totalMonthlyAvg"
  | "depositAmount";

type BoolField = "electricityIncluded" | "heatingIncluded" | "waterIncluded";

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

async function findBuildingBySlugOrUuid(citySlug: string, slug: string) {
  const city = await prisma.city.findUnique({ where: { slug: citySlug }, select: { id: true } });
  if (!city) return null;

  if (!UUID_RE.test(slug)) {
    return prisma.building.findUnique({
      where: { cityId_slug: { cityId: city.id, slug } },
      include: { district: true, city: true, costReports: { where: { isVisible: true }, orderBy: { createdAt: "desc" as const } } },
    });
  }

  return prisma.building.findUnique({
    where: { id: slug },
    include: { district: true, city: true, costReports: { where: { isVisible: true }, orderBy: { createdAt: "desc" as const } } },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, city } = await params;

  const cityRecord = await prisma.city.findUnique({ where: { slug: city }, select: { id: true } });
  if (!cityRecord) return { title: "Building not found" };

  const building = UUID_RE.test(slug)
    ? await prisma.building.findUnique({ where: { id: slug }, include: { district: true, city: true } })
    : await prisma.building.findUnique({ where: { cityId_slug: { cityId: cityRecord.id, slug } }, include: { district: true, city: true } });

  if (!building) return { title: "Building not found" };

  const t = await getTranslations();
  const cityName = t(building.city.nameKey);

  return {
    title: `${building.addressFull} — Cost Reports | Passflat`,
    description: `Real rental costs for ${building.addressFull}, ${building.district?.nameKey ?? cityName}. Crowdsourced from actual tenants.`,
    alternates: getAlternates(`/${city}/building/${building.slug}`),
  };
}

export default async function BuildingCostsPage({ params }: PageProps) {
  const { city: citySlug, slug } = await params;

  const building = await findBuildingBySlugOrUuid(citySlug, slug);

  if (!building) notFound();

  if (UUID_RE.test(slug)) {
    redirect(`/${citySlug}/building/${building.slug}`);
  }

  const reports = building.costReports;
  const reportCount = reports.length;

  const recs = reports as unknown as Array<Record<string, unknown>>;
  function countIncluded(field: BoolField) {
    return recs.filter((r) => r[field] === true).length;
  }

  const costs = reportCount > 0
    ? {
        rent: computeStats(recs, "rent"),
        adminFee: computeStats(recs, "adminFee"),
        electricity: computeStats(recs, "electricityAvg"),
        electricityWinter: computeStats(recs, "electricityWinter"),
        electricitySummer: computeStats(recs, "electricitySummer"),
        gas: computeStats(recs, "gas"),
        heating: computeStats(recs, "heating"),
        heatingWinter: computeStats(recs, "heatingWinter"),
        heatingSummer: computeStats(recs, "heatingSummer"),
        water: computeStats(recs, "water"),
        internet: computeStats(recs, "internet"),
        otherCosts: computeStats(recs, "otherCosts"),
        totalMonthlyAvg: computeStats(recs, "totalMonthlyAvg"),
        deposit: computeStats(recs, "depositAmount"),
      }
    : null;

  const includedCounts = reportCount > 0
    ? {
        electricity: countIncluded("electricityIncluded"),
        heating: countIncluded("heatingIncluded"),
        water: countIncluded("waterIncluded"),
        total: reportCount,
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
    const existingReport = await prisma.costReport.findFirst({
      where: { authorId: user.id },
      select: { id: true },
    });
    hasContributed = !!existingReport;
  }

  return (
    <BuildingCostsClient
      building={{
        id: building.id,
        slug: building.slug,
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
      includedCounts={includedCounts}
      hasContributed={hasContributed}
      citySlug={citySlug}
    />
  );
}
