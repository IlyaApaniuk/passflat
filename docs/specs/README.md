# Specs

These specs describe what the loop builds. They grow with every PRD: a new PRD changes existing
specs and adds new ones. Loop iterations read only these specs and the code; product documents
in `docs/product/` explain why, the specs say what.

**Current PRD:** none decomposed yet. PRD 1 ("Activation measurement and the Telegram bot") is a
draft in `docs/product/prd/prd-1-activation-and-bot.md`. Tasks in `ralph/tasks.json` until then
are harness tasks (milestone M0), specified in `docs/development-workflow.md`.

## How iterations work

Each PRD (PRD 1, PRD 2, ...) is decomposed completely into specs in this folder and atomic tasks
in `ralph/tasks.json`. A PRD is done when all of its tasks are done; the next PRD describes the
next stage. Milestones inside a PRD only set the order of work. A task that needs an owner
answer is `blocked` with the question in its notes; the loop skips it and everything that does
not depend on it proceeds.

## Markers

- **Decided**: build exactly as written.
- **Assumption**: build it, keep the value in one config place so it is a one-line change, and
  name it in the task's progress entry.
- **Open**: do not guess. If a task needs it, block the task with the question.

Where a spec rests on a business assumption, it cites it as "BRD A<n>"
(`docs/product/brd.md`), and a decision as "D<n>" (`docs/product/decisions.md`).

## What an agent never decides

Prices and tariffs; legal texts and legal reasoning (terms, privacy policy, disclaimers, the
deposit rules and letters, anything presented as a statutory deadline); choosing paid external
services; which personal data is stored and for how long; the consent model and analytics
identity; the honesty rules for displayed figures (sources, sample sizes, "verified" claims);
deployments, production migrations, RLS and anything that touches the production database,
Vercel, PostHog settings, Telegram webhooks or Cloudflare; sending real emails or messages.
Draft copy is allowed where a spec says so; list such keys in the progress entry for review.

## Requirement map

| FR  | Requirement                                                   | Spec                                                     | Status |
| --- | ------------------------------------------------------------- | -------------------------------------------------------- | ------ |
| —   | Harness: the `verify` gate (T000), e2e on its own port (T001) | [../development-workflow.md](../development-workflow.md) | Done   |

## Related references

- Architecture and invariants: [../architecture.md](../architecture.md) and `CLAUDE.md`.
- Product documents: [../product/README.md](../product/README.md).
- Telegram bot: `src/lib/bot/README.md`.
