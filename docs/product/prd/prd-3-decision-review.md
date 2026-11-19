# PRD 3 decision review

- **PRD:** `prd-3-roommate-matching.md`, version 0.1 of 2026-11-19
- **Written by:** Claude, `prd-intake` sections 1 and 2 (evaluate only), 2026-11-19. Section 0 was
  skipped: the loop is idle and PRD 3 is not decomposed until the owner has reviewed the thesis
  and PRD 3 (D49).
- **Verdict: ready with assumptions.** All 44 requirements have an id, a milestone, testable
  acceptance criteria, a Decided / Assumption / Open mark, edge cases, a screen or "no design",
  copy or a draft, and dependencies; every count and figure rule has a numeric example (§5 of the
  PRD). What an agent may not decide is listed below. Three decisions touch personal data and
  legal texts and block parts of M1 and M4 (1 – 3); five block single requirements (8 – 12);
  six change only readouts or dates (4 – 7, 13, 14).
- **Decisions for the owner:** 14, plus a list of Assumption defaults to confirm (row 15) and the
  lawyer questions to keep (row 16).
- **Size:** about 35 tasks (M1 9, M2 8, M3 6, M4 4, M5 4, M6 4); about 15 bot-flow tasks of 10–30
  minutes and 20 small tasks of 2–5 minutes, roughly 4–9 hours of loop time. The fit report
  estimated 25 for stages 1 and 2; the difference is the English bot locale (D50, 4 tasks), the
  D41 room money block (2) and the safety and expiry details.

## Readiness check per requirement

| FR            | Ready  | Notes                                                                                                                                                                   |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1          | Yes    | One migration for both stages, as the owner asked; RLS stays the owner's (D9)                                                                                           |
| FR-2          | Yes    | `entry_source` already names something else on the check events (`ENTRY_SOURCE`); the PRD keeps a separate constant. PRD 2 FR-2 (on hold) could reuse the source parser |
| FR-3          | Yes    | Changes the shared capability list; texts.test.ts must keep passing                                                                                                     |
| FR-4 – FR-6   | Yes    | Fields Decided (D49); bands, the 3-district cap and the 4 months are Assumptions (row 15)                                                                               |
| FR-7          | No     | Which personal data is stored (decision 1)                                                                                                                              |
| FR-8          | Yes    | Decided by D51; the lawyer question stays (row 16)                                                                                                                      |
| FR-9 – FR-11  | No     | Decision 1                                                                                                                                                              |
| FR-12         | Yes    | The 7-day draft lifetime is part of decision 2                                                                                                                          |
| FR-13         | Partly | Deletion at once is Decided; what happens to reports is decision 2                                                                                                      |
| FR-14         | Yes    |                                                                                                                                                                         |
| FR-15         | Partly | The 30-day life is Decided; the end-of-month rule, the grace period and deletion are decision 2                                                                         |
| FR-16         | Yes    | Displayed counts touch the honesty rules; the owner's own example ("4 people are looking in Mokotów") sets the form; the counting details are in row 15                 |
| FR-17         | Partly | Room figures follow the figure contract (Decided); the per-person split of flat figures is decision 8                                                                   |
| FR-18         | Partly | The promise copy depends on decision 11; texts.test.ts needs a named exception for the one promise backed by FR-19                                                      |
| FR-19         | Yes    | A new outward message type; built, sent only after the owner turns the switch on                                                                                        |
| FR-20         | No     | Decision 11                                                                                                                                                             |
| FR-21, FR-22  | Yes    | Web copy in four locales as drafts; FR-22 carries E11 (D41)                                                                                                             |
| FR-23 – FR-25 | Yes    | Timing of the switch is decision 5 and does not block the build                                                                                                         |
| FR-26         | Partly | The safety lines are legal-sounding copy (decision 3)                                                                                                                   |
| FR-27 – FR-31 | Yes    | The daily push is Decided (D49); the outcome question (FR-29) and the renewal reminder (FR-15) are new messages the agent proposes (row 15)                             |
| FR-32         | No     | Moderation rule written into the terms (decision 9)                                                                                                                     |
| FR-33         | Partly | Automatic, Decided; the legal text is decision 3                                                                                                                        |
| FR-34         | Yes    | How long the ban marker is kept is decision 2                                                                                                                           |
| FR-35         | Partly | The owner's weekly minutes (decision 12)                                                                                                                                |
| FR-36         | No     | Legal texts (decision 3)                                                                                                                                                |
| FR-37         | Yes    | `pl` → English changes what Polish-language Telegram users get today (Russian); row 15                                                                                  |
| FR-38         | Partly | The deposit flow in English is decision 10                                                                                                                              |
| FR-39 – FR-44 | Yes    | The loop writes the readout queries but never runs them (CLAUDE.md); verdict wording waits for decisions 6 and 7                                                        |

## Conflicts and dependencies

- **D14 and thesis v2.** D14 kills the bot below 50 `/start` in 30 days. The bot now carries the
  thesis and the free deposit tool (D44, D48); a kill at day 30 would end stage 1 in the middle
  of its window (decision 4).
- **D52 timing.** The stage 2 switch "around 2027-01-07 only if stage 1 passes" comes eleven days
  before the stage 1 readout of 2027-01-18 (decision 5). D52 has no rule between stop and go
  (decision 6) and no stop rule for stage 2 (decision 7).
- **PRD 1 exclusions and the direction review.** PRD 1 §2 and §5 excluded matching, seeker
  profiles and a third roommate role; the direction review's proposal 6 dropped the roommate
  marketplace. D49 supersedes both for PRD 3; PRD 3 says so in its header. Resolved.
- **The bot's "sends nothing on its own" rule** (bot README "Promises and capabilities"): PRD 3
  adds the renewal reminder, the one-time message, the daily push, the outcome question and the
  statement of reasons. The push is Decided (D49, opt-out); the others are proposals (row 15).
  The README and texts.test.ts change with FR-18 and FR-40.
- **D37 "the bot speaks Russian and Ukrainian"** on web copy: D50 adds English; FR-39 changes the
  lines. Resolved.
- **The existing `Report` model** accepts only listing targets and web reporters; PRD 3 adds
  `roommate_reports` instead of widening it. No conflict.
- **PRD 1 first.** PRD 3 depends on PRD 1's packages A–E being deployed (`telegram_bot_opened`,
  the role selector, the figure contract, deep links, the claim-before-send pattern) and on the
  four bot migrations being applied before PRD 3's one (D29, D18).
- **Calendar.** Posting from about 2026-12-01 (roadmap) needs stage 1 live by then; every week
  later removes about a seventh of the window before 2027-01-18 (decision 14).
- **Contradicted assumptions.** None is relied on: A18 and A21 are Contradicted and already acted
  on (no room offers; no on-site test read in two weeks).
- **Specs.** `docs/specs/` has no roommate spec. Decomposition would add specs for profiles and
  intake, and for matching and safety, and change spec 02 (roommate roles), spec 04 (deep links,
  locale, promises) and spec 05 (measurement).
- **External services.** None new: Telegram, Vercel Cron and the database already exist; one new
  daily cron route. No price or paid service is involved.

## Decisions for the owner

| #   | What has to be decided                                                                                                                     | Why the agent cannot decide                                               | Agent's proposal and options (with cost)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | What it blocks                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | Profile fields beyond district, budget, month, gender and "live with" (Q-5)                                                                | Which personal data is stored                                             | **Proposal:** languages (needed for compatibility), an 18+ confirmation without an age band, an optional 280-character text with the filter, optional house rules (smoking, pets); no name, photo, age band or length of stay. (a) proposal; (b) minimal: no text and no house rules: thinner cards, less moderation risk, 2 tasks fewer; (c) the fit report's full set with age band and length of stay: 1 task more, more data                                                                                                                     | FR-7, FR-9 – FR-11; M1 decomposition |
| 2   | Retention after expiry, for drafts, reports and the ban marker (Q-6)                                                                       | How long personal data is kept                                            | **Proposal:** hidden at the earlier of 30 days and the end of the move-in month; renewable for 14 days, then deleted; unfinished drafts deleted after 7 days; reports kept 6 months (the complaint window the terms already promise), references nulled when a profile is deleted; the ban marker kept while the chat row exists. (a) proposal; (b) delete at expiry with no grace: strictest, renewal only before expiry; (c) the fit report's 30-day grace                                                                                         | FR-12, FR-13, FR-15, FR-34           |
| 3   | The privacy and terms sections, the statement of reasons and the safety lines; and whether stage 1 launches before any lawyer review (Q-7) | Legal texts and legal reasoning; the owner cannot hire a lawyer now (D39) | **Proposal:** the agent drafts all four in four locales; the owner approves; stage 1 launches with the privacy section approved by the owner, the terms' moderation section before the switch, and the lawyer questions kept (row 16), as D35 did for E10. (b) wait for a lawyer: stage 1 cannot start before the readout date, which ends the test; (c) launch stage 1 with a minimal privacy note only: faster, weaker                                                                                                                             | FR-26, FR-33, FR-36; the deploy      |
| 4   | Does D14's kill rule still apply to the bot (Q-1)?                                                                                         | It changes an owner decision                                              | **Proposal:** the E5 numbers are still reported at day 30, but the bot's fate is decided by the stage 1 readout and the 2027-01-20 decision, because the bot carries the thesis and the free deposit tool. (b) keep D14: below 50 starts in 30 days the bot is killed, possibly in the middle of stage 1                                                                                                                                                                                                                                             | E5 wording only                      |
| 5   | When the stage 2 switch goes on (Q-2)                                                                                                      | Business thresholds and dates are the owner's                             | **Proposal:** the readout query (FR-42) is run daily from 2027-01-04; the switch goes on at the first day on or after 2027-01-07 when all three go numbers hold (≥ 30 profiles, ≥ 20 active, ≥ 3 districts with ≥ 3); otherwise it waits for the 2027-01-18 readout and the 2027-01-20 decision. (b) switch only after 2027-01-20: cleaner, less time before February move-ins                                                                                                                                                                       | E15 dates; not the build             |
| 6   | What happens between stop and go at the stage 1 readout (Q-3)                                                                              | Business thresholds                                                       | **Proposal:** extend stage 1 once to 2027-02-28 with the same rules and the switch off (the fit report's rule); on 2027-01-20 the owner then decides "continue the test". (b) treat it as stop; (c) treat it as go and open stage 2 for the pool that exists                                                                                                                                                                                                                                                                                         | E14 verdict, FR-42 wording           |
| 7   | What stops stage 2 (Q-4)                                                                                                                   | Business thresholds                                                       | **Proposal:** stop matching if, 14 days after the switch, fewer than 15 % of qualifying persons have a match (the fit report's kill level) or no pair formed among 20 or more browsing persons; and stop at about 2027-03-31 below 10 pairs. Outcomes are counted as persons (both people of one pair may answer). (b) no early stop, only the 2027-03-31 readout                                                                                                                                                                                    | E15 verdict, FR-43 wording           |
| 8   | Show "for two people about X each" from flat figures (Q-8)                                                                                 | The honesty rules for displayed figures                                   | **Proposal:** yes, only on the tenant group's all-in median of apartments in the area, with its N, labelled "half of the median flat", rounded half up to 10 zł; never on a known part or on asking prices. (b) no split: rooms only, the per-person promise of the thesis stays implicit; (c) split asking prices too, labelled                                                                                                                                                                                                                     | FR-17 (the split only)               |
| 9   | The automatic hiding rule (Q-9)                                                                                                            | Moderation policy that goes into the terms; DSA                           | **Proposal:** hide at 2 reports from different people, or at once on 1 report "looks under 18". (b) hide on any single report: strict, but anyone can hide anyone; (c) 3 reporters: lenient, scams stay up longer                                                                                                                                                                                                                                                                                                                                    | FR-32                                |
| 10  | The deposit flow for English chats (Q-10)                                                                                                  | Legal-sounding copy; the deposit rules are unreviewed (A14)               | **Proposal:** the deposit flow stays Russian and Ukrainian; an English chat gets "The deposit helper speaks Russian and Ukrainian for now" and the two language buttons. (b) translate the deposit flow into English: 1–2 tasks, owner review, A14 risk in a third language                                                                                                                                                                                                                                                                          | FR-38 (deposit part)                 |
| 11  | What is said, and done, if matching never opens (Q-11)                                                                                     | A promise to users and a mass message                                     | **Proposal:** the opt-in reply says "If matching does not open, we'll tell you and delete your profile"; FR-20 is built as a manual, owner-triggered route. (b) no closing message: profiles expire in 30 days, and the opt-in copy must then promise nothing beyond "once if it opens"                                                                                                                                                                                                                                                              | FR-18 copy, FR-20                    |
| 12  | The owner's weekly review of hidden profiles and appeals (Q-12)                                                                            | Owner time; DSA requires a contact point that is not only automated       | **Proposal:** up to 10 minutes a week, counted in the 30-minute cap of D52; the owner also informs the police when a report suggests a threat (DSA Art. 18). (b) no review: hides are final except by e-mail to contact@passflat.com                                                                                                                                                                                                                                                                                                                 | FR-35                                |
| 13  | May the existing roommate rows of `city_notify_subscriptions` be told about matching (Q-13)?                                               | Consent and e-mail sending                                                | **Proposal:** no; they agreed to "interest saved, no automatic notifications" (PRD 1 FR-19). Kept as a lawyer question                                                                                                                                                                                                                                                                                                                                                                                                                               | Nothing in PRD 3                     |
| 14  | Timeline (Q-14)                                                                                                                            | Deployments are the owner's                                               | **Proposal:** answers by about 2026-11-25; the loop decomposes and builds; PRD 1 is deployed before; PRD 3 ships in one deploy with the switch off by about 2026-12-01, and posting with `mate_` links starts that day. (b) two deploys: stage 1 first, M3 and M4 before 2027-01-04: stage 1 a few days earlier, one more deploy                                                                                                                                                                                                                     | E14 day 0                            |
| 15  | Confirm the Assumption defaults (not blocking)                                                                                             | They shape displayed counts, messages users receive and matching          | Budget bands b1–b5 (≤ 1,199 / 1,200–1,599 / 1,600–1,999 / 2,000–2,499 / ≥ 2,500 zł per person all-in); up to 3 districts; 4 move-in months; compatible within one band and one month; counts of active profiles per district without combinations, the viewer excluded, "any" on its own line; top 5 districts on the web with counts up to an hour old; 20 "Interested" a day; the renewal reminder 3 days before; the outcome question at 21 days; daily messages at 09:00 UTC; `/mate`; `pl` Telegram users get English; one open intake per chat | Nothing; each is one constant        |
| 16  | Lawyer questions to keep for later (not blocking; D39, D51)                                                                                | Legal reasoning                                                           | The legal basis per field (Art. 6(1)(b) or consent); whether house rules touch Art. 9; whether a women-only or men-only preference is lawful in private housing (D51); whether the bot button plus e-mail meets DSA Art. 16, and the Art. 17 template and Art. 14 terms; the privacy update and whether a DPIA is needed (UODO list, M.P. 2019 poz. 666); the opt-out daily push; decision 13                                                                                                                                                        | Nothing now                          |

## New BRD assumptions

Registered on 2026-11-19 by the owner's instruction (BRD v0.2): A18 and A21 (Contradicted, from
`prd-2-decision-review.md`), A22 – A27 (Untested). Proposed here, not registered:

| No. | Assumption                                                                  | Proposed status | Source                                                                                                   | Used by      |
| --- | --------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- | ------------ |
| A28 | Most people who want a match have a Telegram username or set one when asked | Untested        | `username` is optional in the Bot API User object (fit report §2); measured by FR-25 criterion 2 replies | FR-25, FR-26 |

## Risks and what could be cut

- **Liquidity** (A22, A24): the go threshold (≥ 20 active) is far below the market research's
  estimate of 100–200 active profiles for 5–10 compatible people per seeker. Stage 2 tests
  whether a small pool still produces pairs; a thin pool shows as many "nobody fits yet" replies.
- **Calendar:** the window from about 2026-12-01 to 2027-01-18 includes the holidays and the
  December trough; a late deploy shortens it further (decision 14).
- **Usernames** (A28): people without a username cannot be revealed; if many lack one, matches
  stall at FR-26 criterion 3.
- **Channel bans** (D53): identical links in Facebook groups risk the passflat.com domain; the
  posting kit (FR-41) varies wording and the log records removals.
- **Law without a lawyer** (decision 3, row 16): the gender preference, profile data and DSA
  duties are drafted by an agent and approved by the owner only.
- **Scope:** about 35 tasks against the fit report's 25.
- **Cut first:** FR-20, FR-30, FR-11 and FR-22 (Could and Should), then FR-28, FR-10 and FR-39.
  Do not cut the 18+ confirmation, the text filter, deletion, expiry, the honest counts, the
  report or the statement of reasons.
