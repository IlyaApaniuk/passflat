import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminUser } from '@/lib/admin-auth';

// Moderation list: the most recent reports (flagged + visible) so an admin can
// spot and remove spam/garbage before it poisons the medians. Admin-gated.
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const reports = await prisma.costReport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      building: { select: { addressFull: true, slug: true, city: { select: { slug: true } } } },
      author: { select: { email: true, displayName: true } },
    },
  });

  return NextResponse.json({
    reports: reports.map((r) => ({
      id: r.id,
      address: r.building.addressFull,
      citySlug: r.building.city.slug,
      slug: r.building.slug,
      total: r.totalMonthlyAvg != null ? Number(r.totalMonthlyAvg) : null,
      rent: r.rent != null ? Number(r.rent) : null,
      isVisible: r.isVisible,
      verificationStatus: r.verificationStatus,
      authorEmail: r.author?.email ?? null,
      authorName: r.author?.displayName ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
