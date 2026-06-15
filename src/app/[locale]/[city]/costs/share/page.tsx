import type { Metadata } from 'next';
import { cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { getCostOgImage, getOgImage } from '@/lib/seo';
import { getDistrictCostStats } from '@/lib/cost-baselines';

// Personal "I pay X% below my area" share landing: the OG preview carries the
// sharer's brag (the viral hook); the page shows the area's REAL costs (concrete
// proof — split, typical range, sample size) and pivots the visitor to check
// their OWN costs (submit / calculator → a new contribution). Reads query params
// + the district stats, carries ?ref (captured by middleware). Dynamic, off the
// build, not indexed.
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string; city: string }>;
  searchParams: Promise<{ pct?: string; d?: string; amt?: string }>;
};

function parsePct(pct?: string): number | null {
  if (!pct) return null;
  const n = parseInt(pct, 10);
  return Number.isFinite(n) ? n : null;
}

// The sharer's own monthly total, passed through the share link so the landing
// can name a concrete number. Guarded to a sane range so a hand-edited URL can't
// inject garbage.
function parseAmount(amt?: string): number | null {
  if (!amt) return null;
  const n = parseInt(amt, 10);
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : null;
}

// Deduped across generateMetadata + the page render.
const getDistrict = cache(async (citySlug: string, slug?: string) => {
  if (!slug) return null;
  return prisma.district.findFirst({
    where: { slug, city: { slug: citySlug } },
    select: { id: true, nameKey: true },
  });
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { city } = await params;
  const { pct, d } = await searchParams;
  const t = await getTranslations('share');
  const district = await getDistrict(city, d);
  const pctNum = parsePct(pct);
  const description = t('cardDescription');

  let title: string;
  let image;
  if (district) {
    const stats = await getDistrictCostStats(district.id); // cached → no double query
    const median = stats.total.median;
    if (pctNum != null && pctNum < 0) {
      // Brag: "I pay X% below {district}" — big green "-X%" + the median as proof.
      const percent = Math.abs(pctNum);
      title = t('cardTitle', { percent, district: district.nameKey });
      image = getCostOgImage({
        title: t('ogTitle'),
        subtitle: description,
        statLabel: t('ogStatLabel', { district: district.nameKey }),
        stat: t('ogStat', { percent }),
        split: median != null ? t('ogMedian', { amount: median.toLocaleString() }) : undefined,
      });
    } else {
      // Overpay / equal: no self-shaming brag — a neutral "what people pay in
      // {district}" data card (the median as the stat). Still a useful data drop.
      // The IMAGE title stays short (no district — it goes in the stat label) so
      // it never wraps into the subtitle; the longer text goes to og:title.
      title = t('cardTitleArea', { district: district.nameKey });
      image =
        median != null
          ? getCostOgImage({
              title: t('ogTitleNeutral'),
              subtitle: description,
              statLabel: t('ogStatNeutralLabel', { district: district.nameKey }),
              stat: `≈${median.toLocaleString()} zł`,
              split:
                stats.totalPerM2.median != null
                  ? t('ogMedianPerM2', { amount: stats.totalPerM2.median.toLocaleString() })
                  : undefined,
            })
          : getOgImage(title, description);
    }
  } else {
    title = t('cardTitleGeneric');
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
  const { d, pct, amt } = await searchParams;
  const t = await getTranslations('share');
  const tr = await getTranslations('costs.overview');
  const district = await getDistrict(city, d);
  const stats = district ? await getDistrictCostStats(district.id) : null;
  const pctNum = parsePct(pct);
  const amtNum = parseAmount(amt);

  // Reveal HOW MUCH the sharer is above/below their area (and their concrete
  // amount when the link carries it) — the curiosity hook that makes the visitor
  // want to check their own. Falls back to the generic line with no percentage.
  let bodyText = t('landingBody');
  if (district && pctNum != null && pctNum !== 0) {
    const base = { percent: Math.abs(pctNum), district: district.nameKey };
    if (amtNum != null) {
      const withAmount = { ...base, amount: amtNum.toLocaleString() };
      bodyText =
        pctNum < 0
          ? t('landingBodyBelowAmount', withAmount)
          : t('landingBodyAboveAmount', withAmount);
    } else {
      bodyText = pctNum < 0 ? t('landingBodyBelow', base) : t('landingBodyAbove', base);
    }
  }

  const total = stats?.total.median ?? null;
  const { p25, p75 } = stats?.total ?? { p25: null, p75: null };
  const hasRange = !!stats && stats.count >= 3 && p25 != null && p75 != null && p75 > p25;

  const steps = [t('landingStep1'), t('landingStep2'), t('landingStep3')];

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center px-4 pt-28 pb-16 text-center sm:pt-36">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('landingHeading')}</h1>
      <p className="mt-3 text-muted-foreground">{bodyText}</p>

      {district && total != null && stats && (
        <div className="mt-6 w-full rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            {t('landingDataLabel', { district: district.nameKey })}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums">≈{total.toLocaleString()} zł</p>

          {/* Аренда/Расходы split + per-m² — concrete, maps to the visitor's flat. */}
          {(stats.rentMedian != null ||
            stats.expensesMedian != null ||
            stats.totalPerM2.median != null) && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {stats.rentMedian != null && (
                <span>
                  {t('landingRent')} ≈{stats.rentMedian.toLocaleString()}
                </span>
              )}
              {stats.expensesMedian != null && (
                <span>
                  {t('landingExpenses')} ≈{stats.expensesMedian.toLocaleString()}
                </span>
              )}
              {stats.totalPerM2.median != null && (
                <span>≈{stats.totalPerM2.median.toLocaleString()} zł/m²</span>
              )}
            </div>
          )}

          {/* Typical p25–p75 range — "the data is alive" signal (dense districts). */}
          {hasRange && (
            <p className="mt-2 text-sm text-muted-foreground">
              {t('landingRange', { from: p25.toLocaleString(), to: p75.toLocaleString() })}
            </p>
          )}

          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            {tr('nReports', { count: stats.count })}
          </p>
        </div>
      )}

      {/* How it works — orient a cold visitor. */}
      <div className="mt-8 w-full text-left">
        <h2 className="text-center text-sm font-semibold text-muted-foreground">
          {t('landingHowTitle')}
        </h2>
        <ol className="mt-3 space-y-2">
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
          <Link href={`/${city}/costs/submit`}>{t('ctaSubmit')}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/${city}/calculator`}>{t('ctaCalculator')}</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href={`/${city}/costs`}>{t('ctaCosts')}</Link>
        </Button>
      </div>
    </main>
  );
}
