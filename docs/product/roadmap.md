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
  answers the decision review, reviews the pull request, applies the four bot migrations and
  launches the bot when ready.

## Next

- Launch the bot in production and start E5 and E6 (owner: token, webhook, migrations, RLS).
- Two full weeks of measurement after the PRD 1 deploy, then a metrics readout for E8 and E9.
- PRD 2: the first demand and revenue test chosen from the readout and the direction review.

## Later

- Deposit recovery money layer (A12) after a lawyer review (A14).
- Agency reputation on its trigger (D5).
- Paid cost-data access on its trigger (D7).
- A second Polish city on its trigger (D6).
