// Titles, descriptions and OG cards that carry a cost number (spec 03 §Single-number
// surfaces, D23, slice 3). A preview shows the one figure `singleNumberFigure` chose for the
// building or area, says what it is (a median only from two values, a known part never as the
// monthly total), and names its group and N; rent and expenses come from that same group.
// Never a blend of tenant reports and asking prices. Pure: the pages pass a translator and get
// plain strings, so the edge OG route formats nothing.

import type { SingleNumberFigure } from '@/lib/cost-figures';
import {
  isAllInTotal,
  singleNumberGroupLabel,
  singleNumberHeadingKey,
  singleNumberLabelText,
} from '@/lib/single-number-view';

/** A translator as `getTranslations()` returns it. */
type Translate = (key: string, values?: Record<string, string | number>) => string;

/** The text of a cost OG card, as `getCostOgImage` (`seo.ts`) takes it. */
export interface FigureOgCard {
  title: string;
  subtitle?: string;
  /** The chosen group's headline: "≈ 3,700 zł". */
  stat: string;
  /** What the number is: "Median Monthly Total", "Known part of the costs", "Rent". */
  statLabel: string;
  /** Its group and N, and "known part" / "rent only": "Asking prices (5), known part". */
  figureLabel: string;
  /** That group's rent, and its expenses beside an all-in total only. */
  split?: string;
}

/** Rent and expenses of the chosen group, as the cards show them (`BuildingFigureSummary`). */
function figureSplit(t: Translate, figure: SingleNumberFigure): string | undefined {
  const rent = figure.metric === 'rent' ? null : figure.rent;
  const expenses = isAllInTotal(figure) ? figure.expenses : null;
  const parts = [
    rent ? `${t('costs.building.rent')} ≈ ${rent.value.toLocaleString()}` : null,
    expenses ? `${t('costs.building.expenses')} ≈ ${expenses.value.toLocaleString()}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** The OG card of one building's or area's single number. */
export function figureOgCard(
  t: Translate,
  figure: SingleNumberFigure,
  text: { title: string; subtitle?: string },
): FigureOgCard {
  const card: FigureOgCard = {
    title: text.title,
    stat: `≈ ${figure.value.toLocaleString()} zł`,
    statLabel: t(singleNumberHeadingKey(figure)),
    figureLabel: singleNumberLabelText(t, figure),
  };
  if (text.subtitle) card.subtitle = text.subtitle;
  const split = figureSplit(t, figure);
  if (split) card.split = split;
  return card;
}

/**
 * The building page's meta description. With an all-in total and its rent and expenses it is
 * the total with that split; a known part or rent alone is named as such. `{reports}` is the
 * group with the N of the number shown ("Tenant reports (2)"), never a count over both groups.
 * Without a figure the description carries no number.
 */
export function buildingMetaDescription(
  t: Translate,
  {
    address,
    city,
    figure,
    format,
  }: {
    address: string;
    city: string;
    figure: SingleNumberFigure | null;
    format: (value: number) => string;
  },
): string {
  if (!figure) return t('costsSeo.buildingMetaDescription', { address, city });
  const group = singleNumberGroupLabel(figure);
  const reports = t(group.key, group.values);
  if (isAllInTotal(figure) && figure.rent && figure.expenses) {
    return t('costsSeo.buildingMetaDescriptionWithData', {
      address,
      city,
      total: format(figure.value),
      rent: format(figure.rent.value),
      expenses: format(figure.expenses.value),
      reports,
    });
  }
  return t('costsSeo.buildingMetaDescriptionPartial', {
    address,
    city,
    metric: figure.metric,
    value: format(figure.value),
    reports,
  });
}
