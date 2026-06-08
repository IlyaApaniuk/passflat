import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { trackServerEvent } from '@/lib/posthog-server';
import { routing } from '@/i18n/routing';

export async function DELETE() {
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
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    include: {
      listings: { where: { status: 'active' }, select: { id: true } },
      costReports: { select: { id: true } },
      conversationParticipants: { select: { id: true } },
    },
  });

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.profile.update({
      where: { id: user.id },
      data: { deletedAt: new Date() },
    }),
    prisma.listing.updateMany({
      where: { authorId: user.id, status: { in: ['active', 'pending'] } },
      data: { status: 'deleted' },
    }),
  ]);

  trackServerEvent(user.id, 'account_soft_deleted', {
    listings_count: profile.listings.length,
    cost_reports_count: profile.costReports.length,
    conversations_count: profile.conversationParticipants.length,
  });

  await supabase.auth.signOut();

  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
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
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const data: { displayName?: string; locale?: string } = {};

  if (body.displayName !== undefined) {
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    if (!displayName || displayName.length > 100) {
      return NextResponse.json({ error: 'displayName must be 1-100 characters' }, { status: 400 });
    }
    data.displayName = displayName;
  }

  if (body.locale !== undefined) {
    const locales = routing.locales as readonly string[];
    if (typeof body.locale !== 'string' || !locales.includes(body.locale)) {
      return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
    }
    data.locale = body.locale;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const updated = await prisma.profile.update({
    where: { id: user.id },
    data,
  });

  return NextResponse.json({
    success: true,
    displayName: updated.displayName,
    locale: updated.locale,
  });
}

export async function GET() {
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
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats = await prisma.profile.findUnique({
    where: { id: user.id },
    select: {
      listings: {
        where: { status: 'active' },
        select: {
          id: true,
          title: true,
          isPromoted: true,
          promotedUntil: true,
        },
      },
      costReports: { select: { id: true } },
      conversationParticipants: { select: { id: true } },
    },
  });

  if (!stats) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const promotedListings = stats.listings
    .filter((l) => l.isPromoted && l.promotedUntil && l.promotedUntil > new Date())
    .map((l) => ({
      id: l.id,
      title: l.title,
      daysRemaining: Math.ceil((l.promotedUntil!.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    }));

  return NextResponse.json({
    activeListings: stats.listings.length,
    conversations: stats.conversationParticipants.length,
    costReports: stats.costReports.length,
    promotedListings,
  });
}
