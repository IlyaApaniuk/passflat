# 05 · Measurement documentation and the final check (PRD 1 package E)

Requirements FR-5 and FR-47 – FR-49 of PRD 1. Loop iterations never query PostHog; queries are
written and checked by reading. No A/B tests, revenue forecasts or universal target percentages
(**Decided**).

## Activation funnels document

FR-47, FR-5. `docs/analytics/activation-funnels.md`, written after packages A–D, from the code
as it is (event names and properties checked with a search of `src/`, not copied from specs).

1. **Event table:** every event the five funnels use, where it fires (file), its properties,
   whether it is client, server or bot, and its identity (visitor id, account id, `tg_<chatId>`;
   no funnel event is keyed by e-mail, D32).
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
      `page_type=building`; `location_score_viewed` as the fallback for data from before the
      FR-13 fix, T002, is verified after deploy) →
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
   client events; the client event and the row of one submission are never two conversions.
   Split city-launch rows by `created_at` before and after the PRD 1 deploy: earlier whole-city
   roommate and sublet requests were stored as city-launch rows and are still selected by the
   city-launch mailing.
   The waitlist has no server event (Q-15, D32, T057): the doc counts it by
   `listing_interest_saved` and database rows and never copies an e-mail into a query result.
5. **Two full weeks after the release:** compare week 1 and week 2 (Monday–Sunday): entries by
   `page_type` and `entry_page_type`, useful actions, saved requests (DB), sources (`ref`, UTM,
   referring domain) and errors (`listing_interest_failed` by `error_code`,
   `checker_check_failed`). Counts, not rates, while samples are small.
6. **Limitations:** landing capture (FR-13) until the T002 fix is verified after deploy; memory
   mode drops context and `ref`/UTM on a full reload; `entry_page_type` restarts on reload
   (spec 01); the owner's anonymous visits cannot be excluded; numbers before 2026-07-28 are not comparable
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
  tenant and asking-price groups separately (PRD 1 package C). (Done by T046. Since D23 and
  T028 – T054 no surface blends the groups any more, and `CLAUDE.md` says so.)
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

## PRD 3: roommate docs

PRD 3 FR-40, **Decided**. After the roommate flows are built, from the code as it is (event names
and properties checked with a search of `src/`, not copied from specs):

- `src/lib/bot/README.md`: "What is implemented" (the roommate intake, own card, counts, room
  reference, opt-in, matching behind `ROOMMATE_MATCHING_ENABLED`, report, automatic hiding,
  statement of reasons, `/appeal`, the English locale and the deposit gate), "Deep links" with the
  `mate` table of spec 04, "Events" with every roommate event of specs 06 and 07 and its
  properties, "Promises and capabilities": the bot now sends on its own the renewal reminder, the
  one-time message, the daily push and the outcome question (the roommate cron at 10:00
  Europe/Warsaw), and at the moment they happen the reveal, the statement of reasons and the hide
  notice to reporters, plus the closing message only from the owner's manual route — and nothing
  else; the "Owner review" section of spec 07; the known limits (stored usernames, in-memory
  compatibility up to 2,000 active profiles); "Not built yet" (paid speed, a Polish bot locale,
  web profiles).
- `docs/analytics/activation-funnels.md`: the new events and values (bot roommate events, web
  `intent=find_flatmate`, `telegram_bot_opened` `source=roommate`), with identities.
- `docs/architecture.md`: §3 data model (the three tables and `roommate_banned_at`), §4 cron
  table (`/api/cron/roommate-daily` twice a day with the Warsaw send hour; the manual
  `/api/cron/roommate-close`), §5 the bot row.
- Acceptance: every event of specs 06 and 07 appears in the README "Events" table with its
  properties (a test may read the README and the event constants; agent's choice).

## Posting kit

PRD 3 FR-41; **Decided** (the rules, D53; manual minutes include the owner's review, D65);
**Assumption** (the format). Audience-language content (`CLAUDE.md` exception for
`docs/marketing/`).

- `docs/marketing/roommate-posts.md` starts with "Draft for the owner" and the rules of D53 (reply
  to people who post that they look for a roommate rather than broadcast; vary the wording; at most
  3 – 4 groups per slot; ask admins first; prefer Telegram; identical links across Facebook
  groups risk a block of the passflat.com domain), then 6 – 8 reply templates in RU, UK and EN,
  each with one `mate_<source>_<group>` link and different wording, a version without a link that
  names the bot by username for groups that ban links, and a table of group keys the owner fills
  (public group handles only; keys `[a-z0-9]{1,24}`).
- No template promises a match, a date or a result; none names a figure the figure contract did
  not produce; none calls profiles "verified".
- `docs/marketing/roommate-posting-log.md`: a table with date, slot, minutes, groups (keys),
  link tags, removed posts or warnings, manual-handling minutes (including the weekly review of
  hidden profiles and appeals, D65), and a line saying a week without entries is "missing" in the
  readout. It holds no user names, chat ids or message texts.
- Test: every `t.me/…?start=` link in `roommate-posts.md` parses with `parseStartPayload` to
  `{ kind: 'roommate' }` with a source other than `other`.
- `docs/marketing/bot-profile.md`: drafts of the BotFather description and "about" text in RU, UK
  and EN that name what the bot does now (address and district costs, the deposit helper, roommate
  matching), with no promise of a match, a date or a result; the owner sets them in BotFather
  after the deploy (nobody else owns them).

## Stage 1 readout

PRD 3 FR-42; **Decided** (thresholds, D52; the daily check from 2027-01-04, D58; the extension,
D59); **Assumption** (query shape). The loop writes and checks the queries by reading; it never
runs them (CLAUDE.md).

A section "Roommate stage 1 (E14)" in `docs/analytics/activation-funnels.md`:

1. HogQL: persons with `tg_roommate_flow_started` and with `tg_roommate_profile_created` from
   day 0, by `entry_source` and `entry_detail`; the flow → profile funnel (A23); persons with
   `tg_roommate_browse_opted_in`.
2. Read-only SQL: active profiles on the readout day (spec 06 §Counts definition); active
   profiles per district (named districts only); "any" profiles; budget bands (A26); opted-in
   profiles.
3. The rules: stop below 15 profiles, below 1 profile per owner-hour, or above 30 manual minutes a
   week (average over full weeks, from the posting log; a week without a log entry is "missing");
   go at ≥ 30 profiles, ≥ 20 active and ≥ 3 districts with ≥ 3 active profiles each; between the
   two, stage 1 is extended once to 2027-02-28 with the same rules and the switch off (D59).
4. The daily check (D58): from 2027-01-04 the owner runs the go part daily: the profile count
   from PostHog (his Claude session with the PostHog MCP may run that query), and "active" and
   "districts with ≥ 3" with the read-only SQL in the Supabase SQL editor, because the PostHog MCP
   cannot read the database (the website block shows the same counts up to an hour old). The
   switch goes on at the first day on or after 2027-01-07 when all three go numbers hold, by
   setting the variable and redeploying (spec 07 §Switch); otherwise it waits for the 2027-01-18
   readout and the 2027-01-20 decision.
5. The worked example of `docs/product/experiments.md` E14 (34 profiles, 22 active, 3 districts,
   27.5 hours, 18 minutes → go), and one between stop and go (20 profiles, 1.2 per owner-hour →
   extend).
6. No events at all → "no data", not 0. The PostHog project is the EU project from the move date
   (D30). The December – January trough is stated.

## Stage 2 readout

PRD 3 FR-43; **Decided** (thresholds, D52; the stop rule and persons, D60; qualifying persons,
D74); **Assumption** (query shape).

A section "Roommate stage 2 (E15)" in `docs/analytics/activation-funnels.md`:

1. HogQL for the match rate over qualifying persons (**Decided**, D74, the owner's answer to
   PRD 3 Q-15, 2026-11-19: persons whose profile was active at `{switch_at}` or created after it,
   and is at least 14 days old at the readout → the share with at least one `tg_roommate_matched`
   between the switch and the readout; `tg_roommate_profile_expired` and
   `tg_roommate_profile_deleted` before `{switch_at}` tell the profiles that were not active
   apart; the stop rule of D60 reads this rate); pairs (`tg_roommate_matched` with
   `role=completer`); outcome persons (`renting_together` or `talking`); browsing persons
   (`tg_roommate_cards_viewed` after the switch); the push reading for H12 (persons with
   `tg_roommate_push_sent` → same-day `tg_roommate_cards_viewed`; persons with
   `tg_roommate_push_opted_out`).
   Every query takes the switch moment as a parameter `{switch_at}` (the owner records it in the
   posting log and as a PostHog annotation, spec 07 §Switch). Outcome persons count only persons
   who also have `tg_roommate_matched`. The H12 push reading uses `tg_roommate_cards_viewed` with
   `via=push`. Alongside it, report (without a rule) the rate under E15's earlier definition
   (persons with `tg_roommate_profile_created` or `tg_roommate_profile_renewed` at least 14 days
   before the readout and no `tg_roommate_profile_deleted` before the switch), so both rates stay
   in the readout (T110 rewrites `docs/analytics/activation-funnels.md` and E15 in
   `docs/product/experiments.md` to this, with a worked example; no other rule of D52 or D60
   changes).
2. A28: `has_username` on `tg_roommate_profile_created` (persons with and without a username at
   save), and `tg_roommate_username_prompted` → `tg_roommate_username_set` by `context`. Read-only
   SQL: a cross-check of mutual pairs among existing rows; pairs waiting on a username (matched,
   not revealed, a `tg_username` null on either side).
3. The rules: continue at ≥ 30 % match rate at switch + 14 days and, by about 2027-03-31, ≥ 10
   pairs and ≥ 3 outcome persons; stop (D60) if at switch + 14 days fewer than 15 % of
   qualifying persons have a match, or no pair formed among 20 or more browsing persons, or at
   about 2027-03-31 fewer than 10 pairs; outcomes counted as persons.
4. Worked examples: switch 2027-01-08, readout 2027-01-22; 24 qualifying, 8 with a match → 33 % →
   holds, 5 pairs so far; 24 qualifying, 3 with a match → 12.5 % → stop; 22 browsing and no
   `completer` → stop. Fewer than 10 qualifying persons → counts only, "the rule cannot be read".

## PRD 4: readout and docs

PRD 4 FR-36, **Decided** (existing event names, new values only; the loop never queries PostHog or
Search Console); **Assumption** (the readout's shape; the thresholds are the PRD's §1 Assumptions,
proposed as E16 in `../product/prd/prd-4-decision-review.md` row 14). Written from the code as it
is after M1 – M4.

- `docs/analytics/activation-funnels.md` §1: `telegram_bot_opened.source` and `cta_click.placement`
  values of spec 01 §PRD 4 values, with where each fires; `tg_roommate_flow_started.entry_detail`'s
  new values. A new section "PRD 4 readout (E16, proposed)":
  1. Search Console, read by the owner: the page groups (`/warsaw/roommate` in four locales,
     building pages, district pages with the hub, guides, the calculator, the data report, the
     home page), compared over 4 full weeks (Monday–Sunday) after the deploy against the 4 full
     weeks before: clicks, impressions, CTR, position; counts, not rates, while small; Google
     re-reads titles over weeks, so the first week is weak evidence.
  2. HogQL: `telegram_bot_opened` by `source` (persons and events) in the window; persons with
     `tg_roommate_flow_started {entry_source: 'web'}` by `entry_detail`; the flow → profile funnel
     by `entry_source` (persons, A23). Web and bot identities are never joined: the two sides are
     reported next to each other, never divided into one rate.
  3. The thresholds of PRD 4 §1 as Assumptions (roommate CTR ≥ 3 %, D41; clicks ≥ 2×; ≥ 3 of 8
     rewritten pages at CTR ≥ 2 %; total clicks not below the previous window; ≥ 5 bot opens from
     website entries; completion ≥ 50 %) and that none is a stop rule for the thesis (D52 decides
     stage 1).
  4. The season note and the EU PostHog project (D30).
- `src/lib/bot/README.md` "Deep links": the `mate_web_<detail>` values the website sends
  (`roommate`, `home`, `building`, `district`, `hub`, `calculator`, `guide`).
- `docs/architecture.md`: §2 the callout, the home thesis section, the district section; §4 the
  redirects and headers of `next.config.mjs` and the OG cache header; §5 the new event values and
  placements; §6 the PL-only clause as a value difference.
- `docs/ops/deploy-copy-review.md` (new): the owner's checklist for the deploy that carries PRD 1,
  PRD 3 and PRD 4: (1) the four live-only honesty leftovers of audit S-35 to confirm gone live
  ("Przeglądaj zweryfikowane oferty" on /how-it-works, "zwrot 77%" in the hero, "сколько платят
  жильцы" on /ru, unsplit building figures); (2) `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` set in Vercel
  (D76) and `ROOMMATE_MATCHING_ENABLED=true` (D75); (3) every PRD 4 draft copy key by task, read from
  the progress entries; (4) after the deploy: `curl -I` for `/favicon.ico`, `/apple-touch-icon.png`,
  `/api/og?title=x` (Cache-Control) and the four security headers on `/`; Live Events for
  `telegram_bot_opened` with the new sources; (5) the Search Console groups and dates to read after
  4 full weeks.
- `docs/specs/README.md`: the PRD 4 requirement map marks each FR Done, Blocked (with the task) or
  Planned.

## PRD 4 final check

PRD 4 FR-37, **Decided**. One task at the end:

- `npm run verify` and `npm run test:e2e` pass (the e2e suite now holds the home thesis section,
  the header link, the headers and the icons).
- `node scripts/ralph-tasks.mjs summary` shows every PRD 4 task done or blocked with its question
  (Q-1 – Q-5).
- The requirement map in `README.md` maps every FR-1 – FR-37 to a done task or to a blocked task
  with its question.
- The progress entry is the owner's handoff, separating built, tested and not deployed: no
  migration, table or cron change; the redirects and headers added; every draft copy key for
  review by task (web, four locales); the Assumption placements and values; the five blocked
  questions; the Search Console and PostHog readings to make after 4 full weeks and where they are
  described; what stays unverified (Core Web Vitals, Live Events, the live headers and icons after
  deploy, mobile layout by eye, the home route's script list in production).

## PRD 3 final check

PRD 3 FR-44, **Decided**. One task at the end:

- `npm run verify` passes; `node scripts/ralph-tasks.mjs summary` shows every other PRD 3 task done
  or blocked with its question.
- The requirement map in `README.md` maps every FR-1 – FR-44 to a done task or to a blocked task
  with its question.
- The progress entry is the owner's handoff, separating built, tested and not deployed: the
  migration name (to approve and apply after the four bot migrations, D18, D29); RLS on
  `roommate_profiles`, `roommate_reactions`, `roommate_reports` (D9); `ROOMMATE_MATCHING_ENABLED`
  unset for the deploy (D49), and that turning it on later means setting it and redeploying, then
  recording the moment (spec 07 §Switch); the two cron entries in `vercel.json`;
  `npm run bot:webhook` for the RU, UK, EN (and `pl`) menus and the BotFather description and
  about text (`docs/marketing/bot-profile.md`); the open questions Q-15 – Q-18 with their blocked
  tasks; every draft copy key for review (bot
  RU/UK/EN, web four locales) with the privacy section marked "approve before the deploy" and the
  terms, statement of reasons and safety lines marked "approve before the switch" (D56); the
  Assumption constants; the open lawyer questions (D69); what remains unverified (the bot in
  production, Live Events after deploy, mobile layout by eye).
