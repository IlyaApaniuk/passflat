import { getLocale, getTranslations } from 'next-intl/server';

import { botStartUrl, type FlatmateSurface } from '@/lib/analytics/telegram-events';
import type { FlatmateBlockCounts } from '@/lib/roommate/flatmate-block';
import { flatmateCalloutView } from '@/lib/roommate/flatmate-callout';
import { perPersonAmount, perPersonLineValues } from '@/lib/roommate/per-person-line';
import type { PerPersonSplit } from '@/lib/roommate/room-costs';

import { FlatmateCalloutLinks } from './flatmate-callout-links';

/**
 * The shared flatmate callout (spec 08 §Flatmate callout, PRD 4 FR-8, D48): what Passflat does
 * for people renting together, the per-person line where the caller loads the split (spec 08
 * §Per-person line), the bot's languages, the profile count where the caller loads one, a link
 * to the roommate page and, with the bot username set, the bot button. Never renders nothing. A
 * server component: a client page receives it from its server `page.tsx` as a `ReactNode` prop.
 * Not `TelegramBotCta`: that one reads the route-scoped `checker` namespace.
 */
export async function FlatmateCallout({
  surface,
  counts,
  split,
  splitArea,
}: {
  surface: FlatmateSurface;
  /** `loadFlatmateBlockCounts()` on dynamic or ISR pages; absent → no count line. */
  counts?: FlatmateBlockCounts;
  /** `loadWarsawPerPersonSplit()` (or a district's split); absent or null → no per-person line. */
  split?: PerPersonSplit | null;
  /** The split's own area, resolved on the server (`perPersonSplitArea`). */
  splitArea?: string;
}) {
  const t = await getTranslations('listings');
  const username = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const view = flatmateCalloutView({ surface, counts, hasUsername: Boolean(username) });
  const titleId = `flatmate-callout-${surface}-title`;
  const line = perPersonLineValues(split, splitArea);
  const perPerson =
    line &&
    t('flatmateCallout.perPerson', {
      value: perPersonAmount(line.value, await getLocale()),
      count: line.count,
      area: line.area,
    });

  return (
    <section
      aria-labelledby={titleId}
      className="space-y-3 rounded-2xl border bg-primary/5 p-5 text-sm sm:p-6"
    >
      <h2 id={titleId} className="text-lg font-semibold tracking-tight sm:text-xl">
        {t(view.titleKey)}
      </h2>
      {perPerson && <p className="font-medium">{perPerson}</p>}
      <p className="text-muted-foreground">{t('findFlatmate.how')}</p>
      <p className="text-muted-foreground">{t('findFlatmate.languages')}</p>
      {view.countLine === 'count' && (
        <p className="font-medium">{t('findFlatmate.count', { count: view.total })}</p>
      )}
      {view.countLine === 'first' && <p className="font-medium">{t('findFlatmate.first')}</p>}
      <FlatmateCalloutLinks
        surface={surface}
        placement={view.placement}
        roommateLabel={t('flatmateCallout.roommateLink')}
        bot={
          view.showBotButton && username
            ? { href: botStartUrl(username, surface), label: t('findFlatmate.button') }
            : undefined
        }
      />
    </section>
  );
}
