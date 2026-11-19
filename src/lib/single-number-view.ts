// How a single number is labelled on the map, the cards and the district rows
// (spec 03 §Single-number surfaces, D23). Pure and client-safe: a surface shows
// the figure `singleNumberFigure` chose with its group and its N, and says when
// the number is only a known part of the costs (FR-25) or only the rent.

import type { FigureMessage } from '@/lib/building-figures-view';
import type { FigureGroupKey, SingleNumberFigure } from '@/lib/cost-figures';

const GROUP_LABEL_KEY: Record<FigureGroupKey, string> = {
  tenant: 'costs.overview.figureTenant',
  asking: 'costs.overview.figureAsking',
};

/** "Tenant reports (2)" / "Asking prices (2)": the group and the N of the number shown. */
export function singleNumberGroupLabel(
  figure: Pick<SingleNumberFigure, 'group' | 'n'>,
): FigureMessage {
  return { key: GROUP_LABEL_KEY[figure.group], values: { count: figure.n } };
}

/** What the number is when it is not an all-in total: a known part or the rent alone. */
function partLabel(figure: Pick<SingleNumberFigure, 'metric'>): FigureMessage | null {
  if (figure.metric === 'knownPartTotal')
    return { key: 'costs.overview.figureKnownPart', values: {} };
  if (figure.metric === 'rent') return { key: 'costs.overview.figureRentOnly', values: {} };
  return null;
}

/**
 * The full label of a single number, joined by the caller: the group with its N,
 * then "known part" or "rent only" where the number is not an all-in total
 * (golden example 13: "Asking prices (2), known part").
 */
export function singleNumberLabel(
  figure: Pick<SingleNumberFigure, 'group' | 'n' | 'metric'>,
): FigureMessage[] {
  const part = partLabel(figure);
  return part ? [singleNumberGroupLabel(figure), part] : [singleNumberGroupLabel(figure)];
}

/**
 * The heading above a card's number: a median only from two values, the known
 * part never called the monthly cost (FR-25), and rent named as rent.
 */
export function singleNumberHeadingKey(figure: Pick<SingleNumberFigure, 'metric' | 'n'>): string {
  if (figure.metric === 'knownPartTotal') return 'costs.building.figures.knownPart';
  if (figure.metric === 'rent') return 'costs.overview.rent';
  return figure.n >= 2 ? 'costs.overview.medianMonthlyTotal' : 'costs.compare.colTotal';
}

/** Whether the number is an all-in monthly total (a pin marks the others with "+"). */
export function isAllInTotal(figure: Pick<SingleNumberFigure, 'metric'>): boolean {
  return figure.metric === 'completeTotal';
}
