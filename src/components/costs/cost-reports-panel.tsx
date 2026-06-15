'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, MapPin } from 'lucide-react';
import { DistrictPositionBar } from './district-position-bar';
import { ShareButton } from './share-button';
import type { AreaMetric, AreaStats } from '@/lib/cost-baselines';

/** A single cost report paired with its district + city area statistics. */
export type ReportComparison = {
  reportId: string;
  address: string;
  districtName: string | null;
  districtSlug: string | null;
  citySlug: string;
  buildingSlug: string;
  createdAt: string;
  status: 'flagged' | 'visible';
  periodicCount: number;
  user: { total: number; rentPerM2: number | null; totalPerM2: number | null };
  districtStats: AreaStats | null;
  cityStats: AreaStats;
};

// A district needs at least this many reports before its p25–p75 band is worth
// drawing as a position bar; below it we fall back to a plain median delta line.
const BAND_MIN = 3;

const hasBand = (m: AreaMetric | undefined, count: number): boolean =>
  count >= BAND_MIN &&
  m != null &&
  m.median != null &&
  m.p25 != null &&
  m.p75 != null &&
  m.p75 > m.p25;

/**
 * Unified "your costs vs your area" panel for the dashboard — one tab per cost
 * report (most recent first), each showing the report's headline plus position
 * bars against its own district (and the city median for reference), an edit
 * shortcut and a personal share. Replaces the old single-report comparison card
 * + the separate report list: the stat and the report live together, and an
 * edit round-trips straight back here with fresh numbers.
 */
export function CostReportsPanel({
  reports,
  userId,
}: {
  reports: ReportComparison[];
  userId: string;
}) {
  if (reports.length === 0) return null;
  return (
    <Tabs defaultValue={reports[0].reportId} className="w-full">
      {reports.length > 1 && (
        // Mobile: a single horizontally-scrollable row (slides sideways) rather
        // than wrapping to many lines. `-mx-1 px-1` keeps the focus rings from
        // being clipped by overflow; tabs never shrink so they stay readable.
        <TabsList className="-mx-1 mb-3 flex h-auto w-[calc(100%+0.5rem)] justify-start gap-1 overflow-x-auto px-1">
          {reports.map((r) => (
            <TabsTrigger
              key={r.reportId}
              value={r.reportId}
              className="max-w-[12rem] shrink-0 truncate"
            >
              {r.address}
            </TabsTrigger>
          ))}
        </TabsList>
      )}
      {reports.map((r) => (
        <TabsContent key={r.reportId} value={r.reportId} className="mt-0">
          <ReportCard report={r} userId={userId} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function ReportCard({ report: r, userId }: { report: ReportComparison; userId: string }) {
  const t = useTranslations();
  const fmt = (v: number | null) => (v == null ? '—' : `≈${v.toLocaleString()}`);

  const districtMedianTotal = r.districtStats?.total.median ?? null;
  const totalDelta = districtMedianTotal != null ? r.user.total - districtMedianTotal : null;

  const metrics = [
    {
      key: 'total',
      label: t('dashboard.costComparison.total'),
      unit: 'PLN',
      value: r.user.total as number | null,
      d: r.districtStats?.total,
      c: r.cityStats.total,
    },
    {
      key: 'rentPerM2',
      label: t('dashboard.costComparison.rentPerM2'),
      unit: 'zł/m²',
      value: r.user.rentPerM2,
      d: r.districtStats?.rentPerM2,
      c: r.cityStats.rentPerM2,
    },
    {
      key: 'totalPerM2',
      label: t('dashboard.costComparison.totalPerM2'),
      unit: 'zł/m²',
      value: r.user.totalPerM2,
      d: r.districtStats?.totalPerM2,
      c: r.cityStats.totalPerM2,
    },
  ].filter((m) => m.value != null);

  const cityCaption = metrics
    .filter((m) => m.c.median != null)
    .map((m) => `${m.label} ${fmt(m.c.median)} ${m.unit}`)
    .join(' · ');

  return (
    <div className="rounded-lg border bg-card p-4">
      {/* Header: address + district + headline total, with edit + view links. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {r.status === 'flagged' && (
            <Badge
              variant="outline"
              className="mb-1 border-amber-500/20 bg-amber-500/10 text-amber-600"
            >
              {t('dashboard.costReportFlagged')}
            </Badge>
          )}
          <Link
            href={`/${r.citySlug}/building/${r.buildingSlug}`}
            className="flex items-center gap-1 font-medium hover:underline"
          >
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{r.address}</span>
          </Link>
          {r.districtName && (
            <p className="mt-0.5 text-sm text-muted-foreground">{r.districtName}</p>
          )}
        </div>
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
          <p className="text-lg font-bold text-primary">
            {r.user.total.toLocaleString()} PLN
            <span className="text-sm font-normal text-muted-foreground">
              {t('common.perMonth')}
            </span>
          </p>
          <Button size="sm" variant="outline" className="gap-1.5" asChild>
            <Link href={`/${r.citySlug}/costs/submit?edit=true&id=${r.reportId}`}>
              <Edit className="h-3.5 w-3.5" />
              {t('common.edit')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Headline: how this report's monthly total sits vs the district median. */}
      {totalDelta != null && totalDelta !== 0 && (
        <span
          className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
            totalDelta > 0 ? 'bg-red-500/10 text-red-600' : 'bg-green-500/10 text-green-600'
          }`}
        >
          {totalDelta > 0
            ? t('costs.submit.comparisonOverpay', { amount: totalDelta.toLocaleString() })
            : t('costs.submit.comparisonSave', { amount: Math.abs(totalDelta).toLocaleString() })}
        </span>
      )}

      {/* Per-metric position bars vs the district (band) or a plain delta line. */}
      <div className="mt-4 space-y-4">
        {metrics.map((m) => {
          const value = m.value as number;
          if (m.d?.median == null) {
            return (
              <div key={m.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{m.label}</span>
                <span className="tabular-nums">
                  {fmt(value)} {m.unit}
                </span>
              </div>
            );
          }
          if (hasBand(m.d, r.districtStats?.count ?? 0)) {
            return (
              <DistrictPositionBar
                key={m.key}
                label={m.label}
                value={value}
                median={m.d.median}
                p25={m.d.p25!}
                p75={m.d.p75!}
                unit={m.unit}
              />
            );
          }
          // Thin district → simple "yours / district median" delta line.
          const pct = m.d.median > 0 ? Math.round(((value - m.d.median) / m.d.median) * 100) : 0;
          const chipCls = pct > 0 ? 'bg-red-500/10 text-red-600' : 'bg-green-500/10 text-green-600';
          const deltaLabel =
            pct === 0
              ? null
              : pct > 0
                ? t('costs.building.percentHigher', { percent: pct })
                : t('costs.building.percentLower', { percent: Math.abs(pct) });
          return (
            <div key={m.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{m.label}</span>
              <span className="flex items-center gap-2">
                <span className="whitespace-nowrap tabular-nums">
                  <span className="font-semibold text-primary">{fmt(value)}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    / {fmt(m.d.median)} {m.unit}
                  </span>
                </span>
                {deltaLabel && (
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${chipCls}`}
                  >
                    {deltaLabel}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* City median reference + district sample size. */}
      {(cityCaption || r.districtStats) && (
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          {cityCaption && (
            <span>
              {t('dashboard.costComparison.city')}: {cityCaption}
            </span>
          )}
          {cityCaption && r.districtStats ? ' · ' : ''}
          {r.districtStats && (
            <span>{t('costs.overview.nReports', { count: r.districtStats.count })}</span>
          )}
        </p>
      )}

      {/* Personal share: brag/neutral OG card; pivots a friend to check their own. */}
      {districtMedianTotal != null && districtMedianTotal > 0 && r.districtSlug && (
        <div className="mt-3 sm:flex sm:justify-end">
          <ShareButton
            path={`/${r.citySlug}/costs/share?pct=${Math.round(
              ((r.user.total - districtMedianTotal) / districtMedianTotal) * 100,
            )}&d=${r.districtSlug}&amt=${r.user.total}`}
            source="dashboard-comparison"
            refToken={userId}
            label={t('dashboard.costComparison.share')}
            className="w-full sm:w-auto"
          />
        </div>
      )}
    </div>
  );
}
