import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
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

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      productType: true,
      referenceId: true,
      amount: true,
      currency: true,
      status: true,
      createdAt: true,
      stripePaymentIntentId: true,
    },
  });

  // Resolve listing titles for listing payments.
  const listingIds = Array.from(
    new Set(
      payments
        .filter((p) => p.productType === 'listing' && p.referenceId)
        .map((p) => p.referenceId as string),
    ),
  );

  const titleById = new Map<string, string>();
  if (listingIds.length > 0) {
    const listings = await prisma.listing.findMany({
      where: { id: { in: listingIds } },
      select: { id: true, title: true },
    });
    for (const l of listings) titleById.set(l.id, l.title);
  }

  const result = payments.map((p) => ({
    id: p.id,
    productType: p.productType,
    reference: p.referenceId ? (titleById.get(p.referenceId) ?? null) : null,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    date: p.createdAt,
    hasReceipt: Boolean(p.stripePaymentIntentId) && p.status === 'completed',
  }));

  return NextResponse.json({ payments: result });
}
