import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from Server Component context
          }
        },
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Guest favourites live in localStorage and are flushed here on login, so the
// realistic ceiling is a few dozen. The cap keeps a hand-crafted body from
// turning one request into a giant insert.
const MAX_IDS = 200;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const listingIds = body?.listingIds;
  if (!Array.isArray(listingIds) || listingIds.length === 0) {
    return NextResponse.json({ ok: true });
  }

  if (listingIds.length > MAX_IDS) {
    return NextResponse.json({ error: `Too many listings (max ${MAX_IDS})` }, { status: 400 });
  }

  // Listing ids are UUIDs; anything else can only produce a foreign-key 500.
  const allUuids = listingIds.every(
    (id: unknown) => typeof id === 'string' && UUID_PATTERN.test(id),
  );
  if (!allUuids) {
    return NextResponse.json({ error: 'Invalid listing id' }, { status: 400 });
  }

  const uniqueIds = [...new Set(listingIds as string[])];

  await prisma.savedListing.createMany({
    data: uniqueIds.map((listingId) => ({
      userId: user.id,
      listingId,
    })),
    skipDuplicates: true,
  });

  return NextResponse.json({ ok: true });
}
