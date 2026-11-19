# Hypotheses

What we believe would create demand or revenue, and how we will know. Each hypothesis cites the
BRD assumptions it rests on and the experiments that test it (`experiments.md`). Numbers are
never reused. H1–H8 were reconstructed on 2026-11-18 from the owner's sessions of June–October
2026; none has a recorded readout yet. H12 and H13 are the owner's, of 2026-11-19 (D40, D45).

Status: **Idea**, **Ready** (experiment designed), **Testing**, **Supported**, **Rejected**,
**Parked** (with a trigger).

| ID  | Hypothesis                                                                                                                                                                                                                                                                                                                  | Assumptions                    | Status  | Experiments                 | Primary metric                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| H1  | Tenants whose deposit is kept will use a free bot flow that produces a Polish demand letter, and some will want paid escalation                                                                                                                                                                                             | A3, A12, A14                   | Parked  | E6, E10 (both Stopped, D44) | Value metric without a threshold (D44): persons who marked the letter sent → reported full, partial or no return           |
| H2  | Roommate search is the strongest organic entry, and serving both roles well turns those visits into contacts                                                                                                                                                                                                                | A5                             | Ready   | E8                          | Roommate visits → role chosen → offer viewed → contact or saved interest                                                   |
| H3  | Checking a specific address is a job people come back for, and an honest answer leads to a contribution                                                                                                                                                                                                                     | A1, A8                         | Ready   | E9                          | Address answered → contribution started, per entry page type                                                               |
| H4  | Consume-framed posts ("check whether you overpay") with the link in the first comment drive more form starts than data posts                                                                                                                                                                                                | A1, A7                         | Testing | E1, E3                      | `cost_form_started` per `ref`                                                                                              |
| H5  | The Telegram bot reaches the RU/UA audience better than the website and brings activated users                                                                                                                                                                                                                              | A4, A6                         | Ready   | E5                          | `/start` count, activation share, D14 retention (D14 thresholds)                                                           |
| H6  | Tenants want agency reviews enough to read and write them                                                                                                                                                                                                                                                                   | —                              | Parked  | E4                          | Probe engagement; trigger in D5                                                                                            |
| H7  | Move-in guides with affiliate offers (banks, Wise, insurance) earn the first money at current traffic                                                                                                                                                                                                                       | A11                            | Testing | E7                          | `affiliate_link_clicked` per guide, then confirmed conversions                                                             |
| H8  | PRS operators or agencies pay for document-verified cost cards of their flats                                                                                                                                                                                                                                               | A13                            | Parked  | —                           | Paid pilots out of 10 conversations (D16)                                                                                  |
| H9  | Answering existing "landlord keeps my deposit" questions in RU/UA chats with source-tagged bot links starts deposit cases at a rate one founder can sustain, and some of those tenants ask for a lawyer. Proposed by Claude on 2026-11-19; E10 adopted by the owner the same day (D34 – D37) and stopped the same day (D44) | A3, A6, A12, A14; proposed A20 | Parked  | E10 (Stopped)               | Persons with `tg_deposit_flow_started` by `entry_source` → `tg_deposit_letter_generated`; `tg_lawyer_interest`, in 14 days |
| H10 | Room seekers who arrive from search want room money answers (cost per person, deposit, address) more than offers Passflat does not have; a roommate page that answers them turns landings into useful actions. Proposed by Claude on 2026-11-19; adopted by the owner the same day (D41)                                    | A5; proposed A18               | Ready   | E11                         | Roommate landings → sessions with a useful action (PRD 1 events) over 8 weeks; GSC CTR                                     |
| H11 | The guides already on Google page 1 get twice the clicks with sharper titles, and a deposit prompt on move-out guides turns some readers into deposit cases. Proposed by Claude on 2026-11-19, awaiting the owner                                                                                                           | A1, A3                         | Idea    | E12                         | GSC CTR per page; `telegram_bot_opened` with `source=guide_deposit`                                                        |
| H12 | Tenants want to be notified about new offers or figures in their district                                                                                                                                                                                                                                                   | A1, A5                         | Testing | E13                         | Persons who save interest (web `listing_interest_saved`, bot `tg_subscribed`) in two full weeks after the PRD 1 deploy     |
| H13 | People looking for a roommate in Warsaw create a profile and contact each other when offered matching by district, budget and move-in date                                                                                                                                                                                  | A5                             | Idea    | —                           | To be set by the research (D45)                                                                                            |

## Details

### H1. Get your deposit back

- **Why we believe it:** urgent money problem, clear statutory deadline, language barrier; the
  only free competitor (kaucja365.pl) has no follow-ups or outcomes (research 2026-10-05).
- **What exists:** the bot flow on `feat/tg-bot` (five questions, verdict, letter with the lease
  read by Claude at about $0.10–0.15 per contract, follow-ups, outcome, `wants_lawyer`). Not in
  production: four migrations unapplied, production token and webhook not set.
- **Kill or scale:** none. On 2026-11-19 the owner made the deposit flow a free, fully
  automatic tool that launches with the bot, not a test (D44): E6 and E10 are Stopped, there is
  no paid step and no manual work, and the deposit is not the main bet (D39). The tool itself
  ships; only the test of this hypothesis is parked.
- **Parked trigger:** a new owner decision that sets a deposit test or a paid step that runs
  without the owner (D39). Until then readouts report the value metric of D44 (persons who
  marked the letter sent → reported full, partial or no return) without a go/stop threshold.

### H2. Roommate search as the entry

- **Why:** 10 of 13 clicks in the search rows the owner looked at on 2026-10-07 were roommate
  searches. Not a share of all traffic; the period was not confirmed.
- **What is broken:** one screen mixes both roles; interest requests lose `listingType`; the
  city-launch email can reach listing requests; empty states confuse "no offers in the city"
  with "zero after filters" (PRD 1 package B).

### H3. Address check as its own job

- **Why:** about 5 checks a day (2026-10-05) without promotion; the checker shipped in #92
  (2026-07-27). The honest answer per building, district and city is PRD 1 package C.

### H4. Consume-framing in posts

- **Why:** view → click was below 1 % on Threads in June; the site converted visitors once they
  arrived. The owner committed to a first comment with the link; the decision was due 2026-08-11
  by form starts per `ref` (D11). The result was not recorded.

### H5. Bot as a channel

- **Why:** Telegram pushes are opened far more often than channel posts; RU/UA chats have 2–22k
  members; bot launches get free coverage in diaspora media (research 2026-08-29).
- **Kill or scale:** D14 thresholds over 30 days from the production launch.

### H6. Agency reviews (pillar 2)

- Parked with the trigger in D5. The free probe on Threads was planned on 2026-06-20; no result
  was recorded.

### H7. Affiliate guides

- **Why:** the Wise link went live with PR #107 on 2026-08-27; mBank and Millennium CPA links
  were generated on 2026-08-25. Verification for non-EU citizens without residence documents
  fails at Wise and Revolut, so guides must segment readers by status.

### H8. Verified cost cards (B2B)

- Parked on 2026-10-04 (D16). Research kept in `../research/competitors.md` and the BRD.

### H9–H11. Proposed by Claude on 2026-11-19 (E10 adopted and then stopped, H10 adopted)

Written in the night run of 2026-11-18/19 from `reviews/2026-11-18-metrics.md` and
`reviews/2026-11-18-direction-review.md`. They are proposals, not decisions; the assumptions
A18–A20 they cite are proposed in the direction review and in the PRD 2 decision review and are
not in the BRD registry yet.

- **H9. Deposit cases from chat answers.**
  - **Why:** replies under others' posts were the only channel that converted repeatedly
    (BRD §7); search brings almost no deposit demand (12 visible impressions in 12 months); the
    deposit flow is built and its events are server-side, so they survive the web capture loss.
  - **What it adds to H1:** a source per link and prompts on move-out guides. The paid
    next-step probe was dropped on 2026-11-19 (D34): `wants_lawyer` is the only money-interest
    signal, and 79 zł is only an indicative price for a possible later step.
  - **Test:** E10 through PRD 2 version 0.2. Stopped before it started (D44); PRD 2 is On hold
    (D39). Parked: answering in chats means personal help, which the owner does not give
    (D46). Trigger: a new owner decision.
- **H10. Roommate search, reframed.**
  - **Why:** the owner's hypothesis that roommate search is the top of search demand is partly
    true: `/warsaw/roommate` is the strongest single page (25 of 116 clicks, 1,409 impressions)
    and roommate queries hold 12 of the 15 visible query clicks, but building pages bring more
    clicks in total (49), and 41 roommate landings since 2026-08-01 produced no useful action.
    Passflat has no room offers (no roommate listing since June) and listings are frozen (D5).
  - **What it tests:** whether the same visitors act when the page answers what Passflat can
    answer. If E11 fails, roommate search stays a side entry.
  - **Ready** (D41, 2026-11-19). Scope for whichever PRD comes next, not built yet: a block for
    room seekers on the roommate page, "Found a room? What it will cost you per person, and is
    it safe to pay the deposit?", with a checklist, an address-check prompt and honest links to
    OLX, Otodom and Warsaw room-rental Facebook groups; Polish first, four locales; no invented
    prices.
- **H11. Page-1 guides.**
  - **Why:** the meters guide (809 impressions, position 6.9) and the English hidden-costs guide
    (806, position 6.6) have CTR below 1 %; Google's AI features surface the meters guide most.
  - **Upside:** small (about 25 clicks a year at 2 % CTR); it is cheap and feeds H9.

### H12. Notifications about the district (2026-11-19)

- **Why:** PRD 1 replaced the bot's and the website's notification promises with an honest
  "interest saved, no automatic notifications yet" (FR-19, FR-39), and nothing sends
  notifications. Saved interest is the cheapest sign that people want them.
- **Test:** E13 (D40). At least 10 persons (**Assumption**) → the next PRD builds real
  notifications with a content source; below → no notifier.

### H13. Roommate matching between seekers (2026-11-19)

- **The idea (D45):** a self-serve service where people looking for someone to rent with
  create a short profile and find each other by district, budget and move-in date; every user
  is both demand and supply. Cost figures, building pages, the checker, guides, the
  roommate-agreement template (`../legal-templates/umowa-wspollokatorska.md`) and the deposit
  bot support it.
- **Why not the alternatives:** aggregating other platforms' listings is rejected (D5 stays);
  own room listings failed (no roommate listing since June).
- **Scope note:** PRD 1's exclusion of compatible-roommate matching and seeker profiles
  (`prd/prd-1-activation-and-bot.md` §2, §5) was for PRD 1 only.
- **Next:** research first (demand, cold start of a two-sided pool, personal data of profiles,
  a contact path that needs no owner time); no PRD and no experiment yet.
