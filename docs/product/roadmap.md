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
- **PRD 3, roommate matching** (D49) is **Done** (2026-11-19: built and tested on
  `chore/agent-harness`, not deployed; 52 tasks T062 – T113, the four gap-review questions
  answered, D71 – D74; no scope cut, D70). The owner's deploy (handoff: the T105 entry of
  `../../ralph/progress.md` and the evening note in its Learnings): approve the privacy section
  (D56; the moderation terms, the statement of reasons and the safety lines too, since matching
  is live from day 0), approve and apply the one PRD 3 migration after the four bot migrations,
  switch RLS on for `roommate_profiles`, `roommate_reactions`, `roommate_reports`, create the
  production bot and put its token in Vercel (D76), and deploy with
  **`ROOMMATE_MATCHING_ENABLED=true`** (D75; target about 2026-12-01, D67). That deploy is day 0
  of E14 and of E15: stage 2 is live from the start, and nobody waits for a January switch.
- **M7, owner tooling** (D76, D77; `../../ralph/tasks.json`, no PRD): the bot avatar from the
  logo, `npm run bot:profile` (name, descriptions and photo through the Bot API, texts in a
  TypeScript module), one place for the production bot's username with the posting kit's `<bot>`
  placeholder, and a blocked task waiting for the owner's username choice. Built by the loop
  before the deploy; PRD 4 comes after it.
- **Posting from the PRD 3 deploy** (D46, D53, D67): two 30-minute slots a day, replying to
  people who look for a roommate, with `mate_<source>_<group>` links from the deploy day (until
  then, links to the bot's address check and deposit helper), and the posting log (PRD 3 FR-41),
  which also holds the owner's up to 10 minutes a week of moderation review (D65). The templates'
  "matching isn't open yet" sentence is deleted before the first slot (D75).
- **PRD 2**, the deposit sprint, stays **On hold** (D39); E10 and E6 are Stopped (D44).

## Next (2026-12 – 2027-01)

- **Stage 2 first readout at deploy + 14 days** (E15, D60, D75): the match rate over qualifying
  persons (D74), pairs and browsing persons, with the stop rule of D60; with the switch on from
  day 0 there is no separate switch date (D58 superseded by D75).
- **Stage 1 readout on 2027-01-18** (E14, D52): stop below 15 profiles, below 1 profile per
  owner-hour or above 30 manual minutes a week; go at ≥ 30 profiles, ≥ 20 active and ≥ 3 districts
  with ≥ 3 active each; in between, stage 1 is extended once to 2027-02-28 with the same rules
  (D59; the switch stays on, D75).
- **Decision on 2027-01-20** (D43, D52): continue, or shrink Passflat to content plus the free
  tools with near-zero owner time, or stop.

## Later

- E15's second readout around 2027-03-31: ≥ 10 mutual pairs and ≥ 3 "renting together" or
  "talking" outcomes (D52); below 10 pairs matching stops (D60). If the owner stops matching, he
  sets the switch off and runs the closing route once (D64, D72).
- **PRD 4**: not written yet; its focus comes from the first readouts (E5, E8, E9, E13 two weeks
  after the PRD 1 deploy; E15 at deploy + 14 days) and the 2027-01-20 decision.
- Stage 3, paid speed (H16, A25), designed only after stage 2 passes; never paid contact (D52).
- A Polish bot locale, only after stage 1 passes (D50).
- E11 readout, 8 full weeks after the roommate-page change of PRD 3 is deployed (D41).
- If stage 1 is borderline in the low season: a rerun from 2027-08-01 is the owner's call
  (research 2026-11-19).
- A deposit money layer (A12) only if it runs without the owner (D39, D44), and only after a
  lawyer review (A14).
- Paid cost-data access on its trigger (D7); a second Polish city on its trigger (D6). Agency
  reputation is out of focus (D48).
