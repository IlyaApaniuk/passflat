import type { AnswerProperties } from '@/lib/cost-figures';

/** A successful in-city check, as the checker records it before the event is sent. */
export interface SuccessfulCheckEvent {
  buildingId: string;
  /** The building itself has visible reports (an area reference alone does not count). */
  hasData: boolean;
  source: 'shared_url' | 'address_search';
}

/**
 * Properties of `address_checked` for a successful in-city check: the existing `city`,
 * `building_id`, `has_data` and `source`, plus the answer quality (spec 01 §Answer quality:
 * `answer_level`, `source_kind`, `n`, `incomplete` from `answerProperties`). The outside-city
 * variant of the event and `checker_check_failed` do not go through here and are unchanged.
 */
export function addressCheckedProperties(
  citySlug: string,
  check: SuccessfulCheckEvent,
  answer: AnswerProperties,
): AnswerProperties & {
  city: string;
  building_id: string;
  has_data: boolean;
  source: SuccessfulCheckEvent['source'];
} {
  return {
    city: citySlug,
    building_id: check.buildingId,
    has_data: check.hasData,
    source: check.source,
    answer_level: answer.answer_level,
    source_kind: answer.source_kind,
    n: answer.n,
    incomplete: answer.incomplete,
  };
}
