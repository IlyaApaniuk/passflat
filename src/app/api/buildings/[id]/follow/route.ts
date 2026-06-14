import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

/**
 * Follow / unfollow a building. Following opts the user into re-engagement
 * emails when new cost reports land (see /api/cron/re-engage). Requires an
 * account — we need an email to notify — so guests get 401 and the client
 * sends them to login. Mirrors the favorites (SavedListing) pattern.
 */

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// Display-only follow state. Returns false for guests (not a security boundary).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getUserId();

  // Follower count is public (social proof); personal follow state needs auth.
  const [count, follow] = await Promise.all([
    prisma.buildingFollow.count({ where: { buildingId: id } }),
    userId
      ? prisma.buildingFollow.findUnique({
          where: { userId_buildingId: { userId, buildingId: id } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  return NextResponse.json({ following: !!follow, count });
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Following a non-existent building would 500 on the FK — reject cleanly.
  const building = await prisma.building.findUnique({ where: { id }, select: { id: true } });
  if (!building) return NextResponse.json({ error: 'Building not found' }, { status: 404 });

  await prisma.buildingFollow.upsert({
    where: { userId_buildingId: { userId, buildingId: id } },
    create: { userId, buildingId: id },
    update: {},
  });
  return NextResponse.json({ following: true }, { status: 201 });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await prisma.buildingFollow.deleteMany({ where: { userId, buildingId: id } });
  return NextResponse.json({ following: false });
}
