# Telegram bot

Address lookup over the same cost data the website's checker reads. Lives in
this repo, not a separate project: an address answer reads the building's
figures, the area reference and the deposit statistic through the figure
contract's loaders (`@/lib/cost-figures-query`), the ones the checker and the
building page read, and `format.ts` shows them by group with each figure's N,
as the checker does. The typed-district answer reads the same contract
(`getDistrictBySlug` → `loadAreaReference`: the district from five reports,
else the city, said so first). The neighbours, the `/districts` table and the
district's `tg_district_checked.report_count` show one number per item by D23:
the tenant group when it has a usable value, else the asking prices, labelled
with the group and its N (`neighbourFigure` in `@/lib/location-checker`, the
checker's pin rule; `loadDistrictFigures` for districts). A rank line appears
only inside a `comparableRanks` rank (`districtRank`), so never under the bot's
`all` filter; the table is a display order with no positions. A split would
mean either duplicating that logic or maintaining an API between two deploys.

## Production status

Built, **not launched**. Do not describe the bot as live anywhere. As last
recorded (2026-10-05), and unknown since then until the owner confirms:

- the four bot migrations (see "Going live") are not applied to the
  production database;
- `TELEGRAM_BOT_TOKEN` is not set in production and the production webhook is
  not registered (`npm run bot:webhook`);
- whether `TELEGRAM_WEBHOOK_SECRET`, `GEOCODING_API_SERVER_KEY`,
  `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` and `ANTHROPIC_API_KEY` are set in
  Vercel is not recorded.

What the code does in that state: without `TELEGRAM_BOT_TOKEN` the webhook
route answers 503 and the follow-ups cron sends nothing; without
`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` the website's bot link
(`components/costs/telegram-bot-cta.tsx`) renders nothing. The cron still runs
`clearStaleLetterParties()` on `deposit_cases` first, so it would fail while
the migrations are missing (`docs/architecture.md` §9).

## What is implemented

- **Address check**: a typed address is geocoded (`geocode.ts`) and answered at
  building, district or city level (see "Why the answer never says 'no
  data'"). An address outside Warsaw offers the city waitlist.
- **District check**: a typed district name (matched before geocoding,
  `districts.ts`) or a `d_<slug>` link answers with the district card.
- **Building link**: `b_<uuid>` opens that building's card, as if its address
  had been typed.
- **`/districts`**: each district's single number with its group and N
  (`getDistrictTable`), all-in totals first, then by value; no rank.
- **Saved interests**: the building and district buttons and the city waitlist
  button save a `TelegramSubscription`; `/my` lists them with remove buttons.
  Saved interest sends nothing (see "Promises and capabilities").
- **Deposit helper** ("Верни залог"): five questions, contract reading, a
  rule-based verdict, a Polish demand letter, reminders and outcome questions
  (see "Deposit recovery").
- **`/cancel`**: leaves the deposit questions and turns off pending reminders.
- **`/deposit`**, **`/help`**, **`/lang`** (RU / UK; `TelegramChat.locale`
  defaults to `ru`).
- A rate limit of 12 text messages per minute per chat (`bot.ts`), because
  geocoding is paid.

## Layout

| File                                             | Role                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `bot.ts`                                         | grammY handlers: commands, buttons, rate limit, PostHog events     |
| `start-payload.ts`                               | `/start` payload parsing, `ENTRY_SOURCE` values                    |
| `lookup.ts`                                      | Data: building → district → city fallback, neighbours, deposits    |
| `geocode.ts`, `districts.ts`                     | Server geocoding of typed addresses; district-name matching        |
| `format.ts`                                      | Message rendering, links to the website with UTM                   |
| `texts.ts`                                       | RU/UK copy, capability list, command menu, Slavic plural agreement |
| `store.ts`                                       | `TelegramChat` / `TelegramSubscription` persistence                |
| `analytics.ts`, `check-events.ts`                | `track` (`tg_<chatId>`); check-event properties                    |
| `deposit-flow.ts`                                | Deposit conversation, reminders (`sendDueFollowUps`), `/cancel`    |
| `deposit.ts`, `deposit-texts.ts`                 | Deposit rules, verdict and Polish letter; RU/UK deposit copy       |
| `contract.ts`                                    | Lease reading with Claude                                          |
| `../../app/api/telegram/webhook/route.ts`        | Production entry point                                             |
| `../../app/api/cron/telegram-followups/route.ts` | Daily reminders and clean-up                                       |

## Going live

1. **BotFather** — `/newbot`, then keep the token. Set the description and
   about text; the command menu is published by the webhook script
   (`COMMAND_MENU` in `texts.ts`: RU by default, UK for `language_code: 'uk'`).
   A menu change takes effect only after `npm run bot:webhook` is run again.
2. **Google key** — a _server_ Geocoding key. The existing
   `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` is referrer-restricted for the browser
   and will be rejected from a server call. Restrict the new one by IP/API to
   Geocoding and set it as `GEOCODING_API_SERVER_KEY`.
3. **Secret** — `openssl rand -hex 32` → `TELEGRAM_WEBHOOK_SECRET`. When it is
   set, the webhook route rejects (403) any update whose
   `x-telegram-bot-api-secret-token` header does not match. When it is unset
   the route accepts every update (`if (secret && …)` in `route.ts`), so it
   must be set in Vercel. `npm run bot:webhook` refuses to register the
   webhook without it.
4. **Local run** — put all three in `.env.local`, then `npm run bot:dev`
   (long polling, no tunnel needed).
5. **Deploy** — set the same three plus `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` in
   Vercel, deploy, then `npm run bot:webhook -- https://passflat.com`.
   `npm run bot:webhook -- --delete` goes back to polling.

The production database needs five migrations, none applied to prod (the
first four as of 2026-10-05) — run them deliberately: `20260831120000_add_telegram_bot`
(`telegram_chats`, `telegram_subscriptions`),
`20261004120000_telegram_subscription_label`, `20261005120000_deposit_cases`
and `20261005140000_deposit_contract`, then PRD 3's `20261119122602_roommate_matching`
(`roommate_profiles`, `roommate_reactions`, `roommate_reports`,
`telegram_chats.roommate_banned_at`): `touchChat` updates a known chat without a
`select`, so Prisma reads the new column and the bot fails without it. Enable
RLS on the new tables by hand.
The deposit flow's contract step also needs `ANTHROPIC_API_KEY`.

## Deep links

`https://t.me/<bot>?start=<payload>`. Telegram allows at most 64 characters of
`[A-Za-z0-9_-]`; anything else opens nothing (`parseStartPayload` in
`start-payload.ts`).

| Payload        | Sent by                                                | Opens                                                                          |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| (none)         | a plain bot link                                       | the `start` reply with the capability list                                     |
| `dep`          | posts under "they won't return my deposit"; share link | the deposit questions                                                          |
| `b_<uuid>`     | the website checker, when it has a building            | that building's card; a malformed or unknown id gets "send its address"        |
| `d_<slug>`     | hand-made links (posts, chats)                         | the district card; saves nothing; an unknown slug gets the `startAfterPayload` |
| `web_<source>` | the website's bot link without a building              | the `startAfterPayload` reply; attribution only                                |
| anything else  | campaign tags such as `thr_med`                        | the `startAfterPayload` reply; attribution only                                |

The website sends `web_checker` and `web_empty` (`TelegramBotSource` in
`src/lib/analytics/telegram-events.ts`). Every payload is attribution: the raw
string is `tg_bot_started.payload`, and the first one a chat brings is kept in
`TelegramChat.startPayload` (a later `/start` does not overwrite it). Both keep
the raw string only when it has a deep link's shape (`[A-Za-z0-9_-]{1,64}`);
anything else can only be text typed after `/start` and is recorded as
`invalid` (`recordedStartPayload` in `start-payload.ts`).

`parseStartPayload` also reads PRD 3's `mate` links (`mate`, `mate_<source>`,
`mate_<source>_<detail>`; sources in `ROOMMATE_ENTRY_SOURCE`). Until the
roommate entry is built they get the `startAfterPayload` reply.

The building link `b_<uuid>` builds the same answer as typing that building's
address: `lookupBuilding` and `lookupAddress` share one function in
`lookup.ts`, read-only. A building without coordinates answers with the city
reference. An unknown, deleted or out-of-city id, or a malformed one (never
looked up), gets a short "send its address" reply; a database error gets
`genericError`. An open deposit intake stays open, and the reply says `/cancel`
leaves it.

The district link `d_<slug>` answers like typing the district's name: the
district card with its save-interest button (`sub:d:<slug>`). Opening the link
saves nothing; a `TelegramSubscription` is created only by a button tap
(`handleSubscribe`).

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

## Links to the website

Every link the bot sends carries `utm_source=telegram`, `utm_medium=bot` and a
`utm_campaign` (`webLink` / `submitLink` in `format.ts`), and nothing that names
the chat. The cost-form button (`submitLink`) adds `source=tgbot`, which the
form accepts as `cost_form_started`'s `source` (`src/lib/cost-submit-params.ts`),
plus `b=<buildingId>` whenever the lookup found a building row (at any level)
and `p=<placeId>` as before. The form prefills only from an existing building,
`b` first, and the bot never creates one, so an address without a row opens the
form empty. The district card's and `/deposit`'s cost-form buttons use
`webLink` (UTM only, no `source`), so their `cost_form_started` says `direct`.

## Promises and capabilities

The bot sends nothing on its own except the deposit reminders a person asked
for. Saved interest sends nothing: the building and district buttons and the
city waitlist button save a `TelegramSubscription`, the reply says there are no
automatic notifications, and no code reads those rows to send a message (only
`/my` lists them, with a remove button each, `unsub:<targetKey>`). `start`,
`startAfterPayload` and `/help` share one capability list in `texts.ts`
(address or district check, `/districts`, `/deposit`, `/my`, `/lang`,
`/cancel`), and `COMMAND_MENU` names the same commands. `texts.test.ts` fails if
a text in `texts.ts` promises to write later.

## Events

Every event goes through `track` (`analytics.ts`) to PostHog as a server event
with distinct id `tg_<chatId>` and `source: 'telegram_bot'`, plus the
properties below. The distinct id does not join to web identities: bot and web
funnels stay separate cohorts on purpose. `docs/analytics/activation-funnels.md`
holds the bot funnels.

| Event                         | Sent when                                     | Properties                                                                                                                                                                                                         |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tg_bot_started`              | `/start`, with or without a payload           | `payload` (the raw payload when it has a deep link's shape, `invalid` for typed text, or null), `is_new` (first time the chat is seen)                                                                             |
| `tg_address_checked`          | an address card is sent (typed or `b_` link)  | `level` (`building` \| `district` \| `city`), `district` (slug), `has_building`, `report_count`, `entry_source` (`typed_address` \| `link_building`), `lookup_level` (= `level`), `source_kind`, `n`, `incomplete` |
| `tg_address_not_found`        | geocoding found nothing                       | none                                                                                                                                                                                                               |
| `tg_address_outside_city`     | the address is outside the checker city       | `city` (the geocoded city name); absent when geocoding resolved no city                                                                                                                                            |
| `tg_district_checked`         | a district card is sent (typed or `d_` link)  | `district` (slug), `report_count`, `entry_source` (`typed_district` \| `link_district`), `source_kind`, `n`, `incomplete`                                                                                          |
| `tg_districts_viewed`         | `/districts`, or its button                   | `via: 'button'` from the button; none from the command                                                                                                                                                             |
| `tg_city_requested`           | the city waitlist button                      | `city`, `city_key` (`c:<slug>`), `waiting` (chats waiting, this one included), `already`                                                                                                                           |
| `tg_subscribed`               | a save-interest button                        | `target` (`building` \| `district`), `district` (slug, district only), `already`                                                                                                                                   |
| `tg_unsubscribed`             | a remove button in `/my`                      | none                                                                                                                                                                                                               |
| `tg_deposit_viewed`           | `/deposit`                                    | none                                                                                                                                                                                                               |
| `tg_deposit_offered`          | a message names a deposit and holds no digits | none                                                                                                                                                                                                               |
| `tg_deposit_flow_started`     | the deposit questions start                   | none                                                                                                                                                                                                               |
| `tg_deposit_contract`         | a contract reading ends                       | `result` (`read` \| `not_lease` \| `failed`); on `read` also `pages`, `own_term`, `renovation`, `cleaning`, `landlord`, `type`                                                                                     |
| `tg_deposit_verdict`          | the verdict is sent                           | `reason`, `protocol`, `strength` (`strong` \| `medium` \| `weak` \| `lawful`), `overdue`, `claim` (zł), `contract` (`skipped` \| `done` \| `failed`), `deadline_source`                                            |
| `tg_deposit_letter_generated` | the letter button                             | `reason`, `filled` (the parties were read from the contract)                                                                                                                                                       |
| `tg_deposit_letter_sent`      | the "I sent the letter" button                | none                                                                                                                                                                                                               |
| `tg_deposit_reminder_set`     | the "remind me on the deadline" button        | none                                                                                                                                                                                                               |
| `tg_deposit_outcome`          | an outcome button under a reminder            | `outcome` (`full` \| `partial` \| `none`), `after` (`deadline` \| `letter`)                                                                                                                                        |
| `tg_lawyer_interest`          | the "I want a lawyer" button                  | `claim` (deposit minus returned, zł, or null)                                                                                                                                                                      |

The check events say how the card was reached and how well it answered. Both are
built by pure functions in `check-events.ts` over the shared `answerProperties`
(the website's `address_checked` uses the same definition): `source_kind` is
`tenant` | `mixed` | `asking` | `none`, `n` is the headline metric's N (tenant
group first) and `incomplete` says that headline is a known-part total.
`replyCard` is the one place `tg_address_checked` is sent, so a `b_` link fires
it once; `replyDistrict` is the one place for `tg_district_checked`, which
describes the district's reference (the city's below `MIN_AREA_REPORTS`). The
`entry_source` values are the `ENTRY_SOURCE` constant in `start-payload.ts`.

No bot event carries the text a person typed (D32): `tg_address_not_found` and
`tg_address_outside_city` send no `query`, and `city` is the geocoded city name,
never the typed address. No property holds free text, a person's name, contract
text or the chat id (which is only in the distinct id). A new event adds no
free text either.

Events are flushed before the function ends: the webhook route registers
`flushPostHog` with `after()` and the follow-ups cron awaits it. The contract
reading runs in its own `after()` task (`runInBackground` in `deposit-flow.ts`),
concurrently with the route's flush, so that task awaits `flushPostHog` itself
once it settles, also when it fails: the `tg_deposit_contract` and
`tg_deposit_verdict` it tracks at its end are delivered.

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
   different serverless instances. Starting again abandons the chat's open
   cases and clears their reminder dates.
2. A rule-based verdict (`deposit.ts`): the deadline counted per KC art. 112,
   ordinary wear per KC art. 675 § 1, unpaid bills as a lawful deduction.
   Deliberately not generated — same facts, same answer.
3. A wezwanie do zapłaty in Polish with placeholders for names, addresses and
   the bank account, which the bot never asks for.
4. Reminders and outcome questions (below). The outcome answers (full /
   partial / none) and `wants_lawyer` are the deposit statistic and the demand
   signal for a lawyer partnership. No legal service exists yet: the button
   says so, and the confirmation (`lawyerAck`) promises no reply, date or
   consultation (FR-45, D27). The tap sets `wantsLawyer` and sends
   `tg_lawyer_interest`; it never changes the case's outcome.

### Reminders

Two reminders work, both sent by `/api/cron/telegram-followups` (daily, 09:00
UTC, `sendDueFollowUps`), each with the outcome buttons (full / partial /
none):

- **Deadline**: on the landlord's deadline. Offered under the verdict only
  while at least one day is left before it.
- **Letter**: 8 days after the "I sent the letter" tap (the letter's 7 days
  plus one for delivery, `LETTER_FOLLOW_UP_DAYS`).

Reminders are opt-in: a date is set only by the "remind me" or "I sent the
letter" tap. `sendDueFollowUps` claims each due row before sending (clears
`followUpAt` with a conditional `updateMany` on the value it read, and sends
only when that updated one row), so overlapping cron runs send once. A failed
send restores the date and the next run retries; a 403 marks the chat blocked,
and the cron skips blocked chats (a later message from the chat clears the
mark). Delivery is at most once: a crash between the
claim and the send loses that reminder. `/cancel` abandons an open intake and
clears `followUpAt` (not `followUpKind`, which the outcome buttons of sent
reminders read) on the chat's `verdict` and `letter_sent` cases, replying
`remindersOff`.

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
- A failed read or a non-lease falls back to the verdict without the contract,
  worded as the law's general rule (FR-43, below).

### General-rule cases (FR-43)

When the contract could not be read or is not a lease, or the reason is
`other`, `renderVerdict` uses the header «Общее правило» / «Загальне правило»,
leaves out the strength phrase of each rule (`strength*` keys; the `rule*`
explanation stays), adds the "not a conclusion about your contract" sentence
for an unread contract or a non-lease, and ends with the disputed-sums line
(`disputedSum`: a lawyer or nieodpłatna pomoc prawna). A returned amount above
the deposit gets no verdict and no letter: `returnedAboveDeposit` plus
`disputedSum`, case `resolved` with no outcome. The deadline, the rules and the
letter do not change, and `tg_deposit_verdict` still reports the rule's
`strength`.

Legal wording was checked against the consolidated statute texts (October
2026); it should still be read by a Polish lawyer before wide promotion. The
scenario list for that review, with every case the code distinguishes and the
statute references as written in the code, is
`docs/legal-review/deposit-scenarios.md`; update it when a rule or a verdict
text changes.
