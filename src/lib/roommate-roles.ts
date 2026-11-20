import type { RoommateIntent } from '@/lib/analytics/interest-events';
import type { ListingType } from '@/lib/listings-data';
import type { ListingsEmptyKind } from '@/lib/listings-empty-kind';
import { pageHasFlatmateBlock } from '@/lib/roommate/flatmate-block';

/**
 * The role selector on `/[city]/roommate` (spec 02 §Role selector, FR-14, FR-3; the third
 * choice `find_flatmate` is spec 02 §Find a flatmate, PRD 3 FR-21). The state is client state
 * of `ListingsPageClient` only: nothing is stored, choosing is never required.
 */
export interface RoommateRoleState {
  /** The last role chosen on this page view; passed to `ListingsEmptyState`. */
  intent?: RoommateIntent;
  /** True when the choices are folded into the "<chosen role> · change" chip. */
  collapsed: boolean;
}

export const INITIAL_ROOMMATE_ROLE_STATE: RoommateRoleState = { collapsed: false };

/** Where "I have a free room" goes (rendered with the locale-aware `Link`). */
export const ROOMMATE_OFFER_HREF = {
  pathname: '/create-listing',
  query: { type: 'roommate' },
} as const;

interface RoommateRoleChoice {
  state: RoommateRoleState;
  event: 'roommate_intent_selected';
  properties: { intent: RoommateIntent };
  /**
   * `find_room` and `find_flatmate` stay on the page and scroll the list container to its top
   * (where the flatmate block is); `offer_room` navigates away instead.
   */
  scrollListToTop: boolean;
}

/** What one click on a choice does: one `roommate_intent_selected` with `intent`, nothing else. */
export function chooseRoommateRole(intent: RoommateIntent): RoommateRoleChoice {
  const staysOnPage = intent !== 'offer_room';
  return {
    state: { intent, collapsed: staysOnPage },
    event: 'roommate_intent_selected',
    properties: { intent },
    scrollListToTop: staysOnPage,
  };
}

/** The chip reopens the choices and keeps the chosen intent (no event). */
export function reopenRoommateRoles(state: RoommateRoleState): RoommateRoleState {
  return { ...state, collapsed: false };
}

/**
 * True when the "Looking for someone to rent with" block shows: by default (no role chosen yet)
 * and for "Looking for someone to rent with"; "I'm looking for a room" and "I have a free room"
 * hide it (spec 08 §Roommate page default view, PRD 4 FR-1).
 */
export function showsFlatmateBlock(state: RoommateRoleState): boolean {
  return state.intent === undefined || state.intent === 'find_flatmate';
}

/**
 * True when the room money block shows (spec 02 §Room money block): the visitor chose "I'm
 * looking for a room", or the city has no offer at all (`no_offers_in_city`, whatever the
 * role). While it shows, its address-check item replaces the bridge line.
 */
export function showsRoomMoneyBlock(
  state: RoommateRoleState,
  emptyKind: ListingsEmptyKind,
): boolean {
  return state.intent === 'find_room' || emptyKind === 'no_offers_in_city';
}

interface RoommatePageLayoutInput {
  listingType: ListingType;
  citySlug: string;
  /** Roommate only: active offers in the city without the URL filters; absent elsewhere. */
  cityOfferCount?: number;
  roleState: RoommateRoleState;
  emptyKind: ListingsEmptyKind;
  /** Whether `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is set. */
  hasUsername: boolean;
}

interface RoommatePageLayout {
  /** The "Looking for someone to rent with" block, first in the scrolling list. */
  showFlatmateBlock: boolean;
  /** The room money block, after the flatmate block (the page also needs its `roomMoney`). */
  showRoomMoney: boolean;
  /** The `listings.listingsInCity` line (desktop and mobile). */
  showCountLine: boolean;
  /** The flatmate block's bot button; without it the block says the bot is not connected. */
  showBotButton: boolean;
  /** The role selector row stands above the type tabs row. */
  selectorAboveTabs: boolean;
  /** The frozen listing type tabs (desktop and mobile; spec 08 §Footer product column). */
  showTypeTabs: boolean;
  /** The `listings.roommateH1` heading, first in the content column (spec 08 §Roommate page shell). */
  showH1: boolean;
}

/**
 * What `ListingsPageClient` shows on a listings page (spec 08 §Roommate page default view, PRD 4
 * FR-1, FR-2, FR-7; the placement and order are an **Assumption**, D68). Only the roommate page of
 * the checker city has the two blocks; `/replacement` and `/sublet` keep the count line and the
 * type tabs and have no selector.
 */
export function roommatePageLayout({
  listingType,
  citySlug,
  cityOfferCount,
  roleState,
  emptyKind,
  hasUsername,
}: RoommatePageLayoutInput): RoommatePageLayout {
  const roommate = listingType === 'roommate';
  const blocksCity = roommate && pageHasFlatmateBlock(citySlug);
  const showFlatmateBlock = blocksCity && showsFlatmateBlock(roleState);
  const noOfferInCity = roommate && cityOfferCount === 0;
  return {
    showFlatmateBlock,
    showRoomMoney: blocksCity && showsRoomMoneyBlock(roleState, emptyKind),
    // "0 listings" is not shown while the city has no offer at all.
    showCountLine: !noOfferInCity,
    showBotButton: showFlatmateBlock && hasUsername,
    selectorAboveTabs: roommate,
    // PRD 4 FR-7 (D82): the roommate page drops the tabs to the frozen listing types while the
    // city has no offer; they come back with the first offer. `/replacement` and `/sublet` keep them.
    showTypeTabs: !noOfferInCity,
    // PRD 4 FR-3: the page's one h1 is the roommate page's; `/replacement` and `/sublet` have none.
    showH1: roommate,
  };
}
