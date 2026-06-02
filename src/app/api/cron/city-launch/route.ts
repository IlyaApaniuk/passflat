import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/send';
import { localeUrl } from '@/lib/email/url';
import { resolveEmailLocale } from '@/lib/email/types';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  const subscribers = await prisma.cityNotifySubscription.findMany({
    where: { cityNormalized, notifiedAt: null },
  });

  let sent = 0;
  let failed = 0;

  for (const subscriber of subscribers) {
    const locale = resolveEmailLocale(subscriber.locale);
    const displayName = cityName?.trim() || subscriber.city;

    const result = await sendEmail({
      to: subscriber.email,
      locale,
      template: 'cityLaunch',
      data: {
        cityName: displayName,
        cityUrl: localeUrl(locale, `/${slug}/replacement`),
      },
    });

    if (!result.success) {
      failed += 1;
      continue;
    }

    await prisma.cityNotifySubscription.update({
      where: { id: subscriber.id },
      data: { notifiedAt: new Date() },
    });
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
