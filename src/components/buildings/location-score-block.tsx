'use client';

import { Suspense, lazy, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Bus,
  GraduationCap,
  MapPinned,
  Navigation,
  Pill,
  ShoppingBasket,
  Store,
  TrainFront,
  Trees,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MapSkeleton } from '@/components/map/map-skeleton';
import type { NeighbourMarker } from '@/components/map/location-poi-map';
import { scoreTier, type CategoryResult } from '@/lib/location-score';
import { cn } from '@/lib/utils';

// Mapbox is a heavy WebGL bundle and every mounted map counts against the
// Mapbox load quota, so the chunk is split and only fetched once the visitor
// actually switches to the map tab. Type-only imports above stay erased, so
// nothing of the map reaches the initial payload of the pages using this block.
const LocationPoiMap = lazy(() => import('@/components/map/location-poi-map'));

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  supermarket: ShoppingBasket,
  transitRail: TrainFront,
  pharmacy: Pill,
  transitBasic: Bus,
  convenience: Store,
  dining: Utensils,
  education: GraduationCap,
  parks: Trees,
  center: Navigation,
};

const RING_SIZE = 112;
const RING_STROKE = 9;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * "420 m" / "1.2 km" in the reader's locale; `null` — nothing of that kind found
 * within the search radius — reads as words instead of a number. Shared with the
 * checker, which formats nuisance distances the same way.
 */
export function useDistanceFormatter() {
  const locale = useLocale();
  const t = useTranslations('locationScore');

  return useMemo(() => {
    const meters = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const kilometers = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

    return (distanceM: number | null) => {
      if (distanceM === null) return t('noneNearby');
      if (distanceM < 1000) return `${meters.format(distanceM)} m`;
      return `${kilometers.format(distanceM / 1000)} km`;
    };
  }, [locale, t]);
}

function ScoreRing({ score }: { score: number }) {
  const t = useTranslations('locationScore');
  const tier = scoreTier(score);
  const offset = RING_CIRCUMFERENCE * (1 - score / 100);

  return (
    <div
      className="relative shrink-0"
      style={{ width: RING_SIZE, height: RING_SIZE }}
      role="img"
      aria-label={t('scoreAria', { score })}
    >
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90" aria-hidden>
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={RING_STROKE}
          className="text-muted/60"
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={tier.stroke}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-3xl font-bold tabular-nums', tier.text)}>{score}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t('outOf100')}
        </span>
      </div>
    </div>
  );
}

/** Same two cards as the block itself, so the score can arrive without a jump. */
export function LocationScoreSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4', className)} aria-hidden>
      <Card>
        <CardContent className="flex items-center gap-5 p-6">
          <Skeleton className="h-28 w-28 shrink-0 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-52 max-w-full" />
            <Skeleton className="h-2 w-full" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-xl" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * What surrounds an address: one score for the location as a whole, then the
 * categories behind it — as a list, or on a map of the actual points.
 *
 * The single rendering of a location score in the product. The checker, the
 * building page and the listing pages all mount this, so the reading of a score
 * cannot drift between the surface that earns the visit and the surface that
 * keeps it.
 */
export function LocationScoreBlock({
  overall,
  categories,
  citySlug,
  lat,
  lng,
  neighbours,
  className,
}: {
  overall: number;
  categories: CategoryResult[];
  /**
   * Enables the map tab. The map deep-links its pins into `/{city}/building/…`,
   * so a surface that cannot say which city it is looking at keeps the plain
   * list — and never pays for the map chunk.
   */
  citySlug?: string;
  /** The address itself. Without coordinates there is nothing to centre on. */
  lat?: number | null;
  lng?: number | null;
  /** Buildings nearby whose costs we know — the layer no amenities map has. */
  neighbours?: NeighbourMarker[];
  className?: string;
}) {
  const t = useTranslations('locationScore');
  const locale = useLocale();
  const formatDistance = useDistanceFormatter();
  // List first: the map chunk is heavy and every mounted map costs a Mapbox load.
  const [view, setView] = useState<'list' | 'map'>('list');

  const tier = scoreTier(overall);
  const canShowMap = citySlug != null && lat != null && lng != null;
  const neighbourCount = neighbours?.length ?? 0;

  return (
    <div className={cn('space-y-4', className)}>
      <Card className="overflow-hidden border-primary/20 shadow-lg">
        <CardContent className="flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:text-left">
          <ScoreRing score={overall} />
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{t('title')}</p>
            <p className={cn('mt-1 text-2xl font-bold', tier.text)}>{t(`level.${tier.level}`)}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t('scoreDescription')}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader className="pb-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">{t('breakdownTitle')}</CardTitle>
            {canShowMap && (
              <div className="flex rounded-lg bg-muted p-0.5">
                {(['list', 'map'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setView(mode)}
                    aria-pressed={view === mode}
                    className={cn(
                      'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                      view === mode
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t(`view.${mode}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardHeader>
        {view === 'map' && canShowMap ? (
          <CardContent className="px-4 sm:px-6">
            <Suspense fallback={<MapSkeleton className="h-[420px] rounded-xl" />}>
              <LocationPoiMap
                citySlug={citySlug}
                lat={lat}
                lng={lng}
                pois={categories.flatMap((category) =>
                  (category.nearby ?? []).map((poi) => ({
                    category: category.key,
                    name: poi.name,
                    lat: poi.lat,
                    lng: poi.lng,
                    distanceM: poi.distanceM,
                  })),
                )}
                neighbours={neighbours ?? []}
                formatDistance={formatDistance}
                formatMoney={(amount) =>
                  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount)} zł`
                }
              />
            </Suspense>
            {neighbourCount > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                {t('subtitleWithCosts', { count: neighbourCount })}
              </p>
            )}
          </CardContent>
        ) : (
          <CardContent className="grid gap-3 px-4 sm:grid-cols-2 sm:px-6">
            {categories.map((category) => {
              const Icon = CATEGORY_ICONS[category.key] ?? MapPinned;
              const categoryTier = scoreTier(category.score);
              const label = t.has(`categories.${category.key}`)
                ? t(`categories.${category.key}`)
                : category.key;
              const summary = category.nearby?.length
                ? category.nearby
                    .map((poi) => `${poi.name} ${formatDistance(poi.distanceM)}`)
                    .join(' · ')
                : null;

              return (
                <div key={category.key} className="rounded-xl border bg-muted/20 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          categoryTier.bg,
                        )}
                      >
                        <Icon className={cn('h-[18px] w-[18px]', categoryTier.text)} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{label}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {summary ?? formatDistance(category.nearestM)}
                        </p>
                      </div>
                    </div>
                    <span className={cn('text-sm font-bold tabular-nums', categoryTier.text)}>
                      {category.score}
                    </span>
                  </div>
                  {/* No separate nearest-distance line: it only existed to sit
                      beside the progress bar, and the summary above already
                      opens with that same distance. */}
                </div>
              );
            })}
          </CardContent>
        )}
        <p className="border-t px-6 pt-3 text-[10px] text-muted-foreground">{t('poweredBy')}</p>
      </Card>
    </div>
  );
}
