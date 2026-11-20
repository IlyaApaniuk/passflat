# Specs

These specs describe what the loop builds. They grow with every PRD: a new PRD changes existing
specs and adds new ones. Loop iterations read only these specs and the code; product documents
in `docs/product/` explain why, the specs say what.

**Current PRD:** PRD 4, "Site improvements — the website as an entry into roommate matching"
(`../product/prd/prd-4-site-improvements.md`, version 0.1, 2026-11-20; decision review
`../product/prd/prd-4-decision-review.md`). Written from the site audit of 2026-11-19
(`../product/reviews/2026-11-19-site-audit.md`) in the night run the owner authorized; the owner
has not reviewed it yet, so every owner question is a blocked task (Q-1 – Q-13, ten tasks) and
everything independent proceeds. Specs 08 and 09 are its new specs; 01, 02, 03, 04, 05 and 06
carry its sections; the requirement map is below. Its tasks (T118 – T157: 30 to build, 10
blocked) follow milestone **M7 "Owner tooling"** (no PRD; D76, D77) in `../../ralph/tasks.json`,
which keeps its `todo` and `blocked` tasks (the map is below).

**Previous PRDs:** PRD 3, "Roommate matching — a structured waiting list, mutual matching and an
English bot" (`../product/prd/prd-3-roommate-matching.md`, version 0.3), is Done (2026-11-19:
built and tested on `chore/agent-harness`, not deployed; 52 tasks T062 – T113, all done, archived
in `../../ralph/archive/prd-3-roommate-matching-tasks.json` on 2026-11-20; the matching switch is
on from the deploy, D75). Specs 06 and 07 are its new specs; 02, 04 and 05 carry its sections; its
requirement map is kept below. PRD 1, "Activation measurement and the
Telegram bot" (`../product/prd/prd-1-activation-and-bot.md`), is Done (2026-11-19: built and
tested on `chore/agent-harness`, not deployed); its 60 tasks are archived in
`../../ralph/archive/prd-1-activation-and-bot-tasks.json` and its map is kept below. Harness
tasks of milestone M0 are archived in `../../ralph/archive/harness-tasks.json`. PRD 2
(`../product/prd/prd-2-deposit-sprint.md`) is On hold since 2026-11-19 (D39) and is not
decomposed; the specs keep their "PRD 2 later adds" notes as history.

## Owner tooling map (M7, no PRD)

Status as in the PRD maps. Source: D76 and D77 (`../product/decisions.md`); the tasks hold the
acceptance criteria, since no spec file exists for owner tooling. Checks never call Telegram.

| Work                                                             | Reference                                                                                                  | Task | Status  |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---- | ------- |
| Bot avatar `public/bot-avatar.png`, 512 × 512 from the logo      | D77                                                                                                        | T114 | Blocked |
| Bot profile texts module and `npm run bot:profile` (`--dry-run`) | D77; `src/lib/bot/README.md` "Going live"; `../development-workflow.md` "Commands with additional effects" | T115 | Planned |
| One place for the production bot's username; `<bot>` placeholder | D76; `../marketing/roommate-posts.md` "How to use a template"                                              | T116 | Done    |
| Set the production bot username (owner question)                 | D76 (Open)                                                                                                 | T117 | Blocked |

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

| File                                                                           | Area                                                                                                                                                                            | PRD 1 package | PRD 3 milestones              | PRD 4                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------- | --------------------------- |
| [01-analytics-context.md](01-analytics-context.md)                             | Page context, entry page, activation events, key parity; PRD 4: new event values                                                                                                | A (M1)        | —                             | §PRD 4 values               |
| [02-roommate-and-waitlist.md](02-roommate-and-waitlist.md)                     | Roommate roles, interest API, city-launch, empty states; PRD 3: find a flatmate, room money block                                                                               | B (M2)        | M2 (FR-21, FR-22)             | §Find a flatmate note       |
| [03-building-figures.md](03-building-figures.md)                               | Shared figure contract and every surface that shows it                                                                                                                          | C (M3)        | — (read by spec 06)           | §Marketing copy note        |
| [04-telegram-bot.md](04-telegram-bot.md)                                       | Deep links, honest cards, promises, analytics, reminders; PRD 3: `mate` links, English locale                                                                                   | D (M4)        | M1 (FR-2), M5 (FR-37 – FR-39) | §Website bot languages note |
| [05-measurement-docs.md](05-measurement-docs.md)                               | Funnel doc, bot README, final check; PRD 3: docs, posting kit, readouts; PRD 4: readout and docs                                                                                | E (M5)        | M6 (FR-40 – FR-44)            | M5 (FR-36, FR-37)           |
| [06-roommate-profiles.md](06-roommate-profiles.md)                             | Roommate data, intake, own card, expiry, daily cron, counts, room reference, opt-in, closing                                                                                    | —             | M1, M2 (FR-1, FR-3 – FR-20)   | §Counts note                |
| [07-roommate-matching.md](07-roommate-matching.md)                             | Switch, compatibility, cards, reveal, push, outcome, report, hiding, appeals, legal drafts                                                                                      | —             | M3, M4 (FR-23 – FR-36)        | —                           |
| [08-site-structure-and-entries.md](08-site-structure-and-entries.md)           | Roommate page default view and shell, header and footer, home framing and thesis section, flatmate callout, per-person line, checker handoff, how-it-works copy, Polish visitor | —             | —                             | M1, M2 (FR-1 – FR-20)       |
| [09-search-metadata-and-performance.md](09-search-metadata-and-performance.md) | Honesty keys, nominative templates, blog frontmatter and bodies, low-CTR titles, district section, sitemap and robots, icons, headers, auth read, lazy client, contrast, labels | —             | —                             | M3, M4 (FR-21 – FR-35)      |

## Requirement map (PRD 4, in progress)

Status: Done (every task of the row done), Blocked (an owner question; the task holds it),
Planned (task todo), Later (moved to PRD 4's Later list; no task). Decomposed on 2026-11-20 in
the night run; the owner has not answered the decision review, so every owner question (Q-1 –
Q-13) is a blocked task and everything else is Planned. The architect gap review found 22 gaps;
all are folded into specs 08 and 09 and the tasks, and 3 became owner questions (Q-12, Q-13, the
wider Q-6); see `../product/prd/prd-4-decision-review.md` §Architect gap review.

| FR                 | Requirement                                                                 | Spec                                                                                                                                                                                  | Tasks            | Status  |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| FR-1, FR-2         | Flatmate block by default; the no-username line                             | [08 §Roommate page default view](08-site-structure-and-entries.md#roommate-page-default-view)                                                                                         | T118             | Done    |
| FR-3, FR-4         | Roommate page title, description, H1; main, h-dvh, footer                   | [08 §Roommate page shell and metadata](08-site-structure-and-entries.md#roommate-page-shell-and-metadata)                                                                             | T119             | Done    |
| FR-5               | Header flatmate entry; building reviews to the footer                       | [08 §Header and footer entries](08-site-structure-and-entries.md#header-and-footer-entries)                                                                                           | T120             | Done    |
| FR-6               | Home framing surfaces re-pointed                                            | [08 §Home framing surfaces](08-site-structure-and-entries.md#home-framing-surfaces)                                                                                                   | T121             | Done    |
| FR-7               | Footer product column, type tabs (Q-5)                                      | [08 §Footer product column (Open)](08-site-structure-and-entries.md#footer-product-column-open)                                                                                       | T122             | Blocked |
| FR-8, FR-9         | Shared flatmate callout; the home thesis section                            | [08 §Flatmate callout](08-site-structure-and-entries.md#flatmate-callout), [§Home thesis section](08-site-structure-and-entries.md#home-thesis-section)                               | T123             | Done    |
| FR-10              | Home copy, honest cost-first                                                | [08 §Home copy](08-site-structure-and-entries.md#home-copy)                                                                                                                           | T124             | Done    |
| FR-10 (Q-6)        | Positioning: hero H1, thesis-first home title, description, tagline         | [08 §Owner questions](08-site-structure-and-entries.md#owner-questions-held-by-blocked-tasks)                                                                                         | T125             | Blocked |
| FR-11              | Callout on building pages and the hub                                       | [08 §Callout placements](08-site-structure-and-entries.md#callout-placements)                                                                                                         | T126             | Done    |
| FR-12              | Callout on the calculator; blog list, guides, data report                   | same                                                                                                                                                                                  | T127, T128       | Done    |
| FR-13              | Per-person line                                                             | [08 §Per-person line](08-site-structure-and-entries.md#per-person-line)                                                                                                               | T129             | Done    |
| FR-14              | Checker handoff button and hint                                             | [08 §Checker handoff](08-site-structure-and-entries.md#checker-handoff)                                                                                                               | T130             | Done    |
| FR-15              | How it works and FAQ; Help and About copy                                   | [08 §How it works, Help and About](08-site-structure-and-entries.md#how-it-works-help-and-about)                                                                                      | T131, T132       | Done    |
| FR-16              | Payments answers and "Is Passflat free?", cesja/sublet steps, counter (Q-3) | same                                                                                                                                                                                  | T133             | Blocked |
| FR-17, FR-18       | Polish visitor; roommate page copy                                          | [08 §Polish visitor](08-site-structure-and-entries.md#polish-visitor-and-the-posting-kit), [§Roommate page copy](08-site-structure-and-entries.md#roommate-page-copy)                 | T134             | Done    |
| FR-19              | City-notify form on the home page (Q-2)                                     | [08 §Dead-end forms (Open)](08-site-structure-and-entries.md#dead-end-forms-open)                                                                                                     | T135             | Blocked |
| FR-20              | Roommate e-mail card and "I have a free room" (Q-4)                         | same                                                                                                                                                                                  | T136             | Blocked |
| — (Q-9 – Q-12)     | Copy questions: consent register, "expanding", open vs unlock, "free"       | [08 §Owner questions](08-site-structure-and-entries.md#owner-questions-held-by-blocked-tasks)                                                                                         | T137             | Blocked |
| FR-21              | Honesty rules and keys under test                                           | [09 §Honesty keys](09-search-metadata-and-performance.md#honesty-keys-under-test)                                                                                                     | T138, T139       | Done    |
| FR-22              | Nominative-safe templates                                                   | [09 §Nominative-safe templates](09-search-metadata-and-performance.md#nominative-safe-templates)                                                                                      | T140, T158       | Planned |
| FR-23              | Blog frontmatter and its test                                               | [09 §Blog frontmatter](09-search-metadata-and-performance.md#blog-frontmatter)                                                                                                        | T141             | Planned |
| FR-24              | Guide bodies: link lines, claims, relative links                            | [09 §Guide bodies](09-search-metadata-and-performance.md#guide-bodies)                                                                                                                | T142, T143, T144 | Planned |
| FR-25              | Low-CTR titles                                                              | [09 §Low-CTR titles](09-search-metadata-and-performance.md#low-ctr-titles)                                                                                                            | T145             | Planned |
| FR-25 (Q-7)        | Keep the cesja guide, or remove it with a redirect                          | same                                                                                                                                                                                  | T146             | Blocked |
| FR-26              | District section: counts, callout, counts expiry                            | [09 §District section](09-search-metadata-and-performance.md#district-section)                                                                                                        | T147             | Planned |
| FR-27              | District section: room reference, per-person line                           | same                                                                                                                                                                                  | T148             | Planned |
| FR-28 (1, 3, 4, 5) | Sitemap, robots, submit metadata                                            | [09 §Sitemap, robots, structured data](09-search-metadata-and-performance.md#sitemap-robots-structured-data-and-the-submit-pages-metadata)                                            | T149             | Planned |
| FR-28 (2)          | Structured data                                                             | same                                                                                                                                                                                  | —                | Later   |
| FR-29              | Frozen pages out of the sitemap or noindex (Q-1)                            | same                                                                                                                                                                                  | T150             | Blocked |
| FR-28 (Q-8)        | The Instagram handle in the Organization schema                             | same                                                                                                                                                                                  | T151             | Blocked |
| FR-30              | Icons and the locale guard                                                  | [09 §Icons and the locale guard](09-search-metadata-and-performance.md#icons-and-the-locale-guard)                                                                                    | T152             | Planned |
| FR-31              | OG cache and three security headers                                         | [09 §HTTP headers](09-search-metadata-and-performance.md#http-headers)                                                                                                                | T153             | Planned |
| FR-31 (Q-13)       | The framing header                                                          | same                                                                                                                                                                                  | T154             | Blocked |
| FR-32, FR-33       | Roommate page server work; header client bundle                             | [09 §Roommate page server work](09-search-metadata-and-performance.md#roommate-page-server-work), [§Header client bundle](09-search-metadata-and-performance.md#header-client-bundle) | —                | Later   |
| FR-34              | Contrast, tap targets, hamburger                                            | [09 §Contrast, tap targets and the hamburger](09-search-metadata-and-performance.md#contrast-tap-targets-and-the-hamburger)                                                           | T155             | Planned |
| FR-35              | Labels, banner link, heading order, skip link                               | [09 §Labels…](09-search-metadata-and-performance.md#labels-the-banners-privacy-link-heading-order-and-a-skip-link)                                                                    | —                | Later   |
| FR-36              | Measurement and docs                                                        | [05 §PRD 4: readout and docs](05-measurement-docs.md#prd-4-readout-and-docs)                                                                                                          | T156             | Planned |
| FR-37              | Final check and handoff                                                     | [05 §PRD 4 final check](05-measurement-docs.md#prd-4-final-check)                                                                                                                     | T157             | Planned |

## Requirement map (PRD 3, done)

Status: Done (every task of the row done), Blocked (an owner question; the task holds it),
Planned (task todo). PRD 3 is Done on 2026-11-19: every row below is Done, built and tested on
`chore/agent-harness`, not deployed; the matching switch goes on at the deploy (D75). The
tasks are archived in `../../ralph/archive/prd-3-roommate-matching-tasks.json` (2026-11-20). Decomposed on 2026-11-19 after the owner's answers (D54 – D70). The
architect gap review found 26 gaps: 22 are folded into the specs and tasks (one new task, T106),
and 4 need the owner (Q-15 – Q-18 in `../product/prd/prd-3-decision-review.md`), held by the
blocked tasks T107 – T110 at the end of the table; the rest of each requirement is built as
decided. FR-24 is built in M2 (T081) because the one-time message of FR-19 counts compatible
people. Final check (T105, 2026-11-19): every PRD 3 task except the four blocked ones is done;
every FR-1 – FR-44 row is Done. Built and tested on `chore/agent-harness`, not deployed; the
owner's handoff is the T105 entry of `ralph/progress.md`. The owner answered the four questions
on 2026-11-19 (D71 – D74) and the rows are Planned until their task is done: Q-17 (T107, Done)
the per-person split uses apartments with 2 or more rooms only (D71); Q-18 (T108, Done) the opt-in's closing promise is reworded
to an active profile (D72); Q-16 (T109, Done) a manual route tells the person the appeal decision in
the bot (D73); Q-15 (T110, Done) qualifying persons for the E15 match rate are those active at the
switch or created after it, at least 14 days old at the readout (D74).

| FR           | Requirement                                            | Spec                                                                                                                               | Tasks                  | Status |
| ------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------ |
| FR-1         | Roommate tables in one migration                       | [06 §Data model](06-roommate-profiles.md#data-model)                                                                               | T062                   | Done   |
| FR-2         | `mate` deep links carry a source                       | [04 §Start payloads](04-telegram-bot.md#start-payloads), [06 §Entry](06-roommate-profiles.md#entry-and-routing)                    | T063, T069             | Done   |
| FR-3         | Roommate entry inside the bot, capability list, menu   | [06 §Entry](06-roommate-profiles.md#entry-and-routing), [06 §Capability](06-roommate-profiles.md#capability-text-and-command-menu) | T069, T070             | Done   |
| FR-4 – FR-6  | Districts, budget, move-in month steps                 | [06 §Intake steps](06-roommate-profiles.md#intake-steps), [06 §Warsaw calendar](06-roommate-profiles.md#warsaw-calendar)           | T065, T066, T071       | Done   |
| FR-7, FR-8   | Languages, own gender and "live with"                  | [06 §Intake steps](06-roommate-profiles.md#intake-steps)                                                                           | T072                   | Done   |
| FR-9         | Adult confirmation                                     | [06 §Intake steps](06-roommate-profiles.md#intake-steps)                                                                           | T074                   | Done   |
| FR-10, FR-11 | Short text with the contact filter, house rules        | [06 §Text filter](06-roommate-profiles.md#text-filter)                                                                             | T067, T073             | Done   |
| FR-12        | Save, own card, edit, draft lifetime                   | [06 §Save and the own card](06-roommate-profiles.md#save-and-the-own-card)                                                         | T068, T074, T075, T077 | Done   |
| FR-13        | Delete at once                                         | [06 §Delete](06-roommate-profiles.md#delete)                                                                                       | T076                   | Done   |
| FR-14        | One profile per chat; banned chats                     | [06 §Entry](06-roommate-profiles.md#entry-and-routing)                                                                             | T069                   | Done   |
| FR-15        | Expiry, renewal reminder, deletion after expiry        | [06 §Daily cron](06-roommate-profiles.md#daily-cron), [06 §Renewal](06-roommate-profiles.md#renewal)                               | T065, T077, T078       | Done   |
| FR-16        | Honest counts per district                             | [06 §Counts](06-roommate-profiles.md#counts)                                                                                       | T079                   | Done   |
| FR-17        | Room cost reference and the per-person split           | [06 §Room cost reference](06-roommate-profiles.md#room-cost-reference)                                                             | T080                   | Done   |
| FR-18        | Opt-in "message me once when matching opens"           | [06 §Opt-in](06-roommate-profiles.md#opt-in)                                                                                       | T084                   | Done   |
| FR-19        | The one-time "matching is open" message                | [06 §Matching is open](06-roommate-profiles.md#matching-is-open)                                                                   | T082                   | Done   |
| FR-20        | Manual closing route                                   | [06 §Closing route](06-roommate-profiles.md#closing-route)                                                                         | T083                   | Done   |
| FR-21        | Roommate page: find a flatmate                         | [02 §Find a flatmate](02-roommate-and-waitlist.md#find-a-flatmate)                                                                 | T085                   | Done   |
| FR-22        | Roommate page: room money block                        | [02 §Room money block](02-roommate-and-waitlist.md#room-money-block)                                                               | T086                   | Done   |
| FR-23        | One switch for matching                                | [07 §Switch](07-roommate-matching.md#switch)                                                                                       | T064, T092             | Done   |
| FR-24        | Compatibility rule                                     | [07 §Compatibility](07-roommate-matching.md#compatibility)                                                                         | T081                   | Done   |
| FR-25        | Cards one at a time                                    | [07 §Cards](07-roommate-matching.md#cards)                                                                                         | T087                   | Done   |
| FR-26        | Mutual interest reveals both usernames                 | [07 §Interest](07-roommate-matching.md#interest-and-mutual-match), [07 §Reveal](07-roommate-matching.md#reveal)                    | T088, T089             | Done   |
| FR-27        | Daily "N new people fit"                               | [07 §Daily push](07-roommate-matching.md#daily-push)                                                                               | T090                   | Done   |
| FR-28        | Daily limit on "Interested"                            | [07 §Interest](07-roommate-matching.md#interest-and-mutual-match)                                                                  | T088                   | Done   |
| FR-29        | Outcome question                                       | [07 §Outcome question](07-roommate-matching.md#outcome-question)                                                                   | T091                   | Done   |
| FR-30        | Next steps after a match                               | [07 §Reveal](07-roommate-matching.md#reveal)                                                                                       | T089                   | Done   |
| FR-31        | Report with a reason and a receipt                     | [07 §Report](07-roommate-matching.md#report)                                                                                       | T093                   | Done   |
| FR-32        | Automatic hiding                                       | [07 §Automatic hiding](07-roommate-matching.md#automatic-hiding)                                                                   | T094, T095             | Done   |
| FR-33        | Statement of reasons                                   | [07 §Statement of reasons](07-roommate-matching.md#statement-of-reasons)                                                           | T095                   | Done   |
| FR-34        | No new profile after a hide                            | [07 §Automatic hiding](07-roommate-matching.md#automatic-hiding)                                                                   | T094                   | Done   |
| FR-35        | Appeals and the owner's review                         | [07 §Appeals](07-roommate-matching.md#appeals-and-the-owners-review)                                                               | T096                   | Done   |
| FR-36        | Terms and privacy sections for matching                | [07 §Terms and privacy drafts](07-roommate-matching.md#terms-and-privacy-drafts)                                                   | T097                   | Done   |
| FR-37        | The `en` bot locale                                    | [04 §English bot locale](04-telegram-bot.md#english-bot-locale)                                                                    | T099                   | Done   |
| FR-38        | Bot texts in English; deposit gate                     | [04 §English bot locale](04-telegram-bot.md#english-bot-locale)                                                                    | T098, T099             | Done   |
| FR-39        | Website names the bot's languages                      | [04 §Website bot languages](04-telegram-bot.md#website-bot-languages)                                                              | T100                   | Done   |
| FR-40        | Events and behaviour documented                        | [05 §PRD 3: roommate docs](05-measurement-docs.md#prd-3-roommate-docs)                                                             | T101                   | Done   |
| FR-41        | Posting kit and posting log                            | [05 §Posting kit](05-measurement-docs.md#posting-kit)                                                                              | T102                   | Done   |
| FR-42        | Stage 1 readout (E14)                                  | [05 §Stage 1 readout](05-measurement-docs.md#stage-1-readout)                                                                      | T103                   | Done   |
| FR-43        | Stage 2 readout (E15)                                  | [05 §Stage 2 readout](05-measurement-docs.md#stage-2-readout)                                                                      | T104                   | Done   |
| FR-44        | Final check and handoff                                | [05 §PRD 3 final check](05-measurement-docs.md#prd-3-final-check)                                                                  | T105                   | Done   |
| FR-16 (gap)  | Chats marked blocked from `my_chat_member` updates     | [06 §Blocked chats](06-roommate-profiles.md#blocked-chats)                                                                         | T106                   | Done   |
| FR-12 (gap)  | Save after the move-in month passed in the draft       | [06 §Save and the own card](06-roommate-profiles.md#save-and-the-own-card)                                                         | T111                   | Done   |
| FR-24 (gap)  | Checker area: one observation names the area (PRD 1)   | [03 §Checker](03-building-figures.md#checker)                                                                                      | T112                   | Done   |
| FR-32 (gap)  | A report stored just after a hide is decided and told  | [07 §Automatic hiding](07-roommate-matching.md#automatic-hiding)                                                                   | T113                   | Done   |
| FR-17 (Q-17) | Per-person split without studios, as the owner decided | [06 §Room cost reference](06-roommate-profiles.md#room-cost-reference)                                                             | T107                   | Done   |
| FR-18 (Q-18) | The closing promise for profiles that expire first     | [06 §Opt-in](06-roommate-profiles.md#opt-in)                                                                                       | T108                   | Done   |
| FR-35 (Q-16) | Telling the person the appeal decision (DSA Art. 20)   | [07 §Appeals](07-roommate-matching.md#appeals-and-the-owners-review)                                                               | T109                   | Done   |
| FR-43 (Q-15) | E15 qualifying persons                                 | [05 §Stage 2 readout](05-measurement-docs.md#stage-2-readout)                                                                      | T110                   | Done   |

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
