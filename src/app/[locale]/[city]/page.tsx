import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { Footer } from '@/components/landing/footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAlternates, getOgImage, getCostOgImage } from '@/lib/seo';
import { JsonLd, breadcrumbJsonLd } from '@/lib/json-ld';
import { getBuildingsData, rollUpDistricts } from '@/lib/cost-aggregates';
import { median } from '@/lib/cost-stats';
import { ShareButton } from '@/components/costs/share-button';
import { ArrowRight, MapPin, Building2, Calculator, Plus } from 'lucide-react';

// ISR: no auth/cookies on this page (cost data is open), so it can be cached and
// revalidated for crawlers instead of rendering per request.
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ locale: string; city: string }>;
}

// Cached city lookup, deduped across generateMetadata and the page render.
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
  const title = t('costsSeo.cityMetaTitle', { city: cityName });
  const description = t('costsSeo.cityMetaDescription', { city: cityName });

  // Rich cost share-card from the city-wide roll-up (median of district medians);
  // generic OG when there's no data yet.
  const buildings = await getBuildingsData(cityRec.id, null, null);
  const districts = rollUpDistricts(buildings, cityRec.districts);
  const pos = (vals: number[]) => median(vals.filter((v) => v > 0)) ?? 0;
  const cityTotal = pos(districts.map((d) => d.medianTotal));
  const cityRent = pos(districts.map((d) => d.medianRent));
  const cityExpenses = pos(districts.map((d) => d.medianExpenses));
  const reportCount = districts.reduce((s, d) => s + d.reportCount, 0);
  const ogImage =
    cityTotal > 0
      ? getCostOgImage({
          title: cityName,
          subtitle: t('costs.overview.nReports', { count: reportCount }),
          stat: `≈ ${cityTotal.toLocaleString()} zł`,
          statLabel: t('costs.building.medianMonthlyTotal'),
          split:
            cityRent > 0 && cityExpenses > 0
              ? `${t('costs.building.rent')} ≈ ${cityRent.toLocaleString()} · ${t('costs.building.expenses')} ≈ ${cityExpenses.toLocaleString()}`
              : undefined,
        })
      : getOgImage(title, description);

  return {
    title,
    description,
    alternates: getAlternates(`/${city}`),
    openGraph: { title, description, images: [ogImage] },
  };
}

export default async function CityCostsHub({ params }: PageProps) {
  const { locale, city } = await params;
  setRequestLocale(locale);

  const cityRec = await getCity(city);
  if (!cityRec) notFound();

  const t = await getTranslations();
  const cityName = t(cityRec.nameKey);

  const buildings = await getBuildingsData(cityRec.id, null, null);
  const districts = rollUpDistricts(buildings, cityRec.districts);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 bg-muted/30 pt-24">
        <div className="container mx-auto px-4 py-8">
          <JsonLd data={breadcrumbJsonLd([{ name: cityName, path: `/${city}` }])} />

          <div className="mx-auto max-w-3xl">
            <h1 className="text-3xl font-bold md:text-4xl">
              {t('costsSeo.cityH1', { city: cityName })}
            </h1>
            <p className="mt-3 text-muted-foreground">
              {t('costsSeo.cityIntro', { city: cityName })}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link href={`/${city}/costs`}>{t('costsSeo.exploreAll')}</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/${city}/calculator`}>
                  <Calculator className="mr-1.5 h-4 w-4" />
                  {t('calculator.badge')}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/${city}/costs/submit`}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t('costs.overview.submitMyCosts')}
                </Link>
              </Button>
              <ShareButton path={`/${city}`} source="city" size="default" />
            </div>

            <h2 className="mt-10 text-xl font-semibold">{t('costsSeo.districtsHeading')}</h2>

            {districts.length === 0 ? (
              <Card className="mt-4">
                <CardContent className="flex flex-col items-center py-12 text-center">
                  <Building2 className="mb-3 h-10 w-10 text-muted-foreground" />
                  <p className="text-muted-foreground">{t('costsSeo.emptyCity')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="mt-4 space-y-3">
                {districts.map((d) => (
                  <Link key={d.slug} href={`/${city}/${d.slug}`} className="block">
                    <Card className="group transition-all duration-200 hover:border-primary/30 hover:shadow-md">
                      <CardContent className="flex items-center justify-between gap-4 p-4">
                        <div className="min-w-0">
                          <h3 className="flex items-center gap-1.5 font-semibold transition-colors group-hover:text-primary">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            {d.name}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {d.buildingCount} ·{' '}
                            {t('costs.overview.nReports', { count: d.reportCount })}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-4">
                          <div className="text-right tabular-nums">
                            <p className="text-xs text-muted-foreground">
                              {t('costs.overview.medianMonthlyTotal')}
                            </p>
                            <p className="text-lg font-bold text-primary">
                              ≈ {d.medianTotal.toLocaleString()} PLN
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('costs.overview.rent')} ≈ {d.medianRent.toLocaleString()}
                              {d.medianExpenses > 0 && (
                                <>
                                  {' · '}
                                  {t('costs.overview.expenses')} ≈{' '}
                                  {d.medianExpenses.toLocaleString()}
                                </>
                              )}
                            </p>
                          </div>
                          <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
