'use client';

// The checker's cost answer (spec 03 §Checker, FR-22, FR-24, FR-25, FR-29, FR-33): the
// building's groups with their N, one observation, the known part, the labelled district or
// city reference and that area's deposit statistic. Values are shown side by side with their
// labels and N; no "cheaper / pricier than the district" conclusion is drawn. The group blocks
// themselves are `figure-group-block.tsx`, shared with the roommate page's room money block.

import { CheckCircle2, Info } from 'lucide-react';
import type { FigureSummary } from '@/lib/cost-figures';
import type { LocationCheckerCosts } from '@/lib/location-checker';
import {
  areaDepositMessage,
  FIGURE_GROUP_TITLE_KEY,
  orderedFigureGroups,
  referenceHintMessage,
  sourceLineMessages,
  type FigureMessage,
} from '@/lib/building-figures-view';
import { AreaReferenceGroups, FigureGroupBlock, useFigureTranslations } from './figure-group-block';

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
      <AreaReferenceGroups reference={reference} area={area} />
      {deposit && (
        <p className="flex items-start gap-1.5 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          {render(deposit)}
        </p>
      )}
    </div>
  );
}
