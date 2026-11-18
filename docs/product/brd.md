# BRD: Passflat

Version 0.1, draft of 2026-11-18. The top document of the project: why Passflat exists, for
whom, how it could earn money and which assumptions everything rests on. PRDs describe stages
and cite assumptions by number (A1, A2, …). The document changes rarely: a new fact changes an
assumption's status and adds a line to the change log.

This draft was compiled by Claude from `PROJECT.md` (strategic update of 2026-06-20), the brief
of 2026-10-07 and the owner's working sessions of June–October 2026. It awaits the owner's
edits. Figures carry their date and source; where the original source was not recorded, the
figure is marked **unverified**.

Owner: Ilya Apaniuk (product, development, distribution), working solo with an agent loop.

## 1. Idea

Passflat helps tenants in Poland, Warsaw first, with the money side of renting: what a flat
really costs per month before signing, what to check about an address, and how to get money
back when something goes wrong, starting with the deposit. Figures come from tenants' own
reports, data entered on their behalf and scraped asking prices, and are shown only as
aggregates per building, district and city. The website runs in Polish, English, Russian and
Ukrainian; a Telegram bot serves the Russian- and Ukrainian-speaking audience.

State on 2026-11-18: live at passflat.com; no revenue; Stripe code exists but paid access is
parked (D7); an affiliate link (Wise) was merged in PR #107; the Telegram bot with the deposit
flow is built on branch `feat/tg-bot` and not in production.

## 2. Problem

- **The real monthly cost is unknown before moving in.** Listings say "3,500 zł + charges"; the
  all-in cost may be 4,200–5,200 zł (`PROJECT.md`, **unverified**).
- **Utility settlements bring surprise surcharges.** Heating surcharges rose in 2025/26 (owner
  session 2026-10-05, **unverified**).
- **Deposits are not returned in full.** About 5,000 zł is at stake per tenancy and about 23 % of
  tenants do not get it back in full (owner session 2026-10-05, **unverified**). The statutory
  deadline and the Polish-language letter are barriers for newcomers.
- **Knowledge is needed once per move; problems are urgent.** People come to chats with problems
  (a kept deposit, a 1,500 zł surcharge), not with a wish to research costs, and nobody has a
  reason to give their own data when asked (diagnosis agreed 2026-10-05, D17).

## 3. For whom

| Segment                                   | Who                                                                                  | Priority          | Assumptions  |
| ----------------------------------------- | ------------------------------------------------------------------------------------ | ----------------- | ------------ |
| RU/UA newcomers in Warsaw                 | Russian- and Ukrainian-speaking tenants, often new to Polish leases                  | Primary (D2)      | A4, A6       |
| Tenants with a deposit dispute            | Any tenant in Poland whose landlord keeps the deposit; Polish law applies nationwide | Primary bet (D17) | A3, A12, A14 |
| Flat and room seekers in Warsaw           | People checking an address or a district before signing; roommate seekers            | Entry traffic     | A1, A5, A8   |
| Polish tenants, expats, students          | Same jobs, other languages                                                           | Secondary         | —            |
| Agencies, PRS operators, relocation firms | Possible payers for data or verified cards                                           | Parked (D16)      | A13          |

## 4. Value and difference

- **What tenants pay, not what landlords ask** (D5). Otodom has fields for rent, administrative
  fee and deposit only, no field for utilities; the fee is filled in 87.7 % of Warsaw listings
  (research 2026-10-04).
- **Address check**: known costs, location score, nuisances and nearby buildings in one answer.
- **Deposit helper in the bot**: five questions, a rule-based verdict on the statutory deadline,
  a Polish demand letter (wezwanie do zapłaty) with the lease read by Claude, follow-ups, and the
  outcome recorded (built 2026-10-05, not in production).
- **Four languages** including Russian and Ukrainian, where competitors are Polish-only.

Main competitors (details: `../research/competitors.md`): Flatka (asking-price aggregator,
30k listings), Rentspect (address reviews), kaucja365.pl (free AI demand letter, RU/PL, beta
since 2024-03, no follow-ups or outcomes; research 2026-10-05), Otodom and OLX (own listing
distribution and tenant verification), Domologio (building reviews, a friend's product).

## 5. Market

Facts as of their dates:

- About 1M+ Ukrainians live in Poland (`PROJECT.md`, **unverified**).
- Telegram has 3.47M users in Poland, the 5th messenger (Mediapanel 09.2025, research 2026-08-29).
- Warsaw rental Facebook groups total 464k+ members (`PROJECT.md`, as of 2026-05).
- Warsaw PRS: about 9.6k units with 8 operators; agencies place 61 % of Otodom rental listings;
  median time to rent 13 days (Mzuri, 2026-08; research 2026-10-04).
- A lawyer's demand letter costs 95–500 zł (research 2026-10-05).

## 6. How we could earn money

Nothing earns yet. Options and their state:

| Option                                   | State                                                                                                                                                                                    | Assumptions |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Affiliate offers in guides and results   | Wise link merged (#107); rates known: mBank 49 EUR, Millennium ~35 EUR CPA (MyLead), Wise ~47 zł, Rankomat CPL, Clicktrans 10 zł (research 2026-08-25); revenue not measured             | A11         |
| Deposit recovery stack                   | Proposed 2026-10-07: free letter → paid self-serve checks → success fee via assignment of the claim (cesja, KC art. 509) or a lawyer partner within bar rules; awaiting the owner's pick | A3, A12     |
| Paid cost-data access (7/30/90 days)     | Stripe prices exist; parked (D7)                                                                                                                                                         | A10         |
| Verified cost cards for PRS and agencies | Parked (D16)                                                                                                                                                                             | A13         |
| Agency reputation (pillar 2)             | Not built; trigger in D5                                                                                                                                                                 | —           |
| Listing promotion                        | Parked with the listings freeze (D5)                                                                                                                                                     | —           |

Constraints for the lawyer layer (research 2026-10-05, not reviewed by a lawyer): adwokaci may
not pay for client referrals (KEA §23d ust. 2); for radcowie a fixed subscription not tied to
fees is allowed (KIRP opinion 2026-06-23); a pure success fee is banned for both; from 2026-10-17
publishing a list of adwokaci without bar consent is an offence (Prawo o adwokaturze art. 95p).

## 7. Channels

| Channel                       | What happened                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Threads                       | 2026-06: ~2,500–3,000 views → 19 visits → 3 form starts → 1 submission; view → click below 1 % (counted before D10, so the site numbers are not comparable) |
| Paid posts in Telegram groups | 2026-07: 200 zł/week plus a 300 zł post gave ~1–2 visits a week and no form starts; stopped (D8)                                                            |
| Replies under others' posts   | The only channel that converted repeatedly in June–July (demand capture)                                                                                    |
| Search                        | ~28 Google clicks in three months (2026-08-25); in the rows shown on 2026-10-07, 10 of 13 clicks were roommate searches (not the share of all traffic)      |
| Instagram                     | 2 posts, 3 followers (2026-07-29)                                                                                                                           |
| Telegram bot                  | Not launched; dev bot only                                                                                                                                  |

Data on 2026-06-26 (production query by source): 16 `user` reports (2 the owner's, 2 anonymous
from cold traffic, 12 from people asked directly), 19 `import`, 282 `scraped`; no district had
5 pure user reports. On 2026-10-07 the owner counted 320 reports, 318 buildings, 20–30
self-submitted contributions and no payments; about 5 address checks a day (2026-10-05).

## 8. Goals and how we know it worked

**Open, to be set by the owner.** Proposed by Claude for the next stage:

- Find one job with repeatable demand from a free or cheap channel: a measured weekly count of
  activated users (answered address, generated letter) that grows without the owner asking
  people one by one.
- First revenue: a first paying customer or affiliate conversion attributable to Passflat.
- Measurement first: the funnels of PRD 1 separate roommate, address, contribution and bot jobs,
  so each hypothesis has its own numbers.

Kill and scale thresholds already decided: the bot (D14).

## 9. Limits

### Never

- Present the deposit helper or any letter as legal advice, or give a confident personal verdict
  where the data or the lease could not be read.
- Show apartment numbers, raw individual reports, or reviews of named private persons
  (buildings, not people; Kodeks karny art. 212 risk).
- Claim "verified", invent statistics, or call a blended median "market" (D4).
- Send emails, free text, contract contents or chat IDs to analytics (D10).
- Publish a directory of adwokaci, or pay lawyers per referral (section 6).
- Put third-party badges into Otodom listings (forbidden by its terms, research 2026-10-04).

### Constraints

- One founder; 10–15 hours a week and 300–500 zł a month of marketing budget were committed for
  July 2026 (current figures **unverified**).
- RODO: data in the EU; cookieless analytics on Art. 6(1)(f) (D10).
- Production changes only with the owner's approval (D18, D19).

## 10. Assumption registry

Numbers are never reused. Status: Confirmed, Partly, Testing, Untested, Contradicted.

### Demand

| No. | Assumption                                                                                     | Status       | Facts and how we test                                                                                     | If wrong                                          |
| --- | ---------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| A1  | Tenants want to know the real monthly cost of a flat before renting and will use a site for it | Partly       | ~5 address checks a day (2026-10-05); ~28 search clicks in 3 months (2026-08-25); PostHog readout pending | Costs stay a by-product, not the product          |
| A2  | Tenants contribute their own costs without being asked personally                              | Contradicted | ~2 reports from cold traffic of 16 user reports by 2026-06-26                                             | Already acted on: D17 makes data a by-product     |
| A3  | Deposit disputes are frequent and painful enough that tenants seek help and use a free tool    | Untested     | 5,000 zł / 23 % figures unverified; bot flow built, not launched; test with E6                            | Deposit hook dropped; next hook (surcharge check) |
| A4  | RU/UA newcomers are the best first audience                                                    | Untested     | D2 without data; test by funnel split by locale and channel                                               | Polish-first content and channels                 |
| A5  | Roommate search is a real entry demand on the site                                             | Partly       | 10 of 13 clicks in the shown search rows (2026-10-07; period unconfirmed); PRD 1 package A measures it    | Roommate stays a side entry                       |
| A6  | A Telegram bot reaches the RU/UA audience better than the website                              | Untested     | Bot not in production; D14 thresholds                                                                     | Bot stays a mirror; invest in the site            |
| A7  | Broadcast posts in general audiences produce views, not clicks; only demand capture converts   | Partly       | Threads and Telegram groups, June–July 2026                                                               | Revisit paid broadcast                            |
| A8  | The address check is a useful job on its own                                                   | Partly       | ~5 checks a day; result quality not measured                                                              | Fold the checker into building pages              |
| A9  | Tenants want a check of a utility surcharge                                                    | Untested     | Mineko (DE): 151k checks at 49–89 € (research 2026-10-04)                                                 | Drop the hook                                     |

### Money

| No. | Assumption                                                                                       | Status   | Facts and how we test                                                          | If wrong                                    |
| --- | ------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------ | ------------------------------------------- |
| A10 | Tenants pay for time-limited access to cost data                                                 | Untested | Parked (D7)                                                                    | Keep data free as a magnet                  |
| A11 | Affiliate offers (banks, fintech, insurance, movers) earn noticeable money at Passflat's traffic | Untested | Rates known (section 6); clicks `affiliate_link_clicked` to be read in PostHog | Affiliate stays a side income               |
| A12 | A deposit claim can be monetized legally via assignment or a lawyer partner in Poland            | Untested | Legal research 2026-10-05; needs a Polish lawyer                               | Free tool plus affiliate or paid self-serve |
| A13 | PRS operators or agencies pay for verified cost cards                                            | Untested | Parked (D16); price anchors 129–615 zł for comparable services                 | —                                           |

### Law and data

| No. | Assumption                                                                                                                     | Status   | Facts and how we test                                                       | If wrong                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------- | ------------------------------------------ |
| A14 | The bot's deposit rules (uopl art. 6 ust. 4, KC art. 112, 115, 675, 681, interest from the day after the deadline) are correct | Partly   | Checked against statute texts 2026-10-05 (commit a612f76); no lawyer review | Fix the rules before promotion             |
| A15 | Cookieless analytics without consent is lawful under Art. 6(1)(f)                                                              | Untested | Owner decision D10; no legal review                                         | Consent-gated analytics, smaller samples   |
| A16 | Users accept blended medians with scraped asking prices                                                                        | Untested | D4 by the owner                                                             | Separate labelled groups (PRD 1 package C) |

### Team

| No. | Assumption                                                                 | Status   | Facts and how we test              | If wrong     |
| --- | -------------------------------------------------------------------------- | -------- | ---------------------------------- | ------------ |
| A17 | One founder with the agent loop ships and measures a test within two weeks | Untested | First loop run 2026-11-18/19 (D21) | Smaller PRDs |

## 11. Stages

One PRD is one stage. It is closed when all of its tasks are closed.

| PRD   | What                                                                                                                                                                 | Status                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| PRD 1 | Activation measurement and the Telegram bot: separate funnels, roommate fixes, honest building figures, bot handoff and promises (`prd/prd-1-activation-and-bot.md`) | Draft; decomposition and build on 2026-11-18/19 (D21) |
| PRD 2 | The first demand and revenue test, chosen from the direction review and the PostHog readout                                                                          | Not written                                           |
| Later | Deposit recovery service, agency reputation, paid access, second city                                                                                                | Hypotheses                                            |

## 12. Main risks

1. **No repeatable demand channel** (A1, A6, A7): every channel so far needed the owner asking
   people one by one.
2. **The deposit hook is untested** (A3) and its money layer has legal limits (A12).
3. **Legal correctness of the deposit verdicts** before wide promotion (A14).
4. **Thin data** makes building figures look authoritative from one report (PRD 1 package C).
5. **Measurement gaps**: funnels mix jobs, and numbers before 2026-07-28 are not comparable.

## 13. Open business questions

| Question                                                               | Who decides | What it blocks             |
| ---------------------------------------------------------------------- | ----------- | -------------------------- |
| Which bet to test first: deposit, roommate, address check or affiliate | Owner       | PRD 2                      |
| Goals and thresholds for the next stage                                | Owner       | Section 8, PRD 2           |
| Launch the bot in production (token, migrations, webhook)              | Owner       | A3, A6, D14 thresholds     |
| A Polish lawyer review of the deposit rules and letter                 | Owner       | Promoting the deposit flow |
| Weekly time and budget now                                             | Owner       | Channel plan               |

## 14. How the documents work

See `README.md` in this folder.

## Change log

**v0.1, 2026-11-18.** First draft, compiled from `PROJECT.md`, the 2026-10-07 brief and the
owner's sessions of June–October 2026. Registry A1–A17.
