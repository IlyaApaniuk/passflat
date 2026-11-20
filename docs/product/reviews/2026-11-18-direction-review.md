# Direction review 2026-11-18

- **Focus (from the owner's night-run brief):** "How to make Passflat in demand and earning
  money: which job, segment, channel and offer to test first, given the metrics readout, the
  hypotheses H1–H8 and PRD 1 being built tonight." Includes an explicit test of the owner's
  hypothesis that roommate search is the top of search demand and Passflat should go that way.
- **Written by:** the `product-strategist` agent (unanchored: it received the focus, the date and
  the readout path, not the main session's conclusions), saved by Claude through the
  `product-review` skill during night run D21.
- **Inputs:** `reviews/2026-11-18-metrics.md`, `brd.md`, `hypotheses.md`, `experiments.md`,
  `decisions.md`, `roadmap.md`, `prd-rules.md`, `prd/prd-1-activation-and-bot.md`,
  `../research/competitors.md`, `src/lib/bot/bot.ts`, `src/content/blog/`; two extra read-only
  PostHog queries (project 451195, test-filtered) and web pages fetched on 2026-11-18 (listed at
  the end).

## Spot-check notes (Claude)

- **Verified:** affiliate links exist only in `src/content/blog/bank-account-rent-poland-*.mdx`
  (all four locales), not in the handover-protocol guide named in `experiments.md` E7. The
  readout's E7 line was corrected the same night: the bank-account guide got 4 Google clicks and
  130 impressions in 12 months (GSC), still 0 `affiliate_link_clicked`.
- **Verified:** the bot's `/start` accepts only the exact payload `dep` for the deposit flow
  (`src/lib/bot/bot.ts:220`). `tg_bot_started` already carries `payload` (`bot.ts:217`) and
  `touchChat` stores `startPayload`, so a source suffix is measurable at the start event once the
  bot accepts it.
- **Verified:** the Telegram chat sizes (20K and 11.6K, RU/UA) come from
  `../research/competitors.md:107–108`, dated 2026-05 there.
- **Verified:** figures quoted from the readout (clicks, impressions, 0 of 41 roommate landings,
  2 server-side reports since 2026-07-01, the 86 % pageview loss, the US `api_host`).
- **Not verified by Claude:** the agent's own PostHog queries (27 `/roommate` landings since
  2026-08-01 split 16 PL, 6 EN, 4 RU, 1 UK; 1 non-test `listing_created` since 2026-06-01), and
  the web facts (OLX "ponad 1000" Warsaw rooms, Otodom 432 rooms, Spotahome ~750, kaucja365's
  "not connected yet" form, HousingAnywhere's 8 % landlord fee, the August–September room-demand
  peak). Treat them as the agent's findings with the sources it lists.
- The money estimate for roommates (about 2.5 zł a month) is the agent's judgement, not a
  measurement.

---

## Verdict

Passflat's problem right now is reach, not choosing between jobs. Google brings about 5–9
clicks a week (Search Console, last 8 weeks: 7, 9, 9, 6, 4, 6, 8, 5). In those 8 weeks there
were 2 `cost_form_started`, 0 submissions and 0 `address_checked` (fact: the readout). At that
volume no test on the website can be read within two weeks.

Judgement:

- **Roommate search** is the clearest single search intent. As a direction it fails, because
  Passflat has no room offers and no way to earn from it. Keep the page and point it at room
  money questions.
- **The deposit flow** is the only job with money at stake, a clear moment and a tool already
  built. The owner already has a channel for it: answering questions in chats, the only thing
  that converted repeatedly in June–July (BRD §7).
- **PRD 2 should stay small:** deposit links that record where people came from, deposit prompts
  on the move-out guides, and a priced "next step" interest button.
- **If the deposit test fails as well,** the honest next step is to shrink Passflat to a content
  and affiliate side project or stop, not to look for a seventh hook.

## The roommate hypothesis

**What the evidence supports**

- **Share of search:** roommate pages got 28 of 116 clicks (24 %), plus 2 for sublet;
  `/warsaw/roommate` alone got 25 clicks from 1,409 impressions at position 8.8. Roommate queries
  account for 12 of the 15 query clicks Search Console shows. Building pages together get more
  (49, or 42 %), spread over 669 pages. Roommates are the top single page and the clearest
  intent, not the majority of demand.
- **Absolute size:** about 1.2 clicks a week.
- **Language:** since 2026-08-01, 27 visits landed on `/roommate`: 16 Polish, 6 English, 4
  Russian, 1 Ukrainian (the agent's PostHog query). This is a Polish job, not the RU/UA audience
  D2 bets on.

**What contradicts it**

- **Visitors do nothing:** 41 roommate or sublet landings since August produced 0 listing views,
  0 contacts and 0 form starts (readout).
- **No room offers:** since 2026-06-01 there was 1 non-test `listing_created`, a replacement
  listing in June, and no roommate listing (the agent's query). Visitors see an empty list.

**Who owns the supply** (fetched 2026-11-18)

- OLX "stancje i pokoje" in Warsaw: "ponad 1000 ogłoszeń".
- Otodom: 432 Warsaw rooms, most with the service charge (czynsz) shown separately.
- Facebook groups of 208k, 130k, 126k and 37k members (`competitors.md`, as of 2026-05).
- Spotahome: about 750 Warsaw flats and rooms (search snippet, unverified).
- No active Polish roommate-matching app found: mRazem and Flatmejt appear only in articles from
  2018 and 2015.
- Room demand peaks around August–September (media.otodom.pl, 2025-08-26).

**Money**

- **Who pays in this market:** landlords pay for listings and boosts (OLX, Otodom). Platforms
  take a booking commission (HousingAnywhere charges landlords 8 %).
- **At Passflat's scale (judgement):** about 5 roommate visits a month × 2 % × 25 zł ≈ 2.5 zł a
  month. Ten times the traffic stays under 50 zł a month.
- **What earning would take:** reversing D5 (listings frozen), building profiles and matching
  (excluded in PRD 1), moderation, and a supply engine against OLX and Facebook groups.
- **Verdict:** the demand is real but tiny, and Passflat cannot convert it, supply it or charge
  for it. Do not reverse D5. Keep the page as a way in and give it a money answer (proposal 4).

## Ranked proposals

All thresholds are the agent's assumptions; prices are the owner's to set.

**P0 (do now, before or inside PRD 1): fix landing capture.** Initialise PostHog before the
first capture; 86 % of visits have no `$pageview` (readout). Check: in the first full week, at
least 90 % of visit sessions have a `$pageview`, compared with `$web_vitals` sessions. Cost:
under half a day. Also confirm the region: the project's `api_host` is `us.i.posthog.com`, while
the code and the privacy policy say EU. Without this fix, E8 and E9 cannot be read.

| #   | Group                               | Job / segment / channel / offer                                                                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                                                                      | Cheapest test and metric                                                                                                                                                                                                                   | Threshold (assumption)                                                                                                | Cost / risk                                                                                                                 |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | **PRD 2**                           | Get a kept deposit back / RU/UA tenants / owner answers existing deposit questions in Telegram chats (20K and 11.6K members) and Facebook groups with `?start=dep_<channel>`, plus prompts on move-out guides / free Polish demand letter with the deadline, then a priced next step (interest only) | Replies in chats were the only channel that converted (BRD §7). Deposit search is about zero: 12 visible impressions. kaucja365.pl is free and in Russian, but its form says document preparation is "not connected yet" (fetched 2026-11-18) | 14 days of active answering. `tg_bot_started` with a deposit payload → `tg_deposit_flow_started` → `tg_deposit_verdict` → `tg_deposit_letter_generated` → `tg_deposit_letter_sent`; `tg_deposit_paid_interest` (new); `tg_lawyer_interest` | Continue at 15 or more cases started, 5 letters and 2 paid-interest taps. Stop the deposit hook below 5 cases started | About 1 day of build and 3–4 owner hours a week. Risks: A14 (legal correctness), December trough, chat admins banning links |
| 2   | Do now                              | Meters, hidden costs and move-in guides / Polish and English tenants / Google page 1 / sharper titles, a deposit prompt, relevant offers                                                                                                                                                             | Meters guide: 809 impressions, 0.9 % CTR, position 6.9. Hidden costs (EN): 806 impressions, 0.4 % CTR                                                                                                                                         | Rewrite titles and snippets, compare 4 weeks in Search Console. `affiliate_link_clicked`; `telegram_bot_opened` with `source=guide`                                                                                                        | CTR at least 2 % on those pages                                                                                       | Half a day of copy. Upside is small: about 25 clicks a year                                                                 |
| 3   | Do now (fix record)                 | E7 affiliate test                                                                                                                                                                                                                                                                                    | The affiliate links sit only in `src/content/blog/bank-account-rent-poland-*.mdx`, not in the handover-protocol guide named in `experiments.md`                                                                                               | Correct E7. Read `affiliate_link_clicked` per guide over 8 weeks                                                                                                                                                                           | At least 5 clicks                                                                                                     | None                                                                                                                        |
| 4   | PRD 1 B copy, or a small PRD 2 item | "I found a room: what will it cost me per person, and is it safe to pay the deposit?" / Polish room seekers / Google / a room cost explainer with checklist, address-check prompt and honest links out to OLX, Otodom and Facebook groups                                                            | `/warsaw/roommate`: 1,409 impressions at position 8.8; 0 useful actions from 41 landings                                                                                                                                                      | Over 8 weeks: roommate `$pageview` → `cost_data_cta_clicked` with `source=roommate_bridge`, `address_checked` with `entry_page_type=roommate`, `telegram_bot_opened`                                                                       | At least 5 useful actions and CTR at least 3 %; otherwise close roommates as a direction                              | Half a day. Risk: no invented room figures; cite dated sources or use only Passflat data at N ≥ 5                           |
| 5   | Later                               | Room-price report from Otodom rooms, labelled as asking prices; fixed subscription with a radca prawny partner (A12); B2B on its trigger (D16)                                                                                                                                                       | Lawyer letters cost 95–500 zł (BRD §5)                                                                                                                                                                                                        | After P1 shows pull                                                                                                                                                                                                                        | n/a                                                                                                                   | Lawyer review needed                                                                                                        |
| 6   | Drop                                | Roommate marketplace (matching, profiles, paid boosts); broadcast posts                                                                                                                                                                                                                              | Analysis above; E3 had 0 form starts; D8                                                                                                                                                                                                      | n/a                                                                                                                                                                                                                                        | n/a                                                                                                                   | n/a                                                                                                                         |

## PRD 2 scope (agent's proposal)

Builds on PRD 1 package D.

- **Deposit links with a source:** `?start=dep_<source>` from a fixed set (`tg`, `fb`,
  `threads`, `web_<slug>`) starts the deposit flow and records the source. Every `tg_deposit_*`
  event carries `entry_source`. Today the bot accepts only an exact `dep` (`bot.ts:220`).
- **Deposit prompts on move-out guides:** meters, handover protocol, deposit, cesja and
  cleaning. The bot speaks only RU/UK, so the prompt goes on RU/UK pages only, or Polish bot copy
  is added (Open: owner). Web event `telegram_bot_opened` with `source=guide_deposit` and
  `guide_slug`, extending PRD 1's values.
- **One "paid next step" button after the letter.** Offer and price are Open (owner). The button
  says the service is not available yet and records `tg_deposit_paid_interest` with `offer` and
  `price_pln`.
- **A 14-day readout:** funnel queries split by `entry_source`.
- **Not in scope:** payments, a lawyer partner, a notifier, the roommate marketplace.
- **Before launch (owner):** the bot in production (four migrations, token, webhook, RLS on the
  new tables) and the A14 lawyer list.

## Money

- **First złoty (judgement):** a paid next step on a deposit case is the most likely source. The
  owner fulfils it by hand at first; the Stripe code already exists, so no new paid service is
  needed.
- **Affiliate:** needs traffic Passflat lacks; at about one relevant click a week, a first
  conversion is months away.
- **A repeatable revenue line** exists only if the deposit test shows pull and the legal checks
  behind A12 pass.

## Risks

Ranked by likelihood times impact, each with its earliest warning sign.

1. **No job pulls people at all.** Warning sign: fewer than 5 deposit cases started after a week
   of answering.
2. **Measurement stays broken.** Warning sign: the `$pageview` share in the first week after the
   deploy.
3. **Legal.** A wrong deposit verdict (A14), or the PostHog US region contradicting the privacy
   policy. Warning sign: the region check.
4. **Season.** December is the low point (Otodom reports a December drop in activity; room
   demand peaks in August–September). A null result now is weaker evidence than one in
   September.
5. **Owner time.** Warning sign: fewer than 3 answering hours a week.

## Proposed status changes (list only; the owner decides)

- **A1:** stays Partly. Replace "about 5 checks a day" with PostHog's 9, 9, 7, 0, 0
  `address_checked` a month from July to November. Building pages bring 49 of 116 clicks.
- **A2:** Contradicted, reinforced: 2 server-side reports from real visitors since 2026-07-01.
- **A4:** Contradicted for search (clicks by page locale: PL 59 %, EN 22 %, RU 14 %, UK 4 %).
  Untested for chats.
- **A5:** Partly. Visitors arrive, but conversion is 0 of 41.
- **A7:** Confirmed for broadcast posts (E3, E2).
- **A8:** Untested. The measurement is broken and there have been 0 checks since 2026-09-14.
- **A11:** Testing, but stalled with no audience; host page corrected (proposal 3).
- **H2:** Testing (E8), with a kill date in mid-January.
- **H3:** Testing (E9); the contribution part is contradicted so far.
- **H4:** Rejected. The decision was due 2026-08-11 and both variants had 0 form starts.
- **H7:** Redesign.
- **E3:** Done, no winner. **E4:** Stopped. **E7:** Stopped and redesign.

## New BRD assumptions (proposed)

- **A18:** Passflat can attract room offers without paid acquisition. Contradicted: 0 roommate
  listings since June.
- **A19:** Tenants with a kept deposit will pay for a done-for-you next step. Untested; measured
  by `tg_deposit_paid_interest`.
- **A20:** Answering existing questions in chats yields at least 3 deposit cases per owner-hour.
  Untested.
- **A21:** On-site tests can be read within two weeks at about 6 clicks a week. Contradicted:
  tests need owner-driven channels or 8-week windows.

## Ask a lawyer

- The deposit rules and the letter (A14).
- Selling a paid send or prepare service around a demand letter.
- The radca subscription model, and the ban on publishing a list of adwokaci (Prawo o
  adwokaturze art. 95p).
- PostHog in the US region, and cookieless analytics on Art. 6(1)(f) (A15).

## Questions for the owner

1. Will you answer deposit questions for 3–4 hours a week for 14 days?
2. When does the bot go to production?
3. Which paid next step do you want to probe, and at what price?
4. Should the bot get a Polish deposit flow?
5. What roommate traffic or supply numbers would make you reverse D5?
6. What is `NEXT_PUBLIC_POSTHOG_HOST` set to in Vercel?
7. If both the deposit and roommate tests fail by mid-January: stop, keep a content and affiliate
   side project, or go to B2B?
8. How much time and budget do you have each week now?

## Sources

OLX Warsaw rooms (https://www.olx.pl/nieruchomosci/stancje-pokoje/warszawa/), Otodom Warsaw
rooms (https://www.otodom.pl/pl/wyniki/wynajem/pokoj/mazowieckie/warszawa/warszawa/warszawa),
Otodom room seasonality, 2025-08-26
(https://media.otodom.pl/pokoj-dla-studenta-coraz-trudniej-o-oferte-do-1000-zl), kaucja365
(https://kaucja365.pl), HousingAnywhere landlord fee
(https://answers.housinganywhere.com/en/articles/2267534-commission-fee-for-landlords), old
roommate-app articles (https://antyweb.pl/mrazem-nowy-serwis-z-pokojami-do-wynajecia,
https://antyweb.pl/flatmejt-pl-wyszukiwarka-najlepszego-wspollokatora-od-gumtree), Spotahome
Warsaw (https://www.spotahome.com/warsaw/for-rent:rooms/863851). All fetched 2026-11-18 by the
agent.
