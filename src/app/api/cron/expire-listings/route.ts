import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { trackServerEvent } from '@/lib/posthog-server';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  const expiringWhere = {
    status: 'active' as const,
    OR: [
      { expiresAt: { lte: now } },
      {
        type: 'sublet' as const,
        availableTo: { lte: now },
      },
      {
        expiresAt: null,
        type: 'replacement' as const,
        createdAt: { lte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) },
      },
      {
        expiresAt: null,
        type: 'roommate' as const,
        createdAt: { lte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      },
    ],
  };

  const expiringListings = await prisma.listing.findMany({
    where: expiringWhere,
    select: { id: true, type: true, viewsCount: true, responsesCount: true, authorId: true },
  });

  const result = await prisma.listing.updateMany({
    where: expiringWhere,
    data: { status: 'expired' },
  });

  for (const listing of expiringListings) {
    trackServerEvent(listing.authorId, 'listing_auto_expired', {
      listing_id: listing.id,
      type: listing.type,
      total_views: listing.viewsCount,
      total_responses: listing.responsesCount,
    });
  }

  const promoResult = await prisma.listing.updateMany({
    where: {
      isPromoted: true,
      promotedUntil: { lte: now },
    },
    data: { isPromoted: false },
  });

  return NextResponse.json({
    success: true,
    expiredCount: result.count,
    promotionsCleared: promoResult.count,
    timestamp: now.toISOString(),
  });
}
