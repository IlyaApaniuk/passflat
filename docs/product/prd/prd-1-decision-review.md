# PRD 1 decision review

- **PRD:** `prd-1-activation-and-bot.md`, version 0.1 of 2026-11-18 (the owner's brief of
  2026-10-07, translated)
- **Written by:** Claude, `prd-intake` with `go`, night run D21, 2026-11-19. The loop was idle;
  every M0 task was done, so `ralph/tasks.json` was archived.
- **Verdict: ready with assumptions.** The brief decides most of the behaviour itself (what to
  measure, what to fix, what to remove), but it is not in the requirement format: it has no FR
  ids, no numeric examples for the figure rules and some honesty and legal choices left open.
  Below, each package is mapped to FR-numbered requirements without changing its substance. The
  build proceeds tonight on safe defaults; six items are blocked tasks waiting for the owner.
- **Decisions for the owner:** 16, of which 6 block a task (Q-1 to Q-6) and 10 do not block the
  build (Q-7 to Q-16). **All 16 answered by the owner on 2026-11-19** (D22 – D33; see
  [Answers, 2026-11-19](#answers-2026-11-19)).
- **Size:** 45 tasks (T002–T046): M1 9, M2 6, M3 14, M4 13, M5 3; 6 of them blocked. 39
  runnable tasks at 5–30 minutes each, roughly 9–11 hours of loop time.

## What exists today (checked in the code on 2026-11-19)

- **Analytics:** no shared client capture helper; about 40 inline `posthog?.capture` calls. The
  only super-properties are `ref`, `ref_type` and `utm_*` (`register_once`). No `page_type`,
  `entry_page_type`, `roommate_intent_selected`, `listing_interest_saved` or
  `telegram_bot_opened` exists. `search_performed.results_count` sends the unfiltered server list
  length. `posthog.init` runs in the provider's own effect, after the child `PostHogPageView`
  effect (the likely cause of the landing loss in the readout).
- **Tests:** Vitest runs in a Node environment without jsdom or Testing Library, so components
  cannot be rendered in tests. Specs therefore put event and display logic into pure functions.
- **Roommate:** one screen mixes both roles; offering a room goes through the empty state only;
  the middleware drops `?type=` when it redirects `/create-listing` to sign-in.
- **Waitlist:** `/api/city-notify` keeps `listingType` only when a district is set, so a roommate
  request without a district becomes a whole-city row and receives the city-launch confirmation
  email. `/api/cron/city-launch` selects every row of the city, district rows included.
- **Figures:** no aggregation reads `utilitiesComplete`; null utilities count as 0 in stored
  totals; N counts all visible reports; the building page trims outliers, other surfaces do not;
  the "room/flat" filter uses a building's dominant type over medians of all reports; overpay or
  "cheaper/pricier than the district" verdicts appear on nine surfaces; landing copy claims
  "verified" and "actually pay" in about 20 keys.
- **Bot:** `/start b_<uuid>` (the only link the site produces) is ignored; `/start d_<slug>`
  subscribes automatically; six texts promise notifications that no code sends; `sourceKind` is
  never used, and "по N жильцов" counts scraped listings; the district verdict says "района" even
  when the figure is the city's; the bot's cost-form link (`source=tgbot`) loses its address
  prefill because the form accepts only `checker`, `review` and `building`; the deposit
  follow-up cron can re-send on overlapping runs and `/cancel` does not stop pending reminders.

## Metrics readout and measurement gaps

From `../reviews/2026-11-18-metrics.md`:

1. **Landing `$pageview` is lost on 86 % of visits since 2026-07-28**, and mount-time events
   such as `building_detail_viewed` with it. Every web funnel of PRD 1 (E8, E9) starts at a
   landing page, so without the fix the new context properties would sit on events that do not
   arrive. The fix is PRD 2 FR-1; moving it here is Q-1. Independently, FR-1 attaches page
   context at the SDK level (`before_send`), so whatever does arrive carries it.
2. **`ref` and UTM are lost on a full reload in memory mode.** Not fixable without changing the
   consent model (D10); FR-2 and the funnel doc state the limitation.
3. **Waitlist conversions are invisible:** `city_notify_subscribed` and
   `district_notify_subscribed` never appear, and they are keyed by e-mail. FR-6 adds the
   client-side `listing_interest_saved` under the visitor's own id.
4. **No `tg_*` events:** the bot is not in production (Q-10). D-package analytics can only be
   proven by tests until launch.
5. **The owner's anonymous visits cannot be excluded in memory mode.** The funnel doc tells the
   readout to say so.
6. **`location_score_viewed` is the best surviving proxy** for building-page views; the funnel
   doc keeps it as a fallback until Q-1 is fixed and verified.
7. **`address_checked` is 0 since 2026-09-14.** It fires after a successful check, so it may be a
   true zero; the funnel doc lists it as unverified.
8. **PostHog region:** the project reports `us.i.posthog.com` while the docs say EU (Q-11).

## Requirements (FR mapping)

Marks: **D** Decided by the brief, **A** Assumption (built, one config place), **O** Open (task
blocked). Specs: `../../specs/01-analytics-context.md` (A),
`02-roommate-and-waitlist.md` (B), `03-building-figures.md` (C), `04-telegram-bot.md` (D),
`05-measurement-docs.md` (E).

| FR    | Pkg / M | Requirement                                                                                                                     | Mark                                   |
| ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| FR-1  | A / M1  | Every client event carries `page_type`, `locale`, `city` (and `listing_type` on listing pages), from one route mapping          | D; value mapping A (adds `blog`, Q-12) |
| FR-2  | A / M1  | `entry_page_type` = page type of the first `$pageview` of the session, separate from `page_type`; lost on reload in memory mode | D; mechanism A                         |
| FR-3  | A / M2  | `roommate_intent_selected` with `intent=find_room\|offer_room` on role choice                                                   | D                                      |
| FR-4  | A / M1  | `listing_detail_viewed` gains `listing_type`, keeps `type`                                                                      | D                                      |
| FR-5  | A / M5  | Contact clicks keep their events and are documented as clicks, not introductions                                                | D                                      |
| FR-6  | A / M1  | `listing_interest_saved` {`listing_type`, `district_scope`, `intent`?} only after a 2xx response                                | D                                      |
| FR-7  | A / M1  | `listing_interest_failed` {`error_code`} from a bounded set; no email or form text                                              | D; code set A                          |
| FR-8  | A / M1  | The roommate → checker → form chain keeps context; `cost_data_cta_clicked` `source=roommate_bridge` unchanged                   | D                                      |
| FR-9  | A / M1  | `building_detail_viewed` gains `report_count` and per-source counts                                                             | D; property names A                    |
| FR-10 | A / M1  | `cost_form_*` keep the entry context and the CTA's local `source`                                                               | D                                      |
| FR-11 | A / M1  | `telegram_bot_opened` {`source=checker\|empty`, `has_building_context`} on the site's bot link                                  | D                                      |
| FR-12 | A / M1  | `search_performed.results_count` counts results after active filters; map moves fire nothing                                    | D                                      |
| FR-13 | A / M1  | Landing events reach PostHog (PRD 2 FR-1)                                                                                       | O (Q-1)                                |
| FR-14 | B / M2  | The first roommate screen offers two roles: "Szukam pokoju" / "Mam wolny pokój"                                                 | D; EN/UK copy draft                    |
| FR-15 | B / M2  | "I have a free room" keeps `type=roommate` across sign-in                                                                       | D                                      |
| FR-16 | B / M2  | The checker link stays as secondary help; no cost gate on offers or the checker                                                 | D; RU copy given, others draft         |
| FR-17 | B / M2  | `/api/city-notify` stores three classes (city launch, city listings, district listings) with independent validation             | D                                      |
| FR-18 | B / M2  | The city-launch mailing selects only city-launch rows; old rows are not relabelled                                              | D                                      |
| FR-19 | B / M2  | Interest capture says "Save interest" and that there are no automatic notifications                                             | D; RU given, others draft              |
| FR-20 | B / M2  | Empty states tell "no offers in the city" from "zero after your filters"                                                        | D                                      |
| FR-21 | C / M3  | One figure contract for site and bot: groups, per-source counts, N per metric, completeness, dates, level                       | D; shape A                             |
| FR-22 | C / M3  | Sources shown separately; `user` is not "verified"; `import` is "entered data"                                                  | D; grouping A (Q-3)                    |
| FR-23 | C / M3  | No single blended number labelled as what tenants pay on single-number surfaces                                                 | O (Q-2)                                |
| FR-24 | C / M3  | One usable report reads "One observation at this address"                                                                       | D                                      |
| FR-25 | C / M3  | `utilitiesComplete=false` totals are a "known part", outside complete all-in figures                                            | D; legacy `null` A (Q-3)               |
| FR-26 | C / M3  | A confirmed zero is not an unknown; `null` never becomes 0                                                                      | D                                      |
| FR-27 | C / M3  | N per metric counts usable values only                                                                                          | D                                      |
| FR-28 | C / M3  | A record date is never shown as the payment period; an unknown period is stated                                                 | D; copy draft                          |
| FR-29 | C / M3  | Overpay / saving verdicts removed; a neutral comparison only for comparable groups with N ≥ 5                                   | D; comparability A                     |
| FR-30 | C / M3  | The room/flat filter restricts reports before aggregation                                                                       | D                                      |
| FR-31 | C / M3  | No "verified" or "representative" claim from N; no fair-price model                                                             | D; existing marketing copy O (Q-4)     |
| FR-32 | C / M3  | Building first screen: address → what exists and from where → known costs with limits → two actions                             | D                                      |
| FR-33 | C / M3  | Fallback: "no data for this building", then a labelled district or city reference, then a no-numbers state                      | D                                      |
| FR-34 | C / M3  | Same metric, same value on every surface; cache tags checked; calculator tariffs unchanged                                      | D; trimming A (Q-3)                    |
| FR-35 | D / M4  | `/start b_<uuid>` shows that building at once; invalid, unknown or outside-city ids fall back to address input                  | D                                      |
| FR-36 | D / M4  | Opening a link never subscribes; `d_` shows the district with an explicit save-interest button; old links keep working          | D                                      |
| FR-37 | D / M4  | Bot cards show source and N from FR-21, one observation vs several, no unconditional district verdict                           | D                                      |
| FR-38 | D / M4  | Deposit-return statistics read as specific answers with N and geography; `DepositCase` excluded                                 | D; copy draft                          |
| FR-39 | D / M4  | No notification promises; "interest saved, no automatic notifications yet"                                                      | D; copy draft                          |
| FR-40 | D / M4  | `/help`, greeting, buttons and confirmations describe the same real capabilities                                                | D; copy draft                          |
| FR-41 | D / M4  | Bot check events gain `entry_source`, `lookup_level`, `source_kind`, `n`, `incomplete`; a direct open counts once               | D; values A                            |
| FR-42 | D / M4  | Bot → site UTM and address prefill work and are tested; no chat id in URLs                                                      | D                                      |
| FR-43 | D / M4  | No confident personal conclusion for an unread contract, a non-lease or an unsupported case                                     | D (intent); wording O (Q-5)            |
| FR-44 | D / M4  | A list of implemented scenarios and limits for a Polish lawyer                                                                  | D                                      |
| FR-45 | D / M4  | `wants_lawyer` explained before and after the tap; no promise                                                                   | D (intent); wording O (Q-6)            |
| FR-46 | D / M4  | Deposit reminders: opt-in by tap (exists), `/cancel` stops them, no re-send on a re-run                                         | D; cancel copy draft                   |
| FR-47 | E / M5  | `docs/analytics/activation-funnels.md`: five funnels, windows, DB counts, two-week comparison                                   | D                                      |
| FR-48 | E / M5  | Bot README: real features, saved interest, working reminders, link formats, production status                                   | D                                      |
| FR-49 | E / M5  | Final check and handoff                                                                                                         | D                                      |

Numeric examples for every figure rule (prd-rules rule 6) are written into spec 03 as golden
tests; they are the agent's examples of the brief's rules, not new rules.

## Conflicts and dependencies

- **D4 (blended medians) vs package C.** D4 blends `user`, `import` and `scraped` and says not to
  filter displayed medians; the brief says not to combine listings and residents' reports into
  one number. Where a surface can show several numbers (building page, checker, bot), showing the
  groups side by side keeps every scraped row visible, which the D4 note already anticipates.
  Single-number surfaces (map markers, list cards, district roll-ups, hero, city and district
  pages, calculator, OG images, blog report) cannot do both: Q-2.
- **D3 (honesty copy stays) vs CLAUDE.md and FR-31.** About 20 marketing keys say "verified",
  "checked" or "actually pay" (`landing.hero.trustVerified`, `costs.subtitle`, …): Q-4.
- **D5 (listings frozen) vs package B.** The brief allows "the listed roommate fixes" and
  forbids growing the marketplace; the specs stay inside that list (Q-7).
- **PRD 2.** PRD 2 FR-2 extends the start-payload parser of FR-35 and the `entry_source`
  values of FR-41, and FR-3 reuses `telegram_bot_opened`: spec 04 keeps both in one constant.
- **BRD A16** ("users accept blended medians") is untested; package C builds its "if wrong"
  branch. Nothing measures A16 directly; proposed A22 below covers the premise of C.
- **No requirement rests on a contradicted assumption** (A2 is not used).

## Decisions for the owner

| #    | What has to be decided                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Why the agent cannot decide                                         | Agent's proposal and options (with cost)                                                                                                                                                                                                                                                                                                                                                                                                                                      | What it blocks                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Q-1  | Move PRD 2 FR-1 (landing events lost before `posthog.init`) into PRD 1 (PRD 2 Q-5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Changes the scope of a PRD; touches the analytics setup (D10)       | Yes: one task of 15–30 minutes, test first; without it E8 and E9 cannot be read. Option: keep it in PRD 2 (PRD 1 ships context on events that mostly do not arrive)                                                                                                                                                                                                                                                                                                           | T002                                             |
| Q-2  | Single-number surfaces for a mixed base: keep the D4 blend or follow FR-23. Surfaces: map, list cards, district roll-ups, city hub, district pages, calculator, home hero and top building, blog report, OG images, the bot's `/districts` table and "cheapest" rank, neighbour medians in the bot and the checker                                                                                                                                                                                                                                                                                                                                        | Honesty rule for displayed figures; contradicts D4                  | (a) headline = tenant group (user + import) when it has a usable value, else the asking-price group, always labelled with its group and N; scraped stays on the building page; (b) keep the blend with a composition label ("N tenant reports + M asking prices"), which still breaks FR-23; (c) show both numbers on cards and hide the map median. (a) is about 3 tasks                                                                                                     | T028                                             |
| Q-3  | Figure parameters built as cautious defaults: tenant group = `user` + `import` (`import` labelled "entered by Passflat from a tenant's answers"); legacy `utilitiesComplete = null` counts as "not established"; medians untrimmed everywhere (the building page loses its 2.5·MAD trim); expenses = total − rent, never below 0; "one observation" = a group with exactly one report; for privacy, dates shown as month and year, tenancy as years, area rounded to 5 m² for one report; a deposit share (also a building's own) only from 3 answers; the reference level chosen by the district's total report count and shown per group with its own N | Honesty and privacy rules for displayed figures                     | Confirm all, or change any one: each is a single constant in `src/lib/cost-figures.ts`. Note: legacy `null` as "not established" may move many older user reports out of complete all-in figures                                                                                                                                                                                                                                                                              | T030 (confirmation; the build uses the defaults) |
| Q-4  | Rewrite the marketing keys that claim "verified", "checked by tenants", "actually pay" or "returned in full" (list in spec 03 §Marketing copy), and fix the numbers behind the home hero and blog-report deposit claims, which count partial returns and current tenants as returned                                                                                                                                                                                                                                                                                                                                                                      | Honesty copy and figures; D3 kept it, CLAUDE.md and FR-31 forbid it | Rewrite to "costs tenants reported" / "reported costs" in four locales, drafted by the agent for review; `faqA3` becomes "got it back, fully or partly"; hero and blog numbers use the shared deposit statistic. Option: keep (D3)                                                                                                                                                                                                                                            | T029                                             |
| Q-5  | Deposit flow wording when the contract was not read, is not a lease or the case is unsupported; the "⚖️ Разбор" naming; pointing disputed cases to qualified help                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Legal wording and legal reasoning                                   | Draft RU: «Договор прочитать не удалось, поэтому ниже — общее правило закона, а не вывод по вашему договору. Срок в вашем договоре может быть другим.» Header «Общее правило» instead of «Разбор» in these cases, and no strength word. Unsupported = reason `other` or a returned amount above the deposit. Disputed: «Если сумма спорная, лучше показать документы юристу или в бесплатный пункт помощи (nieodpłatna pomoc prawna).» Owner and the A14 lawyer review decide | T042                                             |
| Q-6  | `wants_lawyer`: text before the tap and the confirmation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Legal-sounding promise; the partnership does not exist              | Draft RU before: «⚖️ Хочу помощь юриста (сервиса пока нет — отметим интерес)»; after: «Записал ваш интерес. Юридической помощи через Passflat пока нет, и мы не обещаем, что напишем об этом. Если срок важен, обратитесь к юристу напрямую.» Option: hide the button until a partner exists                                                                                                                                                                                  | T043                                             |
| Q-7  | Package B under the listings freeze (D5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Product scope                                                       | Proceed: the brief lists exactly these fixes and forbids matching, profiles, chat, CRM. Option: drop T013–T016; T011–T012 stay (they stop wrong e-mails)                                                                                                                                                                                                                                                                                                                      | Nothing (built tonight)                          |
| Q-8  | Draft copy in four locales and in the bot (keys listed in each progress entry and in spec sections "Copy")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Final copy is the owner's where the brief wants it checked          | Review before deploy; nothing is deployed without the pull request                                                                                                                                                                                                                                                                                                                                                                                                            | Deploy only                                      |
| Q-9  | E8 and E9 thresholds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Business thresholds                                                 | Counts, not rates (small samples): E8 ≥ 5 roommate sessions with a role chosen and ≥ 2 with an offer viewed or interest saved in two full weeks; E9 ≥ 5 answered addresses and ≥ 1 `cost_form_started` from them                                                                                                                                                                                                                                                              | The readout only                                 |
| Q-10 | Production: deploy PRD 1, launch the bot (four migrations, token, webhook; RLS on `telegram_chats`, `telegram_subscriptions`, `deposit_cases`), re-run `npm run bot:webhook` for the new command menu                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Deployments, production migrations, RLS, webhooks (D9, D18)         | Launch the bot with the PRD 1 deploy so the handoff (FR-35) is live on day one. PRD 1 adds no table and no migration                                                                                                                                                                                                                                                                                                                                                          | E5, E8, E9 start                                 |
| Q-11 | PostHog region (PRD 2 Q-6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | PostHog settings and privacy wording                                | Check `NEXT_PUBLIC_POSTHOG_HOST` in Vercel; the funnel doc names no region until then                                                                                                                                                                                                                                                                                                                                                                                         | Docs wording only                                |
| Q-12 | Add `blog` to the `page_type` values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Small clarification of the brief's list                             | Yes: the blog holds 41 % of impressions and PRD 2 / E12 measure guides. Option: map blog to `other` (one-line change)                                                                                                                                                                                                                                                                                                                                                         | Nothing (built as Assumption)                    |
| Q-13 | Existing consent wording on the interest forms ("I agree to the processing of my personal data") stays while the subtitles change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Personal-data wording                                               | Keep, as the brief says; the privacy policy is not changed                                                                                                                                                                                                                                                                                                                                                                                                                    | Nothing                                          |
| Q-14 | Listings-interest e-mails (`city_notify_subscriptions` rows with a listing type) are kept forever, nothing is sent to them, there is no unsubscribe, and account deletion does not remove them                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Which personal data is stored and for how long                      | Options: (a) keep collecting, delete rows older than 12 months by a cron, add an unsubscribe link; (b) stop asking for an e-mail on the listings form and keep only the client event; (c) leave as is (today's behaviour). PRD 1 does not change what is stored                                                                                                                                                                                                               | Nothing in PRD 1                                 |
| Q-15 | Personal data in analytics: the two waitlist server events use the e-mail as the PostHog distinct id; the bot's `tg_address_not_found` and `tg_address_outside_city` send the typed address as `query`                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Analytics identity and personal data                                | Hash the e-mail (or drop the server events now that `listing_interest_saved` exists) and drop or truncate `query` to the city name. A small follow-up task after the answer                                                                                                                                                                                                                                                                                                   | Nothing in PRD 1 (no new event widens it)        |
| Q-16 | The manual city-launch e-mail links to the frozen `/replacement` page and has no guard against two overlapping runs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | E-mails are side effects; product scope                             | Link to the city's costs page; add the same claim-before-send as the bot reminders. A small follow-up task                                                                                                                                                                                                                                                                                                                                                                    | Nothing in PRD 1                                 |

## Answers, 2026-11-19

The owner answered every question in a chat on 2026-11-19 (in Russian; recorded in English).

| #    | Answer, 2026-11-19                                                                                                                                                                                                                      | Decision | Tasks                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------- |
| Q-1  | Yes: PRD 2 FR-1 moves into PRD 1 now (spec 01 §Landing capture holds its criteria)                                                                                                                                                      | D22      | T002 unblocked                           |
| Q-2  | Option (a): tenant group (`user` + `import`) when it has a usable value, else the asking-price group, always labelled with its group and N; scraped stays on the building page; supersedes D4 for single-number surfaces                | D23      | T028 unblocked, split: T028, T052 – T054 |
| Q-3  | All cautious defaults confirmed as built                                                                                                                                                                                                | D24      | T030 unblocked                           |
| Q-4  | Rewrite to "costs tenants reported" / "reported costs" in four locales, drafted by the agent for review; `faqA3` "got it back, fully or partly"; hero and blog deposit numbers use the shared statistic; supersedes D3 for honesty copy | D25      | T029 unblocked                           |
| Q-5  | Drafted wording approved exactly (RU given; UK drafted by the agent in the same sense); the A14 lawyer review is still needed before wide promotion                                                                                     | D26      | T042 unblocked                           |
| Q-6  | Keep the button with the drafted texts before and after the tap (RU given; UK drafted by the agent)                                                                                                                                     | D27      | T043 unblocked                           |
| Q-7  | Proceed with package B as built                                                                                                                                                                                                         | D28      | —                                        |
| Q-8  | The owner reviews draft copy before deploy                                                                                                                                                                                              | D29      | T059 lists the keys                      |
| Q-9  | E8 and E9 thresholds as proposed (counts)                                                                                                                                                                                               | D28      | `experiments.md`                         |
| Q-10 | Launch the bot with the PRD 1 deploy; the owner applies the four migrations one by one with explicit approval, switches RLS on for the three tables, sets the token and the webhook                                                     | D29      | T059 handoff                             |
| Q-11 | Move to a new PostHog EU Cloud project now, with the PRD 1 deploy; history stays in the US project                                                                                                                                      | D30      | `../../ops/posthog-eu-migration.md`      |
| Q-12 | Add `blog` to `page_type` (as built)                                                                                                                                                                                                    | D28      | —                                        |
| Q-13 | Keep the consent wording                                                                                                                                                                                                                | D28      | —                                        |
| Q-14 | Option (a): keep collecting; a daily cron deletes those rows after 12 months; a working unsubscribe link with a signed token. Whether account deletion also removes them stays **Open** (owner)                                         | D31      | T055, T056 (M6)                          |
| Q-15 | Drop the two e-mail-keyed waitlist server events; reduce the bot's `query` to the resolved city name, or drop it                                                                                                                        | D32      | T057 (M6)                                |
| Q-16 | Accepted: link to the city's costs page and claim before send                                                                                                                                                                           | D33      | T058 (M6)                                |

New size after the answers: 58 tasks (50 before, including T047 – T051 that the loop added; 8
new). T028 became four slices (T028, T052 – T054, about three
tasks of work), milestone M6 "Owner follow-ups" holds T055 – T058, and T059 is a second final
check with the deploy handoff.

## Architect gap review

A fresh `Plan` agent reviewed the five specs against the code on 2026-11-19 and found 28 gaps.
All 28 were folded into the specs before the tasks were written; 9 of them also need an owner
answer and were added above (Q-2 and Q-4 widened, Q-3 extended, new Q-14 to Q-16). The main
fixes:

- `entry_page_type` no longer depends on the landing `$pageview`, which is usually lost; E8 and
  E9 readouts are valid only after Q-1 is fixed and verified.
- Bot events were never flushed in the webhook; spec 04 adds `flushPostHog`.
- The contract now covers everything the building page shows (per-m², characteristics,
  deposit statistic, tenure, lease type) and names every other aggregation path (post-submit
  comparison in `POST /api/cost-reports`, dashboard panel, `cost-baselines` consumers).
- The costs overview keeps its existing blended fields and adds per-type medians, so Q-2
  surfaces are untouched.
- Web check events gain `answer_level`, `source_kind`, `n`, `incomplete` so E9 can tell a
  building answer from a reference; the roommate funnel counts sessions per step with intent as
  a breakdown and includes the offer branch.
- The bot's form link sends `b=<buildingId>` (the `p` prefill only works for known buildings);
  `b_` links to buildings with zero reports render the area card; `/cancel` clears only
  `followUpAt`; the reminder claim is at-most-once; the command menu file is named.
- Smaller: stable error codes from `/api/city-notify`, P2002 as success, the role selector's
  placement in the fixed header, the client i18n namespace rule, `unstable_cache` outside Next,
  cache-key bumps on shape changes, building OG metadata left to Q-2.

## Proposed new BRD assumption

Numbers continue after A21 (proposed in the PRD 2 decision review). Not in the registry until
the owner accepts it.

| No. | Assumption                                                                                                         | Proposed status | Source                                         | Used by             |
| --- | ------------------------------------------------------------------------------------------------------------------ | --------------- | ---------------------------------------------- | ------------------- |
| A22 | Showing where a figure comes from and its sample size makes visitors act on it (check another address, contribute) | Untested        | Brief §6; measured by E9 per `entry_page_type` | PRD 1 package C, H3 |

## Risks and what could be cut

- **Biggest risk: package C touches every cost surface.** Fourteen tasks, three blocked. The
  shared contract (T017–T018) comes first so the website and the bot cannot drift.
- **Thin data looks emptier.** Separate groups and the cautious legacy rule (Q-3) can make
  building pages show "known part" more often than a figure; that is the brief's intent.
- **Bot work without production.** Package D is proven by unit tests only until Q-10.
- **Cut first if time is short:** FR-9 (source counts on `building_detail_viewed`), FR-12, FR-44
  (scenario list), then the neutral comparison of FR-29 (remove verdicts, show nothing instead).
