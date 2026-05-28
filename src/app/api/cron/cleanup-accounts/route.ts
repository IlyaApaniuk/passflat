import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';
import { deletePhotosFromStorage } from '@/lib/supabase/storage-server';
import { trackServerEvent } from '@/lib/posthog-server';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const profilesToDelete = await prisma.profile.findMany({
    where: {
      deletedAt: { lte: thirtyDaysAgo },
    },
    select: {
      id: true,
      listings: {
        select: { id: true, photos: true },
      },
    },
  });

  let deletedCount = 0;

  for (const profile of profilesToDelete) {
    const allPhotos = profile.listings.flatMap((l) => l.photos);

    if (allPhotos.length > 0) {
      await deletePhotosFromStorage(allPhotos);
    }

    await prisma.profile.delete({ where: { id: profile.id } });

    await supabaseAdmin.auth.admin.deleteUser(profile.id);

    trackServerEvent(profile.id, 'account_hard_deleted', {
      listings_deleted: profile.listings.length,
      photos_deleted: allPhotos.length,
    });

    deletedCount++;
  }

  return NextResponse.json({
    success: true,
    deletedCount,
    timestamp: new Date().toISOString(),
  });
}
