import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  paymentFindFirst: vi.fn(),
  listingUpdate: vi.fn(),
  listingFindUnique: vi.fn(),
}));

// @/lib/stripe instantiates a Stripe client at module load, so it must be mocked
// (no STRIPE_SECRET_KEY in the test env) — and it's where we control signature
// verification.
vi.mock('@/lib/stripe', () => ({
  stripe: { webhooks: { constructEvent: h.constructEvent } },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    payment: { findFirst: h.paymentFindFirst, create: vi.fn(), update: vi.fn() },
    listing: { findUnique: h.listingFindUnique, update: h.listingUpdate },
  },
}));

vi.mock('@/lib/resend', () => ({
  sendPaymentConfirmationEmail: vi.fn(),
  sendRefundEmail: vi.fn(),
}));

vi.mock('@/lib/posthog-server', () => ({
  trackServerEvent: vi.fn(),
  flushPostHog: vi.fn(),
  captureServerException: vi.fn(),
}));

import { POST } from './route';

function req(rawBody: string, sig?: string): NextRequest {
  const headers = new Headers();
  if (sig) headers.set('stripe-signature', sig);
  return { text: async () => rawBody, headers } as unknown as NextRequest;
}

beforeEach(() => {
  h.constructEvent.mockReset();
  h.paymentFindFirst.mockReset();
  h.listingUpdate.mockReset();
  h.listingFindUnique.mockReset();
});

describe('POST /api/webhooks/stripe', () => {
  it('rejects a request with no stripe-signature header (400)', async () => {
    const res = await POST(req('{}'));
    expect(res.status).toBe(400);
    expect(h.constructEvent).not.toHaveBeenCalled();
  });

  it('rejects a forged/invalid signature (400)', async () => {
    h.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });
    const res = await POST(req('{}', 'bad-sig'));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: 'Invalid signature' });
  });

  it('is idempotent: skips a checkout.session already marked completed', async () => {
    h.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_existing', metadata: {} } },
    });
    h.paymentFindFirst.mockResolvedValue({ id: 'pay_1', status: 'completed' });

    const res = await POST(req('{}', 'good-sig'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ received: true });
    // Early-returned before touching the listing.
    expect(h.listingUpdate).not.toHaveBeenCalled();
  });
});
