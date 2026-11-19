# Activation funnels (PRD 1)

How to read the PRD 1 activation funnels in PostHog and in the database. Spec:
`docs/specs/05-measurement-docs.md` §Activation funnels document (FR-47, FR-5). Experiments: E8
(roommate, H2) and E9 (address, H3) in `docs/product/experiments.md`.

Written on 2026-11-19 from the code at `23e0c34`. Every event and property below was checked
by a search of `src/` (see [How this was checked](#how-this-was-checked)), not copied from the
specs. None of the queries has been run: loop iterations never query PostHog. HogQL and SQL were
checked by reading only, so run each one on a short interval before you rely on it.

> **Validity.** E8 and E9 readouts are **valid only after FR-13 (landing capture, moved from
> PRD 2 FR-1 by D22; task T002) is verified** in PostHog Live Events. The fix is built (T002,
> 2026-11-19: `posthog.init` runs in `src/instrumentation-client.ts`, before React hydrates) but
> not deployed or verified. Data from before the deploy lost the landing `$pageview` and
> mount-time events on many first pages, so entries are undercounted and every split by entry
> page is wrong there (see [Limitations](#6-limitations)).

This document sets no targets. E8 and E9 thresholds are the owner's, set on 2026-11-19 (D28,
§6 and `docs/product/experiments.md`). It contains no A/B
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
| `roommate_intent_selected`         | `src/components/listings/roommate-role-selector.tsx` (`chooseRoommateRole` in `src/lib/roommate-roles.ts`)            | `intent` (`find_room` \| `offer_room`). `offer_room` is a link to `/create-listing?type=roommate`.                                                                                                                                                                                                                                                       |
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
| `telegram_bot_opened`              | `src/components/costs/telegram-bot-cta.tsx` (`src/lib/analytics/telegram-events.ts`)                                  | `source` (`checker` \| `empty`), `has_building_context`. Rendered on the checker only. One click also fires `checker_cta_clicked {cta: 'telegram'}`.                                                                                                                                                                                                     |
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

| Event                         | Fires in                                                              | Properties                                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tg_bot_started`              | `src/lib/bot/bot.ts` (`handleStart`)                                  | `payload` (raw `/start` payload or null: `dep`, `b_<uuid>`, `d_<slug>`, `web_<source>`, campaign codes), `is_new`. Fires on every `/start`.                |
| `tg_address_checked`          | `bot.ts` (`replyCard`, properties from `src/lib/bot/check-events.ts`) | `level`, `district`, `has_building`, `report_count`, `entry_source` (`typed_address` \| `link_building`), `lookup_level`, `source_kind`, `n`, `incomplete` |
| `tg_district_checked`         | `bot.ts` (`replyDistrict`, `check-events.ts`)                         | `district`, `report_count`, `entry_source` (`typed_district` \| `link_district`), `source_kind`, `n`, `incomplete`                                         |
| `tg_subscribed`               | `bot.ts` (`handleSubscribe`)                                          | `target` (`building` \| `district`), `district` (district only), `already` (true when the interest existed)                                                |
| `tg_city_requested`           | `bot.ts` (`cw:` callback)                                             | `city`, `city_key`, `waiting`, `already`. A city waitlist, saved as a `c:` row; used only for the database comparison.                                     |
| `tg_deposit_flow_started`     | `src/lib/bot/deposit-flow.ts` (`startDepositFlow`)                    | none. Fires on every start; a restart abandons the open case.                                                                                              |
| `tg_deposit_verdict`          | `deposit-flow.ts` (`sendVerdict`)                                     | `reason`, `protocol`, `strength`, `overdue`, `claim`, `contract`, `deadline_source`                                                                        |
| `tg_deposit_letter_generated` | `deposit-flow.ts` (`dep:letter:` callback)                            | `reason`, `filled`                                                                                                                                         |
| `tg_deposit_letter_sent`      | `deposit-flow.ts` (`dep:sent:` callback)                              | none. The person's own tap on "sent"; nobody checks that a letter went out.                                                                                |
| `tg_deposit_outcome`          | `deposit-flow.ts` (`dep:o:` callback)                                 | `outcome` (`full` \| `partial` \| `none`), `after` (`deadline` \| `letter`, the follow-up it answers). Can fire more than once per case.                   |

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
- **Bot events from the contract reading may be lost** until T050 ships: the reading runs in its
  own `after()` task, concurrently with the webhook's flush, so `tg_deposit_contract` and the
  `tg_deposit_verdict` sent after a read contract can miss the flush.
- **The bot is not launched**, so there are no `tg_*` events in production yet.
- **`address_checked` is 0 since 2026-09-14**; unverified (see 2.2).
- **Not run.** No query here has been run against PostHog or the production database.

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
- posthog-js 1.374 (`node_modules/posthog-js/lib/src/utils/event-utils.js`, `session-props.js`,
  `posthog-core.js`) for the automatic properties and `register_once`;
- the tables in `prisma/schema.prisma` and their migrations.

When an event, property or table changes, update this document in the same change.
