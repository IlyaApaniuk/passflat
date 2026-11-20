import type { Metadata } from 'next';
import { cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { getCostOgImage, getOgImage } from '@/lib/seo';
import { loadDistrictFigures } from '@/lib/cost-figures-query';
import {
  isAllInTotal,
  singleNumberHeadingKey,
  singleNumberLabelText,
} from '@/lib/single-number-view';
import { figureOgCard } from '@/lib/single-number-metadata';

// Share landing for a district (`?d=<district>`): the OG preview and the page
// show the district's single number neutrally (D23: its tenant group, else its
// asking prices, labelled with the group and N, with that group's rent, expenses
// and per m²), never how the sharer compares to the area (spec 03 §Comparisons,
// FR-29), and pivot the visitor to check their OWN costs (submit / calculator →
// a new contribution). Old links still carry `pct` / `amt`; both are ignored.
// Carries ?ref (captured by middleware). Dynamic, off the build, not indexed.
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string; city: string }>;
  searchParams: Promise<{ d?: string }>;
};

// Deduped across generateMetadata + the page render.
const getDistrict = cache(async (citySlug: string, slug?: string) => {
  if (!slug) return null;
  return prisma.district.findFirst({
    where: { slug, city: { slug: citySlug } },
    select: { slug: true, nameKey: true, cityId: true },
  });
});

/** The district's single number, the one its hub row and district page show (cached loader). */
async function districtFigure(district: { slug: string; cityId: string }) {
  const districts = await loadDistrictFigures(district.cityId);
  return districts.find((d) => d.slug === district.slug)?.figures.all ?? null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { city } = await params;
  const { d } = await searchParams;
  const t = await getTranslations();
  const district = await getDistrict(city, d);
  const description = t('share.cardDescription');

  let title: string;
  let image;
  if (district) {
    const figure = await districtFigure(district);
    // A neutral data card of the district's number. The IMAGE title is the district
    // name alone, so it never wraps into the subtitle; the longer text goes to og:title.
    title = t('share.cardTitleArea', { district: district.nameKey });
    image = figure
      ? getCostOgImage(figureOgCard(t, figure, { title: district.nameKey, subtitle: description }))
      : getOgImage(title, description);
  } else {
    title = t('share.cardTitleGeneric');
    image = getOgImage(title, description);
  }

  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: { title, description, images: [image] },
  };
}

export default async function CostShareLandingPage({ params, searchParams }: Props) {
  const { city } = await params;
  const { d } = await searchParams;
  const t = await getTranslations();
  const district = await getDistrict(city, d);
  const figure = district ? await districtFigure(district) : null;

  // The same group's rent, expenses and per m²; the last two only beside an all-in total.
  const allIn = figure ? isAllInTotal(figure) : false;
  const rent = figure && figure.metric !== 'rent' ? figure.rent : null;
  const expenses = allIn ? figure?.expenses : null;
  const perM2 = allIn ? figure?.completeTotalPerM2 : null;

  const steps = [t('share.landingStep1'), t('share.landingStep2'), t('share.landingStep3')];

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center px-4 pt-28 pb-16 text-center sm:pt-36">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('share.landingHeading')}</h1>
      <p className="mt-3 text-muted-foreground">{t('share.landingBody')}</p>

      {district && figure && (
        <div className="mt-6 w-full rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            {t('share.landingDataLabel', { district: district.nameKey })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t(singleNumberHeadingKey(figure))}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            ≈ {figure.value.toLocaleString()} zł
          </p>

          {/* Аренда/Расходы split + per-m² — concrete, maps to the visitor's flat. */}
          {(rent || expenses || perM2) && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {rent && (
                <span>
                  {t('share.landingRent')} ≈ {rent.value.toLocaleString()}
                </span>
              )}
              {expenses && (
                <span>
                  {t('share.landingExpenses')} ≈ {expenses.value.toLocaleString()}
                </span>
              )}
              {perM2 && <span>≈ {Math.round(perM2.value).toLocaleString()} zł/m²</span>}
            </div>
          )}

          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            {singleNumberLabelText(t, figure)}
          </p>
        </div>
      )}

      {/* How it works — orient a cold visitor. */}
      <div className="mt-8 w-full">
        <h2 className="text-center text-sm font-semibold text-muted-foreground">
          {t('share.landingHowTitle')}
        </h2>
        {/* Centre the list as a block; rows stay left-aligned so the numbers line up. */}
        <ol className="mx-auto mt-3 w-fit space-y-2 text-left">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button asChild>
          <Link href={`/${city}/costs/submit`}>{t('share.ctaSubmit')}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/${city}/calculator`}>{t('share.ctaCalculator')}</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href={`/${city}/costs`}>{t('share.ctaCosts')}</Link>
        </Button>
      </div>
    </main>
  );
}
