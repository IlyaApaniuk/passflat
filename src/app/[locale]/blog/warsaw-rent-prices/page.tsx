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
import {
  JsonLd,
  articleJsonLd,
  breadcrumbJsonLd,
  datasetJsonLd,
  faqPageJsonLd,
} from '@/lib/json-ld';
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

  // The lead's listing-vs-reality example: a real building where the gap
  // between rent and the full monthly cost is visible. Most-reported first so
  // the pick is stable and backed by the strongest data; ≥300 zł of expenses
  // keeps the contrast honest (a 50 zł gap would undermine the point).
  const example =
    buildings
      .filter((b) => b.medianRent > 0 && (b.medianExpenses ?? 0) >= 300)
      .sort((a, b) => b.reports - a.reports || (b.medianExpenses ?? 0) - (a.medianExpenses ?? 0))
      .at(0) ?? null;

  // Deposit reality — same definition as the landing hero: median amount
  // (rounded to hundreds) and the share of leavers who got it back in full.
  // Real tenant reports only; scraped listings carry no deposit fields.
  const depositReports = await prisma.costReport.findMany({
    where: { building: { cityId: city.id }, isVisible: true },
    select: { depositAmount: true, depositReturned: true },
    take: 5000,
  });
  const depositAmounts = depositReports
    .map((r) => (r.depositAmount == null ? null : Number(r.depositAmount)))
    .filter((v): v is number => v != null && v > 0);
  const depositMed = median(depositAmounts);
  const depositMedian = depositMed == null ? null : Math.round(depositMed / 100) * 100;
  const returnKnown = depositReports.filter((r) => r.depositReturned != null);
  const depositReturnedPct = returnKnown.length
    ? Math.round(
        (100 * returnKnown.filter((r) => r.depositReturned === true).length) / returnKnown.length,
      )
    : null;

  return {
    cityNameKey: city.nameKey,
    districts,
    reportCount: districts.reduce((s, d) => s + d.reportCount, 0),
    medianTotal: pos(districts.map((d) => d.medianTotal)),
    medianRent: pos(districts.map((d) => d.medianRent)),
    medianExpenses: pos(districts.map((d) => d.medianExpenses)),
    medianPerM2: pos(districts.map((d) => d.medianTotalPerM2)),
    example: example
      ? {
          address: example.address,
          districtSlug: example.districtSlug,
          district: example.district,
          rent: example.medianRent,
          total: example.medianTotal,
        }
      : null,
    depositMedian,
    depositReturnedPct,
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
    alternates: getAlternates(`/blog/${SLUG}`, await getLocale()),
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

  // FAQ copy is assembled once so the visible block and the FAQPage schema can
  // never drift apart.
  const faq = [
    { question: t('rentReport.faqQ1'), answer: t('rentReport.faqA1') },
    {
      question: t('rentReport.faqQ2'),
      answer: t('rentReport.faqA2', { expenses: fmt(report.medianExpenses) }),
    },
    ...(report.depositReturnedPct != null
      ? [
          {
            question: t('rentReport.faqQ3'),
            answer: t('rentReport.faqA3', { pct: report.depositReturnedPct }),
          },
        ]
      : []),
  ];

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
      {faq.length > 0 && <JsonLd data={faqPageJsonLd(faq)} />}

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

            {/* Listing-vs-reality opener on a real building — the one thing no
                competitor page in any language leads with. */}
            {report.example && (
              <div className="mt-6 space-y-3">
                <p className="text-2xl font-semibold">
                  {t('rentReport.storyRent', { rent: fmt(report.example.rent) })}
                </p>
                <p className="text-muted-foreground">
                  {t('rentReport.storyReality', {
                    address: report.example.address,
                    // District names are stored as display strings (e.g. "Wola"),
                    // not message keys — render as-is, like the table below does.
                    district: report.example.district,
                    total: fmt(report.example.total),
                    diff: fmt(report.example.total - report.example.rent),
                  })}
                </p>
                <p className="text-muted-foreground">{t('rentReport.storyNotException')}</p>
              </div>
            )}

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

            {/* Anatomy of the real monthly cost */}
            <h2 className="mt-10 text-xl font-semibold">{t('rentReport.anatomyTitle')}</h2>
            <p className="mt-2 text-muted-foreground">{t('rentReport.anatomyIntro')}</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>{t('rentReport.anatomyCzynsz')}</li>
              <li>{t('rentReport.anatomyUtilities')}</li>
              <li>{t('rentReport.anatomyInternet')}</li>
              <li>{t('rentReport.anatomyDoplaty')}</li>
            </ul>
            {report.medianExpenses > 0 && (
              <p className="mt-4 font-medium">
                {t('rentReport.anatomyMedian', { expenses: fmt(report.medianExpenses) })}
              </p>
            )}

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

            {/* Deposit reality — the one statistic no other page has */}
            {report.depositMedian != null && report.depositReturnedPct != null && (
              <>
                <h2 className="mt-10 text-xl font-semibold">{t('rentReport.kaucjaTitle')}</h2>
                <p className="mt-2 text-muted-foreground">
                  {t('rentReport.kaucjaAmount', { deposit: fmt(report.depositMedian) })}
                </p>
                <Card className="mt-4 border-accent/30 bg-accent/5">
                  <CardContent className="flex items-center gap-4 p-5">
                    <p className="text-4xl font-bold text-accent">{report.depositReturnedPct}%</p>
                    <p className="text-sm text-muted-foreground">
                      {t('rentReport.kaucjaReturnedLabel')}
                    </p>
                  </CardContent>
                </Card>
                <p className="mt-4 text-muted-foreground">{t('rentReport.kaucjaBody')}</p>
                <p className="mt-2">
                  <Link
                    href="/blog/rental-deposit-kaucja-warsaw"
                    className="font-medium text-primary hover:underline"
                  >
                    {t('rentReport.kaucjaCta')} →
                  </Link>
                </p>
              </>
            )}

            {/* Dopłaty — the settlement surprise */}
            <h2 className="mt-10 text-xl font-semibold">{t('rentReport.doplatyTitle')}</h2>
            <p className="mt-2 text-muted-foreground">{t('rentReport.doplatyBody1')}</p>
            <p className="mt-2 text-muted-foreground">{t('rentReport.doplatyBody2')}</p>
            <p className="mt-2">
              <Link
                href="/blog/hidden-rental-costs-warsaw"
                className="font-medium text-primary hover:underline"
              >
                {t('rentReport.doplatyCta')} →
              </Link>
            </p>

            {/* Pre-signing checklist → the address checker */}
            <h2 className="mt-10 text-xl font-semibold">{t('rentReport.checkTitle')}</h2>
            <p className="mt-2 text-muted-foreground">{t('rentReport.checkIntro')}</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
              <li>{t('rentReport.checkStep1')}</li>
              <li>{t('rentReport.checkStep2')}</li>
              <li>{t('rentReport.checkStep3')}</li>
              <li>{t('rentReport.checkStep4')}</li>
            </ol>
            <div className="mt-4">
              <Button variant="outline" asChild>
                <Link href={`/${CITY}/check`}>
                  {t('rentReport.checkCta')}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </div>

            {/* Methodology / honesty */}
            <h2 className="mt-10 text-xl font-semibold">{t('rentReport.methodologyTitle')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('rentReport.methodologyBody')}</p>

            {/* FAQ — mirrors the FAQPage JSON-LD above */}
            <h2 className="mt-10 text-xl font-semibold">{t('rentReport.faqTitle')}</h2>
            <div className="mt-3 space-y-4">
              {faq.map((item) => (
                <div key={item.question}>
                  <p className="font-medium">{item.question}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.answer}</p>
                </div>
              ))}
            </div>

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
