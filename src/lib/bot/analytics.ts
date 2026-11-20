import { trackServerEvent } from '@/lib/posthog-server';

/**
 * Bot events go to PostHog under `tg_<chatId>`, which deliberately does not
 * join to web identities: bot and web funnels stay separate cohorts.
 */
export function track(chatId: number, event: string, properties?: Record<string, unknown>) {
  trackServerEvent(`tg_${chatId}`, event, { source: 'telegram_bot', ...properties });
}
