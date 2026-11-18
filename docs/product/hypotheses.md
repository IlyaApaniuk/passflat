# Hypotheses

What we believe would create demand or revenue, and how we will know. Each hypothesis cites the
BRD assumptions it rests on and the experiments that test it (`experiments.md`). Numbers are
never reused. H1–H8 were reconstructed on 2026-11-18 from the owner's sessions of June–October
2026; none has a recorded readout yet.

Status: **Idea**, **Ready** (experiment designed), **Testing**, **Supported**, **Rejected**,
**Parked** (with a trigger).

| ID  | Hypothesis                                                                                                                      | Assumptions  | Status  | Experiments | Primary metric                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------- | ----------- | ------------------------------------------------------------------------ |
| H1  | Tenants whose deposit is kept will use a free bot flow that produces a Polish demand letter, and some will want paid escalation | A3, A12, A14 | Ready   | E6          | Deposit cases started → letter generated → outcome reported, per week    |
| H2  | Roommate search is the strongest organic entry, and serving both roles well turns those visits into contacts                    | A5           | Idea    | E8          | Roommate visits → role chosen → offer viewed → contact or saved interest |
| H3  | Checking a specific address is a job people come back for, and an honest answer leads to a contribution                         | A1, A8       | Idea    | E9          | Address answered → contribution started, per entry page type             |
| H4  | Consume-framed posts ("check whether you overpay") with the link in the first comment drive more form starts than data posts    | A1, A7       | Testing | E1, E3      | `cost_form_started` per `ref`                                            |
| H5  | The Telegram bot reaches the RU/UA audience better than the website and brings activated users                                  | A4, A6       | Ready   | E5          | `/start` count, activation share, D14 retention (D14 thresholds)         |
| H6  | Tenants want agency reviews enough to read and write them                                                                       | —            | Parked  | E4          | Probe engagement; trigger in D5                                          |
| H7  | Move-in guides with affiliate offers (banks, Wise, insurance) earn the first money at current traffic                           | A11          | Testing | E7          | `affiliate_link_clicked` per guide, then confirmed conversions           |
| H8  | PRS operators or agencies pay for document-verified cost cards of their flats                                                   | A13          | Parked  | —           | Paid pilots out of 10 conversations (D16)                                |

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
