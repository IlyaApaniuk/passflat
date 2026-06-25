/**
 * Diverging colour for a "% cheaper / pricier than a reference" figure
 * (e.g. a building vs the city / district median). The MAGNITUDE — not just the
 * sign — drives the intensity, so a 1% difference reads as a soft, near-neutral
 * tint rather than full-blown red/green, and only large gaps saturate.
 *
 *   pricier  (positive):  soft warm grey → orange → red
 *   cheaper  (negative):  soft cool grey → lime  → green
 *   at / near the median:  neutral grey
 *
 * The transition is a true gradient (HSL), not a handful of Tailwind buckets.
 *
 * @param pctDiff signed percentage difference (+14 = 14% pricier, -8 = 8% cheaper)
 */
function costHueSat(pctDiff: number): { hue: number; saturation: number } | null {
  // Below ~1% we treat it as "at the median" — caller gets a neutral grey.
  if (!Number.isFinite(pctDiff) || Math.abs(pctDiff) < 1) return null;

  const CAP = 30; // ±30% saturates the colour fully
  // sqrt → quicker (but still soft) onset, so small gaps are visible yet gentle.
  const t = Math.sqrt(Math.min(Math.abs(pctDiff) / CAP, 1));
  const saturation = Math.round(15 + t * 60); // 15% (grey) → 75% (vivid)
  // pricier: orange (35°) → red (5°); cheaper: lime (95°) → green (140°)
  const hue = Math.round(pctDiff > 0 ? 35 - t * 30 : 95 + t * 45);
  return { hue, saturation };
}

const NEUTRAL = 'hsl(220, 9%, 46%)';

/** Text colour for inline `style={{ color }}`. Lucide icons inherit it via
 *  `currentColor`, so colouring the parent tints the icon too. */
export function relativeCostColor(pctDiff: number): string {
  const hs = costHueSat(pctDiff);
  // Mid-tone lightness (42%): legible on both light and dark surfaces.
  return hs ? `hsl(${hs.hue}, ${hs.saturation}%, 42%)` : NEUTRAL;
}

/** Badge-style: a soft same-hue background tint + the matching text colour,
 *  for inline `style={...}` (replaces hard-coded `bg-green-500/10 text-green-600`). */
export function relativeCostStyle(pctDiff: number): {
  color: string;
  backgroundColor: string;
} {
  const hs = costHueSat(pctDiff);
  if (!hs) return { color: NEUTRAL, backgroundColor: 'hsl(220, 9%, 46%, 0.1)' };
  return {
    color: `hsl(${hs.hue}, ${hs.saturation}%, 42%)`,
    backgroundColor: `hsl(${hs.hue}, ${hs.saturation}%, 50%, 0.12)`,
  };
}
