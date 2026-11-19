# PRD 2: Deposit sprint — source-tagged deposit links, guide prompts and the sprint readout

- **Version:** 0.2, 2026-11-19
- **Status:** Decided, 2026-11-19 (the owner answered all 12 decisions of
  `prd-2-decision-review.md`: D22, D29, D30, D34 – D37)
- **Serves:** H9 through E10 (the main test); H11 through E12 (the guide prompt only). The
  landing-capture fix that was FR-1 moved into PRD 1 (FR-13, task T002, D22).
- **BRD assumptions:** A3, A4, A6, A12, A14, A15; proposed new A20 (in
  `prd-2-decision-review.md`, not in the registry yet). Proposed A19 (willingness to pay for a
  done-for-you step) is no longer tested here (D34).
- **Builds on:** PRD 1 (`prd-1-activation-and-bot.md`): package A (`telegram_bot_opened`,
  page context, landing capture FR-13), package D (deep-link handoff, honest promises, bot
  analytics). PRD 2 starts after PRD 1's tasks; it does not repeat them.
- **Source:** written by Claude in the night run of 2026-11-18/19 (D21) from
  `../reviews/2026-11-18-metrics.md` and `../reviews/2026-11-18-direction-review.md`; version 0.2
  applies the owner's decisions of 2026-11-19. Every **Decided** mark points to a decision.

## 1. The test

**Question.** Will tenants whose landlord keeps their deposit start the bot's deposit flow when
the owner answers their questions in RU/UA chats, get as far as a letter, and will some of them
ask for a lawyer (`wants_lawyer`)?

**Why this test first** (facts from the readout and the review):

- Search brings about 5–9 clicks a week and almost no deposit demand (12 visible deposit-query
  impressions in 12 months); no on-site test can be read in two weeks at that volume.
- Replies under other people's posts were the only channel that converted repeatedly in
  June–July (BRD §7).
- The deposit flow is built (D17) and its events are server-side, so they are not affected by
  the web capture loss found on 2026-11-18.
- Money: a lawyer's demand letter costs 95–500 zł (BRD §5). There is no paid next step in
  PRD 2 (D34): `tg_lawyer_interest` (the `wants_lawyer` button) is the only money-interest
  signal. The owner named 79 zł as an indicative price for a possible future paid step; it is
  not a live price, and nothing is built for it.

**Metric (E10).** Persons (`tg_<chatId>`) whose first `tg_bot_started` is on or after day 0
(D37), days 1–14 after day 0:

1. `tg_bot_started` with `payload` starting `dep`, by suffix;
2. `tg_deposit_flow_started`, by `entry_source` (FR-2);
3. `tg_deposit_verdict` → `tg_deposit_letter_generated` → `tg_deposit_letter_sent`;
4. `tg_lawyer_interest` (existing), the money-interest signal;
5. web: `telegram_bot_opened` with `source=guide_deposit`, by `guide_slug` (FR-3).

**Threshold — Decided** (D36): continue at ≥ 15 persons with `tg_deposit_flow_started` and ≥ 5
with `tg_deposit_letter_generated` in 14 days; stop the deposit hook below 5 started; anything
between extends the sprint once by 14 days. There is no paid-interest threshold.

**Dates — Decided** (D29, D36). Day 0 is the date of the PRD 1 deploy, with which the bot goes
to production (the owner applies the four migrations one by one, switches RLS on, sets the
token and the webhook) and the owner starts answering. PRD 2 is built on the same branch, so it
ships in that deploy; if a part is not live on day 0, the readout says which. Readout on day 15.

**Owner time — Decided** (D36): 3–4 hours a week for 14 days, in two 30-minute slots a day in
the two largest RU/UA chats (20K and 11.6K members, `../research/competitors.md`) and Facebook
groups. Two 30-minute slots every day add up to about 7 hours a week, more than the 3–4 hours
committed; the readout records the hours actually spent and the slots actually used.

**Legal risk — Decided** (D35): E10 starts before the Polish lawyer review of the deposit rules
and letter (A14, BRD §13). The prompt and invitation copy (FR-3, FR-5) does not name the
statutory deadline and says only that the bot prepares a letter in Polish; the owner sends the
scenario list (`docs/legal-review/deposit-scenarios.md`) to a Polish lawyer in parallel. The
bot's own texts are PRD 1's (D26, D27).

## 2. Milestones

| Milestone | What                                   | Requirements                           |
| --------- | -------------------------------------- | -------------------------------------- |
| M1        | —                                      | FR-1 moved to PRD 1 (FR-13, T002, D22) |
| M2        | Deposit links that record their source | FR-2                                   |
| M3        | Deposit prompt on move-out guides      | FR-3                                   |
| M4        | —                                      | FR-4 removed (D34)                     |
| M5        | Readout and the owner's reply kit      | FR-5, FR-6                             |

## 3. Requirements

```text
FR-1. Moved to PRD 1 (version 0.2, D22)
The landing-capture fix is PRD 1 FR-13. Its criteria are in
docs/specs/01-analytics-context.md §Landing capture; task T002. The id FR-1 is not reused.
```

```text
FR-2. Deposit deep links carry a source
Milestone: M2 · Priority: Must · Status: Assumption (the source set)
Who and when: a Telegram user opens https://t.me/<bot>?start=dep_<source>[_<detail>]
Result: the deposit flow starts exactly as for `dep`, and the source is recorded on
  `tg_deposit_flow_started`
Acceptance criteria:
  1. Given payload `dep`, when /start runs, then the deposit flow starts as today
     (src/lib/bot/bot.ts:220) and `tg_deposit_flow_started` has `entry_source=direct`.
  2. Given `dep_tg`, `dep_fb`, `dep_threads` or `dep_ig`, then the flow starts with
     `entry_source` `tg`, `fb`, `threads` or `ig`.
  3. Given `dep_web_<key>` where <key> is in the FR-3 guide list, then `entry_source=web` and
     `entry_detail=<key>`.
  4. Given any other payload starting `dep_` (for example `dep_abc`, `dep_web_unknown`), then the
     flow starts with `entry_source=other` and no `entry_detail`; no error is shown.
  5. Given the flow started from the /deposit command button (`dep:start`), then
     `entry_source=bot_menu`.
  6. Payloads `b_<uuid>`, `d_<slug>`, `web_checker`, `web_empty` and an empty payload behave as
     PRD 1 package D leaves them.
  7. `tg_bot_started` keeps the raw `payload` (bot.ts:217). Parsing is a pure function with
     unit tests for every row above.
  8. `src/lib/bot/README.md` lists the `dep_<source>` formats.
Edge cases: a value Telegram cannot produce (over 64 characters, characters outside
  [A-Za-z0-9_-]) → `other`; a user with a case in progress who opens a `dep_` link again →
  existing `startDepositFlow` behaviour, unchanged and documented; a returning chat →
  `TelegramChat.startPayload` stays first-touch (src/lib/bot/store.ts:43–45)
Data: none new. The per-case source is not stored in the database (Assumption; a column
  would need a production migration, D18)
Analytics: `tg_deposit_flow_started` gains `entry_source` (`direct|tg|fb|threads|ig|web|
  bot_menu|other`) and `entry_detail` (a guide key or absent)
Screen: no design; src/lib/bot/bot.ts, src/lib/bot/deposit-flow.ts
Copy: none
Depends on: PRD 1 package D (deep links); D14, D17
Open questions: none
```

```text
FR-3. Deposit prompt on move-out guides
Milestone: M3 · Priority: Should · Status: Assumption (guide list, placement); Decided: all four
  locales (D37), copy without a statutory deadline (D35)
Who and when: a visitor reads one of these guides:
  rental-deposit-kaucja-warsaw (key `kaucja`), protokol-zdawczo-odbiorczy-warsaw (`protokol`),
  move-out-cleaning-warsaw (`cleaning`), przepisanie-licznikow-najem (`liczniki`),
  doplaty-rozliczenie-warsaw (`doplaty`)
Result: one block after the article body shows the prompt and a button to
  https://t.me/<NEXT_PUBLIC_TELEGRAM_BOT_USERNAME>?start=dep_web_<key>
Acceptance criteria:
  1. Given the RU or UK version of a listed guide and the bot username set, then the block
     renders with RU or UK copy and the link ends `?start=dep_web_<key>`.
  2. Given a guide not in the list, then no block renders.
  3. Given NEXT_PUBLIC_TELEGRAM_BOT_USERNAME unset, then no block renders (as TelegramBotCta).
  4. Given a click, then one `telegram_bot_opened` is captured with `source=guide_deposit`,
     `guide_slug=<key>` and PRD 1's page context, and the link opens in a new tab.
  5. Given the PL or EN version of a listed guide, then the block renders with PL or EN copy
     that includes the line "the bot speaks Russian and Ukrainian" (D37).
  6. No locale's copy names a statutory deadline or a number of days (D35); each says the bot
     prepares a letter in Polish.
  7. Copy keys exist in all four files of src/i18n/messages/ with identical key sets.
Edge cases: JavaScript off → the plain link works without the event; SDK blocked → the link
  works; repeated clicks → one event per click
Data: none
Analytics: `telegram_bot_opened` (PRD 1) with the new `source` value `guide_deposit` and the
  property `guide_slug`
Screen: src/app/[locale]/blog/[slug]/client.tsx (BlogArticle); reuse or extend
  src/components/costs/telegram-bot-cta.tsx, agent's choice
Copy: drafts in §7, for the owner's review before deploy (D29)
Depends on: FR-2; PRD 1 package A (`telegram_bot_opened`)
Open questions: none
```

```text
FR-4. Removed in version 0.2 (D34)
There is no paid next step in PRD 2: no paid-probe button, no `tg_deposit_paid_interest` event
and no `claim_band`. `wants_lawyer` (`tg_lawyer_interest`) stays the only money-interest
signal. The id FR-4 is not reused.
```

```text
FR-5. Reply kit for the owner
Milestone: M5 · Priority: Could · Status: Assumption
Who and when: the owner, answering deposit questions in chats during the sprint
Result: docs/marketing/deposit-replies.md holds 4–6 short reply templates in Russian and
  Ukrainian, each with one tagged link (`dep_tg`, `dep_fb`, `dep_threads`, `dep_ig`)
Acceptance criteria:
  1. Every template contains exactly one link with a source from FR-2.
  2. No template promises an outcome, names a statutory deadline or a number of days (D35) or
     calls the bot legal help; each says the bot prepares a letter in Polish and is not a lawyer.
  3. The file starts with "Draft for the owner" and a note to respect each chat's link rules.
Edge cases: a chat that bans links → a template without a link that names the bot by username
Data: none · Analytics: none · Screen: none
Copy: agent draft in RU/UK (docs/marketing/ is audience-language content, CLAUDE.md)
Depends on: FR-2
Open questions: none
```

```text
FR-6. Sprint readout instructions
Milestone: M5 · Priority: Must · Status: Decided (day 0, thresholds, cohort: D36, D37);
  Assumption (query shape)
Who and when: the owner or a Claude session with the PostHog MCP, on day 15
Result: a "Deposit sprint (E10)" section in docs/analytics/activation-funnels.md (PRD 1
  package E)
Acceptance criteria:
  1. It gives HogQL for: persons with `tg_bot_started` by payload prefix; the funnel
     `tg_deposit_flow_started` → `tg_deposit_verdict` → `tg_deposit_letter_generated` →
     `tg_deposit_letter_sent` with a 14-day window, broken down by step 1's `entry_source`;
     persons with `tg_lawyer_interest`; `telegram_bot_opened` with `source=guide_deposit` by
     `guide_slug`.
  2. Every bot query counts only persons whose first `tg_bot_started` is on or after day 0
     (D37); the owner tests only on the dev bot, which runs without a PostHog key.
  3. It gives a read-only SQL count of `deposit_cases` created between day 1 and day 14.
  4. It defines day 0 and the E10 thresholds (D36), says that the PostHog project is the EU
     project from the move date (D30), and that E10 traffic also counts toward the D14 / E5
     thresholds of the bot launch.
  5. It reproduces the worked example of §5.
Edge cases: no events at all → the readout says "no data", not 0 %
Data: none · Analytics: none · Screen: none · Copy: none
Depends on: FR-2, FR-3; PRD 1 package E
Open questions: none
Note: the loop never queries PostHog (CLAUDE.md); the queries are checked by reading only
```

## 4. Analytics events

| Event                                                                                                                                            | Where              | New or changed | Properties                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | -------------- | -------------------------------------------------------- |
| `tg_bot_started`                                                                                                                                 | bot                | unchanged      | `payload`, `is_new`                                      |
| `tg_deposit_flow_started`                                                                                                                        | bot                | Changed (FR-2) | + `entry_source`, `entry_detail`                         |
| `tg_deposit_verdict`, `tg_deposit_contract`, `tg_deposit_letter_generated`, `tg_deposit_letter_sent`, `tg_deposit_outcome`, `tg_lawyer_interest` | bot                | unchanged      | unchanged                                                |
| `telegram_bot_opened`                                                                                                                            | web, listed guides | Changed (FR-3) | PRD 1 properties; `source=guide_deposit`; + `guide_slug` |

No event carries an e-mail, free text, contract contents, names, addresses or a chat ID
(CLAUDE.md). Bot events stay under `tg_<chatId>` and are never joined to web identities. The
landing `$pageview` and mount-time events are fixed by PRD 1 FR-13.

## 5. Worked example (readout)

Events in days 1–14 (persons are bot identities):

| Person | Events                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1     | `tg_bot_started` payload `dep_tg` (first ever, day 2); `tg_deposit_flow_started` `entry_source=tg`; verdict; letter generated; `tg_lawyer_interest` × 2 |
| P2     | `tg_bot_started` payload `dep_fb` (day 3); `tg_deposit_flow_started` `entry_source=fb`; verdict                                                         |
| P3     | first `tg_bot_started` on day 1; `/deposit` button; `tg_deposit_flow_started` `entry_source=bot_menu`; verdict; letter generated; letter sent           |
| P4     | `tg_bot_started` payload `dep_web_kaucja` (day 5); `tg_deposit_flow_started` `entry_source=web`, `entry_detail=kaucja`                                  |
| P5     | `tg_bot_started` payload `dep_xyz` (day 6); `tg_deposit_flow_started` `entry_source=other`                                                              |
| P6     | first `tg_bot_started` one day before day 0 (the owner's check); on day 4 `tg_deposit_flow_started` `entry_source=direct`; verdict                      |

Expected readout: P6 is excluded (first `tg_bot_started` before day 0). Started 5 (tg 1, fb 1,
bot_menu 1, web 1 with kaucja 1, other 1); verdict 3; letter generated 2; letter sent 1;
lawyer-interest persons 1 (2 events). Against the thresholds (continue at 15 started and 5
letters; stop below 5 started) the verdict is "extend once": 5 started is not below the stop
level, and both continue counts are missed.

## 6. Edge cases across the PRD

- **Nobody answers:** a user who never answers the flow's questions stays at
  `tg_deposit_flow_started`; existing follow-ups are not extended.
- **Owner's own chats:** the owner tests only on the dev bot (no PostHog key), and the cohort
  rule of FR-6 drops chats that started before day 0 (D37).
- **Seasonality:** December is a low month for moves (review, Otodom); a null result is weaker
  evidence than in August–September and the readout says so.
- **Chat moderation:** a removed reply or a ban is recorded by the owner in the readout as a
  channel fact, not as user behaviour.
- **Bot launch thresholds:** E10 runs inside the bot's first 30 production days, so E10 traffic
  also counts toward D14 / E5; both readouts say so.

## 7. Key copy (drafts for the owner's review)

The owner reviews all draft copy before deploy (D29). Following D35, no prompt or invitation
names a statutory deadline. "Not legal advice" stays as a disclaimer.

**Guide prompt (FR-3)**

- RU — title: «Хозяин не возвращает залог?» Text: «Бот Passflat в Telegram задаст 5 вопросов и
  подготовит письмо-требование хозяину (wezwanie do zapłaty) на польском. Бесплатно. Это не
  юридическая консультация.» Button: «Открыть бота в Telegram».
- UK — title: «Орендодавець не повертає заставу?» Text: «Бот Passflat у Telegram поставить 5
  запитань і підготує лист-вимогу орендодавцю (wezwanie do zapłaty) польською. Безкоштовно. Це
  не юридична консультація.» Button: «Відкрити бота в Telegram».
- PL — title: «Wynajmujący nie oddaje kaucji?» Text: «Bot Passflat w Telegramie zada 5 pytań i
  przygotuje wezwanie do zapłaty po polsku. Za darmo. Bot odpowiada po rosyjsku i ukraińsku. To
  nie jest porada prawna.» Button: «Otwórz bota w Telegramie».
- EN — title: "Landlord keeping your deposit?" Text: "The Passflat bot on Telegram asks 5
  questions and drafts a demand letter (wezwanie do zapłaty) in Polish. Free. The bot speaks
  Russian and Ukrainian. Not legal advice." Button: "Open the bot in Telegram".

## 8. Not in scope

- Any paid next step, price, payment, Stripe change or invoice (D34; 79 zł is an indicative
  price for a possible later step, not a live one). D7 stays.
- A lawyer partner, lawyer directory or referral (BRD §6 constraints).
- Changes to the deposit rules, the verdict logic or the letter text (A14); the bot's wording
  for unread contracts and `wants_lawyer` is PRD 1's (D26, D27).
- A Polish or English deposit flow in the bot (D37).
- The landing-capture fix (moved to PRD 1, D22).
- Notifications, a notifier or new mailings (PRD 1 package D removes such promises).
- The roommate page change (E11) and guide title rewrites (E12): separate small items.
- Listings, matching and tenant replacement (frozen, D5, Decided).
- New database tables or columns, production migrations (D18, Decided), RLS (D9).
- The bot's production launch, webhook registration and any real message (owner only, D29).
- Changes to the consent model or analytics identity (D10, Decided).

## 9. Open questions

None. All questions of version 0.1 were answered on 2026-11-19:

| ID   | Question (0.1)                                   | Answer                                                                      |
| ---- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| Q-1  | Which paid next step, at what price?             | None in PRD 2; 79 zł indicative only (D34)                                  |
| Q-2  | Guide prompt on Polish and English pages?        | Yes, with "the bot speaks Russian and Ukrainian" (D37)                      |
| Q-3  | A Polish deposit flow later?                     | Not now (D37)                                                               |
| Q-4  | Start E10 before the lawyer review; prompt copy? | Yes, with copy that names no statutory deadline; review in parallel (D35)   |
| Q-5  | Move FR-1 into PRD 1?                            | Yes (D22)                                                                   |
| Q-6  | PostHog region?                                  | Move to a new EU Cloud project with the PRD 1 deploy (D30)                  |
| Q-7  | Owner time 3–4 hours a week for 14 days?         | Yes, two 30-minute slots a day in the two largest chats and FB groups (D36) |
| Q-8  | When does the bot go to production?              | With the PRD 1 deploy; that date is day 0 (D29, D36)                        |
| Q-9  | E10 thresholds?                                  | ≥ 15 started and ≥ 5 letters to continue; stop below 5; extend once (D36)   |
| Q-10 | Does E10 replace E6?                             | E6 is Stopped "replaced by E10" when E10 starts (D37)                       |

## 10. Size

About 8 tasks: M2 3 (parser and tests, event property, README), M3 3 (component, four
locales, event test), M5 2 (reply kit, readout section). Small tasks of 2–5 minutes and one
bot-flow task of 10–30 minutes: roughly 2–3 hours of loop time, after PRD 1.

## What changed

- **0.1, 2026-11-19.** First draft by Claude in the night run, from the 2026-11-18 readout and
  direction review. Not yet reviewed by the owner.
- **0.2, 2026-11-19.** The owner's decisions applied. FR-1 moved to PRD 1 as FR-13 (D22). FR-4
  and its event `tg_deposit_paid_interest` and `claim_band` removed: no paid next step;
  `wants_lawyer` is the only money-interest signal; 79 zł noted as an indicative future price
  (D34). Prompt and reply copy names no statutory deadline; E10 starts before the lawyer review
  (D35). Day 0 = the PRD 1 deploy with the bot launch (D29, D36). Owner time and E10 thresholds
  set, without a paid-interest threshold (D36). Guide prompt in all four locales; readouts count
  chats whose first `tg_bot_started` is on or after day 0; E6 replaced by E10 when it starts;
  no Polish deposit flow (D37). PostHog moves to an EU project (D30). Status Decided. Size about
  8 tasks instead of 12–14.
