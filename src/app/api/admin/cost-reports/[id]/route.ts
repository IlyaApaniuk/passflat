import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminUser } from '@/lib/admin-auth';
import { revalidateCostSurfaces } from '@/lib/revalidate-costs';
import { syncHasContributedCost } from '@/lib/contribution';

/** Every cached surface the report feeds, so moderation takes effect at once
 *  rather than after the pages' one-hour ISR window. */
const REPORT_SURFACES = {
  select: {
    authorId: true,
    building: {
      select: {
        slug: true,
        city: { select: { slug: true } },
        district: { select: { slug: true } },
      },
    },
  },
} as const;

// Hide / unhide a report (toggle isVisible). Hidden reports drop out of every
// median/list immediately but stay in the DB (reversible). Admin-gated.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (typeof body.isVisible !== 'boolean') {
    return NextResponse.json({ error: 'isVisible (boolean) required' }, { status: 400 });
  }

  const existing = await prisma.costReport.findUnique({ where: { id }, ...REPORT_SURFACES });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updated = await prisma.costReport.update({
    where: { id },
    data: { isVisible: body.isVisible },
    select: { id: true, isVisible: true },
  });

  // Hiding someone's only visible report also takes their contributor access.
  if (existing.authorId) await syncHasContributedCost(existing.authorId);
  revalidateCostSurfaces({
    citySlug: existing.building.city.slug,
    buildingSlug: existing.building.slug,
    districtSlug: existing.building.district?.slug ?? null,
  });

  return NextResponse.json({ costReport: updated });
}

// Hard delete — for genuine spam/garbage. Admin-gated.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.costReport.findUnique({ where: { id }, ...REPORT_SURFACES });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.costReport.delete({ where: { id } });

  if (existing.authorId) await syncHasContributedCost(existing.authorId);
  revalidateCostSurfaces({
    citySlug: existing.building.city.slug,
    buildingSlug: existing.building.slug,
    districtSlug: existing.building.district?.slug ?? null,
  });

  return NextResponse.json({ ok: true });
}
