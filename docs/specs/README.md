# Specs

These specs describe what the loop builds. They grow with every PRD: a new PRD changes existing
specs and adds new ones. Loop iterations read only these specs and the code; product documents
in `docs/product/` explain why, the specs say what.

**Current PRD:** PRD 1, "Activation measurement and the Telegram bot"
(`../product/prd/prd-1-activation-and-bot.md`, version 0.1), decomposed on 2026-11-19 in the
night run (D21) before the owner answered its decision review
(`../product/prd/prd-1-decision-review.md`). Requirements FR-1 – FR-49 are defined there, in the
"Requirements (FR mapping)" table. Owner questions Q-1 – Q-6 are blocked tasks. Harness tasks
of milestone M0 are archived in `../../ralph/archive/harness-tasks.json`.

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

## Copy rules for every task

- New keys go into all four files of `src/i18n/messages/` (the parity test of spec 01 fails
  otherwise).
- A client component only receives the namespaces in `SHARED_CLIENT_NAMESPACES`
  (`src/i18n/messages.ts`) or those of a scoped `NextIntlClientProvider` on its page (for
  example `checker`). Put a new key in a namespace the component already receives, or extend
  the provider; a missing namespace fails only at runtime and no test catches it, so the task
  names the namespace and the provider it checked in its progress entry.
- Bot copy lives in `src/lib/bot/texts.ts` and `deposit-texts.ts`, RU and UK.

## Spec files

| File                                                       | Area                                                     | PRD 1 package |
| ---------------------------------------------------------- | -------------------------------------------------------- | ------------- |
| [01-analytics-context.md](01-analytics-context.md)         | Page context, entry page, activation events, key parity  | A (M1)        |
| [02-roommate-and-waitlist.md](02-roommate-and-waitlist.md) | Roommate roles, interest API, city-launch, empty states  | B (M2)        |
| [03-building-figures.md](03-building-figures.md)           | Shared figure contract and every surface that shows it   | C (M3)        |
| [04-telegram-bot.md](04-telegram-bot.md)                   | Deep links, honest cards, promises, analytics, reminders | D (M4)        |
| [05-measurement-docs.md](05-measurement-docs.md)           | Funnel doc, bot README, final check                      | E (M5)        |

## Requirement map

Status: Planned (task todo), Blocked (owner question), Done.

| FR                                         | Requirement                                                                 | Spec                                                           | Status  |
| ------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------- | ------- |
| —                                          | Harness: the `verify` gate (T000), e2e on its own port (T001)               | [../development-workflow.md](../development-workflow.md)       | Done    |
| FR-1, FR-2                                 | Page context and entry page type on every client event                      | [01 §Page context, §Attaching](01-analytics-context.md)        | Planned |
| FR-3                                       | `roommate_intent_selected`                                                  | [02 §Role selector](02-roommate-and-waitlist.md#role-selector) | Planned |
| FR-4, FR-12                                | Listing events: `listing_type`, filtered `results_count`                    | [01 §Listing events](01-analytics-context.md#listing-events)   | Planned |
| FR-5                                       | Contact clicks documented as clicks                                         | [05 §Funnels](05-measurement-docs.md)                          | Planned |
| FR-6, FR-7                                 | `listing_interest_saved`, `listing_interest_failed`                         | [01 §Interest events](01-analytics-context.md#interest-events) | Planned |
| FR-8, FR-10                                | Context through the roommate → checker → form chain                         | [01 §Attaching](01-analytics-context.md)                       | Planned |
| FR-9                                       | `building_detail_viewed` source counts                                      | [01 §Building view](01-analytics-context.md#building-view)     | Planned |
| FR-11                                      | `telegram_bot_opened`                                                       | [01 §Telegram link click](01-analytics-context.md)             | Planned |
| FR-13                                      | Landing capture (PRD 2 FR-1)                                                | [01 §Landing capture](01-analytics-context.md#landing-capture) | Blocked |
| FR-14 – FR-20                              | Roommate roles, sign-in, checker link, interest classes, copy, empty states | [02](02-roommate-and-waitlist.md)                              | Planned |
| FR-21, FR-22, FR-24 – FR-30, FR-32 – FR-34 | Figure contract and its surfaces                                            | [03](03-building-figures.md)                                   | Planned |
| FR-23                                      | Single-number surfaces for a mixed base                                     | [03 §Single-number surfaces](03-building-figures.md)           | Blocked |
| FR-31                                      | No "verified" claims; marketing copy                                        | [03 §Marketing copy](03-building-figures.md#marketing-copy)    | Blocked |
| FR-35 – FR-42, FR-44, FR-46                | Bot handoff, cards, promises, analytics, links, scenarios, reminders        | [04](04-telegram-bot.md)                                       | Planned |
| FR-43, FR-45                               | Deposit wording, lawyer-interest wording                                    | [04](04-telegram-bot.md)                                       | Blocked |
| FR-47 – FR-49                              | Funnel doc, bot README, final check                                         | [05](05-measurement-docs.md)                                   | Planned |

## Related references

- Architecture and invariants: [../architecture.md](../architecture.md) and `CLAUDE.md`.
- Product documents: [../product/README.md](../product/README.md).
- Telegram bot: `src/lib/bot/README.md`.
