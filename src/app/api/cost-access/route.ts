import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

/**
 * Display-only personalization endpoint: reports whether the current user has
 * "contributed" (submitted a visible cost report) or has active paid cost
 * access. Used by public, statically-rendered pages (landing, about,
 * how-it-works) to resolve a blur/CTA toggle on the CLIENT, so those pages no
 * longer need a per-request server auth read.
 *
 * This is NOT a security boundary — the real cost data is gated server-side on
 * the /costs routes. A logged-out request simply returns `false`.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ hasContributed: false });
    }

    const [report, profile] = await Promise.all([
      prisma.costReport.findFirst({
        where: { authorId: user.id, isVisible: true },
        select: { id: true },
      }),
      prisma.profile.findUnique({
        where: { id: user.id },
        select: { costAccessUntil: true },
      }),
    ]);

    const hasContributed =
      !!report || (!!profile?.costAccessUntil && profile.costAccessUntil > new Date());

    return NextResponse.json({ hasContributed });
  } catch {
    return NextResponse.json({ hasContributed: false });
  }
}
