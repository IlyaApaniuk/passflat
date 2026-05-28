import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deletePhotosFromStorage } from '@/lib/supabase/storage-server';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const staleListings = await prisma.listing.findMany({
    where: {
      status: 'expired',
      updatedAt: { lte: ninetyDaysAgo },
    },
    select: { id: true, photos: true },
  });

  let deletedCount = 0;
  let photosDeleted = 0;

  for (const listing of staleListings) {
    if (listing.photos.length > 0) {
      await deletePhotosFromStorage(listing.photos);
      photosDeleted += listing.photos.length;
    }

    await prisma.listing.delete({ where: { id: listing.id } });
    deletedCount++;
  }

  return NextResponse.json({
    success: true,
    deletedCount,
    photosDeleted,
    timestamp: new Date().toISOString(),
  });
}
