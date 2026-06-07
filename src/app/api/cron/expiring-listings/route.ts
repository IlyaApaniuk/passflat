import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/send';
import { localeUrl } from '@/lib/email/url';
import { resolveEmailLocale } from '@/lib/email/types';

const REMINDER_WINDOW_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * DAY_MS);

  const listings = await prisma.listing.findMany({
    where: {
      status: 'active',
      expiringNotifiedAt: null,
      expiresAt: { gt: now, lte: windowEnd },
    },
    select: {
      id: true,
      type: true,
      title: true,
      expiresAt: true,
      author: { select: { email: true, locale: true } },
      building: { select: { city: { select: { slug: true } } } },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const listing of listings) {
    if (!listing.expiresAt) {
      continue;
    }

    const recipientEmail = listing.author?.email ?? null;

    if (!recipientEmail) {
      failed += 1;
      continue;
    }

    const locale = resolveEmailLocale(listing.author?.locale);
    const citySlug = listing.building.city?.slug || 'warsaw';
    const daysLeft = Math.max(1, Math.ceil((listing.expiresAt.getTime() - now.getTime()) / DAY_MS));

    const result = await sendEmail({
      to: recipientEmail,
      locale,
      template: 'listingExpiring',
      data: {
        title: listing.title,
        listingUrl: localeUrl(locale, `/${citySlug}/${listing.type}/${listing.id}`),
        daysLeft,
        expiresAt: listing.expiresAt,
      },
    });

    if (!result.success) {
      failed += 1;
      continue;
    }

    await prisma.listing.update({
      where: { id: listing.id },
      data: { expiringNotifiedAt: new Date() },
    });
    sent += 1;
  }

  return NextResponse.json({
    success: true,
    matched: listings.length,
    sent,
    failed,
    timestamp: now.toISOString(),
  });
}
