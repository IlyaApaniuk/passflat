import type { BeforeSendFn, CaptureResult } from 'posthog-js';

import { routing, type Locale } from '@/i18n/routing';
import type { ListingType } from '@/lib/listings-data';

// Page context attached to client analytics events (docs/specs/01-analytics-context.md#page-context).
// The value mapping is an Assumption of the spec: change it here and nowhere else.

/** Every `page_type` value. `blog` is an Assumption (PRD 1 Q-12). */
export const PAGE_TYPES = [
  'home',
  'roommate',
  'listing_detail',
  'building',
  'checker',
  'costs',
  'cost_submit',
  'resources',
  'blog',
  'other',
] as const;

type PageType = (typeof PAGE_TYPES)[number];

/**
 * Static directories directly under `src/app/[locale]/`. A first path segment
 * that is not one of them is a city (`src/app/[locale]/[city]/`). The unit test
 * compares this list with the file system, so a new top-level route fails it.
 */
export const STATIC_TOP_LEVEL_ROUTES = [
  'about',
  'account-deleted',
  'admin',
  'auth',
  'blog',
  'contact',
  'create-listing',
  'dashboard',
  'email',
  'help',
  'how-it-works',
  'messages',
  'pricing',
  'privacy',
  'resources',
  'terms',
] as const;

/**
 * Static directories directly under `src/app/[locale]/[city]/`. Any other
 * second segment is a district (`[city]/[district]`). Checked against the file
 * system by the unit test as well.
 */
export const STATIC_CITY_ROUTES = [
  'building',
  'calculator',
  'check',
  'costs',
  'replacement',
  'review',
  'roommate',
  'sublet',
] as const;

const LISTING_TYPES: readonly ListingType[] = ['replacement', 'roommate', 'sublet'];

export interface PageContext {
  page_type: PageType;
  locale: Locale;
  /** City slug when the route has one, otherwise `null`. */
  city: string | null;
  listing_type?: ListingType;
}

type RouteContext = Pick<PageContext, 'page_type' | 'listing_type'>;

const OTHER: RouteContext = { page_type: 'other' };

function isLocale(segment: string | undefined): segment is Locale {
  return (routing.locales as readonly string[]).includes(segment ?? '');
}

function isStaticTopLevelRoute(segment: string): boolean {
  return (STATIC_TOP_LEVEL_ROUTES as readonly string[]).includes(segment);
}

function isStaticCityRoute(segment: string): boolean {
  return (STATIC_CITY_ROUTES as readonly string[]).includes(segment);
}

function isListingType(segment: string): segment is ListingType {
  return (LISTING_TYPES as readonly string[]).includes(segment);
}

/** Page type of a static top-level route; `rest` are the segments after it. */
function staticRouteContext(route: string, rest: string[]): RouteContext {
  if (route === 'blog' && rest.length <= 1) return { page_type: 'blog' };
  if (route === 'resources' && rest.length === 0) return { page_type: 'resources' };
  return OTHER;
}

/** Page type of a route under `[city]`; `rest` are the segments after the city. */
function cityRouteContext(rest: string[]): RouteContext {
  const [section, param, ...extra] = rest;
  if (section === undefined) return { page_type: 'costs' };
  if (extra.length > 0) return OTHER;

  if (isListingType(section)) {
    if (param !== undefined) return { page_type: 'listing_detail', listing_type: section };
    return { page_type: section === 'roommate' ? 'roommate' : 'other', listing_type: section };
  }

  switch (section) {
    case 'building':
      return param === undefined ? OTHER : { page_type: 'building' };
    case 'check':
      return param === undefined ? { page_type: 'checker' } : OTHER;
    case 'costs':
      if (param === undefined || param === 'share') return { page_type: 'costs' };
      return param === 'submit' ? { page_type: 'cost_submit' } : OTHER;
    case 'calculator':
      return param === undefined ? { page_type: 'costs' } : OTHER;
    default:
      // `review` and any unknown static child are `other`; a district has no children.
      if (isStaticCityRoute(section)) return OTHER;
      return param === undefined ? { page_type: 'costs' } : OTHER;
  }
}

/**
 * Maps a pathname (`window.location.pathname`) to its page context. Routing is
 * `as-needed`: a path without a locale prefix is Polish.
 */
export function getPageContext(pathname: string): PageContext {
  const segments = pathname.split(/[?#]/, 1)[0].split('/').filter(Boolean);
  const locale: Locale = isLocale(segments[0])
    ? (segments.shift() as Locale)
    : routing.defaultLocale;
  const [first, ...rest] = segments;

  if (first === undefined) return { page_type: 'home', locale, city: null };
  if (isStaticTopLevelRoute(first)) {
    return { ...staticRouteContext(first, rest), locale, city: null };
  }
  return { ...cityRouteContext(rest), locale, city: first };
}

// Attaching the context to every client event
// (docs/specs/01-analytics-context.md#attaching-context-to-every-event).

/**
 * The SDK's own per-session entry pathname. posthog-js 1.374 (`SessionPropsManager`)
 * stores the URL at which each `$session_id` started in its persistence and adds
 * it to every event, so it survives a consented reload without new storage.
 */
const SDK_SESSION_ENTRY_PATHNAME = '$session_entry_pathname';

/** Session-recording payloads are not analytics events and are sent as the SDK built them. */
const PASS_THROUGH_EVENTS: ReadonlySet<string> = new Set(['$snapshot']);

/**
 * The entry page type last seen for a session, kept in module memory by the hook.
 * It is the fallback for an event without the SDK entry pathname: the pathname of
 * the first event the hook sees for that `$session_id`.
 */
interface SessionEntry {
  sessionId: string | undefined;
  entryPageType: PageType;
}

interface PageContextResult {
  event: CaptureResult | null;
  entry: SessionEntry | null;
}

/**
 * Adds `getPageContext(pathname)` and `entry_page_type` to an event, under its
 * own properties (an event's own property wins). `pathname` is the page at send
 * time; `entry` is the state returned for the previous event.
 */
export function withPageContext(
  event: CaptureResult | null,
  pathname: string,
  entry: SessionEntry | null,
): PageContextResult {
  if (!event || PASS_THROUGH_EVENTS.has(event.event)) return { event, entry };

  const rawSessionId = event.properties.$session_id;
  const sessionId = typeof rawSessionId === 'string' ? rawSessionId : undefined;
  const sdkEntryPathname = event.properties[SDK_SESSION_ENTRY_PATHNAME];

  let nextEntry: SessionEntry;
  if (typeof sdkEntryPathname === 'string') {
    nextEntry = { sessionId, entryPageType: getPageContext(sdkEntryPathname).page_type };
  } else if (entry && entry.sessionId === sessionId) {
    nextEntry = entry;
  } else {
    nextEntry = { sessionId, entryPageType: getPageContext(pathname).page_type };
  }

  return {
    event: {
      ...event,
      properties: {
        ...getPageContext(pathname),
        entry_page_type: nextEntry.entryPageType,
        ...event.properties,
      },
    },
    entry: nextEntry,
  };
}

/** The `before_send` hook for `posthog.init`; it holds the session entry in memory. */
export function createPageContextHook(getPathname: () => string): BeforeSendFn {
  let entry: SessionEntry | null = null;
  return (event) => {
    const result = withPageContext(event, getPathname(), entry);
    entry = result.entry;
    return result.event;
  };
}
