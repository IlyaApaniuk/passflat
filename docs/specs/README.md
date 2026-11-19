# Specs

These specs describe what the loop builds. They grow with every PRD: a new PRD changes existing
specs and adds new ones. Loop iterations read only these specs and the code; product documents
in `docs/product/` explain why, the specs say what.

**Current PRD:** PRD 3, "Roommate matching — a structured waiting list, mutual matching and an
English bot" (`../product/prd/prd-3-roommate-matching.md`, version 0.2), decomposed on
2026-11-19 after the owner answered every question of its decision review
(`../product/prd/prd-3-decision-review.md`; D54 – D70). Requirements FR-1 – FR-44; all 44 are
built (D70). Specs 06 and 07 are new; specs 02, 04 and 05 carry PRD 3 sections. Tasks start at
T062 in `../../ralph/tasks.json`; the requirement map is below.

**Previous PRDs:** PRD 1, "Activation measurement and the Telegram bot"
(`../product/prd/prd-1-activation-and-bot.md`), is Done (2026-11-19: built and tested on
`chore/agent-harness`, not deployed); its 60 tasks are archived in
`../../ralph/archive/prd-1-activation-and-bot-tasks.json` and its map is kept below. Harness
tasks of milestone M0 are archived in `../../ralph/archive/harness-tasks.json`. PRD 2
(`../product/prd/prd-2-deposit-sprint.md`) is On hold since 2026-11-19 (D39) and is not
decomposed; the specs keep their "PRD 2 later adds" notes as history.

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
- Bot copy lives in `src/lib/bot/texts.ts` (RU, UK, and EN from PRD 3 FR-38),
  `deposit-texts.ts` (RU and UK only, D63) and `roommate-texts.ts` (RU, UK and EN, spec 06). The
  bot addresses the user with «ты» / «ти» (D42).

## Spec files

| File                                                       | Area                                                                                              | PRD 1 package | PRD 3 milestones              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------- | ----------------------------- |
| [01-analytics-context.md](01-analytics-context.md)         | Page context, entry page, activation events, key parity                                           | A (M1)        | —                             |
| [02-roommate-and-waitlist.md](02-roommate-and-waitlist.md) | Roommate roles, interest API, city-launch, empty states; PRD 3: find a flatmate, room money block | B (M2)        | M2 (FR-21, FR-22)             |
| [03-building-figures.md](03-building-figures.md)           | Shared figure contract and every surface that shows it                                            | C (M3)        | — (read by spec 06)           |
| [04-telegram-bot.md](04-telegram-bot.md)                   | Deep links, honest cards, promises, analytics, reminders; PRD 3: `mate` links, English locale     | D (M4)        | M1 (FR-2), M5 (FR-37 – FR-39) |
| [05-measurement-docs.md](05-measurement-docs.md)           | Funnel doc, bot README, final check; PRD 3: docs, posting kit, readouts                           | E (M5)        | M6 (FR-40 – FR-44)            |
| [06-roommate-profiles.md](06-roommate-profiles.md)         | Roommate data, intake, own card, expiry, daily cron, counts, room reference, opt-in, closing      | —             | M1, M2 (FR-1, FR-3 – FR-20)   |
| [07-roommate-matching.md](07-roommate-matching.md)         | Switch, compatibility, cards, reveal, push, outcome, report, hiding, appeals, legal drafts        | —             | M3, M4 (FR-23 – FR-36)        |

## Requirement map (PRD 3)

Status: Done (every task of the row done), Blocked (an owner question; the task holds it),
Planned (task todo). Decomposed on 2026-11-19 after the owner's answers (D54 – D70). The
architect gap review found 26 gaps: 22 are folded into the specs and tasks (one new task, T106),
and 4 need the owner (Q-15 – Q-18 in `../product/prd/prd-3-decision-review.md`), held by the
blocked tasks T107 – T110 at the end of the table; the rest of each requirement is built as
decided. FR-24 is built in M2 (T081) because the one-time message of FR-19 counts compatible
people.

| FR           | Requirement                                            | Spec                                                                                                                               | Tasks                  | Status  |
| ------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------- |
| FR-1         | Roommate tables in one migration                       | [06 §Data model](06-roommate-profiles.md#data-model)                                                                               | T062                   | Done    |
| FR-2         | `mate` deep links carry a source                       | [04 §Start payloads](04-telegram-bot.md#start-payloads), [06 §Entry](06-roommate-profiles.md#entry-and-routing)                    | T063, T069             | Planned |
| FR-3         | Roommate entry inside the bot, capability list, menu   | [06 §Entry](06-roommate-profiles.md#entry-and-routing), [06 §Capability](06-roommate-profiles.md#capability-text-and-command-menu) | T069, T070             | Planned |
| FR-4 – FR-6  | Districts, budget, move-in month steps                 | [06 §Intake steps](06-roommate-profiles.md#intake-steps), [06 §Warsaw calendar](06-roommate-profiles.md#warsaw-calendar)           | T065, T066, T071       | Planned |
| FR-7, FR-8   | Languages, own gender and "live with"                  | [06 §Intake steps](06-roommate-profiles.md#intake-steps)                                                                           | T072                   | Planned |
| FR-9         | Adult confirmation                                     | [06 §Intake steps](06-roommate-profiles.md#intake-steps)                                                                           | T074                   | Planned |
| FR-10, FR-11 | Short text with the contact filter, house rules        | [06 §Text filter](06-roommate-profiles.md#text-filter)                                                                             | T067, T073             | Planned |
| FR-12        | Save, own card, edit, draft lifetime                   | [06 §Save and the own card](06-roommate-profiles.md#save-and-the-own-card)                                                         | T068, T074, T075, T077 | Planned |
| FR-13        | Delete at once                                         | [06 §Delete](06-roommate-profiles.md#delete)                                                                                       | T076                   | Done    |
| FR-14        | One profile per chat; banned chats                     | [06 §Entry](06-roommate-profiles.md#entry-and-routing)                                                                             | T069                   | Planned |
| FR-15        | Expiry, renewal reminder, deletion after expiry        | [06 §Daily cron](06-roommate-profiles.md#daily-cron), [06 §Renewal](06-roommate-profiles.md#renewal)                               | T065, T077, T078       | Planned |
| FR-16        | Honest counts per district                             | [06 §Counts](06-roommate-profiles.md#counts)                                                                                       | T079                   | Planned |
| FR-17        | Room cost reference and the per-person split           | [06 §Room cost reference](06-roommate-profiles.md#room-cost-reference)                                                             | T080                   | Planned |
| FR-18        | Opt-in "message me once when matching opens"           | [06 §Opt-in](06-roommate-profiles.md#opt-in)                                                                                       | T084                   | Planned |
| FR-19        | The one-time "matching is open" message                | [06 §Matching is open](06-roommate-profiles.md#matching-is-open)                                                                   | T082                   | Planned |
| FR-20        | Manual closing route                                   | [06 §Closing route](06-roommate-profiles.md#closing-route)                                                                         | T083                   | Planned |
| FR-21        | Roommate page: find a flatmate                         | [02 §Find a flatmate](02-roommate-and-waitlist.md#find-a-flatmate)                                                                 | T085                   | Planned |
| FR-22        | Roommate page: room money block                        | [02 §Room money block](02-roommate-and-waitlist.md#room-money-block)                                                               | T086                   | Planned |
| FR-23        | One switch for matching                                | [07 §Switch](07-roommate-matching.md#switch)                                                                                       | T064, T092             | Planned |
| FR-24        | Compatibility rule                                     | [07 §Compatibility](07-roommate-matching.md#compatibility)                                                                         | T081                   | Planned |
| FR-25        | Cards one at a time                                    | [07 §Cards](07-roommate-matching.md#cards)                                                                                         | T087                   | Planned |
| FR-26        | Mutual interest reveals both usernames                 | [07 §Interest](07-roommate-matching.md#interest-and-mutual-match), [07 §Reveal](07-roommate-matching.md#reveal)                    | T088, T089             | Planned |
| FR-27        | Daily "N new people fit"                               | [07 §Daily push](07-roommate-matching.md#daily-push)                                                                               | T090                   | Planned |
| FR-28        | Daily limit on "Interested"                            | [07 §Interest](07-roommate-matching.md#interest-and-mutual-match)                                                                  | T088                   | Planned |
| FR-29        | Outcome question                                       | [07 §Outcome question](07-roommate-matching.md#outcome-question)                                                                   | T091                   | Planned |
| FR-30        | Next steps after a match                               | [07 §Reveal](07-roommate-matching.md#reveal)                                                                                       | T089                   | Planned |
| FR-31        | Report with a reason and a receipt                     | [07 §Report](07-roommate-matching.md#report)                                                                                       | T093                   | Planned |
| FR-32        | Automatic hiding                                       | [07 §Automatic hiding](07-roommate-matching.md#automatic-hiding)                                                                   | T094, T095             | Planned |
| FR-33        | Statement of reasons                                   | [07 §Statement of reasons](07-roommate-matching.md#statement-of-reasons)                                                           | T095                   | Planned |
| FR-34        | No new profile after a hide                            | [07 §Automatic hiding](07-roommate-matching.md#automatic-hiding)                                                                   | T094                   | Planned |
| FR-35        | Appeals and the owner's review                         | [07 §Appeals](07-roommate-matching.md#appeals-and-the-owners-review)                                                               | T096                   | Planned |
| FR-36        | Terms and privacy sections for matching                | [07 §Terms and privacy drafts](07-roommate-matching.md#terms-and-privacy-drafts)                                                   | T097                   | Planned |
| FR-37        | The `en` bot locale                                    | [04 §English bot locale](04-telegram-bot.md#english-bot-locale)                                                                    | T099                   | Planned |
| FR-38        | Bot texts in English; deposit gate                     | [04 §English bot locale](04-telegram-bot.md#english-bot-locale)                                                                    | T098, T099             | Planned |
| FR-39        | Website names the bot's languages                      | [04 §Website bot languages](04-telegram-bot.md#website-bot-languages)                                                              | T100                   | Planned |
| FR-40        | Events and behaviour documented                        | [05 §PRD 3: roommate docs](05-measurement-docs.md#prd-3-roommate-docs)                                                             | T101                   | Planned |
| FR-41        | Posting kit and posting log                            | [05 §Posting kit](05-measurement-docs.md#posting-kit)                                                                              | T102                   | Planned |
| FR-42        | Stage 1 readout (E14)                                  | [05 §Stage 1 readout](05-measurement-docs.md#stage-1-readout)                                                                      | T103                   | Planned |
| FR-43        | Stage 2 readout (E15)                                  | [05 §Stage 2 readout](05-measurement-docs.md#stage-2-readout)                                                                      | T104                   | Planned |
| FR-44        | Final check and handoff                                | [05 §PRD 3 final check](05-measurement-docs.md#prd-3-final-check)                                                                  | T105                   | Planned |
| FR-16 (gap)  | Chats marked blocked from `my_chat_member` updates     | [06 §Blocked chats](06-roommate-profiles.md#blocked-chats)                                                                         | T106                   | Planned |
| FR-17 (Q-17) | Per-person split without studios, if the owner says so | [06 §Room cost reference](06-roommate-profiles.md#room-cost-reference)                                                             | T107                   | Blocked |
| FR-18 (Q-18) | The closing promise for profiles that expire first     | [06 §Opt-in](06-roommate-profiles.md#opt-in)                                                                                       | T108                   | Blocked |
| FR-35 (Q-16) | Telling the person the appeal decision (DSA Art. 20)   | [07 §Appeals](07-roommate-matching.md#appeals-and-the-owners-review)                                                               | T109                   | Blocked |
| FR-43 (Q-15) | E15 qualifying persons                                 | [05 §Stage 2 readout](05-measurement-docs.md#stage-2-readout)                                                                      | T110                   | Blocked |

## Requirement map (PRD 1, done)

Status: Done (every task of the row done), Blocked (an owner question; the task holds it),
Planned (task todo). Final check (T046, 2026-11-19): every non-blocked PRD 1 task was done; six
tasks waited for answers Q-1 – Q-6. The owner answered Q-1 – Q-17 on 2026-11-19 (D22 – D33,
D47) and set the bot's «ты» (D42). Second final check (T059, 2026-11-19): all 60 PRD 1 tasks
are done and no row is Blocked. Built and tested, not deployed: what is left is the owner's
deploy (D29), listed in the T059 entry of `ralph/progress.md`.

| FR                   | Requirement                                                              | Spec                                                                                                        | Tasks                         | Status |
| -------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------- | ------ |
| —                    | Harness: the `verify` gate, e2e on its own port                          | [../development-workflow.md](../development-workflow.md)                                                    | T000, T001                    | Done   |
| —                    | Locale key parity test                                                   | [01 §Locale key parity](01-analytics-context.md#locale-key-parity)                                          | T003                          | Done   |
| FR-1, FR-2           | Page context and entry page type on every client event                   | [01 §Page context, §Attaching](01-analytics-context.md)                                                     | T004, T005                    | Done   |
| FR-3                 | `roommate_intent_selected`                                               | [02 §Role selector](02-roommate-and-waitlist.md#role-selector)                                              | T013                          | Done   |
| FR-4, FR-12          | Listing events: `listing_type`, filtered `results_count`                 | [01 §Listing events](01-analytics-context.md#listing-events)                                                | T006, T007                    | Done   |
| FR-5                 | Contact clicks documented as clicks                                      | [05 §Funnels](05-measurement-docs.md)                                                                       | T044                          | Done   |
| FR-6, FR-7           | `listing_interest_saved`, `listing_interest_failed`                      | [01 §Interest events](01-analytics-context.md#interest-events)                                              | T010                          | Done   |
| FR-8, FR-10          | Context through the roommate → checker → form chain                      | [01 §Attaching](01-analytics-context.md)                                                                    | T005                          | Done   |
| FR-9                 | `building_detail_viewed` source counts                                   | [01 §Building view](01-analytics-context.md#building-view)                                                  | T009, T019                    | Done   |
| FR-11                | `telegram_bot_opened`                                                    | [01 §Telegram link click](01-analytics-context.md)                                                          | T008                          | Done   |
| FR-13                | Landing capture (moved from PRD 2 FR-1, D22)                             | [01 §Landing capture](01-analytics-context.md#landing-capture)                                              | T002                          | Done   |
| FR-14                | Two roles on the first roommate screen                                   | [02 §Role selector](02-roommate-and-waitlist.md#role-selector)                                              | T013                          | Done   |
| FR-15                | "I have a free room" keeps `type=roommate` across sign-in                | [02](02-roommate-and-waitlist.md)                                                                           | T014                          | Done   |
| FR-16, FR-19         | Honest checker link and interest copy                                    | [02](02-roommate-and-waitlist.md)                                                                           | T016                          | Done   |
| FR-17                | `/api/city-notify` stores three classes                                  | [02](02-roommate-and-waitlist.md)                                                                           | T011                          | Done   |
| FR-18                | City-launch mailing selects only city-launch rows                        | [02](02-roommate-and-waitlist.md)                                                                           | T012                          | Done   |
| FR-20                | "No offers in the city" vs "nothing matches your filters"                | [02 §Empty states](02-roommate-and-waitlist.md#empty-states)                                                | T015                          | Done   |
| FR-21                | One figure contract and its cached loaders                               | [03 §The contract, §Loaders](03-building-figures.md)                                                        | T017, T018                    | Done   |
| FR-22, FR-24 – FR-28 | Groups, one observation, known part, zero vs unknown, N, dates           | [03](03-building-figures.md)                                                                                | T017, T019, T020, T024        | Done   |
| FR-29                | No overpay / saving verdicts; neutral comparison only when comparable    | [03 §Comparisons](03-building-figures.md#comparisons)                                                       | T022, T025, T026, T047 – T051 | Done   |
| FR-30                | Room/flat filter restricts reports before aggregation                    | [03](03-building-figures.md)                                                                                | T018, T027                    | Done   |
| FR-32, FR-33         | Building first screen and the labelled fallback                          | [03 §Building page](03-building-figures.md#building-page)                                                   | T021                          | Done   |
| FR-34                | Same metric, same value on the building page, the checker and the bot    | [03](03-building-figures.md)                                                                                | T018, T023, T032              | Done   |
| FR-22, FR-25, FR-34  | Q-3 defaults confirmed as built (D24)                                    | [03 §Parameters to confirm](03-building-figures.md)                                                         | T030                          | Done   |
| FR-23                | Single-number surfaces: tenant group, else asking prices, labelled (D23) | [03 §Single-number surfaces](03-building-figures.md)                                                        | T028, T052 – T054             | Done   |
| FR-31                | No "verified" or representative claim from N on the figure surfaces      | [03 §Building page](03-building-figures.md#building-page)                                                   | T021                          | Done   |
| FR-31                | Marketing copy rewritten to reported-costs wording (D25)                 | [03 §Marketing copy](03-building-figures.md#marketing-copy)                                                 | T029                          | Done   |
| FR-35, FR-36         | `/start b_<uuid>` and `d_<slug>`; opening a link never subscribes        | [04](04-telegram-bot.md)                                                                                    | T031, T035, T036              | Done   |
| FR-37                | Bot cards on the shared contract                                         | [04 §Cards](04-telegram-bot.md#cards-on-the-shared-contract)                                                | T032, T033, T049              | Done   |
| FR-38                | Deposit statistics with N and area                                       | [04](04-telegram-bot.md#deposit-statistics-in-the-bot)                                                      | T034                          | Done   |
| FR-39, FR-40         | No notification promises; help, greeting and command menu agree          | [04](04-telegram-bot.md#promises-and-capabilities)                                                          | T037                          | Done   |
| FR-41                | Bot check events and their delivery                                      | [04 §Bot analytics](04-telegram-bot.md#bot-analytics)                                                       | T038, T050                    | Done   |
| FR-42                | Bot → site UTM and address prefill                                       | [04](04-telegram-bot.md#links-to-the-website)                                                               | T039                          | Done   |
| FR-43                | Deposit wording for an unread contract, a non-lease, an unsupported case | [04](04-telegram-bot.md#deposit-helper-scope)                                                               | T042                          | Done   |
| FR-44                | Deposit scenario list for a Polish lawyer                                | [04](04-telegram-bot.md#scenarios-for-a-lawyer)                                                             | T041                          | Done   |
| FR-45                | `wants_lawyer` explained before and after the tap                        | [04](04-telegram-bot.md#lawyer-interest)                                                                    | T043                          | Done   |
| FR-46                | Deposit reminders: `/cancel` stops them, no re-send on a re-run          | [04](04-telegram-bot.md#deposit-reminders)                                                                  | T040                          | Done   |
| FR-47                | Activation funnels document                                              | [05](05-measurement-docs.md#activation-funnels-document)                                                    | T044                          | Done   |
| FR-48                | Bot README and the architecture bot rows                                 | [05](05-measurement-docs.md#bot-readme)                                                                     | T045                          | Done   |
| FR-49                | Final check and handoff                                                  | [05](05-measurement-docs.md#final-check)                                                                    | T046                          | Done   |
| — (Q-14)             | Listings-interest rows deleted after 12 months by a daily cron           | [02 §Owner follow-ups](02-roommate-and-waitlist.md#owner-follow-ups-m6)                                     | T055                          | Done   |
| — (Q-14)             | Remove-interest link with a signed token                                 | [02 §Owner follow-ups](02-roommate-and-waitlist.md#owner-follow-ups-m6)                                     | T056                          | Done   |
| — (Q-15)             | No e-mail-keyed waitlist events; no typed text in bot address events     | [02](02-roommate-and-waitlist.md#waitlist-server-events), [04](04-telegram-bot.md#typed-text-in-bot-events) | T057                          | Done   |
| — (Q-16)             | City-launch e-mail links to the costs page; claim before send            | [02](02-roommate-and-waitlist.md#city-launch-e-mail-link-and-send-guard)                                    | T058                          | Done   |
| — (Q-17)             | City-launch e-mail copy matches the costs-page link                      | [02](02-roommate-and-waitlist.md#city-launch-e-mail-link-and-send-guard)                                    | T060                          | Done   |
| — (D42)              | The bot addresses the user with «ты» / «ти» everywhere                   | [04 §Address form «ты»](04-telegram-bot.md#address-form-ты)                                                 | T061                          | Done   |
| FR-49                | Final check after the owner's answers                                    | [05](05-measurement-docs.md#final-check-after-the-owners-answers)                                           | T059                          | Done   |

## Related references

- Architecture and invariants: [../architecture.md](../architecture.md) and `CLAUDE.md`.
- Product documents: [../product/README.md](../product/README.md).
- Telegram bot: `src/lib/bot/README.md`.
