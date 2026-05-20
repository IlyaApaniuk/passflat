import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  const result = await prisma.listing.updateMany({
    where: {
      status: 'active',
      OR: [
        { expiresAt: { lte: now } },
        {
          type: 'sublet',
          availableTo: { lte: now },
        },
        {
          expiresAt: null,
          type: 'replacement',
          createdAt: { lte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) },
        },
        {
          expiresAt: null,
          type: 'roommate',
          createdAt: { lte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
        },
      ],
    },
    data: { status: 'expired' },
  });

  return NextResponse.json({
    success: true,
    expiredCount: result.count,
    timestamp: now.toISOString(),
  });
}
