/**
 * One visual language for every map on the site.
 *
 * The cost map and the checker map had drifted onto different basemaps and
 * different pin shapes, which read as two products. This is the single place
 * those decisions live.
 */

import type { FigureGroupKey, SingleNumberFigure } from '@/lib/cost-figures';
import { isAllInTotal } from '@/lib/single-number-view';

/** Calm grey basemap: our pins are the subject, so the map must not compete. */
export const MAP_STYLE_URL = 'mapbox://styles/mapbox/light-v11';

export const MAP_COLORS = {
  /** Price pin: a white bubble carrying the number, no colour-coding to decode. */
  pinFill: '#ffffff',
  pinStroke: '#4f46e5',
  pinText: '#312e81',
  /** Pin of a building whose number comes from asking prices (spec 03 §Single-number surfaces). */
  askingPinFill: '#f1f5f9',
  askingPinStroke: '#64748b',
  askingPinText: '#334155',
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

/**
 * The pin text of a single number (D23): the abbreviated value, with "+" when
 * it is not an all-in total (a known part or rent only). The cost map and the
 * checker's neighbour pins both use it, so a "+" means the same on each.
 */
export function figurePinLabel(figure: Pick<SingleNumberFigure, 'value' | 'metric'>): string {
  const label = pinLabel(figure.value);
  return label && !isAllInTotal(figure) ? `${label}+` : label;
}

/** Fill, stroke and text of a single number's pin: asking prices in grey. */
export function figurePinColors(group: FigureGroupKey): {
  fill: string;
  stroke: string;
  text: string;
} {
  return group === 'asking'
    ? {
        fill: MAP_COLORS.askingPinFill,
        stroke: MAP_COLORS.askingPinStroke,
        text: MAP_COLORS.askingPinText,
      }
    : { fill: MAP_COLORS.pinFill, stroke: MAP_COLORS.pinStroke, text: MAP_COLORS.pinText };
}
