import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/send';
import { resolveEmailLocale } from '@/lib/email/types';
import { trackServerEvent, flushPostHog, captureServerException } from '@/lib/posthog-server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { isPrismaUniqueConstraintError } from '@/lib/location-checker';

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 3;

const LISTING_TYPES = ['replacement', 'roommate', 'sublet'];

/** Stable machine-readable error codes (spec 02); the client maps them to `error_code`. */
type ErrorCode =
  | 'rate_limited'
  | 'invalid_input'
  | 'consent_required'
  | 'invalid_email'
  | 'unknown_city'
  | 'unknown_district'
  | 'server_error';

function errorResponse(status: number, code: ErrorCode, error: string) {
  return NextResponse.json({ error, code }, { status });
}

/** `undefined`/`null` → '', a string → trimmed, anything else → null (invalid). */
function optionalTrimmed(value: unknown): string | null {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value.trim() : null;
}

// Logged-in one-tap subscribe: when the client sends no email (we already have
// their account email), resolve it from the Supabase session.
async function getSessionEmail(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.email ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const { allowed } = checkRateLimit({
    key: `city-notify:${ip}`,
    limit: MAX_REQUESTS_PER_WINDOW,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });

  if (!allowed) {
    return errorResponse(429, 'rate_limited', 'Too many requests. Please try again later.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'invalid_input', 'Invalid JSON');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return errorResponse(400, 'invalid_input', 'Invalid JSON');
  }

  const { email, city, consent, locale, districtSlug, listingType } = body as {
    email?: unknown;
    city?: unknown;
    consent?: unknown;
    locale?: string;
    districtSlug?: unknown;
    listingType?: unknown;
  };

  if (typeof city !== 'string' || !city.trim()) {
    return errorResponse(400, 'invalid_input', 'City is required');
  }

  if (!consent) {
    return errorResponse(400, 'consent_required', 'Consent to data processing is required');
  }

  // Email from the body (logged-out form) or, for a logged-in one-tap subscribe,
  // from the Supabase session.
  let resolvedEmail = typeof email === 'string' ? email.trim() : '';
  if (!resolvedEmail) {
    resolvedEmail = (await getSessionEmail()) ?? '';
  }
  if (!resolvedEmail) {
    return errorResponse(400, 'invalid_email', 'Email is required');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(resolvedEmail)) {
    return errorResponse(400, 'invalid_email', 'Invalid email address');
  }

  const normalizedEmail = resolvedEmail.toLowerCase();
  const cityName = city.trim();
  const cityNormalized = cityName.toLowerCase();
  const emailLocale = resolveEmailLocale(locale);

  // Three classes (spec 02), validated independently:
  //   city launch        listingType ''   districtSlug ''    (`city` is free text)
  //   listings, city     listingType type districtSlug ''    (`city` is a City.slug)
  //   listings, district listingType type districtSlug slug  (district of that city)
  // A district without a type never falls back to a city-launch row. Listings
  // classes are checked against real records so no phantom city/district is stored.
  const listingTypeClean = optionalTrimmed(listingType);
  const districtSlugClean = optionalTrimmed(districtSlug);
  if (listingTypeClean === null || districtSlugClean === null) {
    return errorResponse(400, 'invalid_input', 'Invalid listing type or district');
  }
  if (!listingTypeClean && districtSlugClean) {
    return errorResponse(400, 'invalid_input', 'listingType required');
  }
  const isListingsInterest = listingTypeClean !== '';
  if (isListingsInterest) {
    if (!LISTING_TYPES.includes(listingTypeClean)) {
      return errorResponse(400, 'invalid_input', 'Invalid listing type');
    }
    const cityRec = await prisma.city.findUnique({
      where: { slug: cityNormalized },
      select: { id: true },
    });
    if (!cityRec) {
      return errorResponse(400, 'unknown_city', 'Unknown city');
    }
    if (districtSlugClean) {
      const dist = await prisma.district.findFirst({
        where: { cityId: cityRec.id, slug: districtSlugClean },
        select: { id: true },
      });
      if (!dist) {
        return errorResponse(400, 'unknown_district', 'Unknown district');
      }
    }
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
    // Two parallel identical submits can both try the insert; the loser hits the
    // unique key. The row exists and the winner tracks and confirms it, so this
    // one just succeeds (no second event, no duplicate e-mail).
    if (isPrismaUniqueConstraintError(err)) {
      return NextResponse.json({ success: true }, { status: 200 });
    }
    console.error('[city-notify] Failed to persist subscription:', err);
    captureServerException(err, {
      distinctId: normalizedEmail,
      properties: { source: 'city_notify', step: 'persist', city: cityName },
    });
    await flushPostHog();
    return errorResponse(500, 'server_error', 'Something went wrong. Please try again.');
  }

  trackServerEvent(
    normalizedEmail,
    isListingsInterest ? 'district_notify_subscribed' : 'city_notify_subscribed',
    {
      city: cityName,
      locale: emailLocale,
      ...(isListingsInterest
        ? { districtSlug: districtSlugClean, listingType: listingTypeClean }
        : {}),
    },
  );
  await flushPostHog();

  // Only the city-launch class gets the "we'll tell you when we launch here"
  // confirmation: that copy is about a city launch, and no code notifies
  // listings-interest rows; the in-UI success state is their confirmation.
  if (!isListingsInterest) {
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
