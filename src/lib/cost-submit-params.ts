/**
 * Query parameters of the cost form (`/[city]/costs/submit`), parsed without I/O
 * so the attribution and prefill rules are testable (spec 04 §Links to the
 * website).
 *
 * - `source` is attribution for `cost_form_started`. Only the listed values pass;
 *   arbitrary query-string values never reach PostHog event properties.
 * - The form prefills only from an existing building of the route city: by
 *   `b=<buildingId>` or by `p=<placeId>` matching a building's `placeId`.
 *   `p` counts only with an accepted `source`. When both are present (the bot
 *   sends both), the building id wins: it names the exact row the sender
 *   resolved, which may have no place id of its own, and re-resolving an address
 *   through a place id risks splitting one building into two.
 * - Edit mode never prefills a new address.
 */

export const SUBMIT_SOURCES = ['checker', 'review', 'building', 'tgbot'] as const;
export type SubmitSource = (typeof SUBMIT_SOURCES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PLACE_ID_LENGTH = 255;

type SearchParams = Record<string, string | string[] | undefined>;

export interface SubmitParams {
  isEditMode: boolean;
  reportId: string | undefined;
  source: SubmitSource | undefined;
  prefillBuildingId: string | undefined;
  prefillPlaceId: string | undefined;
}

function isSubmitSource(value: unknown): value is SubmitSource {
  return typeof value === 'string' && (SUBMIT_SOURCES as readonly string[]).includes(value);
}

function single(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseSubmitParams(search: SearchParams): SubmitParams {
  const isEditMode = search.edit === 'true';
  const reportId = typeof search.id === 'string' ? search.id : undefined;
  const source = isSubmitSource(search.source) ? search.source : undefined;

  const rawBuildingId = single(search.b);
  const prefillBuildingId = !isEditMode && UUID_RE.test(rawBuildingId) ? rawBuildingId : undefined;

  const rawPlaceId = single(search.p);
  const prefillPlaceId =
    !isEditMode &&
    !prefillBuildingId &&
    source != null &&
    rawPlaceId.length > 0 &&
    rawPlaceId.length <= MAX_PLACE_ID_LENGTH
      ? rawPlaceId
      : undefined;

  return { isEditMode, reportId, source, prefillBuildingId, prefillPlaceId };
}

/**
 * The building lookup for the prefill, scoped to the route city so a crafted URL
 * cannot prefill a building of another city. Null when nothing prefills.
 */
export function prefillBuildingWhere(
  params: Pick<SubmitParams, 'prefillBuildingId' | 'prefillPlaceId'>,
  cityId: string,
): { cityId: string; id: string } | { cityId: string; placeId: string } | null {
  if (params.prefillBuildingId) return { cityId, id: params.prefillBuildingId };
  if (params.prefillPlaceId) return { cityId, placeId: params.prefillPlaceId };
  return null;
}
