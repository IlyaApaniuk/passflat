import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { sendPaymentConfirmationEmail, sendRefundEmail } from '@/lib/resend';
import { trackServerEvent, flushPostHog, captureServerException } from '@/lib/posthog-server';
import { SITE_URL } from '@/lib/site-url';
import { resolveEmailLocale } from '@/lib/email/types';
import type Stripe from 'stripe';

const PAID_LISTING_MAX_DAYS = 90;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('[stripe webhook] Signature verification failed:', err);
    captureServerException(err, {
      properties: { source: 'stripe_webhook', step: 'signature_verification' },
    });
    await flushPostHog();
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata ?? {};
      const { productType, listingId, userId, paidListing, promoteDays } = metadata;

      const existingPayment = await prisma.payment.findFirst({
        where: { stripeCheckoutSessionId: session.id, status: 'completed' },
      });
      if (existingPayment) {
        return NextResponse.json({ received: true });
      }

      if (productType === 'listing' && listingId) {
        const now = new Date();
        const updateData: Record<string, unknown> = {};

        if (paidListing === 'true') {
          updateData.status = 'active';
          updateData.isPaid = true;
          updateData.paidAt = now;

          const listing = await prisma.listing.findUnique({
            where: { id: listingId },
            select: { expiresAt: true },
          });
          const cap = new Date(now.getTime() + PAID_LISTING_MAX_DAYS * 24 * 60 * 60 * 1000);
          if (listing?.expiresAt && listing.expiresAt > cap) {
            updateData.expiresAt = cap;
          }
        }

        const parsedDays = parseInt(promoteDays || '0', 10);
        if (parsedDays > 0) {
          updateData.isPromoted = true;
          updateData.promotedUntil = new Date(now.getTime() + parsedDays * 24 * 60 * 60 * 1000);
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.listing.update({
            where: { id: listingId },
            data: updateData,
          });
        }
      }

      if (productType === 'cost_access' && userId) {
        const parsedDays = parseInt(metadata.tierDays || '0', 10);
        if (parsedDays > 0) {
          const profile = await prisma.profile.findUnique({
            where: { id: userId },
            select: { costAccessUntil: true },
          });
          const now = new Date();
          const base =
            profile?.costAccessUntil && profile.costAccessUntil > now
              ? profile.costAccessUntil
              : now;
          const newUntil = new Date(base.getTime() + parsedDays * 24 * 60 * 60 * 1000);

          await prisma.profile.update({
            where: { id: userId },
            data: { costAccessUntil: newUntil },
          });
        }
      }

      const consentAccepted = session.consent?.terms_of_service === 'accepted';

      await prisma.payment.updateMany({
        where: { stripeCheckoutSessionId: session.id },
        data: {
          status: 'completed',
          consentAccepted,
          consentAt: consentAccepted ? new Date() : null,
          stripePaymentIntentId:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
        },
      });

      const promoteDaysNum = parseInt(promoteDays || '0', 10);
      const tierDaysNum = parseInt(metadata.tierDays || '0', 10);

      if (userId) {
        trackServerEvent(userId, 'payment_succeeded', {
          productType: productType ?? null,
          amount: session.amount_total ?? 0,
          currency: session.currency ?? 'pln',
          listingId: listingId ?? null,
          paidListing: paidListing === 'true',
          promoteDays: promoteDaysNum,
          tierDays: tierDaysNum,
          sessionId: session.id,
        });

        if (productType === 'listing' && listingId && promoteDaysNum > 0) {
          trackServerEvent(userId, 'listing_promoted', {
            listingId,
            promoteDays: promoteDaysNum,
          });
        }
      }

      // Durable-medium confirmation email (art. 38 pkt 13 lit. d).
      const buyerEmail = session.customer_details?.email ?? session.customer_email ?? null;
      if (buyerEmail) {
        const locale = metadata.locale || 'pl';
        await sendPaymentConfirmationEmail({
          to: buyerEmail,
          locale,
          productType: productType ?? '',
          paidListing: paidListing === 'true',
          promoteDays: parseInt(promoteDays || '0', 10),
          tierDays: parseInt(metadata.tierDays || '0', 10),
          amount: session.amount_total ?? 0,
          currency: session.currency ?? 'pln',
          termsUrl: `${SITE_URL}/${locale}/terms`,
          date: new Date(),
        });
      }
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session;
      // Abandoned checkout — the ghost row never resulted in a charge, so drop it
      // instead of leaving noise in the user's payment history. Scoped to 'pending'
      // so a row that completed first is never touched, and idempotent on retries.
      const deleted = await prisma.payment.deleteMany({
        where: { stripeCheckoutSessionId: session.id, status: 'pending' },
      });

      const abandonedUserId = session.metadata?.userId;
      if (abandonedUserId && deleted.count > 0) {
        trackServerEvent(abandonedUserId, 'checkout_abandoned', {
          productType: session.metadata?.productType ?? null,
          sessionId: session.id,
        });
      }
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : (charge.payment_intent?.id ?? null);

      if (paymentIntentId) {
        const payment = await prisma.payment.findFirst({
          where: { stripePaymentIntentId: paymentIntentId },
        });

        // Idempotent: skip if already marked refunded.
        if (payment && payment.status !== 'refunded') {
          await prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'refunded', refundedAt: new Date() },
          });

          trackServerEvent(payment.userId, 'payment_refunded', {
            productType: payment.productType,
            amount: charge.amount_refunded,
            currency: charge.currency,
            referenceId: payment.referenceId ?? null,
            paymentId: payment.id,
          });

          // Revert the access that was granted by the original payment.
          if (payment.productType === 'cost_access') {
            await prisma.profile.update({
              where: { id: payment.userId },
              data: { costAccessUntil: new Date(0) },
            });
          } else if (payment.productType === 'listing' && payment.referenceId) {
            const listing = await prisma.listing.findUnique({
              where: { id: payment.referenceId },
              select: { isPaid: true, isPromoted: true },
            });
            if (listing) {
              const revertData: Record<string, unknown> = {};
              // Paid (extra) listing -> unset paid flag and deactivate.
              if (listing.isPaid) {
                revertData.isPaid = false;
                revertData.paidAt = null;
                revertData.status = 'inactive';
              }
              // Promotion -> unset promoted flag and clear the promotion window.
              if (listing.isPromoted) {
                revertData.isPromoted = false;
                revertData.promotedUntil = null;
              }
              if (Object.keys(revertData).length > 0) {
                await prisma.listing.update({
                  where: { id: payment.referenceId },
                  data: revertData,
                });
              }
            }
          }

          const refundEmail = charge.receipt_email ?? charge.billing_details?.email ?? null;
          if (refundEmail) {
            const profile = await prisma.profile.findUnique({
              where: { id: payment.userId },
              select: { locale: true },
            });
            const locale = resolveEmailLocale(charge.metadata?.locale || profile?.locale);
            try {
              await sendRefundEmail({
                to: refundEmail,
                locale,
                productType: payment.productType,
                amount: charge.amount_refunded,
                currency: charge.currency,
                dashboardUrl: `${SITE_URL}/${locale}/dashboard`,
                date: new Date(),
              });
            } catch (err) {
              console.error('[stripe webhook] Failed to send refund email:', err);
              captureServerException(err, {
                distinctId: payment.userId,
                properties: { source: 'stripe_webhook', step: 'refund_email' },
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[stripe webhook] Handler failed:', err);
    captureServerException(err, {
      properties: { source: 'stripe_webhook', step: 'handler', eventType: event.type },
    });
    await flushPostHog();
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  await flushPostHog();

  return NextResponse.json({ received: true });
}
