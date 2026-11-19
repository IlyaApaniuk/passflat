# 05 · Measurement documentation and the final check (PRD 1 package E)

Requirements FR-5 and FR-47 – FR-49 of PRD 1. Loop iterations never query PostHog; queries are
written and checked by reading. No A/B tests, revenue forecasts or universal target percentages
(**Decided**).

## Activation funnels document

FR-47, FR-5. `docs/analytics/activation-funnels.md`, written after packages A–D, from the code
as it is (event names and properties checked with a search of `src/`, not copied from specs).

1. **Event table:** every event the five funnels use, where it fires (file), its properties,
   whether it is client, server or bot, and its identity (visitor id, e-mail for the two
   waitlist server events, `tg_<chatId>`).
2. **Funnels**, each with steps, a HogQL query or the PostHog funnel settings, and its window:
   1. Roommate, counted in sessions per step, not events (`$pageview` re-fires on every filter
      change and checker `?p=` update, because `replaceState` updates `useSearchParams`):
      sessions with `page_type=roommate` → `listing_detail_viewed` →
      `listing_external_contact_clicked` or `interest_modal_opened`; `listing_interest_saved`
      as a separate branch; the offer branch `roommate_intent_selected` (`offer_room`) →
      `create_listing_started` → `create_listing_publish_started` → server `listing_created`
      with type roommate. `intent` is a breakdown, not a required step (choosing is optional).
      State that Passflat has had no roommate listing since June 2026 (H10), so listing views
      are expected near zero; `results_count` counts within the 50-listing server cap;
      `listing_detail_viewed.source` reads `document.referrer`, which is stale after client
      navigation. The server `conversation_started` (user id) cannot be joined to client
      events. A contact click is a click, not an introduction, a reply or a move-in (FR-5).
   2. Address: entry into the checker (`checker_viewed`) or a building page (`$pageview` with
      `page_type=building`; `location_score_viewed` as the fallback while FR-13 is open) →
      answer by `answer_level` (`address_checked` without `outside_city`, or
      `building_detail_viewed`; spec 01 §Answer quality) → an action (`cost_form_started`,
      `telegram_bot_opened`, `checker_cta_clicked`). Starting a check and landing on a building
      page are different entries; split by `entry_page_type`. "Coming back" (H3) is visible
      only for consented visitors and in the bot.
   3. Contribution: entry `source` → `cost_form_started` → `cost_form_address_selected` →
      `cost_form_submit_attempt` → `cost_form_submit_success`; the server
      `cost_report_submitted` is the count of record.
   4. Telegram address: `tg_bot_started` → `tg_address_checked` / `tg_district_checked` →
      `tg_subscribed` (interest saved). Website visits from the bot are analysed separately by
      `utm_source=telegram`; they are not one identified funnel with the bot.
   5. Telegram deposit: `tg_deposit_flow_started` → `tg_deposit_verdict` →
      `tg_deposit_letter_generated` → `tg_deposit_letter_sent` (the user's own mark) →
      `tg_deposit_outcome`. A letter is not money returned.
3. **Windows:** web funnels within one session (memory mode makes one page load one session for
   unconsented visitors); the deposit funnel 30 days, read separately. Never mix intervals,
   pre- and post-release events, persons and events in one number.
4. **Database counts** (read-only SQL for the owner): saved interests per class from
   `city_notify_subscriptions` (city launch, city listings, district listings, by
   `listing_type`) and from `telegram_subscriptions` by `target_key` prefix, compared with the
   client events; the server and client success of one submission are never two conversions.
   Split city-launch rows by `created_at` before and after the PRD 1 deploy: earlier whole-city
   roommate and sublet requests were stored as city-launch rows and are still selected by the
   city-launch mailing.
   The two waitlist server events used the e-mail as their identity; T057 removes them (Q-15,
   D32), after which the doc counts the waitlist by `listing_interest_saved` and database rows
   and never copies an e-mail into a query result.
5. **Two full weeks after the release:** compare week 1 and week 2 (Monday–Sunday): entries by
   `page_type` and `entry_page_type`, useful actions, saved requests (DB), sources (`ref`, UTM,
   referring domain) and errors (`listing_interest_failed` by `error_code`,
   `checker_check_failed`). Counts, not rates, while samples are small.
6. **Limitations:** landing capture (FR-13) until the owner's fix is verified; memory mode drops
   context and `ref`/UTM on a full reload; `entry_page_type` restarts on reload (spec 01); the
   owner's anonymous visits cannot be excluded; numbers before 2026-07-28 are not comparable
   (D10); PostHog moves to a new EU Cloud project with the PRD 1 deploy, history before the
   move stays in the US project (Q-11, D30, `docs/ops/posthog-eu-migration.md`); E8 and E9
   thresholds are in `docs/product/experiments.md` (Q-9, D28).

## Bot README

FR-48. `src/lib/bot/README.md`: what is implemented (address, district, building link, deposit
helper with contract reading, saved interests, `/cancel`), that saved interest sends nothing,
which reminders work (deadline and letter follow-ups from the cron, opt-in by tap, `/cancel`
stops them), deep-link formats (`dep`, `b_<uuid>`, `d_<slug>`, `web_<source>`), the full event
list with properties, and the production status: built, not launched, four migrations not
applied, token and webhook not set (unknown until the owner confirms). Do not call the bot
launched. Also update the bot rows of `docs/architecture.md` §2 and §5.

## Final check

FR-49. One task at the end:

- `npm run verify` and `npm run test:e2e` pass.
- `node scripts/ralph-tasks.mjs summary` shows every non-blocked PRD 1 task done.
- The requirement map in `README.md` marks each FR Done, Blocked (with the task) or Open.
- `CLAUDE.md` "Cost data honesty" says that the building page, the checker and the bot show the
  tenant and asking-price groups separately (PRD 1 package C), while single-number surfaces
  follow D4 until Q-2 is answered.
- The progress entry lists for the owner: all draft copy keys (website and bot), the
  Assumption constants applied, the blocked tasks with their questions, that no table and no
  migration were added, and what remains unverified (mobile flows by eye, Live Events after
  deploy, the bot in production).

## Final check after the owner's answers

T059, after the tasks the owner's answers of 2026-11-19 unblocked or added (T002, T028 – T030,
T042, T043, T052 – T058):

- `npm run verify` and `npm run test:e2e` pass; `node scripts/ralph-tasks.mjs summary` shows
  no todo task of PRD 1 left except this one.
- The requirement map in `README.md` marks every FR and owner follow-up Done or names what is
  left; no row says Blocked on Q-1 – Q-6.
- No document under `docs/` (except dated reviews and decision records) or `CLAUDE.md` still
  says that single-number surfaces blend sources, that Q-1 – Q-16 are open, or that the
  waitlist events are keyed by e-mail.
- The progress entry is the owner's handoff for the PRD 1 deploy (D29): every draft copy key
  (website and bot, T029, T042, T043, T028 – T054, T056), the Assumption constants, the new
  cron in `vercel.json`, that no table and no migration were added, the steps of
  `docs/ops/posthog-eu-migration.md`, the four bot migrations to apply one by one, RLS on
  `telegram_chats`, `telegram_subscriptions` and `deposit_cases`, the token, the webhook and
  `npm run bot:webhook`, and what remains unverified.
