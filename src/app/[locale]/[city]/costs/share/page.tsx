import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { getOgImage } from '@/lib/seo';

// Personal "I pay X% below my area" share landing: the OG preview carries the
// sharer's brag (the viral hook); the page itself pivots the visitor to check
// their OWN costs (calculator / district data → a new contribution). Reads only
// query params + carries ?ref (captured by middleware), so keep it dynamic and
// off the build. Not indexed — it's a share target, not an SEO page.
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string; city: string }>;
  searchParams: Promise<{ pct?: string; district?: string }>;
};

function parsePct(pct?: string): number | null {
  if (!pct) return null;
  const n = parseInt(pct, 10);
  return Number.isFinite(n) ? n : null;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { pct, district } = await searchParams;
  const t = await getTranslations('share');
  const pctNum = parsePct(pct);

  // Only the "below the area" case is brag-worthy; otherwise stay generic.
  const title =
    pctNum != null && pctNum < 0 && district
      ? t('cardTitle', { percent: Math.abs(pctNum), district })
      : t('cardTitleGeneric');
  const description = t('cardDescription');

  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: { title, description, images: [getOgImage(title, description)] },
  };
}

export default async function CostShareLandingPage({ params }: Props) {
  const { city } = await params;
  const t = await getTranslations('share');

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('landingHeading')}</h1>
      <p className="mt-3 text-muted-foreground">{t('landingBody')}</p>
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
