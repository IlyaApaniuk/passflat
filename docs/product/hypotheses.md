# Hypotheses

What we believe would create demand or revenue, and how we will know. Each hypothesis cites the
BRD assumptions it rests on and the experiments that test it (`experiments.md`). Numbers are
never reused. H1–H8 were reconstructed on 2026-11-18 from the owner's sessions of June–October 2026. H12 and H13 are the owner's, of 2026-11-19 (D40, D45). H14–H16 split H13 into the rungs of
the roommate ladder of thesis v2 (`thesis.md`, D48, D52), written by Claude on 2026-11-19.

Status: **Idea**, **Ready** (experiment designed), **Testing**, **Supported**, **Rejected**,
**Parked** (with a trigger).

Sections (restructured on 2026-11-19 for thesis v2): **Active** is the roommate ladder;
**Parked** holds everything else that may come back, each with its trigger; **Rejected** holds
hypotheses the evidence ruled out. A parked hypothesis gets no build and no owner time, but a
readout that needs neither (E5, E8, E9) is still reported.

## Active: the roommate ladder

| ID  | Hypothesis                                                                                                                                                                                                                                                                                                                                        | Assumptions                | Status  | Experiments | Primary metric                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H13 | People looking for a roommate in Warsaw create a profile and contact each other when offered matching by district, budget and move-in date                                                                                                                                                                                                        | A5, A22 – A27              | Ready   | E14, E15    | The ladder: H14 (stage 1), H15 (stage 2), H16 (money)                                                                                                                                                                             |
| H14 | Stage 1: the owner's link posts in chats and groups (two 30-minute slots a day, D46, D53) bring roommate-seeker profiles to the bot at ≥ 1 profile per owner-hour, and by 2027-01-18 the pool reaches ≥ 30 profiles, ≥ 20 active and ≥ 3 districts with ≥ 3 active each, with ≤ 30 minutes a week of manual handling                              | A4, A6, A22, A23, A26, A27 | Ready   | E14, E16    | `tg_roommate_profile_created` persons by `entry_source`; database active profiles per district; profiles per owner-hour (posting log)                                                                                             |
| H15 | Stage 2: with compatible cards and mutual interest, ≥ 30 % of profiles older than 14 days get a mutual match within 14 days of the switch, and by about 2027-03-31 there are ≥ 10 mutual pairs and ≥ 3 "renting together" or "talking" outcomes                                                                                                   | A24, A26, A27              | Ready   | E15         | Database mutual pairs; `tg_roommate_matched`; `tg_roommate_outcome`                                                                                                                                                               |
| H16 | Stage 3: people who use matching pay for speed (instant alerts, "who marked you"), never for contact, through Telegram Stars                                                                                                                                                                                                                      | A25                        | Idea    | —           | To be designed after stage 2 (D52)                                                                                                                                                                                                |
| H12 | Tenants want to be notified about new offers or figures in their district; in the ladder, the daily "N new people fit" push of stage 2 is the first notification Passflat actually sends                                                                                                                                                          | A1, A5                     | Testing | E13         | Persons who save interest (web `listing_interest_saved`, bot `tg_subscribed`) in two full weeks after the PRD 1 deploy; for the push: `tg_roommate_push_sent` → same-day `tg_roommate_cards_viewed`, `tg_roommate_push_opted_out` |
| H10 | Room seekers who arrive from search want room money answers (cost per person, deposit, address) more than offers Passflat does not have; a roommate page that answers them, and points people who want to rent together to the bot, turns landings into useful actions. Proposed by Claude on 2026-11-19; adopted by the owner the same day (D41) | A5, A18                    | Ready   | E11, E16    | Roommate landings → sessions with a useful action (PRD 1 events) over 8 weeks; GSC CTR                                                                                                                                            |

## Parked

| ID  | Hypothesis                                                                                                                                                                                                                                                                                                                  | Assumptions      | Experiments                 | Primary metric                                                                                                             | Trigger to revisit                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Tenants whose deposit is kept will use a free bot flow that produces a Polish demand letter, and some will want paid escalation                                                                                                                                                                                             | A3, A12, A14     | E6, E10 (both Stopped, D44) | Value metric without a threshold (D44): persons who marked the letter sent → reported full, partial or no return           | A new owner decision that sets a deposit test or a paid step that runs without the owner (D39)                                                  |
| H2  | Roommate search is the strongest organic entry, and serving both roles well turns those visits into contacts                                                                                                                                                                                                                | A5, A18          | E8 (free readout)           | Roommate visits → role chosen → offer viewed → contact or saved interest                                                   | Room listings unfrozen (D5), or matched pairs (H15) need rooms that Passflat could list                                                         |
| H3  | Checking a specific address is a job people come back for, and an honest answer leads to a contribution                                                                                                                                                                                                                     | A1, A8           | E9 (free readout)           | Address answered → contribution started, per entry page type                                                               | E9 passes (≥ 5 answered addresses and ≥ 1 form start in two weeks), or the stage 1 fallback (thesis) shrinks Passflat to content and free tools |
| H5  | The Telegram bot reaches the RU/UA audience better than the website and brings activated users                                                                                                                                                                                                                              | A4, A6           | E5 (free readout)           | `/start` count, activation share, D14 retention (D14 thresholds)                                                           | Subsumed by H14 while the ladder runs; revisit if stage 1 stops and the bot stays as a free tool                                                |
| H6  | Tenants want agency reviews enough to read and write them                                                                                                                                                                                                                                                                   | —                | E4 (Stopped)                | Probe engagement; trigger in D5                                                                                            | D5's trigger (a cost loop without manual asking) and a new owner decision; agency reputation is out of focus (D48)                              |
| H7  | Move-in guides with affiliate offers (banks, Wise, insurance) earn the first money at current traffic                                                                                                                                                                                                                       | A11              | E7 (Stopped)                | `affiliate_link_clicked` per guide, then confirmed conversions                                                             | A guide with an offer reaches 50 Google clicks a month, or the owner approves an affiliate offer at the moment a pair forms (PRD 3 next steps)  |
| H8  | PRS operators or agencies pay for document-verified cost cards of their flats                                                                                                                                                                                                                                               | A13              | —                           | Paid pilots out of 10 conversations (D16)                                                                                  | A new owner decision lifting D16                                                                                                                |
| H9  | Answering existing "landlord keeps my deposit" questions in RU/UA chats with source-tagged bot links starts deposit cases at a rate one founder can sustain, and some of those tenants ask for a lawyer. Proposed by Claude on 2026-11-19; E10 adopted by the owner the same day (D34 – D37) and stopped the same day (D44) | A3, A6, A12, A14 | E10 (Stopped)               | Persons with `tg_deposit_flow_started` by `entry_source` → `tg_deposit_letter_generated`; `tg_lawyer_interest`, in 14 days | A new owner decision; answering in chats means personal help, which the owner does not give (D46)                                               |
| H11 | The guides already on Google page 1 get twice the clicks with sharper titles, and a deposit prompt on move-out guides turns some readers into deposit cases. Proposed by Claude on 2026-11-19; not adopted                                                                                                                  | A1, A3           | E12 (Stopped)               | GSC CTR per page; `telegram_bot_opened` with `source=guide_deposit`                                                        | The stage 1 fallback (content plus free tools), or the owner adopts the title rewrite as a small item                                           |

## Rejected

| ID  | Hypothesis                                                                                                                   | Assumptions | Experiments | Evidence                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H4  | Consume-framed posts ("check whether you overpay") with the link in the first comment drive more form starts than data posts | A1, A7      | E1, E3      | E3 (PostHog 2026-07-29 – 2026-08-11, sessions): `threads_reply` 23 sessions and 0 `cost_form_started`; `threads_check` 6 sessions and 0 `cost_form_started`. The decision was due 2026-08-11; no variant produced a form start. E1: view → click below 1 % |

## Status changes of 2026-11-19

Applied from `reviews/2026-11-18-direction-review.md` ("Proposed status changes") where the
evidence supports them, and from thesis v2 (D48):

- **H4 → Rejected**, as the direction review proposed (evidence above; `reviews/2026-11-18-metrics.md`
  §5).
- **H7 → Parked.** The review proposed "Redesign": 0 `affiliate_link_clicked` from 2026-08-27 to
  2026-11-18, and the host guide got 4 Google clicks in 12 months (readout §5). Out of focus under
  D48.
- **H2 → Parked, H3 → Parked.** The review proposed "Testing (E8)" and "Testing (E9)". Not
  applied: E8 and E9 start only with the PRD 1 deploy, so neither is running. Both are out of
  focus under D48; E8 and E9 are still read when their two weeks pass, since they need no build.
- **H5 → Parked** (D48): the bot is now the product, and H14 asks the channel question for it.
- **H11 → Parked** (D48): the owner did not adopt E12.
- **H13 Idea → Ready**: E14 and E15 are designed in PRD 3 (`prd/prd-3-roommate-matching.md`).
- **H10, H12** move to Active with their status unchanged.

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
- **2026-11-19:** the readout found 41 roommate or sublet landings since 2026-08-01 with 0 listing
  views, contacts, saved interests or form starts, and no roommate listing since June (A18,
  Contradicted). The entry question moves to H10 and the matching question to H13; H2 is parked.

### H3. Address check as its own job

- **Why:** about 5 checks a day (2026-10-05) without promotion; the checker shipped in #92
  (2026-07-27). The honest answer per building, district and city is PRD 1 package C.
- **2026-11-19:** PostHog shows 9, 9, 7, 0 and 0 `address_checked` a month from July to
  November (readout 2026-11-18), not 5 a day; building pages are the largest Google click group
  (49 of 116). Parked under D48; the checker stays an entry and a free tool.

### H4. Consume-framing in posts

- **Why:** view → click was below 1 % on Threads in June; the site converted visitors once they
  arrived. The owner committed to a first comment with the link; the decision was due 2026-08-11
  by form starts per `ref` (D11). The result was not recorded until the readout of 2026-11-18,
  which found no form start from either variant. Rejected on 2026-11-19.

### H5. Bot as a channel

- **Why:** Telegram pushes are opened far more often than channel posts; RU/UA chats have 2–22k
  members; bot launches get free coverage in diaspora media (research 2026-08-29).
- **Kill or scale:** D14 thresholds over 30 days from the production launch. Whether D14's kill
  rule still applies now that the bot carries the thesis is an open question in
  `prd/prd-3-decision-review.md`.

### H6. Agency reviews (pillar 2)

- Parked with the trigger in D5. The free probe on Threads was planned on 2026-06-20; no result
  was recorded. D48 takes agency reputation out of Passflat's positioning.

### H7. Affiliate guides

- **Why:** the Wise link went live with PR #107 on 2026-08-27; mBank and Millennium CPA links
  were generated on 2026-08-25. Verification for non-EU citizens without residence documents
  fails at Wise and Revolut, so guides must segment readers by status.
- **2026-11-19:** the links sit only in the bank-account guide, which got almost no audience;
  parked. The market research names affiliate offers at the moment a pair forms (movers,
  internet, insurance) as a later money line without staff; commissions were not researched.

### H8. Verified cost cards (B2B)

- Parked on 2026-10-04 (D16). Research kept in `../research/competitors.md` and the BRD.

### H9–H11. Proposed by Claude on 2026-11-19 (E10 adopted and then stopped, H10 adopted)

Written in the night run of 2026-11-18/19 from `reviews/2026-11-18-metrics.md` and
`reviews/2026-11-18-direction-review.md`. They are proposals, not decisions. Of the assumptions
they cite, A18 and A21 entered the BRD registry on 2026-11-19; A19 and A20 were not registered,
because the deposit tests they served are stopped (D44).

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
  - **Thesis v2 (2026-11-19):** the roommate page is an entry into matching. PRD 3 builds the
    D41 block (PRD 3 FR-22) and a third role, "looking for someone to rent with", that leads
    to the bot (PRD 3 FR-21). E11 cannot finish before 2027-01-20 (D43 details).
- **H11. Page-1 guides.**
  - **Why:** the meters guide (809 impressions, position 6.9) and the English hidden-costs guide
    (806, position 6.6) have CTR below 1 %; Google's AI features surface the meters guide most.
  - **Upside:** small (about 25 clicks a year at 2 % CTR); it is cheap and fed H9. Parked on
    2026-11-19 with H9.

### H12. Notifications about the district (2026-11-19)

- **Why:** PRD 1 replaced the bot's and the website's notification promises with an honest
  "interest saved, no automatic notifications yet" (FR-19, FR-39), and nothing sends
  notifications. Saved interest is the cheapest sign that people want them.
- **Test:** E13 (D40). At least 10 persons (**Assumption**) → the next PRD builds real
  notifications with a content source; below → no notifier.
- **Relation to the ladder (2026-11-19):** the owner decided the daily "N new people fit" push of
  stage 2 (D49, opt-out). It is a notification with a content source (new compatible profiles),
  so it does not wait for E13. E13 still decides a notifier for building and district figures.
  The push adds its own reading in E15: persons with `tg_roommate_push_sent` → of them, persons
  with `tg_roommate_cards_viewed` the same day, and persons with `tg_roommate_push_opted_out`.

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
- **Research (2026-11-19):** `../research/roommate-market-2026-11-19.md` and
  `../research/roommate-fit-and-test-2026-11-19.md`. Pure matching products mostly failed or
  earned little (Badi ~€180k revenue against a ~€10M loss in 2020); Polish attempts have thin
  pools; RU/UA/EN speakers in Warsaw have no roommate chat; Passflat's rent figures per district
  are a hook nobody else has. The build is not the risk; liquidity and the calendar are.
- **Decided (D48, D49, D52):** thesis v2 and stages 1 and 2 in December; PRD 3 holds the
  requirements. Split into H14, H15 and H16.

### H14. Stage 1: a structured waiting list (2026-11-19)

- **Why:** the fit report's arithmetic: with a 30-day life, active profiles ≈ 4.3 × profiles
  created per week; at about 15 % compatible pairs, a new profile sees 2 or more compatible
  people only when about 15–20 profiles are active, which needs 4–5 new profiles a week, about one
  per owner-hour at ~7 posting hours a week. An estimate, not data.
- **What would contradict it:** fewer than 15 profiles, fewer than 1 profile per owner-hour, or
  more than 30 minutes a week of manual handling at the 2027-01-18 readout (D52).
- **Caveat:** the market research estimates 100–200 active profiles for 5–10 compatible people
  per seeker; the go threshold (≥ 20 active) is far below that, so stage 2 tests whether a small
  pool already produces matches.

### H15. Stage 2: mutual matching (2026-11-19)

- **Why:** messaging users can act on was what took off at SpareRoom; double opt-in keeps
  contact safe and free (research 2026-11-19).
- **Runs from the PRD 3 deploy** (D75, evening of 2026-11-19): the switch is on from day 0, so
  E14 and E15 run together. Before that it was to run only if E14 passed, with the switch turned
  on around 2027-01-07 for February move-ins (D49, D58).

### H16. Stage 3: paid speed (2026-11-19)

- **Why:** in Poland people pay for speed at about 10–45 zł a month (FON 15.99 zł a week or
  44.99 zł a month; BotOLX 9.99 / 24.99 zł) and punish paywalls on reading or replying (Roomster
  reviews); research 2026-11-19. In-bot sales of digital services go through Telegram Stars only
  from mid-November 2026.
- **Expected size:** about 240 zł a month at 150 active profiles × 4 % paying × 40 zł (the market
  research's estimate). No price is set; prices are the owner's (D52: speed, never contact).
