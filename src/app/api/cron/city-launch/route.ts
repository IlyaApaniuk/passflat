import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/send';
import { localeUrl } from '@/lib/email/url';
import { resolveEmailLocale } from '@/lib/email/types';
import { requireCronAuth } from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { city, citySlug, cityName } = body as {
    city?: string;
    citySlug?: string;
    cityName?: string;
  };

  if (!city?.trim() || !citySlug?.trim()) {
    return NextResponse.json({ error: 'city and citySlug are required' }, { status: 400 });
  }

  const cityNormalized = city.trim().toLowerCase();
  const slug = citySlug.trim();

  // Only the city-launch class (spec 02): listings-interest rows carry a
  // listingType and never get this e-mail. Rows saved before the classes were
  // split are not relabelled, so a lost-type row stays selectable.
  const subscribers = await prisma.cityNotifySubscription.findMany({
    where: {
      cityNormalized,
      listingType: '',
      districtSlug: '',
      consent: true,
      notifiedAt: null,
    },
  });

  let sent = 0;
  let failed = 0;

  // Each row is claimed before sending (notifiedAt set only while still null),
  // so overlapping manual runs send the e-mail once. A failed send releases the
  // claim for a later run. At most once: a crash between the claim and the send
  // loses that e-mail.
  for (const subscriber of subscribers) {
    const claimedAt = new Date();
    const claim = await prisma.cityNotifySubscription.updateMany({
      where: { id: subscriber.id, notifiedAt: null },
      data: { notifiedAt: claimedAt },
    });
    if (claim.count !== 1) continue; // another run has it

    const locale = resolveEmailLocale(subscriber.locale);
    const displayName = cityName?.trim() || subscriber.city;

    const result = await sendEmail({
      to: subscriber.email,
      locale,
      template: 'cityLaunch',
      data: {
        cityName: displayName,
        cityUrl: localeUrl(locale, `/${slug}/costs`),
      },
    });

    if (!result.success) {
      failed += 1;
      await prisma.cityNotifySubscription.updateMany({
        where: { id: subscriber.id, notifiedAt: claimedAt },
        data: { notifiedAt: null },
      });
      continue;
    }

    sent += 1;
  }

  return NextResponse.json({
    success: true,
    city: cityNormalized,
    citySlug: slug,
    matched: subscribers.length,
    sent,
    failed,
    timestamp: new Date().toISOString(),
  });
}
