'use client';

import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';

import type { SingleNumberFigure } from '@/lib/cost-figures';
import {
  isAllInTotal,
  singleNumberGroupLabel,
  singleNumberHeadingKey,
} from '@/lib/single-number-view';

/**
 * The number of a costs-overview card, a city-hub district row or a district-page building
 * row (spec 03 §Single-number surfaces, D23): the chosen group's
 * headline under a heading that names it (never "median" for one value, never "monthly total"
 * for a known part), the group label with its N, and that same group's rent, expenses and
 * per-m² figures. Nothing from the other group.
 */
export function BuildingFigureSummary({ figure }: { figure: SingleNumberFigure }) {
  const t = useTranslations();
  const group = singleNumberGroupLabel(figure);
  const allIn = isAllInTotal(figure);
  const rent = figure.metric === 'rent' ? null : figure.rent;
  const expenses = allIn ? figure.expenses : null;
  const perM2 = allIn ? figure.completeTotalPerM2 : null;

  return (
    <div className="text-left tabular-nums sm:text-right">
      <p className="text-xs text-muted-foreground">{t(singleNumberHeadingKey(figure))}</p>
      <p className="text-lg font-bold text-primary">≈ {figure.value.toLocaleString()} PLN</p>
      <p className="flex items-center gap-1 text-xs text-muted-foreground sm:justify-end">
        <Users className="h-3 w-3" />
        {t(group.key, group.values)}
      </p>
      {(rent || expenses) && (
        <p className="text-xs text-muted-foreground">
          {rent && (
            <>
              {t('costs.overview.rent')} ≈ {rent.value.toLocaleString()}
            </>
          )}
          {rent && expenses && ' · '}
          {expenses && (
            <>
              {t('costs.overview.expenses')} ≈ {expenses.value.toLocaleString()}
            </>
          )}
        </p>
      )}
      {perM2 && (
        <p className="text-xs text-muted-foreground">
          ≈ {perM2.value.toLocaleString()} {t('costs.overview.perM2')}
        </p>
      )}
    </div>
  );
}
