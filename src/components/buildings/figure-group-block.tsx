'use client';

// The website's rendering of figure groups (spec 03 §Checker, FR-22, FR-24, FR-25): one block
// per group with its headline, the other figures, each N, one observation and the known part.
// Shared by the checker (`checker-figures.tsx`) and the roommate page's room money block
// (spec 02 §Room money block), so both show the contract's figures the same way. Imports only
// the pure figure modules: the roommate page's client tree walks this file.

import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import type { AreaReference, FigureGroup } from '@/lib/cost-figures';
import {
  characteristicMessages,
  FIGURE_GROUP_N_KEY,
  groupFigureRows,
  isOneObservation,
  KNOWN_PART_HINT_KEY,
  ONE_OBSERVATION_KEY,
  orderedFigureGroups,
  referenceGroupLabel,
  type FigureMessage,
  type GroupFigureRow,
} from '@/lib/building-figures-view';

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function useFigureTranslations(): Translate {
  return useTranslations() as unknown as Translate;
}

/**
 * One group's figures: the headline and the other figures, each with its own N. One
 * observation shows its values and characteristics without "≈" or N; a known part says that
 * it is not the full monthly cost. `oneObservationLabel` replaces the building's "One
 * observation at this address" where the group is not one address.
 */
export function FigureGroupBlock({
  group,
  title,
  oneObservationLabel,
}: {
  group: FigureGroup;
  title: string;
  oneObservationLabel?: string;
}) {
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
          <p className="font-medium text-foreground">
            {oneObservationLabel ?? t(ONE_OBSERVATION_KEY)}
          </p>
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
 * An area reference's groups, tenant reports first, each titled with its level, group and N
 * ("Reference: tenant reports in Mokotów (6)"). `area` is the display name in the visitor's
 * locale. Never one number over both groups.
 */
export function AreaReferenceGroups({
  reference,
  area,
  oneObservationLabel,
}: {
  reference: AreaReference;
  area: string;
  oneObservationLabel?: string;
}) {
  const t = useFigureTranslations();
  const render = (message: FigureMessage) => t(message.key, message.values);
  return (
    <>
      {orderedFigureGroups(reference.summary).map((group) => (
        <FigureGroupBlock
          key={group.key}
          group={group}
          title={render(referenceGroupLabel(reference.level, group, area))}
          oneObservationLabel={oneObservationLabel}
        />
      ))}
    </>
  );
}
