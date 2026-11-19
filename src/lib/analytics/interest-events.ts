import type { ListingType } from '@/lib/listings-data';

/**
 * The visitor's role on `/[city]/roommate` (spec 02, FR-3; `find_flatmate` is PRD 3 FR-21),
 * passed to the interest form.
 */
export type RoommateIntent = 'find_room' | 'offer_room' | 'find_flatmate';

/**
 * The stable `code` values `POST /api/city-notify` returns on an error (spec 02 §Interest API).
 * Only these are copied into `error_code`; anything else falls back to the HTTP status.
 */
const API_ERROR_CODES = [
  'consent_required',
  'invalid_email',
  'invalid_input',
  'unknown_city',
  'unknown_district',
  'rate_limited',
  'server_error',
] as const;

type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * `error_code` of `listing_interest_failed` (spec 01, FR-7; the set is an Assumption):
 * the API's codes plus `network_error` for a fetch that threw.
 */
type InterestErrorCode = ApiErrorCode | 'network_error';

type InterestOutcome =
  | { status: number; code?: unknown; networkError?: never }
  | { networkError: true; status?: never; code?: never };

type InterestOutcomeInput = InterestOutcome & {
  listingType: ListingType;
  /** `District.slug` that was sent, or `''` for the whole city. */
  districtSlug: string;
  /** Set only when the visitor chose a role on this page; absent otherwise. */
  intent?: RoommateIntent;
};

type InterestOutcomeEvent =
  | {
      event: 'listing_interest_saved';
      properties: {
        listing_type: ListingType;
        district_scope: 'district' | 'city';
        intent?: RoommateIntent;
      };
    }
  | { event: 'listing_interest_failed'; properties: { error_code: InterestErrorCode } };

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (API_ERROR_CODES as readonly string[]).includes(value);
}

/** Fallback when the response carries no known `code` (the API adds codes in T011). */
function errorCodeFromStatus(status: number): ApiErrorCode {
  if (status === 429) return 'rate_limited';
  if (status === 400) return 'invalid_input';
  return 'server_error';
}

/**
 * The one event a listings-interest submit fires (spec 01 §Interest events, FR-6, FR-7):
 * `listing_interest_saved` after a 2xx, `listing_interest_failed` otherwise. Only the listed
 * properties are sent: no email, no form text, no response body. Page context (`page_type`,
 * `locale`, `city`, ...) is added by the `before_send` hook, not here.
 */
export function interestOutcomeEvent(input: InterestOutcomeInput): InterestOutcomeEvent {
  if (input.networkError) {
    return { event: 'listing_interest_failed', properties: { error_code: 'network_error' } };
  }
  if (input.status >= 200 && input.status < 300) {
    return {
      event: 'listing_interest_saved',
      properties: {
        listing_type: input.listingType,
        district_scope: input.districtSlug ? 'district' : 'city',
        ...(input.intent ? { intent: input.intent } : {}),
      },
    };
  }
  const error_code = isApiErrorCode(input.code) ? input.code : errorCodeFromStatus(input.status);
  return { event: 'listing_interest_failed', properties: { error_code } };
}

/**
 * Reads the `code` field of an error response without throwing (a body that is not JSON gives
 * `undefined`). Only the code leaves this function; the body is not kept or sent.
 */
export async function responseErrorCode(res: Response): Promise<unknown> {
  try {
    const body: unknown = await res.json();
    return body !== null && typeof body === 'object'
      ? (body as { code?: unknown }).code
      : undefined;
  } catch {
    return undefined;
  }
}
