'use client';

import { Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';

import { Button } from '@/components/ui/button';
import { botStartUrl, telegramBotOpenedProperties } from '@/lib/analytics/telegram-events';
import { type FlatmateBlockCounts, flatmateBlockView } from '@/lib/roommate/flatmate-block';
import { perPersonAmount, perPersonLineValues } from '@/lib/roommate/per-person-line';
import type { PerPersonSplit } from '@/lib/roommate/room-costs';

/**
 * "Looking for someone to rent with?" on `/warsaw/roommate` (spec 02 §Find a flatmate, PRD 3
 * FR-21): the per-person line under the title (spec 08 §Per-person line), who already has a
 * profile, how matching works in the bot, the bot's languages and a button into the bot's
 * roommate entry. Not `TelegramBotCta`: that one reads the `checker` namespace, which this route
 * does not receive; these keys live in `listings`. Never renders nothing (PRD 4 FR-2): until
 * the bot username is configured it shows the title, how it works and the languages, then "the
 * bot is not connected yet", with no count line and no button.
 */
export function FindFlatmateBlock({
  counts,
  districts,
  split,
  splitArea,
}: {
  /** Loaded only with a configured bot; absent or `unavailable` → no count line. */
  counts?: FlatmateBlockCounts;
  /** The city's districts as the listings district filter names them. */
  districts: readonly { slug: string; name: string }[];
  /** `loadWarsawPerPersonSplit()`; absent or null → no per-person line. */
  split?: PerPersonSplit | null;
  /** The split's own area, resolved on the server (`perPersonSplitArea`). */
  splitArea?: string;
}) {
  const t = useTranslations('listings.findFlatmate');
  // Flat keys under each scoped translator (the roommate page's namespace check).
  const tCallout = useTranslations('listings.flatmateCallout');
  const locale = useLocale();
  const posthog = usePostHog();
  const username = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  // No counts without a bot to join, even if some were passed.
  const view = flatmateBlockView(username ? counts : undefined, districts);
  // The cost figure needs no bot: it shows whenever the rule has one.
  const line = perPersonLineValues(split, splitArea);

  return (
    <section
      aria-labelledby="find-flatmate-title"
      className="mb-4 space-y-3 rounded-lg border bg-primary/5 p-4 text-sm"
    >
      <h2 id="find-flatmate-title" className="text-base font-semibold">
        {t('title')}
      </h2>
      {line && (
        <p className="font-medium">
          {tCallout('perPerson', {
            value: perPersonAmount(line.value, locale),
            count: line.count,
            area: line.area,
          })}
        </p>
      )}
      {view.countLine === 'count' && (
        <p className="font-medium">{t('count', { count: view.total })}</p>
      )}
      {view.countLine === 'first' && <p className="font-medium">{t('first')}</p>}
      {view.districts.length > 0 && (
        <div>
          <p className="text-muted-foreground">{t('topLabel')}</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {view.districts.map((district) => (
              <li key={district.slug}>
                {t('topItem', { name: district.name, count: district.count })}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-muted-foreground">{t('how')}</p>
      <p className="text-muted-foreground">{t('languages')}</p>
      {username ? (
        <Button asChild className="h-auto min-h-11 whitespace-normal">
          <a
            href={botStartUrl(username, 'roommate')}
            target="_blank"
            rel="noopener noreferrer"
            // Fire-and-forget: no preventDefault, so the link opens as usual.
            onClick={() =>
              posthog?.capture('telegram_bot_opened', telegramBotOpenedProperties('roommate'))
            }
          >
            <Send className="h-4 w-4" />
            {t('button')}
          </a>
        </Button>
      ) : (
        <p className="font-medium">{t('notConnected')}</p>
      )}
    </section>
  );
}
