# Roadmap

Now, next and later by PRD and experiment. Dates are targets, not commitments. Updated when a
PRD changes status or an experiment ends. The thesis and the ladder are in `thesis.md` (D48).

## Now (2026-11-19 – 2026-12-31)

- **PRD 1 deploy and bot launch** (owner): PRD 1 is Done (2026-11-19: built and tested on
  `chore/agent-harness`, not deployed; 60 tasks archived in
  `../../ralph/archive/prd-1-activation-and-bot-tasks.json`). Review the pull request and the
  draft copy (including the «ты» texts of T061), move PostHog to the EU project
  (`../ops/posthog-eu-migration.md`, D30), apply the four bot migrations one by one, switch RLS
  on, set the token and the webhook, and launch the bot (D29). The deposit flow ships as a free,
  fully automatic tool (D44). That date starts E5 (reported at day 30, no kill rule, D57) and the
  two-week readouts of E8, E9 and E13. PRD 1 is deployed before PRD 3 (D67).
- **PRD 3, roommate matching** (D49): the owner answered every question on 2026-11-19 (D54 –
  D70); PRD 3 is decomposed into specs 06 and 07 (and PRD 3 sections of 02, 04, 05) and 49
  tasks (T062 – T110), built by the loop from the night of 2026-11-19 on `chore/agent-harness`
  (D67), with no scope cut (D70). Four tasks (T107 – T110) wait for the owner's answers to Q-15 –
  Q-18, raised by the architect gap review (`prd/prd-3-decision-review.md`). The owner approves the privacy section
  (before the deploy, D56), approves and applies the one PRD 3 migration after the four bot
  migrations, switches RLS on for `roommate_profiles`, `roommate_reactions`, `roommate_reports`,
  and deploys with `ROOMMATE_MATCHING_ENABLED` unset (target about 2026-12-01, D67). That deploy
  is day 0 of E14.
- **Posting from about 2026-12-01** (D46, D53, D67): two 30-minute slots a day, replying to
  people who look for a roommate, with `mate_<source>_<group>` links from the PRD 3 deploy day
  (until then, links to the bot's address check and deposit helper), and the posting log (PRD 3
  FR-41), which also holds the owner's up to 10 minutes a week of moderation review (D65).
- **PRD 2**, the deposit sprint, stays **On hold** (D39); E10 and E6 are Stopped (D44).

## Next (2027-01)

- **Stage 2 switch** for February move-ins (D49, D58): from 2027-01-04 the owner runs the E14
  query daily and turns the switch on at the first day on or after 2027-01-07 when all three go
  numbers hold, after approving the moderation terms, the statement of reasons and the safety
  lines (D56); otherwise the switch waits for the 2027-01-20 decision. Readout of E15 at switch +
  14 days, with the stop rule of D60.
- **Stage 1 readout on 2027-01-18** (E14, D52): stop below 15 profiles, below 1 profile per
  owner-hour or above 30 manual minutes a week; go at ≥ 30 profiles, ≥ 20 active and ≥ 3 districts
  with ≥ 3 active each; in between, stage 1 is extended once to 2027-02-28 with the switch off
  (D59).
- **Decision on 2027-01-20** (D43, D52): continue, or shrink Passflat to content plus the free
  tools with near-zero owner time, or stop.

## Later

- E15's second readout around 2027-03-31: ≥ 10 mutual pairs and ≥ 3 "renting together" or
  "talking" outcomes (D52); below 10 pairs matching stops (D60). If matching never opens, the
  owner runs the closing route once (D64).
- Stage 3, paid speed (H16, A25), designed only after stage 2 passes; never paid contact (D52).
- A Polish bot locale, only after stage 1 passes (D50).
- E11 readout, 8 full weeks after the roommate-page change of PRD 3 is deployed (D41).
- If stage 1 is borderline in the low season: a rerun from 2027-08-01 is the owner's call
  (research 2026-11-19).
- A deposit money layer (A12) only if it runs without the owner (D39, D44), and only after a
  lawyer review (A14).
- Paid cost-data access on its trigger (D7); a second Polish city on its trigger (D6). Agency
  reputation is out of focus (D48).
