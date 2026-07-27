/**
 * One visual language for every map on the site.
 *
 * The cost map and the checker map had drifted onto different basemaps and
 * different pin shapes, which read as two products. This is the single place
 * those decisions live.
 */

/** Calm grey basemap: our pins are the subject, so the map must not compete. */
export const MAP_STYLE_URL = 'mapbox://styles/mapbox/light-v11';

export const MAP_COLORS = {
  /** Price pin: a white bubble carrying the number, no colour-coding to decode. */
  pinFill: '#ffffff',
  pinStroke: '#4f46e5',
  pinText: '#312e81',
  /** Cluster ramp, darkening with size. */
  cluster: ['#6366f1', '#4f46e5', '#4338ca'] as const,
  clusterText: '#ffffff',
} as const;

export const MAP_PIN = {
  radius: 17,
  strokeWidth: 1.5,
  textSize: 12,
} as const;

/**
 * Money as it appears on a pin: "5.2k" rather than "5 245 zł".
 *
 * A pin is read at a glance and several sit side by side, so the magnitude is
 * what matters — the exact figure belongs in the popup.
 */
export function pinLabel(value: number): string {
  if (value <= 0) return '';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}
