import { notFound } from 'next/navigation';
import { getAdminUser } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { ModerationClient } from './client';

// Internal moderation tool — direct-URL only, never linked. Non-admins 404.
export const dynamic = 'force-dynamic';

export default async function AdminCostReportsPage() {
  const admin = await getAdminUser();
  if (!admin) notFound();

  const reports = await prisma.costReport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      building: { select: { addressFull: true, slug: true, city: { select: { slug: true } } } },
      author: { select: { email: true, displayName: true } },
    },
  });

  const serialized = reports.map((r) => ({
    id: r.id,
    address: r.building.addressFull,
    citySlug: r.building.city.slug,
    slug: r.building.slug,
    total: r.totalMonthlyAvg != null ? Number(r.totalMonthlyAvg) : null,
    isVisible: r.isVisible,
    verificationStatus: r.verificationStatus,
    authorEmail: r.author?.email ?? null,
    authorName: r.author?.displayName ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return <ModerationClient reports={serialized} />;
}
