'use client';

import { useTranslations } from 'next-intl';
import { ShareButton } from './share-button';

type AreaMedians = {
  total: number | null;
  rentPerM2: number | null;
  totalPerM2: number | null;
};

export type CostComparison = {
  districtName: string | null;
  districtSlug: string | null;
  citySlug: string;
  user: AreaMedians;
  district: AreaMedians | null;
  city: AreaMedians;
};

/**
 * Persistent "your costs vs your area" block for the dashboard — turns the
 * one-off post-submit comparison into a returnable artifact (retention) and a
 * shareable one (the ShareButton drives friends to the district data → they
 * contribute). Compares the user's latest report against the district AND city
 * medians, across total / rent-m² / total-m².
 */
export function CostComparisonCard({
  comparison,
  userId,
}: {
  comparison: CostComparison;
  userId: string;
}) {
  const t = useTranslations();
  const { user, district, city } = comparison;

  const rows = [
    {
      label: t('dashboard.costComparison.total'),
      u: user.total,
      d: district?.total ?? null,
      c: city.total,
      unit: 'PLN',
    },
    {
      label: t('dashboard.costComparison.rentPerM2'),
      u: user.rentPerM2,
      d: district?.rentPerM2 ?? null,
      c: city.rentPerM2,
      unit: 'zł',
    },
    {
      label: t('dashboard.costComparison.totalPerM2'),
      u: user.totalPerM2,
      d: district?.totalPerM2 ?? null,
      c: city.totalPerM2,
      unit: 'zł',
    },
  ].filter((r) => r.u != null);

  if (rows.length === 0) return null;

  const fmt = (v: number | null) => (v == null ? '—' : `≈${v.toLocaleString()}`);

  // Headline: how the user's monthly total compares with the district median.
  const totalDelta =
    user.total != null && district?.total != null ? user.total - district.total : null;

  return (
    <div className="mb-4 rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">{t('dashboard.costComparison.title')}</h3>

      {totalDelta != null && totalDelta !== 0 && (
        <span
          className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
            totalDelta > 0 ? 'bg-red-500/10 text-red-600' : 'bg-green-500/10 text-green-600'
          }`}
        >
          {totalDelta > 0
            ? t('costs.submit.comparisonOverpay', { amount: totalDelta.toLocaleString() })
            : t('costs.submit.comparisonSave', { amount: Math.abs(totalDelta).toLocaleString() })}
        </span>
      )}

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground">
            <th className="text-left" />
            <th className="px-2 py-1 text-right">{t('costs.submit.comparisonMine')}</th>
            <th className="px-2 py-1 text-right">{t('dashboard.costComparison.district')}</th>
            <th className="py-1 text-right">{t('dashboard.costComparison.city')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t">
              <td className="py-1.5 text-muted-foreground">{r.label}</td>
              <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-primary">
                {fmt(r.u)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.d)}</td>
              <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                {fmt(r.c)} {r.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {user.total != null &&
        district?.total != null &&
        district.total > 0 &&
        comparison.districtName && (
          <div className="mt-3">
            {/* Personal share: the landing's OG card brags "I pay X% below {area}",
              then pivots the friend to check their own (drives a contribution). */}
            <ShareButton
              path={`/${comparison.citySlug}/costs/share?pct=${Math.round(
                ((user.total - district.total) / district.total) * 100,
              )}&district=${encodeURIComponent(comparison.districtName)}`}
              source="dashboard-comparison"
              refToken={userId}
              label={t('dashboard.costComparison.share')}
            />
          </div>
        )}
    </div>
  );
}
