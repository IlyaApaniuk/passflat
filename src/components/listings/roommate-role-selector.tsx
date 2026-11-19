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

// One row of two equal buttons: at 360 px each half is ~160 px, so a long label wraps inside
// its button (`whitespace-normal`) instead of scrolling the row; `min-h-11` keeps every tap
// target at least 44 px high.
const CHOICE_CLASS =
  'h-auto min-h-11 min-w-0 whitespace-normal px-2 py-2 text-center leading-tight';

/**
 * "I'm looking for a room" / "I have a free room" on `/[city]/roommate` (spec 02 §Role selector).
 * The state lives in `ListingsPageClient`; this component fires `roommate_intent_selected`.
 */
export function RoommateRoleSelector({
  state,
  onStateChange,
  onFindRoom,
}: {
  state: RoommateRoleState;
  onStateChange: (state: RoommateRoleState) => void;
  /** Scrolls the list container to its top. */
  onFindRoom: () => void;
}) {
  const t = useTranslations();
  const posthog = usePostHog();

  const choose = (intent: RoommateIntent) => {
    const choice = chooseRoommateRole(intent);
    posthog?.capture(choice.event, choice.properties);
    onStateChange(choice.state);
    if (choice.scrollListToTop) onFindRoom();
  };

  if (state.collapsed) {
    return (
      <Button
        type="button"
        variant="outline"
        aria-expanded={false}
        onClick={() => onStateChange(reopenRoommateRoles(state))}
        className="h-auto min-h-11 max-w-full whitespace-normal rounded-full px-4 py-2 text-left leading-tight"
      >
        <span>
          {t('listings.roommateRoles.findChosen')} ·{' '}
          <span className="text-primary underline-offset-4 hover:underline">
            {t('listings.roommateRoles.change')}
          </span>
        </span>
      </Button>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
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
    </div>
  );
}
