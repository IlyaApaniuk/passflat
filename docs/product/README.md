# Product documents

Everything about why and what Passflat builds lives here, in English, next to the code. There is
no Notion: one home per document, and agents read the same files the owner edits. The owner
discusses them in Russian in chat; agents record the outcome here in English.

**Start with [thesis.md](thesis.md)**: the thesis, who it is for, what is in and out of focus,
the ladder with its thresholds and the fallback (D48). It is the top product document.

## Document chain

```text
thesis.md                     the thesis, focus, ladder and fallback; read first
BRD (brd.md)                  idea, segments, model, limits, assumption registry A1, A2, …
  ├─ hypotheses.md            H1, H2, …: what we believe would create demand or revenue
  │    └─ experiments.md      E1, E2, …: cheap tests with a metric, a threshold and dates
  ├─ reviews/                 dated PostHog readouts, direction reviews, process retros
  └─ prd/prd-<n>-<slug>.md    one stage: requirements FR-1, FR-2, … with acceptance criteria
       └─ prd/prd-<n>-decision-review.md   what agents may not decide, with proposals; the owner answers
            └─ ../specs/       the system design for agents (English, agent-owned)
                 └─ ../../ralph/tasks.json   atomic tasks the loop builds
decisions.md                  D1, D2, …: every owner decision with date and reason
roadmap.md                    now / next / later, by PRD and experiment
prd-rules.md                  how to write a PRD the loop can build without guessing
```

## Identifiers and statuses

- Numbers are never reused: A (assumptions), H (hypotheses), E (experiments), D (decisions),
  FR (requirements, per PRD), Q (open questions, per PRD).
- Assumption status: **Confirmed** (fact with date and source), **Partly**, **Testing**,
  **Untested**, **Contradicted**. Whoever gets the fact changes the status and adds a line to the
  BRD change log.
- Hypothesis status: **Idea**, **Ready** (experiment designed), **Testing**, **Supported**,
  **Rejected**, **Parked** (with a trigger).
- Experiment status: **Planned**, **Running**, **Done** (with result), **Stopped**.
- PRD status: **Draft**, **Evaluated**, **Decided** (owner answered the decision review),
  **In progress** (tasks in the loop), **Done**, then **Deployed** when the owner ships it;
  **On hold** (the owner paused it; its text is kept and it is not decomposed).
- Requirement and spec marks: **Decided**, **Assumption**, **Open**.

## Precedence

Latest decision in `decisions.md` > thesis > PRD > BRD > research and reviews > archive. A PRD that
contradicts the BRD or relies on a contradicted assumption goes back to the owner through the
decision review; agents do not resolve it.

## Evidence rules

- A number needs its date, its source and, for analytics, the date range, the event or query
  and whether it counts events, persons or database rows.
- PostHog numbers before 2026-07-28 counted only visitors who accepted cookies and are not
  comparable with later numbers (D10).
- Small samples are reported as counts, not percentages. Compare full weeks.
- Research and agent reviews are judgements with sources, not decisions. Only the owner turns a
  proposal into a decision, a hypothesis, an experiment or a requirement.

## History

Product notes before 2026-11-18 lived in Russian in `PROJECT.md`, `DEVELOPMENT_PLAN.md`,
`ARCHITECTURE.md`, `COMPETITORS.md`, `docs/plans/` and `docs/audit-2026-07-27.md`. Their content
that still holds is in `brd.md`, `decisions.md`, `hypotheses.md`, `experiments.md`,
`../research/competitors.md`, `../architecture.md` and `prd/prd-1-activation-and-bot.md`. The
originals were removed on 2026-11-18 and remain in git history (`git log --all -- PROJECT.md`).
