import type { RoommateIntent } from '@/lib/analytics/interest-events';

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

/** True when the "Looking for someone to rent with" block shows (the role is chosen). */
export function showsFlatmateBlock(state: RoommateRoleState): boolean {
  return state.intent === 'find_flatmate';
}
