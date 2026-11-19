# Roadmap

Now, next and later by PRD and experiment. Dates are targets, not commitments. Updated when a
PRD changes status or an experiment ends. The thesis and the ladder are in `thesis.md` (D48).

## Now (2026-11-19 – 2026-12-31)

- **PRD 1 deploy and bot launch** (owner): PRD 1 is built on `chore/agent-harness` (60 tasks,
  T002 – T061, all done). Review the pull request and the draft copy (including the «ты» texts of
  T061), move PostHog to the EU project (`../ops/posthog-eu-migration.md`, D30), apply the four
  bot migrations one by one, switch RLS on, set the token and the webhook, and launch the bot
  (D29). The deposit flow ships as a free, fully automatic tool (D44). That date starts E5
  (30 days, D14; PRD 3 Q-1) and the two-week readouts of E8, E9 and E13.
- **PRD 3, roommate matching, built in December** (D49): the owner reviews `thesis.md`,
  `prd/prd-3-roommate-matching.md` and `prd/prd-3-decision-review.md` (14 decisions; answers by
  about 2026-11-25 keep the calendar), then the loop decomposes and builds it (about 35 tasks,
  4–9 hours). The owner approves one migration after the four bot migrations, switches RLS on for
  `roommate_profiles`, `roommate_reactions`, `roommate_reports`, and deploys with
  `ROOMMATE_MATCHING_ENABLED` unset (target about 2026-12-01, Q-14). That deploy is day 0 of E14.
- **Posting from about 2026-12-01** (D46, D53): two 30-minute slots a day, replying to people who
  look for a roommate, with `mate_<source>_<group>` links once PRD 3 is live (until then, links to
  the bot's address check and deposit helper), and the posting log (PRD 3 FR-41).
- **PRD 2**, the deposit sprint, stays **On hold** (D39); E10 and E6 are Stopped (D44).

## Next (2027-01)

- **Stage 2 switch around 2027-01-07** for February move-ins, only if stage 1 passes (D49; the
  check before the readout is PRD 3 Q-2). Readout of E15 at switch + 14 days.
- **Stage 1 readout on 2027-01-18** (E14, D52): stop below 15 profiles, below 1 profile per
  owner-hour or above 30 manual minutes a week; go at ≥ 30 profiles, ≥ 20 active and ≥ 3 districts
  with ≥ 3 active each.
- **Decision on 2027-01-20** (D43, D52): continue, or shrink Passflat to content plus the free
  tools with near-zero owner time, or stop.

## Later

- E15's second readout around 2027-03-31: ≥ 10 mutual pairs and ≥ 3 "renting together" or
  "talking" outcomes (D52).
- Stage 3, paid speed (H16, A25), designed only after stage 2 passes; never paid contact (D52).
- A Polish bot locale, only after stage 1 passes (D50).
- E11 readout, 8 full weeks after the roommate-page change of PRD 3 is deployed (D41).
- If stage 1 is borderline in the low season: a rerun from 2027-08-01 is the owner's call
  (research 2026-11-19).
- A deposit money layer (A12) only if it runs without the owner (D39, D44), and only after a
  lawyer review (A14).
- Paid cost-data access on its trigger (D7); a second Polish city on its trigger (D6). Agency
  reputation is out of focus (D48).
