import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { getOrCreateProfile } from '@/lib/profile';

/**
 * User abuse reports (DSA "notice" mechanism). A logged-in user flags a piece of
 * public user content — currently listings — and an admin reviews it in the
 * /admin/reports queue. Requires an account (so reports are attributable and
 * spam-resistant); guests get 401 and the client nudges them to sign in. The
 * Report table already exists; no migration.
 */

const ALLOWED_TARGETS = ['listing'] as const;
const ALLOWED_REASONS = ['scam', 'inaccurate', 'offensive', 'spam', 'other'] as const;
const MAX_DETAIL = 1000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { targetType, targetId, reason, detail } = body ?? {};

  if (!ALLOWED_TARGETS.includes(targetType)) {
    return NextResponse.json({ error: 'Invalid targetType' }, { status: 400 });
  }
  if (typeof targetId !== 'string' || !targetId) {
    return NextResponse.json({ error: 'targetId required' }, { status: 400 });
  }
  if (!ALLOWED_REASONS.includes(reason)) {
    return NextResponse.json({ error: 'Invalid reason' }, { status: 400 });
  }

  // Target must exist so the queue never shows dangling reports.
  const listing = await prisma.listing.findUnique({
    where: { id: targetId },
    select: { id: true },
  });
  if (!listing) return NextResponse.json({ error: 'Target not found' }, { status: 404 });

  // Ensure the reporter has a Profile row (FK target) — a freshly-signed-up user
  // may not have triggered profile creation yet.
  await getOrCreateProfile(user);

  // One report per user per target — re-reporting is a no-op (not an error).
  const existing = await prisma.report.findFirst({
    where: { reporterId: user.id, targetType, targetId },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ ok: true, deduped: true });

  const trimmedDetail =
    typeof detail === 'string' && detail.trim() ? detail.trim().slice(0, MAX_DETAIL) : null;
  const reasonText = trimmedDetail ? `${reason}: ${trimmedDetail}` : reason;

  await prisma.report.create({
    data: { reporterId: user.id, targetType, targetId, reason: reasonText },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
