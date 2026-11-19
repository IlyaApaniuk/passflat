# Activation funnels (PRD 1, PRD 3)

How to read the PRD 1 activation funnels in PostHog and in the database, the events of PRD 3's
roommate matching (§1) and the roommate stage 1 and stage 2 readouts (§7, §8). Spec:
`docs/specs/05-measurement-docs.md` §Activation funnels document (FR-47, FR-5). Experiments: E8
(roommate, H2) and E9 (address, H3) in `docs/product/experiments.md`; E14 (roommate stage 1) in
§7; E15 (roommate stage 2) in §8.

Written on 2026-11-19 from the code at `23e0c34`; the PRD 3 roommate events (bot, and the web
values `intent=find_flatmate` and `telegram_bot_opened` `source=roommate`) were added on
2026-11-19 from the code at `541ae34` (spec 05 §PRD 3: roommate docs, FR-40), and §7 on
2026-11-19 from the code at `79a9361` (spec 05 §Stage 1 readout, FR-42), and §8 on 2026-11-19
from the code at `c14ec61` (spec 05 §Stage 2 readout, FR-43). Every event and
property below was checked by a search of `src/` (see [How this was checked](#how-this-was-checked)), not copied from the
specs. None of the queries has been run: loop iterations never query PostHog. HogQL and SQL were
checked by reading only, so run each one on a short interval before you rely on it.

> **Validity.** E8 and E9 readouts are **valid only after FR-13 (landing capture, moved from
> PRD 2 FR-1 by D22; task T002) is verified** in PostHog Live Events. The fix is built (T002,
> 2026-11-19: `posthog.init` runs in `src/instrumentation-client.ts`, before React hydrates) but
> not deployed or verified. Data from before the deploy lost the landing `$pageview` and
> mount-time events on many first pages, so entries are undercounted and every split by entry
> page is wrong there (see [Limitations](#6-limitations)).

This document sets no targets. E8 and E9 thresholds are the owner's, set on 2026-11-19 (D28,
§6 and `docs/product/experiments.md`), and so are E14's (D52, D58, D59; quoted in §7) and E15's
(D52, D60; quoted in §8). It contains no A/B
tests and no revenue forecasts. Read counts, not rates, while the samples are small.

## 1. Event table

Identities:

- **Visitor id:** the posthog-js anonymous `distinct_id`. The client never calls `identify`,
  so a signed-in visitor keeps the anonymous id on the website. In memory mode (no consent) a
  full page load starts a new visitor and a new session.
- **Account id:** the Supabase user id, used by server events. It cannot be joined to client
  events, because the client never identifies.
- **No e-mail identity:** no event of these funnels uses an e-mail as its identity or property
  (D32, T057). The waitlist is counted by the client event `listing_interest_saved` and by database rows (§4).
  The two removed server events `city_notify_subscribed` and `district_notify_subscribed` used
  the e-mail as `distinct_id` until T057 was deployed; when a query reaches that older data,
  count it with `count()`, never select its `distinct_id` or person properties, and never copy
  an e-mail into a query result.
- **`tg_<chatId>`:** every bot event (`src/lib/bot/analytics.ts`) with `source: 'telegram_bot'`.
  It is never merged with a web identity. Queries return counts only, never the `distinct_id`.

Client events also get page context from the `before_send` hook
(`src/lib/analytics/page-context.ts`): `page_type`, `locale`, `city`, `listing_type` (listing
pages) and `entry_page_type`. An event's own property wins over the hook, for example the `city`
that many events send themselves. posthog-js adds `$session_id`, `$current_url`, `$pathname`,
`$referring_domain` and `$session_entry_*` (`$session_entry_pathname`,
`$session_entry_referring_domain`, `$session_entry_utm_source`, ...). The provider registers
`ref`, `ref_type` and `utm_*` once as super properties
(`src/components/providers/posthog-provider.tsx`). Server and bot events have none of these
properties.

### Website, client (visitor id)

| Event                              | Fires in                                                                                                              | Own properties                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$pageview`                        | `src/components/providers/posthog-provider.tsx` (`PostHogPageView`)                                                   | `$current_url`. Re-fires on every pathname or search-param change.                                                                                                                                                                                                                                                                                       |
| `roommate_intent_selected`         | `src/components/listings/roommate-role-selector.tsx` (`chooseRoommateRole` in `src/lib/roommate-roles.ts`)            | `intent` (`find_room` \| `offer_room` \| `find_flatmate`). `offer_room` is a link to `/create-listing?type=roommate`; `find_flatmate` shows the bot block on `/warsaw/roommate` (spec 02 §Find a flatmate).                                                                                                                                              |
| `listing_detail_viewed`            | `src/app/[locale]/[city]/replacement/[id]/client.tsx` (all three listing types)                                       | `listing_id`, `type`, `listing_type` (= `type`), `city`, `source` (`search` \| `direct`, from `document.referrer`). Effect on `[listing.id]`.                                                                                                                                                                                                            |
| `listing_external_contact_clicked` | same file (`trackContactClick`)                                                                                       | `listing_id`, `type`, `listing_type`, `channel` (`telegram` \| `phone` \| `facebook`), `source` (`cta` \| `sticky_bar`)                                                                                                                                                                                                                                  |
| `interest_modal_opened`            | same file                                                                                                             | `listing_id`, `type`, `listing_type`; `source: 'sticky_bar'` on the sticky bar only                                                                                                                                                                                                                                                                      |
| `listing_interest_saved`           | `src/components/listings/listings-empty-state.tsx` (`interestOutcomeEvent` in `src/lib/analytics/interest-events.ts`) | `listing_type`, `district_scope` (`district` \| `city`), `intent` (only when a role was chosen on this page). After a 2xx from `POST /api/city-notify`.                                                                                                                                                                                                  |
| `listing_interest_failed`          | same                                                                                                                  | `error_code`: `consent_required`, `invalid_email`, `invalid_input`, `unknown_city`, `unknown_district`, `rate_limited`, `server_error`, `network_error`                                                                                                                                                                                                  |
| `create_listing_started`           | `src/app/[locale]/create-listing/page.tsx`                                                                            | none (new listings only, not in edit mode). `/create-listing` is `page_type: other`; the listing type is not on the event.                                                                                                                                                                                                                               |
| `create_listing_publish_started`   | same                                                                                                                  | `type`, `photo_count`, `needs_checkout`                                                                                                                                                                                                                                                                                                                  |
| `search_performed`                 | `src/components/listings/listings-page-client.tsx`                                                                    | `results_count` counts within the 50-listing server cap (`src/lib/listings-query.ts`). Context only; not a funnel step.                                                                                                                                                                                                                                  |
| `checker_viewed`                   | `src/app/[locale]/[city]/check/client.tsx`                                                                            | `city`. Once per mount.                                                                                                                                                                                                                                                                                                                                  |
| `address_checked`                  | same (`addressCheckedProperties` in `src/lib/analytics/checker-events.ts`)                                            | In-city success: `city`, `building_id`, `has_data`, `source` (`shared_url` \| `address_search`), `answer_level` (`building` \| `district` \| `city` \| `none`), `source_kind` (`tenant` \| `mixed` \| `asking` \| `none`), `n`, `incomplete`. Outside the city: `city`, `selected_city`, `has_data: false`, `outside_city: true` (no answer properties). |
| `checker_check_failed`             | same                                                                                                                  | `city`, `reason` (`not_found` \| `rate_limited` \| `generic` \| `incomplete_address`), `source`                                                                                                                                                                                                                                                          |
| `checker_cta_clicked`              | same (`captureCta`)                                                                                                   | `source: 'checker'`, `city`, `building_id`, `has_data`, `cta` (`form` \| `follow` \| `building` \| `share` \| `tell_us` \| `telegram`)                                                                                                                                                                                                                   |
| `telegram_bot_opened`              | `src/components/costs/telegram-bot-cta.tsx` (`src/lib/analytics/telegram-events.ts`)                                  | `source` (`checker` \| `empty` \| `roommate`), `has_building_context`. `checker` and `empty`: the checker's `TelegramBotCta`, where one click also fires `checker_cta_clicked {cta: 'telegram'}`. `roommate`: the flatmate block on `/warsaw/roommate` (`find-flatmate-block.tsx`), always without a building.                                           |
| `building_detail_viewed`           | `src/app/[locale]/[city]/building/[slug]/client.tsx` (`src/lib/analytics/building-events.ts`)                         | `building_id`, `building_slug`, `city`, `report_count`, `user_count`, `import_count`, `scraped_count`, `answer_level`, `source_kind`, `n`, `incomplete`. Effect on `[building.id]`.                                                                                                                                                                      |
| `location_score_viewed`            | `src/components/buildings/location-score-block.tsx`                                                                   | `surface` (`building` \| `checker` \| `listing`), `city`, `building_id`, `score`, `has_map`, `neighbour_count`                                                                                                                                                                                                                                           |
| `cost_form_started`                | `src/app/[locale]/[city]/costs/submit/client.tsx`                                                                     | `city`, `source` (`checker` \| `review` \| `building` \| `tgbot` \| `direct`; `SUBMIT_SOURCES` in `src/lib/cost-submit-params.ts`), `building_id` and `place_id` with a prefill. New reports only.                                                                                                                                                       |
| `cost_form_address_selected`       | same                                                                                                                  | `city`, `method` (`prefill` \| `autocomplete` \| `draft`), `source`; `building_id`, `place_id` with `prefill`                                                                                                                                                                                                                                            |
| `cost_form_submit_attempt`         | same                                                                                                                  | `city`, `edit`. Fires on every attempt.                                                                                                                                                                                                                                                                                                                  |
| `cost_form_submit_success`         | same                                                                                                                  | `city`, `was_flagged`, `edit`                                                                                                                                                                                                                                                                                                                            |

### Website, server (no page context)

| Event                   | Fires in                                        | Identity                                                                            | Properties                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listing_created`       | `src/app/api/listings/route.ts`                 | account id                                                                          | `listing_id`, `type`, `city`, `district`, `has_photos`, `price`, `is_paid`, `promote_days`                                                                                               |
| `conversation_started`  | `src/app/api/conversations/route.ts`            | account id                                                                          | `listing_id`, `listing_type`, `conversation_id`                                                                                                                                          |
| `cost_report_submitted` | `src/app/api/cost-reports/route.ts` (POST only) | account id, or the `pf_anon` cookie id for an anonymous report (not the PostHog id) | `building_id`, `city`, `source` (the report's provenance `user` \| `import` \| `scraped`, not the form's entry `source`), `was_flagged`, `fill_on_behalf`, `scraped_import`, `anonymous` |

`POST /api/city-notify` (the waitlist) sends no server event (D32): a listings-interest save is
counted by `listing_interest_saved` on the client and by `city_notify_subscriptions` rows, a
city-launch save by rows only (§4).

### Telegram bot (`tg_<chatId>`; every event also has `source: 'telegram_bot'`)

| Event                         | Fires in                                                              | Properties                                                                                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tg_bot_started`              | `src/lib/bot/bot.ts` (`handleStart`)                                  | `payload` (raw `/start` payload or null: `dep`, `b_<uuid>`, `d_<slug>`, `web_<source>`, `mate…`, campaign codes; `invalid` when the text after `/start` is not `[A-Za-z0-9_-]{1,64}`), `is_new`. Fires on every `/start`. |
| `tg_address_checked`          | `bot.ts` (`replyCard`, properties from `src/lib/bot/check-events.ts`) | `level`, `district`, `has_building`, `report_count`, `entry_source` (`typed_address` \| `link_building`), `lookup_level`, `source_kind`, `n`, `incomplete`                                                                |
| `tg_district_checked`         | `bot.ts` (`replyDistrict`, `check-events.ts`)                         | `district`, `report_count`, `entry_source` (`typed_district` \| `link_district`), `source_kind`, `n`, `incomplete`                                                                                                        |
| `tg_subscribed`               | `bot.ts` (`handleSubscribe`)                                          | `target` (`building` \| `district`), `district` (district only), `already` (true when the interest existed)                                                                                                               |
| `tg_city_requested`           | `bot.ts` (`cw:` callback)                                             | `city`, `city_key`, `waiting`, `already`. A city waitlist, saved as a `c:` row; used only for the database comparison.                                                                                                    |
| `tg_deposit_flow_started`     | `src/lib/bot/deposit-flow.ts` (`startDepositFlow`)                    | none. Fires on every start; a restart abandons the open case.                                                                                                                                                             |
| `tg_deposit_verdict`          | `deposit-flow.ts` (`sendVerdict`)                                     | `reason`, `protocol`, `strength`, `overdue`, `claim`, `contract`, `deadline_source`                                                                                                                                       |
| `tg_deposit_letter_generated` | `deposit-flow.ts` (`dep:letter:` callback)                            | `reason`, `filled`                                                                                                                                                                                                        |
| `tg_deposit_letter_sent`      | `deposit-flow.ts` (`dep:sent:` callback)                              | none. The person's own tap on "sent"; nobody checks that a letter went out.                                                                                                                                               |
| `tg_deposit_outcome`          | `deposit-flow.ts` (`dep:o:` callback)                                 | `outcome` (`full` \| `partial` \| `none`), `after` (`deadline` \| `letter`, the follow-up it answers). Can fire more than once per case.                                                                                  |

### Telegram bot, roommate matching (PRD 3; `tg_<chatId>`, `source: 'telegram_bot'`)

The identity is the chat the event is about: the chat that tapped, except `tg_roommate_matched`
with `role = 'waiting'` (sent under the other person's chat when a pair forms),
`tg_roommate_profile_hidden` (under the hidden person's chat) and the cron and closing-route
events (under the profile's chat). Each one is sent only by the database write or the delivery
that landed, so a double tap or a doubled cron run counts once; `tg_roommate_cards_viewed` is one
per "Show people" tap. No property holds a username, the short text, gender, "live with", a
district slug, a profile or match id or a chat id. The stage 2 events (from
`tg_roommate_cards_viewed` down) need a card or a match first, so they appear only after the
switch goes on (`ROOMMATE_MATCHING_ENABLED=true`; unset at the deploy, D49; the owner records the
moment, spec 07 §Switch). Next steps, push opt-outs, outcome answers, reports and hides keep
coming after it goes off again. Values and the full rules: `src/lib/bot/README.md` ("Roommate
events").

| Event                           | Fires in                                                                                     | Properties                                                                                                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tg_roommate_flow_started`      | `src/lib/bot/roommate-flow.ts` (`openRoommate`, a new draft)                                 | `entry_source` (`direct` \| `tg` \| `fb` \| `ig` \| `threads` \| `web` \| `bot_menu` \| `other`; `ROOMMATE_ENTRY_SOURCE` in `start-payload.ts`), `entry_detail` (only when the link has one) |
| `tg_roommate_profile_created`   | `roommate-flow.ts` ("I'm 18+"; `profileCreatedProperties` in `src/lib/roommate/rules.ts`)    | `district_count`, `any_district`, `budget_band` (`b1` – `b5`), `move_in_offset_months` (0 – 3), `language_count`, `has_text`, `rule_count`, `entry_source`, `has_username`                   |
| `tg_roommate_profile_edited`    | `roommate-flow.ts` (`saveEdit` landed)                                                       | `field`                                                                                                                                                                                      |
| `tg_roommate_profile_renewed`   | `roommate-flow.ts` (Renew landed)                                                            | none                                                                                                                                                                                         |
| `tg_roommate_profile_expired`   | `src/lib/bot/roommate-daily.ts` (housekeeping)                                               | none                                                                                                                                                                                         |
| `tg_roommate_profile_deleted`   | `roommate-flow.ts` (the person), `roommate-daily.ts` (cron), `roommate-close.ts` (the owner) | `reason` (`user` \| `expired` \| `moderation` \| `closed`)                                                                                                                                   |
| `tg_roommate_browse_opted_in`   | `roommate-flow.ts` (`rm:c:optin`)                                                            | `already`                                                                                                                                                                                    |
| `tg_roommate_open_notified`     | `roommate-daily.ts` (the one-time message delivered)                                         | `count_band` (`0` \| `1-2` \| `3-5` \| `6+`)                                                                                                                                                 |
| `tg_roommate_cards_viewed`      | `src/lib/bot/roommate-matching.ts` (`rm:show:<via>`)                                         | `results_band` (bands as `count_band`), `via` (`card` \| `open_message` \| `push` \| `next`)                                                                                                 |
| `tg_roommate_username_prompted` | `roommate-matching.ts`, `src/lib/bot/roommate-reveal.ts`                                     | `context` (`browse` \| `reveal`)                                                                                                                                                             |
| `tg_roommate_username_set`      | `roommate-matching.ts` (Done found a username)                                               | `context` (`browse` \| `reveal`)                                                                                                                                                             |
| `tg_roommate_interest_sent`     | `roommate-matching.ts` (a stored "Interested")                                               | none                                                                                                                                                                                         |
| `tg_roommate_matched`           | `roommate-matching.ts` (`formMutualMatch` formed the pair)                                   | `role` (`completer` \| `waiting`): one event per person, so pairs = `role = 'completer'`                                                                                                     |
| `tg_roommate_contact_revealed`  | `roommate-reveal.ts` (a reveal delivered)                                                    | none                                                                                                                                                                                         |
| `tg_roommate_next_step`         | `roommate-matching.ts` (`rm:ns:*`)                                                           | `step` (`agreement` \| `address_check` \| `cost`)                                                                                                                                            |
| `tg_roommate_push_sent`         | `roommate-daily.ts` (a daily push delivered)                                                 | `count_band`                                                                                                                                                                                 |
| `tg_roommate_push_opted_out`    | `roommate-matching.ts` (`rm:push:off` landed)                                                | none                                                                                                                                                                                         |
| `tg_roommate_outcome`           | `roommate-matching.ts` (`rm:o:*`), `roommate-flow.ts` (`rm:dr:here` after a delete)          | `outcome` (`renting_together` \| `talking` \| `no_fit` \| `dont_ask`), `asked` (`follow_up` \| `delete`). The person's own answer, not a verified move-in.                                   |
| `tg_roommate_reported`          | `src/lib/bot/roommate-safety.ts` (a stored report)                                           | `reason` (`money` \| `fake` \| `offensive` \| `under_18` \| `other`)                                                                                                                         |
| `tg_roommate_profile_hidden`    | `roommate-safety.ts` (`hideIfDue`: the automatic hide landed)                                | `reason` (`reports` \| `under_18`)                                                                                                                                                           |

The website's way into the roommate flow is three separate counts, never one identified funnel:
`roommate_intent_selected` with `intent = 'find_flatmate'` and `telegram_bot_opened` with
`source = 'roommate'` (visitor id, the block on `/warsaw/roommate`), then `tg_bot_started` with
`payload = 'mate_web_roommate'` and `tg_roommate_flow_started` with `entry_source = 'web'` and
`entry_detail = 'roommate'` (`tg_<chatId>`). A chat that already has a profile or a draft sends no
new `tg_roommate_flow_started`.

## 2. Funnels

All web funnels count **sessions** (`$session_id`), not events, within one session (see
[Windows](#3-windows)). Steps are cumulative: each step counts the sessions that also have every
earlier step. They are not strictly ordered in time: a session that did step 2 before step 1
still counts. The bot funnels count chats (`distinct_id`).

Replace both dates in every query before you run it. Dates are Europe/Warsaw; the end is
exclusive. A placeholder left in place fails the query instead of giving a wrong window.

### 2.1 Roommate (E8, H2)

E8 readout: valid only after FR-13 is fixed and verified.

Steps:

1. Sessions with any event with `page_type = 'roommate'` (`/<city>/roommate`). Use any event,
   not only `$pageview`: `$pageview` re-fires on every filter change and checker `?p=` update
   (`replaceState` updates `useSearchParams`), and before the FR-13 fix (T002) the landing one
   was often dropped.
2. → `listing_detail_viewed` with `listing_type = 'roommate'`.
3. → `listing_external_contact_clicked` or `interest_modal_opened` (roommate).

Separate branch: `listing_interest_saved` with `listing_type = 'roommate'` (the empty-state
waitlist on the roommate page).

Offer branch: `roommate_intent_selected` with `intent = 'offer_room'` → `create_listing_started`
→ `create_listing_publish_started` with `type = 'roommate'`. Then the server's `listing_created`
with `type = 'roommate'` is a count of record next to the funnel, not a step: it carries the
account id, which cannot be joined to the visitor id.

`intent` is a breakdown, not a required step: choosing a role is optional. The breakdown takes
the last role chosen in the session, or `none`.

Read it with these facts:

- Passflat has had no roommate listing since June 2026 (H10), so steps 2 and 3 are expected
  near zero. The waitlist branch and the offer branch carry the signal.
- `results_count` of `search_performed` counts within the 50-listing server cap.
- `listing_detail_viewed.source` reads `document.referrer`, which is stale after a client
  navigation, so `search` and `direct` are unreliable.
- A contact click is a click. It is not an introduction, a reply or a move-in (FR-5).
- The server's `conversation_started` (account id) cannot be joined to client events.
- `/create-listing` needs sign-in. A logged-out "I have a free room" click goes to the login
  page. A Google sign-in or an e-mail link is a full page load: in memory mode the session and
  the visitor restart, so the offer branch loses those visitors after step 1. Signed-in visitors
  stay in one session.

```sql
-- HogQL. Roommate funnel, sessions per step, intent as a breakdown.
SELECT
    intent,
    count() AS s1_roommate_sessions,
    countIf(viewed) AS s2_listing_viewed,
    countIf(viewed AND contacted) AS s3_contact_click_or_modal,
    countIf(saved) AS branch_interest_saved,
    countIf(offer) AS offer_1_offer_room,
    countIf(offer AND started) AS offer_2_create_started,
    countIf(offer AND started AND published) AS offer_3_publish_started
FROM (
    SELECT
        properties.$session_id AS session_id,
        if(
            countIf(event = 'roommate_intent_selected') > 0,
            argMaxIf(toString(properties.intent), timestamp, event = 'roommate_intent_selected'),
            'none'
        ) AS intent,
        countIf(properties.page_type = 'roommate') > 0 AS entered,
        countIf(event = 'listing_detail_viewed' AND properties.listing_type = 'roommate') > 0 AS viewed,
        countIf(event IN ('listing_external_contact_clicked', 'interest_modal_opened')
            AND properties.listing_type = 'roommate') > 0 AS contacted,
        countIf(event = 'listing_interest_saved' AND properties.listing_type = 'roommate') > 0 AS saved,
        countIf(event = 'roommate_intent_selected' AND properties.intent = 'offer_room') > 0 AS offer,
        countIf(event = 'create_listing_started') > 0 AS started,
        countIf(event = 'create_listing_publish_started' AND properties.type = 'roommate') > 0 AS published
    FROM events
    WHERE timestamp >= toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
        AND timestamp < toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
        AND properties.$session_id IS NOT NULL
    GROUP BY session_id
)
WHERE entered
GROUP BY intent
ORDER BY intent
```

```sql
-- HogQL. Server counts of record for the same interval (account id; not joinable).
SELECT event, count() AS events
FROM events
WHERE event IN ('listing_created', 'conversation_started')
    AND (properties.type = 'roommate' OR properties.listing_type = 'roommate')
    AND timestamp >= toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
    AND timestamp < toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
GROUP BY event
```

PostHog funnel settings, as an alternative to the first query: steps "any event where
`page_type = roommate`" → `listing_detail_viewed` (`listing_type = roommate`) → an action
combining `listing_external_contact_clicked` and `interest_modal_opened` (`listing_type =
roommate`); aggregate by `properties.$session_id`; breakdown by `intent`. A breakdown in a
funnel takes the value from one step, so the HogQL query is the reference.

### 2.2 Address (E9, H3)

E9 readout: valid only after FR-13 is fixed and verified.

Steps:

1. **Entry**, two kinds, kept apart:
   - checker: `checker_viewed`;
   - building page: `$pageview` with `page_type = 'building'`. For data from before the FR-13
     fix is verified, use `location_score_viewed` with `surface = 'building'` as the fallback;
     the query counts either.
     The entry kind is the first of these in the session. Starting a check and landing on a
     building page are different entries: also split by `entry_page_type`.
2. **Answer**, split by `answer_level` (spec 01 §Answer quality): `address_checked` without
   `outside_city`, or `building_detail_viewed`. The split takes the first answer in the session.
   `none` means the check succeeded but there are no figures at any level; `no_answer` means no
   answer event.
3. **Action:** `cost_form_started`, `telegram_bot_opened` or `checker_cta_clicked`. A session
   counts once. One Telegram click sends both `checker_cta_clicked {cta: telegram}` and
   `telegram_bot_opened`, and a form click sends `checker_cta_clicked {cta: form}` before
   `cost_form_started` on the next page; summing events would count them twice.
   `checker_cta_clicked` also covers `share`, `follow`, `tell_us` and `building` (the link to
   the building page); break it down by `cta` when it matters.

"Coming back" (H3) is visible only for consented visitors (their visitor id survives a reload)
and in the bot. In memory mode every full page load is a new visitor.

`address_checked` has been 0 since 2026-09-14. It fires only after a successful check, so it
may be a true zero; it is unverified.

```sql
-- HogQL. Address funnel: sessions per entry kind, entry page type and answer level.
-- s1 = sum of `sessions` over all answer levels; s2 = the same without `no_answer`;
-- s3 = `with_action` without `no_answer`.
SELECT
    entry,
    entry_page_type,
    answer_level,
    count() AS sessions,
    countIf(answered AND acted) AS with_action,
    countIf(answered AND form_started) AS with_cost_form_started,
    countIf(answered AND bot_opened) AS with_telegram_bot_opened,
    countIf(answered AND cta_clicked) AS with_checker_cta_clicked
FROM (
    SELECT
        properties.$session_id AS session_id,
        argMin(toString(properties.entry_page_type), timestamp) AS entry_page_type,
        countIf(event = 'checker_viewed'
            OR (event = '$pageview' AND properties.page_type = 'building')
            OR (event = 'location_score_viewed' AND properties.surface = 'building')) > 0 AS entered,
        argMinIf(
            if(event = 'checker_viewed', 'checker', 'building'),
            timestamp,
            event = 'checker_viewed'
                OR (event = '$pageview' AND properties.page_type = 'building')
                OR (event = 'location_score_viewed' AND properties.surface = 'building')
        ) AS entry,
        countIf((event = 'address_checked' AND coalesce(toString(properties.outside_city), '') != 'true')
            OR event = 'building_detail_viewed') > 0 AS answered,
        if(
            answered,
            argMinIf(
                toString(properties.answer_level),
                timestamp,
                (event = 'address_checked' AND coalesce(toString(properties.outside_city), '') != 'true')
                    OR event = 'building_detail_viewed'
            ),
            'no_answer'
        ) AS answer_level,
        countIf(event = 'cost_form_started') > 0 AS form_started,
        countIf(event = 'telegram_bot_opened') > 0 AS bot_opened,
        countIf(event = 'checker_cta_clicked') > 0 AS cta_clicked,
        form_started OR bot_opened OR cta_clicked AS acted
    FROM events
    WHERE timestamp >= toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
        AND timestamp < toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
        AND properties.$session_id IS NOT NULL
    GROUP BY session_id
)
WHERE entered
GROUP BY entry, entry_page_type, answer_level
ORDER BY entry, entry_page_type, answer_level
```

### 2.3 Contribution

Steps, broken down by the entry `source` of `cost_form_started` (`checker`, `review`,
`building`, `tgbot`, `direct`):

1. `cost_form_started` (new reports only; the form never sends it in edit mode);
2. → `cost_form_address_selected`, broken down by `method`. A handed-over address (`prefill`),
   a typed one (`autocomplete`) and a restored draft (`draft`) are different efforts; never sum
   them as one rate;
3. → `cost_form_submit_attempt` with `edit` not true;
4. → `cost_form_submit_success` with `edit` not true.

The server's `cost_report_submitted` is the count of record. It carries the account id or the
`pf_anon` cookie id, so it cannot be joined to the session. Its `source` is the report's
provenance (`user`, `import`, `scraped`), not the form's entry source; organic reports are
`source = 'user'`. `cost_form_submit_success` and `cost_report_submitted` describe the same
submission: never count them as two conversions.

```sql
-- HogQL. Contribution funnel, sessions per step, by entry source and address method.
SELECT
    source,
    address_method,
    count() AS s1_form_started,
    countIf(address) AS s2_address,
    countIf(address AND attempted) AS s3_submit_attempt,
    countIf(address AND attempted AND succeeded) AS s4_submit_success
FROM (
    SELECT
        properties.$session_id AS session_id,
        countIf(event = 'cost_form_started') > 0 AS started,
        argMinIf(toString(properties.source), timestamp, event = 'cost_form_started') AS source,
        countIf(event = 'cost_form_address_selected') > 0 AS address,
        if(
            address,
            argMinIf(toString(properties.method), timestamp, event = 'cost_form_address_selected'),
            'no_address'
        ) AS address_method,
        countIf(event = 'cost_form_submit_attempt'
            AND coalesce(toString(properties.edit), '') != 'true') > 0 AS attempted,
        countIf(event = 'cost_form_submit_success'
            AND coalesce(toString(properties.edit), '') != 'true') > 0 AS succeeded
    FROM events
    WHERE event IN ('cost_form_started', 'cost_form_address_selected',
            'cost_form_submit_attempt', 'cost_form_submit_success')
        AND timestamp >= toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
        AND timestamp < toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
        AND properties.$session_id IS NOT NULL
    GROUP BY session_id
)
WHERE started
GROUP BY source, address_method
ORDER BY source, address_method
```

```sql
-- HogQL. Count of record: new reports by provenance (server; not joinable).
SELECT
    toString(properties.source) AS provenance,
    toString(properties.anonymous) AS anonymous,
    count() AS reports
FROM events
WHERE event = 'cost_report_submitted'
    AND timestamp >= toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
    AND timestamp < toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
GROUP BY provenance, anonymous
ORDER BY provenance, anonymous
```

### 2.4 Telegram address

Steps, per chat: `tg_bot_started` → `tg_address_checked` or `tg_district_checked` →
`tg_subscribed` with `already` not true (an interest saved for the first time). Saved interest
sends nothing; it is a saved request, not a notification.

Window: the readout week (Monday–Sunday) per chat. Spec 05 does not set this window; it is this
document's choice and the owner can change it. Chats that check without a `/start` in the window
are returning chats ("coming back" in the bot) and are counted in their own column.

Website visits from the bot are analysed separately by `utm_source = 'telegram'`: every bot
link carries `utm_source=telegram`, `utm_medium=bot` and `utm_campaign=<surface>`
(`src/lib/bot/format.ts`). Only the card's cost-form button (`submitLink`) also sets
`source=tgbot` on the form; the district and deposit buttons (`webLink`) do not, so their
`cost_form_started` says `direct` and only the UTM marks them. Bot visits are not one identified
funnel with the bot: the bot identity is never joined to the visitor id. The website's
`telegram_bot_opened` and `tg_bot_started` with a `b_` or `web_` payload can be compared as
counts only.

```sql
-- HogQL. Telegram address funnel, chats per step. Returns counts only.
SELECT
    payload_kind,
    countIf(started) AS t1_bot_started,
    countIf(started AND checked) AS t2_checked,
    countIf(started AND checked AND saved) AS t3_interest_saved,
    countIf(NOT started AND checked) AS returning_chats_checked
FROM (
    SELECT
        distinct_id,
        countIf(event = 'tg_bot_started') > 0 AS started,
        multiIf(
            countIf(event = 'tg_bot_started') = 0, 'not_started',
            startsWith(argMinIf(coalesce(toString(properties.payload), ''), timestamp, event = 'tg_bot_started'), 'b_'), 'building_link',
            startsWith(argMinIf(coalesce(toString(properties.payload), ''), timestamp, event = 'tg_bot_started'), 'd_'), 'district_link',
            startsWith(argMinIf(coalesce(toString(properties.payload), ''), timestamp, event = 'tg_bot_started'), 'web_'), 'website',
            argMinIf(coalesce(toString(properties.payload), ''), timestamp, event = 'tg_bot_started') = 'dep', 'deposit',
            argMinIf(coalesce(toString(properties.payload), ''), timestamp, event = 'tg_bot_started') = '', 'no_payload',
            'other'
        ) AS payload_kind,
        countIf(event IN ('tg_address_checked', 'tg_district_checked')) > 0 AS checked,
        countIf(event = 'tg_subscribed' AND coalesce(toString(properties.already), '') != 'true') > 0 AS saved
    FROM events
    WHERE startsWith(distinct_id, 'tg_')
        AND event IN ('tg_bot_started', 'tg_address_checked', 'tg_district_checked', 'tg_subscribed')
        AND timestamp >= toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
        AND timestamp < toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
    GROUP BY distinct_id
)
GROUP BY payload_kind
ORDER BY payload_kind
```

Break the check step down by `entry_source` of `tg_address_checked` / `tg_district_checked`
(`typed_address`, `typed_district`, `link_building`, `link_district`) when needed.

A `mate…` payload (the roommate entry) lands in `payload_kind = 'other'` here. Read the roommate
entry from `tg_roommate_flow_started` (`entry_source`, `entry_detail`) instead.

### 2.5 Telegram deposit

Steps, per chat: `tg_deposit_flow_started` → `tg_deposit_verdict` →
`tg_deposit_letter_generated` → `tg_deposit_letter_sent` (the person's own mark) →
`tg_deposit_outcome`. A letter is not money returned: only `outcome = 'full'` or `'partial'` says
that money came back, and it is the person's own answer. `after = 'deadline'` means the answer
came before any letter.

Window: 30 days from the chat's first `tg_deposit_flow_started` in the cohort period. Read it
separately from the two-week comparison, and only when the last cohort day is at least 30 days
old.

```sql
-- HogQL. Deposit funnel, chats per step within 30 days of their first flow start.
-- Cohort dates: when the flow started. Returns counts only.
SELECT
    count() AS d1_flow_started,
    countIf(verdict) AS d2_verdict,
    countIf(verdict AND letter) AS d3_letter_generated,
    countIf(verdict AND letter AND sent) AS d4_letter_marked_sent,
    countIf(verdict AND letter AND sent AND outcome != '') AS d5_outcome_answered,
    countIf(outcome = 'full') AS last_outcome_full,
    countIf(outcome = 'partial') AS last_outcome_partial,
    countIf(outcome = 'none') AS last_outcome_none
FROM (
    SELECT
        s.chat AS chat,
        countIf(e.event = 'tg_deposit_verdict') > 0 AS verdict,
        countIf(e.event = 'tg_deposit_letter_generated') > 0 AS letter,
        countIf(e.event = 'tg_deposit_letter_sent') > 0 AS sent,
        argMaxIf(toString(e.properties.outcome), e.timestamp, e.event = 'tg_deposit_outcome') AS outcome
    FROM (
        SELECT distinct_id AS chat, min(timestamp) AS started_at
        FROM events
        WHERE event = 'tg_deposit_flow_started'
            AND startsWith(distinct_id, 'tg_')
            AND timestamp >= toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
            AND timestamp < toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
        GROUP BY distinct_id
    ) AS s
    JOIN events AS e ON e.distinct_id = s.chat
    WHERE e.event IN ('tg_deposit_flow_started', 'tg_deposit_verdict', 'tg_deposit_letter_generated',
            'tg_deposit_letter_sent', 'tg_deposit_outcome')
        AND e.timestamp >= s.started_at
        AND e.timestamp < s.started_at + toIntervalDay(30)
    GROUP BY s.chat
)
```

## 3. Windows

- Web funnels (2.1–2.3): within one session. Memory mode (no consent) makes one page load one
  session for unconsented visitors; client navigations stay in it.
- Telegram address (2.4): the readout week per chat (this document's choice, see 2.4).
- Telegram deposit (2.5): 30 days from the first flow start, read separately.
- Never mix in one number: different intervals, events from before and after the PRD 1 release,
  persons and events, or sessions and chats.

## 4. Database counts

Read-only SQL for the owner (Supabase SQL editor). Counts only: never select `email`, `chat_id`
or a row id. `created_at` is `TIMESTAMP(3)` without a time zone, written in UTC; replace the
release placeholder with the PRD 1 deploy time in UTC.

Saved interests per class (`city_notify_subscriptions`, classes from
`src/app/api/city-notify/route.ts`):

```sql
SELECT
    CASE
        WHEN listing_type = '' AND district_slug = '' THEN 'city_launch'
        WHEN district_slug = '' THEN 'listings_city'
        ELSE 'listings_district'
    END AS interest_class,
    NULLIF(listing_type, '') AS listing_type,
    CASE
        WHEN created_at < TIMESTAMP 'YYYY-MM-DD HH:MI:SS' THEN 'before_prd1'
        ELSE 'after_prd1'
    END AS period,
    count(*) AS rows
FROM city_notify_subscriptions
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
```

Split city-launch rows before and after the PRD 1 deploy: earlier whole-city roommate and sublet
requests were stored as city-launch rows (`listing_type = ''`), and the city-launch mailing
(`src/app/api/cron/city-launch/route.ts`, `listing_type = ''`, `district_slug = ''`,
`consent = true`, `notified_at IS NULL`) still selects them.

Saved interests in the bot (`telegram_subscriptions`, `target_key` = `b:<uuid>`, `d:<slug>` or
`c:<city>`). The bot is not launched; the table exists in production only after the owner
applies the bot's migrations.

```sql
SELECT
    split_part(target_key, ':', 1) AS target,
    CASE
        WHEN created_at < TIMESTAMP 'YYYY-MM-DD HH:MI:SS' THEN 'before_prd1'
        ELSE 'after_prd1'
    END AS period,
    count(*) AS rows
FROM telegram_subscriptions
GROUP BY 1, 2
ORDER BY 1, 2;
```

Compare with the events for the same interval:

| Database rows                                | Client event                                                 | Bot event                                            |
| -------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| `listings_city`, `listings_district` by type | `listing_interest_saved` by `listing_type`, `district_scope` | none                                                 |
| `city_launch`                                | none (no client event on the city form)                      | none: rows only                                      |
| `b:` and `d:`                                | none                                                         | `tg_subscribed` with `already` not true, by `target` |
| `c:`                                         | none                                                         | `tg_city_requested` with `already` not true          |

- The waitlist has no server event (D32): `listing_interest_saved` and the rows are the two
  counts of the same saves, never two conversions.
- A repeat save of the same e-mail and class updates the existing row (`created_at` unchanged)
  but fires `listing_interest_saved` again, so events can exceed new rows.

```sql
-- HogQL. Event side of the comparison. Counts only.
SELECT
    event,
    coalesce(toString(properties.listing_type), '') AS listing_type,
    multiIf(
        event = 'listing_interest_saved', toString(properties.district_scope),
        event = 'tg_subscribed', toString(properties.target),
        ''
    ) AS scope,
    count() AS events
FROM events
WHERE event IN ('listing_interest_saved', 'tg_subscribed', 'tg_city_requested')
    AND (event NOT IN ('tg_subscribed', 'tg_city_requested')
        OR coalesce(toString(properties.already), '') != 'true')
    AND timestamp >= toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
    AND timestamp < toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
GROUP BY event, listing_type, scope
ORDER BY event, listing_type, scope
```

## 5. Two full weeks after the release

Compare week 1 and week 2, Monday to Sunday (Europe/Warsaw), starting with the first full week
after the PRD 1 deploy. Report counts, not rates, while samples are small. Run the queries below
over the two weeks; the week column splits them.

Entries by `entry_page_type` (the session's entry) and by `page_type` (sessions that touched each
page type):

```sql
-- HogQL. Sessions per week by entry page type.
SELECT
    toStartOfWeek(toTimeZone(first_seen, 'Europe/Warsaw'), 1) AS week,
    entry_page_type,
    count() AS sessions
FROM (
    SELECT
        properties.$session_id AS session_id,
        min(timestamp) AS first_seen,
        argMin(toString(properties.entry_page_type), timestamp) AS entry_page_type
    FROM events
    WHERE timestamp >= toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
        AND timestamp < toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
        AND properties.$session_id IS NOT NULL
    GROUP BY session_id
)
GROUP BY week, entry_page_type
ORDER BY week, sessions DESC
```

```sql
-- HogQL. Sessions per week that touched each page type.
SELECT
    toStartOfWeek(toTimeZone(timestamp, 'Europe/Warsaw'), 1) AS week,
    toString(properties.page_type) AS page_type,
    uniq(properties.$session_id) AS sessions
FROM events
WHERE timestamp >= toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
    AND timestamp < toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
    AND properties.$session_id IS NOT NULL
GROUP BY week, page_type
ORDER BY week, sessions DESC
```

Useful actions: sessions per week with each action step of the web funnels. Read each event on
its own line; do not add them up (one click can send two of them, see 2.2).

```sql
-- HogQL. Sessions per week with each useful action.
SELECT
    toStartOfWeek(toTimeZone(timestamp, 'Europe/Warsaw'), 1) AS week,
    event,
    uniq(properties.$session_id) AS sessions
FROM events
WHERE event IN ('listing_external_contact_clicked', 'interest_modal_opened',
        'listing_interest_saved', 'create_listing_publish_started', 'cost_form_started',
        'cost_form_submit_success', 'telegram_bot_opened', 'checker_cta_clicked')
    AND coalesce(toString(properties.edit), '') != 'true'
    AND timestamp >= toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
    AND timestamp < toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
    AND properties.$session_id IS NOT NULL
GROUP BY week, event
ORDER BY week, event
```

For the bot, run 2.4 once per week. Run 2.5 separately (30-day window).

Saved requests: the database queries of section 4, one week at a time (replace the `period`
CASE with `created_at >= TIMESTAMP '<week start, UTC>' AND created_at < TIMESTAMP '<week end,
UTC>'` in a `WHERE`), next to the event-side query for the same week.

Sources: sessions per week by first-touch `ref`, UTM and referring domain. The SDK's
`$session_entry_utm_source` and `$session_entry_referring_domain` come from the session's first
URL. The provider's `ref` and `utm_*` super properties are registered by the same effect that
sends the landing `$pageview`. Before the FR-13 fix they were not stored when that effect ran
before `posthog.init` (posthog-js 1.374 `register_once` writes through `this.persistence`,
created in `init`), so they shared FR-13's loss on landings. Since T002, `init` runs before
React hydrates, so they are registered on every landing; verify after deploy.

```sql
-- HogQL. Sessions per week by source.
SELECT
    toStartOfWeek(toTimeZone(first_seen, 'Europe/Warsaw'), 1) AS week,
    ref,
    utm_source,
    referring_domain,
    count() AS sessions
FROM (
    SELECT
        properties.$session_id AS session_id,
        min(timestamp) AS first_seen,
        argMin(coalesce(toString(properties.ref), ''), timestamp) AS ref,
        argMin(coalesce(toString(properties.$session_entry_utm_source),
            toString(properties.utm_source), ''), timestamp) AS utm_source,
        argMin(coalesce(toString(properties.$session_entry_referring_domain),
            toString(properties.$referring_domain), ''), timestamp) AS referring_domain
    FROM events
    WHERE timestamp >= toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
        AND timestamp < toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
        AND properties.$session_id IS NOT NULL
    GROUP BY session_id
)
GROUP BY week, ref, utm_source, referring_domain
ORDER BY week, sessions DESC
```

Errors: `listing_interest_failed` by `error_code` and `checker_check_failed` by `reason`.

```sql
-- HogQL. Errors per week.
SELECT
    toStartOfWeek(toTimeZone(timestamp, 'Europe/Warsaw'), 1) AS week,
    event,
    coalesce(toString(properties.error_code), toString(properties.reason), '') AS code,
    count() AS events
FROM events
WHERE event IN ('listing_interest_failed', 'checker_check_failed')
    AND timestamp >= toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
    AND timestamp < toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
GROUP BY week, event, code
ORDER BY week, event, code
```

## 6. Limitations

- **Landing capture (FR-13).** Before the fix, `posthog.init` ran in the provider's own effect,
  after its children's effects, and posthog-js drops a `capture` made before `init`. So the
  first page of a full page load could lose its `$pageview`, its events captured on mount
  (`checker_viewed`, `listing_detail_viewed`, `building_detail_viewed`, `auth_started`, ...) and
  its `ref` / UTM super properties. The e2e build reproduced it (T002, 2026-11-19): `auth_started`
  on the login page and the `$pageview` of server renders that failed (404, 500) were dropped,
  while static pages such as the home page kept their `$pageview`. City pages could not be
  checked without a database. The fix (T002) runs `init` in `src/instrumentation-client.ts`,
  before React hydrates. It is built and tested (`e2e/posthog-landing.spec.ts`) but **not
  deployed or verified**: after deploy, check Live Events, and in the first full week sessions
  with `$pageview` should be at least 90 % of sessions with `$web_vitals` (spec 01,
  Assumption). Until that check passes, E8 and E9 readouts that split by entry page are not
  valid, and `location_score_viewed` stays the fallback for building entries in older data.
- **Memory mode.** Without consent a full page load starts a new visitor and session, so the
  session's entry and the provider's `ref` / UTM are lost on reload, and any step after a reload
  (for example a sign-in round trip) leaves the funnel. `page_type` itself is recomputed from
  the URL on every event.
- **`entry_page_type` restarts on reload** (spec 01): always in memory mode; in consented mode
  only for events that lack the SDK's `$session_entry_pathname`.
- **The owner's anonymous visits cannot be excluded** in memory mode; a readout says so.
- **Numbers before 2026-07-28 are not comparable** (D10): they counted only consenting
  visitors.
- **PostHog project.** Production moves to a new PostHog EU Cloud project with the PRD 1
  deploy (D30, 2026-11-19); history before the move stays in the US project. A readout that
  spans the move date queries both and reports them separately
  (`docs/ops/posthog-eu-migration.md`).
- **E8 and E9 thresholds** (D28, counts over two full weeks): E8 ≥ 5 roommate sessions with a
  role chosen and ≥ 2 with an offer viewed or interest saved; E9 ≥ 5 answered addresses and
  ≥ 1 `cost_form_started` from them.
- **Server and bot events cannot be joined** to client sessions: `listing_created`,
  `conversation_started` and `cost_report_submitted` use the account id or the `pf_anon` id, the
  bot `tg_<chatId>`.
- **Bot events from the contract reading** were lost before T050: the reading runs in its own
  `after()` task, concurrently with the webhook's flush. Since T050 that task awaits
  `flushPostHog` itself, so `tg_deposit_contract` and the `tg_deposit_verdict` after a read
  contract are delivered (unverified until the bot runs in production).
- **The bot is not launched**, so there are no `tg_*` events in production yet. The roommate
  events need the PRD 3 migration in production too, and the stage 2 ones the switch (see the
  roommate table in §1).
- **Roommate events are per profile life, not per person.** A person who deletes a profile and
  starts again sends a new `tg_roommate_flow_started` and `tg_roommate_profile_created` under the
  same `tg_<chatId>`; count persons with `count(DISTINCT distinct_id)`.
- **`address_checked` is 0 since 2026-09-14**; unverified (see 2.2).
- **Not run.** No query here has been run against PostHog or the production database.

## 7. Roommate stage 1 (E14)

The stage 1 readout of PRD 3 (FR-42, spec 05 §Stage 1 readout; E14 in
`docs/product/experiments.md`, H14). The thresholds are the owner's (D52, D58, D59), quoted here,
not set here; they are **Assumptions** he may change. The query shapes are this document's
(**Assumption**). Nothing here has been run: loop iterations never query PostHog or the
production database. `src/lib/bot/roommate-readouts.test.ts` checks the event, property, table
and column names of the queries against the `track(` calls in `src/` and `prisma/schema.prisma`.

Dates:

- **Day 0:** the day the PRD 3 stage 1 code is deployed to production (target about 2026-12-01).
  No roommate event or row exists before it.
- **Readout:** 2027-01-18 (a Monday); the owner decides on 2027-01-20 (D43). An extension (D59)
  is read on 2027-02-28.
- **Daily check:** every day from 2027-01-04 (D58, §7.4).

| Number                   | What it counts                                                                                   | From                     |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------ |
| Profiles                 | persons (`tg_<chatId>`) with ≥ 1 `tg_roommate_profile_created` from day 0 to the readout         | PostHog, query A         |
| Active                   | active profiles at the moment the query runs (spec 06 §Counts)                                   | database, query D        |
| Districts with ≥ 3       | districts named by ≥ 3 active profiles; an "any district" profile counts in none                 | database, queries D, E   |
| Profiles per owner-hour  | profiles ÷ logged posting hours                                                                  | query A, the posting log |
| Manual minutes a week    | logged manual minutes per full week, averaged over full weeks                                    | the posting log          |
| Reported, without a rule | flow → profile by entry (A23), opted-in persons and profiles, "any" profiles, budget bands (A26) | queries B, A, D, F       |

Profiles come from PostHog, not from the database, because a deleted profile leaves no row (E14
notes): a person who deleted the profile, or whose expired profile was deleted, still counts, and
a person who deleted and created again counts once. The database holds only the present: "active"
cannot be rebuilt for an earlier day, so run queries D, E and F on the readout day itself and
write the numbers down.

### 7.1 HogQL

Replace both dates before you run a query: the first with day 0, the second with the day after
the last day counted (2027-01-19 for the readout, tomorrow for the daily check). Dates are
Europe/Warsaw; the end is exclusive. Each query groups by person first, so it counts persons, never
events; it returns counts only, never a `distinct_id`.

```sql
-- HogQL. Query A, E14 (1): persons from day 0, and the "no data" check. One row.
-- `profiles` is the number the stop and go rules use.
SELECT
    sum(events) AS roommate_events,
    countIf(started) AS persons_flow_started,
    countIf(created) AS profiles,
    countIf(started AND created) AS persons_started_and_created,
    countIf(opted_in) AS persons_opted_in
FROM (
    SELECT
        distinct_id,
        count() AS events,
        countIf(event = 'tg_roommate_flow_started') > 0 AS started,
        countIf(event = 'tg_roommate_profile_created') > 0 AS created,
        countIf(event = 'tg_roommate_browse_opted_in'
            AND coalesce(toString(properties.already), '') != 'true') > 0 AS opted_in
    FROM events
    WHERE startsWith(distinct_id, 'tg_')
        AND startsWith(event, 'tg_roommate_')
        AND timestamp >= toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
        AND timestamp < toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
    GROUP BY distinct_id
)
```

```sql
-- HogQL. Query B, E14 (1) and A23: the same persons by the entry of their first
-- `tg_roommate_flow_started` (source and detail). Each person is in one row, so the column
-- sums equal query A. Counts only.
SELECT
    entry_source,
    entry_detail,
    countIf(started) AS persons_flow_started,
    countIf(created) AS profiles,
    countIf(started AND created) AS persons_started_and_created,
    countIf(opted_in) AS persons_opted_in
FROM (
    SELECT
        distinct_id,
        countIf(event = 'tg_roommate_flow_started') > 0 AS started,
        countIf(event = 'tg_roommate_profile_created') > 0 AS created,
        countIf(event = 'tg_roommate_browse_opted_in'
            AND coalesce(toString(properties.already), '') != 'true') > 0 AS opted_in,
        if(
            started,
            argMinIf(coalesce(toString(properties.entry_source), ''), timestamp,
                event = 'tg_roommate_flow_started'),
            argMinIf(coalesce(toString(properties.entry_source), ''), timestamp,
                event = 'tg_roommate_profile_created')
        ) AS entry_source,
        if(
            started,
            argMinIf(coalesce(toString(properties.entry_detail), ''), timestamp,
                event = 'tg_roommate_flow_started'),
            ''
        ) AS entry_detail
    FROM events
    WHERE startsWith(distinct_id, 'tg_')
        AND event IN ('tg_roommate_flow_started', 'tg_roommate_profile_created',
            'tg_roommate_browse_opted_in')
        AND timestamp >= toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
        AND timestamp < toDateTime('YYYY-MM-DD 00:00:00', 'Europe/Warsaw')
    GROUP BY distinct_id
)
GROUP BY entry_source, entry_detail
ORDER BY entry_source, entry_detail
```

Read them with these facts:

- `entry_source` is `direct`, `tg`, `fb`, `ig`, `threads`, `web`, `bot_menu` or `other` (§1);
  `entry_detail` is the group key of a `mate_<source>_<key>` link from the posting kit
  (`docs/marketing/roommate-posts.md`), `roommate` for the website block, and empty when the link
  had none. Only `tg_roommate_flow_started` carries `entry_detail`; a person with a profile but no
  flow event in the window (a lost event) is counted under the profile's `entry_source` with an
  empty detail.
- **A23** (at least half of the people who start finish): `persons_started_and_created` ÷
  `persons_flow_started`, reported without a rule; read counts while they are small. A draft lives
  7 days after its last answer (`DRAFT_LIFE_DAYS`), so persons who started in the last 7 days may
  still finish and the latest days undercount.
- `persons_opted_in`: persons who tapped "Message me when matching opens" at least once (the tap
  that switched it on, `already` not true). Switching it off on the own card sends no event, so
  this is "ever opted in"; `opted_in_profiles` of query D is "opted in now".
- Optional for A26: `tg_roommate_profile_created` also carries `budget_band`, the band of every
  profile saved since day 0, deleted ones included; query F is the band of the active ones.

### 7.2 Read-only SQL

Run these in the Supabase SQL editor of the production project (the PostHog MCP cannot read the
database). They only read, and they return counts only: never select `chat_id`, `tg_username`,
`about` or a row id (`p.id` is used only inside `count(DISTINCT …)`).

"Active" is the rule the bot's counts and the website block use (spec 06 §Counts,
`activeProfilesWhere` in `src/lib/roommate/counts.ts`): `status = 'active'`, `expires_at` later
than now (by time, so a profile the daily cron has not marked expired yet is not counted), and the
chat neither blocked nor banned. The bot's counts reply also leaves out the viewer and the people
they reported or were reported by, so a number a person sees in the bot is not a readout number.
The website block on `/warsaw/roommate` has no viewer: it shows the same Warsaw total and the five
most named districts, up to an hour old (`FLATMATE_COUNTS_REVALIDATE_SECONDS`).

```sql
-- Read-only SQL. Query D, E14 (2): active profiles, districts with >= 3, "any" and opted-in,
-- at the moment of the run. One row. Counts only.
WITH active AS (
    SELECT p.id, p.district_slugs, p.any_district, p.notify_on_open_at, p.notified_open_at
    FROM roommate_profiles p
    JOIN telegram_chats c ON c.id = p.chat_id
    WHERE p.status = 'active'
        AND p.expires_at > now()
        AND c.blocked_at IS NULL
        AND c.roommate_banned_at IS NULL
),
per_district AS (
    SELECT d.slug, count(DISTINCT a.id) AS profiles
    FROM active a
    CROSS JOIN unnest(a.district_slugs) AS d(slug)
    WHERE NOT a.any_district
    GROUP BY d.slug
)
SELECT
    (SELECT count(*) FROM active a) AS active_profiles,
    (SELECT count(*) FROM per_district pd WHERE pd.profiles >= 3) AS districts_with_3_or_more,
    (SELECT count(*) FROM active a WHERE a.any_district) AS any_district_profiles,
    (SELECT count(*) FROM active a
        WHERE a.notify_on_open_at IS NOT NULL AND a.notified_open_at IS NULL) AS opted_in_profiles;
```

```sql
-- Read-only SQL. Query E, E14 (2)-(3): active profiles naming each district, at the moment of
-- the run. Named districts only: an "any district" profile is counted in none, and a profile
-- naming several districts counts in each, so the rows do not add up to the active total.
SELECT d.slug AS district, count(DISTINCT p.id) AS active_profiles
FROM roommate_profiles p
JOIN telegram_chats c ON c.id = p.chat_id
CROSS JOIN unnest(p.district_slugs) AS d(slug)
WHERE p.status = 'active'
    AND p.expires_at > now()
    AND c.blocked_at IS NULL
    AND c.roommate_banned_at IS NULL
    AND NOT p.any_district
GROUP BY d.slug
ORDER BY active_profiles DESC, district;
```

```sql
-- Read-only SQL. Query F, A26: active profiles per budget band, at the moment of the run.
SELECT coalesce(p.budget_band, 'none') AS budget_band, count(*) AS active_profiles
FROM roommate_profiles p
JOIN telegram_chats c ON c.id = p.chat_id
WHERE p.status = 'active'
    AND p.expires_at > now()
    AND c.blocked_at IS NULL
    AND c.roommate_banned_at IS NULL
GROUP BY 1
ORDER BY 1;
```

Budget bands, per person a month, all-in (`BUDGET_BANDS` in `src/lib/roommate/rules.ts`, D68):
b1 ≤ 1,199 zł; b2 1,200 – 1,599; b3 1,600 – 1,999; b4 2,000 – 2,499; b5 ≥ 2,500. A26 asks
whether per-person budgets reach the about 2,000 – 2,500 zł a Warsaw flat costs for two, which is
b4 and b5. Reported without a rule.

### 7.3 Rules

The thresholds (D52, **Assumptions** set by the owner):

- **Stop** if any holds: fewer than 15 profiles; fewer than 1 profile per owner-hour; more than 30
  manual minutes a week (the average over full weeks).
- **Go** to stage 2 if all hold: ≥ 30 profiles; ≥ 20 active; ≥ 3 districts with ≥ 3 active
  profiles each.
- **Between** (no stop rule holds and not every go rule does): stage 1 is extended once to
  2027-02-28 with the same rules and the switch off (D59); on 2027-01-20 the owner then decides
  "continue the test". The extended readout runs the same queries from the same day 0 (HogQL end
  2027-03-01, the SQL on 2027-02-28) and applies the same stop and go rules; a second "between" is
  the owner's call on that day.
- **Not decided:** a stop rule can hold while every go rule holds too, for example 35 profiles over
  40 logged posting hours (0.875 per owner-hour) with 25 active and 3 districts. D52 does not say
  which wins; the readout reports both and the owner decides. The daily check (§7.4) reads only the
  go numbers (D58).

From the posting log (`docs/marketing/roommate-posting-log.md`):

- **Owner-hours:** the sum of "Minutes" over every row dated from day 0 to the readout day, ÷ 60.
  Profiles per owner-hour = profiles (query A) ÷ owner-hours. With no posting minutes logged the
  ratio cannot be read: "no data", never "infinite".
- **Manual minutes a week:** full weeks are Monday – Sunday (Europe/Warsaw) weeks that start on or
  after day 0 and end before the readout day; with day 0 on 2026-12-01 these are the six weeks from
  2026-12-07 to 2027-01-17. Sum "Manual minutes" over each full week's rows, then average over the
  full weeks that have at least one row. A week without a row is "missing": the readout names it
  and never counts it as 0 minutes. With every full week missing, the rule cannot be read.

### 7.4 The daily check from 2027-01-04 (D58)

Every day from 2027-01-04 the owner runs the go part of the rules:

1. **Profiles:** query A with tomorrow as the end date, in PostHog. His own Claude session with the
   PostHog MCP may run it; loop iterations never do (CLAUDE.md).
2. **Active and districts with ≥ 3:** query D in the Supabase SQL editor, because the PostHog MCP
   cannot read the database. The website block (§7.2) shows the same total and top districts up to
   an hour old, as a quick look; query D is the number of record.

The switch goes on at the first day on or after 2027-01-07 when all three go numbers hold (≥ 30
profiles, ≥ 20 active, ≥ 3 districts with ≥ 3 each): set `ROOMMATE_MATCHING_ENABLED=true` in the
production environment and redeploy (a changed variable applies only to a new deployment, spec 07
§Switch), then write the moment on the "Switch on at:" line of the posting log and add it as a
PostHog annotation; the stage 2 readout takes it as `{switch_at}`. From 2027-01-04 to 2027-01-06
the check runs but the switch waits for 2027-01-07. If no day before the readout has all three,
the switch waits for the 2027-01-18 readout and the 2027-01-20 decision. During an extension (D59)
it stays off.

### 7.5 Worked examples

Go: the E14 golden case (`docs/product/experiments.md`, "E14, worked example"), readout
2027-01-18.

| Number                                | Value                                                              | Rule               | Result      |
| ------------------------------------- | ------------------------------------------------------------------ | ------------------ | ----------- |
| Profiles (query A)                    | 34                                                                 | stop < 15; go ≥ 30 | no stop; go |
| Active on 2027-01-18 (query D)        | 22                                                                 | go ≥ 20            | go          |
| Districts with ≥ 3 (queries D, E)     | 3: `mokotow` 6, `wola` 4, `ochota` 3 (`praga-poludnie` 2 does not) | go ≥ 3             | go          |
| Profiles per owner-hour (log: 27.5 h) | 34 ÷ 27.5 = 1.24                                                   | stop < 1           | no stop     |
| Manual minutes a week (log)           | 18                                                                 | stop > 30          | no stop     |

No stop rule holds and every go rule holds: **go**. If the three go numbers had held on a day from
2027-01-07, the switch would have gone on that day (§7.4).

Between stop and go: 20 profiles; 1,000 posting minutes logged (16.7 h), so 20 ÷ 16.7 = 1.2 per
owner-hour; 22 manual minutes a week; 14 active; 1 district with ≥ 3 (`mokotow` 4, `wola` 2). No
stop rule holds (20 ≥ 15, 1.2 ≥ 1, 22 ≤ 30), and not every go rule does (20 < 30, 14 < 20, 1 < 3):
stage 1 is **extended** to 2027-02-28 with the switch off (D59), and on 2027-01-20 the owner
decides "continue the test".

### 7.6 No data, the PostHog project and the season

- **No data, not 0.** If query A returns `roommate_events = 0`, every PostHog number of the readout
  is "no data", never "0 profiles" and never "stop": the events did not arrive (the PRD 3 code, its
  migration or the PostHog key is missing in production, or the query reads the wrong project).
  Look for `tg_roommate_flow_started` in Live Events first. A posting log without rows is "no data"
  for owner-hours and manual minutes in the same way. With events present, 0 in query D is a real 0.
- **PostHog project.** Query the PostHog EU Cloud project (D30, `docs/ops/posthog-eu-migration.md`):
  production moves there with the PRD 1 deploy, and PRD 3 deploys with it or later, so every
  roommate event is there and the old US project holds none. The owner tests only on the dev bot,
  which runs without the PostHog key (E14 notes), so the PostHog counts need no exclusion list.
- **Season.** Stage 1 runs in the December – January trough: room demand peaks in August –
  September and the summer-semester wave comes in February
  (`docs/research/roommate-fit-and-test-2026-11-19.md`, "Seasonality"). A null result in January
  is weak evidence and a pass is strong evidence; the readout says so next to its result.

## 8. Roommate stage 2 (E15)

The stage 2 readout of PRD 3 (FR-43, spec 05 §Stage 2 readout; E15 in
`docs/product/experiments.md`, H15, and the push reading for H12; BRD A28). The thresholds are the
owner's (D52, D60), quoted here, not set here; they are **Assumptions** he may change. The query
shapes are this document's (**Assumption**). Nothing here has been run: loop iterations never query
PostHog or the production database. `src/lib/bot/roommate-readouts.test.ts` checks the event,
property, table and column names of the queries against the `track(` calls in `src/` and
`prisma/schema.prisma`.

Parameters (replace them as text before you run a query; Europe/Warsaw, the end is exclusive):

- **`{switch_at}`:** the moment `ROOMMATE_MATCHING_ENABLED` went on, from the "Switch on at:" line
  of `docs/marketing/roommate-posting-log.md` (also a PostHog annotation, spec 07 §Switch), written
  `YYYY-MM-DD HH:MM:SS`, for example `2027-01-08 10:30:00`. No stage 2 event exists before it (§1).
  If the switch went off and on again in between, the readout names both moments; the queries count
  from the first.
- **`{readout_at}`:** the end of the counted window. For the 14-day readout, `{switch_at}` plus 14
  days at the same clock time (`2027-01-22 10:30:00` in the example); run it at or after that
  moment. For the final readout, `2027-04-01 00:00:00`, so the window ends with 2027-03-31.

| Number                       | What it counts                                                                                                                                                              | From                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Qualifying persons           | persons whose profile was active at `{switch_at}`, or was created after it and is ≥ 14 days old at `{readout_at}` (E15, D74; "active" as query G reads it, §8.1)            | PostHog, query G        |
| Match rate                   | qualifying persons with ≥ 1 `tg_roommate_matched` (either role) from `{switch_at}` to `{readout_at}` ÷ qualifying persons                                                   | PostHog, query G        |
| Earlier E15 persons          | persons with `tg_roommate_profile_created` or `tg_roommate_profile_renewed` ≥ 14 days before `{readout_at}` and no `tg_roommate_profile_deleted` before `{switch_at}` (E15) | PostHog, query G        |
| Match rate, earlier E15 rule | the same over earlier E15 persons; reported without a rule (D74)                                                                                                            | PostHog, query G        |
| Pairs                        | `tg_roommate_matched` events with `role = 'completer'` in the window: one per pair                                                                                          | PostHog, query G        |
| Outcome persons              | persons with `tg_roommate_matched` in the window and a `tg_roommate_outcome` of `renting_together` or `talking` in it                                                       | PostHog, query G        |
| Browsing persons             | persons with ≥ 1 `tg_roommate_cards_viewed` in the window                                                                                                                   | PostHog, query G        |
| Push reading (H12)           | persons with `tg_roommate_push_sent`; of them, with a same-day `tg_roommate_cards_viewed` with `via = 'push'`; persons with `tg_roommate_push_opted_out`                    | PostHog, query H        |
| A28                          | `has_username` at the save; `tg_roommate_username_prompted` → `tg_roommate_username_set` by `context`; pairs waiting on a username                                          | PostHog, query I; SQL J |
| Mutual pairs among rows      | the cross-check of pairs (existing reaction rows only)                                                                                                                      | database, query J       |

Every number except query J comes from PostHog, because a deleted profile deletes its reactions
(E15 notes): a pair who found each other and deleted their profiles still counts in the events.

### 8.1 HogQL

Each query groups by person first, so it counts persons (and pairs as events), never lists one; it
returns counts only, never a `distinct_id`.

```sql
-- HogQL. Query G, E15 (1): qualifying persons (D74) and the persons of E15's earlier
-- definition with their match rates, pairs, outcome persons and browsing persons, and the
-- "no data" check. One row. Replace {switch_at} and {readout_at}.
SELECT
    sum(events_in_window) AS roommate_events_in_window,
    countIf(active_at_switch OR created_after_switch) AS qualifying_persons,
    countIf((active_at_switch OR created_after_switch) AND matched) AS qualifying_with_match,
    countIf(active_at_switch) AS qualifying_active_at_switch,
    countIf(earlier_qualifying) AS earlier_qualifying_persons,
    countIf(earlier_qualifying AND matched) AS earlier_qualifying_with_match,
    countIf(matched) AS matched_persons,
    sum(completer_events) AS pairs,
    countIf(matched AND good_outcome) AS outcome_persons,
    countIf(browsing) AS browsing_persons
FROM (
    SELECT
        distinct_id,
        countIf(timestamp >= toDateTime('{switch_at}', 'Europe/Warsaw')
            AND timestamp < toDateTime('{readout_at}', 'Europe/Warsaw')) AS events_in_window,
        (argMaxIf(event, timestamp, event IN ('tg_roommate_profile_created',
                'tg_roommate_profile_renewed', 'tg_roommate_profile_expired',
                'tg_roommate_profile_deleted')
            AND timestamp < toDateTime('{switch_at}', 'Europe/Warsaw'))
            IN ('tg_roommate_profile_created', 'tg_roommate_profile_renewed')) AS active_at_switch,
        (countIf(event = 'tg_roommate_profile_created'
            AND timestamp >= toDateTime('{switch_at}', 'Europe/Warsaw')
            AND timestamp < toDateTime('{readout_at}', 'Europe/Warsaw') - INTERVAL 14 DAY) > 0)
            AS created_after_switch,
        (countIf(event IN ('tg_roommate_profile_created', 'tg_roommate_profile_renewed')
            AND timestamp < toDateTime('{readout_at}', 'Europe/Warsaw') - INTERVAL 14 DAY) > 0
            AND countIf(event = 'tg_roommate_profile_deleted'
                AND timestamp < toDateTime('{switch_at}', 'Europe/Warsaw')) = 0)
            AS earlier_qualifying,
        (countIf(event = 'tg_roommate_matched'
            AND timestamp >= toDateTime('{switch_at}', 'Europe/Warsaw')
            AND timestamp < toDateTime('{readout_at}', 'Europe/Warsaw')) > 0) AS matched,
        countIf(event = 'tg_roommate_matched'
            AND coalesce(toString(properties.role), '') = 'completer'
            AND timestamp >= toDateTime('{switch_at}', 'Europe/Warsaw')
            AND timestamp < toDateTime('{readout_at}', 'Europe/Warsaw')) AS completer_events,
        (countIf(event = 'tg_roommate_outcome'
            AND coalesce(toString(properties.outcome), '') IN ('renting_together', 'talking')
            AND timestamp >= toDateTime('{switch_at}', 'Europe/Warsaw')
            AND timestamp < toDateTime('{readout_at}', 'Europe/Warsaw')) > 0) AS good_outcome,
        (countIf(event = 'tg_roommate_cards_viewed'
            AND timestamp >= toDateTime('{switch_at}', 'Europe/Warsaw')
            AND timestamp < toDateTime('{readout_at}', 'Europe/Warsaw')) > 0) AS browsing
    FROM events
    WHERE startsWith(distinct_id, 'tg_')
        AND startsWith(event, 'tg_roommate_')
        AND timestamp < toDateTime('{readout_at}', 'Europe/Warsaw')
    GROUP BY distinct_id
)
```

```sql
-- HogQL. Query H, H12: the daily push from {switch_at} to {readout_at}. One row. A "day" is a
-- Europe/Warsaw calendar day; a person counts once, a person-day once.
SELECT
    countIf(push_days > 0) AS persons_pushed,
    countIf(push_days_viewed > 0) AS persons_pushed_and_viewed_same_day,
    sum(push_days) AS person_days_pushed,
    sum(push_days_viewed) AS person_days_pushed_and_viewed,
    countIf(opted_out) AS persons_opted_out
FROM (
    SELECT
        distinct_id,
        countIf(pushed) AS push_days,
        countIf(pushed AND viewed_via_push) AS push_days_viewed,
        (sum(opt_outs) > 0) AS opted_out
    FROM (
        SELECT
            distinct_id,
            toDate(toTimeZone(timestamp, 'Europe/Warsaw')) AS day,
            (countIf(event = 'tg_roommate_push_sent') > 0) AS pushed,
            (countIf(event = 'tg_roommate_cards_viewed'
                AND coalesce(toString(properties.via), '') = 'push') > 0) AS viewed_via_push,
            countIf(event = 'tg_roommate_push_opted_out') AS opt_outs
        FROM events
        WHERE startsWith(distinct_id, 'tg_')
            AND event IN ('tg_roommate_push_sent', 'tg_roommate_cards_viewed',
                'tg_roommate_push_opted_out')
            AND timestamp >= toDateTime('{switch_at}', 'Europe/Warsaw')
            AND timestamp < toDateTime('{readout_at}', 'Europe/Warsaw')
        GROUP BY distinct_id, day
    )
    GROUP BY distinct_id
)
```

```sql
-- HogQL. Query I, A28: the username at the save (the person's last `tg_roommate_profile_created`
-- before {readout_at}) and the username prompts from {switch_at} by context. One row.
SELECT
    countIf(created) AS persons_created,
    countIf(created AND last_save_had_username = 'true') AS saved_with_username,
    countIf(created AND last_save_had_username != 'true') AS saved_without_username,
    countIf(prompted_browse) AS persons_prompted_browse,
    countIf(prompted_browse AND set_browse) AS persons_prompted_and_set_browse,
    countIf(prompted_reveal) AS persons_prompted_reveal,
    countIf(prompted_reveal AND set_reveal) AS persons_prompted_and_set_reveal
FROM (
    SELECT
        distinct_id,
        (countIf(event = 'tg_roommate_profile_created') > 0) AS created,
        argMaxIf(coalesce(toString(properties.has_username), ''), timestamp,
            event = 'tg_roommate_profile_created') AS last_save_had_username,
        (countIf(event = 'tg_roommate_username_prompted'
            AND coalesce(toString(properties.context), '') = 'browse'
            AND timestamp >= toDateTime('{switch_at}', 'Europe/Warsaw')) > 0) AS prompted_browse,
        (countIf(event = 'tg_roommate_username_set'
            AND coalesce(toString(properties.context), '') = 'browse'
            AND timestamp >= toDateTime('{switch_at}', 'Europe/Warsaw')) > 0) AS set_browse,
        (countIf(event = 'tg_roommate_username_prompted'
            AND coalesce(toString(properties.context), '') = 'reveal'
            AND timestamp >= toDateTime('{switch_at}', 'Europe/Warsaw')) > 0) AS prompted_reveal,
        (countIf(event = 'tg_roommate_username_set'
            AND coalesce(toString(properties.context), '') = 'reveal'
            AND timestamp >= toDateTime('{switch_at}', 'Europe/Warsaw')) > 0) AS set_reveal
    FROM events
    WHERE startsWith(distinct_id, 'tg_')
        AND event IN ('tg_roommate_profile_created', 'tg_roommate_username_prompted',
            'tg_roommate_username_set')
        AND timestamp < toDateTime('{readout_at}', 'Europe/Warsaw')
    GROUP BY distinct_id
)
```

Read them with these facts:

- **Match rate** = `qualifying_with_match` ÷ `qualifying_persons`, over the qualifying persons of
  D74 (the owner's answer to PRD 3 Q-15, 2026-11-19); the rules (§8.3) read it. **Earlier E15
  rule** = `earlier_qualifying_with_match` ÷ `earlier_qualifying_persons`, over E15's definition
  before D74; it is reported next to the first, without a rule, so the readout shows what D74
  changed.
- **Qualifying (D74)**, per person: the profile was active at `{switch_at}` (`active_at_switch`),
  or was created after it at least 14 days before `{readout_at}` (`created_after_switch`). "Active
  at the switch" is read from the events: the person's last `tg_roommate_profile_created`,
  `tg_roommate_profile_renewed`, `tg_roommate_profile_expired` or `tg_roommate_profile_deleted`
  before `{switch_at}` is a create or a renewal. Both readouts end at least 14 days after
  `{switch_at}`, so a profile active at the switch is at least 14 days old at the readout. At the
  14-day readout `{readout_at}` − 14 days is `{switch_at}`, so no profile created after the switch
  is old enough: `qualifying_persons` = `qualifying_active_at_switch`. The "created after it" part
  counts only at the final readout, where no rule reads the match rate.
- Cases, per person (name them in the readout when they change a result):
  - a profile that expired before the switch and was not renewed by then is not qualifying under
    D74 (it was never shown); the earlier rule counts it until its grace-period delete;
  - a profile that expired and was renewed before the switch, and a person who deleted a profile
    and created a new one before the switch, are active at the switch; the earlier rule leaves the
    second out (a delete before the switch);
  - a profile that expired before the switch and was renewed after it was neither active at the
    switch nor created after it, so it is not qualifying (agent's reading of "created after it");
  - a person whose profile was active at the switch stays qualifying after a later delete, as a
    pair who deleted their profiles after matching still counts;
  - a profile hidden by moderation before the switch counts as active (a hide sends
    `tg_roommate_profile_hidden`, not an expiry or a delete, and a lifted hide sends nothing);
  - the daily cron marks an expiry at its next run (08:00 and 09:00 UTC), so a profile whose
    `expires_at` passed after the last run before `{switch_at}` has no
    `tg_roommate_profile_expired` yet and counts as active: at most one day's expiries.
- `tg_roommate_matched` fires once per person of a new pair: `role = 'completer'` for the tap that
  formed it, `role = 'waiting'` under the other person's chat (§1). So `pairs` counts each pair once,
  and `matched_persons` is about twice `pairs`.
- **Outcome persons** count only persons who also have `tg_roommate_matched` in the window, and
  both people of one pair may answer (D60: outcomes are persons). The outcome question goes out
  21 days after the match (`OUTCOME_QUESTION_DAYS`), so the 14-day readout shows almost none: only
  "Found someone here" after a delete, sent as `renting_together` with `asked = 'delete'`. The
  person's own answer, not a verified move-in.
- `tg_roommate_cards_viewed` is one per "Show people" tap with its `via` (`card`, `open_message`,
  `push`, `next`). The H12 reading uses `via = 'push'`, the button under the daily push; a tap on an
  older push's button counts on the day of the tap. `tg_roommate_push_sent` is one per delivered push,
  at most one a day per person; `tg_roommate_push_opted_out` only for the tap that turned it off.
  Reported without a rule.
- **A28:** `has_username` is read from the person's last save, so a person who saved twice counts
  once. A prompt with `context = 'browse'` comes before the cards, one with `context = 'reveal'`
  after a mutual match; `tg_roommate_username_set` fires on Done when a username is found. Reported
  without a rule; query J adds the pairs that wait on a username now.

### 8.2 Read-only SQL

Run it in the Supabase SQL editor of the production project, on the readout day, and write the
numbers down; it reads the present only. It returns counts only: the usernames are read only as
`IS NULL`, never selected.

A pair is the two `interest` rows of two profiles, both with `matched_at` set by one statement
(`formMutualMatch` in `src/lib/roommate/store.ts`); each row's `revealed_at` marks the reveal to
the person who gave it (`claimReveal`).

```sql
-- Read-only SQL. Query J, E15 (2) and A28: mutual pairs among the existing rows, at the moment
-- of the run. One row. Counts only. Replace {switch_at} and {readout_at}.
WITH pairs AS (
    SELECT
        r.matched_at,
        (r.revealed_at IS NOT NULL AND b.revealed_at IS NOT NULL) AS revealed,
        (p.tg_username IS NULL OR q.tg_username IS NULL) AS username_missing
    FROM roommate_reactions r
    JOIN roommate_reactions b
        ON b.from_profile_id = r.to_profile_id AND b.to_profile_id = r.from_profile_id
    JOIN roommate_profiles p ON p.id = r.from_profile_id
    JOIN roommate_profiles q ON q.id = r.to_profile_id
    WHERE r.kind = 'interest'
        AND b.kind = 'interest'
        AND r.matched_at IS NOT NULL
        AND b.matched_at IS NOT NULL
        AND r.from_profile_id < r.to_profile_id
)
SELECT
    count(*) AS mutual_pairs,
    count(*) FILTER (WHERE x.matched_at >= ('{switch_at}'::timestamp AT TIME ZONE 'Europe/Warsaw')
        AND x.matched_at < ('{readout_at}'::timestamp AT TIME ZONE 'Europe/Warsaw'))
        AS mutual_pairs_in_window,
    count(*) FILTER (WHERE x.revealed) AS pairs_revealed_to_both,
    count(*) FILTER (WHERE NOT x.revealed) AS pairs_not_revealed,
    count(*) FILTER (WHERE NOT x.revealed AND x.username_missing) AS pairs_waiting_on_username
FROM pairs x;
```

How to read the cross-check:

- `mutual_pairs_in_window` ≤ `pairs` of query G: a deleted profile deletes its reactions (and with
  them the pair's rows), so rows only undercount. More rows than `completer` events means events
  were lost; say so and use the larger number with that note.
- `pairs_waiting_on_username`: matched, the reveal not delivered to both, and a username missing on
  either side (spec 07 §Reveal: the reveal waits for Done). Many of them is A28's risk: "matches
  stall at the reveal". `pairs_not_revealed` also holds pairs where a profile is no longer active or
  a chat blocked the bot; the send-hour retry picks a pair up only when both are active with a
  username.

### 8.3 Rules

The thresholds (D52 and D60, **Assumptions** set by the owner). The match-rate rules read the
match rate over the qualifying persons of D74; the earlier E15 rule's rate is reported next to it
without a rule (§8.1).

- **At switch + 14 days, continue** if the match rate is ≥ 30 %.
- **At switch + 14 days, stop** (D60) if fewer than 15 % of qualifying persons have a match, or if
  no pair formed (`pairs = 0`) among 20 or more browsing persons.
- **Fewer than 10 qualifying persons:** report counts only; the match-rate rules "cannot be read"
  (E15). The browsing rule is a count and is read as above.
- **Between 15 % and 30 %** no rule holds; D52 and D60 do not say what follows. The readout reports
  the numbers and the owner decides.
- **At about 2027-03-31** (query G with `{readout_at}` = `2027-04-01 00:00:00`, query J that day):
  continue if there are ≥ 10 pairs and ≥ 3 outcome persons; **stop** (D60) below 10 pairs. With
  ≥ 10 pairs but fewer than 3 outcome persons no rule holds, and the owner decides.
- Outcomes are counted as persons (D60).

### 8.4 Worked examples

The E15 examples (`docs/product/experiments.md`, "E15, qualifying persons (D74)" and "E15, stop
rule (D60)"): switch 2027-01-08, readout 2027-01-22.

| Case             | Numbers                                        | Rule                              | Result                                 |
| ---------------- | ---------------------------------------------- | --------------------------------- | -------------------------------------- |
| Holds            | 24 qualifying, 8 with a match: 8 ÷ 24 = 33 %   | continue ≥ 30 %                   | the 14-day rule holds; 5 pairs so far  |
| Stop on the rate | 24 qualifying, 3 with a match: 3 ÷ 24 = 12.5 % | stop < 15 %                       | **stop**                               |
| Stop on browsing | 22 browsing persons, no `completer` event      | stop: no pair among ≥ 20 browsing | **stop**                               |
| Too few to read  | 9 qualifying, 4 with a match                   | fewer than 10 qualifying          | counts only: "the rule cannot be read" |

In the first case the pair rule waits for about 2027-03-31: 5 pairs so far is not yet "below 10".

Who qualifies (D74), with the switch at 2027-01-08 10:30 and the readout at 2027-01-22 10:30.
Every profile below lives 30 days (`PROFILE_LIFE_DAYS`; its move-in month ends later), and the
daily cron deletes an expired one 14 days after its expiry (`GRACE_DAYS`):

| Person | Profile events                                             | D74                                               | Earlier E15 rule               |
| ------ | ---------------------------------------------------------- | ------------------------------------------------- | ------------------------------ |
| A      | created 2026-11-20, expired 2026-12-20, deleted 2027-01-03 | no: deleted before the switch                     | no: deleted before the switch  |
| B      | created 2026-12-01, expired 2026-12-31, deleted 2027-01-14 | no: expired at the switch, never shown            | yes                            |
| C      | created 2026-12-01, renewed 2026-12-29                     | yes: active at the switch                         | yes                            |
| D      | created 2026-12-20 (expires 2027-01-19, in the window)     | yes: active at the switch                         | yes                            |
| E      | created 2026-11-25, deleted 2026-12-15, created 2026-12-28 | yes: active at the switch                         | no: deleted before the switch  |
| F      | created 2027-01-10                                         | no: under 14 days old (at the final readout: yes) | no (at the final readout: yes) |

D74 counts C, D and E; the earlier E15 rule counts B, C and D. Over a whole readout: 30 earlier
E15 persons, 7 of them like B, and 1 more person like E give 30 − 7 + 1 = 24 qualifying persons.
Say 8 persons matched, all among the 23 persons both rules count (the 7 were never shown, and E
did not match): the match rate is 8 ÷ 24 = 33 % and the 14-day rule holds (the first row above);
the earlier E15 rule's rate is 8 ÷ 30 = 26.7 %, between 15 % and 30 %, where no rule holds.

### 8.5 No data, the PostHog project and the season

- **No data, not 0.** If query G returns `roommate_events_in_window = 0`, every PostHog number of
  the readout is "no data", never "0 % match rate" and never "stop": the events did not arrive, or
  `{switch_at}` is wrong. Look for `tg_roommate_cards_viewed` in Live Events first. With events
  present, 0 pairs is a real 0.
- **PostHog project.** The EU Cloud project, as in §7.6 (D30).
- **Season.** The 14-day readout falls in January, before the February summer-semester wave
  (§7.6); a null result then is weak evidence and the readout says so.

## How this was checked

Searches over `src/` (non-test files) on 2026-11-19:

- `grep -rnE "capture\(" src --include='*.ts' --include='*.tsx' --exclude='*.test.ts' --exclude='*.test.tsx'`
  for every client capture call;
- `grep -rnE "captureServerEvent|trackServerEvent|serverCapture|from '@/lib/posthog-server'" src`
  for every server event;
- `grep -rnE "track\(" src/lib/bot --include='*.ts' --exclude='*.test.ts'` for every bot event;
- `grep -rnE "\.identify\(|\.reset\(|\.alias\(" src` (only the server's `identifyUser`: the client
  never identifies);
- then the property builders: `src/lib/analytics/{page-context,listing-events,interest-events,checker-events,building-events,telegram-events}.ts`,
  `src/lib/roommate-roles.ts`, `src/lib/cost-figures.ts` (`answerProperties`),
  `src/lib/bot/check-events.ts`, `src/lib/bot/start-payload.ts`, `src/lib/cost-submit-params.ts`;
- for PRD 3: the `track(` calls of `src/lib/bot/roommate-{flow,matching,reveal,safety,daily,close}.ts`,
  `src/lib/roommate/rules.ts` (`profileCreatedProperties`, `profileEditedProperties`,
  `countBand`), `src/components/listings/find-flatmate-block.tsx` and
  `src/components/listings/roommate-role-selector.tsx`; `src/lib/bot/roommate-readme.test.ts`
  checks the bot README's events tables against the `track(` calls;
- for §7: `openRoommate`, `handleAdultYes` and `handleOptInTap` in `src/lib/bot/roommate-flow.ts`,
  `ROOMMATE_ENTRY_SOURCE` and `parseStartPayload` in `src/lib/bot/start-payload.ts`,
  `activeProfilesWhere` in `src/lib/roommate/counts.ts`, `optInToOpenMessage` and
  `waitsForOpenMessage` in `src/lib/roommate/store.ts`, `BUDGET_BANDS` and `DRAFT_LIFE_DAYS` in
  `src/lib/roommate/rules.ts`, `src/lib/roommate/website-counts.ts`, and the `RoommateProfile` and
  `TelegramChat` models; `src/lib/bot/roommate-readouts.test.ts` checks the queries' events,
  properties, tables and columns, the "active" filter and the bands against the code and the schema;
- for §8: `handleShowTap`, `showNextCard` (`CARDS_VIA`), `handleInterestTap`, `handleUsernameDone`,
  `handlePushToggle` and `handleOutcomeTap` in `src/lib/bot/roommate-matching.ts`, `revealPair` in
  `src/lib/bot/roommate-reveal.ts`, the push and outcome-question jobs and the housekeeping in
  `src/lib/bot/roommate-daily.ts`, `handleDeleteReason` and the renewal in
  `src/lib/bot/roommate-flow.ts`, `formMutualMatch`, `claimReveal` and `pendingRevealPartners` in
  `src/lib/roommate/store.ts`, `OUTCOMES`, `OUTCOME_QUESTION_DAYS` and `profileCreatedProperties`
  (`has_username`) in `src/lib/roommate/rules.ts`, and the `RoommateReaction` and `RoommateProfile`
  models; the same test checks §8's queries;
- posthog-js 1.374 (`node_modules/posthog-js/lib/src/utils/event-utils.js`, `session-props.js`,
  `posthog-core.js`) for the automatic properties and `register_once`;
- the tables in `prisma/schema.prisma` and their migrations.

When an event, property or table changes, update this document in the same change.
