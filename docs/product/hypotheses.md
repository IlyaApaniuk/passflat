# Hypotheses

What we believe would create demand or revenue, and how we will know. Each hypothesis cites the
BRD assumptions it rests on and the experiments that test it (`experiments.md`). Numbers are
never reused. H1–H8 were reconstructed on 2026-11-18 from the owner's sessions of June–October
2026; none has a recorded readout yet.

Status: **Idea**, **Ready** (experiment designed), **Testing**, **Supported**, **Rejected**,
**Parked** (with a trigger).

| ID  | Hypothesis                                                                                                                                                                                                                                                                      | Assumptions                         | Status  | Experiments | Primary metric                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Tenants whose deposit is kept will use a free bot flow that produces a Polish demand letter, and some will want paid escalation                                                                                                                                                 | A3, A12, A14                        | Ready   | E6          | Deposit cases started → letter generated → outcome reported, per week                                                            |
| H2  | Roommate search is the strongest organic entry, and serving both roles well turns those visits into contacts                                                                                                                                                                    | A5                                  | Idea    | E8          | Roommate visits → role chosen → offer viewed → contact or saved interest                                                         |
| H3  | Checking a specific address is a job people come back for, and an honest answer leads to a contribution                                                                                                                                                                         | A1, A8                              | Idea    | E9          | Address answered → contribution started, per entry page type                                                                     |
| H4  | Consume-framed posts ("check whether you overpay") with the link in the first comment drive more form starts than data posts                                                                                                                                                    | A1, A7                              | Testing | E1, E3      | `cost_form_started` per `ref`                                                                                                    |
| H5  | The Telegram bot reaches the RU/UA audience better than the website and brings activated users                                                                                                                                                                                  | A4, A6                              | Ready   | E5          | `/start` count, activation share, D14 retention (D14 thresholds)                                                                 |
| H6  | Tenants want agency reviews enough to read and write them                                                                                                                                                                                                                       | —                                   | Parked  | E4          | Probe engagement; trigger in D5                                                                                                  |
| H7  | Move-in guides with affiliate offers (banks, Wise, insurance) earn the first money at current traffic                                                                                                                                                                           | A11                                 | Testing | E7          | `affiliate_link_clicked` per guide, then confirmed conversions                                                                   |
| H8  | PRS operators or agencies pay for document-verified cost cards of their flats                                                                                                                                                                                                   | A13                                 | Parked  | —           | Paid pilots out of 10 conversations (D16)                                                                                        |
| H9  | Answering existing "landlord keeps my deposit" questions in RU/UA chats with source-tagged bot links starts deposit cases at a rate one founder can sustain, and some of those tenants want a paid done-for-you next step. Proposed by Claude on 2026-11-19, awaiting the owner | A3, A6, A12, A14; proposed A19, A20 | Idea    | E10         | Persons with `tg_deposit_flow_started` by `entry_source` → `tg_deposit_letter_generated` → `tg_deposit_paid_interest` in 14 days |
| H10 | Room seekers who arrive from search want room money answers (cost per person, deposit, address) more than offers Passflat does not have; a roommate page that answers them turns landings into useful actions. Proposed by Claude on 2026-11-19, awaiting the owner             | A5; proposed A18                    | Idea    | E11         | Roommate landings → sessions with a useful action (PRD 1 events) over 8 weeks; GSC CTR                                           |
| H11 | The guides already on Google page 1 get twice the clicks with sharper titles, and a deposit prompt on move-out guides turns some readers into deposit cases. Proposed by Claude on 2026-11-19, awaiting the owner                                                               | A1, A3                              | Idea    | E12         | GSC CTR per page; `telegram_bot_opened` with `source=guide_deposit`                                                              |

## Details

### H1. Get your deposit back

- **Why we believe it:** urgent money problem, clear statutory deadline, language barrier; the
  only free competitor (kaucja365.pl) has no follow-ups or outcomes (research 2026-10-05).
- **What exists:** the bot flow on `feat/tg-bot` (five questions, verdict, letter with the lease
  read by Claude at about $0.10–0.15 per contract, follow-ups, outcome, `wants_lawyer`). Not in
  production: four migrations unapplied, production token and webhook not set.
- **Kill or scale:** proposed in E6. Money comes later through A12, not before the free flow
  shows use.

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

### H9–H11. Proposed by Claude on 2026-11-19, awaiting the owner

Written in the night run of 2026-11-18/19 from `reviews/2026-11-18-metrics.md` and
`reviews/2026-11-18-direction-review.md`. They are proposals, not decisions; the assumptions
A18–A20 they cite are proposed in the direction review and in the PRD 2 decision review and are
not in the BRD registry yet.

- **H9. Deposit cases from chat answers.**
  - **Why:** replies under others' posts were the only channel that converted repeatedly
    (BRD §7); search brings almost no deposit demand (12 visible impressions in 12 months); the
    deposit flow is built and its events are server-side, so they survive the web capture loss.
  - **What it adds to H1:** a source per link, prompts on move-out guides, and a probe of
    willingness to pay for a done-for-you next step before any legal or payment work (A12).
  - **Test:** E10 through PRD 2.
- **H10. Roommate search, reframed.**
  - **Why:** the owner's hypothesis that roommate search is the top of search demand is partly
    true: `/warsaw/roommate` is the strongest single page (25 of 116 clicks, 1,409 impressions)
    and roommate queries hold 12 of the 15 visible query clicks, but building pages bring more
    clicks in total (49), and 41 roommate landings since 2026-08-01 produced no useful action.
    Passflat has no room offers (no roommate listing since June) and listings are frozen (D5).
  - **What it tests:** whether the same visitors act when the page answers what Passflat can
    answer. If E11 fails, roommate search stays a side entry.
- **H11. Page-1 guides.**
  - **Why:** the meters guide (809 impressions, position 6.9) and the English hidden-costs guide
    (806, position 6.6) have CTR below 1 %; Google's AI features surface the meters guide most.
  - **Upside:** small (about 25 clicks a year at 2 % CTR); it is cheap and feeds H9.
