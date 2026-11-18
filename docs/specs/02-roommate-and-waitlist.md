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
  (`''` for the whole city). Names unchanged.
- Repeated submission → the existing upsert updates the same row (no duplicate); response 200.
  Two parallel identical submits can hit a unique violation (P2002) on the upsert: treat it as
  success (200), not 500.
- Every error response gets a stable machine-readable `code` next to the existing `error`
  text: `rate_limited` (429), `invalid_input` (bad JSON, missing city, district without type,
  unknown type), `consent_required`, `invalid_email`, `unknown_city`, `unknown_district`,
  `server_error` (500). Spec 01 maps `code` to `error_code`.
- Stored personal data does not change: the same e-mail rows as today, in the right class.
  Retention and deletion of listings-interest e-mails are the owner's (Q-14).
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
call Resend. Out of scope, recorded for the owner: overlapping manual runs can double-send, and
the e-mail links to the frozen `/replacement` page (Q-16).

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
- The consent checkbox and its text stay as they are (Q-13).

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
