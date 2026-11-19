# Progress

Written by every loop iteration. Read "Learnings" and the last entries before starting a task.

## Learnings

- The local Supabase stack (project id `passflat`, DB on 127.0.0.1:54322) must be running:
  `supabase start` in the repo root. `.env` (read by the Prisma CLI) and `.env.local` (read by
  Next) both point to it. `.env.prod` holds production credentials and is never used by tools.
- Create migrations with `npx prisma migrate dev --name <name>` (add `--create-only` to edit the
  SQL first). Never add RLS statements to migrations: the owner switches RLS on in the
  dashboard; name the new table under "Owner review".
- `npm test` runs Vitest on `src/**/*.{test,spec}.{ts,tsx}` only; `e2e/` is Playwright.
- `npm run test:e2e` builds into `.next-e2e` and serves on port 3100 (never reused; a busy 3100
  fails the run). It is safe while the owner's dev server runs on 3000. Iterations use ports
  3100–3199 for their own servers; port 3100 belongs to e2e runs.
- `npm run knip` is part of CI and of the pre-push hook: a new file must be imported or listed
  as an entry in `knip.json`; a new dependency must be used.
- The husky pre-commit hook runs lint-staged (ESLint fix and Prettier on staged files); if it
  rewrites files, stage them again before committing.
- Copy changes touch all four files in `src/i18n/messages/` (`pl`, `en`, `ru`, `uk`) with
  identical key sets. Bot copy is RU and UK in `src/lib/bot/texts.ts` and `deposit-texts.ts`.
- PostHog is disabled locally (key commented out): test analytics with a mocked client around
  the capture call; never enable a real key.
- Pipes and `;`-chained commands may be denied by the loop permissions; run one plain allowed
  command per Bash call.
- The gate is `npm run verify` (lint, typecheck, knip, test, build; stops at the first failure).
- `npm run build` rewrites `next-env.d.ts` (`.next/dev/types` → `.next/types`), and so does
  `npm run test:e2e` (→ `.next-e2e/types`): run `git restore next-env.d.ts` before committing.
- Knip prints unlisted dependencies, unused exports and types as warnings (`knip.json` rules)
  and exits 0; only unused files and dependencies fail it. The current warnings pre-date the loop.
- `src/i18n/messages.test.ts` enforces identical leaf key sets across the four locale files;
  run `npx vitest run src/i18n/messages.test.ts` after any copy change to list missing keys.
- `src/lib/analytics/page-context.test.ts` compares the static route lists with the directories
  under `src/app/[locale]/` and `[city]/`: a new route directory must be added to
  `STATIC_TOP_LEVEL_ROUTES` / `STATIC_CITY_ROUTES` (and mapped) or the test fails.
- `npm run verify 2>&1 | tail` hides the exit code; redirect to a scratchpad log and echo `$?`.
- Every client PostHog event already gets `page_type`, `locale`, `city`, `listing_type` and
  `entry_page_type` from the `before_send` hook (`src/lib/analytics/page-context.ts`); a capture
  call adds only its own properties (an own property overrides the hook's value).
- posthog-js internals are readable in `node_modules/posthog-js/lib/src/*.js` (unminified).
- A client component's capture call can be unit-tested without a DOM: `vi.mock` `next-intl` and
  `posthog-js/react` (capture from `vi.hoisted`), call the component as a function and invoke
  `element.props.onClick()` (example: `src/components/costs/telegram-bot-cta.test.ts`).
- A component with `useState`/`useEffect` can be called the same way when the test mocks `react`
  (spread `importOriginal`, stub the two hooks) and walks `props.children` to the handler
  (example: `src/components/listings/listings-empty-state.test.ts`, with `fetch` stubbed).

## Log

### 2026-11-18 23:26 · T000 · done

- Done: added the `verify` script to `package.json` (`npm run lint && npm run typecheck && npm run knip && npm test && npm run build`); `docs/development-workflow.md` "The gate" now names `npm run verify` without the "once T000 adds it" / "until the script exists" sentences; the matching "once it exists (task T000)" phrase in `CLAUDE.md` replaced. `.github/workflows/ci.yml` untouched.
- Checks: `npm run verify` passed (lint clean, typecheck clean, knip exit 0 with pre-existing warnings only, Vitest 29 files / 312 tests passed, `next build` succeeded).
- Did not work: nothing.
- Owner review: nothing.
- Next: T001 (move `npm run test:e2e` to its own port and build directory).

### 2026-11-18 23:33 · T001 · done

- Done: `playwright.config.ts` takes the port from one `PORT` constant (3100); `baseURL` and the dummy `NEXT_PUBLIC_APP_URL` follow it; the web server runs `npm run build && npm run start -- --port 3100` with `NEXT_DIST_DIR=.next-e2e` in its env and `reuseExistingServer: false`. `next.config.mjs` reads `distDir` from `NEXT_DIST_DIR` (default `.next`). `.next-e2e/` added to `.gitignore` (which knip honours), `.prettierignore` and the ESLint ignores; `.next-e2e/types/**/*.ts` and `.next-e2e/dev/types/**/*.ts` added to `tsconfig.json` `include` so the e2e build does not rewrite tsconfig. Docs: `docs/development-workflow.md` (end-to-end section, commands table), `docs/architecture.md` (tests), `CLAUDE.md` (verification paragraph), `docs/specs/README.md` (harness row Done), Learnings here. CI workflow unchanged (its job-level `NEXT_PUBLIC_APP_URL: http://localhost:3000` is overridden by the web server env).
- Checks: `npm run verify` passed twice (before and with `.next-e2e/` present: lint clean, typecheck clean, knip exit 0 with the same pre-existing warnings, Vitest 29 files / 312 tests, build OK). `npm run test:e2e` passed (2/2) and `CI=1 npm run test:e2e` passed (2/2) while the owner's dev server on 3000 stayed up (same PID before and after). Negative check: with a throwaway server on 3100, `npx playwright test` failed with "http://localhost:3100 is already used"; server stopped afterwards. `prettier --file-info` reports `.next-e2e` ignored; `git status` shows no `.next-e2e` entries.
- Did not work: nothing. Note: the e2e build rewrites `next-env.d.ts` to `.next-e2e/types/routes.d.ts` (restored with `git restore next-env.d.ts`).
- Owner review: nothing. The CI e2e job itself was not run (no push); local CI-mode run passed.
- Next: M0 harness tasks are done; the next work comes from decomposing PRD 1 into specs and tasks.

### 2026-11-19 00:50 · T003 · done

- Done: new `src/i18n/messages.test.ts` reads `src/i18n/messages/{pl,en,ru,uk}.json` with `fs`, flattens leaf keys to dotted paths (anything that is not a nested object is a leaf), and fails with one line per gap (`ru.json is missing "common.appName"`) across all four files; a second case guards against an empty catalog. No locale file changed: all four have the same 2,081 leaf keys (strings only, no arrays).
- Checks: `npx vitest run src/i18n/messages.test.ts` passed (2/2). Negative check, not committed: deleting `common.appName` from `ru.json` failed the test with `ru.json is missing "common.appName"` in the message; the file was restored with `git restore`. `npm run verify` passed (lint clean, typecheck clean, knip exit 0 with the same pre-existing warnings, Vitest 30 files / 314 tests, build OK); `next-env.d.ts` restored after the build.
- Did not work: nothing.
- Owner review: nothing (no draft copy, no assumptions, no tables, no migrations).
- Next: the next `todo` task of M1 in `ralph/tasks.json`; copy tasks can rely on `src/i18n/messages.test.ts` to catch missing keys.

### 2026-11-19 00:54 · T004 · done

- Done: new `src/lib/analytics/page-context.ts` exports `getPageContext(pathname)` → `{ page_type, locale, city, listing_type? }` per the spec table, `PAGE_TYPES` (the one constant of `page_type` values), `STATIC_TOP_LEVEL_ROUTES` (the 16 static directories under `src/app/[locale]/`) and `STATIC_CITY_ROUTES` (the 8 static directories under `[city]/`; any other second segment is a district → `costs`). Locales come from `routing.locales`; no prefix → `pl`. Query, hash and trailing slashes are ignored; unknown deeper paths are `other`. `src/lib/analytics/page-context.test.ts` (37 cases): all 8 golden examples, `/sublet` and `/replacement` list pages (`other` + `listing_type`), `/warsaw/review` (`other`), roommate/replacement details, costs/share/calculator/check/resources/blog, a set of `other` paths, every static route never read as a city, and two tests that compare both route lists with the file system so a new route directory fails the test.
- Checks: `npx vitest run src/lib/analytics/page-context.test.ts` passed (37/37). `npm run verify` exit 0 (lint clean, typecheck clean, knip exit 0 with the pre-existing warnings only and none for the new module, Vitest 31 files / 351 tests, build OK); `next-env.d.ts` restored after the build.
- Did not work: nothing. The type `PageType` is kept module-private so knip reports no new unused export; export it when T005 (`withPageContext`) needs it.
- Owner review: Assumption applied — the whole value mapping lives in `src/lib/analytics/page-context.ts`; `blog` is a `page_type` value (Assumption, Q-12) covering `/blog` and `/blog/<slug>` (including the static `/blog/warsaw-rent-prices`). No copy, tables or migrations.
- Next: the `before_send` merge (`withPageContext` + `entry_page_type`) in the same module, per spec 01 §Attaching; it can call `getPageContext` directly.

### 2026-11-19 01:00 · T005 · done

- Done: `src/lib/analytics/page-context.ts` adds the pure `withPageContext(event, pathname, entry)` → `{ event, entry }` and `createPageContextHook(getPathname)` (a `BeforeSendFn` that keeps the session entry in a closure). Every event except `$snapshot` gets `getPageContext(pathname)` plus `entry_page_type` spread under its own properties (own property wins; the input event is not mutated; `null` passes through). `posthog-provider.tsx` passes `before_send: createPageContextHook(() => window.location.pathname)` to `posthog.init`; nothing else in the provider changed (persistence, consent upgrade, `register_once` for ref/utm untouched; init still skipped without `NEXT_PUBLIC_POSTHOG_KEY`). Entry choice: option 1 — posthog-js 1.374.3 adds `$session_entry_pathname` to every event (`lib/src/session-props.js` `getSessionProps`, called from `calculateEventProperties` before `before_send`; it is the URL at which the `$session_id` started, kept in the SDK's own persistence). Only an event without it falls back to option 2 (first event per `$session_id` in memory). `docs/architecture.md` §5 states where context is attached and the two limitations. 11 new tests in `page-context.test.ts`.
- Checks: `npx vitest run src/lib/analytics/page-context.test.ts` passed (48/48). `npm run verify` exit 0 (lint clean, typecheck clean, knip exit 0 with the pre-existing warnings only, Vitest 31 files / 362 tests, build OK). `npm run test:e2e` passed (2/2). `next-env.d.ts` restored.
- Did not work: nothing.
- Owner review: Assumption applied — the mechanism (SDK `before_send`, entry from `$session_entry_pathname` with the in-memory first-event fallback) lives in `src/lib/analytics/page-context.ts`; `$snapshot` (session recordings) is passed through untouched. No copy, tables or migrations. After deploy: check in PostHog Live Events that events carry `page_type`, `locale`, `city`, `entry_page_type`.
- Next: the next `todo` task of M1; events need no own `page_type`/`locale`/`city` now, the hook adds them.

### 2026-11-19 01:03 · T006 · done

- Done: new pure `listingEventProperties(listingId, listingType, extra?)` in `src/lib/analytics/listing-events.ts` → `{ ...extra, listing_id, type, listing_type }` (base fields applied last, so `listing_type` always equals `type`). `src/app/[locale]/[city]/replacement/[id]/client.tsx` (rendered for all three listing types) uses it for `listing_detail_viewed`, both `interest_modal_opened` call sites (CTA and `source: 'sticky_bar'`) and `listing_external_contact_clicked` (via `trackContactClick`); every other property is unchanged, `type` stays, and the `listing_detail_viewed` effect still depends on `[listing.id]` only. `src/lib/analytics/listing-events.test.ts` (5 cases): roommate, sublet, replacement, extras kept, extras cannot override the base fields. No doc change: `docs/architecture.md` lists event names only.
- Checks: `npx vitest run src/lib/analytics/listing-events.test.ts` passed (5/5). `npm run verify` exit 0 (lint clean, typecheck clean, knip exit 0 with the pre-existing warnings only and none for the new module, Vitest 32 files / 367 tests, build OK); `next-env.d.ts` restored.
- Did not work: nothing.
- Owner review: nothing (no copy, assumptions, tables or migrations). After deploy: check in PostHog Live Events that the three events carry `listing_type` equal to `type`.
- Next: the next `todo` task of M1 (FR-12, `filterListings` for `search_performed.results_count`, is in the same spec section).

### 2026-11-19 01:06 · T007 · done

- Done: new pure `filterListings(listings, filters)` in `src/lib/listings-filter.ts`, the inline `useMemo` filter of `src/components/listings/listings-page-client.tsx` moved verbatim (price on `totalCost`, bedrooms ≥, districts by display name, area, availableFrom/To, amenities all-of, roomType, preferredGender with `any`, utilities, internet, floor with `!= null`, photos, registration). The memo calls it with `deferredFilters`; `search_performed.results_count` is now `filterListings(listings, newFilters).length` inside `handleFiltersChange` (callback deps `listings.length` → `listings`). Other event properties, `handleBoundsChange` (map moves fire nothing) and the roommate/sublet/replacement pages (same component) are otherwise unchanged. `src/lib/listings-filter.test.ts` (14 cases): 10 listings → 3, → 0, no filters → 10, one case per filter incl. price on `totalCost` vs base price, district display name vs slug, gender `any`, floor 0, input not mutated. No doc change: spec 05 documents the 50-listing cap.
- Checks: `npx vitest run src/lib/listings-filter.test.ts` passed (14/14). `npm run verify` exit 0 (lint clean, typecheck clean, knip exit 0 with the pre-existing warnings only and none for the new module, Vitest 33 files / 381 tests, build OK); `next-env.d.ts` restored.
- Did not work: nothing. The capture call itself has no component test (no React testing library in the repo; not added).
- Owner review: nothing (no copy, assumptions, tables or migrations). After deploy: check in PostHog Live Events that `search_performed.results_count` changes with the filters (counted within the 50-listing server cap).
- Next: the next `todo` task of M1 in `ralph/tasks.json`.

### 2026-11-19 01:09 · T008 · done

- Done: new `src/lib/analytics/telegram-events.ts` exports `TelegramBotSource` (`'checker' | 'empty'`, the one place PRD 2 adds `guide_deposit`) and the pure `telegramBotOpenedProperties(source, buildingId?)` → `{ source, has_building_context: Boolean(buildingId) }`. `src/components/costs/telegram-bot-cta.tsx` takes `source: TelegramBotSource`, calls `usePostHog()` before the early return and adds an `onClick` that captures `telegram_bot_opened` with those properties (no `preventDefault`; `href`, `target`, `rel`, payload unchanged; still `null` without `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`). The checker's `onClickCapture` wrappers with `checker_cta_clicked {cta: 'telegram'}` in `check/client.tsx` are untouched, so a checker click fires both events. Tests: `src/lib/analytics/telegram-events.test.ts` (4) and `src/components/costs/telegram-bot-cta.test.ts` (5: renders null without the env, link unchanged with `b_<id>` and `web_<source>` payloads, one capture per click, no building → `false`). `docs/architecture.md` event table lists `telegram_bot_opened` in the Checker row (Prettier realigned the table).
- Checks: `npx vitest run` on the two new files passed (9/9). `npm run verify` exit 0 (lint clean, typecheck clean, knip exit 0 with the pre-existing warnings only and none for the new module, Vitest 35 files / 390 tests, build OK); `next-env.d.ts` restored.
- Did not work: nothing.
- Owner review: nothing (no copy, assumptions, tables or migrations). After deploy (with the bot username set): check in PostHog Live Events that a click on the checker's bot link sends `telegram_bot_opened` with `source` and `has_building_context` next to `checker_cta_clicked {cta: 'telegram'}`.
- Next: the next `todo` task of M1 in `ralph/tasks.json`.

### 2026-11-19 01:12 · T009 · done

- Done: new `src/lib/analytics/building-events.ts` exports `ReportSourceCounts`, the pure `reportSourceCounts(sources)` → `{ report_count, user_count, import_count, scraped_count }` (`report_count` = all visible reports; a source other than `user` / `import` / `scraped` counts only in the total) and `buildingDetailViewedProperties(building, citySlug, counts)` → `{ building_id, building_slug, city, ...counts }`. `building/[slug]/page.tsx` passes `sourceCounts={reportSourceCounts(reports.map((r) => r.source))}` (reports are the `isVisible: true` rows it already loads); `client.tsx` takes the `sourceCounts` prop and captures `building_detail_viewed` with `buildingDetailViewedProperties(...)`; the effect still depends on `[building.id]` only, so it fires once per building id. `src/lib/analytics/building-events.test.ts` (5 cases): spec example `user, user, scraped` → 3/2/0/1, zero reports → all zeros, import counts, unknown source in the total only, event properties keep `building_id`, `building_slug`, `city`. No doc change: `docs/architecture.md` lists event names only.
- Checks: `npx vitest run src/lib/analytics/building-events.test.ts` passed (5/5). `npm run verify` exit 0 (lint clean, typecheck clean, knip exit 0 with the pre-existing warnings only and none for the new module, Vitest 36 files / 395 tests, build OK); `next-env.d.ts` restored.
- Did not work: nothing. The capture call itself has no component test (the 1,000-line client runs it in `useEffect`; no React testing library in the repo).
- Owner review: Assumption applied — the property names `report_count`, `user_count`, `import_count`, `scraped_count` live only in `src/lib/analytics/building-events.ts`. No copy, tables or migrations. After deploy: check in PostHog Live Events that `building_detail_viewed` carries the four counts next to `building_id`, `building_slug`, `city`.
- Next: the next `todo` task of M1; T019 swaps `reportSourceCounts(...)` in `page.tsx` for the figure contract's `sourceCounts` (map `user`/`import`/`scraped` to the `_count` names in `building-events.ts`).

### 2026-11-19 01:18 · T010 · done

- Done: new `src/lib/analytics/interest-events.ts` exports `RoommateIntent` (`find_room` | `offer_room`, spec 02), the pure `interestOutcomeEvent({ status, code? } | { networkError: true }, listingType, districtSlug, intent? })` → `{ event, properties }` and `responseErrorCode(res)` (reads only the `code` field of an error body, never throws). 2xx → `listing_interest_saved {listing_type, district_scope: district|city, intent?}` (`intent` only when set); otherwise `listing_interest_failed {error_code}` and nothing else: a known API `code` wins, else the status fallback (429 `rate_limited`, 400 `invalid_input`, any other status `server_error`), `network_error` when fetch threw. `src/components/listings/listings-empty-state.tsx` takes an optional `intent` prop (not passed yet; the role selector of spec 02 does it), computes one outcome per submit and captures it once; success/error UI state unchanged (success iff 2xx, as `res.ok` before). Tests: `src/lib/analytics/interest-events.test.ts` (26: both scopes, with/without intent, 2xx/3xx, every API code, status fallback incl. 404/403, unknown and non-string code, network error, failed sends only `error_code`, `responseErrorCode` on JSON/no code/non-JSON/null) and `src/components/listings/listings-empty-state.test.ts` (6: mocked `react` `useState`/`useEffect`, `fetch` stubbed; one saved event with district/city scope and intent, one failed event with code / status fallback / network error and no success state, logged-out form sends the email to the API but not to the event). `docs/architecture.md` Listings row lists both events (Prettier realigned the table).
- Checks: `npx vitest run` on the two new files passed (32/32). `npm run verify` exit 0 twice (second run after Prettier: lint clean, typecheck clean, knip exit 0 with the pre-existing warnings only and none for the new module, Vitest 38 files / 427 tests, build OK); `next-env.d.ts` restored.
- Did not work: nothing.
- Owner review: Assumption applied — the `error_code` set and the status fallback live only in `src/lib/analytics/interest-events.ts` (`API_ERROR_CODES`, `errorCodeFromStatus`). No copy, tables or migrations. After deploy: check in PostHog Live Events that a waitlist submit on an empty listings page sends exactly one `listing_interest_saved` (or `listing_interest_failed` with `error_code`) and no email.
- Next: the next `todo` task of M1; T011 adds the API `code` field (the client already reads it), and the spec 02 role selector passes `intent` to `ListingsEmptyState`.

### 2026-11-19 01:24 · T011 · done

- Done: `src/app/api/city-notify/route.ts` validates `listingType` and `districtSlug` independently (`optionalTrimmed`: missing/null → `''`, string → trimmed, other type → `invalid_input`) and stores exactly one class: city launch (`''`/`''`, free-text city, no lookup), listings whole city (type/`''`) or listings district (type/slug). Listings classes need an existing `City.slug` (400 `unknown_city`) and, with a district, a district of that city (400 `unknown_district`); a district without type and an unknown type are 400 `invalid_input`. Only city launch sends `cityNotifyConfirmation` and fires `city_notify_subscribed`; both listings classes fire `district_notify_subscribed` with `listingType` and `districtSlug` (`''` for the whole city). Every error JSON is `{ error, code }` via `errorResponse` (existing texts kept; new texts `listingType required`, `Invalid listing type or district`); a non-object JSON body or non-string city is now `invalid_input` instead of a 500. A P2002 on the upsert (reuses `isPrismaUniqueConstraintError` from `src/lib/location-checker.ts`) returns 200 `{ success: true }` without a second event or e-mail (the winning request does both). Unique key, rate limit, consent check, e-mail validation and session e-mail fallback unchanged. New `src/app/api/city-notify/route.test.ts` (29 tests; mocked `@/lib/prisma`, `@/lib/email/send`, `@/lib/posthog-server`, `@supabase/ssr`, `next/headers`; real rate limiter reset per test): old Kraków city form body, whitespace/empty fields as city launch, session e-mail, confirmation failure still 200, roommate without district (stored as `roommate`, no e-mail), missing districtSlug, district class, unknown city (whole city and district), district of another city, district without/blank type, unknown/non-string type or district, repeat → same unique key, P2002 → 200, other DB error → 500 `server_error`, 429 `rate_limited`, bad JSON/null/array/missing/blank/non-string city, consent, invalid/missing e-mail. `docs/architecture.md` data-model row describes the three classes.
- Checks: `npx vitest run src/app/api/city-notify/route.test.ts` passed (29/29). `npm run verify` exit 0 (lint clean, typecheck clean, knip exit 0 with the pre-existing warnings only, Vitest 39 files / 456 tests, build OK); `next-env.d.ts` restored.
- Did not work: nothing.
- Owner review: no copy, assumptions, tables or migrations. Behaviour change to note: whole-city roommate/sublet/replacement requests no longer get the city-launch confirmation e-mail and are stored with their `listingType` (spec 02, FR-17); a P2002 race loser returns 200 without tracking or e-mailing. After deploy: in PostHog Live Events a roommate submit without a district sends `district_notify_subscribed` with `districtSlug: ''`, and the landing form still sends `city_notify_subscribed`.
- Next: T012 (or the next `todo` task of M2): `/api/cron/city-launch` selects only `listingType: ''`, `districtSlug: ''` rows (spec 02 §City-launch mailing).

### 2026-11-19 01:27 · T012 · done

- Done: `src/app/api/cron/city-launch/route.ts` now selects `{ cityNormalized, listingType: '', districtSlug: '', consent: true, notifiedAt: null }` (before: `cityNormalized` and `notifiedAt` only, so listings-interest rows and non-consenting rows were mailed). Nothing else changed: auth, body validation, e-mail template and data, `notifiedAt` update after a successful send, response shape. No data migration: old rows whose type was lost stay selectable (spec 02). New `src/app/api/cron/city-launch/route.test.ts` (6 tests; mocked `@/lib/prisma` and `@/lib/email/send`, so Resend is never called): exact `where` (city trimmed and lower-cased), no extra keys that could widen it to listings rows, 401 for no header / wrong secret / secret without `Bearer` with no query, send or update, send→update order per row, a failed send leaves `notifiedAt` unset and is counted in `failed`, 400 for missing city/citySlug and bad JSON. `docs/architecture.md` cron table row describes the selection.
- Checks: `npx vitest run src/app/api/cron/city-launch/route.test.ts` passed (6/6). `npm run verify` exit 0 (lint clean, typecheck clean, knip exit 0 with the pre-existing warnings only, Vitest 40 files / 462 tests, build OK); `next-env.d.ts` restored.
- Did not work: nothing.
- Owner review: no copy, assumptions, tables or migrations. Behaviour change: a manual city-launch run no longer mails listings-interest rows or rows with `consent: false`. Out of scope, recorded for the owner (spec 02): (1) overlapping manual runs of `/api/cron/city-launch` can double-send — `notifiedAt` is written per row only after its send, with no lock or claim, so two runs for the same city started before the first finishes both select the same rows; (2) the e-mail links to `/<citySlug>/replacement`, the frozen listings page (Q-16).
- Next: the next `todo` task of M2 in `ralph/tasks.json`.
