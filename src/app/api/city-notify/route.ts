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

  const { email, city, consent, locale, districtSlug, listingType } = body as {
    email?: string;
    city?: string;
    consent?: boolean;
    locale?: string;
    districtSlug?: string;
    listingType?: string;
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

  // District-scoped listings waitlist (new). "" keeps the original whole-city
  // landing path. Validate against REAL records so we never store a phantom
  // district/type (honesty guardrail) — here `city` is the city slug.
  const LISTING_TYPES = ['replacement', 'roommate', 'sublet'];
  let districtSlugClean = '';
  let listingTypeClean = '';
  if (typeof districtSlug === 'string' && districtSlug.trim()) {
    const lt = typeof listingType === 'string' ? listingType.trim() : '';
    if (!LISTING_TYPES.includes(lt)) {
      return NextResponse.json({ error: 'Invalid listing type' }, { status: 400 });
    }
    const cityRec = await prisma.city.findUnique({
      where: { slug: cityNormalized },
      select: { id: true },
    });
    if (!cityRec) {
      return NextResponse.json({ error: 'Unknown city' }, { status: 400 });
    }
    const dist = await prisma.district.findFirst({
      where: { cityId: cityRec.id, slug: districtSlug.trim() },
      select: { id: true },
    });
    if (!dist) {
      return NextResponse.json({ error: 'Unknown district' }, { status: 400 });
    }
    districtSlugClean = districtSlug.trim();
    listingTypeClean = lt;
  }

  try {
    await prisma.cityNotifySubscription.upsert({
      where: {
        email_cityNormalized_districtSlug_listingType: {
          email: normalizedEmail,
          cityNormalized,
          districtSlug: districtSlugClean,
          listingType: listingTypeClean,
        },
      },
      create: {
        email: normalizedEmail,
        city: cityName,
        cityNormalized,
        districtSlug: districtSlugClean,
        listingType: listingTypeClean,
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

  const isDistrict = districtSlugClean !== '';
  trackServerEvent(
    normalizedEmail,
    isDistrict ? 'district_notify_subscribed' : 'city_notify_subscribed',
    {
      city: cityName,
      locale: emailLocale,
      ...(isDistrict ? { districtSlug: districtSlugClean, listingType: listingTypeClean } : {}),
    },
  );
  await flushPostHog();

  // City-level waitlist gets the existing "we'll tell you when we launch here"
  // confirmation. District listings waitlists skip it for now — that copy is for
  // city launch, and the district-launch dispatch is a deliberate follow-up (A3);
  // the in-UI success state is the confirmation until then.
  if (!isDistrict) {
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
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
