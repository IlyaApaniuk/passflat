import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import type { CityBounds } from '@/lib/listings-data';
import { getAlternates, getOgImage } from '@/lib/seo';
import { LOCATION_CHECKER_CITY_SLUG } from '@/lib/location-checker';
import { Footer } from '@/components/landing/footer';
import { ReviewClient } from './client';

interface PageProps {
  params: Promise<{ locale: string; city: string }>;
}

const getCity = cache((slug: string) =>
  prisma.city.findUnique({
    where: { slug },
    select: {
      slug: true,
      nameKey: true,
      bounds: true,
      isActive: true,
      country: { select: { defaultLocale: true } },
    },
  }),
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, city } = await params;
  setRequestLocale(locale);
  if (city !== LOCATION_CHECKER_CITY_SLUG) return { title: 'Not found' };

  const cityRecord = await getCity(city);
  if (!cityRecord || !cityRecord.isActive) return { title: 'Not found' };

  const t = await getTranslations();
  const cityName = t(cityRecord.nameKey);
  const title = t('review.metaTitle', { city: cityName });
  const description = t('review.metaDescription', { city: cityName });

  return {
    title,
    description,
    alternates: getAlternates(`/${city}/review`),
    openGraph: { title, description, images: [getOgImage(title, description)] },
  };
}

export default async function ReviewPage({ params }: PageProps) {
  const { locale, city } = await params;
  setRequestLocale(locale);

  if (city !== LOCATION_CHECKER_CITY_SLUG) notFound();

  const cityRecord = await getCity(city);
  if (!cityRecord || !cityRecord.isActive) notFound();

  const t = await getTranslations();
  const canonicalTranslations = await getTranslations({
    locale: cityRecord.country.defaultLocale,
  });

  return (
    <div className="flex min-h-screen flex-col">
      <main className="relative flex-1 overflow-hidden bg-muted/30 pt-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-gradient-to-b from-primary/10 via-primary/[0.03] to-transparent" />
        <div className="relative container mx-auto px-4 py-8 sm:py-12">
          <ReviewClient
            citySlug={cityRecord.slug}
            cityName={t(cityRecord.nameKey)}
            cityCanonicalName={canonicalTranslations(cityRecord.nameKey)}
            cityBounds={(cityRecord.bounds as CityBounds | null) ?? null}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
