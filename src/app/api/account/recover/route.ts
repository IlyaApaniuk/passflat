import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { trackServerEvent } from '@/lib/posthog-server';

export async function POST() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { deletedAt: true },
  });

  if (!profile || !profile.deletedAt) {
    return NextResponse.json({ error: 'Account is not scheduled for deletion' }, { status: 400 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (profile.deletedAt < thirtyDaysAgo) {
    return NextResponse.json({ error: 'Recovery period has expired' }, { status: 410 });
  }

  await prisma.$transaction([
    prisma.profile.update({
      where: { id: user.id },
      data: { deletedAt: null },
    }),
    prisma.listing.updateMany({
      where: {
        authorId: user.id,
        status: 'deleted',
        expiresAt: { gt: new Date() },
      },
      data: { status: 'active' },
    }),
  ]);

  trackServerEvent(user.id, 'account_recovered');

  return NextResponse.json({ success: true });
}
