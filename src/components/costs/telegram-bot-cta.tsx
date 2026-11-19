'use client';

import { Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';

import {
  type TelegramBotSource,
  botStartUrl,
  telegramBotOpenedProperties,
} from '@/lib/analytics/telegram-events';

/**
 * Hands a checker result over to the Telegram bot.
 *
 * This is the site's highest-intent moment — someone just looked up an address
 * they care about — and the bot is the only channel that can come back to them
 * later without an account or an email. Renders nothing until the bot username
 * is configured, so the surface stays inert until the bot is live.
 */
export function TelegramBotCta({
  buildingId,
  source,
}: {
  buildingId?: string;
  source: TelegramBotSource;
}) {
  const t = useTranslations('checker');
  const locale = useLocale();
  const posthog = usePostHog();
  const username = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  if (!username) return null;

  // The payload survives /start, so the bot knows which surface sent this
  // person and can subscribe them to the building they were already looking at.
  return (
    <a
      href={botStartUrl(username, source, buildingId)}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      data-locale={locale}
      // Fire-and-forget: no preventDefault, so the link opens exactly as before.
      onClick={() =>
        posthog?.capture('telegram_bot_opened', telegramBotOpenedProperties(source, buildingId))
      }
    >
      <Send className="h-4 w-4" />
      {t('costs.telegramCta')}
    </a>
  );
}
