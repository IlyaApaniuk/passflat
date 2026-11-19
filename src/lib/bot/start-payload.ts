/**
 * The `/start` deep-link payload, parsed once so every branch of the handler
 * reads the same decision (spec 04 §Start payloads). The raw string stays the
 * attribution value of `tg_bot_started` (see `recordedStartPayload`); this only
 * says what the link opens.
 */

/**
 * `source` of the roommate entry: where a `mate` link was posted, or the bot
 * menu (spec 04 §Start payloads, values are an Assumption, D68). Kept apart
 * from `ENTRY_SOURCE` so `entry_source` keeps one meaning per event family.
 */
export const ROOMMATE_ENTRY_SOURCE = {
  direct: 'direct',
  tg: 'tg',
  fb: 'fb',
  ig: 'ig',
  threads: 'threads',
  web: 'web',
  botMenu: 'bot_menu',
  other: 'other',
} as const;

export type RoommateEntrySource =
  (typeof ROOMMATE_ENTRY_SOURCE)[keyof typeof ROOMMATE_ENTRY_SOURCE];

export type StartPayload =
  | { kind: 'none' }
  | { kind: 'deposit' }
  | { kind: 'building'; buildingId: string }
  | { kind: 'invalid_building' }
  | { kind: 'district'; slug: string }
  | { kind: 'web'; source: string }
  | { kind: 'roommate'; source: RoommateEntrySource; detail?: string }
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

/**
 * `mate_<source>` or `mate_<source>_<detail>`; the detail is the posting kit's
 * group key (spec 04 §Start payloads, an Assumption, D68).
 */
const MATE_LINK = /^mate_([a-z]+)(?:_([a-z0-9]{1,24}))?$/;
const MATE_LINK_SOURCES: ReadonlySet<string> = new Set<RoommateEntrySource>([
  ROOMMATE_ENTRY_SOURCE.tg,
  ROOMMATE_ENTRY_SOURCE.fb,
  ROOMMATE_ENTRY_SOURCE.ig,
  ROOMMATE_ENTRY_SOURCE.threads,
  ROOMMATE_ENTRY_SOURCE.web,
]);

/** The only shape a deep link can carry (`[A-Za-z0-9_-]{1,64}`). */
function isDeepLinkShape(raw: string): boolean {
  return raw.length <= MAX_PAYLOAD_LENGTH && PAYLOAD_CHARS.test(raw);
}

/** Any payload that starts with `mate`; an unrecognised one is `other`, never an error. */
function parseRoommate(raw: string): StartPayload {
  if (raw === 'mate') return { kind: 'roommate', source: ROOMMATE_ENTRY_SOURCE.direct };

  const match = MATE_LINK.exec(raw);
  if (match && MATE_LINK_SOURCES.has(match[1])) {
    const source = match[1] as RoommateEntrySource;
    return match[2] ? { kind: 'roommate', source, detail: match[2] } : { kind: 'roommate', source };
  }

  return { kind: 'roommate', source: ROOMMATE_ENTRY_SOURCE.other };
}

export function parseStartPayload(raw: string): StartPayload {
  if (raw === '') return { kind: 'none' };
  if (!isDeepLinkShape(raw)) return { kind: 'unknown' };

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

  if (raw.startsWith('mate')) return parseRoommate(raw);

  return { kind: 'unknown' };
}

const INVALID_START_PAYLOAD = 'invalid';

/**
 * The payload as `tg_bot_started.payload` and `TelegramChat.startPayload` store
 * it: null without one, the raw string when it has a deep link's shape, else
 * `'invalid'`. Text that fails the guard can only be typed after `/start`, and
 * free text never goes into an event (spec 04 §Start payloads, CLAUDE.md).
 */
export function recordedStartPayload(raw: string): string | null {
  if (raw === '') return null;
  return isDeepLinkShape(raw) ? raw : INVALID_START_PAYLOAD;
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

export type EntrySource = (typeof ENTRY_SOURCE)[keyof typeof ENTRY_SOURCE];
