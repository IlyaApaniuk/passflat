# Telegram bot

Address lookup over the same cost data the website's checker reads. Lives in
this repo, not a separate project: an address answer reads the building's
figures, the area reference and the deposit statistic through the figure
contract's loaders (`@/lib/cost-figures-query`), the ones the checker and the
building page read, and `format.ts` shows them by group with each figure's N,
as the checker does. The neighbours' single number (`@/lib/location-checker`),
the `/districts` table and the typed-district answer (`@/lib/cost-baselines`)
stay as they are until Q-2. A split would mean either duplicating that logic or
maintaining an API between two deploys.

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
   about text; the command menu is published by the webhook script
   (`COMMAND_MENU` in `texts.ts`: RU by default, UK for `language_code: 'uk'`).
   A menu change takes effect only after `npm run bot:webhook` is run again.
2. **Google key** — a _server_ Geocoding key. The existing
   `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` is referrer-restricted for the browser
   and will be rejected from a server call. Restrict the new one by IP/API to
   Geocoding and set it as `GEOCODING_API_SERVER_KEY`.
3. **Secret** — `openssl rand -hex 32` → `TELEGRAM_WEBHOOK_SECRET`. The webhook
   route rejects any update that does not carry it.
4. **Local run** — put all three in `.env.local`, then `npm run bot:dev`
   (long polling, no tunnel needed).
5. **Deploy** — set the same three plus `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` in
   Vercel, deploy, then `npm run bot:webhook -- https://passflat.com`.
   `npm run bot:webhook -- --delete` goes back to polling.

The production database needs four migrations, none applied to prod yet —
run them deliberately: `20260831120000_add_telegram_bot` (`telegram_chats`,
`telegram_subscriptions`), `20261004120000_telegram_subscription_label`,
`20261005120000_deposit_cases` and `20261005140000_deposit_contract`. Enable
RLS on the new tables by hand. The deposit flow's contract step also needs
`ANTHROPIC_API_KEY`.

## City waitlist

An address outside Warsaw gets a one-tap "📌 waiting for <city>" button instead
of a dead end. It is stored as a subscription with `targetKey = "c:<slug>"`
(spellings collapse: Kraków / Краков / krakow → `krakow`), so the demand is
counted per city. The reply says there is no automatic launch message yet.
Which city to open next:

```sql
select city_slug, max(label) as city, count(*) as waiting
from telegram_subscriptions
where target_key like 'c:%'
group by city_slug
order by waiting desc;
```

Email requests from the landing form live separately in `city_notify_subscriptions`.

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

The website checker's link `?start=b_<buildingId>` opens that building at once:
`lookupBuilding` builds the same answer as typing its address (one shared
function in `lookup.ts`, read-only). A building without coordinates answers with
the city reference. An unknown, deleted or out-of-city id, or a malformed one
(never looked up), gets a short "send its address" reply; a database error gets
`genericError`. An open deposit intake stays open, and the reply says `/cancel`
leaves it.

A district link `?start=d_<slug>` answers like typing the district's name: the
district card with its save-interest button (`sub:d:<slug>`). Opening the link
saves nothing; a `TelegramSubscription` is created only by a button tap
(`handleSubscribe`). An unknown slug gets the generic start reply.

## Links to the website

Every link the bot sends carries `utm_source=telegram`, `utm_medium=bot` and a
`utm_campaign` (`webLink` / `submitLink` in `format.ts`), and nothing that names
the chat. The cost-form button (`submitLink`) adds `source=tgbot`, which the
form accepts as `cost_form_started`'s `source` (`src/lib/cost-submit-params.ts`),
plus `b=<buildingId>` whenever the lookup found a building row (at any level)
and `p=<placeId>` as before. The form prefills only from an existing building,
`b` first, and the bot never creates one, so an address without a row opens the
form empty.

## Promises and capabilities

The bot sends nothing on its own except the deposit follow-ups a person asked
for. Building and district buttons save an interest (`TelegramSubscription`) and
the reply says there are no automatic notifications; `/my` lists the saved
interests with a remove button each (`unsub:<targetKey>`). `start`,
`startAfterPayload` and `/help` share one capability list in `texts.ts`
(address or district check, `/districts`, `/deposit`, `/my`, `/lang`,
`/cancel`), and `COMMAND_MENU` names the same commands. `texts.test.ts` fails if
a text in `texts.ts` promises to write later.

## Events

`tg_bot_started` (with the `?start=` payload — the attribution for which post or
page sent the person), `tg_address_checked` (with `level`, so the district/city
fallback rate is measurable), `tg_address_not_found`, `tg_subscribed`,
`tg_unsubscribed`, `tg_districts_viewed`, `tg_deposit_viewed`.

The check events say how the card was reached and how well it answered. Both are
built by pure functions in `check-events.ts` over the shared `answerProperties`
(the website's `address_checked` uses the same definition):

- `tg_address_checked`: `level`, `district`, `has_building`, `report_count`,
  `entry_source` (`typed_address` | `link_building`), `lookup_level` (= `level`),
  `source_kind` (`tenant` | `mixed` | `asking` | `none`), `n` (the headline
  metric's N, tenant group first) and `incomplete` (that headline is a known-part
  total). `replyCard` is the one place it is sent, so a `b_` link fires it once.
- `tg_district_checked`: `district`, `report_count` and `entry_source`
  (`typed_district` | `link_district`), `source_kind`, `n`, `incomplete` of the
  district's reference (the city's below `MIN_AREA_REPORTS`). Sent only by
  `replyDistrict`.

The `entry_source` values are the `ENTRY_SOURCE` constant in `start-payload.ts`.
No check event carries free text; `tg_address_not_found` and
`tg_address_outside_city` still send the typed `query` (Q-15).

Events are flushed before the function ends: the webhook route registers
`flushPostHog` with `after()` and the follow-ups cron awaits it.

Distinct id is `tg_<chatId>`, which does not join to web identities — bot and
web funnels stay separate cohorts on purpose.

## Not built yet

Move-mode reminders (signed → protocol, moved in +3d → meters, +6w →
rozliczenie), conversational cost submission, and the push notifier that reads
`TelegramSubscription` and messages chats when new reports land. Saved
interests accumulate meanwhile; the copy must change again if a notifier is
ever built.

## Deposit recovery ("Верни залог")

Entry points: the word "залог"/"застава"/"kaucja" in a message, the button
under `/deposit`, or the deep link `?start=dep` — the one to paste under
"they won't return my deposit" questions in chats.

1. Five questions (move-out date, deposit, returned, reason, handover
   protocol) — state in `DepositCase`, because webhook calls land on
   different serverless instances.
2. A rule-based verdict (`deposit.ts`): the deadline counted per KC art. 112,
   ordinary wear per KC art. 675 § 1, unpaid bills as a lawful deduction.
   Deliberately not generated — same facts, same answer.
3. A wezwanie do zapłaty in Polish with placeholders for names, addresses and
   the bank account, which the bot never asks for.
4. Follow-ups from `/api/cron/telegram-followups` (daily, 09:00 UTC): on the
   landlord's deadline, and 8 days after the letter. The outcome answers
   (full / partial / none) and `wants_lawyer` are the deposit statistic and
   the demand signal for a lawyer partnership.

Outcomes by reason:

```sql
select reason, outcome, count(*), sum(deposit_amount - coalesce(returned_amount, 0)) as claimed
from deposit_cases
where outcome is not null
group by reason, outcome
order by reason, outcome;
```

### Reading the contract (`contract.ts`)

After the five questions the bot asks for the lease (PDF, or photos of the
pages followed by "done"). Claude (`claude-opus-5-5`, structured output, server
fallback on refusal) extracts what the statute leaves to the contract — its own
return deadline, whether repainting is on the tenant, whether cleaning is
required — plus the landlord type and the parties. Measured on a test lease:
6–11 s, roughly $0.10–0.15 per contract.

- The reading runs after the webhook response (`next/server` `after`), because
  Telegram retries slow webhooks; the person first gets "reading…".
- Files are never stored: only Telegram file ids until reading, then cleared.
  Names and addresses are kept in `letter_parties` only until the letter is
  generated, and the daily cron clears any left after three days.
- A failed read or a non-lease falls back to the verdict without the contract.

Legal wording was checked against the consolidated statute texts (October
2026); it should still be read by a Polish lawyer before wide promotion.
