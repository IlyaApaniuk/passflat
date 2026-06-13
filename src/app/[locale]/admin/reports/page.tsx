import { notFound } from 'next/navigation';
import { getAdminUser } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { ReportsClient, type AdminReportRow } from './client';

// Internal moderation tool — direct-URL only, never linked publicly. Non-admins 404.
export const dynamic = 'force-dynamic';

export default async function AdminReportsPage() {
  const admin = await getAdminUser();
  if (!admin) notFound();

  const reports = await prisma.report.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { reporter: { select: { email: true, displayName: true } } },
  });

  // Resolve listing targets (the only target type today) so the queue can link
  // to them and show whether they're still live.
  const listingIds = reports.filter((r) => r.targetType === 'listing').map((r) => r.targetId);
  const listings = listingIds.length
    ? await prisma.listing.findMany({
        where: { id: { in: listingIds } },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          building: { select: { city: { select: { slug: true } } } },
        },
      })
    : [];
  const byId = new Map(listings.map((l) => [l.id, l]));

  const serialized: AdminReportRow[] = reports.map((r) => {
    const l = r.targetType === 'listing' ? byId.get(r.targetId) : undefined;
    return {
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      reporter: r.reporter?.email ?? r.reporter?.displayName ?? 'unknown',
      listing: l
        ? { title: l.title, type: l.type, status: l.status, citySlug: l.building.city.slug }
        : null,
    };
  });

  return <ReportsClient reports={serialized} />;
}
