/**
 * How many visible reports stand behind a building page, in total and per source (spec 01
 * §Building view, FR-9). The property names are an Assumption of the spec and live here only.
 * Spec 03 later feeds these from the figure contract's `sourceCounts`.
 */
export type ReportSourceCounts = {
  report_count: number;
  user_count: number;
  import_count: number;
  scraped_count: number;
};

/**
 * Counts the sources of a building's visible reports (`CostReport.source`: `user` | `import` |
 * `scraped`). `report_count` counts every report, so a report with any other source is in the
 * total but in none of the per-source counts.
 */
export function reportSourceCounts(sources: ReadonlyArray<string>): ReportSourceCounts {
  const counts: ReportSourceCounts = {
    report_count: sources.length,
    user_count: 0,
    import_count: 0,
    scraped_count: 0,
  };
  for (const source of sources) {
    if (source === 'user') counts.user_count += 1;
    else if (source === 'import') counts.import_count += 1;
    else if (source === 'scraped') counts.scraped_count += 1;
  }
  return counts;
}

/**
 * Properties of `building_detail_viewed`: the building and its city plus the report counts. Page
 * context (`page_type`, `locale`, ...) is added by the `before_send` hook, not here; the `city`
 * slug sent here is the event's own property, as before.
 */
export function buildingDetailViewedProperties(
  building: { id: string; slug: string },
  citySlug: string,
  counts: ReportSourceCounts,
): ReportSourceCounts & { building_id: string; building_slug: string; city: string } {
  return {
    building_id: building.id,
    building_slug: building.slug,
    city: citySlug,
    ...counts,
  };
}
