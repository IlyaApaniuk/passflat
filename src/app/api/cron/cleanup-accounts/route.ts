import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';
import { deletePhotosFromStorage } from '@/lib/supabase/storage-server';
import { trackServerEvent } from '@/lib/posthog-server';
import { DELETED_AUTHOR_ID, DELETED_AUTHOR_DISPLAY_NAME } from '@/lib/import-constants';
import { requireCronAuth } from '@/lib/admin-auth';

// Cap work per run so a large backlog drains across runs instead of OOM/timeout.
// Account deletion is heavier (storage + auth calls), so a smaller batch.
const BATCH = 100;

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

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
    take: BATCH,
  });

  // Preserve the community dataset across account deletion: cost reports are the
  // medians — the platform's core asset — so instead of letting the profile
  // delete cascade them away, re-point them to the system "Deleted user" profile
  // and strip every personal identifier. This is genuine anonymization (no key
  // left to re-link to a future account), which is the lawful basis for keeping
  // them (privacy policy: retention.costReports). Listings/conversations remain
  // personal content and are still removed with the account.
  if (profilesToDelete.length > 0) {
    await prisma.profile.upsert({
      where: { id: DELETED_AUTHOR_ID },
      create: { id: DELETED_AUTHOR_ID, displayName: DELETED_AUTHOR_DISPLAY_NAME },
      update: {},
    });
  }

  let deletedCount = 0;

  for (const profile of profilesToDelete) {
    const allPhotos = profile.listings.flatMap((l) => l.photos);

    if (allPhotos.length > 0) {
      await deletePhotosFromStorage(allPhotos);
    }

    // Anonymize before delete: once re-pointed and stripped, the author cascade
    // has nothing to remove, so the data survives de-linked from the person.
    const anonymized = await prisma.costReport.updateMany({
      where: { authorId: profile.id },
      data: {
        authorId: DELETED_AUTHOR_ID,
        importedEmail: null,
        anonymousId: null,
        claimedAt: null,
      },
    });

    await prisma.profile.delete({ where: { id: profile.id } });

    await supabaseAdmin.auth.admin.deleteUser(profile.id);

    trackServerEvent(profile.id, 'account_hard_deleted', {
      listings_deleted: profile.listings.length,
      photos_deleted: allPhotos.length,
      cost_reports_anonymized: anonymized.count,
    });

    deletedCount++;
  }

  return NextResponse.json({
    success: true,
    deletedCount,
    hasMore: profilesToDelete.length === BATCH,
    timestamp: new Date().toISOString(),
  });
}
