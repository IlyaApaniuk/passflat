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
import { trackServerEvent } from '@/lib/posthog-server';
import { trackView } from '@/lib/track-view';
import { deletePhotosFromStorage } from '@/lib/supabase/storage-server';

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

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  trackView(id).catch(() => {});

  return NextResponse.json({ listing });
}

const VALID_STATUSES = ['active', 'found', 'expired', 'cancelled', 'pending_payment'] as const;
type ListingStatus = (typeof VALID_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  active: ['found', 'cancelled'],
  found: ['active'],
  expired: ['active'],
  cancelled: ['active'],
  pending_payment: [],
};

const UPDATABLE_COMMON_FIELDS = [
  'title',
  'description',
  'rooms',
  'areaM2',
  'floor',
  'amenities',
  'thingsToKnow',
  'registrationPossible',
  'photos',
  'apartmentNumber',
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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    if (existing.isPaid && status === 'active' && currentStatus !== 'active') {
      return NextResponse.json(
        { error: 'Paid listings cannot be reactivated. Create a new listing instead.' },
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

  if (existing.isPaid && body.type && body.type !== existing.type) {
    return NextResponse.json({ error: 'Cannot change type of a paid listing' }, { status: 422 });
  }

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
    const priceFieldsChanged = fieldKeys.some((k) =>
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

    // Enforce 90-day lifetime cap for paid listings
    if (existing.isPaid && existing.paidAt && data.expiresAt) {
      const cap = new Date(existing.paidAt.getTime() + 90 * 24 * 60 * 60 * 1000);
      if ((data.expiresAt as Date) > cap) {
        data.expiresAt = cap;
      }
    }
  }

  // Update building's postalCode if provided
  if (body.postalCode !== undefined) {
    await prisma.building.update({
      where: { id: existing.buildingId },
      data: { postalCode: body.postalCode || null },
    });
  }

  if (Object.keys(data).length === 0 && body.postalCode === undefined) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  if (Array.isArray(data.photos) && (data.photos as string[]).length > 10) {
    return NextResponse.json({ error: 'Maximum 10 photos allowed' }, { status: 400 });
  }

  if (Array.isArray(data.photos)) {
    const removedPhotos = existing.photos.filter((url) => !(data.photos as string[]).includes(url));
    if (removedPhotos.length > 0) {
      await deletePhotosFromStorage(removedPhotos);
    }
  }

  if (data.expiresAt !== undefined) {
    data.expiringNotifiedAt = null;
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

  if (body.status && body.status !== existing.status) {
    const daysActive = Math.floor(
      (Date.now() - new Date(existing.createdAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    trackServerEvent(user.id, 'listing_status_changed', {
      listing_id: id,
      type: listingType,
      old_status: existing.status,
      new_status: body.status,
      days_active: daysActive,
    });
  }

  return NextResponse.json({ listing });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.listing.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  if (existing.authorId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (existing.photos.length > 0) {
    await deletePhotosFromStorage(existing.photos);
  }

  await prisma.listing.delete({ where: { id } });

  trackServerEvent(user.id, 'listing_deleted', {
    listing_id: id,
    type: existing.type,
  });

  return NextResponse.json({ success: true });
}
