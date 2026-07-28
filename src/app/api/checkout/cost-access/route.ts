import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { stripe, STRIPE_PRICES, toStripeLocale, checkoutWaiverText } from '@/lib/stripe';
import { trackServerEvent, flushPostHog } from '@/lib/posthog-server';
import { SITE_URL } from '@/lib/site-url';
import { isAccountDeleted, ACCOUNT_DELETED_RESPONSE } from '@/lib/active-user';

const TIER_PRICE_MAP: Record<number, string> = {
  7: STRIPE_PRICES.COST_ACCESS_7,
  30: STRIPE_PRICES.COST_ACCESS_30,
  90: STRIPE_PRICES.COST_ACCESS_90,
};

const VALID_TIERS = [7, 30, 90] as const;

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

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (await isAccountDeleted(user.id)) {
    return NextResponse.json(ACCOUNT_DELETED_RESPONSE, { status: 403 });
  }

  const body = await request.json();
  const tierDays = Number(body.tierDays);
  const locale: string | undefined = body.locale;

  if (!VALID_TIERS.includes(tierDays as (typeof VALID_TIERS)[number])) {
    return NextResponse.json({ error: 'Invalid tier. Use 7, 30, or 90.' }, { status: 400 });
  }

  const priceId = TIER_PRICE_MAP[tierDays];
  if (!priceId) {
    return NextResponse.json({ error: 'Price not configured' }, { status: 500 });
  }

  const waiverText = checkoutWaiverText(locale);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    locale: toStripeLocale(locale),
    customer_email: user.email ?? undefined,
    billing_address_collection: 'required',
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    success_url: `${SITE_URL}/warsaw/costs?cost_access=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/warsaw/costs?cost_access=cancel`,
    metadata: {
      userId: user.id,
      productType: 'cost_access',
      tierDays: String(tierDays),
      locale: locale ?? '',
    },
    payment_intent_data: {
      receipt_email: user.email ?? undefined,
    },
    consent_collection: {
      terms_of_service: 'required',
    },
    custom_text: {
      terms_of_service_acceptance: {
        message: waiverText,
      },
    },
  });

  await prisma.payment.create({
    data: {
      userId: user.id,
      stripeCheckoutSessionId: session.id,
      productType: 'cost_access',
      amount: session.amount_total ?? 0,
      currency: session.currency ?? 'pln',
      status: 'pending',
      consentText: waiverText,
    },
  });

  trackServerEvent(user.id, 'checkout_session_created', {
    productType: 'cost_access',
    tierDays,
    amount: session.amount_total ?? 0,
    currency: session.currency ?? 'pln',
    sessionId: session.id,
  });
  await flushPostHog();

  return NextResponse.json({ url: session.url });
}
