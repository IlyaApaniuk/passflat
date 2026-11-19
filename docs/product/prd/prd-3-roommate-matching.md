# PRD 3: Roommate matching — a structured waiting list, mutual matching and an English bot

- **Version:** 0.1, 2026-11-19
- **Status:** Evaluated, 2026-11-19 (`prd-3-decision-review.md`: ready with assumptions, 14
  decisions). Written as Draft the same day; the owner reviews `../thesis.md`, this PRD and the
  decision review before decomposition (D49); not decomposed, no tasks.
- **Serves:** H13 through H14 (stage 1, E14) and H15 (stage 2, E15); H12 through the daily push
  (E15 reading); H10 through the roommate page entry (E11). H16 (paid speed) is not built here.
- **BRD assumptions:** A4, A5, A6, A18 (Contradicted, acted on), A21 (Contradicted, acted on),
  A22, A23, A24, A26, A27; A25 only in Not in scope. No requirement rests on a contradicted
  assumption.
- **Builds on:** PRD 1 (`prd-1-activation-and-bot.md`), deployed first: package A
  (`telegram_bot_opened`, page context, `roommate_intent_selected`), package B (the roommate role
  selector), package C (the figure contract and its loaders), package D (deep links, honest
  promises, bot analytics, the claim-before-send reminders), package E (funnel document). PRD 2
  is On hold (D39) and is not a dependency.
- **Source:** the owner's decisions of 2026-11-19 (D48 – D53) and the research written for them:
  `../../research/roommate-market-2026-11-19.md` (market) and
  `../../research/roommate-fit-and-test-2026-11-19.md` (fit with the code, test design). Written
  by Claude on 2026-11-19. Every **Decided** mark points to a decision.
- **Supersedes for this PRD:** PRD 1 §2 "Do not build compatible-roommate matching, separate
  profiles for people who are searching" and §5 "Do not add a third flow" (D49).

## 1. The test

**Question.** Will people who look for someone to rent a flat with in Warsaw create a profile in
the bot when the owner posts links in chats and groups, at a rate one founder can sustain and
dense enough to match (stage 1, H14)? And when matching opens, will compatible people find each
other, reveal contacts and end up talking or renting together (stage 2, H15)?

**Why this test** (facts with dates; judgements marked):

- The bot already holds the hard parts: an account-free identity, multi-step intake with saved
  state, claim-before-send messages, the district lookup and the figure contract (fit report §1).
- RU/UA/EN speakers in Warsaw have no roommate chat (market research §1.2); foreigners are about
  14.5 % of Warsaw (GUS, end of 2025).
- Google brings about 1 roommate click a week (readout 2026-11-18), so the pool depends on the
  owner's posting (D46, A22, A21).
- Pure matching products mostly failed (market research §2); the build is not the risk,
  liquidity and the calendar are (fit report, judgement).

**Metrics.** E14 and E15 in `../experiments.md`; the readout queries are FR-42 and FR-43.
Persons are bot identities `tg_<chatId>`; profiles are database rows; owner-hours and manual
minutes come from the posting log (FR-41).

**Thresholds — Decided as Assumptions** (D52; the owner may change them):

- **Stage 1, readout 2027-01-18.** Stop if fewer than 15 profiles, fewer than 1 profile per
  owner-hour of posting, or more than 30 minutes a week of manual handling. Go if at least 30
  profiles, at least 20 active, and at least 3 districts with at least 3 active profiles each.
  Between the two: **Open** (Q-3).
- **Stage 2.** Within 14 days of the switch, at least 30 % of profiles older than 14 days have
  at least one mutual match; by about 2027-03-31, at least 10 mutual pairs and at least 3
  "renting together" or "talking" outcomes. Stop rule: **Open** (Q-4).
- **Decision.** The owner decides on 2027-01-20 from the stage 1 readout (D43, D52).

**Dates.** Day 0 of stage 1 is the deploy of this PRD with the switch off (target about
2026-12-01, Q-14); the owner posts from that day (D46, D53). The switch for stage 2 is turned on
around 2027-01-07 for February move-ins, only if stage 1 passes (D49; timing against the
2027-01-18 readout is Q-2).

**Owner time — Decided** (D46): two 30-minute slots a day, about 7 hours a week, under the
posting rules of D53; no personal help (D39). Manual handling is measured, and above 30 minutes a
week it is a stop signal (D52).

**Season.** December–January is the low season (Otodom: December 2025 demand 23 % below
November); a null result is weaker evidence than one in August–September, and both readouts say
so.

## 2. Milestones

| Milestone | What                                                   | Requirements  |
| --------- | ------------------------------------------------------ | ------------- |
| M1        | Stage 1 data and intake                                | FR-1 – FR-15  |
| M2        | Stage 1 counts, opt-in and sender; web entry           | FR-16 – FR-22 |
| M3        | Stage 2 matching and reveal                            | FR-23 – FR-30 |
| M4        | Safety: report, auto-hide, statement of reasons, terms | FR-31 – FR-36 |
| M5        | English bot locale                                     | FR-37 – FR-39 |
| M6        | Measurement docs, posting kit and the readout          | FR-40 – FR-44 |

All milestones ship in one deploy with the switch off (Q-14); M3 and M4 work only with the switch
on (FR-23).

## 3. Requirements

### M1. Stage 1 data and intake

```text
FR-1. Roommate tables in one migration
Milestone: M1 · Priority: Must · Status: Decided (one production migration after the four bot
  migrations, D49 owner steps; RLS by hand, D9); Assumption (column shapes, §4)
Who and when: the loop, before any other roommate task
Result: one Prisma migration creates `roommate_profiles`, `roommate_reactions` and
  `roommate_reports` and adds a nullable `roommate_banned_at` to `telegram_chats`. The stage 2
  tables ship in the same migration, so the owner approves one migration.
Acceptance criteria:
  1. Given the local database with the four bot migrations applied, when the migration is
     created with `prisma migrate dev`, then exactly one new folder exists and it sorts after
     `20261005140000_deposit_contract`.
  2. `roommate_profiles.chat_id` is unique and references `telegram_chats(id)` with cascade
     delete; columns as §4.
  3. `roommate_reactions` has a unique (`from_profile_id`, `to_profile_id`); both reference
     `roommate_profiles(id)` with cascade delete.
  4. `roommate_reports` references reporter and target profiles with `ON DELETE SET NULL`.
  5. The migration contains no RLS statement or policy (D9); the handoff (FR-44) names the
     three tables for the owner.
Edge cases: none at runtime; the migration is never applied to production by the loop (D18)
Data: §4 · Analytics: none · Screen: no design; prisma/schema.prisma, prisma/migrations/
Copy: none
Depends on: D9, D18, D29
Open questions: none
```

```text
FR-2. `mate` deep links carry a source
Milestone: M1 · Priority: Must · Status: Assumption (the source set, the detail pattern)
Who and when: a Telegram user opens https://t.me/<bot>?start=mate[_<source>[_<detail>]]
Result: the roommate intake starts (or the person's own card shows, FR-12), and
  `tg_roommate_flow_started` records where the link came from
Acceptance criteria:
  1. Given payload `mate`, then the intake starts and `tg_roommate_flow_started` has
     `entry_source=direct`.
  2. Given `mate_tg`, `mate_fb`, `mate_ig` or `mate_threads`, then `entry_source` is `tg`, `fb`,
     `ig` or `threads`.
  3. Given `mate_<source>_<detail>` with a source from criterion 2 and <detail> matching
     [a-z0-9]{1,24}, then `entry_detail=<detail>` (group keys of the posting kit, FR-41).
  4. Given `mate_web` or `mate_web_<detail>`, then `entry_source=web` (and `entry_detail`).
  5. Given any other payload starting `mate` (for example `mate_xyz`, `mate_tg_Bad!`), then
     `entry_source=other`, no `entry_detail`, and no error is shown.
  6. Payloads `dep`, `b_<uuid>`, `d_<slug>`, `web_<source>` and an empty payload behave as
     today (src/lib/bot/README.md "Deep links").
  7. `tg_bot_started.payload` keeps the raw string and `TelegramChat.startPayload` stays
     first-touch. Parsing is a pure function in src/lib/bot/start-payload.ts with a unit test
     per row above.
  8. Given a chat that already has an active profile, then its own card shows (FR-12) and no
     `tg_roommate_flow_started` is sent.
Edge cases: a payload over 64 characters or with other characters → today's `unknown` branch;
  a chat with an open deposit intake → the reply says "/cancel leaves the deposit questions",
  and the roommate intake does not start (one open intake per chat, Assumption); a banned chat
  → FR-14
Data: none new (the source lives in the event only)
Analytics: `tg_roommate_flow_started` with `entry_source`
  (`direct|tg|fb|ig|threads|web|bot_menu|other`) and `entry_detail` (absent or the detail)
Screen: no design; src/lib/bot/start-payload.ts, src/lib/bot/bot.ts
Copy: none
Depends on: PRD 1 package D; D53
Open questions: none. Note: `ENTRY_SOURCE` in start-payload.ts names how a check card was
  reached (`typed_address`, …); the roommate value set is a separate constant (agent's choice of
  name), so one property name does not mix two meanings across events
```

```text
FR-3. Roommate entry inside the bot
Milestone: M1 · Priority: Must · Status: Assumption (command name `/mate`, button placement)
Who and when: a person in the bot without a link
Result: `/mate` and a "Find someone to rent with" button in the `start` and
  `startAfterPayload` replies open the intake, or the person's own card when a profile exists
Acceptance criteria:
  1. Given no profile, `/mate` starts the intake; given an active profile, it shows FR-12's card.
  2. The capability list shared by `start`, `startAfterPayload` and `/help` (texts.ts) and
     `COMMAND_MENU` name the roommate entry in every bot locale; texts.test.ts checks that each
     listed capability has a command in the menu.
  3. Started from `/mate` or the button, `tg_roommate_flow_started` has `entry_source=bot_menu`.
  4. With the switch off (FR-23) the capability text says: create a profile, see how many people
     look per district, matching opens later; with it on, it describes matching. No text
     promises a date.
  5. While the intake is open, typed text goes to the intake, not to the address lookup, as the
     deposit intake does today (`handleText`, bot.ts).
Edge cases: `/cancel` during the intake deletes the draft (FR-12 criterion 4) and replies as
  today; a person who never answers → the draft is deleted after 7 days (FR-12)
Data: none · Analytics: as criterion 3 · Screen: no design; src/lib/bot/bot.ts, texts.ts
Copy: drafts in §8
Depends on: FR-2, FR-23, D42 («ты»)
Open questions: none
```

```text
FR-4. Districts step
Milestone: M1 · Priority: Must · Status: Decided (the field, D49); Assumption (at most 3, "any")
Who and when: the intake's first step
Result: buttons for the 18 Warsaw districts from the `District` table, "Any district" and
  "Done"; the person picks 1–3 districts or "any"
Acceptance criteria:
  1. A tap toggles a district and the keyboard marks picked ones with ✓.
  2. A 4th pick replies "up to 3 districts" and changes nothing.
  3. "Any district" stores `any_district=true` and an empty `district_slugs`; picking a district
     afterwards clears "any".
  4. "Done" with nothing picked asks again; with 1–3 picked or "any", it moves to FR-5.
  5. A district name typed during this step is matched with src/lib/bot/districts.ts and
     toggled like a tap; an unmatched text gets "tap a district".
Edge cases: a button from an older message after the step moved on → "this step is done" and the
  current step is sent again; a slug not in the `District` table → ignored
Data: `district_slugs text[]`, `any_district boolean`
Analytics: none (summarised on `tg_roommate_profile_created`)
Screen: no design · Copy: agent draft RU/UK/EN, marked for review
Depends on: FR-1, FR-3
Open questions: none
```

```text
FR-5. Budget step
Milestone: M1 · Priority: Must · Status: Decided (budget per person, D48, D49); Assumption (the bands)
Who and when: the intake's second step
Result: five buttons for the budget per person per month, all-in (rent, charges, utilities):
  b1 up to 1,199 zł; b2 1,200–1,599 zł; b3 1,600–1,999 zł; b4 2,000–2,499 zł; b5 2,500 zł or more
Acceptance criteria:
  1. One tap stores `budget_band` and moves to FR-6.
  2. The step text says "per person, all-in a month".
  3. The bands are one constant, so a change is one line.
Edge cases: a typed number → mapped to its band (1,650 → b3); text without a number → "tap a band"
Data: `budget_band text` (b1–b5) · Analytics: none
Screen: no design · Copy: agent draft RU/UK/EN
Depends on: FR-4 · Open questions: none
```

```text
FR-6. Move-in month step
Milestone: M1 · Priority: Must · Status: Decided (the field, D49); Assumption (the options)
Who and when: the intake's third step
Result: four buttons: the current month in Europe/Warsaw and the next three
Acceptance criteria:
  1. On 2026-12-05 the buttons are December 2026, January, February and March 2027, in the
     bot locale's month names.
  2. A tap stores `move_in_month` as the first day of that month and moves on.
Edge cases: a stale button for a month that has passed → the step is sent again with
  current months
Data: `move_in_month date` · Analytics: none (`move_in_offset_months` on profile_created)
Screen: no design · Copy: agent draft RU/UK/EN
Depends on: FR-5 · Open questions: none
```

```text
FR-7. Languages step
Milestone: M1 · Priority: Must · Status: Open (Q-5: which profile fields are stored)
Who and when: the intake's fourth step
Result: a multi-select of Polish, English, Russian and Ukrainian, with the bot locale's language
  ticked in advance, and "Done"
Acceptance criteria:
  1. "Done" needs at least one language.
  2. The languages are used only for compatibility (FR-24) and shown on the card in stage 2;
     they are the person's own choice and never a filter on nationality.
Edge cases: none beyond FR-4's stale-button rule
Data: `languages text[]` (pl, en, ru, uk)
Analytics: `language_count` on `tg_roommate_profile_created`
Screen: no design · Copy: agent draft RU/UK/EN
Depends on: FR-6 · Open questions: Q-5
```

```text
FR-8. Own gender and "live with"
Milestone: M1 · Priority: Must · Status: Decided (D51: both optional, used only for mutual
  compatibility, never published or shown as a filter)
Who and when: the intake's fifth step
Result: two optional questions: "You are: a woman / a man / skip" and "Live with: anyone /
  women / men"; skip keeps no gender and `prefers=anyone`
Acceptance criteria:
  1. Skipping both stores `gender=null`, `prefers=anyone`.
  2. Neither value appears on any card (FR-25), web page, count (FR-16, FR-21) or analytics
     event; a test asserts that the card renderer and the event payloads have no such field.
  3. The person sees both values on their own card (FR-12) and can change them.
Edge cases: a person who chooses "women" without stating their own gender → stored as chosen;
  FR-24 rule 5 decides matches
Data: `gender text null` (woman|man), `prefers text` (anyone|women|men)
Analytics: none
Screen: no design · Copy: drafts in §8 (the step says why it is asked and that it is never shown)
Depends on: FR-7 · Open questions: none (lawyer question listed in the decision review)
```

```text
FR-9. Adult confirmation
Milestone: M1 · Priority: Must · Status: Open (Q-5)
Who and when: the last required step, before saving
Result: "I confirm I am 18 or older" / "I am under 18"
Acceptance criteria:
  1. Confirming stores `adult_confirmed_at` and saves the profile (FR-12).
  2. "I am under 18" replies that matching is for adults only and deletes the draft at once.
  3. No birth date or age band is asked.
Edge cases: none
Data: `adult_confirmed_at timestamptz` · Analytics: none
Screen: no design · Copy: drafts in §8
Depends on: FR-8; the 18+ rule of the terms (`termsPage.accounts.item1`, `privacy.children`)
Open questions: Q-5
```

```text
FR-10. Optional short text
Milestone: M1 · Priority: Should · Status: Open (Q-5)
Who and when: an optional step after FR-8
Result: up to 280 characters about the person, shown on their card in stage 2; "Skip" allowed
Acceptance criteria:
  1. Text over 280 characters is refused with the length.
  2. Text with a link (http, www., t.me/), an @handle, an e-mail, a phone number (7 or more
     digits, spaces, dashes or + allowed between) or an IBAN-like run (PL followed by 26 digits,
     or 15 or more digits) is refused and the reply names what was found.
  3. Golden cases: "Pracuję w IT, spokojna, nie palę" → accepted; "Мне 25, есть 2 кота" →
     accepted (2 digits); "пиши @anna_w" → handle; "zadzwoń 501 234 567" → phone;
     "see https://x.pl" → link; "PL61109010140000071219812874" → IBAN; "anna@x.pl" → e-mail.
  4. The step text asks not to write health, religion or other sensitive facts.
Edge cases: only spaces → treated as skip
Data: `about text null` (≤ 280) · Analytics: `has_text` on `tg_roommate_profile_created`
Screen: no design · Copy: drafts in §8
Depends on: FR-8 · Open questions: Q-5
```

```text
FR-11. House rules
Milestone: M1 · Priority: Could · Status: Open (Q-5)
Who and when: an optional step after FR-10
Result: smoking (no / outside only / fine) and pets (no pets / I have a pet / fine with pets),
  each skippable; shown on the card in stage 2; not used for compatibility
Acceptance criteria:
  1. Each answer is one tap; "Skip" stores null.
  2. The card shows answered rules only.
Edge cases: none
Data: `smoking text null`, `pets text null`
Analytics: `rule_count` (0–2) on `tg_roommate_profile_created`
Screen: no design · Copy: agent draft RU/UK/EN
Depends on: FR-10 · Open questions: Q-5
```

```text
FR-12. Save and the person's own card
Milestone: M1 · Priority: Must · Status: Decided (stage 1: nobody sees anybody, D49);
  Assumption (draft lifetime, edit keeps expiry)
Who and when: the intake ends, or the person opens `/mate` with a profile
Result: the profile is saved `active` with `expires_at` (FR-15); the person sees their own card
  (every field they chose, including gender and "live with", shown only to them) with Edit,
  Delete and, within 3 days of expiry, Renew; then the counts reply (FR-16)
Acceptance criteria:
  1. A complete intake creates one active row and sends one `tg_roommate_profile_created`.
  2. Edit opens a field picker; changing one field keeps the others and does not change
     `expires_at`; it sends `tg_roommate_profile_edited` with `field`.
  3. No name or photo is asked or stored (Q-5).
  4. A draft row with no step answered for 7 days is deleted by the daily roommate cron (FR-15);
     `/cancel` deletes it at once.
Edge cases: two quick taps on the last button → one row (unique `chat_id`) and one event
Data: §4 · Analytics: `tg_roommate_profile_created` (§6), `tg_roommate_profile_edited`
Screen: no design · Copy: agent draft RU/UK/EN
Depends on: FR-4 – FR-11 · Open questions: none
```

```text
FR-13. Delete at once on request
Milestone: M1 · Priority: Must · Status: Decided (deletion at once on request, D49 owner
  brief); Assumption (the optional reason)
Who and when: the person taps "Delete my profile" and confirms
Result: the profile and its reactions are deleted in the same request; reports keep their
  reason and decision with the profile reference set to null (Q-6)
Acceptance criteria:
  1. Given a confirmed delete, then no `roommate_profiles` or `roommate_reactions` row of that
     profile remains, and the reply confirms it.
  2. The confirmation offers an optional reason: "Found someone here", "Found someone
     elsewhere", "Other"; "Found someone here" also sends `tg_roommate_outcome` with
     `outcome=renting_together`, `asked=delete`.
  3. `tg_roommate_profile_deleted` with `reason=user` is sent once.
  4. The chat can create a new profile at once unless it is banned (FR-34).
Edge cases: a delete after a reveal → the other person's reveal message stays (Telegram
  messages cannot be recalled); the copy before the delete says so
Data: deletes rows · Analytics: as above · Screen: no design · Copy: drafts in §8
Depends on: FR-12 · Open questions: Q-6 (reports)
```

```text
FR-14. One profile per chat; a banned chat cannot create one
Milestone: M1 · Priority: Must · Status: Assumption
Who and when: any entry (FR-2, FR-3)
Result: a chat has at most one profile; a chat with `roommate_banned_at` set gets a short
  "you cannot create a matching profile" reply pointing to the statement it received (FR-33)
Acceptance criteria:
  1. A second intake attempt with an active profile shows the card.
  2. A banned chat never reaches the intake; no event except `tg_bot_started` is sent.
Edge cases: none · Data: unique `chat_id`; `telegram_chats.roommate_banned_at`
Analytics: none · Screen: no design · Copy: agent draft
Depends on: FR-1, FR-34 · Open questions: none
```

```text
FR-15. Expiry, renewal reminder and deletion after expiry
Milestone: M1 · Priority: Must · Status: Decided (30-day profile life, D49 owner brief);
  Open (Q-6: the end-of-month rule, the grace period, then deletion)
Who and when: the daily roommate cron (a new route guarded by `requireCronAuth`, agent's choice
  of path; Assumption: daily at 09:00 UTC)
Result (proposal in Q-6): `expires_at` is the earlier of 30 days after creation or renewal and
  the end of the move-in month (23:59:59 Europe/Warsaw). The first cron run at or after
  `expires_at` minus 3 days sends one reminder with "Renew for 30 days" and "Delete". At
  `expires_at` the profile is `expired`: not counted, not shown. 14 days after expiry it is
  deleted with its reactions.
Acceptance criteria:
  1. Created 2026-12-03 08:00 UTC with move-in February 2027 → `expires_at` 2027-01-02 08:00 UTC
     (30 days come before the end of February); reminder on the run of 2026-12-30 09:00 UTC;
     renewed 2026-12-31 10:00 UTC → `expires_at` 2027-01-30 10:00 UTC.
  2. Created 2026-12-20 with move-in December 2026 → `expires_at` 2026-12-31 23:59:59 Warsaw (the
     month ends first); reminder on the run of 2026-12-29.
  3. Renewing with a move-in month in the past asks for a new month first (FR-6).
  4. The reminder is claimed before sending (set `renewal_reminded_at` with a conditional
     update) as `sendDueFollowUps` does; a 403 marks the chat blocked; blocked chats are skipped;
     a failed send releases the claim.
  5. Deletion after expiry sends `tg_roommate_profile_deleted` with `reason=expired`; renewal
     sends `tg_roommate_profile_renewed`.
Edge cases: the cron runs twice → one reminder; an expired profile renewed within the grace
  period → active again with new dates; a profile hidden by moderation is never renewed
Data: `expires_at`, `renewal_reminded_at`, `expired_at`, `renewed_at`
Analytics: as criterion 5 · Screen: no design · Copy: drafts in §8
Depends on: FR-12; the reminder pattern of PRD 1 FR-46 · Open questions: Q-6
```

### M2. Stage 1 counts, opt-in and sender; web entry

```text
FR-16. Honest counts per district
Milestone: M2 · Priority: Must · Status: Decided (honest counts per district, nobody sees
  anybody, D49; counts never combined with gender or "live with", D51); Assumption (the counting
  rules below)
Who and when: after the profile is saved, and on the card's "How many are looking?" button
Result: besides the person: for each district they chose, the number of other active profiles
  naming it; the number of other active profiles open to any district; the Warsaw total of other
  active profiles. A person who chose "any" sees the Warsaw total and the three districts named
  by most other active profiles
Rules:
  - Active: `status=active`, `expires_at` in the future, the chat not blocked and not banned.
  - A profile naming several districts counts in each; "any" profiles are counted on their own
    line and never added to a district; the copy never sums district numbers.
  - No count is combined with budget, month, language, gender or "live with".
  - Zero reads "nobody yet"; no percentage, rate or "verified".
Acceptance criteria:
  1. Golden case (§5 example 1) gives exactly: Mokotów 2, Wola 1, open to any district 1,
     Warsaw 5 besides you.
  2. The website block (FR-21) uses the same counting function.
Edge cases: a database error → the profile is saved and the reply says the counts are not
  available now; one profile in Warsaw (the person's own) → "nobody else yet"
Data: none new · Analytics: none
Screen: no design · Copy: drafts in §8
Depends on: FR-12 · Open questions: none
```

```text
FR-17. The room cost reference next to the counts
Milestone: M2 · Priority: Must · Status: Decided (the room cost reference, D49; groups shown
  apart with their N, D23, CLAUDE.md); Open (Q-8: a per-person split of flat figures)
Who and when: in the counts reply (FR-16), for each district the person chose, or for Warsaw
  when they chose "any"
Result: the room figures from `loadAreaReference({ districtId, cityId, rentalType: 'room' })`,
  rendered with the bot's existing area helpers (format.ts, `groupFigureRows`): one line per
  group (tenant reports, then asking prices) with its N; the district from `MIN_AREA_REPORTS`
  (5) room reports, else Warsaw, said so; nothing invented when no group has a value
Acceptance criteria:
  1. Golden case (§5 example 2): Mokotów with 2 tenant room reports and 5 asking-price room
     reports → "tenant reports: 1,700 zł a month all-in (2 reports); asking prices in listings:
     1,550 zł, known part of the costs (5 listings)".
  2. A district below 5 room reports → the Warsaw figures, introduced as "Wesoła has fewer
     than 5 room reports; Warsaw:".
  3. No room report at the district or city level → "No room figures for this area yet".
  4. The numbers equal what the checker's area reference shows for the same reports and
     rental type (the consistency test pattern of checker-consistency.test.ts).
Edge cases: one tenant report → "one observation" without a median, as the cards do
Data: none · Analytics: none
Screen: no design · Copy: the existing area-card wording; new lead-in drafts in §8
Depends on: FR-16; PRD 1 package C · Open questions: Q-8
```

```text
FR-18. Opt-in "message me once when matching opens"
Milestone: M2 · Priority: Must · Status: Decided (D49)
Who and when: under the counts reply, while the switch is off
Result: one tap sets `notify_on_open_at`; the reply confirms one message when matching opens
Acceptance criteria:
  1. The first tap sends `tg_roommate_browse_opted_in` with `already=false`; a repeat tap replies
     "already on" and sends the event with `already=true`.
  2. The person's card shows the opt-in and lets them switch it off.
  3. The promise text is allowed in texts.test.ts only because FR-19's sender exists: the test
     names the key and the sender function; every other "we will write" promise still fails.
  4. With the switch on, the button is not shown (people can browse at once).
Edge cases: the profile expires before matching opens → no message (FR-19 sends to active
  profiles only); the reply says so
Data: `notify_on_open_at`, `notified_open_at`
Analytics: `tg_roommate_browse_opted_in` (`already`)
Screen: no design · Copy: drafts in §8 (depends on Q-11)
Depends on: FR-16, FR-19 · Open questions: Q-11 (what is said if matching never opens)
```

```text
FR-19. The one-time "matching is open" message
Milestone: M2 · Priority: Must · Status: Decided (D49)
Who and when: the daily roommate cron, on its first runs with the switch on (FR-23)
Result: each active profile with `notify_on_open_at` set and `notified_open_at` null gets one
  message that matching is open, with the number of compatible people (FR-24) and a "Show
  people" button
Acceptance criteria:
  1. The row is claimed before the send (`notified_open_at` set by a conditional update); two
     overlapping runs send once; a failed send releases the claim; a 403 marks the chat blocked.
  2. With the switch off, nothing is sent.
  3. Each delivered message sends `tg_roommate_open_notified` with `count_band`
     (0, 1–2, 3–5, 6+).
  4. Zero compatible people → the message still goes and says "nobody fits yet; we write once a
     day when someone new fits" (FR-27).
Edge cases: Telegram rate limits → messages are sent one by one, at most 25 a second
  (Assumption); a profile created after the switch went on was never opted in → no message
Data: `notified_open_at` · Analytics: `tg_roommate_open_notified`
Screen: no design · Copy: drafts in §8
Depends on: FR-18, FR-23, FR-24 · Open questions: none
```

```text
FR-20. A closing message if matching does not open
Milestone: M2 · Priority: Could · Status: Open (Q-11)
Who and when: the owner, after deciding on 2027-01-20 to stop (D43)
Result (proposal): a manual POST route guarded by `requireCronAuth` sends each profile one
  message ("matching will not open; your profile is deleted now") and deletes all roommate rows
Acceptance criteria:
  1. The route does nothing without the cron secret and without an explicit `confirm=true` body.
  2. Each row is claimed before its send; each deletion sends `tg_roommate_profile_deleted`
     with `reason=closed`.
Edge cases: run twice → the second run finds no rows
Data: deletes rows · Analytics: as criterion 2 · Screen: none · Copy: draft in §8
Depends on: FR-1 · Open questions: Q-11
```

```text
FR-21. Roommate page: "looking for someone to rent with"
Milestone: M2 · Priority: Must · Status: Decided (the roommate page is an entry, D48; PRD 1's
  "no third flow" no longer applies, D49); Assumption (placement, top 5 districts)
Who and when: a visitor on /[city]/roommate (src/app/[locale]/[city]/roommate/page.tsx)
Result: the role selector (src/components/listings/roommate-role-selector.tsx,
  src/lib/roommate-roles.ts) gets a third role, "Looking for someone to rent a flat with"
  (`find_flatmate`). Choosing it shows a block: the Warsaw count of active profiles, up to 5
  districts named by most active profiles with their counts, one sentence on how matching works
  in the bot, the bot's languages, and a button to https://t.me/<bot>?start=mate_web_roommate
Acceptance criteria:
  1. Choosing the role captures `roommate_intent_selected` with `intent=find_flatmate`.
  2. The button captures `telegram_bot_opened` with `source=roommate` (a new
     `TelegramBotSource` value) and `has_building_context=false`, and opens in a new tab.
  3. NEXT_PUBLIC_TELEGRAM_BOT_USERNAME unset → no block, as TelegramBotCta.
  4. The counts come from FR-16's counting function, loaded on the server; zero → "Be among the
     first" and no number.
  5. Copy in all four locales with identical key sets; the Polish, English, Russian and Ukrainian
     pages all say the bot speaks English, Russian and Ukrainian (D50).
  6. The role creates no listing and asks for no address.
Edge cases: a database error → the button without counts; counts may be up to the page's
  revalidation interval old (Assumption: at most 1 hour)
Data: none · Analytics: as above · Screen: the roommate page
Copy: drafts in §8 (PL first)
Depends on: FR-16; PRD 1 FR-3, FR-14 · Open questions: none
```

```text
FR-22. Roommate page: the room money answer (D41)
Milestone: M2 · Priority: Should · Status: Decided (scope, D41); Assumption (checklist items,
  link targets)
Who and when: a visitor who chose "I'm looking for a room" (`find_room`), or who sees the empty
  list on /[city]/roommate
Result: a block "Found a room? What it will cost you per person, and is it safe to pay the
  deposit?" with: the Warsaw room figures by FR-17's rule (both groups with N, labelled); a
  checklist of 5 items; a link to the address check; honest links out to OLX rooms, Otodom rooms
  and a Facebook search for Warsaw room groups
Acceptance criteria:
  1. The figures equal FR-17's for Warsaw, rendered with the website's existing figure helpers;
     no number appears that the figure contract did not produce.
  2. Checklist (agent draft, no legal claims): see the room before paying anything; never pay a
     "reservation" before a viewing and a signed contract; ask what the rent includes (czynsz,
     media); ask for a handover protocol (protokół zdawczo-odbiorczy) at move-in; check the
     address in Passflat.
  3. The address-check link captures the existing `cost_data_cta_clicked` with
     `source=roommate_bridge`.
  4. Outbound links have `rel="nofollow noopener"`, open in a new tab and name the site.
  5. Copy in four locales, Polish written first; key parity holds.
Edge cases: no room figures for Warsaw → the block without the figures line
Data: none · Analytics: existing events of E11 · Screen: the roommate page
Copy: drafts in §8
Depends on: FR-17 (the rule); PRD 1 FR-16 · Open questions: none
```

### M3. Stage 2 matching and reveal

```text
FR-23. One switch for matching
Milestone: M3 · Priority: Must · Status: Decided (one config switch, turned on by the owner,
  D49)
Who and when: the owner sets `ROOMMATE_MATCHING_ENABLED=true` in Vercel (owner step)
Result: off (unset or any other value): no browse button, cards, reveal or daily push; the
  capability text says matching opens later. On: the opt-in button is replaced by "Show people",
  the one-time message (FR-19) and the daily push (FR-27) run
Acceptance criteria:
  1. The value is read server-side per request and per cron run; only the exact string `true`
     turns it on.
  2. Tests cover both states for `/mate`, the card buttons and the cron.
  3. Turning it off again stops new cards and pushes; reveals already sent stay; stored
     reactions stay.
  4. `.env.example` documents it with an empty placeholder.
Edge cases: a button from the "on" period tapped after it is off → "matching is paused"
Data: none · Analytics: none · Screen: none · Copy: drafts in §8
Depends on: none · Open questions: Q-2 (when it is turned on)
```

```text
FR-24. Compatibility rule
Milestone: M3 · Priority: Must · Status: Decided (district, budget and move-in month as the
  matching fields, D49; "live with" mutual, D51); Assumption (the tolerances below)
Who and when: every card query (FR-25), push (FR-27) and count of compatible people (FR-19)
Result: two different active profiles A and B are compatible when all of these hold:
  1. Districts: A or B is "any", or their district sets share at least one district.
  2. Budget: their bands differ by at most one step (b2 and b3 yes; b2 and b4 no).
  3. Move-in: their months differ by at most one month.
  4. Languages: they share at least one language (if Q-5 keeps the field).
  5. "Live with": A's preference accepts B and B's accepts A. "Anyone" accepts every profile;
     "women" accepts only a profile whose own gender is woman; "men" only man; a profile without
     a stated gender is accepted only by "anyone".
Acceptance criteria:
  1. A pure function with the golden cases of §5 example 3 as unit tests; the rule is symmetric.
  2. The database query returns exactly the profiles the pure function accepts (a test over a
     seeded local database or a Prisma mock, agent's choice).
Edge cases: A and B in the same chat cannot happen (one profile per chat)
Data: none · Analytics: none · Screen: none · Copy: none
Depends on: FR-4 – FR-8 · Open questions: Q-5 (languages)
```

```text
FR-25. Cards one at a time
Milestone: M3 · Priority: Must · Status: Decided (cards one at a time with "Interested" /
  "Skip" / "Report", D49); Assumption (order, card fields)
Who and when: a person with an active profile taps "Show people" while the switch is on
Result: one card of a compatible profile they have not reacted to, newest first (by creation or
  renewal), with "Interested", "Skip" and "Report"; after a tap, the next card; "That's
  everyone for now" when none is left
Card content: districts, budget band, move-in month, languages, the short text, house rules.
  Never gender, "live with", a name, a username or any identifier
Acceptance criteria:
  1. No profile → "create a profile first" and the intake starts (reciprocity).
  2. No Telegram username → "set a username in Telegram Settings, then tap Done", no card.
     The username is read from each update and stored as `tg_username`.
  3. "Skip" stores a `skip` reaction; that profile is never shown again to this person.
  4. A profile this person reported, or that reported this person, is never shown to them.
  5. `tg_roommate_cards_viewed` is sent once per "Show people" tap with `results_band`
     (0, 1–2, 3–5, 6+).
  6. A card button for a profile that is gone or hidden → "this profile is no longer available"
     and the next card.
Edge cases: the person's own profile expires while browsing → "renew to keep browsing"
Data: `roommate_reactions` (`kind=skip|interest`), `tg_username`
Analytics: `tg_roommate_cards_viewed`
Screen: no design · Copy: drafts in §8
Depends on: FR-23, FR-24 · Open questions: none
```

```text
FR-26. Mutual interest reveals both usernames
Milestone: M3 · Priority: Must · Status: Decided (mutual interest reveals both Telegram usernames
  with safety lines, D49); Open (Q-7: the safety wording)
Who and when: A taps "Interested" on B while B's "Interested" on A exists
Result: both reactions get `matched_at` in one transaction; each person gets one message:
  "You are both interested. Write to @<username>." with the safety lines and the next steps
  (FR-30). An "Interested" without a counterpart sends nothing to the other person
Acceptance criteria:
  1. `tg_roommate_matched` is sent for A with `role=completer` and for B with `role=waiting`;
     `tg_roommate_contact_revealed` for each delivered message. No event carries a username, a
     partner id or a match id.
  2. Both tap "Interested" at the same moment → exactly one pair and one message each (a unique
     constraint or a conditional update decides).
  3. A missing username at that moment → that person is asked to set one, and the other's message
     waits until they tap Done (`reveal_pending`).
  4. A blocked chat on either side → no reveal; that profile counts as inactive (Assumption).
Edge cases: B deleted the profile between the taps → A's tap is a plain "Interested" on a
  missing profile (FR-25 criterion 6)
Data: `matched_at` on both reactions
Analytics: `tg_roommate_matched` (`role`), `tg_roommate_contact_revealed`
Screen: no design · Copy: drafts in §8
Depends on: FR-25 · Open questions: Q-7
```

```text
FR-27. Daily "N new people fit"
Milestone: M3 · Priority: Must · Status: Decided (a daily push, opt-out, D49); Assumption
  (send time, what counts as new)
Who and when: the daily roommate cron while the switch is on
Result: each active profile with the push on gets at most one message a day when at least one
  compatible profile was created or renewed since its last push (or since its own creation) and
  it has not reacted to them: "<N> new people fit you" with "Show" and "Stop daily messages"
Acceptance criteria:
  1. Golden case: last push 2027-01-10 09:00 UTC; since then B (compatible, created 01-10 15:00)
     and C (compatible, renewed 01-11 08:00) and D (not compatible, created 01-10 20:00) → on the
     run of 2027-01-11 the message says 2.
  2. N = 0 → no message.
  3. Claim before send (`last_push_at` by conditional update), as FR-15 criterion 4.
  4. "Stop daily messages" sets `push_off` and sends `tg_roommate_push_opted_out`; the card can
     switch it on again.
  5. Each delivered push sends `tg_roommate_push_sent` with `count_band`.
Edge cases: switch off → none; a hidden or expired profile → none
Data: `last_push_at`, `push_off`
Analytics: `tg_roommate_push_sent` (`count_band`), `tg_roommate_push_opted_out`
Screen: no design · Copy: drafts in §8
Depends on: FR-23, FR-24 · Open questions: none
```

```text
FR-28. A daily limit on "Interested"
Milestone: M3 · Priority: Should · Status: Assumption (20 a day)
Who and when: a person taps "Interested"
Result: at most 20 "Interested" reactions per profile in 24 hours; the 21st replies "that's the
  limit for today"; "Skip" has no limit
Acceptance criteria:
  1. The 20th tap within 24 hours is stored; the 21st is not, and no event is sent for it.
  2. The limit is one constant.
Edge cases: none · Data: counted from `roommate_reactions` · Analytics: `tg_roommate_interest_sent`
  for each stored tap · Screen: no design · Copy: agent draft
Depends on: FR-25 · Open questions: none
```

```text
FR-29. The outcome question
Milestone: M3 · Priority: Must · Status: Assumption (21 days, once)
Who and when: the daily roommate cron, 21 days after the person's first `matched_at`
Result: one message: "Did you find someone to rent with?" with "Renting together", "Still
  talking", "Did not work out" and "Don't ask"
Acceptance criteria:
  1. Asked once per profile life (`outcome_asked_at`, claimed before the send).
  2. A tap stores `outcome` and sends `tg_roommate_outcome` with `outcome`
     (`renting_together|talking|no_fit|dont_ask`) and `asked=follow_up`.
  3. A profile deleted before day 21 is not asked; FR-13's reason covers it.
Edge cases: no answer → nothing more is sent
Data: `outcome_asked_at`, `outcome` · Analytics: `tg_roommate_outcome`
Screen: no design · Copy: drafts in §8
Depends on: FR-26 · Open questions: none
```

```text
FR-30. Next steps after a match
Milestone: M3 · Priority: Could · Status: Assumption
Who and when: under the reveal message
Result: three buttons: the roommate agreement template (public/documents, the person's locale),
  "Check an address" (the bot's address prompt) and the costs page with the bot's UTM
Acceptance criteria:
  1. Each tap sends `tg_roommate_next_step` with `step` (`agreement|address_check|cost`).
  2. Links carry `utm_source=telegram`, `utm_medium=bot` and no chat identifier (format.ts).
Edge cases: none · Data: none · Analytics: as above · Screen: no design · Copy: agent draft
Depends on: FR-26 · Open questions: none
```

### M4. Safety: report, automatic hiding, statement of reasons, terms

```text
FR-31. Report with a reason and a receipt
Milestone: M4 · Priority: Must · Status: Decided (report on every card, D49); Assumption (the
  reasons)
Who and when: a person taps "Report" on a card
Result: reasons: "asks for money or a deposit", "fake profile", "offensive", "looks under 18",
  "other"; the report is stored once per reporter and target, the target is hidden from the
  reporter at once, and the reporter gets a receipt saying the check is automated and that they
  will be told the decision
Acceptance criteria:
  1. A second report by the same person on the same profile changes nothing and says "already
     reported".
  2. `tg_roommate_reported` with `reason` is sent once per stored report.
  3. Non-users report through contact@passflat.com, as the terms already say (`termsPage.dsa`).
Edge cases: the target is already hidden → the receipt and no further action
Data: `roommate_reports` · Analytics: `tg_roommate_reported` (`reason`)
Screen: no design · Copy: drafts in §8
Depends on: FR-25 · Open questions: none
```

```text
FR-32. Automatic hiding
Milestone: M4 · Priority: Must · Status: Decided (automatic hiding, D49); Open (Q-9: the rule)
Who and when: on each stored report
Result (proposal in Q-9): a profile is hidden when reports from 2 different people exist, or at
  once on one report with the reason "looks under 18"
Acceptance criteria:
  1. Golden case: R1 reports X ("fake profile") → X stays visible to others; R1 reports X again →
     no change; R2 reports X ("asks for money") → X is hidden.
  2. Golden case: R3 reports Y ("looks under 18") → Y is hidden at once.
  3. A hidden profile is not counted (FR-16, FR-21) or shown (FR-25) and gets no push; the
     `tg_roommate_profile_hidden` event carries `reason` (`reports|under_18`).
  4. Every reporter of a hidden profile is told the decision, and that it was automated
     (DSA Art. 16(6)).
Edge cases: two reports in the same second → one hide (conditional update on `hidden_at`)
Data: `hidden_at`, `hidden_reason` · Analytics: `tg_roommate_profile_hidden`
Screen: no design · Copy: drafts in §8
Depends on: FR-31 · Open questions: Q-9
```

```text
FR-33. Statement of reasons to the hidden person
Milestone: M4 · Priority: Must · Status: Decided (automatic, D49); Open (Q-7: the legal text)
Who and when: at the moment a profile is hidden
Result: one message to the hidden person with: what was restricted (the profile is hidden from
  matching), the facts (how many reports and their reason categories, never who reported), that
  the decision was automated, the ground in the terms (FR-36), and redress (reply with `/appeal`,
  write to contact@passflat.com, complain to the President of UKE as Digital Services
  Coordinator, or go to court) — DSA Art. 17
Acceptance criteria:
  1. The message is sent once, claimed before sending, in the chat's locale.
  2. It names no reporter and no other profile.
Edge cases: the chat blocked the bot → nothing is delivered; the row records it
Data: none new · Analytics: none · Screen: no design · Copy: the skeleton in §8; the legal text
  is the owner's (Q-7)
Depends on: FR-32, FR-36 · Open questions: Q-7
```

```text
FR-34. No new profile after a moderation hide
Milestone: M4 · Priority: Must · Status: Assumption
Who and when: a profile is hidden (FR-32)
Result: the chat's `roommate_banned_at` is set; FR-14 stops new profiles; only the owner lifts
  it (FR-35)
Acceptance criteria:
  1. After a hide, `/mate` and `mate_*` links give FR-14's reply.
  2. The hidden profile is deleted at its normal expiry plus the grace period with
     `reason=moderation`; the ban stays on the chat row.
Edge cases: none · Data: `telegram_chats.roommate_banned_at` · Analytics: none
Screen: no design · Copy: agent draft
Depends on: FR-32 · Open questions: Q-6 (how long the ban marker is kept)
```

```text
FR-35. Appeals and the owner's review
Milestone: M4 · Priority: Should · Status: Assumption; Open (Q-12: the owner's weekly minutes)
Who and when: a hidden person sends `/appeal`; the owner reviews weekly
Result: `/appeal` stores `appealed_at` and replies with a fixed acknowledgement that names
  contact@passflat.com and promises no time; the bot README holds read-only SQL listing hidden
  profiles with report reasons and appeals, and the SQL to unhide one and clear the ban
Acceptance criteria:
  1. A second `/appeal` changes nothing.
  2. The README section says the owner logs the minutes spent (FR-41).
Edge cases: `/appeal` from a chat that is not hidden → "nothing to appeal"
Data: `appealed_at` · Analytics: none · Screen: none · Copy: agent draft
Depends on: FR-32 · Open questions: Q-12
```

```text
FR-36. Terms and privacy sections for matching
Milestone: M4 · Priority: Must · Status: Open (Q-7: legal texts are the owner's)
Who and when: before the deploy (privacy part) and before the switch (moderation part)
Result: draft keys in all four locales: a privacy section (fields, purpose, Telegram as the
  channel, other users as recipients of the card and, on mutual interest, of the username, the
  30-day life, deletion at once, no analytics of personal data) and a terms section (what
  matching does, content rules, automatic hiding, the ranking "newest first", statements of
  reasons, redress); the intake's first message links to the privacy section
Acceptance criteria:
  1. Keys exist in pl, en, ru and uk with identical sets; the parity test passes.
  2. Every key is listed for the owner's review in the progress entry; none is presented as
     reviewed by a lawyer.
Edge cases: none · Data: none · Analytics: none
Screen: src/app/[locale]/privacy, src/app/[locale]/terms · Copy: agent drafts for the owner
Depends on: FR-12, FR-25, FR-32 · Open questions: Q-7
```

### M5. English bot locale

```text
FR-37. The `en` bot locale: detection, `/lang`, command menu
Milestone: M5 · Priority: Must · Status: Decided (English, D50); Assumption (detection map)
Who and when: any chat
Result: `BotLocale` becomes 'ru' | 'uk' | 'en'. `normalizeLocale`: `uk…` → uk, `en…` and `pl…`
  → en, anything else and no language code → ru (today's default kept). `/lang` offers RU, UK
  and EN. `COMMAND_MENU` has an English menu published for `language_code: 'en'`
Acceptance criteria:
  1. Unit tests for `uk-UA`, `en-GB`, `pl`, `ru`, `de` and undefined.
  2. English plural forms (one / other) for every counted word in texts.ts.
  3. `TelegramChat.locale` accepts `en`; an existing chat keeps its stored locale.
Edge cases: a chat switches locale during an intake → the next message uses the new locale
Data: none new · Analytics: none · Screen: no design · Copy: none
Depends on: none · Open questions: none
```

```text
FR-38. Bot texts in English
Milestone: M5 · Priority: Must · Status: Decided (matching in English, D50); Open (Q-10: the
  deposit flow in English)
Who and when: a chat with locale `en`
Result: every text in src/lib/bot/texts.ts and the new roommate texts exist in English. Proposal
  (Q-10): the deposit flow (deposit-texts.ts) stays Russian and Ukrainian; an `en` chat that
  opens it gets one English line, "The deposit helper speaks Russian and Ukrainian for now",
  and the two language buttons
Acceptance criteria:
  1. A test fails if any text key lacks an `en` value.
  2. texts.test.ts's promise check runs on the English texts too.
  3. The Polish letter itself is unchanged.
Edge cases: none · Data: none · Analytics: none · Screen: no design
Copy: agent draft EN, marked for the owner's review
Depends on: FR-37 · Open questions: Q-10
```

```text
FR-39. Website bot links name the bot's languages
Milestone: M5 · Priority: Should · Status: Decided (D50)
Who and when: a visitor sees a link to the bot on the website
Result: where the website's copy names the bot's languages, it says English, Russian and
  Ukrainian (it said Russian and Ukrainian), in all four locales
Acceptance criteria:
  1. A search of src/i18n/messages finds no bot-language line without English.
  2. Key parity holds.
Edge cases: none · Data: none · Analytics: none · Screen: TelegramBotCta and FR-21
Copy: agent draft four locales
Depends on: FR-37 · Open questions: none
```

### M6. Measurement docs, posting kit and the readout

```text
FR-40. Events and behaviour documented
Milestone: M6 · Priority: Must · Status: Decided
Who and when: the loop, after M1 – M5
Result: src/lib/bot/README.md ("What is implemented", "Deep links" with `mate`, "Events",
  "Promises and capabilities" with the one-time message and the daily push, "Not built yet"),
  docs/analytics/activation-funnels.md (new events and values), docs/architecture.md (§3 data
  model, §4 cron table, §5 bot row) describe what was built
Acceptance criteria:
  1. Every event of §6 appears in the README "Events" table with its properties.
  2. The README says the bot now sends, on its own, the renewal reminder, the one-time message,
     the daily push and the outcome question, and nothing else.
Edge cases: none · Data: none · Analytics: none · Screen: none · Copy: none
Depends on: M1 – M5 · Open questions: none
```

```text
FR-41. Posting kit and posting log for the owner
Milestone: M6 · Priority: Must · Status: Decided (the rules, D53); Assumption (the format)
Who and when: the owner, in each posting slot (D46)
Result: docs/marketing/roommate-posts.md (audience-language content, CLAUDE.md) starts with
  "Draft for the owner" and the rules of D53, then 6–8 reply templates in RU, UK and EN for posts
  of people who look for a roommate, each with one `mate_<source>_<group>` link and different
  wording, plus a table of group keys the owner fills (public group handles only). A posting log
  docs/marketing/roommate-posting-log.md has columns: date, slot, minutes, groups, link tags,
  removed posts or warnings, manual-handling minutes
Acceptance criteria:
  1. No template promises a match, a date or a result; none names a figure that the figure
     contract did not produce; none calls profiles "verified".
  2. Every link is a valid `mate_` payload of FR-2 (a test parses the file's links).
  3. The log holds no user names, chat ids or message texts.
Edge cases: a group that bans links → a template that names the bot by username without a link
Data: none · Analytics: none · Screen: none · Copy: agent drafts RU/UK/EN
Depends on: FR-2 · Open questions: none
```

```text
FR-42. Stage 1 readout (E14)
Milestone: M6 · Priority: Must · Status: Decided (thresholds, D52); Assumption (query shape)
Who and when: the owner or a Claude session with the PostHog MCP, on 2027-01-18
Result: a "Roommate stage 1 (E14)" section in docs/analytics/activation-funnels.md
Acceptance criteria:
  1. HogQL: persons with `tg_roommate_flow_started` and with `tg_roommate_profile_created` from
     day 0, by `entry_source` and `entry_detail`; the flow → profile funnel (A23).
  2. Read-only SQL: active profiles on the readout day; active profiles per district (named
     districts only); "any" profiles; budget bands (A26); opted-in profiles.
  3. It states the stop and go rules of D52, owner-hours and manual minutes from the posting log
     (a week without a log entry is "missing"), and Q-3's answer once given.
  4. It reproduces the worked example of `../experiments.md` E14 (34 profiles, 22 active, 3
     districts, 27.5 hours, 18 minutes → go).
  5. No events at all → the readout says "no data", not 0.
Edge cases: the PostHog project is the EU project from the move date (D30)
Data: none · Analytics: none · Screen: none · Copy: none
Depends on: FR-2, FR-12, FR-16, FR-41
Open questions: Q-3. Note: the loop never queries PostHog (CLAUDE.md); queries are checked by reading
```

```text
FR-43. Stage 2 readout (E15)
Milestone: M6 · Priority: Must · Status: Decided (thresholds, D52); Assumption (query shape,
  outcomes counted as persons)
Who and when: at switch + 14 days and about 2027-03-31
Result: a "Roommate stage 2 (E15)" section in docs/analytics/activation-funnels.md
Acceptance criteria:
  1. HogQL for the match rate as E15 defines it, for pairs (`tg_roommate_matched` with
     `role=completer`), for outcome persons, and for the push reading (H12).
  2. A read-only SQL cross-check of mutual pairs among existing rows.
  3. Worked example: switch 2027-01-08, readout 2027-01-22; 24 qualifying persons, 8 with a match
     → 33 % ≥ 30 % → the 14-day rule holds; 5 pairs so far. Fewer than 10 qualifying persons →
     counts only, "the rule cannot be read".
Edge cases: as FR-42
Data: none · Analytics: none · Screen: none · Copy: none
Depends on: FR-25 – FR-29 · Open questions: Q-4
```

```text
FR-44. Final check and handoff
Milestone: M6 · Priority: Must · Status: Decided
Who and when: the loop, last
Result: `npm run verify` passes; the handoff lists the migration name, the three tables for RLS,
  `ROOMMATE_MATCHING_ENABLED`, the BotFather menu step, every copy key for review (bot RU/UK/EN,
  web four locales, terms and privacy drafts) and the open lawyer questions
Acceptance criteria:
  1. Every FR of this PRD maps to a done task or to a blocked task with its question.
  2. The handoff separates built, tested and not deployed.
Edge cases: none · Data: none · Analytics: none · Screen: none · Copy: none
Depends on: all · Open questions: none
```

## 4. Data

One migration (FR-1). Personal data in **bold**. Column names are an **Assumption**; retention
is **Decided** where marked, otherwise **Open** (Q-6).

`roommate_profiles` (one per chat):

| Column                                                          | Type                      | Purpose                                                |
| --------------------------------------------------------------- | ------------------------- | ------------------------------------------------------ |
| `id`                                                            | uuid                      |                                                        |
| `chat_id`                                                       | uuid, unique, FK cascade  | the `telegram_chats` row                               |
| `status`, `step`                                                | text                      | `draft` / `active` / `expired` / `hidden`; intake step |
| **`district_slugs`**, **`any_district`**                        | text[], boolean           | FR-4                                                   |
| **`budget_band`**                                               | text                      | FR-5                                                   |
| **`move_in_month`**                                             | date                      | FR-6                                                   |
| **`languages`**                                                 | text[]                    | FR-7 (Q-5)                                             |
| **`gender`**, **`prefers`**                                     | text null, text           | FR-8 (D51)                                             |
| **`about`**                                                     | text null, ≤ 280          | FR-10 (Q-5)                                            |
| **`smoking`**, **`pets`**                                       | text null                 | FR-11 (Q-5)                                            |
| `adult_confirmed_at`                                            | timestamptz               | FR-9 (Q-5)                                             |
| **`tg_username`**                                               | text null                 | FR-25, FR-26: read from each update                    |
| `notify_on_open_at`, `notified_open_at`                         | timestamptz null          | FR-18, FR-19                                           |
| `push_off`, `last_push_at`                                      | boolean, timestamptz null | FR-27                                                  |
| `reveal_pending`                                                | boolean                   | FR-26 criterion 3                                      |
| `expires_at`, `renewal_reminded_at`, `expired_at`, `renewed_at` | timestamptz               | FR-15                                                  |
| `hidden_at`, `hidden_reason`, `appealed_at`                     | timestamptz, text         | FR-32, FR-35                                           |
| `outcome_asked_at`, `outcome`                                   | timestamptz, text         | FR-29                                                  |
| `created_at`, `updated_at`                                      | timestamptz               |                                                        |

`roommate_reactions`: `id`, `from_profile_id`, `to_profile_id` (both FK cascade, unique pair),
`kind` (`interest|skip`), `created_at`, `matched_at` null.

`roommate_reports`: `id`, `reporter_profile_id`, `target_profile_id` (both FK set null), `reason`,
`decision` (`none|hidden`), `automated` boolean, `created_at`, `decided_at`; unique
(`reporter_profile_id`, `target_profile_id`).

`telegram_chats.roommate_banned_at`: timestamptz null.

**Retention.**

- Profile life: 30 days from creation or renewal — **Decided** (D49).
- Deletion on request: at once, with its reactions — **Decided** (D49).
- After expiry: proposal hidden at the earlier of 30 days and the end of the move-in month,
  deleted 14 days later — **Open** (Q-6).
- Drafts never finished: deleted after 7 days — **Open** (Q-6).
- Reports: reason and decision kept 6 months after creation, references nulled when a profile is
  deleted, then deleted by the cron — **Open** (Q-6).
- Ban marker: kept while the `telegram_chats` row exists — **Open** (Q-6).
- No name, photo, birth date, phone, e-mail or document is ever stored. Nothing about a profile
  goes to PostHog beyond the bands, counts and booleans of §6.

**RLS:** the owner switches it on by hand for `roommate_profiles`, `roommate_reactions` and
`roommate_reports` (D9).

## 5. Counting and compatibility rules: numeric examples

These are golden tests.

**Example 1 — counts (FR-16).** Other profiles at the moment of the reply:

| Profile | Districts       | State                        | Counted? |
| ------- | --------------- | ---------------------------- | -------- |
| P1      | Mokotów, Ochota | active                       | yes      |
| P2      | Mokotów         | active                       | yes      |
| P3      | any             | active                       | yes      |
| P4      | Wola            | active                       | yes      |
| P5      | Mokotów         | hidden by moderation         | no       |
| P6      | Mokotów         | expired                      | no       |
| P7      | Ochota          | active                       | yes      |
| P9      | Mokotów         | active, chat blocked the bot | no       |

The viewer P8 chose Mokotów and Wola. Reply: Mokotów 2 (P1, P2), Wola 1 (P4), open to any
district 1 (P3), Warsaw 5 besides you (P1, P2, P3, P4, P7). The district numbers (2 + 1) are not
summed anywhere. A viewer who chose "any" sees Warsaw 5 besides you and the three most named
districts: Mokotów 2, Ochota 2, Wola 1 (ties in alphabetical order, Assumption).

**Example 2 — room cost reference (FR-17).** Visible reports with `rentalType=room` whose
building is in Mokotów:

| Report | Source    | Values                                                          |
| ------ | --------- | --------------------------------------------------------------- |
| R1     | `user`    | total 1,600 zł, utilities complete                              |
| R2     | `import`  | total 1,800 zł, utilities complete                              |
| R3–R7  | `scraped` | 1,400; 1,500; 1,550; 1,700; 2,000 zł, `utilitiesComplete=false` |

Mokotów has 7 room reports ≥ `MIN_AREA_REPORTS` (5), so the reference is the district. Tenant
group (R1, R2): untrimmed median of 1,600 and 1,800 = 1,700 zł all-in, N = 2. Asking group
(R3–R7): median 1,550 zł, a known part of the costs, N = 5. Shown: "Rooms in Mokotów — tenant
reports: 1,700 zł a month all-in (2 reports); asking prices in listings: 1,550 zł, known part of
the costs (5 listings)." No percentage, no "cheaper than", no blended number. Wesoła with 2 room
reports → "Wesoła has fewer than 5 room reports; Warsaw:" and the city lines.

Per-person split, **only if Q-8 is answered yes** (proposal): tenant-group all-in totals of
apartments in Mokotów 4,200; 4,600; 4,800; 4,900; 5,100; 5,400 → median 4,850 zł (N = 6) → "for
two people about 2,430 zł each (half of the median flat)", rounded half up to 10 zł; never applied
to a known part or to asking prices.

**Example 3 — compatibility (FR-24).** A: Mokotów and Ochota, band b3, February 2027, languages
RU and EN, gender woman, live with women.

| B   | Districts | Band | Month    | Languages | Gender     | Live with | Compatible with A? | Why                                        |
| --- | --------- | ---- | -------- | --------- | ---------- | --------- | ------------------ | ------------------------------------------ |
| B   | Ochota    | b4   | Mar 2027 | EN, PL    | woman      | anyone    | yes                | shares Ochota, bands adjacent, 1 month, EN |
| C   | Wola      | b3   | Feb 2027 | RU        | woman      | anyone    | no                 | no shared district                         |
| D   | any       | b3   | Apr 2027 | RU        | woman      | anyone    | no                 | 2 months apart                             |
| E   | Mokotów   | b3   | Feb 2027 | RU        | not stated | anyone    | no                 | A accepts only a stated woman              |
| F   | Mokotów   | b1   | Feb 2027 | RU        | woman      | anyone    | no                 | bands two steps apart                      |
| G   | Mokotów   | b3   | Feb 2027 | UK        | woman      | anyone    | no                 | no shared language                         |
| H   | any       | b2   | Jan 2027 | RU, UK    | woman      | men       | no                 | H accepts only men                         |

## 6. Analytics events

Bot events go through `track` as `tg_<chatId>`, never joined to web identities. No event
carries a username, a name, the short text, gender, "live with", a district list, a chat id, a
partner id or a match id (CLAUDE.md, D51). Names follow the fit report; those marked "new" are
additions of this PRD (**Assumption**).

| Event                          | Where | Sent when                                      | Properties                                                                                                                                       |
| ------------------------------ | ----- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tg_bot_started`               | bot   | unchanged                                      | `payload` (raw, now also `mate…`), `is_new`                                                                                                      |
| `tg_roommate_flow_started`     | bot   | the intake starts (FR-2, FR-3)                 | `entry_source`, `entry_detail`                                                                                                                   |
| `tg_roommate_profile_created`  | bot   | a profile is saved (FR-12)                     | `district_count` (0–3), `any_district`, `budget_band`, `move_in_offset_months` (0–3), `language_count`, `has_text`, `rule_count`, `entry_source` |
| `tg_roommate_profile_edited`   | bot   | a field changes (FR-12), new                   | `field`                                                                                                                                          |
| `tg_roommate_profile_renewed`  | bot   | renewal (FR-15)                                | none                                                                                                                                             |
| `tg_roommate_profile_deleted`  | bot   | deletion (FR-13, FR-15, FR-20, FR-34)          | `reason` (`user` \| `expired` \| `moderation` \| `closed`)                                                                                       |
| `tg_roommate_browse_opted_in`  | bot   | the opt-in tap (FR-18)                         | `already`                                                                                                                                        |
| `tg_roommate_open_notified`    | bot   | the one-time message is delivered (FR-19), new | `count_band`                                                                                                                                     |
| `tg_roommate_cards_viewed`     | bot   | "Show people" (FR-25)                          | `results_band`                                                                                                                                   |
| `tg_roommate_interest_sent`    | bot   | a stored "Interested" (FR-25, FR-28)           | none                                                                                                                                             |
| `tg_roommate_matched`          | bot   | a pair forms, once per person (FR-26)          | `role` (`completer` \| `waiting`)                                                                                                                |
| `tg_roommate_contact_revealed` | bot   | a reveal message is delivered (FR-26)          | none                                                                                                                                             |
| `tg_roommate_push_sent`        | bot   | a daily push is delivered (FR-27), new         | `count_band`                                                                                                                                     |
| `tg_roommate_push_opted_out`   | bot   | "Stop daily messages" (FR-27), new             | none                                                                                                                                             |
| `tg_roommate_reported`         | bot   | a stored report (FR-31)                        | `reason`                                                                                                                                         |
| `tg_roommate_profile_hidden`   | bot   | automatic hiding (FR-32), new                  | `reason` (`reports` \| `under_18`)                                                                                                               |
| `tg_roommate_outcome`          | bot   | an outcome answer (FR-13, FR-29)               | `outcome`, `asked` (`follow_up` \| `delete`)                                                                                                     |
| `tg_roommate_next_step`        | bot   | a next-step tap (FR-30)                        | `step`                                                                                                                                           |
| `roommate_intent_selected`     | web   | the role selector (FR-21)                      | new value `intent=find_flatmate`                                                                                                                 |
| `telegram_bot_opened`          | web   | the roommate block button (FR-21)              | new value `source=roommate`                                                                                                                      |

Bands: `count_band` and `results_band` are `0`, `1-2`, `3-5`, `6+`.

## 7. Screens

- **Bot:** no design; inline keyboards in the style of the deposit intake.
- **Web:** `/[city]/roommate` gets the third role and its block (FR-21) and the room money block
  (FR-22), in the style of the existing role selector and `TelegramBotCta`; no other page
  changes except the privacy and terms sections (FR-36).

## 8. Key copy (drafts for the owner's review)

The bot addresses the person with «ты» / «ти» (D42). Drafts, not approved; legal-sounding lines
(privacy, statement of reasons, safety) are the owner's (Q-7).

**Intake intro (FR-3)**

- RU: «Найдём, с кем снять квартиру. Ответь на несколько коротких вопросов: районы, бюджет на
  человека, месяц заезда, языки. Анкету никто не видит, пока не откроется подбор. Анкета живёт 30 дней,
  удалить её можно в любой момент. Только для 18+. Как мы храним данные: <ссылка>.»
- UK: «Знайдемо, з ким зняти квартиру. Дай відповідь на кілька коротких запитань: райони, бюджет
  на людину, місяць заїзду, мови. Анкету ніхто не бачить, доки не відкриється підбір. Анкета живе
  30 днів, видалити її можна будь-коли. Лише для 18+. Як ми зберігаємо дані: <посилання>.»
- EN: "Let's find someone to rent with. Answer a few short questions: districts, budget per
  person, move-in month, languages. Nobody sees your profile until matching opens. It lasts 30 days and
  you can delete it any time. 18+ only. How we keep your data: <link>."

**Gender and "live with" (FR-8)**

- RU: «Необязательно. С кем готов(а) жить: с кем угодно / с женщинами / с мужчинами. И кто ты:
  женщина / мужчина / пропустить. Это нужно только для взаимного подбора и никому не
  показывается.»
- UK: «Необовʼязково. З ким готовий(-а) жити: з ким завгодно / з жінками / з чоловіками. І хто
  ти: жінка / чоловік / пропустити. Це потрібно лише для взаємного підбору й нікому не
  показується.»
- EN: "Optional. Who you'd live with: anyone / women / men. And you are: a woman / a man / skip.
  Used only for mutual matching and never shown to anyone."

**Short text (FR-10)**

- RU: «Пара слов о себе, до 280 знаков. Без ссылок, телефонов и @ников: контакты появятся, только
  если интерес взаимный. Не пиши о здоровье, религии и других личных вещах.»
- UK: «Кілька слів про себе, до 280 знаків. Без посилань, телефонів і @ніків: контакти зʼявляться,
  лише якщо інтерес взаємний. Не пиши про здоровʼя, релігію та інші особисті речі.»
- EN: "A few words about you, up to 280 characters. No links, phone numbers or @handles: contacts
  appear only when the interest is mutual. Don't include health, religion or other personal
  details."

**Adult confirmation (FR-9)**

- RU: «Подтверди, что тебе 18 или больше.» Buttons «Мне 18+» / «Мне меньше 18». Under 18: «Подбор
  соседей только для взрослых. Мы ничего не сохранили.»
- UK: «Підтверди, що тобі 18 або більше.» Buttons «Мені 18+» / «Мені менше 18». Under 18: «Підбір
  сусідів лише для дорослих. Ми нічого не зберегли.»
- EN: "Please confirm you are 18 or older." Buttons "I'm 18+" / "I'm under 18". Under 18:
  "Matching is for adults only. We saved nothing."

**Counts (FR-16, example 1)**

- RU: «Кроме тебя, анкеты есть у: Мокотув — 2 человека, Воля — 1, готовы к любому району — 1.
  Всего в Варшаве — 5 человек. Подбор откроется, когда людей станет больше.»
- UK: «Окрім тебе, анкети мають: Мокотув — 2 людини, Воля — 1, готові до будь-якого району — 1.
  Усього у Варшаві — 5 людей. Підбір відкриється, коли людей стане більше.»
- EN: "Besides you, people with a profile: Mokotów 2, Wola 1, open to any district 1. In Warsaw 5
  in total. Matching opens when there are more people."

**Opt-in (FR-18)** — button RU «Напиши мне, когда откроется подбор», UK «Напиши мені, коли
відкриється підбір», EN "Message me when matching opens". Confirmation RU «Напишу один раз, когда
подбор откроется.», UK «Напишу один раз, коли підбір відкриється.», EN "I'll message you once when
matching opens." (the sentence on what happens if it never opens depends on Q-11).

**Matching is open (FR-19)**

- RU: «Подбор открыт. Сейчас тебе подходят 3 человека.» Button «Показать».
- UK: «Підбір відкрито. Зараз тобі підходять 3 людини.» Button «Показати».
- EN: "Matching is open. 3 people fit you right now." Button "Show".

**Reveal with safety lines (FR-26)**

- RU: «Интерес взаимный. Напиши @username. Passflat никогда не просит денег. Не плати залог или
  «бронь» до просмотра квартиры и подписанного договора. Если человек просит деньги или
  документы — нажми «Пожаловаться».»
- UK: «Інтерес взаємний. Напиши @username. Passflat ніколи не просить грошей. Не плати заставу чи
  «бронь» до перегляду квартири й підписаного договору. Якщо людина просить гроші чи документи —
  натисни «Поскаржитися».»
- EN: "It's mutual. Write to @username. Passflat never asks for money. Don't pay a deposit or a
  'reservation' before a viewing and a signed contract. If someone asks for money or documents,
  tap Report."

**Daily push (FR-27)** — RU «Новых подходящих людей: 2.», UK «Нових людей, які тобі підходять:
2.», EN "2 new people fit you." Buttons "Show" / "Stop daily messages" in the locale.

**Report receipt (FR-31)** — RU «Жалоба получена. Проверка автоматическая; о решении напишем.»,
UK «Скаргу отримано. Перевірка автоматична; про рішення напишемо.», EN "Report received. The
check is automated; we'll tell you the decision."

**Statement of reasons (FR-33), skeleton only (legal text Q-7):** what was restricted; the
facts (number of reports, reason categories); "decision made automatically"; the ground in the
terms; redress: `/appeal`, contact@passflat.com, a complaint to the President of UKE, court.

**Renewal reminder (FR-15)** — RU «Анкета скроется через 3 дня. Продлить на 30 дней?», UK «Анкета
сховається за 3 дні. Продовжити на 30 днів?», EN "Your profile hides in 3 days. Renew for 30
days?"

**Delete (FR-13)** — RU «Удалить анкету? Это сразу и навсегда. Если вы уже обменялись контактами,
сообщение у другого человека останется.», UK «Видалити анкету? Це одразу й назавжди. Якщо ви вже
обмінялися контактами, повідомлення в іншої людини залишиться.», EN "Delete your profile? It's
immediate and final. If you already swapped contacts, the other person keeps that message."

**Closing message (FR-20, only if Q-11 says yes)** — EN "Matching will not open after all. Your
profile is deleted now. Thanks for trying Passflat." RU and UK follow the EN.

**Website block (FR-21)**

- PL: title «Szukasz kogoś do wspólnego wynajmu?» Text «W Warszawie profil ma już {count} osób.
  Załóż profil w bocie Passflat w Telegramie: dzielnica, budżet na osobę, miesiąc
  przeprowadzki. Kontakty widać dopiero przy obopólnym zainteresowaniu. Bot mówi po angielsku,
  rosyjsku i ukraińsku.» Button «Otwórz bota w Telegramie».
- EN: title "Looking for someone to rent with?" Text "{count} people in Warsaw already have a
  profile. Create yours in the Passflat bot on Telegram: district, budget per person, move-in
  month. Contacts appear only when the interest is mutual. The bot speaks English, Russian and
  Ukrainian." Button "Open the bot in Telegram".
- RU: title «Ищешь, с кем снять квартиру?» Text «В Варшаве анкету уже создали {count} человек.
  Создай свою в боте Passflat в Telegram: район, бюджет на человека, месяц заезда. Контакты
  видны, только когда интерес взаимный. Бот говорит по-английски, по-русски и по-украински.»
  Button «Открыть бота в Telegram».
- UK: title «Шукаєш, з ким зняти квартиру?» Text «У Варшаві анкету вже створили {count} людей.
  Створи свою в боті Passflat у Telegram: район, бюджет на людину, місяць заїзду. Контакти видно,
  лише коли інтерес взаємний. Бот говорить англійською, російською та українською.» Button
  «Відкрити бота в Telegram».

(Plural forms per locale via ICU; with 0 the text is "Be among the first" in each locale.)

## 9. Edge cases across the PRD

- **Nobody answers:** a draft with no answer for 7 days is deleted (FR-12); no reminder.
- **The person blocks the bot:** a 403 marks the chat blocked (existing); the profile stops
  counting and showing; it expires as usual.
- **Two intakes:** one open intake per chat; a `mate` link during the deposit intake says
  `/cancel` first (FR-2).
- **Concurrent taps:** unique constraints and conditional updates decide pairs (FR-26), hides
  (FR-32) and every claimed message (FR-15, FR-19, FR-27, FR-29, FR-33).
- **Usernames change:** the stored `tg_username` is refreshed from every update; a reveal uses
  the latest stored value.
- **The owner's own tests:** only on the dev bot, which runs without the PostHog key (D37).
- **The switch goes off:** FR-23 criterion 3.
- **Time zones:** months and the end of the move-in month in Europe/Warsaw; cron times in UTC.
- **Production migration missing:** the roommate cron fails like `telegram-followups` would; the
  owner applies the migration before the deploy (owner steps).
- **Rate limits:** the bot's 12 messages a minute per chat applies to typed text; button taps are
  not counted (as today).
- **Season:** both readouts state the December–January trough.

## 10. Not in scope

- Web profiles, photos, a web or in-bot chat, e-mail relay (D49).
- Payments of any kind, Telegram Stars, paid speed (stage 3, H16, A25); paid contact never (D52).
- A Polish bot locale (D50, after stage 1 passes).
- "I have a room" profiles, room offers or any listing (D5); aggregation of other platforms'
  listings (D45).
- Groups of three or more; matching outside Warsaw (D6).
- Age bands, names, birth dates, identity verification; "verified" anything.
- Messages to the existing roommate rows of `city_notify_subscriptions` (a consent question for a
  lawyer, Q-13).
- Notifications about building or district figures (E13, D40).
- PRD 2's `dep_<source>` links (PRD 2 On hold, D39).
- Automating DSA Art. 18 (the owner informs the police when a report suggests a threat).
- Production migrations, RLS, Vercel variables, BotFather, the webhook and any real message
  (owner only, D18, D29).

## 11. Owner steps

1. Review `../thesis.md`, this PRD and `prd-3-decision-review.md`; answer the decisions.
2. Deploy PRD 1 with the bot (D29) and move PostHog to the EU project (D30).
3. Approve and apply the one PRD 3 migration after the four bot migrations (D18).
4. Switch RLS on for `roommate_profiles`, `roommate_reactions`, `roommate_reports` (D9).
5. Deploy PRD 3 with `ROOMMATE_MATCHING_ENABLED` unset; run `npm run bot:webhook` so the RU, UK
   and EN command menus are published; update the BotFather description and about text.
6. Review the copy: bot RU/UK/EN, web four locales, privacy and terms drafts.
7. Post links two slots a day under D53 and keep the posting log (FR-41).
8. If accepted (Q-12): review hidden profiles and appeals weekly; inform the police if a report
   suggests a threat (DSA Art. 18).
9. Around 2027-01-07, if stage 1 passes (Q-2): set `ROOMMATE_MATCHING_ENABLED=true`.
10. Keep the lawyer questions of the decision review for when a lawyer is possible (D39, D51).

## 12. Open questions

| ID   | Question                                                                                                    | Owner | Blocks                          |
| ---- | ----------------------------------------------------------------------------------------------------------- | ----- | ------------------------------- |
| Q-1  | Does D14's bot kill rule (< 50 starts in 30 days) still apply now that the bot carries the thesis?          | Owner | E5 readout wording              |
| Q-2  | The switch "around 2027-01-07 if stage 1 passes" comes before the 2027-01-18 readout: on what check?        | Owner | FR-23 timing, E15 dates         |
| Q-3  | What happens between stop and go at the stage 1 readout?                                                    | Owner | E14 verdict, FR-42              |
| Q-4  | What stops stage 2?                                                                                         | Owner | E15 verdict, FR-43              |
| Q-5  | Which profile fields beyond district, budget, month, gender and "live with" are stored?                     | Owner | FR-7, FR-9, FR-10, FR-11        |
| Q-6  | Retention after expiry, for drafts, reports and the ban marker                                              | Owner | FR-13, FR-15, FR-34             |
| Q-7  | Legal texts: privacy and terms sections, statement of reasons, safety lines; launch before a lawyer review? | Owner | FR-26, FR-33, FR-36; the deploy |
| Q-8  | Show "for two people about X each" from flat figures?                                                       | Owner | FR-17 (the split only)          |
| Q-9  | The automatic hiding rule                                                                                   | Owner | FR-32                           |
| Q-10 | The deposit flow for English chats                                                                          | Owner | FR-38 (deposit part only)       |
| Q-11 | What is said, and done, if matching never opens?                                                            | Owner | FR-18 copy, FR-20               |
| Q-12 | The owner's weekly review of hidden profiles and appeals, inside the 30-minute cap?                         | Owner | FR-35                           |
| Q-13 | May the existing roommate e-mail rows be told about matching?                                               | Owner | Nothing in PRD 3 (not in scope) |
| Q-14 | Timeline: one deploy of all of PRD 3 with the switch off by about 2026-12-01?                               | Owner | Day 0 of E14                    |

## 13. Size

About 35 tasks: M1 9, M2 8, M3 6, M4 4, M5 4, M6 4. About 15 bot-flow tasks of 10–30 minutes and
20 small tasks of 2–5 minutes: roughly 4–9 hours of loop time. Cut first if time is short: FR-20,
FR-30, FR-11, FR-22 (Could and Should), then FR-28 and FR-10. Do not cut the 18+ confirmation,
the text filter, deletion, expiry, the honest counts, the report and the statement of reasons.

## What changed

- **0.1, 2026-11-19.** First draft by Claude from D48 – D53 and the two research reports of
  2026-11-19. Not yet reviewed by the owner.
