# 08 · Site structure and roommate entries (PRD 4, M1 – M2)

Requirements FR-1 – FR-20 of PRD 4 (`../product/prd/prd-4-site-improvements.md`). The website
becomes an entry into the bot's roommate matching (D48): the roommate page opens on the flatmate
block, the header and the home page state the thesis, and one shared callout appears on every cost
surface. Listings stay frozen and are not promoted (D5): links to `/replacement`, `/sublet` and
`/create-listing` are re-pointed, never the pages themselves; removing navigation to them is
**Open** (FR-7, Q-5). No table, migration, cron, dependency or new event name (**Decided**,
CLAUDE.md). Every copy change touches the four files of `src/i18n/messages/` (parity test, spec 01)
and is listed in the progress entry as draft copy for the owner (D29). Bot copy does not change.

## Current state (2026-11-20)

- `src/lib/roommate-roles.ts`: `showsFlatmateBlock(state) = state.intent === 'find_flatmate'`;
  `showsRoomMoneyBlock(state, emptyKind) = intent === 'find_room' || emptyKind === 'no_offers_in_city'`.
- `src/components/listings/listings-page-client.tsx`: root `div.flex.h-screen.flex-col.overflow-hidden.pt-24`
  (line 256); header stack (267–322): `ListingTypeTabs`, the `listings.listingsInCity` count
  (`countText`, 196–199), sort, map toggle, `QuickFilters`, `ListingFiltersMobile`; then the role
  selector (327–335, `listingType === 'roommate'`), the bridge line (342–360), `ActiveFilters`; the
  scrolling list container (372–382) renders `FindFlatmateBlock` (385–387, needs `flatmateCounts`
  and `showsFlatmateBlock`), `RoomMoneyBlock` (389–391), then the empty states or `ListingGrid`. No
  `main`, `h1` or `Footer`. Props: `listings, districts, citySlug, cityBounds?, listingType,
cityOfferCount?, flatmateCounts?, roomMoney?, isLoggedIn?`.
- `src/components/listings/find-flatmate-block.tsx`: `return null` without
  `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (line 29); keys `listings.findFlatmate.{title,count,first,topLabel,topItem,how,languages,button}`;
  the bot button `Button asChild … min-h-11` → `botStartUrl(username, 'roommate')`, capturing
  `telegram_bot_opened` with `telegramBotOpenedProperties('roommate')`.
- `src/lib/roommate/website-counts.ts`: `loadFlatmateBlockCounts()` → `{ status: 'counts', total,
top } | { status: 'unavailable' }`, `unstable_cache(['roommate-website-counts-v1'], { revalidate:
3600 })`; `pageHasFlatmateBlock(citySlug, botUsername)` needs `warsaw` and the username.
- `src/app/[locale]/[city]/roommate/page.tsx`: loads listings, `countCityListings`, the counts (only
  when `pageHasFlatmateBlock`), `loadRoomMoneyReference(city.id)` and `createClient().auth.getUser()`;
  `generateMetadata` uses `listings.titleRoommate` + ` — {city}` and `listings.roommateMetaDescription`.
- `src/lib/analytics/telegram-events.ts`: `TelegramBotSource = 'checker' | 'empty' | 'roommate'`;
  `botStartPayload(source, buildingId?)`: building → `b_<id>`, `roommate` → `mate_web_roommate`,
  else `web_<source>`; `botStartUrl`, `telegramBotOpenedProperties`.
- `src/lib/roommate/room-costs.ts`: `loadRoomCostAreas(city, districtSlugs)` → `RoomCostArea[]`
  (`{ district, room: AreaReference | null, split: PerPersonSplit | null }`), `perPersonSplit`
  (tenant group, `completeTotal` headline, N ≥ 2, `roundHalfUpTo10(median / 2)`), the private
  loader with `rentalType: 'apartment', minRooms: 2` (D71). `[]` means the whole city.
- `src/i18n/messages.ts`: `SHARED_CLIENT_NAMESPACES` includes `common`, `landing`, `listings`,
  `costs`, `blog`, `errors` (so `listings.*` keys work on the home page, building page and blog);
  `checker` and `calculator` are route-scoped.
- Header (`src/components/landing/header.tsx`): `navLinks` = costs (`costs.title`), check
  (`common.checkAddress`), review (`common.buildingReviews`) at 103–109; the mobile pill (237–244)
  → `/warsaw/costs` with `common.costsShort` and `cta_click {placement: 'header_mobile'}`.
- Footer (`src/components/landing/footer.tsx`, server component): product column
  `browseListings` → `/warsaw/replacement`, `roommateSearch` → `/warsaw/roommate`,
  `temporarySublets` → `/warsaw/sublet`, `costReports` → `/warsaw/costs`, `addListing` →
  `/create-listing`, `resources`; column titles `h4`; `landing.footer.tagline` (50).
- Home (`src/app/[locale]/page.tsx`): `main` renders `Hero`, `CheckAddress`, `Districts`,
  `BentoGrid`, `HowItWorks`, `CostTransparency`, `Tools`, `ForWhom`, `CityNotify`, `FAQ`;
  `HomeContent` loads with `Promise.allSettled([getStatsCached(), getTopBuildingCostDataCached(),
getDistrictMediansCached()])`. Hero chips (204–226) → `/warsaw/replacement|roommate|sublet`.
  `ForWhom` personas `findHome` → `/warsaw/replacement`, `findRoommate` → `/warsaw/roommate`,
  `sublet` → `/warsaw/sublet`; keys `landing.forWhom.<key>.{title,description,cta}`,
  `landing.cta.{title,titleHighlight,subtitle,freeNote}`. `districts.tsx:146` →
  `/warsaw/costs?district=`. 404 (`not-found.tsx`): second button → `/warsaw/replacement`
  (`errors.notFound.browse`). Dashboard client: "Browse listings" (line about 1098).
- `HowItWorksTabs`: `TABS = ['replacement', 'roommate', 'sublet']`, keys
  `landing.howItWorks.tab<Type>` and `landing.howItWorks.<type>.step{1..4}{Title,Desc}`, subtitle
  `landing.howItWorks.subtitle`.
- Building page client: bottom card (1215–1235) `costs.building.lookingForApartment`,
  `lookingForApartmentDesc`, `viewListingsIn` → `/warsaw/replacement?district=`. District page
  (`[city]/[district]/page.tsx`): back, `h1` `costsSeo.districtH1`, intro, `DistrictFigureCard`,
  buttons (submit, calculator, explore all, share), `h2` `costsSeo.buildingsHeading`, buildings,
  footer; `revalidate = 3600`. Hub (`[city]/page.tsx`): `h1`, intro, buttons (90–107), districts.
  Calculator client (384–407): result buttons (`ctaDistrict`, `ctaSubmit`, share). Blog list
  (`blog/client.tsx`): `blog.ctaText` + `blog.ctaButton` → `/warsaw/costs`. Guide
  (`blog/[slug]/client.tsx`): body, then the template block for two slugs; nothing after.
- `TelegramBotCta` (`src/components/costs/telegram-bot-cta.tsx`): a muted `text-sm` anchor with
  `checker.costs.telegramCta`; rendered twice in `check/client.tsx` (649–651 inside
  `onClickCapture={() => captureCta('telegram')}`, and 685).
- Tests: `src/lib/roommate-roles.test.ts`, `src/components/listings/room-money-placement.test.ts`,
  `roommate-role-selector.test.ts`, `room-money-consistency.test.ts`,
  `src/app/[locale[/[city]/roommate/client-namespaces.test.ts`, `src/i18n/honesty-copy.test.ts`,
  `src/i18n/bot-languages-copy.test.ts`, `src/i18n/messages.test.ts` (parity). Vitest runs in Node
  without a DOM: component logic goes into pure helpers that are tested (spec 01 rule).

## Roommate page default view

FR-1 (**Decided**: the roommate page is the entry, D48, D41; frozen and not promoted, D5;
**Assumption**: placement and order, D68). FR-2 (**Assumption**: the honest line).

- `showsFlatmateBlock(state)` returns `true` when `state.intent` is `undefined` or `find_flatmate`,
  `false` for `find_room` and `offer_room`. `showsRoomMoneyBlock` is unchanged. Tests in
  `roommate-roles.test.ts`: all four intents.
- Order inside the scrolling list container on the roommate page: `FindFlatmateBlock`,
  `RoomMoneyBlock`, then `ListingsNoMatch` / `ListingsEmptyState` / `ListingGrid` as today. The
  condition `flatmateCounts &&` is dropped: the block renders whenever `listingType === 'roommate'`,
  `citySlug` is the checker city and `showsFlatmateBlock`; `flatmateCounts` becomes an optional
  prop of the block (`undefined` → no count line).
- The role selector moves above the header stack: on `listingType === 'roommate'` the
  `RoommateRoleSelector` row renders before the `motion.div` with the type tabs; `/replacement` and
  `/sublet` are unchanged (no selector).
- The count line (`countText`) is not rendered when `listingType === 'roommate' && cityOfferCount
=== 0` (both the desktop and the mobile variant); otherwise unchanged.
- **No username** (FR-2): `FindFlatmateBlock` renders without the bot button and without the count
  line, and adds one line `listings.findFlatmate.notConnected` (PRD 4 §8) under the languages line.
  The component never returns `null`. `pageHasFlatmateBlock(citySlug, botUsername)` is split:
  `pageHasFlatmateBlock(citySlug)` = the checker city (renders the block);
  `canLoadFlatmateCounts(citySlug, botUsername)` = the old rule (loads counts). The page loads
  counts only under the second.
- A pure helper `roommatePageLayout({ listingType, citySlug, cityOfferCount, roleState, emptyKind,
hasUsername })` → `{ showFlatmateBlock, showRoomMoney, showCountLine, showBotButton, selectorAboveTabs }`
  in `src/lib/roommate-roles.ts` (or a sibling), tested for: default view (block, no count line at 0
  offers, selector above tabs), each intent, offers present, no username, another city.
- Hiding the type tabs at 0 offers is FR-7 (**Open**, Q-5): not done here.
- `roommate_intent_selected` fires only on a tap, as today; nothing fires on load.

## Roommate page shell and metadata

FR-3 (**Decided**: URL, canonical, hreflang unchanged; **Assumption**: wording), FR-4
(**Assumption**: markup).

- Keys rewritten in four locales (PRD 4 §8; appendix seo.md table A): `listings.titleRoommate`
  (PL starts with "Szukam współlokatora"), `listings.roommateMetaDescription`; new key
  `listings.roommateH1`. All three are in `REWRITTEN_KEYS` (`src/i18n/honesty-copy.test.ts`); no
  promise of a match, a date or a result; the city stands after a colon or dash so PL and RU
  grammar hold (spec 09 §Nominative-safe templates).
- `ListingsPageClient` renders `<h1 className="sr-only sm:not-sr-only …">{t('listings.roommateH1')}</h1>`
  (visually small, agent's choice of classes) as the first child of the content column on the
  roommate page only; the filters sidebar's heading stays `h2`.
- The content column (the `flex min-h-0 min-w-0 flex-1 flex-col` div) is wrapped in `<main id="main">`
  for all three listing types; the root class `h-screen` → `h-dvh`.
- `<Footer />` renders at the end of the scrolling list container (after the grid or empty state)
  for all three listing types (shared container, no behaviour change beyond the footer).
- `generateMetadata` keeps `getAlternates('/${city}/roommate', locale)` and
  `getOgImage(title, description)`.
- Tests: the layout helper above gains `showH1`; a static test reads `listings-page-client.tsx` and
  asserts `h-dvh`, `<main id="main"` and one `<Footer` occurrence (agent's choice; spec 01 rule:
  no DOM in Vitest).

## Header and footer entries

FR-5 (**Decided**: the roommate page is the entry, D48; building reputation out of focus, D48;
**Assumption**: labels and order).

- `navLinks` (header): `[{ href: '/warsaw/roommate', label: t('common.findFlatmate') }, { href:
'/warsaw/costs', label: t('costs.title') }, { href: '/warsaw/check', label: t('common.checkAddress') }]`;
  the `/warsaw/review` entry is removed from the header. Both the desktop nav and the mobile menu
  read the same array.
- Mobile pill → `/${DEFAULT_CITY}/roommate`, label `common.findFlatmate`, same `cta_click
{placement: 'header_mobile'}`.
- Footer product column gains `{ key: 'costsByDistrict', href: '/warsaw' }`
  (`landing.footer.costsByDistrict`) and `{ key: 'buildingReviews', href: '/warsaw/review' }`
  reusing `common.buildingReviews` (the footer is a server component: `getTranslations` for both
  namespaces). The three frozen listings links stay until FR-7.
- New keys in four locales: `common.findFlatmate`, `landing.footer.costsByDistrict` (PRD 4 §8).
- e2e (`e2e/home.spec.ts`): the home page contains a header link whose href ends with
  `/warsaw/roommate`.

## Home framing surfaces

FR-6 (**Decided**: not promoted, D5; the entries, D48; **Assumption**: targets and labels).

- Hero: the three chips (204–226) become one `Link` to `/warsaw/roommate` with the label
  `listings.roommateRoles.findFlatmate` (shared namespace), same chip styling (violet variant);
  the `landing.hero.trustLeaseTakeovers|trustRoommate|trustSublet` keys are deleted in four locales
  unless another component uses them (grep first; the task lists what it found).
- ForWhom: `personas` = `[{ key: 'rentTogether', href: '/warsaw/roommate', icon: Users }, { key:
'findRoom', href: '/warsaw/roommate', icon: Search }, { key: 'checkFlat', href: '/warsaw/check', icon:
MapPin }]` with keys `landing.forWhom.<key>.{title,description,cta}` (PRD 4 §8); the old
  `findHome|findRoommate|sublet` keys are deleted; `landing.cta.subtitle` and
  `landing.cta.freeNote` rewritten (§8).
- 404: the second button → `/${DEFAULT_CITY}/check` with `errors.notFound.browse` rewritten to
  "Check an address"; a third `Link` (ghost) → `/${DEFAULT_CITY}/roommate` with `common.findFlatmate`.
  Status stays 404; `robots` noindex stays.
- Dashboard: the "Browse listings" button → `/${DEFAULT_CITY}/costs` with `costs.title` (or the
  existing dashboard costs label; the task names the key). The listings tab itself is unchanged.
- Home district cards (`districts.tsx:146`) → `/${DEFAULT_CITY}/${slug}` keeping
  `DISTRICT_SLUG_OVERRIDES`.
- Test `src/components/landing/no-frozen-links.test.ts` (static scan): no file under
  `src/components/landing/` (footer excluded until FR-7) and neither `src/app/[locale]/page.tsx`
  nor `not-found.tsx` contains `/replacement`, `/sublet` or `/create-listing`.
- The hero H1 and subtitle: the H1 stays (Q-6); the subtitle drops "document templates" (FR-10).

## Footer product column (Open)

FR-7, **Open** (Q-5). Blocked task. Proposal when answered (a): remove `browseListings`,
`temporarySublets`, `addListing` from the footer and delete their keys; the roommate page hides the
`ListingTypeTabs` row while `cityOfferCount === 0` (`roommatePageLayout` gains `showTypeTabs`);
the no-frozen-links test extends to the footer. The pages stay reachable by URL.

## Flatmate callout

FR-8 (**Decided**: entries, D48; bot languages, D50; **Assumption**: component, copy, which surfaces
get counts or the figure).

- `src/components/roommate/flatmate-callout.tsx` (server component, `getTranslations('listings')`):
  `FlatmateCallout({ surface, counts?, split?, variant? })`.
  - `surface: FlatmateSurface = 'home' | 'building' | 'district' | 'hub' | 'calculator' | 'guide'`.
  - Renders a `section aria-labelledby` with: `h2` title (`listings.flatmateCallout.homeTitle` for
    `home`, else `listings.flatmateCallout.title`), the sentence `listings.findFlatmate.how`, the
    languages line `listings.findFlatmate.languages`, the count line when `counts?.status === 'counts'`
    (`listings.findFlatmate.count` with `{count: total}`, or `first` at 0), the per-person line when
    `split` is set (§Per-person line), a `Link` to `/warsaw/roommate`
    (`listings.flatmateCallout.roommateLink`) and, when `process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
    is set, the bot button (`listings.findFlatmate.button`) → `botStartUrl(username, surface)`.
  - The two links are a small client component `FlatmateCalloutLinks` (it needs `usePostHog`):
    the roommate link captures `cta_click { placement: `flatmate*callout*${surface}` }`; the bot
    button captures `telegram_bot_opened` with `telegramBotOpenedProperties(surface)`
    (`has_building_context: false`), opens in a new tab.
  - Never returns `null`; without the username the bot button is absent.
- `src/lib/analytics/telegram-events.ts`: `TelegramBotSource` gains the six surfaces;
  `botStartPayload(source, buildingId?)`: `buildingId` → `b_<id>`; `roommate` →
  `mate_web_roommate`; any of the six surfaces → `mate_web_<surface>`; `checker` and `empty` →
  `web_<source>` as today. Table-driven test: every source. `parseStartPayload('mate_web_home')` →
  `{ kind: 'roommate', source: 'web', detail: 'home' }` (spec 04, already built; one test row per
  surface asserts the round trip).
- Pure helper `flatmateCalloutView({ surface, counts, split, hasUsername })` in
  `src/lib/roommate/flatmate-callout.ts` → `{ titleKey, countLine: 'count' | 'first' | 'none',
showSplit, showBotButton, payload, placement }`; tests: each `counts` state, each surface's
  payload and placement, no username.
- Keys (four locales, PRD 4 §8): `listings.flatmateCallout.homeTitle`, `title`, `roommateLink`;
  the rest reuse `listings.findFlatmate.*`. The PL `languages` value carries the FR-17 clause.
- Counts: callers pass `loadFlatmateBlockCounts()` where they are dynamic or ISR (home, hub,
  district); static blog pages and the calculator client pass nothing.

## Home thesis section

FR-9 (**Decided**: the thesis sentence, D48; **Assumption**: placement).

- `src/app/[locale]/page.tsx`: `HomeContent`'s `Promise.allSettled` gains
  `loadFlatmateBlockCounts()` and `loadWarsawPerPersonSplit()` (§Per-person line); a rejection →
  `undefined`. `<FlatmateCallout surface="home" counts={…} split={…} />` renders between `Hero` and
  `CheckAddress`, inside `main`.
- `generateMetadata` of the home page is unchanged (the layout's `meta.homeTitle` applies).
- e2e (`e2e/home.spec.ts`): `/` contains the thesis section (a link to `/warsaw/roommate` inside a
  section whose heading contains "Passflat"); the bot button is absent (no username in the e2e
  env) and the test says so in its name.

## Home copy

FR-10 (**Assumption**: drafts; D25 honesty rule **Decided**). Keys rewritten in four locales from
PRD 4 §8 and appendix seo.md table K: `meta.homeTitle`, `meta.homeDescription`,
`landing.footer.tagline`, `landing.hero.costsCta`, `landing.hero.subtitle` (drop "document
templates", keep the cost sentence), `landing.tools.templatesDescription` (one sentence: Polish
originals with EN, RU, UK versions; the task checks the set against `public/documents/`),
`landing.forWhom.*`, `landing.cta.subtitle`, `landing.cta.freeNote`. `meta.homeTitle`,
`meta.homeDescription`, `landing.footer.tagline`, `landing.hero.costsCta`,
`landing.tools.templatesDescription` join `REWRITTEN_KEYS`. A test asserts that every locale's
`templatesDescription` names four languages (the task encodes the language words per locale).

## Callout placements

FR-11, FR-12 (**Decided**: entries, D48; not promoted, D5; **Assumption**: placement, no number on
a building, no counts on static pages).

| Surface      | File                                                                | Where                                                                                     | Counts                      | Split                                         |
| ------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------- |
| `building`   | `[city]/building/[slug]/{page,client}.tsx`                          | replaces the bottom card (1215–1235); outside the contribution gate                       | none                        | none (N 1–3; SE-12)                           |
| `district`   | `[city]/[district]/page.tsx`                                        | inside spec 09 §District section; until then under the buttons row                        | `loadFlatmateBlockCounts()` | the district's `split` (spec 09)              |
| `hub`        | `[city]/page.tsx`                                                   | under the buttons row                                                                     | `loadFlatmateBlockCounts()` | `loadWarsawPerPersonSplit()`                  |
| `calculator` | `[city]/calculator/{page,client}.tsx`                               | under the result buttons; rendered from the page as a server slot or passed `hasUsername` | none                        | none                                          |
| `guide`      | `blog/[slug]/{page,client}.tsx`, `blog/warsaw-rent-prices/page.tsx` | after the body and the template block; the report: under the city figure                  | none                        | the report only: `loadWarsawPerPersonSplit()` |

- Building page: the keys `costs.building.lookingForApartment`, `lookingForApartmentDesc`,
  `viewListingsIn` are deleted in four locales (`lookingForApartmentDesc` leaves `REWRITTEN_KEYS`);
  the client no longer references `/replacement`. The callout is a server component: the page
  renders it and passes it to the client as a `ReactNode` slot (`children` or a named prop), the
  client places it where the card was.
- Guide: one line before the callout with `listings.roommateCostsBridge` and a `Link` to
  `/${DEFAULT_CITY}/check` (`listings.roommateCostsBridgeCta`), without the roommate page's event
  (no `cost_data_cta_clicked` from guides: it belongs to the roommate bridge; agent's choice, named
  in the progress entry). Blog list: a second `Button` to `/warsaw/roommate` with `blog.ctaFlatmate`
  next to `blog.ctaButton`; `blog.ctaText` rewritten (§8).
- Tests: a static scan that the building client contains no `/replacement`; `flatmateCalloutView`
  per surface; key parity.

## Per-person line

FR-13 (**Decided**: D61, D71; **Assumption**: surfaces).

- `src/lib/roommate/room-costs.ts` gains `loadWarsawPerPersonSplit(): Promise<PerPersonSplit | null>`
  = `loadRoomCostAreas(cityOfWarsaw, [])[0]?.split ?? null`, wrapped in try/catch → `null`
  (the city row is read once as `loadRoomMoneyReference` does). The roommate page, the home page,
  the hub and the data report call it.
- `src/lib/roommate/per-person-line.ts` (pure): `perPersonLineValues(split, areaName)` →
  `{ n, half, area }` for the key `listings.flatmateCallout.perPerson` (PRD 4 §8; `{area}` is the
  city's translated name `t(city.nameKey)` for level `city`, the district's `nameKey` for level
  `district`). Both the flatmate block (`split?: PerPersonSplit | null` prop) and the callout render
  it through this helper; `null` → nothing.
- Golden tests from PRD 4 §5: example 1 → `{ n: 5, half: 2450 }`; example 2 → `null`; example 3 →
  `null`. A consistency test (`src/lib/roommate/per-person-consistency.test.ts`) feeds one fixture
  through `perPersonSplit` + the website helper and through the bot's `roomCostsReply` for a profile
  with `anyDistrict: true`, and compares value and N.
- The roommate page passes `split` to `FindFlatmateBlock`, rendered under the title; the block's
  counts line stays where it is.

## Checker handoff

FR-14 (**Assumption**: markup and hint; payload and events **Decided** as built).

- `TelegramBotCta` renders `<a className={cn(buttonVariants({ variant: 'outline' }), 'h-auto min-h-11
whitespace-normal')}>` with the same href, `onClick` and label, followed by
  `<p className="mt-2 text-sm text-muted-foreground">{t('costs.telegramHint')}</p>`. New key
  `checker.costs.telegramHint` (four locales, PRD 4 §8; names EN/RU/UK for the bot and RU/UK for the
  deposit letter, D63). `src/i18n/bot-languages-copy.test.ts` passes (English named).
- Without the username the component still returns `null` (the checker never shows a bot line it
  cannot back). No roommate callout on the checker.

## How it works, Help and About

FR-15 (**Assumption**: drafts); FR-16 **Open** (Q-3).

- `HowItWorksTabs`: `TABS = ['roommate', 'replacement', 'sublet']` (roommate first and default);
  `landing.howItWorks.roommate.step{1..4}{Title,Desc}` and `landing.howItWorks.subtitle` rewritten
  (PRD 4 §8); the other tabs' copy is untouched until Q-3.
- `landing.faq.q7` / `a7` added and rendered first (`faq.tsx` reads the keys in order; the task
  names how the list is built).
- Rewritten in four locales: `helpCenter.general.a1`, `helpCenter.general.a2`,
  `about.solution.pillar{1,2,3}{Title,Desc}`, `about.team.description2`,
  `about.values.principle1Desc` (joins `REWRITTEN_KEYS`). No price, listing feature, "verified",
  match guarantee or date in any rewritten value (the honesty test's forbidden list plus a check
  for "PLN" and "zł" in these keys).
- FR-16 (blocked task): payments answers, the cesja and sublet tabs, `howItWorksPage.listers.*`,
  the About counter, `meta.pricingDescription`.

## Polish visitor and the posting kit

FR-17 (**Decided**: D50, D53; **Assumption**: the clause and the link rule).

- `listings.roommateRoles.findFlatmate` pl = "Szukam kogoś do wspólnego wynajmu".
- `listings.findFlatmate.languages` pl = "Bot mówi po angielsku, rosyjsku i ukraińsku — polskiej
  wersji jeszcze nie ma, po angielsku poradzisz sobie w minutę."; en, ru, uk unchanged;
  `bot-languages-copy.test.ts` passes.
- `docs/marketing/roommate-posts.md` "How to use a template": website links in posts carry the
  reader's locale (`/ru/…` or `/uk/…`; the site has no locale cookie, spec 01 / architecture §6); a
  test in `roommate-posting-kit.test.ts` asserts every `passflat.com/` URL in the kit has a
  `/ru/`, `/uk/` or `/en/` prefix (today the kit may hold none; the test still runs).

## Roommate page copy

FR-18 (**Assumption**). `listings.demandCapture.searchCardTitleRoommate` (new key, PRD 4 §8) is
used by `ListingsEmptyState` when `listingType === 'roommate'`; the other types keep
`searchCardTitle`. `listings.noMatch.title` ru/uk switch to «ты»/«ти». `listings.demandCapture.consentNote`
is not changed (Q-9).

## Dead-end forms (Open)

FR-19 (Q-2) and FR-20 (Q-4): blocked tasks with the proposals of the decision review. Nothing
changes until the owner answers; FR-18 only rewords the card's title.

## Events (PRD 4 values)

Existing names, new values (spec 01 §PRD 4 values): `telegram_bot_opened.source` ∈ `{checker,
empty, roommate, home, building, district, hub, calculator, guide}`; `cta_click.placement` gains
`flatmate_callout_<surface>`. The bot receives `mate_web_<surface>` and records
`tg_roommate_flow_started {entry_source: 'web', entry_detail: <surface>}` without a code change
(spec 04 §Start payloads). No new event; nothing stored.
