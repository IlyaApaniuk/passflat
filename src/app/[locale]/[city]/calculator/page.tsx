import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { Footer } from '@/components/landing/footer';
import { getAlternates, getOgImage } from '@/lib/seo';
import { JsonLd, breadcrumbJsonLd } from '@/lib/json-ld';
import { getBuildingsData, rollUpDistricts } from '@/lib/cost-aggregates';
import { median, TRUST_THRESHOLDS } from '@/lib/cost-stats';
import { pickMessages } from '@/i18n/messages';
import { CalculatorClient, type DistrictCalcData } from './client';

// ISR: pure compute over open cost data — no auth/cookies, so it is cacheable for crawlers.
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ locale: string; city: string }>;
  searchParams: Promise<{ district?: string }>;
}

const getCity = cache((slug: string) =>
  prisma.city.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      nameKey: true,
      districts: { select: { slug: true, nameKey: true } },
    },
  }),
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city } = await params;
  const cityRec = await getCity(city);
  if (!cityRec) return { title: 'Not found' };

  const t = await getTranslations();
  const cityName = t(cityRec.nameKey);
  const title = t('calculator.metaTitle', { city: cityName });
  const description = t('calculator.metaDescription', { city: cityName });

  return {
    title,
    description,
    alternates: getAlternates(`/${city}/calculator`),
    openGraph: { title, description, images: [getOgImage(title, description)] },
  };
}

export default async function CalculatorPage({ params, searchParams }: PageProps) {
  const { locale, city } = await params;
  setRequestLocale(locale);

  const cityRec = await getCity(city);
  if (!cityRec) notFound();
  const { district: initialDistrictRaw } = await searchParams;

  const t = await getTranslations();
  const cityName = t(cityRec.nameKey);

  // Real rent & czynsz medians per district (and a city-wide rent/m² fallback).
  const buildings = await getBuildingsData(cityRec.id, null, null);
  const rollups = rollUpDistricts(buildings, cityRec.districts);
  const bySlug = new Map(rollups.map((r) => [r.slug, r]));
  const cityRentPerM2 = median(rollups.map((r) => r.medianRentPerM2).filter((v) => v > 0)) ?? 0;

  // Every district is offered (norms cover the ones without data); reliable ones
  // carry their real rent/czynsz medians so the estimate is anchored to data.
  const districts: DistrictCalcData[] = cityRec.districts
    .map((d) => {
      const r = bySlug.get(d.slug);
      const reportCount = r?.reportCount ?? 0;
      return {
        slug: d.slug,
        name: d.nameKey,
        rentPerM2: r?.medianRentPerM2 ?? 0,
        czynszPerM2: r?.medianAdminFeePerM2 ?? 0,
        reportCount,
        reliable: reportCount >= TRUST_THRESHOLDS.reliableMin,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const initialDistrict =
    initialDistrictRaw && districts.some((d) => d.slug === initialDistrictRaw)
      ? initialDistrictRaw
      : null;

  // The `calculator` namespace is large and used by exactly this one page, so it
  // is provided via a scoped client provider rather than the global shared list.
  // `common`/`share` cover the subtree (ShareButton).
  const messages = await getMessages();
  const clientMessages = pickMessages(messages, ['calculator', 'common', 'share']);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 bg-muted/30 pt-24">
        <div className="container mx-auto px-4 py-8">
          <JsonLd
            data={breadcrumbJsonLd([
              { name: cityName, path: `/${city}` },
              { name: t('calculator.breadcrumb'), path: `/${city}/calculator` },
            ])}
          />
          <NextIntlClientProvider messages={clientMessages}>
            <CalculatorClient
              citySlug={city}
              cityName={cityName}
              districts={districts}
              cityRentPerM2={cityRentPerM2}
              initialDistrict={initialDistrict}
            />
          </NextIntlClientProvider>
        </div>
      </main>
      <Footer />
    </div>
  );
}
