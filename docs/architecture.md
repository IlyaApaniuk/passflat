# Passflat architecture

Checked against the source on 2026-11-18 (branch `chore/agent-harness`). This file replaces the root
`ARCHITECTURE.md` (Russian, 2026-06-21), which is outdated. Paths are relative to the repo root.
**Unverified** marks claims the code cannot confirm. If this file and the code disagree, the code
is right; update this file in the same change.

## 1. Stack

| Layer       | Technology (package.json range, installed version)                                                                               | Where                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Framework   | Next.js App Router `16.2.6`, React `^19` (19.2.6), TypeScript 5.7.3                                                              | `src/app`, `next.config.mjs`                                                 |
| UI          | Tailwind CSS 4 via `@tailwindcss/postcss` (no `tailwind.config`), shadcn/ui on Radix, framer-motion, recharts                    | `src/components/ui`, `components.json`, `src/app/globals.css`                |
| Database    | Supabase Postgres (the local stack runs Postgres 17)                                                                             | `supabase/config.toml`                                                       |
| ORM         | Prisma `^6.8.2` (6.19.3). `DATABASE_URL` is the runtime connection, `DIRECT_URL` the migration one                               | `prisma/schema.prisma`, `src/lib/prisma.ts`                                  |
| Auth        | Supabase Auth through `@supabase/ssr` 0.6.1: password, magic link, Google OAuth. Mail goes out via `admin.generateLink` + Resend | `src/app/[locale]/auth/actions.ts`, `auth/callback/route.ts`                 |
| i18n        | next-intl `^4.1.4` (4.12.0)                                                                                                      | `src/i18n/`                                                                  |
| Maps        | Mapbox GL `^3.11.1` via react-map-gl 7                                                                                           | `src/components/map/`                                                        |
| Geocoding   | Google Places autocomplete in the browser; Google Geocoding API on the server (bot only)                                         | `src/components/listings/address-autocomplete.tsx`, `src/lib/bot/geocode.ts` |
| Payments    | Stripe `^22.2.0`, API version `2026-05-27.dahlia`, Checkout `mode: 'payment'` only                                               | `src/lib/stripe.ts`, `src/app/api/checkout/*`                                |
| Email       | Resend `^4.5.1` + React Email templates                                                                                          | `src/lib/email/`, `src/lib/resend.ts`                                        |
| Analytics   | PostHog (posthog-js 1.374, posthog-node 5.21), GA4 (loads only after consent), Vercel Analytics + Speed Insights                 | `src/components/providers/`, `src/lib/posthog-server.ts`                     |
| Bot         | grammY `^1.46.0`; Anthropic SDK `^0.131.0` (model `claude-opus-5-5`) reads the lease                                             | `src/lib/bot/`, `src/app/api/telegram/webhook/route.ts`                      |
| Translation | DeepL (listing translation only)                                                                                                 | `src/lib/deepl.ts`                                                           |
| Hosting     | Vercel, region `fra1`, Vercel Cron                                                                                               | `vercel.json`                                                                |
| Tooling     | Vitest 4, Playwright 1.60, knip 6, ESLint 9, Prettier 3, husky (pre-commit lint-staged, pre-push knip)                           | `package.json`, `.husky/`                                                    |

## 2. Product surfaces

The routes below leave out the locale prefix: `pl` has none, the other locales add `/en`, `/ru` or `/uk`. The city slug
in code is `warsaw`. The checker and review pages work only for `LOCATION_CHECKER_CITY_SLUG = 'warsaw'`
(`src/lib/location-checker.ts`).

| Surface                            | Status                                                                                               | Pages (`src/app/[locale]/…`)                                                                                                                                                                                                                    | API / jobs                                                                                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cost transparency (pillar 1)       | Active, leads the header nav (`components/landing/header.tsx:100-109`)                               | `/` landing; `/[city]` hub; `/[city]/[district]`; `/[city]/building/[slug]`; `/[city]/costs` overview + `CostsMap`; `/[city]/costs/submit` form (open to anonymous users); `/[city]/costs/share`; `/[city]/calculator`; `/[city]/check` checker | `POST/GET /api/cost-reports`, `GET/PATCH /api/cost-reports/[id]`, `/api/cost-reports/mine`, `GET/POST /api/location-score`, `/api/buildings/[id]/follow`, `/api/buildings/[id]/location-score`, `/api/cost-access` |
| Building tags ("building reviews") | Active. `BuildingTag` docs in the schema call it pillar 2                                            | `/[city]/review`; tag picker on the checker and on the submit thank-you screen                                                                                                                                                                  | `POST /api/building-tags`                                                                                                                                                                                          |
| Moderation                         | Active, email allowlist `COST_IMPORT_ADMIN_EMAILS` (`src/lib/admin-auth.ts`)                         | `/admin/cost-reports`, `/admin/reports`                                                                                                                                                                                                         | `/api/admin/cost-reports[/id]`, `/api/admin/reports/[id]`                                                                                                                                                          |
| Listings / tenant replacement      | **FROZEN** (pivot 2026-06-20): present in code, not extended                                         | `/[city]/replacement`, `/[city]/roommate`, `/[city]/sublet` and their `/[id]` pages (all render `replacement/[id]/client.tsx`); `/create-listing`; `/messages`; `/dashboard` (listings section)                                                 | `/api/listings*`, `/api/upload` (bucket `listing-photos`), `/api/conversations*`, `/api/favorites*`, `/api/reports`, `/api/listings/[id]/translate`, crons `expire-listings`, `expiring-listings`, `cleanup-*`     |
| Document templates                 | Active, env toggle `NEXT_PUBLIC_FEATURE_DOCUMENT_TEMPLATES` (default on, `src/lib/feature-flags.ts`) | `/resources` (404 when off); download blocks on blog, how-it-works, listing pages, chat hint                                                                                                                                                    | Static files in `public/documents/`, built by `scripts/build-templates.sh` from `docs/legal-templates/`                                                                                                            |
| Blog                               | Active: 13 articles × 4 locales (`src/content/blog/<slug>-<locale>.mdx`, `src/lib/blog.ts`)          | `/blog`, `/blog/[slug]`, `/blog/warsaw-rent-prices` (live data report, `force-dynamic`)                                                                                                                                                         | none                                                                                                                                                                                                               |
| Telegram bot                       | Built; inert until `TELEGRAM_BOT_TOKEN` is set (webhook answers 503)                                 | none (site CTA `components/costs/telegram-bot-cta.tsx` renders only when `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is set)                                                                                                                            | `POST /api/telegram/webhook`, cron `telegram-followups`                                                                                                                                                            |
| Affiliate links                    | Active in `bank-account-rent-poland-*` posts                                                         | `blog/[slug]/client.tsx`: `AFFILIATE_HOSTS = ['connectorlink.online', 'prf.hn']` (prf.hn = Partnerize, Wise) get `rel="sponsored nofollow"` and an `affiliate_link_clicked` event. MyLead verification meta tag in `src/app/layout.tsx`         | none                                                                                                                                                                                                               |
| Payments                           | Dormant (see below)                                                                                  | `/pricing` calls `notFound()` (`pricing/page.tsx`); `pricing/client.tsx` is kept as a knip entry                                                                                                                                                | `/api/checkout/listing`, `/api/checkout/cost-access`, `/api/webhooks/stripe`, `/api/payments[/id/receipt]`                                                                                                         |
| Account and misc                   | Active                                                                                               | `/auth/*`, `/dashboard`, `/account-deleted`, `/email/unsubscribe`, `/about`, `/help`, `/how-it-works`, `/contact`, `/privacy`, `/terms`                                                                                                         | `/api/account` (soft delete, 30 days), `/api/account/recover`, `/api/contact`, `/api/city-notify`, `GET /api/og` (edge)                                                                                            |

**Telegram bot** (`src/lib/bot/README.md`). Supported locales are RU/UK only, and `TelegramChat.locale` defaults to `ru`.

- Address lookup: a building-level answer, with a district fallback, and a city fallback below `MIN_AREA_REPORTS` (`lookup.ts`).
- District names are matched before geocoding (`districts.ts`).
- Building and district subscriptions are stored, but nothing sends them yet: no notifier exists.
- City waitlist for addresses outside Warsaw (`targetKey = "c:<slug>"`).
- Deposit-return flow (`deposit-flow.ts`, `deposit.ts`): five intake questions, a rule-based verdict, a Polish demand letter, and follow-ups from the cron.
- Lease reading (`contract.ts`): Claude structured output with server-side fallback, run after the webhook response via `next/server` `after()`. Without `ANTHROPIC_API_KEY` the contract step fails gracefully.

**Payments in code** (`src/lib/stripe.ts`, `src/lib/pricing.ts`):

- Products are the price IDs `EXTRA_LISTING`, `PROMOTE_7/14/30` and `COST_ACCESS_7/30/90`. `src/lib/pricing.ts` holds display-only PLN amounts, some still marked PLACEHOLDER.
- A listing beyond `FREE_LISTING_LIMIT = 2` active unpaid listings is created as `pending_payment` (`api/listings/route.ts:250-257`).
- Promotion is gated by the PostHog flag `promoted-listings-enabled`. The gate fails closed on the server (`api/checkout/listing/route.ts:70-79`) and also exists on the client (`create-listing/page.tsx`, `dashboard/client.tsx`).
- `/api/checkout/cost-access` has **no** flag gate. The UI only reaches it through the "renew" button, which renders only for users who already have paid access, because cost data is open to everyone (`components/costs/cost-access-card.tsx`).
- The webhook handles `checkout.session.completed`, `checkout.session.expired` and `charge.refunded`. It sets `Listing.isPaid/isPromoted` or `Profile.costAccessUntil`.
- No subscriptions exist anywhere.

## 3. Data model (`prisma/schema.prisma`, 28 models, tables in snake_case via `@@map`)

| Area              | Model                                                | Purpose                                                                                                                                                                                |
| ----------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geography         | `Country`                                            | Currency and locales per country. Code reads it only for `defaultLocale` via `include`                                                                                                 |
|                   | `City`, `District`                                   | Slug, `nameKey`, `bounds` JSON, `isActive`. District polygons for point-in-polygon live in `src/lib/geo/warsaw-districts.json`                                                         |
| Buildings         | `Building`                                           | Address (`addressNormalized` dedupe per city), slug, `placeId`, coordinates, `checksCount`. The checker creates rows                                                                   |
|                   | `BuildingFollow`                                     | A user follows a building; drives the `re-engage` cron                                                                                                                                 |
|                   | `BuildingLocationScore`                              | Cached location score (overall + category JSON) computed from `Poi`                                                                                                                    |
|                   | `BuildingTag`                                        | One row per voter per tag from a closed vocabulary; `voterKey` = profile id or anonymous id                                                                                            |
|                   | `Poi`                                                | OSM points of interest imported by `prisma/import-osm-pois.ts` (`npm run db:import-pois`)                                                                                              |
| Costs             | `CostReport`                                         | One tenant's costs for one building: rent, czynsz, utilities, deposit, tenancy dates, `isVisible`, `source`, claim fields (`importedEmail`, `anonymousId`, `claimedAt`), `confirmedAt` |
|                   | `CostReportPeriodicCharge`                           | Non-monthly charges (bimonthly to annual) attached to a report                                                                                                                         |
|                   | `CostTermLabel`                                      | Per-country cost labels. **No reads or writes in `src/`**                                                                                                                              |
| Users             | `Profile`                                            | `id = auth.users.id` (no FK). Holds `hasContributedCost`, `costAccessUntil`, `deletedAt` (soft delete), `emailsOptOut`, `referredBy`, `lastReengagementAt`                             |
| Listings (frozen) | `Listing`                                            | `type` = `replacement` / `roommate` / `sublet`, pricing, status, promotion, external contacts, photos                                                                                  |
|                   | `ListingPeriodicCharge`, `ListingTranslation`        | Non-monthly charges; DeepL translations per locale                                                                                                                                     |
|                   | `SavedListing`, `ListingView`                        | Favorites; de-duplicated view counter (`viewerHash`)                                                                                                                                   |
|                   | `ListingResponse`                                    | Old inquiry model. **No reads or writes in `src/`**; inquiries now go through `Conversation`                                                                                           |
| Chat (frozen)     | `Conversation`, `ConversationParticipant`, `Message` | Listing chat; live updates through private Supabase Realtime channels (`src/lib/supabase/realtime.ts`)                                                                                 |
| Payments          | `Payment`                                            | Stripe checkout record: `productType` = `listing` / `cost_access`, amount in minor units, consent and refund fields                                                                    |
|                   | `Subscription`                                       | **Unused**: no reads or writes, no subscription checkout                                                                                                                               |
| Moderation        | `Report`                                             | User flag; `/api/reports` accepts `targetType = 'listing'` only                                                                                                                        |
| Waitlist          | `CityNotifySubscription`                             | Email waitlist, three classes: city launch (`listingType = ''`, `districtSlug = ''`), listings whole city (type, `''`), listings district (type, slug); only city launch gets an email |
| Telegram          | `TelegramChat`                                       | One row per chat (`chatId` BigInt). Account-free; `startPayload` holds attribution                                                                                                     |
|                   | `TelegramSubscription`                               | Chat watches `b:<uuid>`, `d:<slug>` or `c:<city>` (city waitlist)                                                                                                                      |
|                   | `DepositCase`                                        | Deposit flow state, verdict inputs, contract reading results, follow-up dates, outcome, `letterParties` (personal data, cleared after 3 days)                                          |

**`CostReport.source`** is set in `src/app/api/cost-reports/route.ts:385-388`. The system author ids are in `src/lib/import-constants.ts`.

- `user`: a normal submission, including anonymous ones. An anonymous report is owned by `ANON_AUTHOR_ID` and carries an `anonymousId` from the `pf_anon` cookie. It is re-pointed to the real account on first login (`src/lib/claim-reports.ts`).
- `import`: an admin "fill on behalf" entry (originally Google Form imports). It is owned by `IMPORT_AUTHOR_ID` and, when an `importedEmail` is given, auto-claimed on that email's login (`auth/callback/route.ts`).
- `scraped`: an admin entry from scraped listings such as Otodom. It is owned by `SCRAPED_AUTHOR_ID` and never claimed. `ADMIN_IMPORT_MODE` picks the admin mode.

How each source is counted:

- The cost medians (`cost-aggregates.ts`, `cost-baselines.ts`, building page baselines) filter on `isVisible` only, so all three sources count. Blending them is the owner's decision (`CLAUDE.md`).
- The checker labels results `tenant`, `mixed` or `scraped` (`location-checker.ts:323-336`).
- The global hourly flood guard counts `source = 'user'` only.
- When an account is hard-deleted, its reports move to `DELETED_AUTHOR_ID` with identifiers stripped (`cron/cleanup-accounts`).

## 4. Request flow and boundaries

- **DB access**: Prisma singleton `src/lib/prisma.ts`, cached on `globalThis` outside production.
  - Server components (20 page files under `src/app/[locale]`) and route handlers query Prisma directly. Client components never do; they call `/api/*`.
  - The one server action module is `src/app/[locale]/auth/actions.ts`.
  - The only Supabase data API (PostgREST) read is in middleware: `profiles.deleted_at` via the anon key, which depends on an RLS policy that allows a user to read their own profile (**unverified**). `src/lib/active-user.ts` repeats this check through Prisma for API routes.
- **Supabase clients** (`src/lib/supabase/`):
  - `server.ts`: cookie-bound, anon key; used by server components, route handlers and server actions.
  - `client.ts`: browser singleton for auth state and Realtime.
  - `admin.ts`: service role; auth admin and `generateLink`.
  - `broadcast.ts`: service role; Realtime `httpSend` pings, no message bodies.
  - `storage-server.ts`: service role; deletes from the `listing-photos` bucket.
  - Some routes build their own clients inline: `api/checkout/cost-access/route.ts`, `cron/cleanup-accounts/route.ts`.
- **Middleware** (`src/middleware.ts`):
  1. Runs next-intl locale routing.
  2. Sets the first-touch `pf_ref` cookie from `?ref=` (`src/lib/referral.ts`).
  3. Sets the `pf_anon` cookie only on `/costs/submit` and `/review` paths. Setting it on every page would put a Set-Cookie on every response and defeat the CDN/ISR cache.
  4. Runs a Supabase `getUser()` only for `/dashboard`, `/create-listing` and `/messages` (redirect to `/auth/login?next=`) and for `/account-deleted`. Soft-deleted users are bounced to `/account-deleted`. All other pages skip the auth round-trip.

  The matcher excludes `/api`, `/_next`, `/_vercel` and files. `/admin` is not a protected path; the admin pages check `getAdminUser()` themselves.

- **Caching**: the cost surfaces carry no cookies or auth, so they can be ISR-cached.
  - Pages with `revalidate = 3600`: city hub, district page, building page, calculator.
  - `unstable_cache` entries tagged `costs`: `getBuildingsData` (300 s, `src/lib/cost-aggregates.ts`), city lookup on `/costs` (600 s), home district medians (300 s), building district/city baselines (300 s).
  - Untagged caches: home stats, top building, about stats, `getCityWithDistricts` (`src/lib/listings-query.ts`, 3600 s).
  - `src/lib/revalidate-costs.ts`: `revalidateCostSurfaces()` expires tag `costs` (`{ expire: 0 }`) and every locale variant of the city, calculator, building and district paths. It is called from the cost-report POST/PATCH and the admin cost-report routes. `revalidateBuildingPage()` is called after tag votes. Neither function throws.
  - `force-dynamic` routes: costs share, admin, email unsubscribe, blog data report, `building-tags`, `location-score`, telegram webhook.
- **Rate limiting**:
  - `src/lib/rate-limit.ts` is an in-memory fixed window per serverless instance, not global. It is used by the auth actions, `/api/contact`, `/api/city-notify` and `/api/listings/[id]/translate`.
  - The checker has its own per-IP limiter (10/min) plus a DB-backed cap on new buildings (200/hour) (`location-checker.ts`).
  - Cost reports have a DB-count limit per submitter and a global one (`api/cost-reports/route.ts:238-262`).
  - The bot allows 12 messages/min per chat (`bot.ts:53-62`).
- **Cron** (`vercel.json`, UTC). Every route is guarded by `requireCronAuth`, which fails closed when `CRON_SECRET` is unset (`src/lib/admin-auth.ts`).

| Path                               | Schedule      | Does                                                                                                                                                                       |
| ---------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/cron/expire-listings`        | `0 3 * * *`   | Marks active listings `expired`: expiry passed; sublet `availableTo` passed; replacement > 60 days or roommate > 30 days without `expiresAt`. Also clears ended promotions |
| `/api/cron/cleanup-accounts`       | `0 4 * * *`   | Hard-deletes profiles soft-deleted ≥ 30 days ago: anonymizes their cost reports, deletes listing photos, the profile and the auth user                                     |
| `/api/cron/cleanup-expired`        | `0 5 * * 0`   | Deletes listings `expired` for ≥ 90 days, with their photos                                                                                                                |
| `/api/cron/cleanup-orphan-photos`  | `0 6 * * *`   | Deletes `pending_payment` listings older than 24 h, with their photos                                                                                                      |
| `/api/cron/expiring-listings`      | `0 8 * * *`   | Emails authors of listings expiring within 3 days                                                                                                                          |
| `/api/cron/telegram-followups`     | `0 9 * * *`   | Clears stale `DepositCase.letterParties`, then sends due deposit follow-ups (skipped when the bot is unconfigured)                                                         |
| `/api/cron/re-engage`              | `0 9 * * 1`   | Emails followers about new reports in followed buildings, and contributors whose newest report has gone stale                                                              |
| `/api/cron/city-launch` (**POST**) | not scheduled | Manual: emails a city's `CityNotifySubscription` rows; body `{ city, citySlug, cityName }`                                                                                 |

## 5. Analytics

- **Client** (`src/components/providers/posthog-provider.tsx`, `src/lib/consent.ts`):
  - `posthog.init` runs only when `NEXT_PUBLIC_POSTHOG_KEY` is set; the host defaults to `https://eu.i.posthog.com`.
  - Capture is on before consent with `persistence: 'memory'`, which writes no cookie and no localStorage.
  - On `accepted` (the localStorage key `passflat-cookie-consent`), `PersistenceUpgrade` calls `set_config({ persistence: 'localStorage+cookie' })` and keeps the same identity. A decline stays in memory mode.
  - Session recording requires consent plus the flag `session-recording-sample`. Surveys are off until consent.
  - `$pageview` is captured manually and registers `ref` / `utm_*` once.
  - Page context is attached in the `before_send` option of `posthog.init` (`createPageContextHook` / `withPageContext` in `src/lib/analytics/page-context.ts`). At send time every event except `$snapshot` gets `page_type`, `locale`, `city` (and `listing_type` on listing pages) from `getPageContext(window.location.pathname)`, plus `entry_page_type`. They go under the event's own properties, so a property the event sends itself wins. `entry_page_type` maps the SDK's `$session_entry_pathname`, which posthog-js keeps per `$session_id` in its own persistence. An event without that property falls back to the pathname of the first event the hook saw for its `$session_id`, kept in module memory. Nothing new is stored.
  - Limitations: in memory mode (no consent) a full page load starts a new person and session, so the entry is lost on reload. In consented mode the memory fallback restarts the entry on reload; the SDK property survives a reload.
  - Feature-flag keys live in `src/lib/feature-flags.ts`.
- **Server** (`src/lib/posthog-server.ts`):
  - Exports `trackServerEvent`, `identifyUser`, `isServerFeatureFlagEnabled` (fails closed), `captureServerException` and `flushPostHog`. The client uses `flushAt: 1`, and routes that must not lose events call `flushPostHog()`.
  - `src/instrumentation.ts` sends `onRequestError` to PostHog.
- **Bot identity**: `src/lib/bot/analytics.ts` sends events as `tg_<chatId>` with `source: 'telegram_bot'`. It never joins the web identity, so the bot is a separate cohort.
- **Event names** are inline string literals at each `capture(` / `trackServerEvent(` / `track(` call. There is no registry. The event list in `src/lib/bot/README.md` is incomplete.
- **Localhost**: `NEXT_PUBLIC_POSTHOG_KEY` is commented out locally (`CLAUDE.md`; agents do not open `.env.local`). Without the key both the client and server wrappers do nothing, so events cannot be checked on localhost. Test the capture call and confirm in PostHog Live Events after deploy.

| Funnel              | Events                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing / CTAs      | `hero_cta_clicked`, `cta_click` (`placement` prop, `TrackedLink`), `cost_submit_cta_clicked`, `cost_data_cta_clicked`, `share_clicked`, `share_completed`                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Cost form           | `cost_form_started`, `cost_form_address_selected`, `cost_form_utilities_detailed`, `cost_form_validation_error`, `cost_form_submit_attempt`, `cost_form_submit_success`, `cost_form_submit_error`, `cost_form_abandoned`, `cost_form_draft_restored`, `cost_form_draft_discarded`, `anon_unlock_cta_clicked`, `anon_duplicate_edit_cta_clicked`, `cost_to_listing_nudge_clicked`; server: `cost_report_submitted`, `referred_contribution`                                                                                                                                                    |
| Checker / review    | `checker_viewed`, `address_checked`, `checker_check_failed`, `checker_cta_clicked`, `telegram_bot_opened` (`source`, `has_building_context`; the site's bot link), `review_page_viewed`, `review_address_resolved`, `review_to_costs_clicked`, `building_tags_submitted`, `location_score_viewed`, `location_map_opened`, `location_map_marker_clicked`, `location_map_building_clicked`; server: `city_notify_subscribed`, `district_notify_subscribed`                                                                                                                                      |
| Building            | `building_detail_viewed`, `building_followed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Calculator          | `calculator_viewed`, `calculator_estimated`, `calculator_cta_clicked`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Listings (frozen)   | `search_performed`, `map_marker_clicked`, `listing_detail_viewed`, `interest_modal_opened`, `listing_external_contact_clicked`, `create_listing_started`, `create_listing_step_completed`, `create_listing_publish_started`, `create_listing_abandoned`, `listing_create_cta_clicked`, `district_waitlist_viewed`, `listing_interest_saved` (`listing_type`, `district_scope`, `intent`), `listing_interest_failed` (`error_code`), `listing_updated`; server: `listing_created`, `listing_status_changed`, `listing_deleted`, `listing_auto_expired`, `conversation_started`, `message_sent` |
| Auth / account      | `auth_started`; server: `auth_completed`, `user_signed_up`, `referred_signup`, `anonymous_cost_reports_claimed`, `imported_cost_reports_claimed`, `account_soft_deleted`, `account_recovered`, `account_hard_deleted`, `contact_form_sent`                                                                                                                                                                                                                                                                                                                                                    |
| Consent             | `consent_banner_shown`, `consent_accepted`, `consent_declined`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Payments            | `checkout_initiated`; server: `checkout_session_created`, `checkout_abandoned`, `payment_succeeded`, `payment_refunded`, `listing_promoted`                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Content             | `template_downloaded`, `affiliate_link_clicked`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Bot (`tg_<chatId>`) | `tg_bot_started`, `tg_address_checked` (`level`), `tg_address_not_found`, `tg_address_outside_city`, `tg_district_checked`, `tg_districts_viewed`, `tg_city_requested`, `tg_subscribed`, `tg_unsubscribed`, `tg_deposit_viewed`, `tg_deposit_offered`, `tg_deposit_flow_started`, `tg_deposit_verdict`, `tg_deposit_contract`, `tg_deposit_letter_generated`, `tg_deposit_letter_sent`, `tg_deposit_reminder_set`, `tg_deposit_outcome`, `tg_lawyer_interest`                                                                                                                                 |

## 6. i18n

- **Locales**: `pl` (default), `en`, `ru`, `uk` (`src/i18n/routing.ts`).
  - `localePrefix: 'as-needed'`: Polish has no prefix.
  - `localeCookie: false`: a Set-Cookie would bypass the ISR cache.
- **Message files**: `src/i18n/messages/{pl,en,ru,uk}.json`, loaded per request in `src/i18n/request.ts`. Navigation helpers are in `src/i18n/navigation.ts`, display labels in `src/i18n/languages.ts`.
- **Client bundle**: the layout ships only `SHARED_CLIENT_NAMESPACES` (`src/i18n/messages.ts`) to the client. Page-specific namespaces such as `checker`, `calculator`, `review`, `privacy` and `about` are provided by scoped `NextIntlClientProvider`s.
- **Rule**: all four files keep identical key sets. On 2026-11-18 each had 2,081 leaf keys and 37 top-level namespaces, with no differences. No test or hook enforces this, so check by hand when adding keys.
- **Elsewhere**:
  - Blog content is per locale (`-pl/-en/-ru/-uk.mdx`).
  - The bot has its own RU/UK copy (`src/lib/bot/texts.ts`, `deposit-texts.ts`).
  - Stripe Checkout has no `uk`, so it falls back to `auto` (`toStripeLocale`).

## 7. Environment variables (names from `.env.example`)

| Group         | Variables                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Supabase / DB | `NEXT_PUBLIC_SUPABASE_URL`\*, `NEXT_PUBLIC_SUPABASE_ANON_KEY`\*, `SUPABASE_SERVICE_ROLE_KEY`\*, `DATABASE_URL`\*, `DIRECT_URL`\*                                                                                               |
| Stripe        | `STRIPE_SECRET_KEY`\*, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`\* (not read anywhere in `src/`), `STRIPE_WEBHOOK_SECRET`\*, `STRIPE_PRICE_EXTRA_LISTING`\*, `STRIPE_PRICE_PROMOTE_7/14/30`\*, `STRIPE_PRICE_COST_ACCESS_7/30/90`\* |
| Email         | `RESEND_API_KEY`\*, `RESEND_FROM`, `CONTACT_EMAIL`                                                                                                                                                                             |
| Analytics     | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_GA_ID`                                                                                                                                                     |
| Maps / geo    | `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` (browser, referrer-restricted), `NEXT_PUBLIC_MAPBOX_TOKEN`, `GEOCODING_API_SERVER_KEY` (server, bot)                                                                                       |
| App / toggles | `NEXT_PUBLIC_APP_URL`\*, `NEXT_PUBLIC_FEATURE_DOCUMENT_TEMPLATES`\*, `NEXT_PUBLIC_SITE_INDEXABLE` (only `"true"` allows indexing; build-time)                                                                                  |
| Jobs / admin  | `CRON_SECRET`\* (also the HMAC key for unsubscribe links, `src/lib/email/unsubscribe.ts`), `COST_IMPORT_ADMIN_EMAILS`, `ADMIN_IMPORT_MODE`, `DEEPL_API_KEY`                                                                    |
| Telegram / AI | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `ANTHROPIC_API_KEY` (read implicitly by `new Anthropic()`)                                                                               |

\* = set by `.github/workflows/ci.yml` for `next build`, as inert dummies. Some server modules create clients when
imported (`src/lib/stripe.ts`, `src/lib/email/client.ts`, `src/lib/supabase/broadcast.ts`,
`src/lib/supabase/storage-server.ts`), so the build needs these present. `playwright.config.ts` passes the same set to
`next start`. Agents read only `.env.example`. Never open `.env`, `.env.local` or `.env.prod`.

## 8. Local development

- **Local Supabase** (`supabase start`, `supabase/config.toml`, project_id `passflat`):
  - API 54321, DB 54322 (shadow 54320), Studio 54323, Inbucket mail 54324; the pooler (54329) is disabled.
  - `site_url` is `http://localhost:3000`.
  - `next.config.mjs` allows images from local storage on `127.0.0.1` / `localhost:54321` outside production.
- **Env files**: the Prisma CLI loads only `.env`; Next.js loads `.env.local` before `.env`.
  - `CLAUDE.md` says both point to `127.0.0.1:54322`. Not checked here: agents do not open them.
  - Keep the two in sync: otherwise the app and the CLI target different databases.
  - `.env.example` still documents an older local Docker URL on port 5433.
- **Commands**:
  - `npm run dev` runs `prisma generate && next dev` on port 3000.
  - `npm run db:migrate` (`prisma migrate dev`) and `npm run db:deploy` change a database. Run them only when the owner asks.
  - `npm run bot:dev` long-polls the bot locally.
- **Migrations** (`prisma/migrations`, 23): `0_init`, `20260603115244_add_cost_periodic_charges_and_import`,
  `20260604173403_add_building_location_score`, `20260604180056_add_perf_indexes`,
  `20260605150000_add_listing_periodic_charges`, `20260605170000_add_profile_email`,
  `20260608000000_add_deposit_returned_amount`, `20260608010000_add_utilities_complete`,
  `20260610073305_retention_follow_reengage`, `20260610083013_retention_emails_optout`,
  `20260610120000_add_profile_referred_by`, `20260613131514_add_listing_slug`,
  `20260618173830_add_cost_report_anonymous_id`, `20260619074409_city_notify_district_listing`,
  `20260712113648_add_listing_external_contacts`, `20260726120000_add_location_checker_tracking`,
  `20260727100806_add_osm_pois`, `20260727135319_add_building_tags`,
  `20260728140000_one_report_per_building`, and the four bot migrations:
  `20260831120000_add_telegram_bot`, `20261004120000_telegram_subscription_label`,
  `20261005120000_deposit_cases`, `20261005140000_deposit_contract`. These four were **not applied to production as of
  2026-10-05 per `src/lib/bot/README.md`**.
- **RLS** is managed by hand in the Supabase dashboard.
  - No migration contains RLS or policies.
  - The anon key is public, so every new table needs RLS switched on by the owner.
  - The Realtime channel policies are a manual SQL snippet: `supabase/snippets/realtime-authorization.sql`.
  - `docs/audit-2026-07-27.md` (C1; removed 2026-11-18, in git history) found RLS off on `pois` and `building_tags`. Whether that is fixed is **unverified**.
- **Tests**:
  - Vitest (`vitest.config.ts`): `src/**/*.{test,spec}.{ts,tsx}` (29 files), node environment, `NEXT_PUBLIC_APP_URL=https://passflat.com`.
  - Playwright (`playwright.config.ts`): `e2e/home.spec.ts` smoke tests on port 3100 (the `PORT` constant). The web server is `npm run build && npm run start -- --port 3100` with dummy env and `NEXT_DIST_DIR=.next-e2e` (read as `distDir` by `next.config.mjs`), and `reuseExistingServer` is off, so a running dev server is never reused or touched.
  - CI runs lint, typecheck, knip, unit tests and build; the e2e job is `continue-on-error`.
- **knip** (`knip.json`) runs in CI and on pre-push. It ignores `scripts-tmp-cleanup/**` and keeps `src/components/ui/**`, `scripts/**` and `pricing/client.tsx` as entries.

## 9. Known limitations and stale areas

Each item is a fact checked in the named file unless marked otherwise.

1. The old `ARCHITECTURE.md` says Next.js 15; `package.json` pins `next` 16.2.6. It lists a `ua` locale and `ua.json`; the code uses `uk` (`src/i18n/routing.ts`).
2. Old URLs `/add-costs` and `/add-replacement` do not exist. The real paths are `/[city]/costs/submit` and `/create-listing`. The calculator is `/[city]/calculator`, not `/[city]/costs`. The city slug is `warsaw`, not `warszawa`, and there is no Berlin or `/de` route.
3. Old table names `replacement_listings` and `replacement_responses` are now `listings` (with `type`) and `listing_responses`. `ListingResponse`, `Subscription` and `CostTermLabel` have no Prisma reads or writes in `src/`.
4. The old `payments.product_type` values (`promoted_listing`, `cost_report`, `subscription`) are wrong. The code writes `listing` / `cost_access` (`api/webhooks/stripe/route.ts`), and Checkout runs in `mode: 'payment'` only.
5. Old stack entries that are not in `package.json` or the code: Trigger.dev, Vercel Flags, `src/lib/supabase.ts`, `src/lib/mapbox.ts`, `next.config.ts`, `tailwind.config.ts`, `src/styles/globals.css`, `public/locales`. Image resizing goes through Vercel Image Optimization (`next.config.mjs`), not edge functions.
6. The old map plan (a split-view listing browser) describes `components/map/MapView.tsx`, which only the frozen listings pages use. The cost map is `components/map/CostsMap.tsx` on `/[city]/costs`.
7. The old doc says `has_contributed_cost` unlocks cost data. Cost data is now open to everyone (`components/costs/cost-access-card.tsx`), and the flag is kept only for display.
8. The old header says pillar 2 is agency reputation and not built. The schema docs call building tags pillar 2 (`BuildingTag`), served at `/[city]/review`.
9. Listings are "removed from navigation" only in the header. `components/landing/footer.tsx:16-20` still links `/warsaw/replacement|roommate|sublet` and `/create-listing`, and `src/app/sitemap.ts:78-80` still lists them.
10. The `src/lib/feature-flags.ts` docblock says `PROMOTED_LISTINGS_ENABLED` and `SESSION_RECORDING_SAMPLE` are not consumed; both are (dashboard, create-listing, checkout route, PostHog provider). `HERO_VARIANT_B` is declared and unused.
11. `/api/checkout/cost-access` has no feature-flag or kill-switch gate, unlike promotion checkout.
12. The Telegram webhook checks the secret only when `TELEGRAM_WEBHOOK_SECRET` is set (`api/telegram/webhook/route.ts`: `if (secret && …)`). The bot README says it always rejects updates without it.
13. If the bot migrations are still missing in production (**unverified**), the daily `telegram-followups` cron would fail. It calls `clearStaleLetterParties()` on `deposit_cases` before it checks the bot token.
14. There is no push notifier for `TelegramSubscription` yet; subscriptions accumulate (bot README, "Not built yet").
15. `package.json` sets the Prisma seed to `prisma/seed.ts`, and `supabase/config.toml` seeds from `./seed.sql`. Neither file exists.
16. `src/middleware.ts` uses the `middleware` file convention, which Next 16 deprecates in favor of `proxy` (warning text in `node_modules/next/dist/build`).
17. `src/lib/rate-limit.ts` is per instance. Its own docblock says it is not real protection for email or paid quotas.
18. Root clutter from one-off imports: `dataset_otodom-*.json`, `importable-otodom-warsaw*.json`, `scripts-tmp-cleanup/`. `PROJECT.md`, `DEVELOPMENT_PLAN.md` and `COMPETITORS.md` (2026-06-21) were not checked for this file.
