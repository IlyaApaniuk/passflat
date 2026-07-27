import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import type { CityBounds } from '@/lib/listings-data';
import { getAlternates, getOgImage, getScoreOgImage } from '@/lib/seo';
import { SCORE_VERSION } from '@/lib/location-score';
import { LOCATION_CHECKER_CITY_SLUG } from '@/lib/location-checker';
import { pickMessages } from '@/i18n/messages';
import { Footer } from '@/components/landing/footer';
import { CheckerClient } from './client';

interface PageProps {
  params: Promise<{ locale: string; city: string }>;
  searchParams: Promise<{ p?: string | string[] }>;
}

const getCity = cache((slug: string) =>
  prisma.city.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      nameKey: true,
      bounds: true,
      isActive: true,
      country: { select: { defaultLocale: true } },
    },
  }),
);

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { locale, city } = await params;
  setRequestLocale(locale);
  if (city !== LOCATION_CHECKER_CITY_SLUG) return { title: 'Not found' };
  const cityRecord = await getCity(city);
  if (!cityRecord || !cityRecord.isActive) return { title: 'Not found' };

  const t = await getTranslations();
  const cityName = t(cityRecord.nameKey);
  const { p } = await searchParams;
  const placeId = typeof p === 'string' && p.length <= 300 ? p : null;
  const checkedBuilding = placeId
    ? await prisma.building.findFirst({
        where: { cityId: cityRecord.id, placeId },
        select: {
          addressFull: true,
          district: { select: { nameKey: true } },
          locationScore: { select: { overall: true, version: true } },
        },
      })
    : null;

  const title = checkedBuilding
    ? `${checkedBuilding.addressFull} — ${t('checker.result.locationScore')}`
    : t('checker.metaTitle', { city: cityName });
  const description = t('checker.metaDescription', { city: cityName });
  const score =
    checkedBuilding?.locationScore && checkedBuilding.locationScore.version >= SCORE_VERSION
      ? checkedBuilding.locationScore.overall
      : null;
  // District `nameKey` stores a display name (for example "Mokotów"), unlike
  // the city's actual translation key.
  const districtName = checkedBuilding?.district?.nameKey;
  const ogImage =
    checkedBuilding && score != null
      ? getScoreOgImage({
          title: checkedBuilding.addressFull,
          subtitle: districtName ? `${districtName}, ${cityName}` : cityName,
          score,
          scoreLabel: t('checker.result.locationScore'),
        })
      : getOgImage(title, description);

  return {
    title,
    description,
    alternates: getAlternates(`/${city}/check`),
    openGraph: { title, description, images: [ogImage] },
  };
}

export default async function CheckerPage({ params, searchParams }: PageProps) {
  const { locale, city } = await params;
  setRequestLocale(locale);

  if (city !== LOCATION_CHECKER_CITY_SLUG) notFound();

  const cityRecord = await getCity(city);
  if (!cityRecord || !cityRecord.isActive) notFound();

  const t = await getTranslations();
  const cityName = t(cityRecord.nameKey);
  const canonicalTranslations = await getTranslations({
    locale: cityRecord.country.defaultLocale,
  });
  const cityCanonicalName = canonicalTranslations(cityRecord.nameKey);
  const { p } = await searchParams;
  const initialPlaceId = typeof p === 'string' && p.length <= 300 ? p : null;

  // `checker` is page-specific and intentionally excluded from the shared client
  // bundle. `costs` is needed by FollowBuildingButton inside the result state.
  const messages = await getMessages();
  const clientMessages = pickMessages(messages, ['checker', 'costs']);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="relative flex-1 overflow-hidden bg-muted/30 pt-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-gradient-to-b from-primary/10 via-primary/[0.03] to-transparent" />
        <div className="relative container mx-auto px-4 py-8 sm:py-12">
          <NextIntlClientProvider messages={clientMessages}>
            <CheckerClient
              citySlug={cityRecord.slug}
              cityName={cityName}
              cityCanonicalName={cityCanonicalName}
              cityBounds={(cityRecord.bounds as CityBounds | null) ?? null}
              initialPlaceId={initialPlaceId}
            />
          </NextIntlClientProvider>
        </div>
      </main>
      <Footer />
    </div>
  );
}
