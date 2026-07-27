import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOrCreateProfile } from '@/lib/profile';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  isValidListingType,
  validateTypeSpecificFields,
  validateListingNumericFields,
  normalizeTelegramHandle,
  normalizePhoneNumber,
  normalizeFacebookSlug,
  computeExpiresAt,
  computePriceFields,
  getPriceFieldForType,
  type ListingType,
} from '@/lib/listings-validation';
import { trackServerEvent } from '@/lib/posthog-server';
import { generateBuildingSlug, generateListingSlug } from '@/lib/slugify';
import { normalizeAddress } from '@/lib/address';
import { resolveDistrictByPoint } from '@/lib/geo/district';
import { FREE_LISTING_LIMIT } from '@/lib/stripe';
import { sanitizePeriodicCharges } from '@/lib/periodic-charges';
import { isAccountDeleted, ACCOUNT_DELETED_RESPONSE } from '@/lib/active-user';

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (await isAccountDeleted(user.id)) {
    return NextResponse.json(ACCOUNT_DELETED_RESPONSE, { status: 403 });
  }

  // Guarantee a profile exists before any write that FKs to author_id.
  await getOrCreateProfile(user);

  const body = await request.json();
  const {
    type = 'replacement',
    title,
    description,
    street,
    buildingNumber,
    apartmentNumber,
    postalCode,
    district,
    placeId,
    lat,
    lng,
    citySlug,
    // Common apartment details
    rooms,
    areaM2,
    floor,
    amenities,
    thingsToKnow,
    registrationPossible,
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
    // Flexible recurring charges (replacement + sublet)
    periodicCharges: periodicChargesInput,
    // External contacts (bypass internal chat when set)
    contactTelegram,
    contactPhone,
    contactFacebook,
    // Content language
    locale,
    // Payment-related
    promoteDays = 0,
  } = body;

  if (!isValidListingType(type)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: replacement, roommate, sublet` },
      { status: 400 },
    );
  }

  const telegramContact = normalizeTelegramHandle(contactTelegram);
  if (!telegramContact.valid) {
    return NextResponse.json(
      { error: 'Invalid Telegram username. Use 5-32 letters, digits or underscores.' },
      { status: 400 },
    );
  }
  const phoneContact = normalizePhoneNumber(contactPhone);
  if (!phoneContact.valid) {
    return NextResponse.json(
      { error: 'Invalid phone number. Use 7-15 digits, optionally starting with +.' },
      { status: 400 },
    );
  }
  const facebookContact = normalizeFacebookSlug(contactFacebook);
  if (!facebookContact.valid) {
    return NextResponse.json(
      { error: 'Invalid Facebook profile. Paste your profile link or username.' },
      { status: 400 },
    );
  }

  if (!title || !street || !buildingNumber) {
    return NextResponse.json(
      { error: 'Missing required fields: title, street, buildingNumber' },
      { status: 400 },
    );
  }

  if (Array.isArray(photos) && photos.length > 10) {
    return NextResponse.json({ error: 'Maximum 10 photos allowed' }, { status: 400 });
  }

  const typeValidation = validateTypeSpecificFields(type, body);
  if (!typeValidation.valid) {
    return NextResponse.json({ error: typeValidation.error }, { status: 400 });
  }

  const numericValidation = validateListingNumericFields(body);
  if (!numericValidation.valid) {
    return NextResponse.json({ error: numericValidation.error }, { status: 400 });
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

  // Prefer matching the Google Places district name; fall back to point-in-polygon
  // on the coordinates when the name does not match a known district, so the
  // building still gets a district instead of null.
  let matchedDistrict = district
    ? city.districts.find((d) => d.slug === district.toLowerCase() || d.nameKey === district)
    : null;

  if (!matchedDistrict) {
    const latNum = lat != null && lat !== '' ? Number(lat) : null;
    const lngNum = lng != null && lng !== '' ? Number(lng) : null;
    if (latNum != null && lngNum != null && Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      const resolvedSlug = resolveDistrictByPoint(city.slug, latNum, lngNum);
      if (resolvedSlug) {
        matchedDistrict = city.districts.find((d) => d.slug === resolvedSlug) ?? null;
      }
    }
  }

  let building = placeId ? await prisma.building.findFirst({ where: { placeId } }) : null;

  if (!building) {
    building = await prisma.building.findUnique({
      where: { cityId_addressNormalized: { cityId: city.id, addressNormalized } },
    });

    if (building && (placeId || postalCode)) {
      const updateData: Record<string, string> = {};
      if (placeId && !building.placeId) updateData.placeId = placeId;
      if (postalCode && !building.postalCode) updateData.postalCode = postalCode;
      if (Object.keys(updateData).length > 0) {
        building = await prisma.building.update({
          where: { id: building.id },
          data: updateData,
        });
      }
    }
  }

  if (!building) {
    let slug = generateBuildingSlug(street, buildingNumber);
    const existing = await prisma.building.findUnique({
      where: { cityId_slug: { cityId: city.id, slug } },
      select: { id: true },
    });
    if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    building = await prisma.building.create({
      data: {
        cityId: city.id,
        slug,
        districtId: matchedDistrict?.id ?? null,
        street,
        buildingNumber,
        addressFull,
        addressNormalized,
        lat: lat ?? null,
        lng: lng ?? null,
        placeId: placeId ?? null,
        postalCode: postalCode ?? null,
      },
    });
  }

  const activeFreeCount = await prisma.listing.count({
    where: { authorId: user.id, status: 'active', isPaid: false },
  });
  const overLimit = activeFreeCount >= FREE_LISTING_LIMIT;

  const priceFields = computePriceFields(type, body);
  const expiresAt = computeExpiresAt(type, body);

  const listingStatus = overLimit ? 'pending_payment' : 'active';

  const data: Record<string, unknown> = {
    buildingId: building.id,
    authorId: user.id,
    type,
    apartmentNumber: apartmentNumber || null,
    title,
    description: description || null,
    contactTelegram: telegramContact.handle,
    contactPhone: phoneContact.phone,
    contactFacebook: facebookContact.slug,
    locale: locale || null,
    currency: 'PLN',
    rooms: rooms ? parseInt(rooms, 10) : null,
    areaM2: areaM2 ? parseFloat(areaM2) : null,
    floor: floor ? parseInt(floor, 10) : null,
    amenities: Array.isArray(amenities) ? amenities : [],
    thingsToKnow: Array.isArray(thingsToKnow) ? thingsToKnow : [],
    registrationPossible:
      registrationPossible === true ? true : registrationPossible === false ? false : null,
    photos: photos || [],
    status: listingStatus,
    expiresAt,
    totalMonthly: priceFields.totalMonthly,
    pricePerPerson: priceFields.pricePerPerson,
    priceTotal: priceFields.priceTotal,
  };

  const periodicCharges = sanitizePeriodicCharges(periodicChargesInput);

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

  if ((type === 'replacement' || type === 'sublet') && periodicCharges.length > 0) {
    data.periodicCharges = { create: periodicCharges };
  }

  const listing = await prisma.listing.create({
    data: data as never,
    include: {
      building: true,
    },
  });

  // SEO slug from the title + the listing's own id (the suffix is unique, so no
  // collision). Set post-create because the id is DB-generated.
  const slug = generateListingSlug(title, listing.id);
  await prisma.listing.update({ where: { id: listing.id }, data: { slug } });
  listing.slug = slug;

  const parsedPromoteDays = parseInt(promoteDays, 10) || 0;
  const needCheckout = overLimit || parsedPromoteDays > 0;

  trackServerEvent(user.id, 'listing_created', {
    listing_id: listing.id,
    type,
    city: citySlug || 'warsaw',
    district: matchedDistrict?.slug ?? null,
    has_photos: (photos?.length ?? 0) > 0,
    price: priceFields.totalMonthly ?? priceFields.pricePerPerson ?? priceFields.priceTotal,
    is_paid: overLimit,
    promote_days: parsedPromoteDays,
  });

  return NextResponse.json(
    { listing, needCheckout, overLimit, promoteDays: parsedPromoteDays },
    { status: 201 },
  );
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
  // Clamped: `limit` feeds Prisma `take` and `page` feeds `skip`, so an
  // unbounded value is a free full-table read and a negative one a 500.
  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 100) : 20;

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
