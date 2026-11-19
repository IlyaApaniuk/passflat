Research for the owner's decision of 2026-11-19; facts as of their fetch dates

# Roommate matching between seekers: fit with Passflat and test design

Written 2026-11-19 against `chore/agent-harness` at `d30508f` (read only; the loop's uncommitted
work was left untouched). The brief gives the decision date as 2026-01-20. That date has already
passed, so this report reads it as **2027-01-20**.

## Verdict

- **Can it be built?** Yes, mostly from parts that already exist: the bot's account-free chat
  identity, its multi-step intake with saved state, the reminder cron that claims each row before
  sending, the district lookup, the room-level cost figures and the roommate page. The build is
  not the risk.
- **The risk is liquidity and the calendar.**
  - Every user is both demand and supply, but a match also needs the same district, a matching
    budget and a close move-in date within a 30-day profile life.
  - Google brings about 1 roommate click a week, and the owner's chat slots are booked for the
    E10 deposit sprint (D36).
  - So by 2027-01-20 only the demand rung can be read, and only from chat posts. Value (mutual
    interest) and money cannot be read by then.
- **Recommendation: two stages.**
  - **Stage 1 (about 14 tasks): a structured waiting list in the bot.** People create a profile,
    see honest counts per district and can ask for one message when browsing opens. Nobody sees
    anyone else yet.
  - **Stage 2 (about 11 tasks): mutual matching.** Built only if Stage 1 passes its threshold.
- **Earlier decisions it reverses.** The direction needs a new decision row first. It reverses:
  - the PRD 1 exclusion "Do not build compatible-roommate matching, separate profiles for people
    who are searching" (`docs/product/prd/prd-1-activation-and-bot.md:30, :102`);
  - proposal 6 of the direction review ("Drop: roommate marketplace").

## 1. What exists and what is missing

| Area                    | What exists (path)                                                                                                                                                                                                                                                                                                                               | Reuse for matching                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity without signup | `TelegramChat` (`prisma/schema.prisma:645`): account-free, `startPayload`, `blockedAt`, `locale` RU/UK                                                                                                                                                                                                                                           | The anchor for a profile: no magic link, no e-mail                                                                                                                        |
| Multi-step intake       | `DepositCase.status/step` + `src/lib/bot/deposit-flow.ts`; `bot.on('message:text')` in `src/lib/bot/bot.ts:574` routes typed text to the address lookup unless an intake is open                                                                                                                                                                 | Copy the pattern for a roommate intake                                                                                                                                    |
| Deep links              | `src/lib/bot/start-payload.ts` (`dep`, `b_`, `d_`, `web_`); PRD 2 FR-2 adds `dep_<source>`                                                                                                                                                                                                                                                       | Add a `mate_<source>` family                                                                                                                                              |
| Push and reminders      | `/api/cron/telegram-followups`, `sendDueFollowUps` (claims each due row before sending, skips blocked chats; bot README "Reminders")                                                                                                                                                                                                             | Renewal reminder, new-match push, outcome follow-up                                                                                                                       |
| Districts               | `District` table, `src/lib/bot/districts.ts` (name matching), `src/lib/geo/warsaw-districts.json`                                                                                                                                                                                                                                                | District buttons and matching                                                                                                                                             |
| Cost figures            | `src/lib/cost-figures.ts` (tenant vs asking groups, N, `MIN_AREA_REPORTS = 5`, rental type `room`); `loadAreaReference({districtId, cityId, rentalType})` in `src/lib/cost-figures-query.ts:167`; bot rendering in `src/lib/bot/format.ts`                                                                                                       | "Rooms in Mokotów: tenants report X (N=…)" next to the budget step. N per district is probably small: check it before promising anything                                  |
| Roommate page           | `src/app/[locale]/[city]/roommate/page.tsx`, `ListingsPageClient`, role selector `src/components/listings/roommate-role-selector.tsx` + `src/lib/roommate-roles.ts` (`find_room`, `offer_room`), `listings-empty-state.tsx` (honest interest copy), bot CTA `src/components/costs/telegram-bot-cta.tsx` + `src/lib/analytics/telegram-events.ts` | Entry point; `/warsaw/roommate` gets 1,409 impressions at position 8.8                                                                                                    |
| Waitlists               | `CityNotifySubscription` (e-mail; roommate city/district classes), `TelegramSubscription` (`b:`, `d:`, `c:`)                                                                                                                                                                                                                                     | Only as a pattern. Existing roommate e-mail rows (likely a handful) were saved under "no automatic notifications". Mailing them about a new feature is a consent question |
| Auth                    | Supabase magic link `src/app/[locale]/auth/actions.ts:179`                                                                                                                                                                                                                                                                                       | Needed only for a web profile variant; not in the MVP                                                                                                                     |
| Chat                    | `Conversation`/`Message`, `/api/conversations`, `/messages`, Realtime                                                                                                                                                                                                                                                                            | **Not reusable as is.** `Conversation.listingId` is required, and a new message e-mails its text to the author through Resend (`api/conversations/route.ts:125`)          |
| Moderation              | `Report` + `/api/reports` (DSA notice; `targetType` = `listing` only; the reporter must be a web `Profile`), `/admin/reports`, `report-button.tsx` reasons                                                                                                                                                                                       | Reason list and the admin queue idea; the table needs a bot-side counterpart                                                                                              |
| Expiry                  | `/api/cron/expire-listings` (roommate listings: 30 days)                                                                                                                                                                                                                                                                                         | Same 30-day profile life                                                                                                                                                  |
| Legal copy              | `termsPage.dsa` (contact point contact@passflat.com, complaints within 6 months, ranking statement), `termsPage.accounts.item1` (18+), `privacy.children` (18+), `privacy.retention`                                                                                                                                                             | Base for a roommate section (draft only; legal text is the owner's)                                                                                                       |
| After a match           | Roommate agreement `docs/legal-templates/umowa-wspollokatorska.md` + EN/RU/UK translations, PDFs in `public/documents/`; checker `/[city]/check`; bot address card; lease reading `src/lib/bot/contract.ts`                                                                                                                                      | "Next steps" for a matched pair                                                                                                                                           |
| Analytics               | `tg_<chatId>` identity never merged with web (`src/lib/bot/analytics.ts`); event tables in `src/lib/bot/README.md` and `docs/analytics/activation-funnels.md`                                                                                                                                                                                    | Naming and the counts-only readout                                                                                                                                        |

**Missing:** a seeker profile model, interest (reaction) records and a compatibility query; the
contact reveal, renewal and deletion; a notifier for newly compatible profiles; bot-side reports
with automatic statements of reasons; a roommate section in the terms and privacy policy; the
`mate_` payloads; a Polish bot locale (`BotLocale = 'ru' | 'uk'`, `src/lib/bot/texts.ts:14`); web
counts per district; readout queries.

## 2. The smallest testable product

### Where it lives: Telegram first

- **The bot already does most of the hard parts.** No signup, a push channel, saved state and
  RU/UK copy. The owner's only push channel is RU/UA chats.
- **The web is for discovery only.** The roommate page shows aggregate counts per district and a
  bot link.
- **Known cost: Polish searchers.** 16 of 27 roommate landings since August were Polish (direction
  review), and the bot does not speak Polish.
  - Stage 1 follows D37: show the CTA on all locales with "the bot speaks Russian and Ukrainian".
  - Add a Polish roommate flow only if Stage 1 passes. Google cannot be read before
    2027-01-20 anyway.

### Profile (Stage 1 and 2)

| Field              | Input                                                                     | Stored as                | Why so coarse                                                                   |
| ------------------ | ------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| Districts          | up to 3 of 18, or "any"                                                   | `districtSlugs String[]` | Needed for matching and counts                                                  |
| Budget per person  | 5 bands (≤1,200 … 2,500+ zł, all-in)                                      | `budgetMin/Max Int`      | Bands, not exact numbers                                                        |
| Move-in            | month buttons (this month … +3)                                           | `moveInMonth Date`       | Also drives expiry                                                              |
| Length of stay     | <6 / 6–12 / 12+ months                                                    | `stayBand`               |                                                                                 |
| Languages          | PL, EN, RU, UK (multi)                                                    | `languages String[]`     | Can stand in for nationality: the person's own choice, never a filter on others |
| Age band, 18+      | 18–24 / 25–34 / 35+, plus an 18+ confirmation                             | `ageBand`                | No birth date                                                                   |
| Live with          | anyone / women / men; own gender optional                                 | `gender`, `prefers`      | Common in Polish ads; legality to confirm (section 3)                           |
| House rules, max 3 | smoking in the flat (no / balcony / ok), pets, guests (quiet / sometimes) | small enums              | Phrased as house rules, not personal health traits                              |
| Text               | ≤ 280 characters                                                          | `about`                  | Links, phone numbers, @handles, e-mails and IBAN-like digit runs are rejected   |
| Name shown         | Telegram `first_name` or typed                                            | `displayName`            | No surname, **no photos**                                                       |

### How people see each other

- **Stage 1: nobody sees anybody.**
  - After saving, the bot replies with honest counts: "7 people with a profile in Warsaw; 2 in
    your districts; browsing opens at 30." The threshold lives in config and is an Assumption.
  - The reply can add the room cost reference from the figure contract, with its group and N.
  - One opt-in button: "Message me once when browsing opens."
  - Profiles are stored, not shown, so they are not yet "disseminated to the public" (DSA
    Art. 3(k)). The DSA platform duties start only in Stage 2.
- **Stage 2: mutual interest, not a public list.**
  - Only people who have a profile can browse (reciprocity: no anonymous harvesting).
  - The bot shows compatible cards one at a time: districts overlap, budget bands overlap, move-in
    within ±1 month, and both gender preferences are met. Each card has "Interested" / "Skip" /
    "Report".
  - Cards come newest first. That order must be stated in the terms, as `termsPage.dsa.ranking`
    already does for listings.
  - A daily push says "N new people fit". It is sent at most once a day, can be switched off, and
    uses the same claim-before-send pattern as the reminders.
  - No profile is ever published on the web. The roommate page shows only per-district counts,
    with no filter combinations, so nobody can be singled out.

### Contact

- **Mutual interest reveals both Telegram usernames** in one message each. The message carries the
  safety lines: "Passflat never asks for money"; "never pay a deposit or 'reservation' before a
  viewing and a signed lease".
- **A username is required before browsing.** `username` is optional in the Bot API User object.
  A `tg://user?id=` mention is only guaranteed to work when the user has messaged the bot before,
  and is not a reliable contact route.
- **What it does not use.** No relay chat and no e-mail. The existing web chat would need
  `Conversation.listingId` to become optional and would e-mail message text: leave it out.

### Expiry and deletion

- **Expiry.** A profile is hidden at the earlier of 30 days after creation or renewal and the end of
  its move-in month.
- **Renewal.** One renewal reminder goes out 3 days before. A hidden profile is deleted 30 days
  later.
- **Deletion on request.** "Delete my profile" deletes at once, with its reactions.
- **Reports** are kept 6 months, matching the complaint window the terms already promise.

### Migrations and tables

- **One production migration**, after the four bot migrations (D29), so the owner approves it once.
  It creates:
  - `roommate_profiles`, with a foreign key to `telegram_chats`;
  - `roommate_reactions` (from, to, kind `interest | skip`, `matched_at`; unique pair; Stage 2);
  - `roommate_reports` (reporter profile, target profile, reason, decision, timestamps; Stage 2);
  - a nullable `roommate_banned_at` on `telegram_chats`.
- **RLS:** the owner switches it on by hand for `roommate_profiles`, `roommate_reactions` and
  `roommate_reports` (D9).

## 3. Privacy, safety and law without staff

### RODO (GDPR)

- **Data minimisation and storage limitation** (Art. 5(1)(c), (e)) are why the profile uses bands,
  no photos, no birth date, a short text and a 30-day life.
- **Special categories (Art. 9(1))** include data revealing ethnic origin, religion, health, sex
  life or sexual orientation.
  - No religion, diet or "LGBT-friendly" flags.
  - Smoking is phrased as a rule about the flat.
  - The free text is the person's own choice; the copy says not to put sensitive facts in it.
- **Age.** Poland kept the 16-year threshold of Art. 8. Passflat's terms already require 18+, and
  the 18+ age band and confirmation enforce it cheaply.
- **Telegram's developer terms** require a bot privacy policy (§4), collecting only what is
  essential (§4.3), and moderation of user content by the developer (§5.1).
- **Analytics** carries no personal data:
  - bot events keep the existing `tg_<chatId>` identity;
  - properties are only bands, counts and booleans;
  - no text, name, username, partner id or match id, because a shared match id would put a social
    graph into PostHog;
  - matches are counted in the database, with counts only.

### DSA

- **Passflat is a micro enterprise** (under 10 staff, ≤ €2M turnover). Art. 19 therefore removes
  the platform section (Art. 20–28: internal complaint system, misuse measures, transparency
  reports, minors' design duties), except Art. 24(3).
- **Duties that remain for any hosting service:**
  - points of contact (Art. 11, 12; not solely automated tools);
  - terms that describe content moderation, including algorithmic decisions and human review
    (Art. 14);
  - notice and action (Art. 16);
  - statement of reasons (Art. 17);
  - reporting threats to life or safety to the police (Art. 18).
- **Poland:** the President of UKE has acted as Digital Services Coordinator since 6 November 2026.
  Users can complain to UKE when a provider gives no reasons or no redress.

What can be automated:

| Duty                              | Automated in the bot                                                                                                                                                                 | Owner's part                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Art. 16 notice, receipt, decision | A "Report" button on every card (scam, fake, offensive, minor, other); the bot confirms receipt and later tells the reporter the decision, saying when it was automated (Art. 16(6)) | contact@passflat.com for non-users (already in the terms)        |
| Rule                              | Hide on 2 distinct reporters, or 1 report with reason `minor`; a hidden chat cannot create a new profile                                                                             | A weekly 10-minute review of hidden profiles (SQL or admin view) |
| Art. 17 statement of reasons      | A templated message to the hidden profile: what was restricted, facts, "automated: yes", terms ground, redress (reply, e-mail, UKE, court)                                           | Answers the rare complaint                                       |
| Art. 18                           | Not automatable                                                                                                                                                                      | Informs the police if a report suggests a threat to safety       |
| Art. 14 terms                     | Draft keys in four locales                                                                                                                                                           | Owner and lawyer approve                                         |

### Scams, fake profiles, minors

Typical Polish rental scams: money for a "reservation" before a viewing, contact moved off the
platform, newly created accounts, copied photos, prices that are too good. UOKiK also warned about paying intermediaries for landlord contact details. Cheap mitigations
that need no staff:

- **No money passes through Passflat.** The safety copy goes at the reveal.
- **Seekers only.** Nobody "has a room to reserve". A "my half of the reservation" pitch is still
  possible, and the reveal copy names it.
- **Text filter:** no links, phone numbers, handles, e-mails or IBANs.
- **Limits:** one profile per chat, 20 interests a day, a username required, reciprocity before
  browsing.
- **Automatic hiding** on reports, and a ban on re-creating a profile after a moderation hide.
- **18+ band and confirmation;** the `minor` reason hides at once.
- **No nationality or religion fields.** Languages are self-described only.

### Honesty rules (`CLAUDE.md`)

- Counts are real counts of active profiles.
- Never "verified profiles", and no invented match rates.
- Room costs only through the figure contract, with group and N; any percentage only at N ≥ 5.
- The bot promises nothing it does not send. This includes the "message me when browsing opens"
  sender, which must exist before launch. The rule is in the bot README "Promises and
  capabilities", enforced by `texts.test.ts`.

### Ask a lawyer

1. The legal basis per field: Art. 6(1)(b) or consent.
2. Whether smoking or other house rules touch Art. 9.
3. Whether a women-only or men-only preference is lawful (Polish equal-treatment law; private
   housing context).
4. Whether the bot button plus e-mail meets Art. 16 for non-users; the Art. 17 template; the Art. 14
   terms text.
5. The privacy policy update: Telegram as a channel, other users as recipients, retention. Also
   whether a DPIA is needed under the UODO list (M.P. 2019 poz. 666).
6. Whether the roommate rows in `city_notify_subscriptions` may be told about the feature.

## 4. Test design

### Ladder

Persons are counted as `tg_<chatId>` whose first `tg_bot_started` with a payload starting `mate`
is on or after launch day (the E10 cohort rule, D37). Thresholds are **Assumptions**.

| Rung                  | Question                                                          | Metric                                                                                                                                                                                    | Readable by 2027-01-20?                                                                                                               |
| --------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| D1 chats              | Do chat posts produce profiles at a rate one founder can sustain? | Persons with `tg_roommate_profile_created` by `entry_source`; profiles per owner-hour (the owner logs minutes per link source)                                                            | Yes, in 3–4 weeks                                                                                                                     |
| D2 Google             | Do roommate searchers create profiles?                            | `telegram_bot_opened` with `source=roommate` → `tg_bot_started` `mate_web` → `tg_roommate_profile_created`                                                                                | No: about 1.1 clicks a week (25 clicks / 1,409 impressions in 24 weeks); at 30 % bot opens × 50 % completion, 1–2 profiles by January |
| D3 density            | Is there enough overlap to match?                                 | Database: active profiles per district; share of profiles with ≥ 1 compatible profile                                                                                                     | Partly                                                                                                                                |
| V1 interest (Stage 2) | Do people act on cards?                                           | `tg_roommate_interest_sent` per browsing person                                                                                                                                           | No                                                                                                                                    |
| V2 contact            | Does it produce contacts?                                         | Mutual pairs in the database; `tg_roommate_contact_revealed`                                                                                                                              | No                                                                                                                                    |
| V3 outcome            | Did people end up renting together?                               | `tg_roommate_outcome` (`renting_together` / `talking` / `no_fit`), asked 21 days after a match like `tg_deposit_outcome`                                                                  | No                                                                                                                                    |
| M1 money              | Is anything payable without staff?                                | `tg_roommate_next_step` (`agreement`, `address_check`, `cost`); affiliate clicks; a paid lease-check fake door only if the owner sets a price (D34 set the opposite for the deposit flow) | No                                                                                                                                    |

**Why these thresholds** (an Assumption, not data):

- With a 30-day life, active profiles ≈ 4.3 × profiles created per week.
- If about 15 % of random pairs are compatible (district × budget × move-in), a new profile sees
  2 or more compatible people only when about 15–20 profiles are active.
- That needs 4–5 new profiles a week, sustained. At the owner's ~7 posting hours a week, this is
  roughly one profile per owner-hour.

### Event names (existing conventions)

**Bot.** The `tg_` prefix, past tense, sent through `track`; listed in `src/lib/bot/README.md`
"Events":

- `tg_bot_started` with payload `mate_tg | mate_fb | mate_web` (new payload values);
- `tg_roommate_flow_started` with `entry_source`;
- `tg_roommate_profile_created` with `district_count`, `budget_band`, `move_in_offset_months`,
  `stay_band`, `language_count`, `rule_count`, `has_text`, `entry_source`;
- `tg_roommate_profile_renewed`;
- `tg_roommate_profile_deleted` with `reason`: `user`, `expired` or `moderation`;
- `tg_roommate_browse_opted_in`;
- Stage 2: `tg_roommate_cards_viewed` (`results_band`), `tg_roommate_interest_sent`,
  `tg_roommate_matched`, `tg_roommate_contact_revealed`, `tg_roommate_reported` (`reason`),
  `tg_roommate_outcome` (`outcome`), `tg_roommate_next_step` (`step`).

**Web.** Existing events, new values only:

- `roommate_intent_selected` with `intent=find_flatmate`;
- `telegram_bot_opened` with `source=roommate`, a new value of `TelegramBotSource`.

Every new event or value goes into `docs/analytics/activation-funnels.md`.

### Timeline, seasonality, kill criteria

- **Order of events:**
  1. The PRD 1 deploy is E10 day 0, and E10 uses the owner's two daily slots for 14 days (D36).
  2. Launching after E10 day 14 keeps E10's per-hour readout clean, so Stage 1 opens in mid-December
     at the earliest.
  3. That leaves about 5 weeks to the 2027-01-18 readout, with the December low and the holidays
     inside them.
  4. Reply to "ищу соседа / szukam współlokatora" posts (demand capture) rather than broadcast.
     Broadcast already failed (E2, E3).
- **Seasonality:**
  - Room demand peaks in August–September (Otodom, 2025-08-26).
  - The summer-semester wave comes in February. The University of Warsaw's summer semester began
    on 16 February 2026; the 2026/27 date was not found, and the brief says late February.
  - A null result in January is weak evidence. A pass in January is strong evidence.

**Stage 1 thresholds at the 2027-01-18 readout:**

- **Stop:** any of these:
  - fewer than 15 profiles in total;
  - fewer than 1 profile per owner-hour of posting;
  - more than 30 minutes a week of manual handling (support, moderation);
  - a safety incident that needs the owner personally more than once.
- **Go to Stage 2:** all of these:
  - at least 30 profiles;
  - at least 20 active on 18 January;
  - at least 3 districts with at least 3 active profiles each;
  - at least 1.5 profiles per owner-hour.
- **In between:** extend once to 2027-02-28.

**Stage 2 thresholds** (opens before the February wave, readout about 2027-03-31):

- **Continue:** at least 10 mutual pairs and at least 3 `renting_together` or `talking` outcomes.
- **Stop:** no pair with at least 30 browsing profiles.

**Money:** no money rung can be read before the decision.

- The direction review estimates about 2.5 zł a month for roommates. That is the agent's
  judgement, not a measurement.
- Paid contact reveal or boosts would undercut the safety rules: they resemble the
  paid-contact-details pattern UOKiK warned about, and they would contradict the ranking
  statement in the terms.

## 5. Size

These are loop tasks of the PRD 1 size (PRD 1 had 58).

- **Stage 1, about 14 tasks:** migration and models; store and tests; `mate_` payloads; intake in
  3 tasks (districts, budget and dates; languages, rules, age and preference; text filter);
  profile view, edit and delete with the help and menu text; counts reply and room reference;
  expiry and renewal cron; opt-in and the one-time sender; web counts block with events; events
  and docs; draft terms and privacy keys; final check.
- **Stage 2, about 11 tasks:** compatibility query; cards; reveal; daily push; report and
  auto-hide; statement of reasons, ban and review view; outcome follow-up; next-step buttons;
  events and docs; terms update; final check.
- **A Polish bot flow** adds about 2 tasks.
- **Owner work:** one migration approval, RLS on three tables, a deploy, BotFather menu, copy
  review in RU/UK, lawyer questions, posting time.

**What can be cut from Stage 1 (down to about 9 tasks):**

- the room cost reference;
- the web counts block (keep a plain bot link);
- two of the three house rules;
- the renewal reminder (plain expiry).

The 18+ gate, the text filter, the delete button, expiry and the honest counts should not be cut.

**Do not build:** web profiles, photos, the web chat, payments, a Polish locale before Stage 1
passes.

## Sources

Fetched 2026-11-19 unless noted.

- DSA text (Art. 11–19, 23, 24, 28; recitals 13–14): https://dsa.kemitchell.com/ (mirror of
  Regulation (EU) 2022/2065; EUR-Lex returned an empty page to the fetcher).
- SME thresholds (Recommendation 2003/361/EC):
  https://single-market-economy.ec.europa.eu/smes/sme-fundamentals/sme-definition_en
- UKE as Digital Services Coordinator from 2026-11-06 (article of 2026-11-06):
  https://android.com.pl/tech/1102857-internet-dsa-uke-skarga-facebook/
- Veto of 2026-01-09 and the government drafts (search summary, secondary media):
  https://www.gov.pl/web/cyfryzacja/silniejsza-ochrona-uzytkownikow-internetu---rzad-przyjal-dwa-projekty-ustaw-wdrazajace-dsa
- GDPR Art. 5: https://gdpr-info.eu/art-5-gdpr/
- GDPR Art. 9: https://gdpr-info.eu/art-9-gdpr/
- Poland's Art. 8 threshold of 16 (search summary): https://gdpr-text.com/pl/read/article-8/
- UODO DPIA list, M.P. 2019 poz. 666: https://eli.gov.pl/api/acts/MP/2019/666/text/O/M20190666.pdf
- Telegram Bot Platform Developer Terms: https://telegram.org/tos/bot-developers
- Bot API User object: https://core.telegram.org/bots/api#user
- Mention caveat: https://grammy.dev/ref/types/parsemode
- Rental scam signs (Bankier, 2019-07-22):
  https://www.bankier.pl/wiadomosc/Tak-wygladaja-falszywe-oferty-wynajmu-na-OLX-7710716.html
- UOKiK on paid contact details (2018-10-16):
  https://superbiz.se.pl/wiadomosci/uwaga-na-oszustow-na-rynku-nieruchomosci-uokik-ostrzega-aa-RBsb-dRPG-KhAV.html
- UW calendar 2025/26 (search summary):
  https://opinieouczelniach.pl/uczelnia/uniwersytet-warszawski/kalendarz-akademicki/
- Repository: `docs/product/reviews/2026-11-18-metrics.md`, `…-direction-review.md` (room
  seasonality, Otodom 2025-08-26), `docs/research/competitors.md` (Facebook groups of 208k/130k/126k
  members; Telegram chats of 20K/11.6K).
