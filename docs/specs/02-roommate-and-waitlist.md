# 02 · Roommate path and waitlist correctness (PRD 1 package B)

Requirements FR-3 and FR-14 – FR-20 of PRD 1. Listings stay frozen (D5): these are the fixes
the owner's brief lists, nothing more. No matching, profiles for seekers, a third "search a flat
together" flow, chat, CRM or new notifications (**Decided**). URLs, canonical and hreflang of
`/[city]/roommate` and listing pages do not change. `/replacement` and `/sublet` keep their
behaviour: every change below is guarded by `listingType === 'roommate'` unless it says
otherwise.

## Current state (2026-11-19)

- `src/app/[locale]/[city]/roommate/page.tsx` passes up to 50 listings (`queryListings`, server
  filters from URL params) to `ListingsPageClient`; no total count of offers in the city.
- `ListingsPageClient` filters again on the client (`useUrlFilters`, `replaceState`).
  `showDemandCapture = filteredListings.length === 0 && (listings.length === 0 || !!selectedDistrict)`.
- `ListingsEmptyState` posts `{ email?, city, districtSlug, listingType, consent: true, locale }`
  to `/api/city-notify`; copy promises an e-mail "the moment listings appear", which no code
  sends.
- `/api/city-notify` validates and stores `listingType` only when `districtSlug` is non-empty; a
  roommate request without a district is stored as a whole-city row and gets the
  `cityNotifyConfirmation` e-mail. Unique key `[email, cityNormalized, districtSlug, listingType]`.
- `/api/cron/city-launch` (manual POST) selects every row with `cityNormalized` and
  `notifiedAt: null`, district rows included. No tests.
- `src/middleware.ts` redirects a logged-out `/create-listing?type=roommate` to
  `/auth/login?next=<pathname>`, dropping the query.

## Role selector

FR-14, FR-3 (**Decided**); EN and UK copy **agent draft**.

On `/[city]/roommate` only, two equal choices in the header stack of `ListingsPageClient`
(the page is `h-screen overflow-hidden` and the list scrolls in its own container), directly
above the roommate bridge banner (`listings-page-client.tsx:310-328`):

| Choice                 | PL (given)        | RU (given)               | Action                                                                                                                                                                |
| ---------------------- | ----------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I'm looking for a room | `Szukam pokoju`   | «Ищу комнату»            | Sets `intent = find_room`, scrolls the list container to its top, and collapses the two choices into one chip "Looking for a room · change" (draft) that reopens them |
| I have a free room     | `Mam wolny pokój` | «Есть свободная комната» | Goes to `/create-listing?type=roommate` (locale-aware `Link`); sets `intent = offer_room`                                                                             |

- Each choice fires one `roommate_intent_selected` with `intent`. The list stays rendered below
  for search engines and for visitors who do not choose; choosing is never required.
- The chosen `intent` is client state passed to `ListingsEmptyState` as an optional prop, so
  `listing_interest_saved` carries it (spec 01). Nothing is stored.
- Mobile: both choices visible without horizontal scroll at 360 px width; tap targets at least
  44 px high; the row takes one line of two buttons, not a card.
- The empty state's existing "post your own" card stays on roommate; its
  `listing_create_cta_clicked` is a separate event and is not counted as
  `roommate_intent_selected`.
- The intent state lives in `ListingsPageClient`; put the choice logic (event properties,
  collapsed or open) in a pure helper with a test.
- Keys: a new `listings.roommateRoles.*` group in all four locale files (EN draft "I'm looking
  for a room" / "I have a free room"; UK draft «Шукаю кімнату» / «Маю вільну кімнату»).

## Offer a room across sign-in

FR-15 (**Decided**). When the middleware redirects `/create-listing` to sign-in, `next` keeps the
query string (`pathname + search`), passed through the existing `safeNextPath` rules. Extract the
`next` building into a pure function and test: `/ru/create-listing?type=roommate` →
`next=/ru/create-listing?type=roommate`; a path without query unchanged; an unsafe value still
rejected by `safeNextPath`. The empty state's existing direct sign-in link keeps working.

## Checker link

FR-16 (**Decided**). The existing roommate bridge (`listings.roommateCostsBridge`, link to
`/[city]/check`, event `cost_data_cta_clicked {source: 'roommate_bridge'}`) stays as secondary
help, below the role selector. New copy: RU «Нашёл вариант? Проверь адрес и известные расходы»
(given); PL, EN, UK agent draft. Viewing offers and opening the checker never require
contributing costs (unchanged; check no gate was added).

## Interest API: three classes

FR-17 (**Decided**). `POST /api/city-notify` validates `listingType` and `districtSlug`
independently and stores exactly one of three classes; the unique key does not change.

| Class                                | `listingType`                       | `districtSlug` | Validation                                                                | E-mail                              |
| ------------------------------------ | ----------------------------------- | -------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| City launch (landing, checker forms) | `''`                                | `''`           | as today: `city` free text, normalised                                    | `cityNotifyConfirmation` (as today) |
| Listings interest, whole city        | `replacement`, `roommate`, `sublet` | `''`           | `cityNormalized` must be an existing `City.slug`, else 400 `Unknown city` | none                                |
| Listings interest, one district      | same                                | slug           | city must exist; district must belong to it, else 400 `Unknown district`  | none                                |

- A `districtSlug` without `listingType` → 400 (`listingType required`); it never becomes a
  city-launch row. An unknown `listingType` value → 400.
- Server events: `city_notify_subscribed` only for the city-launch class;
  `district_notify_subscribed` for both listings classes, with `listingType` and `districtSlug`
  (`''` for the whole city). Names unchanged. Both are removed by §Waitlist server events (Q-15,
  T057).
- Repeated submission → the existing upsert updates the same row (no duplicate); response 200.
  Two parallel identical submits can hit a unique violation (P2002) on the upsert: treat it as
  success (200), not 500.
- Every error response gets a stable machine-readable `code` next to the existing `error`
  text: `rate_limited` (429), `invalid_input` (bad JSON, missing city, district without type,
  unknown type), `consent_required`, `invalid_email`, `unknown_city`, `unknown_district`,
  `server_error` (500). Spec 01 maps `code` to `error_code`.
- Stored personal data does not change: the same e-mail rows as today, in the right class.
  Retention and removal of listings-interest e-mails: §Listings-interest retention and
  §Remove-interest link (Q-14, D31).
- Rate limit, consent check, e-mail validation and the logged-in e-mail fallback unchanged.
- Route tests (mock `@/lib/prisma`, `@/lib/email/send`, `@/lib/posthog-server`, Supabase): one
  per class; roommate without district stores `listingType: 'roommate'` and sends no e-mail;
  unknown city for listings → 400; district of another city → 400; district without type → 400;
  repeat → one upsert call with the same unique key; the old city form body
  `{email, city: 'Kraków', consent, locale}` still stores a city-launch row and sends the
  confirmation.

## City-launch mailing

FR-18 (**Decided**). `/api/cron/city-launch` selects only `cityNormalized = <city>`,
`listingType: ''`, `districtSlug: ''`, `consent: true`, `notifiedAt: null`. Old rows whose type
was lost are not relabelled (whole-city roommate or sublet requests saved before the release
look like city-launch rows and stay selectable; spec 05 counts them by `created_at`). Route
test with mocked Prisma and `sendEmail`: listings rows are not selected (assert the `where`),
unauthorised call → 401 as today, `notifiedAt` set only after a successful send. Tests never
call Resend. Overlapping manual runs and the link to the frozen `/replacement` page are fixed
by §City-launch e-mail link and send guard (Q-16, T058).

## Honest interest copy

FR-19 (**Decided**); RU given, others **agent draft**. In `ListingsEmptyState`, for all three
listing types (the `listings.demandCapture.*` keys are shared and the promise is equally false
for replacement and sublet). Give the component `key={districtSlug}` so a success message does
not survive a district change.

- Button: RU «Сохранить интерес»; PL draft «Zapisz zainteresowanie»; EN draft "Save interest";
  UK draft «Зберегти інтерес».
- Subtitles (`listings.demandCapture.subtitle`, `subtitleLoggedIn`) no longer promise an e-mail
  when listings appear. Draft EN: "Leave your email and we'll save your interest. There are no
  automatic notifications about new offers yet."
- A success message of its own (new key, not `landing.cityNotify.success`, which the city-launch
  form keeps): draft EN "Your interest is saved. We don't send automatic notifications about new
  offers yet." No promise of matching or of a reply from the founder.
- The consent checkbox and its text stay as they are (Q-13, **Decided**, D28).

## Empty states

FR-20 (**Decided**).

- The roommate page server passes `cityOfferCount`: active roommate listings in the city without
  the URL filters (one `count` query, same `where` as `queryListings` minus the filter params).
  Same for `/replacement` and `/sublet` pages if the shared component needs the prop; their
  rendering stays as it is.
- Pure function `listingsEmptyKind({ cityOfferCount, filteredCount, hasActiveFilters })`:
  - `filteredCount > 0` → `none` (show the list);
  - `cityOfferCount === 0` → `no_offers_in_city` (existing demand capture with the honest copy);
  - otherwise → `no_match_for_filters`: "No offers match your filters" with a button that clears
    the filters (existing filter reset) and, when a district is selected, the district interest
    capture below it.
- Never show "no listings in the city yet" when `cityOfferCount > 0`, also on a reload with
  strict URL filters. A map pan that hides every marker shows the existing grid empty text, not
  the city message.
- Tests for the pure function: 0 in city → `no_offers_in_city`; 4 in city, filter leaves 0 →
  `no_match_for_filters`; 4 in city, 2 left → `none`.

## Owner follow-ups (M6)

Decided by the owner on 2026-11-19 (PRD 1 decision review Q-14 – Q-16). "Listings-interest
rows" are `city_notify_subscriptions` rows with a non-empty `listingType` (both listings
classes of §Interest API). City-launch rows (`listingType = ''`) are not touched by §Retention
or §Remove-interest link.

### Listings-interest retention

Q-14 option (a), **Decided** (D31): keep collecting listings-interest e-mails; a daily cron
deletes those rows older than 12 months.

- New route `src/app/api/cron/cleanup-listing-interest/route.ts`, authorised with
  `CRON_SECRET` like the other cron routes (401 without it), and a daily entry in
  `vercel.json` (`30 4 * * *`, **Assumption**).
- It runs one `deleteMany` with `listingType: { not: '' }` and `createdAt < now − 12 months`
  (**Assumption**: counted from `createdAt`, the first save; a later re-save does not extend it,
  because the table has no `updatedAt` and a new column would need a production migration,
  D18). The 12 months are one constant.
- It logs and returns only the deleted count, never an e-mail.
- Route tests with mocked Prisma: the `where` (listings rows only, the cutoff date for a fixed
  `now`), 401 without auth, the count in the response.
- `docs/architecture.md` lists the cron.
- **Open** (owner; does not block T055 or T056): whether deleting an account also deletes that
  e-mail's listings-interest rows. Until the owner answers, account deletion
  (`src/app/api/account/route.ts`) does not change.
- The privacy policy is not changed by agents. Whether it should state this retention period is
  the owner's; the handoff names it.

### Remove-interest link

Q-14 option (a), **Decided** (D31): a working unsubscribe link with a signed token for
listings-interest rows.

- Tokens: extend `src/lib/email/unsubscribe.ts` with a purpose-scoped pair, for example
  `makeInterestRemovalToken(rowId)` / `verifyInterestRemovalToken(token)`, signing
  `interest:<rowId>` with the same `CRON_SECRET` key and the same production refusal. A profile
  unsubscribe token never verifies as an interest token, and the reverse.
- Page `src/app/[locale]/email/remove-interest/page.tsx` (`force-dynamic`, `noindex`, the
  layout of `email/unsubscribe/page.tsx`): a valid token deletes that one row
  (`deleteMany({ where: { id, listingType: { not: '' } } })`, no throw if it is gone) and shows a
  success message; an invalid token or a missing row shows the error message. Mutating on load
  matches the existing unsubscribe page.
- Where the link appears (**Assumption**): listings-interest rows receive no e-mail (§Interest
  API), so the only touchpoint is the save-interest success state. `POST /api/city-notify`
  returns `removeUrl` (absolute, the request locale) in its 200 response for the listings
  classes (also on the P2002 success path, by looking the row up by its unique key), and the
  success message in `ListingsEmptyState` shows a small "Remove my e-mail" link to it. Any
  future e-mail to these rows must carry the same link.
- Copy (draft, four locales, in the namespaces the components already receive): the link text
  and the page's success and error texts. Name the keys in the progress entry.
- Tests: token round trip, tampered token, cross-purpose token; the page's delete call for a
  valid and an invalid token (mocked Prisma); the route returns `removeUrl` for a listings row
  and not for a city-launch row.

### Waitlist server events

Q-15, **Decided** (D32): the two server events that use the e-mail as the PostHog distinct id
are removed; the client event `listing_interest_saved` (spec 01 §Interest events) replaces
them.

- `POST /api/city-notify` no longer calls `trackServerEvent` for `city_notify_subscribed` or
  `district_notify_subscribed`.
- **Assumption** (same reason): its `captureServerException` calls stop passing the e-mail as
  `distinctId` (omit it; the properties stay).
- A search of `src/` for other `trackServerEvent`, `identifyUser` or `captureServerException`
  calls whose distinct id is an e-mail lists any match in the progress entry; they are not
  changed in this task.
- The bot part of Q-15 is spec 04 §Typed text in bot events, in the same task (T057).
- `docs/analytics/activation-funnels.md` (identities, the event table, database counts) and
  spec 05 stop describing e-mail-keyed events and say the waitlist is counted by
  `listing_interest_saved` and by database rows.
- Route tests assert that no `trackServerEvent` call is made and that the other behaviour of
  §Interest API is unchanged.

### City-launch e-mail link and send guard

Q-16, **Decided** (D33): the manual city-launch e-mail links to the city's costs page, and
sending gets the same claim-before-send guard as the bot reminders (spec 04 §Deposit
reminders).

- `src/app/api/cron/city-launch/route.ts:58`: `cityUrl` becomes the locale URL of
  `/<city>/costs` instead of `/<city>/replacement`.
- Before each send: `updateMany({ where: { id, notifiedAt: null }, data: { notifiedAt: <now> } })`;
  send only when `count === 1`. On a send error, set `notifiedAt` back to `null` so a later run
  retries. At most once: a crash between the claim and the send loses that e-mail (accepted,
  documented in the route's comment).
- The selection of §City-launch mailing is unchanged. Tests never call Resend.
- Route tests with mocked Prisma and `sendEmail`: the link, two runs over the same row send once,
  a failed send restores `notifiedAt`, 401 without auth.
