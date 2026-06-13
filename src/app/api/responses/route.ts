import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { sendNewInquiryEmail } from '@/lib/resend';
import { trackServerEvent } from '@/lib/posthog-server';
import { localeUrl } from '@/lib/email/url';
import { resolveEmailLocale } from '@/lib/email/types';

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
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
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

  const body = await request.json();
  const { listingId, message, name, phone } = body;

  if (!listingId) {
    return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      author: {
        select: { id: true, email: true, contactValue: true, displayName: true, locale: true },
      },
      building: { include: { district: true, city: true } },
    },
  });

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  if (listing.authorId === user.id) {
    return NextResponse.json({ error: 'Cannot respond to your own listing' }, { status: 400 });
  }

  const existing = await prisma.listingResponse.findFirst({
    where: { listingId, responderId: user.id },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'You have already responded to this listing' },
      { status: 409 },
    );
  }

  if (name || phone) {
    await prisma.profile.update({
      where: { id: user.id },
      data: {
        ...(name ? { displayName: name } : {}),
        ...(phone ? { contactMethod: 'phone', contactValue: phone } : {}),
      },
    });
  }

  const [response] = await prisma.$transaction([
    prisma.listingResponse.create({
      data: {
        listingId,
        responderId: user.id,
        message: message || null,
        status: 'pending',
      },
    }),
    prisma.listing.update({
      where: { id: listingId },
      data: { responsesCount: { increment: 1 } },
    }),
  ]);

  const authorEmail = listing.author?.email ?? null;

  if (authorEmail && process.env.RESEND_API_KEY) {
    const citySlug = listing.building.city?.slug || 'warsaw';
    const locale = resolveEmailLocale(listing.author?.locale);

    await sendNewInquiryEmail({
      to: authorEmail,
      locale,
      listingTitle: listing.title,
      responderName: name || user.email || 'Someone',
      responderEmail: user.email || '',
      responderPhone: phone || undefined,
      message: message || 'No message provided.',
      listingUrl: localeUrl(locale, `/${citySlug}/${listing.type}/${listing.slug ?? listing.id}`),
      dashboardUrl: localeUrl(locale, '/dashboard'),
    });
  }

  trackServerEvent(user.id, 'inquiry_sent', {
    listing_id: listingId,
    listing_type: listing.type,
    listing_author_id: listing.authorId,
  });

  return NextResponse.json({ response }, { status: 201 });
}
