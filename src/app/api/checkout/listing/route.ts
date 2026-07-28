import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { stripe, STRIPE_PRICES, toStripeLocale, checkoutWaiverText } from '@/lib/stripe';
import { trackServerEvent, flushPostHog, isServerFeatureFlagEnabled } from '@/lib/posthog-server';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { SITE_URL } from '@/lib/site-url';
import { isAccountDeleted, ACCOUNT_DELETED_RESPONSE } from '@/lib/active-user';

const PROMOTE_PRICE_MAP: Record<number, string> = {
  7: STRIPE_PRICES.PROMOTE_7,
  14: STRIPE_PRICES.PROMOTE_14,
  30: STRIPE_PRICES.PROMOTE_30,
};

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
  const { listingId, paidListing = false, promoteDays = 0, locale } = body;

  if (!listingId) {
    return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  if (listing.authorId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (promoteDays > 0) {
    const promotionEnabled = await isServerFeatureFlagEnabled(
      FEATURE_FLAGS.PROMOTED_LISTINGS_ENABLED,
      user.id,
    );
    if (!promotionEnabled) {
      return NextResponse.json({ error: 'Promotion is currently unavailable' }, { status: 403 });
    }
  }

  const lineItems: { price: string; quantity: number }[] = [];

  if (paidListing) {
    lineItems.push({ price: STRIPE_PRICES.EXTRA_LISTING, quantity: 1 });
  }

  if (promoteDays > 0 && PROMOTE_PRICE_MAP[promoteDays]) {
    lineItems.push({ price: PROMOTE_PRICE_MAP[promoteDays], quantity: 1 });
  }

  if (lineItems.length === 0) {
    return NextResponse.json({ error: 'Nothing to pay for' }, { status: 400 });
  }

  const waiverText = checkoutWaiverText(locale);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    locale: toStripeLocale(locale),
    customer_email: user.email ?? undefined,
    billing_address_collection: 'required',
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    success_url: `${SITE_URL}/dashboard?paid=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/dashboard?paid=cancel`,
    metadata: {
      listingId,
      userId: user.id,
      paidListing: paidListing ? 'true' : 'false',
      promoteDays: String(promoteDays),
      productType: 'listing',
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
      productType: 'listing',
      referenceId: listingId,
      amount: session.amount_total ?? 0,
      currency: session.currency ?? 'pln',
      status: 'pending',
      consentText: waiverText,
    },
  });

  trackServerEvent(user.id, 'checkout_session_created', {
    productType: 'listing',
    listingId,
    paidListing,
    promoteDays,
    amount: session.amount_total ?? 0,
    currency: session.currency ?? 'pln',
    sessionId: session.id,
  });
  await flushPostHog();

  return NextResponse.json({ url: session.url });
}
