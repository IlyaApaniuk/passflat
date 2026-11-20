import { botStartPayload, type FlatmateSurface } from '@/lib/analytics/telegram-events';

import { type FlatmateBlockCounts, flatmateBlockView } from './flatmate-block';

/**
 * The shared flatmate callout on the cost and content surfaces (spec 08 §Flatmate callout, PRD 4
 * FR-8). Pure: the server component reads this and renders it.
 */

export type FlatmateCalloutView = {
  /** Under `listings`: the thesis sentence on the home page (D48), the question elsewhere. */
  titleKey: 'flatmateCallout.homeTitle' | 'flatmateCallout.title';
  /** As on the roommate page's block: a number, "be among the first" at 0, or no line at all. */
  countLine: 'count' | 'first' | 'none';
  total: number;
  /** The bot button needs `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`; the roommate link always shows. */
  showBotButton: boolean;
  /** The bot button's start payload: `mate_web_<surface>`. */
  payload: string;
  /** `cta_click.placement` of the roommate link. */
  placement: `flatmate_callout_${FlatmateSurface}`;
};

/**
 * What the callout on `surface` shows. `counts` is absent where the caller loads none (static
 * pages, the calculator, a rejected loader) and `unavailable` after a database error: both mean
 * no count line.
 */
export function flatmateCalloutView({
  surface,
  counts,
  hasUsername,
}: {
  surface: FlatmateSurface;
  counts?: FlatmateBlockCounts;
  hasUsername: boolean;
}): FlatmateCalloutView {
  const { countLine, total } = flatmateBlockView(counts, []);
  return {
    titleKey: surface === 'home' ? 'flatmateCallout.homeTitle' : 'flatmateCallout.title',
    countLine,
    total,
    showBotButton: hasUsername,
    payload: botStartPayload(surface),
    placement: `flatmate_callout_${surface}`,
  };
}
