'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Equal, TrendingDown, TrendingUp } from 'lucide-react';

interface DistrictPositionBarProps {
  label: string;
  /** This building's value for the metric. */
  value: number;
  /** District median and the typical p25–p75 band. */
  median: number;
  p25: number;
  p75: number;
  /** Unit suffix, e.g. "PLN" or "zł/m²". */
  unit: string;
  /** District name + sample size, for the caption. */
  district: string;
  sampleSize: number;
}

/**
 * Shows where this building sits within the district's typical p25–p75 range,
 * with numeric scale labels (p25 / median / p75), cheaper/pricier zone tinting
 * and the district sample size. Leans on the district's denser sample to
 * contextualise a building figure that may rest on only 1–2 reports.
 */
export function DistrictPositionBar({
  label,
  value,
  median,
  p25,
  p75,
  unit,
  district,
  sampleSize,
}: DistrictPositionBarProps) {
  const t = useTranslations();

  const pct = median === 0 ? 0 : Math.round(((value - median) / median) * 100);
  const status = value < p25 ? 'cheaper' : value > p75 ? 'pricier' : 'within';

  // Axis spans the band and the building marker, with light padding so the
  // marker never sits on the very edge.
  const lo = Math.min(p25, value);
  const hi = Math.max(p75, value);
  const pad = Math.max((hi - lo) * 0.15, 1);
  const axisMin = lo - pad;
  const span = hi + pad - axisMin || 1;
  const pos = (n: number) => ((n - axisMin) / span) * 100;
  const at = (n: number) => `${pos(n)}%`;

  const markerColor =
    status === 'cheaper'
      ? 'bg-green-500'
      : status === 'pricier'
        ? 'bg-red-500'
        : 'bg-muted-foreground';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
        <span className="font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span>
            ≈ {value.toLocaleString()} {unit}
          </span>
          {status === 'within' ? (
            <Badge className="gap-1 bg-muted text-muted-foreground">
              <Equal className="h-3 w-3" />
              {t('costs.building.withinRange')}
            </Badge>
          ) : status === 'cheaper' ? (
            <Badge className="gap-1 bg-green-500/10 text-green-600">
              <TrendingDown className="h-3 w-3" />
              {t('costs.building.percentLower', { percent: Math.abs(pct) })}
            </Badge>
          ) : (
            <Badge className="gap-1 bg-red-500/10 text-red-500">
              <TrendingUp className="h-3 w-3" />
              {t('costs.building.percentHigher', { percent: pct })}
            </Badge>
          )}
        </div>
      </div>

      <div className="relative mt-6 mb-6 h-2 rounded-full bg-muted">
        {/* Cheaper zone (left of the band) */}
        <div
          className="absolute top-0 left-0 h-full rounded-l-full bg-green-500/10"
          style={{ width: at(p25) }}
        />
        {/* Pricier zone (right of the band) */}
        <div
          className="absolute top-0 right-0 h-full rounded-r-full bg-red-500/10"
          style={{ left: at(p75) }}
        />
        {/* Typical p25–p75 band */}
        <div
          className="absolute top-0 h-full bg-muted-foreground/20"
          style={{ left: at(p25), width: `${pos(p75) - pos(p25)}%` }}
        />
        {/* District median: value above + tick */}
        <span
          className="absolute -top-5 -translate-x-1/2 text-[10px] whitespace-nowrap text-muted-foreground"
          style={{ left: at(median) }}
        >
          {median.toLocaleString()}
        </span>
        <div
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-muted-foreground/60"
          style={{ left: at(median) }}
        />
        {/* Band endpoints below */}
        <span
          className="absolute -bottom-5 -translate-x-1/2 text-[10px] whitespace-nowrap text-muted-foreground/80"
          style={{ left: at(p25) }}
        >
          {p25.toLocaleString()}
        </span>
        <span
          className="absolute -bottom-5 -translate-x-1/2 text-[10px] whitespace-nowrap text-muted-foreground/80"
          style={{ left: at(p75) }}
        >
          {p75.toLocaleString()}
        </span>
        {/* This building */}
        <div
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background ${markerColor}`}
          style={{ left: at(value) }}
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        {district} · {sampleSize} {t('costs.overview.reports')}
      </p>
    </div>
  );
}
