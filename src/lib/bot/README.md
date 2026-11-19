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
- **Roommate entry** (PRD 3, spec 06): `/mate`, the "Find someone to rent with"
  button (`rm:start`) under the `start` and `startAfterPayload` replies, and `mate`
  links all call `openRoommate` (`roommate-flow.ts`): a banned chat or a hidden
  profile gets the FR-14 reply (with "Delete my profile" while the profile
  exists), a saved profile its own card, a draft its current step again, an open
  deposit intake a "/cancel" line; otherwise a new draft, one
  `tg_roommate_flow_started`, the intro and the districts step. One intake is open
  per chat: the deposit questions do not start while a roommate draft or edit
  step is open, and the other way round. Typed text goes to an open roommate
  step that takes text first (a district name at the districts step, an amount
  at the budget step, any text at the short-text step); at a button-only step,
  or for text the step cannot read, it is answered as usual plus the "/cancel
  leaves the roommate questions" line.
  Every roommate handler stores the Telegram username on the profile when it
  changed.
- **Roommate intake, steps 1 – 9** (spec 06 §Intake steps): districts
  (`rm:d:<slug>:<1|0>` carries the target state and edits the keyboard in place,
  up to 3 or `rm:d:any`, then `rm:d:done`), budget per person (`rm:b:<b1..b5>` or
  a typed amount through `bandForAmount`), move-in month (four
  `rm:m:<YYYY-MM>` buttons from `moveInMonthOptions`, Warsaw time), languages
  (`rm:l:<pl|en|ru|uk>:<1|0>` like the districts, the chat's language ticked in
  advance, `rm:l:done` needs one), own gender (`rm:g:<woman|man|skip>`, skip keeps
  null), "live with" (`rm:p:<anyone|women|men>`), the short text (typed, through
  `checkAboutText` in `../roommate/text-filter.ts`: a contact or more than 280
  characters is refused with a reply naming what was found and the step stays
  open; blank text or `rm:t:skip` stores null), smoking
  (`rm:s:<no|outside|fine|skip>`) and pets (`rm:pt:<no|have|fine|skip>`), skip
  storing null, then 18+ (`rm:a:<yes|no>`); gender, "live with" and the short
  text are never put into an event. A button
  whose step has moved on gets "this step is done" and the current step; a step
  advances only through `advanceStep` (`updateMany where { id, step }`), so a
  double tap or a redelivered update moves it once. The intake order is
  `INTAKE_STEPS` in `../roommate/rules.ts`.
- **Save and the own card** (spec 06 §Save and the own card): "I'm 18+" saves
  through `saveProfile` (`updateMany where { id, status: 'draft' }`: active,
  `activated_at`, `adult_confirmed_at`, `expires_at` from `computeExpiresAt`), and
  only the tap whose write lands sends `tg_roommate_profile_created`
  (`profileCreatedProperties`) and the own card; "I'm under 18" deletes the draft
  at once and says nothing was saved. The own card, shown only to its owner,
  lists every chosen field (own gender and "live with" only here), the hide date
  in Warsaw time and, by the switch, the opt-in or the daily-message state; its
  buttons are Renew (within `RENEWAL_REMINDER_DAYS` of the hide date or while
  expired, `showsRenew`), Edit, Delete, then "How many are looking?" and the
  opt-in toggle (switch off) or "Show people" (`rm:show:c`, see **Cards**) and
  the daily-message toggle (switch on; see **Daily push**).
- **Edit from the own card** (spec 06 §Save and the own card, Edit): Edit
  (`rm:c:edit`) sends a field picker (`rm:e:<field>` for `EDIT_FIELDS`, then Back
  `rm:e:back`, which closes an open edit step and sends the card). A field opens
  its intake step as `edit_<field>` (`openEditStep`) on the saved profile, which
  stays active (or expired) and counted; the intake handlers, typed text included,
  accept that step too. The answer ends the edit through `saveEdit`
  (`updateMany where { id, step }`, that field only, `step` null), and only the
  write that lands sends `tg_roommate_profile_edited` (`field` only), "updated" and
  the card. Districts and languages store each tick as the intake does and always
  keep one pick; the preferences and house-rules edits store nothing until their
  second question, whose buttons carry the first answer
  (`rm:p:<prefers>:<gender>`, `rm:pt:<pets>:<smoking>`). A month edit keeps
  `expires_at` unless the new month ends earlier (`expiresAtAfterMonthEdit`).
  No field opens while the deposit questions are open.
- **Delete** (spec 06 §Delete, FR-13): `rm:c:del` (the card, the FR-14 reply of a
  hidden profile, the renewal reminder) asks with the PRD 3 §8 wording, "Yes,
  delete" (`rm:c:delok`) or "Keep" (`rm:c:keep`). The confirm reads whether the
  profile was in a matched pair (`hasMatchedReaction`), then `deleteProfile`
  (`deleteMany where { id, status in [active, expired, hidden] }`; the foreign keys
  cascade its reactions and null report references; the ban marker stays). Only
  the delete that lands sends `tg_roommate_profile_deleted` (`reason=user`) and
  the reply with the optional reasons (`rm:dr:here`, only after a match,
  `rm:dr:elsewhere`, `rm:dr:other`); a second confirm gets "already deleted". The
  reasons carry no id: a tap first removes the reply's buttons (a second tap is
  refused by Telegram as "not modified" and sends nothing); "here" sends
  `tg_roommate_outcome` (`outcome=renting_together`, `asked=delete`). The chat can
  start a new profile at once unless banned.
- **Counts** (spec 06 §Counts, FR-16): after the save (under the card) and on
  "How many are looking?" (`rm:c:counts`, an active or expired card; a hidden one
  gets the FR-14 reply). `loadRoommateCounts(viewer)` (`../roommate/counts.ts`, also
  the website's source) reads the district fields of profiles that are `active`
  with `expires_at` in the future and whose chat is neither blocked nor banned, in
  one query; `countRoommates` leaves the viewer out and gives each chosen district,
  the number open to any district and the Warsaw total, or for "any" the Warsaw
  total and the three most named districts (ties by slug). Never a sum of
  districts, a percentage or a count combined with another field; zero is "nobody
  yet", an empty Warsaw "nobody else yet". A database error keeps the saved profile
  and replies that the counts are not available now. No event. With the switch
  off the reply carries the opt-in button.
- **Opt-in** (spec 06 §Opt-in, FR-18): "Message me when matching opens"
  (`rm:c:optin`) under the counts reply and on the card, both only while the
  switch is off. `optInToOpenMessage` sets `notify_on_open_at` (`updateMany where
{ id, status in [active, expired], notify_on_open_at: null }`): the write that
  lands sends `tg_roommate_browse_opted_in` with `already=false`, a repeat tap
  `already=true` and "Already on." first. The reply is `optInConfirm` (the one
  message, which comes only while the profile is active) and `optInClosing`
  (D64); both are the promise check's exceptions, backed by
  `sendMatchingOpenMessages` and the closing route. The card shows the state and
  "Don't message me when matching opens" (`rm:c:optout`, `optOutOfOpenMessage`
  clears it and sends the card again; no event). An old opt-in button with the
  switch on stores nothing and gets the card.
- **Cards** (spec 07 §Cards, FR-25; `roommate-matching.ts`): "Show people"
  (`rm:show:<via>`: `c` the own card, `o` the one-time message, `p` the daily push,
  `n` "That's everyone"; a bare `rm:show` counts as `c`). With the switch off every
  card button replies "matching is paused" and reads nothing. With it on: no
  profile → "create a profile first" and the intake (a banned chat, a hidden
  profile, a draft get what `/mate` gives them); an expired profile (also one past
  `expires_at` the cron has not marked) → "renew to keep browsing" with Renew; else
  one `tg_roommate_cards_viewed` (`results_band` of `findCompatible` at that moment,
  `via`), then without a Telegram username the prompt with Done (`rm:u:done`,
  `tg_roommate_username_prompted` context `browse`), otherwise the first profile of
  `findCompatible` as `renderRoommateCard` (the own card's `cardFieldLines` without
  gender and "live with": never a name, username or id) with "Interested"
  (`rm:i:<id>`), "Skip" (`rm:x:<id>`) and "Report" (`rm:r:<id>`), or "That's
  everyone for now" with the daily-message state, `rm:show:n` and its toggle. Done
  re-reads the username; one found sends `tg_roommate_username_set` and the next
  card. A card button's id is checked by `findVisibleProfile` (what
  `findCompatible` would still return; a wrong-shaped id or the viewer's own is
  refused before the query): otherwise "no longer available" and the next card.
  Skip stores one `skip` reaction (`storeSkip`, `createMany` with
  `skipDuplicates`) and sends the next card, no event.
- **Interested** (spec 07 §Interest and mutual match, FR-26, FR-28;
  `roommate-matching.ts`): `rm:i:<id>` checks the card's visibility as above, then
  the daily limit (`INTEREST_DAILY_LIMIT` in `../roommate/rules.ts`: at that many
  `interest` reactions created in the last 24 hours, `countRecentInterests`, it
  replies "that's the limit for today", stores nothing and sends no event). Else
  `storeInterest` inserts one `interest` reaction (a reaction already there →
  "already answered"; the target deleted meanwhile → "no longer available") and
  sends `tg_roommate_interest_sent`. Then `formMutualMatch` (`../roommate/store.ts`)
  runs one `$executeRaw` statement: a CTE locks the pair's unmatched `interest`
  rows in id order (`FOR UPDATE`) and the update sets `matched_at` on both only
  when there are 2; the request whose statement changed 2 rows formed the pair, so
  two concurrent taps form one. That request sends `tg_roommate_matched`
  `role=completer` for the tapping chat and `role=waiting` for the other chat
  (`telegramChatIdOf`); no event names a partner, a match or a username. Then the
  reveal (below); when it sends the tapping person nothing, the next card.
- **Reveal** (spec 07 §Reveal, FR-26, FR-30; `roommate-reveal.ts`): `revealPair`
  loads the pair (`loadMatchedPair`: the earlier interest is the waiting person).
  Either profile not active or either chat blocked or banned → nothing (the pair
  stays matched). Each message still due names the other person, whose username
  is read with `api.getChat` first and stored (a failed `getChat` uses the stored
  one). A username missing → that person gets "You have a mutual match. Set a
  username, then tap Done" (`rm:u:done`, `tg_roommate_username_prompted` context
  `reveal`) and both reveals wait; a retry does not prompt again someone whose
  stored username was already missing. Otherwise the waiting person first, then
  the completer: each message is claimed on that person's reaction's
  `revealed_at` (`claimReveal`), says "It's mutual. Write to @<username>." with the
  safety lines (PRD 3 §8), the next steps (`rm:ns:agreement|address|cost`) and
  "Report" for the partner (`rm:r:<profileId>`), and sends
  `tg_roommate_contact_revealed` once delivered. The tap sends through
  `createCronSender` too, so a 403 to the waiting person marks that chat blocked
  and the completer gets nothing, and any other error releases the claim and the
  completer waits for the send-hour retry (`retryPendingReveals`: matched pairs
  with a reveal unclaimed, both profiles active, both usernames stored,
  `dueRevealPairs`; switch on or off). Done with waiting pairs (context `reveal`):
  no username → the prompt again; else `tg_roommate_username_set` and every
  waiting pair of that profile is retried (`pendingRevealPartners`), then the next
  card when none of them wrote to this person. A next step sends
  `tg_roommate_next_step` (`step` `agreement` / `address_check` / `cost`) and
  replies with the roommate agreement PDF in the chat's language plus the Polish
  original (`documentLink`, `/documents/…`), the address prompt, or the Warsaw
  costs page (`webLink`); links carry `utm_source=telegram`, `utm_medium=bot`,
  `utm_campaign=roommate` and no chat id. The next steps work with the switch off.
- **Daily push** (spec 07 §Daily push, FR-27; `sendDailyPushes` in
  `roommate-daily.ts`, the toggle in `roommate-matching.ts`): in the send-hour run
  with the switch on, each active profile with `push_off` false gets "<N> new
  people fit you" with "Show" (`rm:show:p`) and "Stop daily messages"
  (`rm:push:off`), where N counts the `findCompatible` profiles whose
  `coalesce(renewed_at, activated_at)` lies after `coalesce(last_push_at,
activated_at)` and at or before the run's time. N = 0 → nothing; a last push
  (or the one-time message) the same Warsaw day → nothing, so a doubled
  invocation writes once. Claimed on `last_push_at` as read (the claim re-checks
  the push is on), a release restores it; each delivered push sends
  `tg_roommate_push_sent` with `count_band`. `rm:push:off` (`setPushOff`,
  conditional on the old value) sets `push_off`, sends
  `tg_roommate_push_opted_out` only when the write lands, and sends the own card
  with "Turn on daily messages" (`rm:push:on`, no event). A stop works with the
  switch off too; `rm:push:on` then replies "matching is paused".
- **Room cost reference** (spec 06 §Room cost reference, FR-17): in the same
  message after the counts, `roomCostsReply` (`roommate-room-costs.ts`) shows for
  each chosen district (Warsaw for "any") the room figures of
  `loadAreaReference({ rentalType: 'room' })` through `loadRoomCostAreas`
  (`../roommate/room-costs.ts`): one line per group with its N (`areaGroupLines` in
  `format.ts`, the cards' headline rule and labels, one observation without a
  median), the Warsaw lines once for every district below `MIN_AREA_REPORTS` room
  reports, "no room figures" when the city has none. Then D61's "for two people
  about X each" from the tenant all-in median of whole flats (its own level, N ≥ 2,
  half rounded half up to 10 zł; never a known part or asking prices). A loader
  error leaves only this part out; an English chat gets none until `texts.ts` has
  English (`hasBotTexts`).
- **Compatibility** (spec 07 §Compatibility, FR-24; no handler uses it yet):
  `isCompatible(a, b)` (`../roommate/compatibility.ts`, pure, symmetric) needs a
  shared district (or "any" on either side), budget bands at most 1 apart, move-in
  months at most 1 calendar month apart, a shared language and "live with" accepted
  both ways (`women` / `men` only a stated gender). `findCompatible(profile, now)`
  (`../roommate/store.ts`) loads in one query the profiles active by the counts'
  definition, not the profile itself, not reacted to by it, not having skipped it,
  with no report either way, then filters them with `isCompatible` and orders them
  newest first by `coalesce(renewed_at, activated_at)` (ties by id). The filter and
  the order run in memory, which is fine up to about 2,000 active profiles
  (**Assumption**); above that they must move into SQL.
- **`/cancel`**: deletes a roommate draft or clears an edit step; without one,
  leaves the deposit questions and turns off pending reminders.
- **`/deposit`**, **`/help`** (the capability list, its `/mate` line by the
  matching switch), **`/lang`** (RU / UK; `TelegramChat.locale` defaults to `ru`).
- A rate limit of 12 text messages per minute per chat (`bot.ts`), because
  geocoding is paid.
- **Blocked chats** (spec 06 §Blocked chats): a `my_chat_member` update in a
  private chat sets `TelegramChat.blockedAt` when the person blocks the bot
  (`kicked`) and clears it when they unblock it (`member`); no event, no reply,
  no new row; group chats are ignored. A 403 on a send and any later message
  (`touchChat`) set and clear it too.
- **Roommate daily cron** (spec 06 §Daily cron): `/api/cron/roommate-daily` at
  08:00 and 09:00 UTC (`vercel.json`) runs `runRoommateDaily`
  (`roommate-daily.ts`). Every run does the housekeeping: drafts untouched for 7
  days are deleted, edit and renewal steps open for 24 hours are cleared, active
  profiles past `expires_at` become `expired` (`tg_roommate_profile_expired`),
  expired profiles 14 days after expiry and hidden ones 14 days after
  `expires_at` are deleted (`tg_roommate_profile_deleted`, `reason=expired` /
  `moderation`), reports older than 6 months are deleted. Every row is written
  by its own conditional query and only a write that lands sends its event, so a
  doubled run sends each once. Messages go out only in the run at 10:xx Warsaw
  and only with a bot configured, each through `createCronSender`: blocked chats
  skipped, the row claimed first, a 403 marks the chat blocked and keeps the
  claim, any other error releases it, a 429 releases it and stops the run, at
  most 25 a second and 1,000 a run, none started after 45 s. Built jobs in
  `MESSAGE_JOBS`: the retry of waiting reveals (`retryPendingReveals`, see
  **Reveal**), the renewal reminder (`sendRenewalReminders`) and, with the switch
  on only (`switchOnOnly`), the one-time message (`sendMatchingOpenMessages`) and
  the daily push (`sendDailyPushes`, see **Daily push**); statements and the
  outcome add theirs in the priority order of the spec. The response holds counts only;
  PostHog is flushed before it.
- **Matching is open** (spec 06 §Matching is open, FR-19): with the switch on,
  each active profile with `notify_on_open_at` set and `notified_open_at` null
  gets "Matching is open. N people fit you right now." once, N from
  `findCompatible`, with "Show" (`rm:show:o`); N = 0 says nobody fits yet and,
  only while the daily push is on, that the bot writes once a day when someone
  new fits. Claimed on `notified_open_at` (the claim re-checks the opt-in); the
  claim also sets `last_push_at` to the run's time so no push follows the same
  day, and a release restores both. Earliest opt-ins first; each delivered
  message sends `tg_roommate_open_notified` with `count_band`.
- **Closing route** (spec 06 §Closing route, FR-20, D64): the owner's manual
  `POST /api/cron/roommate-close` when matching will not open; never scheduled
  (not in `vercel.json`). Call it with the cron secret and the JSON body
  `{ "confirm": true }`: `curl -X POST -H "Authorization: Bearer $CRON_SECRET"
-H 'content-type: application/json' -d '{"confirm":true}'
https://passflat.com/api/cron/roommate-close`. Without the secret → 401,
  without the body → 400, with the switch on → 409, without a bot → 503; none
  of these change anything. `runRoommateClose` (`roommate-close.ts`) deletes
  drafts silently; every other profile is deleted first by its id (the claim),
  then one `tg_roommate_profile_deleted` with `reason=closed`, then
  `closingMessage` in the chat's language unless the chat is blocked (through
  `createCronSender` with `claimWhenBlocked`, so the cap, the 45 s budget, the
  403 and the 429 rules apply; a failed send is not retried, the row is gone).
  Reports are deleted only when no profile row is left; ban markers stay. A run
  cut short answers `remaining` > 0: call it again until it is 0. It backs the
  opt-in's closing sentence (`optInClosing`, the promise check's exception).
- **Renewal** (spec 06 §Renewal, FR-15): from the first send-hour run at or after
  `expires_at` − 3 days, each active profile with `renewal_reminded_at` null gets
  one reminder naming its hide date, with Renew (`rm:c:renew`) and Delete
  (`rm:c:del`); claimed on `renewal_reminded_at` (the claim also checks
  `expires_at` as read), no event, earliest dates first. Renew (the reminder, the
  card, an expired card) goes through `renewalCheck`: an active profile within 3
  days of `expires_at` or an expired one inside its 14-day grace renews; one not
  yet due (an old reminder) gets its card; a hidden profile and an expired one
  past its grace are refused. A move-in month that has passed or ends within 3
  days (`renewalNeedsNewMonth`) is asked first as `renew_month` (not while the
  deposit questions are open; `/cancel` closes it). `renewProfile` writes active,
  `renewed_at`, `expires_at` from `computeExpiresAt`, clears
  `renewal_reminded_at` and `expired_at` (and stores the month), conditional on
  `renewed_at` as read, so only the write that lands sends
  `tg_roommate_profile_renewed` (no properties), "renewed" with the new date and
  the card.

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
| `roommate-texts.ts`                              | RU/UK/EN roommate-matching copy (`rt`), spec 06                    |
| `roommate-flow.ts`                               | Roommate entry and routing, intake steps, `/mate`, `rm:` buttons   |
| `roommate-matching.ts`                           | Stage 2 (spec 07): cards, Skip, Interested, Done, steps, push      |
| `roommate-reveal.ts`                             | The reveal of a pair and its retry (`retryPendingReveals`)         |
| `roommate-daily.ts`                              | Roommate cron: housekeeping, claim-send-release, the message jobs  |
| `roommate-close.ts`                              | The manual closing run (FR-20): closing message, delete everything |
| `roommate-room-costs.ts`                         | Room cost reference under the counts (FR-17), one line per group   |
| `../roommate/store.ts`                           | Prisma access for roommate profiles                                |
| `../roommate/counts.ts`                          | The counting rule and its loader (FR-16), shared with the website  |
| `../roommate/room-costs.ts`                      | Room figures and the D61 per-person split per area (FR-17)         |
| `../roommate/compatibility.ts`                   | The compatibility rule (FR-24); `findCompatible` is in `store.ts`  |
| `contract.ts`                                    | Lease reading with Claude                                          |
| `../../app/api/telegram/webhook/route.ts`        | Production entry point                                             |
| `../../app/api/cron/telegram-followups/route.ts` | Daily reminders and clean-up                                       |
| `../../app/api/cron/roommate-daily/route.ts`     | Daily roommate housekeeping and messages                           |
| `../../app/api/cron/roommate-close/route.ts`     | Owner's manual closing route (POST, confirm, never scheduled)      |

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

Roommate matching stage 2 (cards, interest, reveals, daily push) runs only
while `ROOMMATE_MATCHING_ENABLED` is exactly `true` (`isMatchingEnabled()` in
`../roommate/switch.ts`, read per call; any other value or unset is off).
Vercel applies a changed variable only to a new deployment, so turning the
switch on or off is: set the variable, then redeploy (owner step). Record the
moment in the posting log and as a PostHog annotation (spec 07 §Switch).

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

The website sends `web_checker` and `web_empty`, and the roommate page's
"Looking for someone to rent with" block sends `mate_web_roommate`
(`TelegramBotSource` and `botStartPayload` in
`src/lib/analytics/telegram-events.ts`). Every payload is attribution: the raw
string is `tg_bot_started.payload`, and the first one a chat brings is kept in
`TelegramChat.startPayload` (a later `/start` does not overwrite it). Both keep
the raw string only when it has a deep link's shape (`[A-Za-z0-9_-]{1,64}`);
anything else can only be text typed after `/start` and is recorded as
`invalid` (`recordedStartPayload` in `start-payload.ts`).

`parseStartPayload` also reads PRD 3's `mate` links (`mate`, `mate_<source>`,
`mate_<source>_<detail>`; sources in `ROOMMATE_ENTRY_SOURCE`). They open the
roommate flow (`openRoommate`) with that source and detail; `/mate` and the
`rm:start` button give `bot_menu`.

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
(address or district check, `/mate`, `/districts`, `/deposit`, `/my`, `/lang`,
`/cancel`), and `COMMAND_MENU` names the same commands in the same order. The
`/mate` line is chosen by `isMatchingEnabled()` at reply time (`capabilityText`):
off, "fill in a profile and see how many people look per district; matching
opens later"; on, "people who fit you, contacts only on mutual interest". No line
names a date. `/cancel` in the list and the menu covers the deposit and the
roommate questions. `texts.test.ts` fails if a text in `texts.ts` promises to
write later, if a listed command is missing from the menu (or a menu command
from the list), or if the roommate line does not name `/mate`.

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
and the cron skips blocked chats (a later message or an unblock clears the
mark; blocking the bot sets it without a send, see "Blocked chats" above). Delivery is at most once: a crash between the
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
