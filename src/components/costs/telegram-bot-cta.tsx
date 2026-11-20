'use client';

import { Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';

import { buttonVariants } from '@/components/ui/button';
import {
  type TelegramBotSource,
  botStartUrl,
  telegramBotOpenedProperties,
} from '@/lib/analytics/telegram-events';
import { cn } from '@/lib/utils';

/**
 * Hands a checker result over to the Telegram bot.
 *
 * This is the site's highest-intent moment — someone just looked up an address
 * they care about — and the bot is the only channel that can come back to them
 * later without an account or an email. Renders nothing until the bot username
 * is configured, so the surface stays inert until the bot is live.
 *
 * An outline button at least 44 px high (PRD 4 FR-14, spec 08 §Checker handoff);
 * `h-auto` and `whitespace-normal` let a long label wrap on a phone instead of
 * overflowing the fixed button height.
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
      className={cn(
        buttonVariants({ variant: 'outline' }),
        'mt-4 h-auto min-h-11 whitespace-normal',
      )}
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

/**
 * The line under the bot button naming what the bot does and in which languages
 * (D63: the deposit letter has no English). The checker renders it after the
 * `onClickCapture` wrapper of the button, never inside it, so a tap on the text
 * fires no `checker_cta_clicked`. Like the button, nothing without the username.
 */
export function TelegramBotHint() {
  const t = useTranslations('checker');
  if (!process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME) return null;
  return <p className="mt-2 text-sm text-muted-foreground">{t('costs.telegramHint')}</p>;
}
