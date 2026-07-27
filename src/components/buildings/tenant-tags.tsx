'use client';

import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TenantTag {
  key: string;
  sentiment: 'good' | 'neutral' | 'bad';
  votes: number;
  costReportVotes: number;
}

export interface TenantTagsSummary {
  tags: TenantTag[];
  voters: number;
  costReportVoters: number;
}

const SENTIMENT_STYLES: Record<string, string> = {
  good: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  neutral: 'border-border bg-muted/40 text-foreground',
  bad: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-500',
};

/**
 * What tenants said about a building.
 *
 * The caller decides whether to render this at all — an empty shelf is what
 * makes a product look dead — so this only handles the case where something is
 * publishable. With a single voice it says so plainly instead of dressing one
 * opinion up as an aggregate.
 */
export function TenantTags({ summary }: { summary: TenantTagsSummary }) {
  const t = useTranslations();

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        {summary.voters === 1
          ? t('checker.tenantTags.singleVoter')
          : t('checker.tenantTags.voters', {
              count: summary.voters,
              confirmed: summary.costReportVoters,
            })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {summary.tags.map((tag) => (
          <span
            key={tag.key}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm',
              SENTIMENT_STYLES[tag.sentiment] ?? SENTIMENT_STYLES.neutral,
            )}
          >
            {t(`buildingTags.tags.${tag.key}`)}
            {tag.votes > 1 && <span className="text-xs tabular-nums opacity-70">{tag.votes}</span>}
            {tag.costReportVotes > 0 && (
              <span
                title={t('checker.tenantTags.confirmedHint')}
                className="inline-flex items-center gap-0.5 rounded-full bg-background/60 px-1.5 text-[10px] font-medium"
              >
                <Users className="h-3 w-3" />
                {t('checker.tenantTags.confirmedChip')}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
