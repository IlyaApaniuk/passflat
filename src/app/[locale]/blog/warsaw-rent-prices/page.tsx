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
import { JsonLd, articleJsonLd, breadcrumbJsonLd, datasetJsonLd } from '@/lib/json-ld';
import { SITE_URL } from '@/lib/site-url';
import { getBuildingsData, rollUpDistricts } from '@/lib/cost-aggregates';
import { median } from '@/lib/cost-stats';
import { ArrowRight, Calculator, Plus } from 'lucide-react';

// A data report assembled from the live cost DB. Rendered on demand (not
// statically prerendered at build, which would require a DB) — the heavy query
// is cached at the data layer (getBuildingsData, 300s), so it stays auto-current
// and cheap. Targets the head query "сколько стоит аренда в Варшаве [year]" and
// funnels into the calculator + district pages. City is fixed (Warsaw) for now.
export const dynamic = 'force-dynamic';
const CITY = 'warsaw';
const SLUG = 'warsaw-rent-prices';

interface PageProps {
  params: Promise<{ locale: string }>;
}

const getCity = cache(() =>
  prisma.city.findUnique({
    where: { slug: CITY },
    select: { id: true, nameKey: true, districts: { select: { slug: true, nameKey: true } } },
  }),
);

const fmt = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

async function getReport() {
  const city = await getCity();
  if (!city) return null;
  const buildings = await getBuildingsData(city.id, null, null);
  const districts = rollUpDistricts(buildings, city.districts);
  const pos = (vals: number[]) => median(vals.filter((v) => v > 0)) ?? 0;
  return {
    cityNameKey: city.nameKey,
    districts,
    reportCount: districts.reduce((s, d) => s + d.reportCount, 0),
    medianTotal: pos(districts.map((d) => d.medianTotal)),
    medianRent: pos(districts.map((d) => d.medianRent)),
    medianExpenses: pos(districts.map((d) => d.medianExpenses)),
    medianPerM2: pos(districts.map((d) => d.medianTotalPerM2)),
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  const year = new Date().getFullYear();
  const report = await getReport();
  const cityName = report ? t(report.cityNameKey) : 'Warsaw';
  const title = t('rentReport.metaTitle', { city: cityName, year });
  const description = t('rentReport.metaDescription', { city: cityName, year });

  const ogImage =
    report && report.medianTotal > 0
      ? getCostOgImage({
          title: t('rentReport.ogTitle', { year }),
          subtitle: `${cityName} · ${t('costs.overview.nReports', { count: report.reportCount })}`,
          stat: `≈ ${report.medianTotal.toLocaleString()} zł`,
          statLabel: t('costs.building.medianMonthlyTotal'),
        })
      : getOgImage(title, description);

  return {
    title,
    description,
    alternates: getAlternates(`/blog/${SLUG}`),
    openGraph: {
      title,
      description,
      type: 'article',
      images: [ogImage],
    },
  };
}

export default async function WarsawRentPricesReport({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const report = await getReport();
  if (!report) notFound();

  const t = await getTranslations();
  const cityName = t(report.cityNameKey);
  const year = new Date().getFullYear();
  const updatedIso = new Date().toISOString();
  const updatedLabel = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  const title = t('rentReport.metaTitle', { city: cityName, year });
  const description = t('rentReport.metaDescription', { city: cityName, year });
  const url = `${SITE_URL}/blog/${SLUG}`;

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Blog', path: '/blog' },
          { name: title, path: `/blog/${SLUG}` },
        ])}
      />
      <JsonLd
        data={articleJsonLd({ title, description, url, datePublished: updatedIso, locale })}
      />
      <JsonLd data={datasetJsonLd({ name: title, description, url, dateModified: updatedIso })} />

      <main className="flex-1 bg-muted/30 pt-24">
        <div className="container mx-auto px-4 py-8">
          <article className="mx-auto max-w-3xl">
            <Button variant="ghost" size="sm" className="mb-4 gap-2" asChild>
              <Link href="/blog">{t('rentReport.backToBlog')}</Link>
            </Button>

            <div className="flex items-center gap-2 text-primary">
              <Calculator className="h-5 w-5" />
              <span className="text-sm font-medium">{t('rentReport.badge')}</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">
              {t('rentReport.h1', { city: cityName, year })}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('rentReport.updated', { date: updatedLabel })} ·{' '}
              {t('costs.overview.nReports', { count: report.reportCount })}
            </p>
            <p className="mt-4 text-muted-foreground">{t('rentReport.lead', { city: cityName })}</p>

            {/* City-wide snapshot */}
            <Card className="mt-6 border-primary/20 bg-primary/5">
              <CardContent className="flex flex-wrap items-end justify-between gap-4 p-5">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t('costs.overview.medianMonthlyTotal')}
                  </p>
                  <p className="text-3xl font-bold text-primary">≈ {fmt(report.medianTotal)} zł</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('costs.overview.rent')} ≈ {fmt(report.medianRent)}
                    {report.medianExpenses > 0 && (
                      <>
                        {' · '}
                        {t('costs.overview.expenses')} ≈ {fmt(report.medianExpenses)}
                      </>
                    )}
                  </p>
                </div>
                {report.medianPerM2 > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{t('rentReport.perM2')}</p>
                    <p className="text-xl font-bold">≈ {fmt(report.medianPerM2)} zł/m²</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Per-district table */}
            {report.districts.length > 0 && (
              <>
                <h2 className="mt-10 text-xl font-semibold">{t('rentReport.tableHeading')}</h2>
                <div className="mt-3 overflow-x-auto rounded-lg border bg-card">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">{t('rentReport.colDistrict')}</th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t('rentReport.colRent')}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t('rentReport.colExpenses')}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t('rentReport.colTotal')}
                        </th>
                        <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                          {t('rentReport.colReports')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {report.districts.map((d) => (
                        <tr key={d.slug} className="hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <Link
                              href={`/${CITY}/${d.slug}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {d.name}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            ≈ {fmt(d.medianRent)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {d.medianExpenses > 0 ? `≈ ${fmt(d.medianExpenses)}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            ≈ {fmt(d.medianTotal)}
                          </td>
                          <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell">
                            {d.reportCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Methodology / honesty */}
            <h2 className="mt-10 text-xl font-semibold">{t('rentReport.methodologyTitle')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('rentReport.methodologyBody')}</p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild>
                <Link href={`/${CITY}/calculator`}>
                  <Calculator className="mr-1.5 h-4 w-4" />
                  {t('rentReport.ctaCalculator')}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/${CITY}/costs/submit`}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t('rentReport.ctaSubmit')}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/${CITY}`}>
                  {t('rentReport.ctaDistricts')}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
