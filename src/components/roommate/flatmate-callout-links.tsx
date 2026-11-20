'use client';

import { Send } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';

import { TrackedLink } from '@/components/analytics/tracked-link';
import { Button } from '@/components/ui/button';
import { type FlatmateSurface, telegramBotOpenedProperties } from '@/lib/analytics/telegram-events';

/** The roommate page every callout leads to (the checker city, spec 08 §Flatmate callout). */
export const FLATMATE_CALLOUT_ROOMMATE_PATH = '/warsaw/roommate';

/**
 * The two links of `FlatmateCallout`. Client-side only for `usePostHog`, and it reads **no**
 * message namespace: the server callout resolves both labels, so the callout also renders under
 * route-scoped providers such as the calculator's (`calculator`, `common`, `share` only).
 */
export function FlatmateCalloutLinks({
  surface,
  placement,
  roommateLabel,
  bot,
}: {
  surface: FlatmateSurface;
  /** `cta_click.placement` of the roommate link (`flatmate_callout_<surface>`). */
  placement: string;
  roommateLabel: string;
  /** Absent without `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`: then only the roommate link shows. */
  bot?: { href: string; label: string };
}) {
  const posthog = usePostHog();

  return (
    <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
      {bot && (
        <Button asChild className="h-auto min-h-11 whitespace-normal">
          <a
            href={bot.href}
            target="_blank"
            rel="noopener noreferrer"
            // Fire-and-forget: no preventDefault, so the link opens as usual.
            onClick={() =>
              posthog?.capture('telegram_bot_opened', telegramBotOpenedProperties(surface))
            }
          >
            <Send className="h-4 w-4" />
            {bot.label}
          </a>
        </Button>
      )}
      <Button
        asChild
        variant={bot ? 'outline' : 'default'}
        className="h-auto min-h-11 whitespace-normal"
      >
        <TrackedLink href={FLATMATE_CALLOUT_ROOMMATE_PATH} placement={placement}>
          {roommateLabel}
        </TrackedLink>
      </Button>
    </div>
  );
}
