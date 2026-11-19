'use client';

// The checker's cost answer (spec 03 §Checker, FR-22, FR-24, FR-25, FR-29, FR-33): the
// building's groups with their N, one observation, the known part, the labelled district or
// city reference and that area's deposit statistic. Values are shown side by side with their
// labels and N; no "cheaper / pricier than the district" conclusion is drawn.

import { useTranslations } from 'next-intl';
import { CheckCircle2, Info } from 'lucide-react';
import type { FigureGroup, FigureSummary } from '@/lib/cost-figures';
import type { LocationCheckerCosts } from '@/lib/location-checker';
import {
  areaDepositMessage,
  characteristicMessages,
  FIGURE_GROUP_N_KEY,
  FIGURE_GROUP_TITLE_KEY,
  groupFigureRows,
  isOneObservation,
  KNOWN_PART_HINT_KEY,
  ONE_OBSERVATION_KEY,
  orderedFigureGroups,
  referenceGroupLabel,
  referenceHintMessage,
  sourceLineMessages,
  type FigureMessage,
  type GroupFigureRow,
} from '@/lib/building-figures-view';

type Translate = (key: string, values?: Record<string, string | number>) => string;

function useFigureTranslations(): Translate {
  return useTranslations() as unknown as Translate;
}

/**
 * One group's figures: the headline and the other figures, each with its own N. One
 * observation shows its values and characteristics without "≈" or N; a known part says that
 * it is not the full monthly cost.
 */
function FigureGroupBlock({ group, title }: { group: FigureGroup; title: string }) {
  const t = useFigureTranslations();
  const { headline, rows, knownPart } = groupFigureRows(group);
  if (!headline) return null;
  const one = isOneObservation(group);
  const characteristics = characteristicMessages(group);
  const value = (row: GroupFigureRow) => {
    const amount =
      row.key === 'completeTotalPerM2'
        ? `${Math.round(row.figure.median!).toLocaleString()} ${t('costs.building.perM2')}`
        : `${row.figure.median!.toLocaleString()} PLN`;
    return one ? amount : `≈ ${amount}`;
  };
  const n = (row: GroupFigureRow) => t(FIGURE_GROUP_N_KEY[group.key], { count: row.figure.n });

  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <p className="text-sm font-medium">{title}</p>
      {one && (
        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{t(ONE_OBSERVATION_KEY)}</p>
          {characteristics.length > 0 && (
            <p>{characteristics.map((message) => t(message.key, message.values)).join(' · ')}</p>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">{t(headline.labelKey)}</p>
      <p className="text-2xl font-bold">{value(headline)}</p>
      {!one && <p className="text-xs text-muted-foreground">{n(headline)}</p>}

      {rows.length > 0 && (
        <dl className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.key}>
              <dt className="text-xs text-muted-foreground">{t(row.labelKey)}</dt>
              <dd className="font-semibold">
                {value(row)}
                {!one && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">{n(row)}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {knownPart && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t(KNOWN_PART_HINT_KEY)}
        </p>
      )}
    </div>
  );
}

/**
 * The building's own figures: the source line ("3 reports from tenants (1 entered by
 * Passflat) · 2 asking prices from listings"), then one block per group, tenant reports first.
 * Never one number over both groups.
 */
export function CheckerBuildingFigures({ summary }: { summary: FigureSummary }) {
  const t = useFigureTranslations();
  const render = (message: FigureMessage) => t(message.key, message.values);
  const sourceLine = sourceLineMessages(summary).map(render).join(' · ');

  return (
    <div className="space-y-3">
      {sourceLine && <p className="text-xs text-muted-foreground">{sourceLine}</p>}
      {orderedFigureGroups(summary).map((group) => (
        <FigureGroupBlock
          key={group.key}
          group={group}
          title={t(FIGURE_GROUP_TITLE_KEY[group.key])}
        />
      ))}
    </div>
  );
}

/**
 * The area the building is set against, labelled with its level, group and N ("Reference:
 * tenant reports in Mokotów (6)") and never as the building's figures, followed by the area's
 * deposit statistic from MIN_DEPOSIT_ANSWERS answers. The district name comes from the
 * response; the city name is the checker's own, already in the visitor's locale.
 */
export function CheckerAreaReference({
  costs,
  cityName,
}: {
  costs: Pick<LocationCheckerCosts, 'reference' | 'deposit'>;
  cityName: string;
}) {
  const t = useFigureTranslations();
  const { reference } = costs;
  if (!reference) return null;
  const render = (message: FigureMessage) => t(message.key, message.values);
  const area = reference.level === 'district' ? reference.name : cityName;
  const deposit = areaDepositMessage(costs.deposit, area);

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {render(referenceHintMessage(reference.level))}
      </p>
      {orderedFigureGroups(reference.summary).map((group) => (
        <FigureGroupBlock
          key={group.key}
          group={group}
          title={render(referenceGroupLabel(reference.level, group, area))}
        />
      ))}
      {deposit && (
        <p className="flex items-start gap-1.5 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          {render(deposit)}
        </p>
      )}
    </div>
  );
}
