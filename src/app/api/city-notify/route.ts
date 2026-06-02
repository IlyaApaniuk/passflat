import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/send';
import { resolveEmailLocale } from '@/lib/email/types';
import { trackServerEvent, flushPostHog, captureServerException } from '@/lib/posthog-server';

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 3;
const ipTimestamps = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = ipTimestamps.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  recent.push(now);
  ipTimestamps.set(ip, recent);
  return false;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { email, city, consent, locale } = body as {
    email?: string;
    city?: string;
    consent?: boolean;
    locale?: string;
  };

  if (!email?.trim() || !city?.trim()) {
    return NextResponse.json({ error: 'Email and city are required' }, { status: 400 });
  }

  if (!consent) {
    return NextResponse.json({ error: 'Consent to data processing is required' }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const cityName = city.trim();
  const cityNormalized = cityName.toLowerCase();
  const emailLocale = resolveEmailLocale(locale);

  try {
    await prisma.cityNotifySubscription.upsert({
      where: {
        email_cityNormalized: { email: normalizedEmail, cityNormalized },
      },
      create: {
        email: normalizedEmail,
        city: cityName,
        cityNormalized,
        locale: emailLocale,
        consent: true,
      },
      update: {
        city: cityName,
        locale: emailLocale,
        consent: true,
      },
    });
  } catch (err) {
    console.error('[city-notify] Failed to persist subscription:', err);
    captureServerException(err, {
      distinctId: normalizedEmail,
      properties: { source: 'city_notify', step: 'persist', city: cityName },
    });
    await flushPostHog();
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  trackServerEvent(normalizedEmail, 'city_notify_subscribed', {
    city: cityName,
    locale: emailLocale,
  });
  await flushPostHog();

  try {
    await sendEmail({
      to: normalizedEmail,
      locale: emailLocale,
      template: 'cityNotifyConfirmation',
      data: { cityName },
    });
  } catch (err) {
    console.error('[city-notify] Failed to send confirmation email:', err);
    captureServerException(err, {
      distinctId: normalizedEmail,
      properties: { source: 'city_notify', step: 'confirmation_email' },
    });
    await flushPostHog();
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
