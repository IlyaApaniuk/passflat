import type { Metadata } from 'next';
import { cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { getCostOgImage, getOgImage } from '@/lib/seo';
import { getDistrictCostMedians } from '@/lib/cost-baselines';

// Personal "I pay X% below my area" share landing: the OG preview carries the
// sharer's brag (the viral hook); the page shows the area's REAL median (concrete
// proof) and pivots the visitor to check their OWN costs (calculator / district
// data → a new contribution). Reads query params + the district median, carries
// ?ref (captured by middleware). Dynamic, off the build, not indexed.
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string; city: string }>;
  searchParams: Promise<{ pct?: string; d?: string }>;
};

function parsePct(pct?: string): number | null {
  if (!pct) return null;
  const n = parseInt(pct, 10);
  return Number.isFinite(n) ? n : null;
}

// Deduped across generateMetadata + the page render.
const getDistrict = cache(async (citySlug: string, slug?: string) => {
  if (!slug) return null;
  return prisma.district.findFirst({
    where: { slug, city: { slug: citySlug } },
    select: { id: true, nameKey: true },
  });
});

// Deduped too: generateMetadata (for the OG split line) + the page both need it.
const getMedians = cache((districtId: string) => getDistrictCostMedians(districtId));

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { city } = await params;
  const { pct, d } = await searchParams;
  const t = await getTranslations('share');
  const district = await getDistrict(city, d);
  const pctNum = parsePct(pct);
  const description = t('cardDescription');

  // Only the "below the area" case is brag-worthy. There it gets the rich
  // designed OG card (big green "-X%" headline + the area's real median as
  // proof) — the viral artifact dropped into chats. Otherwise a plain text card.
  let title: string;
  let image;
  if (pctNum != null && pctNum < 0 && district) {
    const percent = Math.abs(pctNum);
    title = t('cardTitle', { percent, district: district.nameKey });
    const medians = await getMedians(district.id);
    image = getCostOgImage({
      title: t('ogTitle'),
      subtitle: description,
      statLabel: t('ogStatLabel', { district: district.nameKey }),
      stat: t('ogStat', { percent }),
      split:
        medians?.total != null
          ? t('ogMedian', { amount: medians.total.toLocaleString() })
          : undefined,
    });
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
  const { d } = await searchParams;
  const t = await getTranslations('share');
  const district = await getDistrict(city, d);
  const medians = district ? await getMedians(district.id) : null;

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('landingHeading')}</h1>
      <p className="mt-3 text-muted-foreground">{t('landingBody')}</p>

      {district && medians?.total != null && (
        <div className="mt-6 w-full rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            {t('landingDataLabel', { district: district.nameKey })}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            ≈{medians.total.toLocaleString()} zł
          </p>
        </div>
      )}

      <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button asChild>
          <Link href={`/${city}/calculator`}>{t('ctaCalculator')}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/${city}/costs`}>{t('ctaCosts')}</Link>
        </Button>
      </div>
    </main>
  );
}
