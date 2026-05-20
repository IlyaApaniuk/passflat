import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  isValidListingType,
  validateTypeSpecificFields,
  computeExpiresAt,
  computePriceFields,
  getPriceFieldForType,
  type ListingType,
} from '@/lib/listings-validation';

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
    type = 'replacement',
    title,
    description,
    street,
    buildingNumber,
    district,
    placeId,
    lat,
    lng,
    citySlug,
    // Common apartment details
    rooms,
    areaM2,
    floor,
    petsAllowed,
    furnished,
    photos,
    // Replacement-specific
    rent,
    adminFee,
    utilitiesAvg,
    availableFrom,
    depositAmount,
    leaseType,
    leaseEndDate,
    // Roommate-specific
    pricePerPerson,
    totalApartmentRent,
    currentRoommates,
    totalRooms,
    roomType,
    preferredGender,
    preferredAgeMin,
    preferredAgeMax,
    roommateDescription,
    // Sublet-specific
    availableTo,
    priceTotal,
    utilitiesIncluded,
    internetIncluded,
    subletRules,
  } = body;

  if (!isValidListingType(type)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: replacement, roommate, sublet` },
      { status: 400 },
    );
  }

  if (!title || !street || !buildingNumber) {
    return NextResponse.json(
      { error: 'Missing required fields: title, street, buildingNumber' },
      { status: 400 },
    );
  }

  const typeValidation = validateTypeSpecificFields(type, body);
  if (!typeValidation.valid) {
    return NextResponse.json({ error: typeValidation.error }, { status: 400 });
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

  const priceFields = computePriceFields(type, body);
  const expiresAt = computeExpiresAt(type, body);

  const data: Record<string, unknown> = {
    buildingId: building.id,
    authorId: user.id,
    type,
    title,
    description: description || null,
    currency: 'PLN',
    rooms: rooms ? parseInt(rooms, 10) : null,
    areaM2: areaM2 ? parseFloat(areaM2) : null,
    floor: floor ? parseInt(floor, 10) : null,
    petsAllowed: petsAllowed ?? null,
    furnished: furnished ?? null,
    photos: photos || [],
    status: 'active',
    expiresAt,
    totalMonthly: priceFields.totalMonthly,
    pricePerPerson: priceFields.pricePerPerson,
    priceTotal: priceFields.priceTotal,
  };

  if (type === 'replacement') {
    data.rent = rent ? parseFloat(rent) : null;
    data.adminFee = adminFee ? parseFloat(adminFee) : null;
    data.utilitiesAvg = utilitiesAvg ? parseFloat(utilitiesAvg) : null;
    data.availableFrom = availableFrom ? new Date(availableFrom) : null;
    data.depositAmount = depositAmount ? parseFloat(depositAmount) : null;
    data.leaseType = leaseType || null;
    data.leaseEndDate = leaseEndDate ? new Date(leaseEndDate) : null;
  }

  if (type === 'roommate') {
    data.pricePerPerson = pricePerPerson ? parseFloat(pricePerPerson) : null;
    data.totalApartmentRent = totalApartmentRent ? parseFloat(totalApartmentRent) : null;
    data.currentRoommates = currentRoommates ? parseInt(currentRoommates, 10) : null;
    data.totalRooms = totalRooms ? parseInt(totalRooms, 10) : null;
    data.roomType = roomType || null;
    data.preferredGender = preferredGender || null;
    data.preferredAgeMin = preferredAgeMin ? parseInt(preferredAgeMin, 10) : null;
    data.preferredAgeMax = preferredAgeMax ? parseInt(preferredAgeMax, 10) : null;
    data.roommateDescription = roommateDescription || null;
    data.availableFrom = availableFrom ? new Date(availableFrom) : null;
    data.depositAmount = depositAmount ? parseFloat(depositAmount) : null;
  }

  if (type === 'sublet') {
    data.availableFrom = availableFrom ? new Date(availableFrom) : null;
    data.availableTo = availableTo ? new Date(availableTo) : null;
    data.priceTotal = priceTotal ? parseFloat(priceTotal) : null;
    data.utilitiesIncluded = utilitiesIncluded ?? null;
    data.internetIncluded = internetIncluded ?? null;
    data.subletRules = subletRules || null;
    data.depositAmount = depositAmount ? parseFloat(depositAmount) : null;
  }

  const listing = await prisma.listing.create({
    data: data as never,
    include: {
      building: true,
    },
  });

  return NextResponse.json({ listing }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const citySlug = searchParams.get('city') || 'warsaw';
  const type = searchParams.get('type');
  const district = searchParams.get('district');
  const priceMin = searchParams.get('priceMin');
  const priceMax = searchParams.get('priceMax');
  const rooms = searchParams.get('rooms');
  const areaMin = searchParams.get('areaMin');
  const areaMax = searchParams.get('areaMax');
  const sort = searchParams.get('sort') || 'newest';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  // Roommate-specific filters
  const roomType = searchParams.get('roomType');
  const preferredGender = searchParams.get('preferredGender');

  // Sublet-specific filters
  const availableFrom = searchParams.get('availableFrom');
  const availableTo = searchParams.get('availableTo');

  const city = await prisma.city.findUnique({ where: { slug: citySlug } });
  if (!city) {
    return NextResponse.json({ error: 'City not found' }, { status: 404 });
  }

  const where: Record<string, unknown> = {
    building: { cityId: city.id },
    status: 'active',
  };

  if (type && isValidListingType(type)) {
    where.type = type;
  }

  if (district) {
    (where.building as Record<string, unknown>).district = { slug: district };
  }

  if (priceMin || priceMax) {
    const priceField = getPriceFieldForType((type as ListingType) || null);
    where[priceField] = {};
    if (priceMin) (where[priceField] as Record<string, unknown>).gte = parseFloat(priceMin);
    if (priceMax) (where[priceField] as Record<string, unknown>).lte = parseFloat(priceMax);
  }

  if (rooms) {
    where.rooms = { gte: parseInt(rooms, 10) };
  }
  if (areaMin || areaMax) {
    where.areaM2 = {};
    if (areaMin) (where.areaM2 as Record<string, unknown>).gte = parseFloat(areaMin);
    if (areaMax) (where.areaM2 as Record<string, unknown>).lte = parseFloat(areaMax);
  }

  // Roommate-specific filters
  if (roomType) {
    where.roomType = roomType;
  }
  if (preferredGender) {
    where.preferredGender = preferredGender;
  }

  // Sublet-specific: filter by availability window overlap
  if (availableFrom || availableTo) {
    const dateFilters: Record<string, unknown>[] = [];
    if (availableFrom) {
      dateFilters.push({ availableTo: { gte: new Date(availableFrom) } });
    }
    if (availableTo) {
      dateFilters.push({ availableFrom: { lte: new Date(availableTo) } });
    }
    where.AND = dateFilters;
  }

  let orderBy: Record<string, string>[] = [];
  switch (sort) {
    case 'price-asc':
      orderBy = [{ [getPriceFieldForType((type as ListingType) || null)]: 'asc' }];
      break;
    case 'price-desc':
      orderBy = [{ [getPriceFieldForType((type as ListingType) || null)]: 'desc' }];
      break;
    case 'area-desc':
      orderBy = [{ areaM2: 'desc' }];
      break;
    default:
      orderBy = [{ isPromoted: 'desc' }, { createdAt: 'desc' }];
  }

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        building: {
          include: { district: true },
        },
      },
    }),
    prisma.listing.count({ where }),
  ]);

  return NextResponse.json({
    listings,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
