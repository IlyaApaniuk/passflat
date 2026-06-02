import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { captureServerException, flushPostHog } from '@/lib/posthog-server';
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

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment || payment.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!payment.stripePaymentIntentId) {
    return NextResponse.json({ error: 'No receipt available' }, { status: 404 });
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId, {
      expand: ['latest_charge'],
    });
    const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    const receiptUrl = charge?.receipt_url ?? null;

    if (!receiptUrl) {
      return NextResponse.json({ error: 'No receipt available' }, { status: 404 });
    }
    return NextResponse.json({ url: receiptUrl });
  } catch (err) {
    console.error('[payments/receipt] Failed to fetch receipt:', err);
    captureServerException(err, {
      distinctId: user.id,
      properties: { source: 'payments_receipt', paymentId: id },
    });
    await flushPostHog();
    return NextResponse.json({ error: 'Failed to fetch receipt' }, { status: 500 });
  }
}
