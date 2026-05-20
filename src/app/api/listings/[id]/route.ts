import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  isValidListingType,
  validateTypeSpecificFields,
  computeExpiresAt,
  computePriceFields,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      building: {
        include: { district: true, city: true },
      },
      author: {
        select: { displayName: true, createdAt: true },
      },
    },
  });

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  await prisma.listing.update({
    where: { id },
    data: { viewsCount: { increment: 1 } },
  });

  return NextResponse.json({ listing });
}

const VALID_STATUSES = ['active', 'found', 'expired', 'cancelled'] as const;
type ListingStatus = (typeof VALID_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  active: ['found', 'cancelled'],
  found: ['active'],
  expired: ['active'],
  cancelled: ['active'],
};

const UPDATABLE_COMMON_FIELDS = [
  'title',
  'description',
  'rooms',
  'areaM2',
  'floor',
  'petsAllowed',
  'furnished',
  'photos',
] as const;

const UPDATABLE_REPLACEMENT_FIELDS = [
  'rent',
  'adminFee',
  'utilitiesAvg',
  'availableFrom',
  'depositAmount',
  'leaseType',
  'leaseEndDate',
] as const;

const UPDATABLE_ROOMMATE_FIELDS = [
  'pricePerPerson',
  'totalApartmentRent',
  'currentRoommates',
  'totalRooms',
  'roomType',
  'preferredGender',
  'preferredAgeMin',
  'preferredAgeMax',
  'roommateDescription',
  'availableFrom',
  'depositAmount',
] as const;

const UPDATABLE_SUBLET_FIELDS = [
  'availableFrom',
  'availableTo',
  'priceTotal',
  'utilitiesIncluded',
  'internetIncluded',
  'subletRules',
  'depositAmount',
] as const;

function getUpdatableFieldsForType(type: ListingType): readonly string[] {
  switch (type) {
    case 'replacement':
      return [...UPDATABLE_COMMON_FIELDS, ...UPDATABLE_REPLACEMENT_FIELDS];
    case 'roommate':
      return [...UPDATABLE_COMMON_FIELDS, ...UPDATABLE_ROOMMATE_FIELDS];
    case 'sublet':
      return [...UPDATABLE_COMMON_FIELDS, ...UPDATABLE_SUBLET_FIELDS];
  }
}

const DECIMAL_FIELDS = new Set([
  'rent',
  'adminFee',
  'utilitiesAvg',
  'areaM2',
  'depositAmount',
  'pricePerPerson',
  'totalApartmentRent',
  'priceTotal',
]);
const INT_FIELDS = new Set([
  'rooms',
  'floor',
  'currentRoommates',
  'totalRooms',
  'preferredAgeMin',
  'preferredAgeMax',
]);
const DATE_FIELDS = new Set(['availableFrom', 'availableTo', 'leaseEndDate']);

function coerceFieldValue(field: string, value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;
  if (DECIMAL_FIELDS.has(field)) return parseFloat(value as string) || null;
  if (INT_FIELDS.has(field)) return parseInt(value as string, 10) || null;
  if (DATE_FIELDS.has(field)) return new Date(value as string);
  return value;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.listing.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  if (existing.authorId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const listingType = existing.type as ListingType;
  const data: Record<string, unknown> = {};

  // Handle status transition
  if (body.status) {
    const { status } = body;
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Use: active, found, expired, cancelled' },
        { status: 400 },
      );
    }

    const currentStatus = existing.status as ListingStatus;
    const allowed = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed?.includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition from "${currentStatus}" to "${status}"` },
        { status: 422 },
      );
    }

    data.status = status;

    if (status === 'active') {
      data.expiresAt = computeExpiresAt(listingType, {
        ...existing,
        ...body,
      } as Record<string, unknown>);
    }
  }

  // Handle field updates (only on active listings unless it's just a status change)
  const fieldKeys = Object.keys(body).filter((k) => k !== 'status');
  if (fieldKeys.length > 0) {
    if (existing.status !== 'active' && !body.status) {
      return NextResponse.json(
        { error: 'Can only update fields on active listings' },
        { status: 422 },
      );
    }

    const allowedFields = getUpdatableFieldsForType(listingType);

    for (const key of fieldKeys) {
      if (allowedFields.includes(key)) {
        data[key] = coerceFieldValue(key, body[key]);
      }
    }

    // Re-validate type-specific constraints after applying changes
    const merged = { ...existing, ...data } as Record<string, unknown>;
    const validation = validateTypeSpecificFields(listingType, merged);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Recompute derived price fields when relevant prices change
    const priceFieldsChanged =
      fieldKeys.some((k) =>
        ['rent', 'adminFee', 'utilitiesAvg', 'pricePerPerson', 'priceTotal'].includes(k),
      );
    if (priceFieldsChanged) {
      const prices = computePriceFields(listingType, merged);
      if (prices.totalMonthly !== null) data.totalMonthly = prices.totalMonthly;
      if (prices.pricePerPerson !== null) data.pricePerPerson = prices.pricePerPerson;
      if (prices.priceTotal !== null) data.priceTotal = prices.priceTotal;
    }

    // Recompute expiry for sublet if dates changed
    if (listingType === 'sublet' && fieldKeys.includes('availableTo') && data.availableTo) {
      data.expiresAt = new Date(data.availableTo as string);
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const listing = await prisma.listing.update({
    where: { id },
    data,
    include: {
      building: {
        include: { district: true },
      },
    },
  });

  return NextResponse.json({ listing });
}
