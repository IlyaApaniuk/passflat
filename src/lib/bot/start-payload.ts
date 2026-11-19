/**
 * The `/start` deep-link payload, parsed once so every branch of the handler
 * reads the same decision (spec 04 §Start payloads). The raw string stays the
 * attribution value of `tg_bot_started`; this only says what the link opens.
 */

export type StartPayload =
  | { kind: 'none' }
  | { kind: 'deposit' }
  | { kind: 'building'; buildingId: string }
  | { kind: 'invalid_building' }
  | { kind: 'district'; slug: string }
  | { kind: 'web'; source: string }
  | { kind: 'unknown' };

/**
 * Telegram deep-link payloads are at most 64 characters of `[A-Za-z0-9_-]`.
 * Anything else can only be typed by hand after `/start`, so it opens nothing.
 */
const MAX_PAYLOAD_LENGTH = 64;
const PAYLOAD_CHARS = /^[A-Za-z0-9_-]+$/;

/** 8-4-4-4-12 hex: the shape a Postgres `uuid` column accepts, any case. */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISTRICT_SLUG = /^[a-z0-9-]{1,48}$/;

export function parseStartPayload(raw: string): StartPayload {
  if (raw === '') return { kind: 'none' };
  if (raw.length > MAX_PAYLOAD_LENGTH || !PAYLOAD_CHARS.test(raw)) return { kind: 'unknown' };

  if (raw === 'dep') return { kind: 'deposit' };

  if (raw.startsWith('b_')) {
    const id = raw.slice(2);
    return UUID_SHAPE.test(id)
      ? { kind: 'building', buildingId: id.toLowerCase() }
      : { kind: 'invalid_building' };
  }

  if (raw.startsWith('d_')) {
    const slug = raw.slice(2);
    if (DISTRICT_SLUG.test(slug)) return { kind: 'district', slug };
  }

  if (raw.startsWith('web_') && raw.length > 'web_'.length) {
    return { kind: 'web', source: raw.slice('web_'.length) };
  }

  return { kind: 'unknown' };
}

/**
 * `entry_source` of the bot's check events: how the person reached the card
 * (spec 04 §Start payloads, values are an Assumption). PRD 2 adds the
 * deposit-flow values here.
 */
export const ENTRY_SOURCE = {
  typedAddress: 'typed_address',
  typedDistrict: 'typed_district',
  linkBuilding: 'link_building',
  linkDistrict: 'link_district',
} as const;
