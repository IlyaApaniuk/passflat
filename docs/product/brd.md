# BRD: Passflat

Version 0.3 of 2026-11-19 (first draft 2026-11-18). The business document under the thesis
(`thesis.md`, D48): why Passflat exists, for whom, how it could earn money and which assumptions
everything rests on. PRDs describe stages and cite assumptions by number (A1, A2, …). The
document changes rarely: a new fact changes an assumption's status and adds a line to the change
log.

This draft was compiled by Claude from `PROJECT.md` (strategic update of 2026-06-20), the brief
of 2026-10-07, the owner's working sessions of June–October 2026 and the owner's decisions of
2026-11-19. It awaits the owner's edits. Figures carry their date and source; where the original
source was not recorded, the figure is marked **unverified**.

Owner: Ilya Apaniuk (product, development, distribution), working solo with an agent loop.

## 1. Idea

**Passflat helps people in Warsaw find someone to rent with and see what it costs per person**
(thesis v2, D48). People looking for someone to rent a flat with create a short profile in the
Telegram bot (district, budget per person, move-in month) and find each other by mutual
interest; Passflat's honest rent figures stand next to every step. The figures come from
tenants' own reports, data entered on their behalf and scraped asking prices, and are shown only
as aggregates per building, district and city, each group with its N. The deposit letter stays a
free automatic tool in the bot (D44). Everything is self-serve: no personal help, no staff (D39).

The website (Polish, English, Russian, Ukrainian) with cost figures, building pages, the address
checker, guides and the roommate page is the entry into this. The bot speaks Russian and
Ukrainian today; English is added for matching and Polish only after stage 1 passes (D50).

State on 2026-11-19: live at passflat.com; no revenue; Stripe code exists but paid access is
parked (D7); an affiliate link (Wise) was merged in PR #107; PRD 1 (activation measurement and the
Telegram bot with the deposit flow) is built on `chore/agent-harness` and awaits the owner's
deploy (D29); roommate matching is PRD 3, a draft for the owner's review.

## 2. Problem

- **Finding someone to rent with is slow and unsafe.** Demand is spread over hundreds of
  Facebook groups (mRazem's founders searched 37 groups for one room in 2018) and RU/UA/EN
  speakers in Warsaw have no roommate chat of their own (research 2026-11-19). Scams in rental
  search ask for a "reservation" before any viewing.
- **People do not know what renting together costs per person.** A whole flat averages more than
  4,900 zł a month, about 2,450 zł each for two; a place in a shared flat costs about 1,480 zł
  (Otodom and money.pl via research 2026-11-19). Listings say "3,500 zł + charges"; the all-in
  cost may be 4,200–5,200 zł (`PROJECT.md`, **unverified**).
- **Utility settlements bring surprise surcharges.** Heating surcharges rose in 2025/26 (owner
  session 2026-10-05, **unverified**).
- **Deposits are not returned in full.** About 5,000 zł is at stake per tenancy and about 23 % of
  tenants do not get it back in full (owner session 2026-10-05, **unverified**). The statutory
  deadline and the Polish-language letter are barriers for newcomers.
- **Knowledge is needed once per move; problems are urgent.** People come to chats with problems,
  not with a wish to research costs, and nobody has a reason to give their own data when asked
  (diagnosis agreed 2026-10-05, D17).

## 3. For whom

| Segment                                                                                            | Who                                                                                                                     | Priority                                                               | Assumptions       |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------- |
| RU, UA and English-speaking newcomers and young professionals who want to rent a flat with someone | Foreigners are ~14.5 % of Warsaw (GUS, end of 2025, research 2026-11-19); reached in Telegram chats and Facebook groups | Primary (D48, D2): the matching pool                                   | A4, A6, A22 – A27 |
| Polish roommate searchers from Google                                                              | `/warsaw/roommate` is the strongest single page (readout 2026-11-18)                                                    | Entry through the roommate page; Polish bot only after stage 1 (D50)   | A5                |
| Students looking for a room in an existing flat                                                    | Budgets of ~1,300–1,500 zł (research 2026-11-19)                                                                        | Served by the roommate page's room money answer (D41), not by matching | A5, A18           |
| Tenants with a deposit dispute                                                                     | Any tenant in Poland whose landlord keeps the deposit; Polish law applies nationwide                                    | Free tool in the bot (D44)                                             | A3, A12, A14      |
| Flat seekers checking an address or a district                                                     | People before signing                                                                                                   | Entry: building pages, the checker                                     | A1, A8            |
| Polish tenants, expats, students                                                                   | Same jobs, other languages                                                                                              | Secondary                                                              | —                 |
| Agencies, PRS operators, relocation firms                                                          | Possible payers for data or verified cards                                                                              | Parked (D16)                                                           | A13               |

## 4. Value and difference

- **Roommate matching with money next to it** (D48, D49): a profile in the bot, honest counts of
  who is looking per district, mutual interest before any contact, both Telegram usernames
  revealed only then, with safety lines; no profile is ever shown on the web. Competitors in
  Poland have thin pools or are dead (wspollokator.pl: 8 visible profiles; Flatmejt, mRazem gone;
  research 2026-11-19).
- **What tenants pay, not what landlords ask** (D5): rent figures per district and building
  next to the budget step. Otodom has fields for rent, administrative fee and deposit only, no
  field for utilities; the fee is filled in 87.7 % of Warsaw listings (research 2026-10-04).
- **Address check**: known costs, location score, nuisances and nearby buildings in one answer.
- **Deposit helper in the bot**: five questions, a rule-based verdict on the statutory deadline,
  a Polish demand letter (wezwanie do zapłaty) with the lease read by Claude, follow-ups, and the
  outcome recorded (built 2026-10-05, not in production).
- **Languages**: the website in four, the bot in RU, UK and EN, where competitors are Polish-only.

Main competitors (details: `../research/competitors.md`, `../research/roommate-market-2026-11-19.md`):
free Facebook groups of 120k–208k members and Telegram chats (where demand already lives),
RentFriends (swipe app, 4,000+ downloads), wspollokator.pl, OLX and Otodom rooms; Flatka (asking-price
aggregator), Rentspect (address reviews), kaucja365.pl (free AI demand letter), Domologio
(building reviews, a friend's product).

## 5. Market

Facts as of their dates:

- 301,200 foreigners live in Warsaw, about 14.5 % of the population; Ukrainians are 73 % of
  foreigners nationally (GUS experimental data, end of 2025; research 2026-11-19).
- About 235,500 students in Warsaw (PIE data, 2019 article); housing takes 37 % of student
  budgets (ISNS UW 2025; research 2026-11-19).
- Rental demand peaks July–September; December 2025 demand was 23 % below November and January
  usually rebounds (Otodom; research 2026-11-19).
- Warsaw rooms: OLX 1,000+ listings at 749–2,000 zł; Otodom 431 rooms, average 1,508 zł
  (research 2026-11-19).
- Telegram has 3.47M users in Poland, the 5th messenger (Mediapanel 09.2025, research 2026-08-29).
- Warsaw rental Facebook groups total 464k+ members (`PROJECT.md`, as of 2026-05).
- Warsaw PRS: about 9.6k units with 8 operators; agencies place 61 % of Otodom rental listings;
  median time to rent 13 days (Mzuri, 2026-08; research 2026-10-04).
- A lawyer's demand letter costs 95–500 zł (research 2026-10-05).

## 6. How we could earn money

Nothing earns yet. The rule for matching (D52): **charge for speed, never for contact.** Paid
contact resembles the paid-contact-details pattern UOKiK warned about and the paywalls users
punish (Roomster: $1.6M settlement in 2023, 2.4/5 on Trustpilot; research 2026-11-19).

| Option                                                     | State                                                                                                                                                                                                                                                                                                                                                          | Assumptions |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Paid speed in roommate matching (stage 3)                  | Direction decided (D52): instant alerts and "who marked you"; contact stays free. Since mid-November 2026 bots sell digital services inside Telegram only in Stars. Polish price anchors: FON 15.99 zł a week or 44.99 zł a month, BotOLX 9.99 / 24.99 zł. Research estimate ~240 zł a month at 150 active profiles × 4 % × 40 zł. Nothing built; no price set | A25         |
| Affiliate offers in guides, results and at the pair moment | Wise link merged (#107); rates known: mBank 49 EUR, Millennium ~35 EUR CPA (MyLead), Wise ~47 zł, Rankomat CPL, Clicktrans 10 zł (research 2026-08-25); 0 clicks in E7 (stopped 2026-11-19). Offers when a pair forms (movers, internet, insurance) are an idea; commissions not researched                                                                    | A11         |
| Deposit recovery stack                                     | Proposed 2026-10-07: free letter → paid self-serve checks → success fee via assignment of the claim (cesja, KC art. 509) or a lawyer partner within bar rules. On 2026-11-19 the deposit flow became a free tool with no paid step (D44); anything later must run without the owner (D39)                                                                      | A3, A12     |
| Paid cost-data access (7/30/90 days)                       | Stripe prices exist; parked (D7)                                                                                                                                                                                                                                                                                                                               | A10         |
| Verified cost cards for PRS and agencies                   | Parked (D16)                                                                                                                                                                                                                                                                                                                                                   | A13         |
| Agency reputation                                          | Out of focus (D48 supersedes D5's pillar 2)                                                                                                                                                                                                                                                                                                                    | —           |
| Listing promotion                                          | Parked with the listings freeze (D5)                                                                                                                                                                                                                                                                                                                           | —           |

Constraints for the lawyer layer (research 2026-10-05, not reviewed by a lawyer): adwokaci may
not pay for client referrals (KEA §23d ust. 2); for radcowie a fixed subscription not tied to
fees is allowed (KIRP opinion 2026-06-23); a pure success fee is banned for both; from 2026-10-17
publishing a list of adwokaci without bar consent is an offence (Prawo o adwokaturze art. 95p).

## 7. Channels

| Channel                                | What happened                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Threads                                | 2026-06: ~2,500–3,000 views → 19 visits → 3 form starts → 1 submission; view → click below 1 % (counted before D10, so the site numbers are not comparable)                                                                                                                                                                                                      |
| Paid posts in Telegram groups          | 2026-07: 200 zł/week plus a 300 zł post gave ~1–2 visits a week and no form starts; stopped (D8)                                                                                                                                                                                                                                                                 |
| Replies under others' posts            | The only channel that converted repeatedly in June–July (demand capture)                                                                                                                                                                                                                                                                                         |
| Search                                 | 116 Google clicks from 2026-06-02 to 2026-11-16, 4–9 a week since September; `/warsaw/roommate` 25 clicks, 1,409 impressions, position 8.8 (readout 2026-11-18)                                                                                                                                                                                                  |
| Instagram                              | 2 posts, 3 followers (2026-07-29)                                                                                                                                                                                                                                                                                                                                |
| Telegram bot                           | Not launched; dev bot only                                                                                                                                                                                                                                                                                                                                       |
| Owner's link posts in chats and groups | **Commitment** of 2026-11-19 (D46): two 30-minute slots a day, about 7 hours a week; no personal help to users. **Rules** (D53): reply to people who look for a roommate rather than broadcast, vary the wording, at most 3–4 groups per slot, ask admins first, prefer Telegram; identical links across Facebook groups risk a block of the passflat.com domain |

Data on 2026-06-26 (production query by source): 16 `user` reports (2 the owner's, 2 anonymous
from cold traffic, 12 from people asked directly), 19 `import`, 282 `scraped`; no district had
5 pure user reports. On 2026-10-07 the owner counted 320 reports, 318 buildings, 20–30
self-submitted contributions and no payments. Since 2026-07-01 the site produced 2 server-side
cost reports from non-test persons (readout 2026-11-18).

## 8. Goals and how we know it worked

The roommate ladder (`thesis.md`, D52; thresholds are **Assumptions** the owner may change):

- **Stage 1, readout 2027-01-18.** Stop below 15 profiles, below 1 profile per owner-hour of
  posting, or above 30 minutes a week of manual handling. Go at ≥ 30 profiles, ≥ 20 active and
  ≥ 3 districts with ≥ 3 active profiles each (E14). In between: extend once to 2027-02-28 with
  the same rules (D59). The switch is on from the PRD 3 deploy (D75, evening of 2026-11-19; it
  was to go on at the first day on or after 2027-01-07 when the go numbers held, D58).
- **Stage 2.** Within 14 days of the switch, ≥ 30 % of profiles older than 14 days have ≥ 1
  mutual match; by about 2027-03-31, ≥ 10 mutual pairs and ≥ 3 "renting together" or "talking"
  outcomes (E15). Stop below 15 % at switch + 14 days, with no pair among ≥ 20 browsing persons,
  or below 10 pairs by about 2027-03-31; outcomes counted as persons (D60).
- **Stage 3, money.** Paid speed, designed only after stage 2.
- **Decision.** The owner decides on 2027-01-20 from the stage 1 readout: continue, or shrink to
  content plus the free tools with near-zero owner time, or stop (D43, D52).

Other thresholds already decided: the bot launch (D14 scale numbers, reported at day 30; its kill
rule no longer applies, D57), notifications (E13, D40), the roommate page (E11, D41).

## 9. Limits

### Never

- Charge for contact between roommate seekers (D52).
- Show a roommate profile on the web, show gender or the live-with preference on a card, in a
  count or as a filter (D49, D51), or count profiles in combinations that single a person out.
- Ask for or pass money, ID documents or "reservation" deposits through Passflat.
- Present the deposit helper or any letter as legal advice, or give a confident personal verdict
  where the data or the lease could not be read.
- Show apartment numbers, raw individual reports, or reviews of named private persons
  (buildings, not people; Kodeks karny art. 212 risk).
- Claim "verified" (also not "verified profiles"), invent statistics, or call a blended median
  "market" (D4, D23).
- Send emails, free text, contract contents, names, usernames or chat IDs to analytics (D10).
- Publish a directory of adwokaci, or pay lawyers per referral (section 6).
- Put third-party badges into Otodom listings (forbidden by its terms, research 2026-10-04).

### Constraints

- One founder; 10–15 hours a week and 300–500 zł a month of marketing budget were committed for
  July 2026 (current figures **unverified**).
- Self-serve only (D39, 2026-11-19): the owner is a programmer, not a lawyer; no personal help
  to users, no lawyer and no other staff now. Distribution time: about 7 hours a week (D46).
- Decision date 2027-01-20 (D43, D52).
- RODO: data in the EU; cookieless analytics on Art. 6(1)(f) (D10). Roommate profiles live 30
  days and are deleted at once on request (D49, PRD 3).
- Production changes only with the owner's approval (D18, D19).

## 10. Assumption registry

Numbers are never reused. Status: Confirmed, Partly, Testing, Untested, Contradicted.

### Demand

| No. | Assumption                                                                                                                        | Status       | Facts and how we test                                                                                                                                                                                                                                                                   | If wrong                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A1  | Tenants want to know the real monthly cost of a flat before renting and will use a site for it                                    | Partly       | PostHog `address_checked`: 9, 9, 7, 0, 0 a month July–November 2026; the "~5 checks a day" of 2026-10-05 is not in PostHog. Building pages bring 49 of 116 Google clicks (readout 2026-11-18)                                                                                           | Costs stay a by-product, not the product                                         |
| A2  | Tenants contribute their own costs without being asked personally                                                                 | Contradicted | ~2 reports from cold traffic of 16 user reports by 2026-06-26; 2 server-side reports from non-test persons since 2026-07-01 (readout 2026-11-18)                                                                                                                                        | Already acted on: D17 makes data a by-product                                    |
| A3  | Deposit disputes are frequent and painful enough that tenants seek help and use a free tool                                       | Untested     | 5,000 zł / 23 % figures unverified; bot flow built, not launched; value metric of D44 (E6 and E10 stopped)                                                                                                                                                                              | The free tool stays small                                                        |
| A4  | RU/UA newcomers are the best first audience                                                                                       | Untested     | Search: clicks by page locale PL 59 %, EN 22 %, RU 14 %, UK 4 % over 12 months (readout 2026-11-18), so not for search. Chats untested; E14 splits profiles by `entry_source` and bot locale                                                                                            | Polish-first channels; Polish bot after stage 1 (D50)                            |
| A5  | Roommate search is a real entry demand on the site                                                                                | Partly       | `/warsaw/roommate` 25 clicks, 1,409 impressions; 41 roommate landings since 2026-08-01 with 0 useful actions (readout 2026-11-18); E11, E14 (`mate_web`)                                                                                                                                | Roommate stays a side entry                                                      |
| A6  | A Telegram bot reaches the RU/UA audience better than the website                                                                 | Untested     | Bot not in production; E5 is reported at day 30, the bot's fate is decided by E14 (D57); E5, E14                                                                                                                                                                                        | Bot stays a mirror; invest in the site                                           |
| A7  | Broadcast posts in general audiences produce views, not clicks; only demand capture converts                                      | Partly       | The broadcast part holds in E1, E2 and E3 (0 form starts from both variants, readout 2026-11-18); the demand-capture part rests on June–July counts before D10                                                                                                                          | Revisit paid broadcast                                                           |
| A8  | The address check is a useful job on its own                                                                                      | Untested     | 0 `address_checked` since 2026-09-14 and landing events were lost until PRD 1 FR-13 (readout 2026-11-18); result quality not measured; E9                                                                                                                                               | Fold the checker into building pages                                             |
| A9  | Tenants want a check of a utility surcharge                                                                                       | Untested     | Mineko (DE): 151k checks at 49–89 € (research 2026-10-04)                                                                                                                                                                                                                               | Drop the hook                                                                    |
| A18 | Passflat can attract room offers without paid acquisition                                                                         | Contradicted | No roommate listing since 2026-06; one non-test `listing_created` since 2026-06-01 (direction review 2026-11-18, PostHog query)                                                                                                                                                         | Already acted on: listings stay frozen (D5); matching has seekers only (D48)     |
| A22 | The owner's link posts bring at least 1 completed roommate profile per owner-hour of posting                                      | Untested     | Fit report estimate: ~7 posting hours a week → 4–5 profiles a week → 15–20 active with a 30-day life (research 2026-11-19); E14                                                                                                                                                         | Stage 1 stops (D52)                                                              |
| A23 | At least half of the people who start the roommate intake finish a profile                                                        | Untested     | The fit report's estimate used 50 % completion; E14 reports `tg_roommate_flow_started` → `tg_roommate_profile_created`                                                                                                                                                                  | Shorten the intake                                                               |
| A24 | With ≥ 20 active profiles in ≥ 3 districts, ≥ 30 % of profiles older than 14 days get a mutual match within 14 days               | Untested     | The market research estimates ~100–200 active profiles for 5–10 compatible people per seeker (research 2026-11-19); E15                                                                                                                                                                 | Matching stops                                                                   |
| A26 | Enough seekers can afford to rent a whole flat together: per-person budgets reach the ~2,000–2,500 zł a Warsaw flat costs for two | Untested     | Whole flat > 4,900 zł on average; a place in a shared flat 1,480 zł (research 2026-11-19); E14 reports budget bands                                                                                                                                                                     | Matching needs rooms in existing flats, which are frozen listings (D5)           |
| A28 | Most people who want a match have a Telegram username or set one when asked                                                       | Untested     | `username` is optional in the Bot API User object (fit report §2); measured by `has_username` on `tg_roommate_profile_created` (readable in stage 1) and `tg_roommate_username_prompted` → `tg_roommate_username_set` (PRD 3 FR-43), plus read-only SQL for pairs waiting on a username | Matches stall at the reveal; reveal through another channel needs a new decision |

### Money

| No. | Assumption                                                                                                         | Status   | Facts and how we test                                                                                                                             | If wrong                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| A10 | Tenants pay for time-limited access to cost data                                                                   | Untested | Parked (D7)                                                                                                                                       | Keep data free as a magnet                                |
| A11 | Affiliate offers (banks, fintech, insurance, movers) earn noticeable money at Passflat's traffic                   | Untested | Rates known (section 6); E7: 0 `affiliate_link_clicked` from 2026-08-27 to 2026-11-18, almost no audience; stopped                                | Affiliate stays a side income                             |
| A12 | A deposit claim can be monetized legally via assignment or a lawyer partner in Poland                              | Untested | Legal research 2026-10-05; needs a Polish lawyer                                                                                                  | Free tool plus affiliate or paid self-serve               |
| A13 | PRS operators or agencies pay for verified cost cards                                                              | Untested | Parked (D16); price anchors 129–615 zł for comparable services                                                                                    | —                                                         |
| A25 | Some matching users pay about 10–45 zł a month for speed (instant alerts, "who marked you") through Telegram Stars | Untested | FON 15.99 zł a week / 44.99 zł a month, BotOLX 9.99 / 24.99 zł; Stars only for in-bot sales from mid-November 2026 (research 2026-11-19); stage 3 | Matching stays free; its value is traffic for the figures |

### Law and data

| No. | Assumption                                                                                                                     | Status   | Facts and how we test                                                                                            | If wrong                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| A14 | The bot's deposit rules (uopl art. 6 ust. 4, KC art. 112, 115, 675, 681, interest from the day after the deadline) are correct | Partly   | Checked against statute texts 2026-10-05 (commit a612f76); no lawyer review                                      | Fix the rules before promotion             |
| A15 | Cookieless analytics without consent is lawful under Art. 6(1)(f)                                                              | Untested | Owner decision D10; no legal review                                                                              | Consent-gated analytics, smaller samples   |
| A16 | Users accept blended medians with scraped asking prices                                                                        | Untested | D4 by the owner, superseded by D23: no surface blends the groups any more (PRD 1 package C, built, not deployed) | Separate labelled groups (PRD 1 package C) |

### Team and measurement

| No. | Assumption                                                                                                                               | Status       | Facts and how we test                                                                                 | If wrong                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A17 | One founder with the agent loop ships and measures a test within two weeks                                                               | Partly       | PRD 1 (60 tasks) was built in two loop runs on 2026-11-18/19 (D21, D38); not yet deployed or measured | Smaller PRDs                                                                                           |
| A21 | On-site tests can be read within two weeks at the current traffic (about 6 Google clicks a week)                                         | Contradicted | Readout 2026-11-18: 2 form starts in 8 weeks                                                          | Already acted on: tests run on the owner's posts and the bot (D48); web tests get 8-week windows (E11) |
| A27 | Automatic moderation (text filter, reports, automatic hiding, statements of reasons) keeps manual handling at or below 30 minutes a week | Untested     | Fit report design (research 2026-11-19); the owner logs manual minutes; E14, E15                      | Stage 1 or 2 stops (D52)                                                                               |

## 11. Stages

One PRD is one stage. It is closed when all of its tasks are closed.

| PRD   | What                                                                                                                                                                 | Status                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| PRD 1 | Activation measurement and the Telegram bot: separate funnels, roommate fixes, honest building figures, bot handoff and promises (`prd/prd-1-activation-and-bot.md`) | Built (60 tasks done, 2026-11-19); the owner's deploy launches the bot (D29)                   |
| PRD 3 | Roommate matching, stages 1 and 2, plus the English bot locale (`prd/prd-3-roommate-matching.md`)                                                                    | Done (52 tasks, 2026-11-19; built and tested, not deployed); deployed with the switch on (D75) |
| PRD 2 | Deposit sprint (`prd/prd-2-deposit-sprint.md`)                                                                                                                       | On hold, 2026-11-19 (D39)                                                                      |
| Later | Stage 3 money (paid speed), a Polish bot locale (after stage 1, D50), deposit money layer, second city                                                               | Hypotheses                                                                                     |

## 12. Main risks

1. **Liquidity** (A22, A24): the pool stays too thin to match from the owner's posting alone;
   pure matching products mostly failed (research 2026-11-19).
2. **Season** (A22): stage 1 runs in the December–January trough, so a null result is weak
   evidence.
3. **Budgets** (A26): seekers' per-person budgets may not reach a whole flat.
4. **Channel bans** (D53): identical links can get posts removed or the passflat.com domain
   blocked on Facebook.
5. **Safety and law** (A27, D51): fake profiles and "reservation" scams; the gender preference,
   profile data and DSA duties have no lawyer review; the owner cannot hire a lawyer now (D39).
6. **Legal correctness of the deposit verdicts** before wide promotion (A14).

## 13. Open business questions

| Question                                                                                                                              | Who decides                | What it blocks                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| The decisions in `prd/prd-3-decision-review.md` (profile fields, retention, legal texts, timing)                                      | Owner                      | PRD 3 decomposition                                                       |
| Launch the bot in production (token, migrations, webhook)                                                                             | Owner                      | Everything in the ladder (D29)                                            |
| A Polish lawyer review of the deposit rules and letter, and of the roommate questions (D51); the owner cannot hire a lawyer now (D39) | Owner                      | Promoting the deposit flow widely (D26, D44); legal certainty of matching |
| Marketing budget now (time is set: about 7 hours a week, D46)                                                                         | Owner                      | Channel plan                                                              |
| Continue, shrink to content plus free tools, or stop                                                                                  | Owner, on 2027-01-20 (D43) | Everything after that date                                                |

## 14. How the documents work

See `README.md` in this folder.

## Change log

**v0.1, 2026-11-18.** First draft, compiled from `PROJECT.md`, the 2026-10-07 brief and the
owner's sessions of June–October 2026. Registry A1–A17.

**v0.1, 2026-11-19.** Owner decisions D39 – D46: the main bet is under review and PRD 2 is On
hold; the deposit flow is a free tool; roommate matching is the direction to research; the
owner's distribution commitment (§7); self-serve constraint and the 2027-01-20 decision date
(§9); stages and open questions updated (§3, §6, §11, §13). No assumption changed status.

**v0.2, 2026-11-19.** Thesis v2 and the roommate ladder (D48 – D53, `thesis.md`): idea, problem,
segments, value and market rewritten for roommate matching (§1 – §5); money: speed, never
contact, Telegram Stars, the pair moment for affiliate offers (§6); posting rules (§7); goals are
the ladder thresholds (§8); new "Never" lines (§9); stages PRD 1 built, PRD 3 draft, PRD 2 on hold
(§11); risks and open questions (§12, §13). Registry: new A18 (Contradicted) and A21
(Contradicted), proposed in `prd/prd-2-decision-review.md`; A19 and A20 from that review are not
registered because they served the deposit tests stopped by D44, and their numbers stay reserved;
new A22 – A27 for roommate matching (Untested). Facts updated from `reviews/2026-11-18-metrics.md`
and the direction review for A1, A2, A4, A5, A7, A11; A8 Partly → Untested (the review's
proposal: 0 checks since 2026-09-14 and lost landing events); A17 Untested → Partly (PRD 1 built
in two runs, not deployed). A4 stays Untested: contradicted for search, not tested in chats.

**v0.3, 2026-11-19.** The owner's answers to the PRD 3 decision review (D54 – D70). Registry:
new A28 (Untested), proposed in `prd/prd-3-decision-review.md`: most people who want a match
have a Telegram username or set one when asked; read from `has_username` at profile creation and
the username prompt events (PRD 3 FR-43). A6: the bot's fate is decided by the stage 1 readout, not by D14's kill rule (D57); no
status changed.
