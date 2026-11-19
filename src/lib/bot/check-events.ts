import {
  answerProperties,
  type AnswerProperties,
  type AreaReference,
  type FigureSummary,
} from '@/lib/cost-figures';

import type { AddressLookup } from './lookup';
import type { EntrySource } from './start-payload';

/**
 * Properties of the bot's check events (spec 04 §Bot analytics). The answer
 * quality comes from the shared `answerProperties`, the definition the
 * website's `address_checked` uses, so web and bot count N the same way. Only
 * levels, slugs, counts and flags: never the typed text, an address or a name.
 */

type AnswerQuality = Pick<AnswerProperties, 'source_kind' | 'n' | 'incomplete'>;

function answerQuality(
  summary: FigureSummary | null,
  reference: Pick<AreaReference, 'level' | 'summary'> | null,
): AnswerQuality {
  const { source_kind, n, incomplete } = answerProperties(summary, reference);
  return { source_kind, n, incomplete };
}

/** `tg_address_checked`: the existing four properties, then how and how well it was answered. */
export function checkEventProperties(
  lookup: Pick<AddressLookup, 'level' | 'districtSlug' | 'buildingId' | 'building' | 'reference'>,
  entrySource: EntrySource,
) {
  return {
    level: lookup.level,
    district: lookup.districtSlug,
    has_building: lookup.buildingId != null,
    report_count: lookup.building?.reportCount ?? 0,
    entry_source: entrySource,
    lookup_level: lookup.level,
    ...answerQuality(lookup.building, lookup.reference),
  };
}

/**
 * `tg_district_checked`: the existing two properties, then the answer quality of
 * the district's reference (the city's for a district below MIN_AREA_REPORTS).
 * `reportCount` is the district's count in the cost-baselines league table (its
 * reports with a total; 0 when it is not in the table), the value the property
 * always had, so a thin district can still be told apart from its city answer.
 */
export function districtCheckEventProperties(
  district: { slug: string; reportCount: number; reference: AreaReference | null },
  entrySource: EntrySource,
) {
  return {
    district: district.slug,
    report_count: district.reportCount,
    entry_source: entrySource,
    ...answerQuality(null, district.reference),
  };
}
