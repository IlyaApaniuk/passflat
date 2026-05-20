import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const building = await prisma.building.findUnique({
    where: { id },
    include: {
      district: true,
      city: true,
      costReports: {
        where: { isVisible: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!building) {
    return NextResponse.json({ error: 'Building not found' }, { status: 404 });
  }

  const reports = building.costReports;
  const count = reports.length;

  if (count === 0) {
    return NextResponse.json({
      building: {
        id: building.id,
        address: building.addressFull,
        district: building.district?.nameKey ?? '',
        city: building.city.nameKey,
      },
      reports: 0,
      costs: null,
    });
  }

  type NumericField = 'rent' | 'adminFee' | 'electricityAvg' | 'electricityWinter' | 'electricitySummer' | 'gas' | 'heating' | 'water' | 'internet' | 'otherCosts' | 'totalMonthlyAvg';

  function computeStats(field: NumericField) {
    const values = reports
      .map((r) => r[field])
      .filter((v): v is NonNullable<typeof v> => v !== null)
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

  const costs = {
    rent: computeStats('rent'),
    adminFee: computeStats('adminFee'),
    electricity: computeStats('electricityAvg'),
    electricityWinter: computeStats('electricityWinter'),
    electricitySummer: computeStats('electricitySummer'),
    gas: computeStats('gas'),
    heating: computeStats('heating'),
    water: computeStats('water'),
    internet: computeStats('internet'),
    otherCosts: computeStats('otherCosts'),
    totalMonthlyAvg: computeStats('totalMonthlyAvg'),
  };

  const lastUpdated = reports[0]?.createdAt.toISOString() ?? null;

  // District average (all buildings in same district)
  let districtAvg: number | null = null;
  if (building.districtId) {
    const districtBuildings = await prisma.costReport.aggregate({
      where: {
        building: { districtId: building.districtId },
        isVisible: true,
        totalMonthlyAvg: { not: null },
      },
      _avg: { totalMonthlyAvg: true },
    });
    districtAvg = districtBuildings._avg.totalMonthlyAvg
      ? Math.round(Number(districtBuildings._avg.totalMonthlyAvg))
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

  return NextResponse.json({
    building: {
      id: building.id,
      address: building.addressFull,
      district: building.district?.nameKey ?? '',
      districtSlug: building.district?.slug ?? '',
      city: building.city.nameKey,
    },
    reports: count,
    lastUpdated,
    costs,
    comparison: {
      thisBuilding: costs.totalMonthlyAvg?.avg ?? null,
      districtAvg,
      cityAvg,
    },
  });
}
