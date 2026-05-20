import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from Server Component context
          }
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function normalizeAddress(street: string, buildingNumber: string): string {
  return `${street.trim().toLowerCase()} ${buildingNumber.trim().toLowerCase()}`;
}

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const {
    street,
    buildingNumber,
    district,
    placeId,
    lat,
    lng,
    citySlug,
    rent,
    adminFee,
    electricity,
    electricityWinter,
    electricitySummer,
    gas,
    heating,
    heatingIncluded,
    water,
    waterIncluded,
    internet,
    internetProvider,
    otherCosts,
    otherCostsNote,
    rooms,
    areaM2,
    floor,
    leaseType,
    depositMonths,
    isCurrentTenant,
    livedFrom,
    livedUntil,
  } = body;

  if (!street || !buildingNumber || !rent) {
    return NextResponse.json(
      { error: 'Missing required fields: street, buildingNumber, rent' },
      { status: 400 },
    );
  }

  const city = await prisma.city.findUnique({
    where: { slug: citySlug || 'warsaw' },
    include: { districts: true },
  });

  if (!city) {
    return NextResponse.json({ error: 'City not found' }, { status: 404 });
  }

  const addressNormalized = normalizeAddress(street, buildingNumber);
  const addressFull = `${street} ${buildingNumber}`;

  const matchedDistrict = district
    ? city.districts.find(
        (d) => d.slug === district.toLowerCase() || d.nameKey === district,
      )
    : null;

  let building = await prisma.building.findUnique({
    where: { cityId_addressNormalized: { cityId: city.id, addressNormalized } },
  });

  if (!building) {
    building = await prisma.building.create({
      data: {
        cityId: city.id,
        districtId: matchedDistrict?.id ?? null,
        street,
        buildingNumber,
        addressFull,
        addressNormalized,
        lat: lat ?? null,
        lng: lng ?? null,
        placeId: placeId ?? null,
      },
    });
  }

  const electricityAvg = electricity
    ? parseFloat(electricity)
    : electricityWinter && electricitySummer
      ? (parseFloat(electricityWinter) + parseFloat(electricitySummer)) / 2
      : null;

  const totalMonthlyAvg =
    (parseFloat(rent) || 0) +
    (parseFloat(adminFee) || 0) +
    (electricityAvg || 0) +
    (parseFloat(gas) || 0) +
    (parseFloat(heating) || 0) +
    (parseFloat(water) || 0) +
    (parseFloat(internet) || 0) +
    (parseFloat(otherCosts) || 0);

  const costReport = await prisma.costReport.create({
    data: {
      buildingId: building.id,
      authorId: user.id,
      currency: 'PLN',
      rent: rent ? parseFloat(rent) : null,
      adminFee: adminFee ? parseFloat(adminFee) : null,
      electricityAvg: electricityAvg ?? null,
      electricityWinter: electricityWinter ? parseFloat(electricityWinter) : null,
      electricitySummer: electricitySummer ? parseFloat(electricitySummer) : null,
      gas: gas ? parseFloat(gas) : null,
      heating: heating ? parseFloat(heating) : null,
      heatingIncluded: heatingIncluded ?? null,
      water: water ? parseFloat(water) : null,
      waterIncluded: waterIncluded ?? null,
      internet: internet ? parseFloat(internet) : null,
      internetProvider: internetProvider || null,
      otherCosts: otherCosts ? parseFloat(otherCosts) : null,
      otherCostsNote: otherCostsNote || null,
      totalMonthlyAvg: totalMonthlyAvg || null,
      rooms: rooms ? parseInt(rooms, 10) : null,
      areaM2: areaM2 ? parseFloat(areaM2) : null,
      floor: floor ? parseInt(floor, 10) : null,
      leaseType: leaseType || null,
      depositMonths: depositMonths ? parseFloat(depositMonths) : null,
      isCurrentTenant: isCurrentTenant ?? null,
      livedFrom: livedFrom ? new Date(livedFrom) : null,
      livedUntil: livedUntil ? new Date(livedUntil) : null,
    },
    include: { building: true },
  });

  await prisma.profile.update({
    where: { id: user.id },
    data: { hasContributedCost: true },
  });

  return NextResponse.json({ costReport }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const citySlug = searchParams.get('city') || 'warsaw';
  const district = searchParams.get('district');
  const search = searchParams.get('search');

  const city = await prisma.city.findUnique({
    where: { slug: citySlug },
    include: { districts: true },
  });

  if (!city) {
    return NextResponse.json({ error: 'City not found' }, { status: 404 });
  }

  const buildingWhere: Record<string, unknown> = { cityId: city.id };

  if (district) {
    buildingWhere.district = { slug: district };
  }

  if (search) {
    buildingWhere.addressFull = { contains: search, mode: 'insensitive' };
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
    orderBy: { costReports: { _count: 'desc' } },
  });

  const result = buildings.map((b) => {
    const reports = b.costReports;
    const count = reports.length;

    const avg = (field: keyof typeof reports[0]) => {
      const values = reports
        .map((r) => r[field])
        .filter((v): v is NonNullable<typeof v> => v !== null)
        .map(Number);
      if (values.length === 0) return null;
      return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    };

    return {
      id: b.id,
      address: b.addressFull,
      district: b.district?.nameKey ?? '',
      districtSlug: b.district?.slug ?? '',
      reports: count,
      avgTotal: avg('totalMonthlyAvg'),
      avgRent: avg('rent'),
      avgUtilities:
        (avg('electricityAvg') || 0) +
        (avg('gas') || 0) +
        (avg('heating') || 0) +
        (avg('water') || 0) +
        (avg('internet') || 0),
    };
  });

  return NextResponse.json({
    buildings: result,
    districts: city.districts.map((d) => ({ slug: d.slug, name: d.nameKey })),
  });
}
