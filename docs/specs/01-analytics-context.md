# 01 · Analytics context and activation events (PRD 1 package A)

Requirements FR-1 – FR-13 of PRD 1 (`../product/prd/prd-1-decision-review.md`). Consent model
and analytics identity stay as they are (D10, **Decided**): memory persistence until consent,
`localStorage+cookie` after it, no new storage, no identity stitching. Existing event names and
properties are kept; only the events and properties below are new.

## Current state (2026-11-19)

- `src/components/providers/posthog-provider.tsx`: `PostHogProvider` calls `posthog.init` in its
  own `useEffect`; the child `PostHogPageView` captures `$pageview` with `$current_url` only and
  registers `ref`, `ref_type`, `utm_*` with `register_once`. Child effects run before the parent
  effect, so the first capture of a full page load may run before `init` (readout 2026-11-18,
  FR-13).
- No shared client capture helper: about 40 inline `posthog?.capture(...)` calls via
  `usePostHog()`. No `page_type`, `entry_page_type` or `locale`/`city` super-property exists.
- Vitest runs in the Node environment; there is no jsdom and no Testing Library. Components are
  not rendered in tests. **Decided for this PRD:** put event logic into pure functions under
  `src/lib/analytics/` and test those; do not add test dependencies.

## Testing rules for every task in this spec

- Pure functions get unit tests with the examples below.
- Code that calls the SDK is tested through a small fake of the posthog-js surface it uses
  (`capture`, `register_once`, `init` config callbacks), defined in the test file. No real key.
- "A re-render does not duplicate events": the effect that captures must depend only on the
  identity it reports (for example `[listing.id]`, or a `useRef` guard), and the task states
  which; where the logic is a pure function, a test proves the guard.
- "A missing SDK does not break the flow": every capture is `posthog?.capture` or guarded; when
  `NEXT_PUBLIC_POSTHOG_KEY` is unset nothing is initialised (unchanged).

## Page context

FR-1 (**Decided**), value mapping **Assumption** (one constant, `src/lib/analytics/page-context.ts`).

`getPageContext(pathname: string): { page_type, locale, city, listing_type? }` is a pure
function. `locale` is the path prefix (`en`, `ru`, `uk`) or `pl` when there is none (routing is
`as-needed`). `city` is the city segment when the route has one, otherwise `null`. A first
segment is a city when it is not one of the static top-level routes under `src/app/[locale]/`
(list them in the module: `about`, `account-deleted`, `admin`, `auth`, `blog`, `contact`,
`create-listing`, `dashboard`, `email`, `help`, `how-it-works`, `messages`, `pricing`,
`privacy`, `resources`, `terms`, and any other static directory found there).

| Path (without locale prefix)                                                                  | `page_type`      | Extra                           |
| --------------------------------------------------------------------------------------------- | ---------------- | ------------------------------- |
| `/`                                                                                           | `home`           |                                 |
| `/<city>/roommate`                                                                            | `roommate`       | `listing_type: 'roommate'`      |
| `/<city>/roommate/<id>`, `/<city>/sublet/<id>`, `/<city>/replacement/<id>`                    | `listing_detail` | `listing_type` from the segment |
| `/<city>/sublet`, `/<city>/replacement`                                                       | `other`          | `listing_type` from the segment |
| `/<city>/building/<slug>`                                                                     | `building`       |                                 |
| `/<city>/check`                                                                               | `checker`        |                                 |
| `/<city>`, `/<city>/<district>`, `/<city>/costs`, `/<city>/costs/share`, `/<city>/calculator` | `costs`          |                                 |
| `/<city>/costs/submit`                                                                        | `cost_submit`    |                                 |
| `/resources`                                                                                  | `resources`      |                                 |
| `/blog`, `/blog/<slug>`                                                                       | `blog`           | Decided (Q-12, D28)             |
| anything else (`/<city>/review`, `/about`, `/auth/...`, ...)                                  | `other`          |                                 |

Examples (golden tests): `/` → `{home, pl, null}`; `/ru/warsaw/roommate` →
`{roommate, ru, warsaw, listing_type: roommate}`; `/en/warsaw/sublet/abc` →
`{listing_detail, en, warsaw, listing_type: sublet}`; `/warsaw/building/marszalkowska-1` →
`{building, pl, warsaw}`; `/uk/warsaw/costs/submit` → `{cost_submit, uk, warsaw}`;
`/blog/przepisanie-licznikow-najem` → `{blog, pl, null}`; `/en/about` → `{other, en, null}`;
`/warsaw/mokotow` → `{costs, pl, warsaw}`.

`building_id` is not derived from the URL; building-page events keep sending it themselves.

## Attaching context to every event

FR-1, FR-2, FR-10 (**Decided**); mechanism **Assumption**.

- Context is added at the SDK level, in the `before_send` option of `posthog.init` (posthog-js
  1.374 supports it): for every event, compute `getPageContext(window.location.pathname)` at send
  time and merge it under the event's own properties (an event's own property wins). This keeps
  context correct on client navigations and does not depend on when a component effect runs.
- `entry_page_type` (FR-2): the page type of the session's entry page. Before the FR-13 fix
  (T002, unverified until deploy) the landing `$pageview` was usually dropped, so the entry must
  not depend on it. Order of
  preference (check `node_modules/posthog-js` 1.374 first and name the choice in the progress
  entry):
  1. the SDK's own per-session initial pathname, if it exposes one on events or through its
     session-props API (for example `$session_entry_pathname` or
     `$client_session_initial_pathname`), mapped through `getPageContext`: this survives a
     consented reload without new storage;
  2. otherwise the pathname of the first event of any kind the hook sees for the current
     `$session_id` (`$web_vitals` and `$pageleave` arrive even when the landing `$pageview`
     does not), kept as `{ sessionId, entryPageType }` in module memory; a new `$session_id`
     resets it. In consented mode a reload then restarts the entry: documented, no storage.
  - Memory mode: a full page load is a new person and session, so the entry is lost on reload
    (documented in spec 05).
  - E8 and E9 readouts that split by entry page are valid only after FR-13 is fixed and
    verified; spec 05 says so.
- `ref`, `ref_type`, `utm_*` first-touch handling stays exactly as it is.
- Put the merge logic in a pure function (`withPageContext(event, state)` or similar) in
  `src/lib/analytics/page-context.ts` and test it: context added; own property wins; entry set
  from the session's first event (or the SDK's initial pathname), kept for later events of the
  same session, reset on a new session; `null` event passes through.
- `cost_form_*` events therefore carry `page_type: cost_submit` and the session's
  `entry_page_type`; their local `source` property stays as it is (FR-10). No new form events.
- `docs/architecture.md` §5 states where context is attached and the two limitations above.

## Listing events

- **FR-4:** `listing_detail_viewed` (`src/app/[locale]/[city]/replacement/[id]/client.tsx`) sends
  `listing_type` with the same value as `type`; `type` stays. Same for `interest_modal_opened`
  and `listing_external_contact_clicked` in that file. Contact clicks are not an introduction
  (documented in spec 05, FR-5).
- **FR-12:** `search_performed.results_count` in `src/components/listings/listings-page-client.tsx`
  is the number of listings after the active client filters, not `listings.length`. The event
  fires in `handleFiltersChange` before the new state applies, so extract the inline `useMemo`
  filter (`listings-page-client.tsx:120-170`) into a pure `filterListings(listings, filters)`
  used by both the memo and the event, called with the new filters. Map moves keep firing
  nothing. The server list is capped at 50 (`listings-query.ts`): `results_count` counts within
  that cap; spec 05 documents it. Tests: 10 server listings, a filter leaving 3 →
  `results_count: 3`; a filter leaving 0 → `0`.

## Interest events

FR-6, FR-7 (**Decided**); error codes **Assumption**.

In `src/components/listings/listings-empty-state.tsx`, after `POST /api/city-notify`:

- 2xx → one `listing_interest_saved` with `listing_type` (the page's type), `district_scope`
  (`district` when a district slug was sent, otherwise `city`) and `intent` only when the visitor
  chose a role on this page (prop from spec 02, FR-3; absent otherwise).
- non-2xx or a network error → one `listing_interest_failed` with `error_code` taken from the
  stable `code` field the API returns (spec 02 §Interest API): `consent_required`,
  `invalid_email`, `invalid_input`, `unknown_city`, `unknown_district`, `rate_limited`,
  `server_error`; `network_error` when fetch threw; `server_error` for a response without a
  known `code`. Nothing else is sent: no email, no form text, no response body.
- No success event on an error; one event per submit. The route sends no server event
  (`city_notify_subscribed` / `district_notify_subscribed` were removed, spec 02 §Waitlist
  server events, D32), so this is the only waitlist event (spec 05).
- Pure function `interestOutcomeEvent({ status | networkError, listingType, districtSlug, intent })`
  → `{ event, properties }`, tested for each code and for both scopes.

## Telegram link click

FR-11 (**Decided**). `src/components/costs/telegram-bot-cta.tsx` fires `telegram_bot_opened`
with `source` (`checker` | `empty`, the existing prop) and `has_building_context`
(`buildingId` present) on click, without blocking navigation (the link opens as now). The
checker's existing `checker_cta_clicked {cta: 'telegram'}` stays. PRD 2 later adds
`source=guide_deposit`: keep `source` a union type in one place.

## Building view

FR-9 (**Decided**), names **Assumption**. `building_detail_viewed` keeps `building_id`,
`building_slug`, `city` and adds `report_count` (visible reports), `user_count`, `import_count`,
`scraped_count`. The building page server passes the counts; after spec 03 lands they come from
the figure contract (`sourceCounts`). Example: reports `user, user, scraped` → `report_count 3,
user_count 2, import_count 0, scraped_count 1`.

## Answer quality on web check events

H3 / E9 need to tell a building answer from an area reference or from nothing. After spec 03
lands, `address_checked` (checker, successful in-city check) and `building_detail_viewed` add
`answer_level` (`building` | `district` | `city` | `none`), `source_kind` (`tenant` | `mixed` |
`asking` | `none`), `n` (N of the headline metric shown, 0 when none) and `incomplete` (true
when the headline is a known-part total). One pure function in `src/lib/cost-figures.ts`
(`answerProperties(summary, reference)`) builds them for the website and the bot
(`checkEventProperties`, spec 04). Existing properties (`has_data`, `outside_city`, …) stay.

## Landing capture

FR-13, **Decided** (Q-1, D22, 2026-11-19): PRD 2 FR-1 moved into PRD 1. PRD 2 version 0.2 no
longer holds it; the criteria below are the source. Consent model and identity unchanged (D10).

Who and when: any visitor's browser, on a full page load of any route. Result: the landing
`$pageview` and every capture issued while the first page mounts reach PostHog exactly once.
The cause (captures before `posthog.init`, because the child `PostHogPageView` effect runs
before the provider's own effect) is an **Assumption** that the first test must prove.

1. The agent first writes a test that fails on the current code. If it cannot reproduce the
   loss, the task is blocked with the finding instead of changing the provider.
2. Given `NEXT_PUBLIC_POSTHOG_KEY` is set and a test double of posthog-js that drops `capture`
   calls made before `init` (posthog-js has such an uninitialised-capture guard), when a page
   mounts, then the double records exactly one `$pageview` with `$current_url` after `init`.
3. Given the same double, when the building page mounts, then it records one
   `building_detail_viewed` (a mount-time capture is not dropped).
4. Given a client-side navigation to another route, then exactly one more `$pageview` is
   recorded; a re-render with the same pathname and search params records none.
5. Given no key, then neither `init` nor `capture` runs and every page renders (unchanged).
6. Persistence stays `memory` until consent and upgrades to `localStorage+cookie` on accept;
   the analytics identity is unchanged (D10); the existing consent tests pass unchanged.
7. The `before_send` page context above still attaches to every event after `init` moves.
8. `docs/architecture.md` §5 states where `init` runs and why no capture can precede it;
   the validity note and §Limitations of `docs/analytics/activation-funnels.md` say the fix is
   built and must be verified in Live Events after deploy.

Edge cases: SDK blocked by an ad blocker → pages work, nothing sent; consent accepted on the
landing page → same identity (existing); `init` throws → pages still render. Where `init` runs
(`posthog-provider.tsx` or an earlier point such as `src/instrumentation-client.ts`) is the
agent's choice. After deploy (owner): in the first full week, sessions with `$pageview` on
passflat.com are at least 90 % of sessions with `$web_vitals` (**Assumption**).

## PRD 4 values

PRD 4 FR-8, FR-36 (**Assumption**: the value sets; existing event names only, CLAUDE.md).

- `telegram_bot_opened.source` (`TelegramBotSource`, `src/lib/analytics/telegram-events.ts`) gains
  `home`, `building`, `district`, `hub`, `calculator`, `guide`, `report` (the data report): the
  flatmate callout's bot button on those surfaces (spec 08 §Flatmate callout), always
  `has_building_context: false`, payload `mate_web_<source>`. `checker`, `empty` and `roommate`
  are unchanged.
- Attribution limit: a visitor sent by a callout's roommate link to the roommate page and then
  into the bot is `source: roommate` / `mate_web_roommate`; the surface is known only from the
  earlier `cta_click.placement` of the same web person (spec 08 §Flatmate callout).
- `cta_click.placement` gains `flatmate_callout_<surface>` for the callout's roommate-page link;
  `header_mobile` stays and now leads to the roommate page (spec 08 §Header and footer entries).
- On the bot side nothing changes: `tg_roommate_flow_started` records `entry_source: 'web'` and
  `entry_detail: <surface>` from the payload (spec 04 §Start payloads).
- `docs/analytics/activation-funnels.md` §1 lists the values and §"PRD 4 readout" the queries
  (spec 05 §PRD 4: readout and docs).

## Locale key parity

Supports every copy change of PRD 1 (`CLAUDE.md`: four locale files with identical key sets; no
test enforces it today). A Vitest test (`src/i18n/messages.test.ts`) loads
`src/i18n/messages/{pl,en,ru,uk}.json`, flattens leaf keys and fails with the list of keys that
are missing in any file. On 2026-11-18 the four files had identical key sets (2,081 leaf keys),
so the test should pass on the current tree; if it does not, add the missing keys by copying the
English value and list them in the progress entry as draft copy.
