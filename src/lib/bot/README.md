# Telegram bot

Address lookup over the same cost data the website's checker reads. Lives in
this repo, not a separate project: every number it prints comes from
`@/lib/cost-baselines` and `@/lib/location-checker`, so a split would mean
either duplicating that logic or maintaining an API between two deploys.

## Layout

| File                                      | Role                                                            |
| ----------------------------------------- | --------------------------------------------------------------- |
| `bot.ts`                                  | grammY handlers: commands, buttons, rate limit, PostHog events  |
| `lookup.ts`                               | Data: building → district → city fallback, neighbours, deposits |
| `format.ts`                               | Message rendering, deep links with UTM                          |
| `texts.ts`                                | RU/UK copy and Slavic plural agreement                          |
| `store.ts`                                | `TelegramChat` / `TelegramSubscription` persistence             |
| `../../app/api/telegram/webhook/route.ts` | Production entry point                                          |

## Going live

1. **BotFather** — `/newbot`, then keep the token. Set the description and
   about text; the command menu is published by the webhook script.
2. **Google key** — a _server_ Geocoding key. The existing
   `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` is referrer-restricted for the browser
   and will be rejected from a server call. Restrict the new one by IP/API to
   Geocoding and set it as `GOOGLE_GEOCODING_API_KEY`.
3. **Secret** — `openssl rand -hex 32` → `TELEGRAM_WEBHOOK_SECRET`. The webhook
   route rejects any update that does not carry it.
4. **Local run** — put all three in `.env.local`, then `npm run bot:dev`
   (long polling, no tunnel needed).
5. **Deploy** — set the same three plus `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` in
   Vercel, deploy, then `npm run bot:webhook -- https://passflat.com`.
   `npm run bot:webhook -- --delete` goes back to polling.

The production database needs the `telegram_chats` and `telegram_subscriptions`
tables from `prisma/migrations/20260831120000_add_telegram_bot` — run that
migration deliberately, it has not been applied to prod.

Until `TELEGRAM_BOT_TOKEN` is set the webhook route answers 503 and the site's
CTA renders nothing, so merging this changes nothing user-visible.

## Why the answer never says "no data"

Coverage is ~300 buildings; an exact-house hit is the exception. `lookupAddress`
therefore always falls back and reports the level it reached:

- **building** — reports exist for this house.
- **district** — none for the house, so the district median, the typical range,
  the nearest houses that do have data, and the deposit-return rate.
- **city** — the district itself holds fewer than `MIN_AREA_REPORTS` reports
  (today: Rembertów and Wesoła), so the figures widen to Warsaw and the message
  says so rather than passing city numbers off as the district's.

Every non-building answer ends with the "be the first report for this building"
prompt, which is how an uncovered address feeds the north-star metric instead of
being a dead end.

## Events

`tg_bot_started` (with the `?start=` payload — the attribution for which post or
page sent the person), `tg_address_checked` (with `level`, so the district/city
fallback rate is measurable), `tg_address_not_found`, `tg_subscribed`,
`tg_unsubscribed`, `tg_districts_viewed`, `tg_deposit_viewed`.

Distinct id is `tg_<chatId>`, which does not join to web identities — bot and
web funnels stay separate cohorts on purpose.

## Not built yet

Move-mode reminders (signed → protocol, moved in +3d → meters, +6w →
rozliczenie), conversational cost submission, and the push notifier that reads
`TelegramSubscription` and messages chats when new reports land. The
subscriptions accumulate from day one so the notifier has something to send
when it is written.
