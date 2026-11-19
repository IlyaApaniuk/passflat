import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { Footer } from '@/components/landing/footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAlternates, getOgImage, getCostOgImage } from '@/lib/seo';
import { JsonLd, breadcrumbJsonLd } from '@/lib/json-ld';
import { getBuildingsData } from '@/lib/cost-aggregates';
import type { SingleNumberFigure } from '@/lib/cost-figures';
import { loadDistrictFigures } from '@/lib/cost-figures-query';
import { buildingsForRentalType } from '@/lib/costs-overview-filter';
import {
  isAllInTotal,
  singleNumberHeadingKey,
  singleNumberLabelText,
} from '@/lib/single-number-view';
import { figureOgCard } from '@/lib/single-number-metadata';
import { ShareButton } from '@/components/costs/share-button';
import { BuildingFigureSummary } from '@/components/costs/building-figure-summary';
import { ArrowLeft, ArrowRight, Building2, Calculator, Plus } from 'lucide-react';

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

  // Rich cost share-card from the district's single number (D23), the figure the page's
  // header card shows, labelled with the group and N; generic OG when no data.
  const figure =
    (await loadDistrictFigures(cityRec.id)).find((d) => d.slug === district)?.figures.all ?? null;
  const ogImage = figure
    ? getCostOgImage(figureOgCard(t, figure, { title: districtRec.nameKey, subtitle: cityName }))
    : getOgImage(title, description);

  return {
    title,
    description,
    alternates: getAlternates(`/${city}/${district}`, await getLocale()),
    openGraph: { title, description, images: [ogImage] },
  };
}

type Translate = Awaited<ReturnType<typeof getTranslations>>;

/**
 * The district's one number (D23): its tenant group, else its asking prices, with
 * the group and N, and that same group's rent, expenses and per m² (the last two
 * only for an all-in total, as on the overview cards).
 */
function DistrictFigureCard({
  figure,
  buildingCount,
  t,
}: {
  figure: SingleNumberFigure;
  buildingCount: number;
  t: Translate;
}) {
  const allIn = isAllInTotal(figure);
  const details = [
    figure.metric !== 'rent' && figure.rent
      ? `${t('costs.overview.rent')} ≈ ${figure.rent.value.toLocaleString()}`
      : null,
    allIn && figure.expenses
      ? `${t('costs.overview.expenses')} ≈ ${figure.expenses.value.toLocaleString()}`
      : null,
    allIn && figure.completeTotalPerM2
      ? `${t('costs.building.totalPerM2Compare')} ≈ ${Math.round(figure.completeTotalPerM2.value).toLocaleString()} ${t('costs.overview.perM2')}`
      : null,
  ].filter((detail): detail is string => detail !== null);

  return (
    <Card className="mt-6 border-primary/20 bg-primary/5">
      <CardContent className="flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <p className="text-xs text-muted-foreground">{t(singleNumberHeadingKey(figure))}</p>
          <p className="text-3xl font-bold text-primary">≈ {figure.value.toLocaleString()} PLN</p>
          <p className="mt-1 text-xs text-muted-foreground">{singleNumberLabelText(t, figure)}</p>
          {details.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{details.join(' · ')}</p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {t('costs.overview.nBuildings', { count: buildingCount })}
        </p>
      </CardContent>
    </Card>
  );
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

  // One number per building and for the district by D23 (spec 03 §Single-number
  // surfaces): the district figure is a summary over the district's reports, the
  // value and N `loadAreaReference` gives it; a building without a usable figure is
  // not listed.
  const [buildingsData, districtFigures] = await Promise.all([
    getBuildingsData(cityRec.id, district, null),
    loadDistrictFigures(cityRec.id),
  ]);
  const buildings = buildingsForRentalType(buildingsData, 'all');
  const figure = districtFigures.find((d) => d.slug === district)?.figures.all ?? null;

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

            {figure && (
              <DistrictFigureCard figure={figure} buildingCount={buildings.length} t={t} />
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
                        </div>
                        <div className="flex shrink-0 items-center gap-4">
                          <BuildingFigureSummary figure={b.figure} />
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
