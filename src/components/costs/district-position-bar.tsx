interface DistrictPositionBarProps {
  label: string;
  /** This building's value for the metric. */
  value: number;
  /** Area median and the typical p25–p75 band. */
  median: number;
  p25: number;
  p75: number;
  /** Unit suffix, e.g. "PLN" or "zł/m²". */
  unit: string;
}

/**
 * Shows where a value sits against an area's typical p25–p75 band, with numeric
 * scale labels (p25 / median / p75). Neutral (FR-29): no "cheaper / pricier"
 * zones, colours, percentages or badges. Callers render it only where the two
 * figures are comparable (`isComparable` in `cost-figures.ts`).
 */
export function DistrictPositionBar({
  label,
  value,
  median,
  p25,
  p75,
  unit,
}: DistrictPositionBarProps) {
  // Axis spans the band and the building marker, with light padding so the
  // marker never sits on the very edge.
  const lo = Math.min(p25, value);
  const hi = Math.max(p75, value);
  const pad = Math.max((hi - lo) * 0.15, 1);
  const axisMin = lo - pad;
  const span = hi + pad - axisMin || 1;
  const pos = (n: number) => ((n - axisMin) / span) * 100;
  const at = (n: number) => `${pos(n)}%`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
        <span className="font-medium">{label}</span>
        <span>
          ≈ {value.toLocaleString()} {unit}
        </span>
      </div>

      <div className="relative mt-6 mb-6 h-2 rounded-full bg-muted">
        {/* Typical p25–p75 band */}
        <div
          className="absolute top-0 h-full bg-muted-foreground/20"
          style={{ left: at(p25), width: `${pos(p75) - pos(p25)}%` }}
        />
        {/* Area median: value above + tick */}
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
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
          style={{ left: at(value) }}
        />
      </div>
    </div>
  );
}
