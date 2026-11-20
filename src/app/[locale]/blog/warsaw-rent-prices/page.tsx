import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { Footer } from '@/components/landing/footer';
import { FlatmateCallout } from '@/components/roommate/flatmate-callout';
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
import { getBuildingsData } from '@/lib/cost-aggregates';
import { loadCityFigure, loadDistrictFigures } from '@/lib/cost-figures-query';
import { buildingsForRentalType } from '@/lib/costs-overview-filter';
import { depositClaim } from '@/lib/deposit-claim';
import {
  areasWithFigure,
  isAllInTotal,
  singleNumberGroupLabel,
  singleNumberHeadingKey,
  singleNumberLabelText,
} from '@/lib/single-number-view';
import { figureOgCard } from '@/lib/single-number-metadata';
import { perPersonSplitArea } from '@/lib/roommate/per-person-line';
import { loadWarsawPerPersonSplit } from '@/lib/roommate/room-costs';
import { ArrowRight, Calculator, Plus } from 'lucide-react';

// A data report assembled from the live cost DB. Rendered on demand (not
// statically prerendered at build, which would require a DB) — the heavy queries
// are cached at the data layer (the figure loaders and getBuildingsData, 300s),
// so it stays auto-current and cheap. Targets the head query "сколько стоит
// аренда в Варшаве [year]" and funnels into the calculator + district pages.
// City is fixed (Warsaw) for now. Every number is one group's single number
// (D23: tenant reports, else asking prices), labelled with its group and N.
export const dynamic = 'force-dynamic';
const CITY = 'warsaw';
const SLUG = 'warsaw-rent-prices';
/** The lead example needs this much between rent and the all-in total to make its point. */
const EXAMPLE_MIN_GAP = 300;

interface PageProps {
  params: Promise<{ locale: string }>;
}

const getCity = cache(() =>
  prisma.city.findUnique({
    where: { slug: CITY },
    select: { id: true, nameKey: true },
  }),
);

const fmt = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

async function getReport() {
  const city = await getCity();
  if (!city) return null;
  const [cityFigure, districtFigures, buildings, depositReports, perPersonSplit] =
    await Promise.all([
      loadCityFigure(city.id),
      loadDistrictFigures(city.id),
      getBuildingsData(city.id, null, null),
      // Deposit reality — same definition as the landing hero (`depositClaim`): the
      // tenant group's median amount and "X of N who answered got it back, fully
      // or partly", or nothing below MIN_DEPOSIT_ANSWERS answers.
      prisma.costReport.findMany({
        where: { building: { cityId: city.id }, isVisible: true },
        select: {
          source: true,
          depositAmount: true,
          depositReturned: true,
          depositReturnedAmount: true,
          isCurrentTenant: true,
        },
        take: 5000,
      }),
      // The callout's per-person line (spec 08 §Per-person line): the bot's Warsaw split; a
      // rejection or null → no line, the report still renders.
      loadWarsawPerPersonSplit().catch(() => null),
    ]);

  // The lead's listing-vs-reality example: a real building whose single number is an
  // all-in total with a visible gap to its rent (both from the same group). Most
  // observed first so the pick is stable and backed by the strongest data; a gap of
  // at least EXAMPLE_MIN_GAP keeps the contrast honest (a 50 zł gap would undermine it).
  const gap = (figure: { value: number; rent: { value: number } | null }) =>
    figure.rent ? figure.value - figure.rent.value : 0;
  const example =
    buildingsForRentalType(buildings, 'all')
      .filter((b) => isAllInTotal(b.figure) && b.figure.rent && gap(b.figure) >= EXAMPLE_MIN_GAP)
      .sort((a, b) => b.figure.n - a.figure.n || gap(b.figure) - gap(a.figure))
      .at(0) ?? null;

  return {
    cityNameKey: city.nameKey,
    cityFigure,
    districts: areasWithFigure(districtFigures),
    example: example
      ? {
          address: example.address,
          district: example.district,
          rent: example.figure.rent?.value ?? 0,
          total: example.figure.value,
          figure: example.figure,
        }
      : null,
    deposit: depositClaim(depositReports),
    perPersonSplit,
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

  const ogImage = report?.cityFigure
    ? getCostOgImage(
        figureOgCard(t, report.cityFigure, {
          title: t('rentReport.ogTitle', { year }),
          subtitle: cityName,
        }),
      )
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

  // The city's single number and that group's rent, expenses and per m² (the last
  // two only beside an all-in total, as on the cards). Expenses carry their own N.
  const { cityFigure } = report;
  const cityAllIn = cityFigure ? isAllInTotal(cityFigure) : false;
  const cityRent = cityFigure && cityFigure.metric !== 'rent' ? cityFigure.rent : null;
  const cityExpenses = cityAllIn ? (cityFigure?.expenses ?? null) : null;
  const cityPerM2 = cityAllIn ? (cityFigure?.completeTotalPerM2 ?? null) : null;
  const expensesLabel =
    cityFigure && cityExpenses
      ? singleNumberGroupLabel({ group: cityFigure.group, n: cityExpenses.n })
      : null;
  const expensesSource = expensesLabel ? t(expensesLabel.key, expensesLabel.values) : null;

  // FAQ copy is assembled once so the visible block and the FAQPage schema can
  // never drift apart.
  const faq = [
    { question: t('rentReport.faqQ1'), answer: t('rentReport.faqA1') },
    ...(cityExpenses && expensesSource
      ? [
          {
            question: t('rentReport.faqQ2'),
            answer: t('rentReport.faqA2', {
              expenses: fmt(cityExpenses.value),
              source: expensesSource,
            }),
          },
        ]
      : []),
    ...(report.deposit
      ? [
          {
            question: t('rentReport.faqQ3'),
            answer: t('rentReport.faqA3', {
              gotBack: report.deposit.gotBack,
              answered: report.deposit.answered,
            }),
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
              {t('rentReport.updated', { date: updatedLabel })}
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
                <p className="text-xs text-muted-foreground">
                  {singleNumberLabelText(t, report.example.figure)}
                </p>
                <p className="text-muted-foreground">{t('rentReport.storyNotException')}</p>
              </div>
            )}

            {/* City-wide snapshot: the city's single number with its group and N */}
            {cityFigure && (
              <Card className="mt-6 border-primary/20 bg-primary/5">
                <CardContent className="flex flex-wrap items-end justify-between gap-4 p-5">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t(singleNumberHeadingKey(cityFigure))}
                    </p>
                    <p className="text-3xl font-bold text-primary">≈ {fmt(cityFigure.value)} zł</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {singleNumberLabelText(t, cityFigure)}
                    </p>
                    {(cityRent || cityExpenses) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {cityRent && (
                          <>
                            {t('costs.overview.rent')} ≈ {fmt(cityRent.value)}
                          </>
                        )}
                        {cityRent && cityExpenses && ' · '}
                        {cityExpenses && (
                          <>
                            {t('costs.overview.expenses')} ≈ {fmt(cityExpenses.value)}
                          </>
                        )}
                      </p>
                    )}
                  </div>
                  {cityPerM2 && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{t('rentReport.perM2')}</p>
                      <p className="text-xl font-bold">≈ {fmt(cityPerM2.value)} zł/m²</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* PRD 4 FR-12: the flatmate callout under the city figure, its own surface so the
                readout tells it from the guides; no counts (spec 08 §Callout placements). The
                per-person line renders here only (spec 08 §Per-person line). */}
            <div className="mt-6">
              <FlatmateCallout
                surface="report"
                split={report.perPersonSplit}
                splitArea={
                  report.perPersonSplit ? perPersonSplitArea(report.perPersonSplit, t) : undefined
                }
              />
            </div>

            {/* Anatomy of the real monthly cost */}
            <h2 className="mt-10 text-xl font-semibold">{t('rentReport.anatomyTitle')}</h2>
            <p className="mt-2 text-muted-foreground">{t('rentReport.anatomyIntro')}</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>{t('rentReport.anatomyCzynsz')}</li>
              <li>{t('rentReport.anatomyUtilities')}</li>
              <li>{t('rentReport.anatomyInternet')}</li>
              <li>{t('rentReport.anatomyDoplaty')}</li>
            </ul>
            {cityExpenses && expensesSource && (
              <p className="mt-4 font-medium">
                {t('rentReport.anatomyMedian', {
                  expenses: fmt(cityExpenses.value),
                  source: expensesSource,
                })}
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
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {/* One group per district (tenant reports, else asking prices),
                          named under the district with its N; rent and expenses come
                          from that group, expenses only beside an all-in total. */}
                      {report.districts.map(({ slug, name, figure }) => (
                        <tr key={slug} className="hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <Link
                              href={`/${CITY}/${slug}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {name}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {singleNumberLabelText(t, figure)}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {figure.rent ? `≈ ${fmt(figure.rent.value)}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {isAllInTotal(figure) && figure.expenses
                              ? `≈ ${fmt(figure.expenses.value)}`
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {figure.metric === 'rent' ? '—' : `≈ ${fmt(figure.value)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Deposit reality — the one statistic no other page has */}
            {report.deposit && (
              <>
                <h2 className="mt-10 text-xl font-semibold">{t('rentReport.kaucjaTitle')}</h2>
                <p className="mt-2 text-muted-foreground">
                  {t('rentReport.kaucjaAmount', { deposit: fmt(report.deposit.medianDeposit) })}
                </p>
                <Card className="mt-4 border-accent/30 bg-accent/5">
                  <CardContent className="flex items-center gap-4 p-5">
                    <p className="shrink-0 text-4xl font-bold tabular-nums text-foreground">
                      {t('costs.building.figures.countOfTotal', {
                        count: report.deposit.gotBack,
                        total: report.deposit.answered,
                      })}
                    </p>
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
                href="/blog/doplaty-rozliczenie-warsaw"
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
