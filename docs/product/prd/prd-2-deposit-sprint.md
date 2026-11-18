# PRD 2: Deposit sprint — source-tagged deposit links, guide prompts and a paid next-step probe

- **Version:** 0.1 (draft), 2026-11-19
- **Status:** Draft
- **Serves:** H9 through E10 (the main test); H11 through E12 (the guide prompt only); FR-1 is
  the measurement prerequisite for E8, E9 and E11.
- **BRD assumptions:** A3, A4, A6, A12, A14, A15; proposed new A19 and A20 (in
  `prd-2-decision-review.md`, not in the registry yet).
- **Builds on:** PRD 1 (`prd-1-activation-and-bot.md`): package A (`telegram_bot_opened`,
  page context), package D (deep-link handoff, honest promises, bot analytics). PRD 2 starts
  after PRD 1's tasks; it does not repeat them.
- **Source:** written by Claude in the night run of 2026-11-18/19 (D21) from
  `../reviews/2026-11-18-metrics.md` and `../reviews/2026-11-18-direction-review.md`. Nothing in
  it is decided by the owner yet; every **Decided** mark below points to an existing decision.

## 1. The test

**Question.** Will tenants whose landlord keeps their deposit start the bot's deposit flow when
the owner answers their questions in RU/UA chats, and will some of them want a paid
done-for-you next step?

**Why this test first** (facts from the readout and the review):

- Search brings about 5–9 clicks a week and almost no deposit demand (12 visible deposit-query
  impressions in 12 months); no on-site test can be read in two weeks at that volume.
- Replies under other people's posts were the only channel that converted repeatedly in
  June–July (BRD §7).
- The deposit flow is built (D17) and its events are server-side, so they are not affected by
  the web capture loss found on 2026-11-18.
- Money: a lawyer's demand letter costs 95–500 zł (BRD §5); whether tenants pay for a
  done-for-you step is untested (proposed A19).

**Metric (E10).** Persons (`tg_<chatId>`), days 1–14 after day 0:

1. `tg_bot_started` with `payload` starting `dep`, by suffix;
2. `tg_deposit_flow_started`, by `entry_source` (FR-2);
3. `tg_deposit_verdict` → `tg_deposit_letter_generated` → `tg_deposit_letter_sent`;
4. persons with `tg_deposit_paid_interest` (FR-4), by `offer` and `price_pln`;
5. `tg_lawyer_interest` (existing);
6. web: `telegram_bot_opened` with `source=guide_deposit`, by `guide_slug` (FR-3).

**Threshold — Assumption** (the owner sets it before day 0): continue to a paid pilot at ≥ 15
persons with `tg_deposit_flow_started`, ≥ 5 with `tg_deposit_letter_generated` and ≥ 2 with
`tg_deposit_paid_interest`; stop the deposit hook below 5 started; anything between extends
the sprint once by 14 days.

**Dates.** Day 0 is the first day on which both the production bot (owner: migrations, token,
webhook, RLS) and the PRD 2 deploy are live and the owner starts answering. Readout on day 15.

## 2. Milestones

| Milestone | What                                   | Requirements |
| --------- | -------------------------------------- | ------------ |
| M1        | Web capture that the funnels can trust | FR-1         |
| M2        | Deposit links that record their source | FR-2         |
| M3        | Deposit prompt on move-out guides      | FR-3         |
| M4        | Paid next-step probe after the letter  | FR-4         |
| M5        | Readout and the owner's reply kit      | FR-5, FR-6   |

## 3. Requirements

```text
FR-1. Landing events are captured after initialisation
Milestone: M1 · Priority: Must · Status: Assumption (the cause); Decided: consent model (D10)
Who and when: any visitor's browser, on a full page load of any route
Result: the landing `$pageview` and every capture issued while the first page mounts reach
  PostHog exactly once
Acceptance criteria:
  1. Given NEXT_PUBLIC_POSTHOG_KEY is set and a test double of posthog-js that drops `capture`
     calls made before `init` (posthog-js has such an uninitialized-capture guard), when a page
     mounts, then the double records exactly one `$pageview` with
     `$current_url` after `init`.
  2. Given the same double, when the building page mounts, then it records one
     `building_detail_viewed` (a mount-time capture is not dropped).
  3. Given a client-side navigation to another route, then exactly one more `$pageview` is
     recorded; a re-render with the same pathname and search params records none.
  4. Given no key, then neither `init` nor `capture` runs and every page renders (unchanged).
  5. Persistence stays `memory` until consent and upgrades to `localStorage+cookie` on accept;
     the analytics identity is unchanged (D10); the existing consent tests pass unchanged.
  6. `docs/architecture.md` §5 states where `init` runs and why no capture can precede it.
  7. The agent first writes a test that fails on the current code. If it cannot reproduce the
     loss, the task is blocked with the finding instead of changing the provider.
Edge cases: SDK blocked by an ad blocker → pages work, nothing sent; consent accepted on the
  landing page → same identity (existing); `init` throws → pages still render
Data: none
Analytics: no new events; restores `$pageview` and mount-time events on landings
Screen: no design; src/components/providers/posthog-provider.tsx (or an earlier init point
  such as instrumentation-client.ts, agent's choice)
Copy: none
Depends on: D10; readout 2026-11-18 (verdict item 1)
Open questions: Q-5 (move into PRD 1), Q-6 (PostHog region)
After deploy (owner): in the first full week, sessions with `$pageview` on passflat.com are
  ≥ 90 % of sessions with `$web_vitals` (Assumption)
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
Milestone: M3 · Priority: Should · Status: Assumption (guide list, placement); Open (PL/EN
  display, Q-2; copy that names a statutory deadline, Q-4)
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
  5. PL and EN versions follow Q-2. Until the owner answers, they render no block.
  6. Copy keys exist in all four files of src/i18n/messages/ with identical key sets.
Edge cases: JavaScript off → the plain link works without the event; SDK blocked → the link
  works; repeated clicks → one event per click
Data: none
Analytics: `telegram_bot_opened` (PRD 1) with the new `source` value `guide_deposit` and the
  property `guide_slug`
Screen: src/app/[locale]/blog/[slug]/client.tsx (BlogArticle); reuse or extend
  src/components/costs/telegram-bot-cta.tsx, agent's choice
Copy: drafts in §7, for the owner's review
Depends on: FR-2; PRD 1 package A (`telegram_bot_opened`); Q-2, Q-4
Open questions: Q-2, Q-4
```

```text
FR-4. Paid next-step button after the letter
Milestone: M4 · Priority: Must · Status: Open (offer and price, Q-1); Assumption (placement)
Who and when: a bot user who has just received the generated letter (`dep:letter:<id>`,
  src/lib/bot/deposit-flow.ts:577–627)
Result: the sending-instructions message (`letterHowTo`) shows a second button with the offer
  and its price under "I sent the letter"
Acceptance criteria:
  1. Given a generated letter and a configured offer, when the instructions message is sent,
     then its keyboard has two rows: `btnLetterSent` with callback `dep:sent:<id>` (unchanged)
     and the paid button with callback `dep:paid:<id>`.
  2. Given a tap by the case owner, then the bot replies with the acknowledgement (§7) and
     records one `tg_deposit_paid_interest` with `offer` (a constant key), `price_pln` (a
     number) and `claim_band` (`lt_1000|1000_2999|3000_4999|gte_5000|unknown`, from
     depositAmount − returnedAmount).
  3. Given a tap on a case the chat does not own, then nothing is recorded and the reply is
     `caseNotFound` (reuse findOwnCase).
  4. Given repeated taps, then each tap gets the same acknowledgement and one event; the
     readout counts persons, not taps.
  5. The acknowledgement says the service does not exist yet, that nothing is charged and that
     the bot will not write about it; it promises no callback, date, lawyer or result.
  6. The offer key, label and price come from one config constant. While it is empty (Q-1
     unanswered), the button is not shown, so the build does not wait for the answer.
  7. RU and UK copy with the existing HTML escaping.
Edge cases: the letter shown again after a `deadline` follow-up → the button shows again for
  the same case; the user blocked the bot → nothing; the case was deleted → `caseNotFound`
Data: none stored (Assumption; a column would need a production migration, D18)
Analytics: new `tg_deposit_paid_interest` {offer, price_pln, claim_band}
Screen: no design; src/lib/bot/deposit-flow.ts, src/lib/bot/deposit-texts.ts
Copy: §7 drafts; the offer label and the price are Open (Q-1)
Depends on: D17; A12; proposed A19; Q-1
Open questions: Q-1
```

```text
FR-5. Reply kit for the owner
Milestone: M5 · Priority: Could · Status: Assumption
Who and when: the owner, answering deposit questions in chats during the sprint
Result: docs/marketing/deposit-replies.md holds 4–6 short reply templates in Russian and
  Ukrainian, each with one tagged link (`dep_tg`, `dep_fb`, `dep_threads`, `dep_ig`)
Acceptance criteria:
  1. Every template contains exactly one link with a source from FR-2.
  2. No template promises an outcome, names a deadline as advice for the reader's case or calls
     the bot legal help; each says the bot prepares a letter and is not a lawyer.
  3. The file starts with "Draft for the owner" and a note to respect each chat's link rules.
Edge cases: a chat that bans links → a template without a link that names the bot by username
Data: none · Analytics: none · Screen: none
Copy: agent draft in RU/UK (docs/marketing/ is audience-language content, CLAUDE.md)
Depends on: FR-2
Open questions: none
```

```text
FR-6. Sprint readout instructions
Milestone: M5 · Priority: Must · Status: Assumption
Who and when: the owner or a Claude session with the PostHog MCP, on day 15
Result: a "Deposit sprint (E10)" section in docs/analytics/activation-funnels.md (PRD 1
  package E), or docs/analytics/deposit-sprint.md if that file does not exist
Acceptance criteria:
  1. It gives HogQL for: persons with `tg_bot_started` by payload prefix; the funnel
     `tg_deposit_flow_started` → `tg_deposit_verdict` → `tg_deposit_letter_generated` →
     `tg_deposit_letter_sent` with a 14-day window, broken down by step 1's `entry_source`;
     persons with `tg_deposit_paid_interest` by `offer` and `price_pln`; persons with
     `tg_lawyer_interest`; `telegram_bot_opened` with `source=guide_deposit` by `guide_slug`.
  2. It gives a read-only SQL count of `deposit_cases` created between day 1 and day 14.
  3. It defines day 0, the E10 thresholds and how the owner's own test chats are excluded.
  4. It reproduces the worked example of §5.
Edge cases: no events at all → the readout says "no data", not 0 %
Data: none · Analytics: none · Screen: none · Copy: none
Depends on: FR-2, FR-3, FR-4; PRD 1 package E
Open questions: none
Note: the loop never queries PostHog (CLAUDE.md); the queries are checked by reading only
```

## 4. Analytics events

| Event                                                                                                                                            | Where              | New or changed           | Properties                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------------ | -------------------------------------------------------- |
| `$pageview`                                                                                                                                      | web, all routes    | Fixed on landings (FR-1) | unchanged                                                |
| `building_detail_viewed`                                                                                                                         | web, building page | Fixed on landings (FR-1) | unchanged                                                |
| `tg_bot_started`                                                                                                                                 | bot                | unchanged                | `payload`, `is_new`                                      |
| `tg_deposit_flow_started`                                                                                                                        | bot                | Changed (FR-2)           | + `entry_source`, `entry_detail`                         |
| `tg_deposit_verdict`, `tg_deposit_contract`, `tg_deposit_letter_generated`, `tg_deposit_letter_sent`, `tg_deposit_outcome`, `tg_lawyer_interest` | bot                | unchanged                | unchanged                                                |
| `tg_deposit_paid_interest`                                                                                                                       | bot                | New (FR-4)               | `offer`, `price_pln`, `claim_band`                       |
| `telegram_bot_opened`                                                                                                                            | web, listed guides | Changed (FR-3)           | PRD 1 properties; `source=guide_deposit`; + `guide_slug` |

No event carries an e-mail, free text, contract contents, names, addresses or a chat ID
(CLAUDE.md). Bot events stay under `tg_<chatId>` and are never joined to web identities.

## 5. Worked example (readout)

Events in days 1–14 (persons are bot identities):

| Person | Events                                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| P1     | `tg_bot_started` payload `dep_tg`; `tg_deposit_flow_started` `entry_source=tg`; verdict; letter generated; `tg_deposit_paid_interest` × 2 |
| P2     | `tg_bot_started` payload `dep_fb`; `tg_deposit_flow_started` `entry_source=fb`; verdict                                                   |
| P3     | `/deposit` button; `tg_deposit_flow_started` `entry_source=bot_menu`; verdict; letter generated; letter sent                              |
| P4     | `tg_bot_started` payload `dep_web_kaucja`; `tg_deposit_flow_started` `entry_source=web`, `entry_detail=kaucja`                            |
| P5     | `tg_bot_started` payload `dep_xyz`; `tg_deposit_flow_started` `entry_source=other`                                                        |

Expected readout: started 5 (tg 1, fb 1, bot_menu 1, web 1 with kaucja 1, other 1); verdict
3; letter generated 2; letter sent 1; paid-interest persons 1 (2 events). Against the
Assumption thresholds (continue at 15 started, 5 letters and 2 paid-interest persons; stop
below 5 started) the verdict is "extend once": 5 started is not below the stop level, and every
continue count is missed.

## 6. Edge cases across the PRD

- **Nobody answers:** a user who never answers the flow's questions stays at
  `tg_deposit_flow_started`; existing follow-ups are not extended.
- **Owner's own chats:** excluded in the readout (FR-6); the owner tests on the dev bot.
- **Seasonality:** December is a low month for moves (review, Otodom); a null result is weaker
  evidence than in August–September and the readout says so.
- **Chat moderation:** a removed reply or a ban is recorded by the owner in the readout as a
  channel fact, not as user behaviour.

## 7. Key copy (drafts for the owner's review)

Statements about a statutory deadline and "not legal advice" are legal-sounding text: they go
to the owner and the A14 lawyer review (Q-4) and are not final.

**Guide prompt (FR-3)**

- RU — title: «Хозяин не возвращает залог?» Text: «Бот Passflat в Telegram задаст 5 вопросов,
  покажет срок возврата залога по польскому закону и подготовит письмо-требование (wezwanie do
  zapłaty) на польском. Бесплатно. Это не юридическая консультация.» Button: «Открыть бота в
  Telegram».
- UK — title: «Орендодавець не повертає заставу?» Text: «Бот Passflat у Telegram поставить 5
  запитань, покаже строк повернення застави за польським законом і підготує лист-вимогу
  (wezwanie do zapłaty) польською. Безкоштовно. Це не юридична консультація.» Button:
  «Відкрити бота в Telegram».
- PL (only if Q-2 says so) — title: «Wynajmujący nie oddaje kaucji?» Text: «Bot Passflat w
  Telegramie zada 5 pytań, pokaże ustawowy termin zwrotu kaucji i przygotuje wezwanie do
  zapłaty po polsku. Za darmo. Bot odpowiada po rosyjsku i ukraińsku. To nie jest porada
  prawna.» Button: «Otwórz bota w Telegramie».
- EN (only if Q-2 says so) — title: "Landlord keeping your deposit?" Text: "The Passflat bot on
  Telegram asks 5 questions, shows the statutory deadline for returning a deposit in Poland and
  drafts a demand letter (wezwanie do zapłaty) in Polish. Free. The bot speaks Russian and
  Ukrainian. Not legal advice." Button: "Open the bot in Telegram".

**Paid button (FR-4)** — label pattern «<offer> — <price> zł»; offer and price are Open (Q-1).
Example of the pattern only: RU «✉️ Отправьте письмо за меня — <price> zł», UK «✉️ Надішліть
лист за мене — <price> zł».

**Acknowledgement (FR-4)**

- RU: «Спасибо, что отметили. Такой услуги пока нет: мы проверяем, нужна ли она. Ничего не
  списано, и писать вам об этом мы не будем. Письмо выше можно отправить самостоятельно — как
  это сделать, написано в сообщении выше.»
- UK: «Дякуємо, що відзначили. Такої послуги поки немає: ми перевіряємо, чи вона потрібна.
  Нічого не списано, і писати вам про це ми не будемо. Лист вище можна надіслати самостійно —
  як це зробити, написано в повідомленні вище.»

## 8. Not in scope

- Payments, Stripe changes, invoices; any fulfilment of the paid step (D7 stays; the probe
  records interest only).
- A lawyer partner, lawyer directory or referral (BRD §6 constraints).
- Changes to the deposit rules, the verdict logic or the letter text (A14).
- A Polish or English deposit flow in the bot (Q-3).
- Notifications, a notifier or new mailings (PRD 1 package D removes such promises).
- The roommate page change (E11) and guide title rewrites (E12): separate small items.
- Listings, matching and tenant replacement (frozen, D5, Decided).
- New database tables or columns, production migrations (D18, Decided), RLS (D9).
- The bot's production launch, webhook registration and any real message (owner only).
- Changes to the consent model or analytics identity (D10, Decided).

## 9. Open questions

| ID   | Question                                                                                                                       | Owner | Blocks                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ----- | -------------------------------------------- |
| Q-1  | Which paid next step is probed (for example sending the letter by registered post, or a check of the case), and at what price? | Owner | FR-4 shows its button only after the answer  |
| Q-2  | Show the guide prompt on Polish and English pages (with "the bot speaks Russian and Ukrainian") or only on RU/UK?              | Owner | FR-3 criterion 5                             |
| Q-3  | Should the bot get a Polish deposit flow later?                                                                                | Owner | Nothing in PRD 2; the size of E10's audience |
| Q-4  | Start E10 before the Polish lawyer review of the deposit rules and letter (A14, BRD §13)? Approve the prompt copy?             | Owner | E10 day 0; FR-3 copy                         |
| Q-5  | Move FR-1 into PRD 1 now, so E8 and E9 can be read?                                                                            | Owner | Order only                                   |
| Q-6  | Which PostHog region does production send to (`NEXT_PUBLIC_POSTHOG_HOST`)? The project reports `us.i.posthog.com`; docs say EU | Owner | Privacy wording (A15); not the build         |
| Q-7  | Can you answer deposit questions 3–4 hours a week for 14 days?                                                                 | Owner | E10 day 0                                    |
| Q-8  | When does the bot go to production (four migrations, token, webhook, RLS)?                                                     | Owner | E10 day 0                                    |
| Q-9  | Confirm or change the E10 thresholds (15 / 5 / 2; stop below 5)                                                                | Owner | The E10 verdict                              |
| Q-10 | Does E10 replace E6?                                                                                                           | Owner | Records only                                 |

## 10. Size

About 12–14 tasks: M1 3 (failing test, fix, docs), M2 3 (parser and tests, event property,
README), M3 3 (component, four locales, event test), M4 3 (button and callback, copy, tests),
M5 2 (reply kit, readout section). Small tasks of 2–5 minutes and two bot-flow tasks of
10–30 minutes: roughly 3–5 hours of loop time, within one day after PRD 1.

## What changed

- **0.1, 2026-11-19.** First draft by Claude in the night run, from the 2026-11-18 readout and
  direction review. Not yet reviewed by the owner.
