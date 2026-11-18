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
