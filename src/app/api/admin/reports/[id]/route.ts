import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminUser } from '@/lib/admin-auth';

const STATUSES = ['pending', 'reviewed', 'dismissed'] as const;

// Resolve a report: set its status and, optionally, take down the reported
// listing (status='removed' drops it from every active-listing query). Admin-gated.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (!STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: 'status (pending|reviewed|dismissed) required' },
      { status: 400 },
    );
  }

  const report = await prisma.report.findUnique({
    where: { id },
    select: { id: true, targetType: true, targetId: true },
  });
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (body.hideListing === true && report.targetType === 'listing') {
    await prisma.listing
      .update({ where: { id: report.targetId }, data: { status: 'removed' } })
      .catch(() => {}); // listing may already be gone — resolving the report still stands
  }

  const updated = await prisma.report.update({
    where: { id },
    data: {
      status: body.status,
      ...(typeof body.moderatorNotes === 'string' ? { moderatorNotes: body.moderatorNotes } : {}),
    },
    select: { id: true, status: true },
  });

  return NextResponse.json({ report: updated });
}
