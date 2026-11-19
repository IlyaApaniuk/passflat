import type { RoommateIntent } from '@/lib/analytics/interest-events';

/**
 * The two-role selector on `/[city]/roommate` (spec 02 §Role selector, FR-14, FR-3). The state
 * is client state of `ListingsPageClient` only: nothing is stored, choosing is never required.
 */
export interface RoommateRoleState {
  /** The last role chosen on this page view; passed to `ListingsEmptyState`. */
  intent?: RoommateIntent;
  /** True when the two choices are folded into the "Looking for a room · change" chip. */
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
  /** `find_room` scrolls the list container to its top; `offer_room` navigates away instead. */
  scrollListToTop: boolean;
}

/** What one click on a choice does: one `roommate_intent_selected` with `intent`, nothing else. */
export function chooseRoommateRole(intent: RoommateIntent): RoommateRoleChoice {
  const findRoom = intent === 'find_room';
  return {
    state: { intent, collapsed: findRoom },
    event: 'roommate_intent_selected',
    properties: { intent },
    scrollListToTop: findRoom,
  };
}

/** The chip reopens the two choices and keeps the chosen intent (no event). */
export function reopenRoommateRoles(state: RoommateRoleState): RoommateRoleState {
  return { ...state, collapsed: false };
}
