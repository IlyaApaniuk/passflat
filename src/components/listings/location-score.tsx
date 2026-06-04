'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  MapPinned,
  ShoppingCart,
  Bus,
  Pill,
  Utensils,
  GraduationCap,
  Trees,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface CategoryResult {
  key: string;
  score: number;
  nearestM: number | null;
  name: string | null;
}

interface LocationScoreResponse {
  overall: number;
  categories: CategoryResult[];
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  groceries: ShoppingCart,
  transit: Bus,
  pharmacy: Pill,
  dining: Utensils,
  education: GraduationCap,
  parks: Trees,
};

interface TierStyle {
  text: string;
  bg: string;
  stroke: string;
}

function tierStyles(score: number): TierStyle {
  if (score >= 80)
    return {
      text: 'text-emerald-600',
      bg: 'bg-emerald-50',
      stroke: '#059669',
    };
  if (score >= 60)
    return {
      text: 'text-lime-600',
      bg: 'bg-lime-50',
      stroke: '#65a30d',
    };
  if (score >= 40)
    return {
      text: 'text-amber-600',
      bg: 'bg-amber-50',
      stroke: '#d97706',
    };
  return {
    text: 'text-red-600',
    bg: 'bg-red-50',
    stroke: '#dc2626',
  };
}

function levelKey(overall: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (overall >= 80) return 'excellent';
  if (overall >= 60) return 'good';
  if (overall >= 40) return 'fair';
  return 'poor';
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

const RING_SIZE = 48;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ScoreRing({ score, tier }: { score: number; tier: TierStyle }) {
  const offset = RING_CIRCUMFERENCE * (1 - score / 100);

  return (
    <div className="relative flex-shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={RING_STROKE}
          className="text-muted/40"
        />
        <motion.circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={tier.stroke}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          initial={{ strokeDashoffset: RING_CIRCUMFERENCE }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums ${tier.text}`}
      >
        {score}
      </span>
    </div>
  );
}

export function LocationScore({ buildingId }: { buildingId: string }) {
  const t = useTranslations('listings.detail.locationScore');
  const [data, setData] = useState<LocationScoreResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let active = true;

    fetch(`/api/buildings/${buildingId}/location-score`)
      .then(async (res) => {
        if (!active) return;
        if (res.status === 204 || !res.ok) {
          setStatus('unavailable');
          return;
        }
        const json = (await res.json()) as LocationScoreResponse;
        setData(json);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('unavailable');
      });

    return () => {
      active = false;
    };
  }, [buildingId]);

  const overallTier = data ? tierStyles(data.overall) : null;

  if (status === 'unavailable') return null;

  if (status === 'loading' || !data || !overallTier) {
    return (
      <Card className="overflow-hidden shadow-lg">
        <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPinned className="h-5 w-5" />
            {t('title')}
          </CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            <div className="flex items-center gap-4 bg-primary/5 px-6 py-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-7 w-7 rounded-md" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
                <Skeleton className="h-3.5 w-12" />
              </div>
            ))}
          </div>
          <div className="border-t px-6 py-3">
            <Skeleton className="h-3 w-40" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden shadow-lg">
      <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPinned className="h-5 w-5" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          <div className="flex items-center gap-4 bg-primary/5 px-6 py-4">
            <ScoreRing score={data.overall} tier={overallTier} />
            <span className={`text-sm font-semibold ${overallTier.text}`}>
              {t(`level.${levelKey(data.overall)}`)}
            </span>
          </div>

          {data.categories.map((category) => {
            const Icon = CATEGORY_ICONS[category.key] ?? MapPinned;
            const catTier = tierStyles(category.score);
            return (
              <div key={category.key} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-md ${catTier.bg}`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${catTier.text}`} />
                  </div>
                  <span className="text-sm font-medium">{t(`categories.${category.key}`)}</span>
                </div>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {category.nearestM === null ? t('none') : formatDistance(category.nearestM)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="border-t px-6 py-3">
          <p className="text-[10px] text-muted-foreground">{t('poweredBy')}</p>
        </div>
      </CardContent>
    </Card>
  );
}
