# Roadmap

Now, next and later by PRD and experiment. Dates are targets, not commitments. Updated when a
PRD changes status or an experiment ends.

## Now (2026-11-18 – 2026-11-30)

- Harness: verify gate (T000), e2e on its own port (T001). Night run 2026-11-18/19 (D21).
- PostHog baseline readout and an independent direction review (`reviews/`).
- PRD 1, activation measurement and the Telegram bot: decomposed on 2026-11-19 into specs
  `docs/specs/01`–`05` and 45 tasks (M1 events 9, M2 roommate 6, M3 building figures 14, M4 bot
  13, M5 measurement docs 3; 6 blocked on owner questions Q-1–Q-6 of
  `prd/prd-1-decision-review.md`); the loop builds it on `chore/agent-harness`. The owner
  answered both decision reviews on 2026-11-19 (D22 – D37): the six blocked tasks are back in
  the queue, T028 is split into four slices, owner follow-ups M6 and a second final check bring
  PRD 1 to 58 tasks.
- PRD 2, deposit sprint: version 0.2, Decided on 2026-11-19 (about 8 tasks); decomposed and
  built after PRD 1 on the same branch (D38).

## Next

- PRD 1 deploy (owner): review the pull request and the draft copy, move PostHog to the EU
  project (`../ops/posthog-eu-migration.md`, D30), apply the four bot migrations one by one,
  switch RLS on, set the token and the webhook, and launch the bot with the deploy (D29). That
  date is E10 day 0 and starts E5; E6 is Stopped "replaced by E10" (D37).
- E10, 14 days from day 0, readout on day 15 (D36); the owner sends the deposit scenario list to
  a Polish lawyer in parallel (D35).
- Two full weeks of measurement after the PRD 1 deploy, then a metrics readout for E8 and E9.

## Later

- Deposit recovery money layer (A12) after a lawyer review (A14).
- Agency reputation on its trigger (D5).
- Paid cost-data access on its trigger (D7).
- A second Polish city on its trigger (D6).
