'use client';

// The user's own costs beside the area reference (spec 03 §Comparisons, FR-29): the
// post-submit screen and the dashboard's cost-reports panel. Values side by side with the
// reference's label and each figure's N; no overpay, saving, percentage or position.

import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import { KNOWN_PART_HINT_KEY, referenceGroupLabel } from '@/lib/building-figures-view';
import {
  ownReportRows,
  type OwnReportFigures,
  type OwnReportReference,
} from '@/lib/own-report-reference';

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function OwnCostsReference({
  own,
  reference,
  areaName,
  heading,
}: {
  own: OwnReportFigures;
  reference: OwnReportReference | null;
  /** The reference's area in the visitor's locale (district name, or the translated city). */
  areaName: string | null;
  heading?: string;
}) {
  const t = useTranslations() as unknown as Translate;
  const { rows, knownPart } = ownReportRows(own, reference);
  if (rows.length === 0) return null;

  const label =
    reference && areaName && rows.some((r) => r.area)
      ? referenceGroupLabel(reference.level, reference.tenant, areaName)
      : null;
  const amount = (value: number, perM2: boolean) =>
    perM2
      ? `${Math.round(value).toLocaleString()} ${t('costs.building.perM2')}`
      : `${value.toLocaleString()} PLN`;

  return (
    <div>
      {heading && <p className="text-sm font-semibold">{heading}</p>}
      <p className="mt-1 text-xs">
        <span className="font-medium text-primary">{t('costs.submit.yourCosts')}</span>
        {label && <span className="text-muted-foreground"> · {t(label.key, label.values)}</span>}
      </p>
      <dl className="mt-2 space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">{t(row.labelKey)}</dt>
            <dd className="text-right tabular-nums">
              <span className="font-semibold text-primary">{amount(row.own, row.perM2)}</span>
              {row.area && (
                <span className="block text-xs text-muted-foreground">
                  ≈ {amount(row.area.median!, row.perM2)} ·{' '}
                  {t('costs.overview.nReports', { count: row.area.n })}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {knownPart && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t(KNOWN_PART_HINT_KEY)}
        </p>
      )}
    </div>
  );
}
