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

Status: Done (every task of the row done), Blocked (an owner question; the task holds it),
Planned (task todo). Final check (T046, 2026-11-19): every non-blocked PRD 1 task is done; six
tasks wait for answers Q-1 – Q-6.

| FR                   | Requirement                                                              | Spec                                                               | Tasks                         | Status  |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------- | ------- |
| —                    | Harness: the `verify` gate, e2e on its own port                          | [../development-workflow.md](../development-workflow.md)           | T000, T001                    | Done    |
| —                    | Locale key parity test                                                   | [01 §Locale key parity](01-analytics-context.md#locale-key-parity) | T003                          | Done    |
| FR-1, FR-2           | Page context and entry page type on every client event                   | [01 §Page context, §Attaching](01-analytics-context.md)            | T004, T005                    | Done    |
| FR-3                 | `roommate_intent_selected`                                               | [02 §Role selector](02-roommate-and-waitlist.md#role-selector)     | T013                          | Done    |
| FR-4, FR-12          | Listing events: `listing_type`, filtered `results_count`                 | [01 §Listing events](01-analytics-context.md#listing-events)       | T006, T007                    | Done    |
| FR-5                 | Contact clicks documented as clicks                                      | [05 §Funnels](05-measurement-docs.md)                              | T044                          | Done    |
| FR-6, FR-7           | `listing_interest_saved`, `listing_interest_failed`                      | [01 §Interest events](01-analytics-context.md#interest-events)     | T010                          | Done    |
| FR-8, FR-10          | Context through the roommate → checker → form chain                      | [01 §Attaching](01-analytics-context.md)                           | T005                          | Done    |
| FR-9                 | `building_detail_viewed` source counts                                   | [01 §Building view](01-analytics-context.md#building-view)         | T009, T019                    | Done    |
| FR-11                | `telegram_bot_opened`                                                    | [01 §Telegram link click](01-analytics-context.md)                 | T008                          | Done    |
| FR-13                | Landing capture (PRD 2 FR-1)                                             | [01 §Landing capture](01-analytics-context.md#landing-capture)     | T002 (Q-1)                    | Blocked |
| FR-14                | Two roles on the first roommate screen                                   | [02 §Role selector](02-roommate-and-waitlist.md#role-selector)     | T013                          | Done    |
| FR-15                | "I have a free room" keeps `type=roommate` across sign-in                | [02](02-roommate-and-waitlist.md)                                  | T014                          | Done    |
| FR-16, FR-19         | Honest checker link and interest copy                                    | [02](02-roommate-and-waitlist.md)                                  | T016                          | Done    |
| FR-17                | `/api/city-notify` stores three classes                                  | [02](02-roommate-and-waitlist.md)                                  | T011                          | Done    |
| FR-18                | City-launch mailing selects only city-launch rows                        | [02](02-roommate-and-waitlist.md)                                  | T012                          | Done    |
| FR-20                | "No offers in the city" vs "nothing matches your filters"                | [02 §Empty states](02-roommate-and-waitlist.md#empty-states)       | T015                          | Done    |
| FR-21                | One figure contract and its cached loaders                               | [03 §The contract, §Loaders](03-building-figures.md)               | T017, T018                    | Done    |
| FR-22, FR-24 – FR-28 | Groups, one observation, known part, zero vs unknown, N, dates           | [03](03-building-figures.md)                                       | T017, T019, T020, T024        | Done    |
| FR-29                | No overpay / saving verdicts; neutral comparison only when comparable    | [03 §Comparisons](03-building-figures.md#comparisons)              | T022, T025, T026, T047 – T051 | Done    |
| FR-30                | Room/flat filter restricts reports before aggregation                    | [03](03-building-figures.md)                                       | T018, T027                    | Done    |
| FR-32, FR-33         | Building first screen and the labelled fallback                          | [03 §Building page](03-building-figures.md#building-page)          | T021                          | Done    |
| FR-34                | Same metric, same value on the building page, the checker and the bot    | [03](03-building-figures.md)                                       | T018, T023, T032              | Done    |
| FR-22, FR-25, FR-34  | Confirm the Q-3 defaults (grouping, legacy `null`, trimming, ...)        | [03 §Parameters to confirm](03-building-figures.md)                | T030 (Q-3)                    | Blocked |
| FR-23                | Single-number surfaces for a mixed base                                  | [03 §Single-number surfaces](03-building-figures.md)               | T028 (Q-2)                    | Blocked |
| FR-31                | No "verified" or representative claim from N on the figure surfaces      | [03 §Building page](03-building-figures.md#building-page)          | T021                          | Done    |
| FR-31                | Existing marketing copy that claims verified or actually-paid figures    | [03 §Marketing copy](03-building-figures.md#marketing-copy)        | T029 (Q-4)                    | Blocked |
| FR-35, FR-36         | `/start b_<uuid>` and `d_<slug>`; opening a link never subscribes        | [04](04-telegram-bot.md)                                           | T031, T035, T036              | Done    |
| FR-37                | Bot cards on the shared contract                                         | [04 §Cards](04-telegram-bot.md#cards-on-the-shared-contract)       | T032, T033, T049              | Done    |
| FR-38                | Deposit statistics with N and area                                       | [04](04-telegram-bot.md#deposit-statistics-in-the-bot)             | T034                          | Done    |
| FR-39, FR-40         | No notification promises; help, greeting and command menu agree          | [04](04-telegram-bot.md#promises-and-capabilities)                 | T037                          | Done    |
| FR-41                | Bot check events and their delivery                                      | [04 §Bot analytics](04-telegram-bot.md#bot-analytics)              | T038, T050                    | Done    |
| FR-42                | Bot → site UTM and address prefill                                       | [04](04-telegram-bot.md#links-to-the-website)                      | T039                          | Done    |
| FR-43                | Deposit wording for an unread contract, a non-lease, an unsupported case | [04](04-telegram-bot.md#deposit-helper-scope)                      | T042 (Q-5)                    | Blocked |
| FR-44                | Deposit scenario list for a Polish lawyer                                | [04](04-telegram-bot.md#scenarios-for-a-lawyer)                    | T041                          | Done    |
| FR-45                | `wants_lawyer` explained before and after the tap                        | [04](04-telegram-bot.md#lawyer-interest)                           | T043 (Q-6)                    | Blocked |
| FR-46                | Deposit reminders: `/cancel` stops them, no re-send on a re-run          | [04](04-telegram-bot.md#deposit-reminders)                         | T040                          | Done    |
| FR-47                | Activation funnels document                                              | [05](05-measurement-docs.md#activation-funnels-document)           | T044                          | Done    |
| FR-48                | Bot README and the architecture bot rows                                 | [05](05-measurement-docs.md#bot-readme)                            | T045                          | Done    |
| FR-49                | Final check and handoff                                                  | [05](05-measurement-docs.md#final-check)                           | T046                          | Done    |

## Related references

- Architecture and invariants: [../architecture.md](../architecture.md) and `CLAUDE.md`.
- Product documents: [../product/README.md](../product/README.md).
- Telegram bot: `src/lib/bot/README.md`.
