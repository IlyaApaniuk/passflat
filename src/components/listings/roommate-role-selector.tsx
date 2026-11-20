'use client';

import { useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import type { RoommateIntent } from '@/lib/analytics/interest-events';
import {
  ROOMMATE_OFFER_HREF,
  chooseRoommateRole,
  reopenRoommateRoles,
  type RoommateRoleState,
} from '@/lib/roommate-roles';

// Two equal columns; the third choice spans the second line on narrow screens and joins the
// first line from `sm`. At 360 px each half is ~160 px, so a long label wraps inside its button
// (`whitespace-normal`) instead of scrolling the row; `min-h-11` keeps every tap target at
// least 44 px high.
const CHOICE_CLASS =
  'h-auto min-h-11 min-w-0 whitespace-normal px-2 py-2 text-center leading-tight';

/** The chip's label for each role that stays on the page. */
const CHOSEN_KEY: Partial<Record<RoommateIntent, string>> = {
  find_room: 'listings.roommateRoles.findChosen',
  find_flatmate: 'listings.roommateRoles.findFlatmate',
};

/**
 * "I'm looking for a room" / "I have a free room" / "Looking for someone to rent with" on
 * `/[city]/roommate` (spec 02 §Role selector, §Find a flatmate). The state lives in
 * `ListingsPageClient`; this component fires `roommate_intent_selected`.
 */
export function RoommateRoleSelector({
  state,
  onStateChange,
  onScrollListToTop,
}: {
  state: RoommateRoleState;
  onStateChange: (state: RoommateRoleState) => void;
  /** Scrolls the list container to its top. */
  onScrollListToTop: () => void;
}) {
  const t = useTranslations();
  const posthog = usePostHog();

  const choose = (intent: RoommateIntent) => {
    const choice = chooseRoommateRole(intent);
    posthog?.capture(choice.event, choice.properties);
    onStateChange(choice.state);
    if (choice.scrollListToTop) onScrollListToTop();
  };

  const chosenKey = state.intent ? CHOSEN_KEY[state.intent] : undefined;
  if (state.collapsed && chosenKey) {
    return (
      <Button
        type="button"
        variant="outline"
        aria-expanded={false}
        onClick={() => onStateChange(reopenRoommateRoles(state))}
        className="h-auto min-h-11 max-w-full whitespace-normal rounded-full px-4 py-2 text-left leading-tight"
      >
        <span>
          {t(chosenKey)} ·{' '}
          <span className="text-primary underline-offset-4 hover:underline">
            {t('listings.roommateRoles.change')}
          </span>
        </span>
      </Button>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Button
        type="button"
        variant="outline"
        onClick={() => choose('find_room')}
        className={CHOICE_CLASS}
      >
        {t('listings.roommateRoles.find')}
      </Button>
      <Button variant="outline" asChild className={CHOICE_CLASS}>
        <Link href={ROOMMATE_OFFER_HREF} onClick={() => choose('offer_room')}>
          {t('listings.roommateRoles.offer')}
        </Link>
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => choose('find_flatmate')}
        className={`${CHOICE_CLASS} col-span-2 sm:col-span-1`}
      >
        {t('listings.roommateRoles.findFlatmate')}
      </Button>
    </div>
  );
}
