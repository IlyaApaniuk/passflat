import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deletePhotosFromStorage } from '@/lib/supabase/storage-server';

const ABANDONED_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - ABANDONED_THRESHOLD_MS);

  const abandonedListings = await prisma.listing.findMany({
    where: {
      status: 'pending_payment',
      createdAt: { lte: cutoff },
    },
    select: { id: true, photos: true, authorId: true },
  });

  let deletedPhotos = 0;
  let deletedListings = 0;

  for (const listing of abandonedListings) {
    if (listing.photos.length > 0) {
      await deletePhotosFromStorage(listing.photos);
      deletedPhotos += listing.photos.length;
    }

    await prisma.listing.delete({ where: { id: listing.id } });
    deletedListings++;
  }

  return NextResponse.json({
    success: true,
    deletedListings,
    deletedPhotos,
    timestamp: new Date().toISOString(),
  });
}
