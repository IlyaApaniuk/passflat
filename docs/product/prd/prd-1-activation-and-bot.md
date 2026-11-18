# PRD 1: Activation measurement and the Telegram bot

- **Version:** 0.1 (draft), 2026-11-18
- **Status:** Evaluated, 2026-11-19 (`prd-1-decision-review.md`: ready with assumptions, 13
  decisions, 6 of them blocking a task)
- **Serves:** H2 and H3 (measurement for E8 and E9), H5 and H1 (bot handoff and honest promises before E5 and E6); BRD A5, A8, A16
- **Source:** the owner's implementation brief of 2026-10-07 (Russian; removed from the tree on 2026-11-18, kept in git history), translated without changes of substance. No code has been changed for it yet.
- **Format:** not yet in the requirement format of `docs/product/prd-rules.md` (FR ids, acceptance criteria per requirement, Decided / Assumption / Open marks); the `prd-intake` skill restructures it in the decision review.

Original title: **Passflat: implementation plan — clear flows, trustworthy data and Telegram**

Original date and status: 7 October 2026. Status: a brief for implementation by another agent; no code has been changed under this plan yet.

## 1. Task and facts

Prepare the existing product for a measurable experiment: find out whether people who are looking for a room/roommate or checking a specific address get value from it, and close the gaps between the website and the bot.

Data from the founder: 320 reports, 318 buildings, 20–30 self-submitted contributions, no payments. Own test visits are already excluded. In the Google Search Console rows shown, 10 of 13 clicks relate to roommate search. This is NOT the share of all traffic. The periods of the screenshots and the mapping of queries to pages are not confirmed.

This iteration does not make a final choice of a new business. Roommate search remains an existing entry point; the address check remains a standalone useful task; the bot remains a channel for these tasks and for the already existing deposit flow.

## 2. Boundaries of the work

- Implement packages A–E below sequentially, in small reviewable changes.
- Reuse the existing forms, routes, events, localisation and components.
- Keep the URLs of the building pages and the roommate search pages, canonical and hreflang. Do not change URLs for the sake of this iteration.
- Website: support PL/EN/RU/UK. Bot: keep the existing RU/UK; postpone additional languages.
- Do not build compatible-roommate matching, separate profiles for people who are searching, a new chat, a CRM, an agency rating, payments or a new city.
- Do not add notifications about new listings/reports in this iteration. Remove promises of delivery that does not exist yet. Keep the existing deposit case reminders.
- Do not do a global redesign; do not change the analytics consent model or the already configured exclusion of tests.
- No new DB tables are required for this iteration. First check what the current schema can do; do not run production migrations or send anything to users as part of the local implementation.
- The old constraints in the historical DEVELOPMENT_PLAN.md and docs/plans describe a previous stage. Within the current brief, the listed roommate and bot fixes are allowed; this is not permission to develop the whole marketplace.

## 3. Before making changes

- Read the current repository instructions and check the working tree. Do not overwrite other people's changes.
- Record which of the listed capabilities already exist. Do not create a second waitlist or a second link to the address check.
- Distinguish the state of the code from the state of production. The bot README mentions unapplied migrations, but that by itself does not prove the current deployment status.
- Prepare local/mock data for these states: no offers; offers exist but the filter excludes all of them; one observation for a building; listings only; mixed sources; incomplete costs; no building data but district data exists; no district data but city data exists; no numeric data at all.

## 4. Package A — measure different tasks separately

Main files:

- `src/components/providers/posthog-provider.tsx`
- `src/components/listings/listings-page-client.tsx`
- `src/components/listings/listings-empty-state.tsx`
- `src/app/[locale]/[city]/replacement/[id]/client.tsx` — the shared listing detail page; check reuse
- `src/app/[locale]/[city]/check/client.tsx`
- `src/app/[locale]/[city]/building/[slug]/client.tsx`
- `src/app/[locale]/[city]/costs/submit/client.tsx`
- `src/components/costs/telegram-bot-cta.tsx`

Keep the current event names. Add new ones only for actions that are missing.

Common context: `page_type`, `locale`, `city`; `listing_type` and `building_id` only where applicable. Document the `page_type` values: `home`, `roommate`, `listing_detail`, `building`, `checker`, `costs`, `cost_submit`, `resources`, `other`.

Store the entry page type of the current session separately (`entry_page_type`). Do not substitute it for the current page and do not call it the user's intent. Keep the existing `ref` and UTM first-touch. Use the current PostHog and its persistence mode; do not add persistent storage that bypasses consent. In memory mode, document the loss of context on a full page reload; do not stitch people together artificially.

Events and values:

| Action                      | Event / implementation                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Page entry                  | Existing `$pageview` with context                                                                                    |
| Role selection on roommate  | New `roommate_intent_selected`, `intent=find_room\|offer_room`                                                       |
| Listing view                | Existing `listing_detail_viewed`; reconcile `type`/`listing_type` without removing the old property                  |
| Contact click               | Existing `listing_external_contact_clicked` or `interest_modal_opened`; do not count it as a successful introduction |
| Interest saved successfully | New client-side `listing_interest_saved`, only after a successful API response                                       |
| Save error                  | New `listing_interest_failed`, an `error_code` from a bounded set, without the form text/email                       |
| Going to the address check  | Existing `cost_data_cta_clicked`, `source=roommate_bridge`                                                           |
| Address check               | Existing `checker_viewed`, `address_checked`, `checker_check_failed`                                                 |
| Building view               | Existing `building_detail_viewed`, extended with the number and composition of sources                               |
| Contribution                | Existing `cost_form_*`; keep the entry context and the button's local `source`                                       |
| Going to Telegram           | New `telegram_bot_opened`, `source=checker\|empty`, `has_building_context`                                           |

For `listing_interest_saved`, add `listing_type`, `district_scope=city|district`, and `intent` if it was explicitly selected. The event means that interest was saved, not a subscription to a working mailing. Do not add the email, the contract, the user's free text or the Telegram chat ID to web events.

The current waitlist API sends server-side events under the email, while the website visitor has a different identity. For the browser funnel, use the new client-side success event with the same PostHog ID. Do not count the server-side and the client-side success as two conversions. Keep Telegram analytics separate: do not stitch `tg_<chatId>` together with the web user.

Check `search_performed.results_count`: the code currently uses the original array of listings. The number must match the results of the active filters; a change of the map area must not look like a new search query without a user action.

**Acceptance A:** one navigation/one action creates the expected number of events; a re-render does not duplicate events. The roommate → checker → form chain keeps the available context. An API error does not create a success event. A missing SDK does not break the flow. Do not promise recovery of past attribution or the mapping of a Google query to a specific visitor.

## 5. Package B — fix the existing room search path

Main files:

- `src/app/[locale]/[city]/roommate/page.tsx`
- `src/components/listings/listings-page-client.tsx`
- `src/components/listings/listings-empty-state.tsx`
- `src/app/api/city-notify/route.ts`
- `src/app/api/cron/city-launch/route.ts`
- `src/i18n/messages/{pl,en,ru,uk}.json`

The first roommate screen must clearly separate the two roles that are already supported:

- "I'm looking for a room" («Ищу комнату») / `Szukam pokoju`: go to the existing listings and filters; when there are no offers, the existing interest capture.
- "I have a free room" («Есть свободная комната») / `Mam wolny pokój`: the existing `/create-listing?type=roommate`, keeping the choice across sign-in.

Do not add a third flow, "I'm looking for a person to search for a flat together" («ищу человека для совместного поиска квартиры»), for now: there is no profile model for such a person and no process for handling the request. Do not disguise this flow as a regular listing with a mandatory address.

Keep the existing link to the address check as secondary help: "Found a place? Check the address and known costs" («Нашёл вариант? Проверь адрес и известные расходы»). Do not require filling in costs in order to view offers or to go to the checker.

Fix three classes of subscriptions without changing the DB unique key:

| Purpose                                 | `listingType` | `districtSlug` |
| --------------------------------------- | ------------- | -------------- |
| Waiting for the city launch             | empty         | empty          |
| Interest in listings for the whole city | set           | empty          |
| Interest in listings for a district     | set           | set            |

Currently the API saves `listingType` only inside the branch for a non-empty district. Fix it so that the type and the district are validated independently: a roommate request without a district must save `listingType=roommate`. For listings, validate that the city is real and that the district belongs to the city. For the old form for requesting a new city, keep its current semantics.

Limit the `city-launch` mailing to genuine city-launch subscriptions: `listingType=''`, `districtSlug=''`, valid consent and the other existing conditions. Listing requests must not receive the confirmation/launch email about the city launch. Do not automatically relabel old records whose type was lost: the original intent is unknown.

The interest-capture copy must honestly describe the outcome: "Save interest" («Сохранить интерес»); the confirmation says that the interest has been saved and that there are no automatic notifications about new offers yet. Do not promise matching or a guaranteed reply from the founder. Keep the existing consent.

Distinguish no offers in the whole city from zero after filtering. With strict URL filters and on reload, do not show "there are no listings in the city yet" («в городе пока нет объявлений») if offers exist outside the filter. If needed, pass a separate server-side flag saying that offers exist outside the user's filters. Zero after filtering → suggest changing the filters.

**Acceptance B:** all three kinds of subscriptions are kept apart; a repeated submission does not create a duplicate; an invalid type/district is rejected; an unknown district does not turn into a city-launch request. Checking the email through a mock confirms that no unsuitable emails are sent. Both roommate paths work on mobile; the replacement/sublet flows keep their previous behaviour. Do not send new real emails during tests.

## 6. Package C — a trustworthy answer about a building on the website and in the shared logic

Main files:

- `src/lib/cost-aggregates.ts`, `src/lib/cost-baselines.ts`, `src/lib/cost-stats.ts`
- `src/lib/location-checker.ts`
- `src/app/[locale]/[city]/building/[slug]/{page,client}.tsx`
- `src/app/[locale]/[city]/check/client.tsx`
- `src/app/api/cost-reports/route.ts`
- `src/app/[locale]/[city]/costs/submit/client.tsx`
- `src/app/[locale]/page.tsx` and the existing components that use the changed metrics

First define a single small data contract, reused by the website and the bot: the source and its count, the number of usable observations for a specific metric, cost completeness, the available date and what it means, the geographic level. Do not create a second independent algorithm for Telegram.

Display rules:

- Show `user`, `import` and `scraped` data separately. `user` means a report from a user, not verification by a document. Label `import` without additional evidence as entered data; do not assign verification to it automatically.
- Do not combine listings and residents' reports into one number under the label "actually pay" («реально платят»). For a mixed base, show separate groups and their sizes; the selected group must be explicitly labelled on the map, on the cards and in the baseline.
- One report: "One observation at this address" («Одно наблюдение по этому адресу»), with the property's characteristics if they are known. Do not present it as the established price of the building.
- `utilitiesComplete=false` means that the full cost is not established, regardless of the source. Show such a total as the known part of the costs and exclude it from the group of complete all-in sums. Do not lose the original records.
- Distinguish confirmed zero costs from unknown costs. Do not turn `null` or missing meters into zero.
- For each number, count N usable values, not the total number of all the building's records.
- Do not present the date a record was added/confirmed as the period of the actual payment. If the period is unknown, say so explicitly.
- Remove the "you're overpaying / you're saving" («переплачиваешь/экономишь») conclusion drawn from a simple comparison with the district median. A neutral comparison is allowed only with an explanation of the sample's composition; when the property types are not comparable, hide the comparative conclusion.
- The "room/flat" («комната/квартира») filter must restrict the source reports before aggregation. Currently the building's dominant type is selected separately from the overall median — this allows room and flat prices to be mixed.
- Do not call N≥5 proof of being verified or representative. Do not build a statistical fair-price model in this iteration.

The building's first screen: address → what information exists and where it comes from → known costs with their limitations → two clear actions: view details / add your own experience. Reuse the existing location score, tags, reviews, form and address prefill. Do not hide the disclosure of sources and limitations behind the contribution gate.

Fallback: first say separately "no data for this building" («по дому данных нет»), then an explicitly labelled reference point for the district/city. If there is no numeric data at that level either, show this state and the available information about the surroundings; do not generate a number for the sake of having one. Do not label district information as building information.

When changing the shared helpers, check all consumers and cache tags so that the hero, the map, the building page, the checker and the bot do not show different values of the same metric. Do not change the calculator's tariffs based on assumptions; record any outdated sources you find as a separate verifiable item.

**Acceptance C:** fixtures for user/import/scraped/mixed, a single record, unknown utilities, zero values, mixed rooms/flats and no usable observations. The website's and the bot's metrics match for the same sample. None of these cases turns into an unconfirmed "verified" («проверено») or "overpayment" («переплата»).

## 7. Package D — Telegram: fix the handoff and the promises

Main files:

- `src/components/costs/telegram-bot-cta.tsx`
- `src/lib/bot/{bot,lookup,format,texts,store,analytics}.ts`
- `src/lib/bot/{deposit-flow,deposit-texts,contract,deposit}.ts`
- `src/lib/bot/README.md`
- `src/app/api/telegram/webhook/route.ts`
- `src/app/api/cron/telegram-followups/route.ts`

### D1. Fix the website → bot handoff

The website already generates `?start=b_<buildingId>`, but `/start` handles `dep` and `d_` and ignores `b_`. Add handling of the existing format: validate the UUID, fetch the building's public data, and immediately show the result for that address. Do not ask the user to re-enter an address that is already known. For a deleted/unknown/unsupported building, give a clear fallback and offer address input. Do not create a building record from an arbitrary payload.

Following the link must not by itself subscribe the user to a mailing. Also check the existing `d_`: it currently saves a subscription automatically. Show the district and a separate, explicit action to save interest. Keep the already published `dep`, `d_`, `b_` and `web_*` links working.

### D2. Use the honest data from package C

The building, district and nearby-building cards must show where the numbers come from and the sample size. Currently `LocationCheckerCosts` knows `sourceKind`, but the bot's formatting mostly writes a generic "based on reports" («на основе отчётов»). Remove the unconditional price verdict relative to the district for non-comparable properties. Distinguish "one observation" («одно наблюдение») from "data from several properties" («данные нескольких объектов»).

Phrase the deposit return statistics as the results of specific responses, with N and geography, without promising an individual probability of getting the deposit back. Do not add the data of problem `DepositCase` records to the overall statistics for all tenants.

### D3. Fix the notification promises

`TelegramSubscription` is stored, but a sender of new cost-report notifications based on it is not implemented in the repository; the `telegram-followups` cron serves other reminders — about deposits. Therefore replace "I'll message you when new data appears" («Напишу, когда появятся новые данные») with a clear saving of interest and an explicit message that there are no automatic notifications. Continue to support the existing saving and deletion of interest. Do not create another notifier within this iteration.

In `/help`, the greeting, the buttons and the confirmations, describe the same actual set of capabilities. Do not promise roommate search through Telegram if it does not exist. The bot offers the address check and the existing deposit helper.

### D4. Separate the analytics of the bot's tasks

Keep `tg_bot_started`, `tg_address_checked`, `tg_district_checked` and `tg_deposit_*`. Extend the check events with `entry_source`, `lookup_level`, `source_kind`, N and an incomplete-data flag, where applicable. When a building is opened directly, count this successful result once, without double counting it with the check of an entered address.

The web CTA measures the link click; `tg_bot_started` measures the actual start. Do not present them as a single identified cross-channel funnel. Keep the bot → website UTM and the address prefill in the form, and verify them with tests. Do not pass the chat ID in website URLs.

### D5. Keep the deposit helper's scope narrow

Do not call the current function a full contract review: it extracts a limited set of terms. An unread document, an unrecognised contract type and an unsupported case must not be accompanied by a confident personal legal conclusion.

Do not expand or rewrite the legal rules based on guesswork. Prepare a list of scenarios and limitations for review by a Polish lawyer; direct disputed cases to qualified help without claiming that a lawyer has already been assigned.

The `wants_lawyer` button currently only records interest in a partnership that has not launched yet. Explain this before the click and in the confirmation; do not promise a response time, a consultation or a guaranteed future message. Keep the interest event separate from the outcome of legal help.

For the existing deposit reminders, check explicit consent, cancellation, and that the same reminder is not sent again after the handler is re-run. Do not run any new mailings or outbound contacts during implementation.

**Acceptance D:** `/start b_<valid>` immediately shows the right address; invalid/missing/outside-city cases are handled safely; saved `dep`/`d_` links do not break; a subscription is not created by a single open; sparse/mixed/incomplete data is labelled correctly; N and the fallback match the website; a failure to read the contract is not presented as a successful check; lawyer requests do not promise a working service; RU/UK and HTML escaping work.

## 8. Package E — measurement documentation and readiness check

Add `docs/analytics/activation-funnels.md` with the actual events after implementation, the required properties and instructions for setting up reports:

1. Roommate: entry → role selection → offer view → contact; count interest saving as a separate branch.
2. Address: entry into the checker/building → successful answer → action. Someone who started a check and someone who came directly to a building page are different entries.
3. Contribution: entry source → form start → address → attempt → success.
4. Telegram address: start → successful answer → interest saved; analyse transitions to the website separately, by UTM.
5. Telegram deposit: case start → analysis result → letter → user's mark that it was sent → reported outcome. Do not count the letter as the money being returned.

For the web funnels, specify the current-session window; for deposit, describe a longer observation window separately. Do not mix intervals, new and old events, users and events. Check the number of saved requests in the DB separately from the number of client-side events. A click on an external contact does not mean a reply or a successful move-in.

Describe how to compare two consecutive full weeks after the release: the number of entries by page type, useful actions, requests, sources and errors. Do not include A/B tests, a revenue forecast or universal target percentages: the sample is too small.

Update the bot README: the features that are implemented, saved interest, the reminders that work, the deep link formats, the verified or unknown status of production dependencies. Do not declare the bot launched merely because the code/the username variable exists.

## 9. Checks and the agent's output

- Add meaningful unit/API tests for the changed aggregations, the three kinds of waitlist, the address deep link and the bot fallback. Use mocks for Google, Telegram, email, the LLM and the DB where needed.
- Do not write snapshot tests just for the new texts, or tests that repeat the markup.
- Check the mobile flows, the four website locales and the two bot locales, the anonymous/authenticated path, the empty states and the existing address prefill.
- Run `npm run typecheck`, `npm run lint`, `npm run test`; run `npm run build` if the local configuration allows it. State the existing environment limitations explicitly. Run E2E for the changed key routes if a test environment is available; do not use production for test records.
- The agent's output: the list of implemented packages, the changed files, the check results, the remaining limitations, deploy readiness and the configuration that still needs to be checked. Finish the code and the local checks before a separate decision on the production deploy.

**Recommended order:** A (event contract) → B (roommate and correctness of requests) → C (shared data) → D (the bot on the shared logic) → E (documentation and final check). The `b_` fix can be done in parallel with B; edit the shared website/bot helpers in a coordinated way.
