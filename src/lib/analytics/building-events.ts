import type { AnswerProperties, FigureSummary } from '@/lib/cost-figures';

/**
 * How many visible reports stand behind a building page, in total and per source (spec 01
 * §Building view, FR-9). The property names are an Assumption of the spec and live here only.
 */
export type ReportSourceCounts = {
  report_count: number;
  user_count: number;
  import_count: number;
  scraped_count: number;
};

/**
 * The counts from the figure contract's summary of the building (spec 03): `report_count` is
 * the summary's `reportCount`, so a report whose source is not `user`, `import` or `scraped` is
 * in no count, as it is in no figure group.
 */
export function reportSourceCounts(
  summary: Pick<FigureSummary, 'reportCount' | 'sourceCounts'>,
): ReportSourceCounts {
  return {
    report_count: summary.reportCount,
    user_count: summary.sourceCounts.user,
    import_count: summary.sourceCounts.import,
    scraped_count: summary.sourceCounts.scraped,
  };
}

/**
 * Properties of `building_detail_viewed`: the building and its city, the report counts and the
 * answer quality (spec 01 §Answer quality: `answer_level`, `source_kind`, `n`, `incomplete`
 * from `answerProperties`). Page context (`page_type`, `locale`, ...) is added by the
 * `before_send` hook, not here; the `city` slug sent here is the event's own property, as before.
 */
export function buildingDetailViewedProperties(
  building: { id: string; slug: string },
  citySlug: string,
  counts: ReportSourceCounts,
  answer: AnswerProperties,
): ReportSourceCounts &
  AnswerProperties & { building_id: string; building_slug: string; city: string } {
  return {
    building_id: building.id,
    building_slug: building.slug,
    city: citySlug,
    ...counts,
    answer_level: answer.answer_level,
    source_kind: answer.source_kind,
    n: answer.n,
    incomplete: answer.incomplete,
  };
}
