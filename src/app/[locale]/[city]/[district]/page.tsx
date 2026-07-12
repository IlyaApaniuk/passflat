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
import { ShareButton } from '@/components/costs/share-button';
import { ArrowLeft, ArrowRight, Building2, Calculator, Plus, Users } from 'lucide-react';

// ISR: no auth/cookies (cost data is open) → cacheable for crawlers.
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ locale: string; city: string; district: string }>;
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
  const { city, district } = await params;
  const cityRec = await getCity(city);
  const districtRec = cityRec?.districts.find((d) => d.slug === district);
  if (!cityRec || !districtRec) return { title: 'Not found' };

  const t = await getTranslations();
  const cityName = t(cityRec.nameKey);
  const title = t('costsSeo.districtMetaTitle', { district: districtRec.nameKey, city: cityName });
  const description = t('costsSeo.districtMetaDescription', {
    district: districtRec.nameKey,
    city: cityName,
  });

  // Rich cost share-card from the district roll-up; generic OG when no data.
  const buildings = await getBuildingsData(cityRec.id, district, null);
  const [rollup] = rollUpDistricts(buildings, [districtRec]);
  const ogImage =
    rollup && rollup.medianTotal > 0
      ? getCostOgImage({
          title: districtRec.nameKey,
          subtitle: `${cityName} · ${t('costs.overview.nReports', { count: rollup.reportCount })}`,
          stat: `≈ ${rollup.medianTotal.toLocaleString()} zł`,
          statLabel: t('costs.building.medianMonthlyTotal'),
          split:
            rollup.medianRent > 0 && (rollup.medianExpenses ?? 0) > 0
              ? `${t('costs.building.rent')} ≈ ${rollup.medianRent.toLocaleString()} · ${t('costs.building.expenses')} ≈ ${(rollup.medianExpenses ?? 0).toLocaleString()}`
              : undefined,
        })
      : getOgImage(title, description);

  return {
    title,
    description,
    alternates: getAlternates(`/${city}/${district}`),
    openGraph: { title, description, images: [ogImage] },
  };
}

export default async function DistrictCostsPage({ params }: PageProps) {
  const { locale, city, district } = await params;
  setRequestLocale(locale);

  const cityRec = await getCity(city);
  if (!cityRec) notFound();
  const districtRec = cityRec.districts.find((d) => d.slug === district);
  if (!districtRec) notFound();

  const t = await getTranslations();
  const cityName = t(cityRec.nameKey);

  const buildings = await getBuildingsData(cityRec.id, district, null);
  const [rollup] = rollUpDistricts(buildings, [districtRec]);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 bg-muted/30 pt-24">
        <div className="container mx-auto px-4 py-8">
          <JsonLd
            data={breadcrumbJsonLd([
              { name: cityName, path: `/${city}` },
              { name: districtRec.nameKey, path: `/${city}/${district}` },
            ])}
          />

          <div className="mx-auto max-w-3xl">
            <Button variant="ghost" size="sm" className="mb-4 gap-2" asChild>
              <Link href={`/${city}`}>
                <ArrowLeft className="h-4 w-4" />
                {t('costsSeo.backToCity', { city: cityName })}
              </Link>
            </Button>

            <h1 className="text-3xl font-bold md:text-4xl">
              {t('costsSeo.districtH1', { district: districtRec.nameKey })}
            </h1>
            <p className="mt-3 text-muted-foreground">
              {t('costsSeo.districtIntro', { district: districtRec.nameKey, city: cityName })}
            </p>

            {rollup && (
              <Card className="mt-6 border-primary/20 bg-primary/5">
                <CardContent className="flex flex-wrap items-end justify-between gap-4 p-5">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t('costs.overview.medianMonthlyTotal')}
                    </p>
                    <p className="text-3xl font-bold text-primary">
                      ≈ {rollup.medianTotal.toLocaleString()} PLN
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('costs.overview.rent')} ≈ {rollup.medianRent.toLocaleString()}
                      {rollup.medianExpenses > 0 && (
                        <>
                          {' · '}
                          {t('costs.overview.expenses')} ≈ {rollup.medianExpenses.toLocaleString()}
                        </>
                      )}
                      {rollup.medianTotalPerM2 > 0 && (
                        <>
                          {' · '}
                          {t('costs.building.totalPerM2Compare')} ≈{' '}
                          {Math.round(rollup.medianTotalPerM2).toLocaleString()}{' '}
                          {t('costs.overview.perM2')}
                        </>
                      )}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('costs.overview.nBuildings', { count: rollup.buildingCount })} ·{' '}
                    {t('costs.overview.nReports', { count: rollup.reportCount })}
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link href={`/${city}/costs/submit`}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t('costs.overview.submitMyCosts')}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/${city}/calculator?district=${district}`}>
                  <Calculator className="mr-1.5 h-4 w-4" />
                  {t('calculator.badge')}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/${city}/costs`}>{t('costsSeo.exploreAll')}</Link>
              </Button>
              <ShareButton path={`/${city}/${district}`} source="district" size="default" />
            </div>

            <h2 className="mt-10 text-xl font-semibold">
              {t('costsSeo.buildingsHeading', { district: districtRec.nameKey })}
            </h2>

            {buildings.length === 0 ? (
              <Card className="mt-4">
                <CardContent className="flex flex-col items-center py-12 text-center">
                  <Building2 className="mb-3 h-10 w-10 text-muted-foreground" />
                  <p className="text-muted-foreground">{t('costsSeo.emptyDistrict')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="mt-4 space-y-3">
                {buildings.map((b) => (
                  <Link key={b.id} href={`/${city}/building/${b.slug}`} className="block">
                    <Card className="group transition-all duration-200 hover:border-primary/30 hover:shadow-md">
                      <CardContent className="flex items-center justify-between gap-4 p-4">
                        <div className="min-w-0">
                          <h3 className="font-semibold transition-colors group-hover:text-primary">
                            {b.address}
                          </h3>
                          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                            <Users className="h-3.5 w-3.5" />
                            {t('costs.overview.nReports', { count: b.reports })}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-4">
                          <div className="text-right tabular-nums">
                            <p className="text-xs text-muted-foreground">
                              {t('costs.overview.medianMonthlyTotal')}
                            </p>
                            <p className="text-lg font-bold text-primary">
                              ≈ {b.medianTotal.toLocaleString()} PLN
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
