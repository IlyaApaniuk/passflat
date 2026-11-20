'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, MapPin } from 'lucide-react';
import { ShareButton } from './share-button';
import { OwnCostsReference } from './own-costs-reference';
import type { OwnReportFigures, OwnReportReference } from '@/lib/own-report-reference';

/** A single cost report paired with the area reference of the figure contract. */
export type ReportComparison = {
  reportId: string;
  address: string;
  districtName: string | null;
  districtSlug: string | null;
  citySlug: string;
  buildingSlug: string;
  createdAt: string;
  status: 'flagged' | 'visible';
  periodicCount: number;
  own: OwnReportFigures;
  /** The district's or the city's tenant reports (`loadAreaReference`), or null. */
  reference: OwnReportReference | null;
  /** The reference's area in the visitor's locale. */
  areaName: string | null;
};

/**
 * Unified "your costs beside your area" panel for the dashboard: one tab per cost
 * report (most recent first), each showing the report's own figures beside the
 * area's tenant reports with their N (spec 03 §Comparisons: no overpay, saving,
 * percentage or position bar against one report), an edit shortcut and a
 * personal share. An edit round-trips straight back here with fresh numbers.
 */
export function CostReportsPanel({
  reports,
  userId,
}: {
  reports: ReportComparison[];
  userId: string;
}) {
  if (reports.length === 0) return null;
  return (
    <Tabs defaultValue={reports[0].reportId} className="w-full">
      {reports.length > 1 && (
        // A single horizontally-scrollable row (slides sideways) instead of
        // squeezing every tab into the width. `flex-none` overrides the shadcn
        // trigger's default `flex-1` (which would shrink/truncate the labels);
        // the scrollbar is hidden for a clean strip.
        <TabsList className="mb-3 flex h-auto w-full justify-start gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {reports.map((r) => (
            <TabsTrigger
              key={r.reportId}
              value={r.reportId}
              className="max-w-[12rem] flex-none truncate"
            >
              {r.address}
            </TabsTrigger>
          ))}
        </TabsList>
      )}
      {reports.map((r) => (
        <TabsContent key={r.reportId} value={r.reportId} className="mt-0">
          <ReportCard report={r} userId={userId} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function ReportCard({ report: r, userId }: { report: ReportComparison; userId: string }) {
  const t = useTranslations();

  return (
    <div className="rounded-lg border bg-card p-4">
      {/* Header: address + district. The total is in the figures below, with its
          label (a report without all utilities is a known part, FR-25). */}
      <div className="flex flex-col gap-1">
        <div className="min-w-0">
          {r.status === 'flagged' && (
            <Badge
              variant="outline"
              className="mb-1 border-amber-500/20 bg-amber-500/10 text-amber-600"
            >
              {t('dashboard.costReportFlagged')}
            </Badge>
          )}
          <Link
            href={`/${r.citySlug}/building/${r.buildingSlug}`}
            className="flex items-center gap-1 font-medium hover:underline"
          >
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{r.address}</span>
          </Link>
          {r.districtName && (
            <p className="mt-0.5 text-sm text-muted-foreground">{r.districtName}</p>
          )}
        </div>
      </div>

      {/* The report's figures beside the area's tenant reports, each with its N. */}
      <div className="mt-4">
        <OwnCostsReference own={r.own} reference={r.reference} areaName={r.areaName} />
      </div>

      {/* Actions: edit this report + share a district invite (no percentage in
          the link, so the share card stays neutral). Stacked full-width on
          mobile, right-aligned on desktop. */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button size="sm" variant="outline" className="w-full gap-1.5 sm:w-auto" asChild>
          <Link href={`/${r.citySlug}/costs/submit?edit=true&id=${r.reportId}`}>
            <Edit className="h-3.5 w-3.5" />
            {t('common.edit')}
          </Link>
        </Button>
        {r.districtSlug && (
          <ShareButton
            path={`/${r.citySlug}/costs/share?d=${r.districtSlug}`}
            source="dashboard-comparison"
            refToken={userId}
            label={t('dashboard.costComparison.share')}
            className="w-full sm:w-auto"
          />
        )}
      </div>
    </div>
  );
}
