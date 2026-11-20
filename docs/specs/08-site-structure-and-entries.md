# 08 · Site structure and roommate entries (PRD 4, M1 – M2)

Requirements FR-1 – FR-20 of PRD 4 (`../product/prd/prd-4-site-improvements.md`). The website
becomes an entry into the bot's roommate matching (D48): the roommate page opens on the flatmate
block, the header and the home page state the thesis, and one shared callout appears on every cost
surface. Listings stay frozen and are not promoted (D5): links to `/replacement`, `/sublet` and
`/create-listing` are re-pointed, never the pages themselves; the footer drops its three links and
the roommate page hides the type tabs at 0 offers (FR-7, **Decided**, D82); the pages stay
reachable by URL. No table, migration, cron, dependency or new event name (**Decided**,
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
- Footer (`src/components/landing/footer.tsx`): no `'use client'` and the non-async
  `useTranslations()` hook, so it renders as a server component on server pages and also inside
  client components (the building client and the costs and dashboard views import it); keep it so
  (never switch it to `getTranslations`). Product column `browseListings` → `/warsaw/replacement`,
  `roommateSearch` → `/warsaw/roommate`, `temporarySublets` → `/warsaw/sublet`, `costReports` →
  `/warsaw/costs`, `addListing` → `/create-listing`, `resources`; column titles `h4`;
  `landing.footer.tagline` (50).
- `src/app/[locale]/[city]/roommate/page.tsx:33` builds the title as `listings.titleRoommate` +
  ` — {cityName}`, and the locale layout's template appends ` — Passflat`.
- `src/components/landing/faq.tsx`: `FAQ_KEYS = ['q1' … 'q6']` and the answer key is
  `` `a${i + 1}` ``, so answers pair with questions by position.
- `src/app/[locale]/[city]/calculator/page.tsx:87`: the calculator's scoped provider passes only the
  `calculator`, `common` and `share` namespaces to its client tree.
- `check/client.tsx` renders `TelegramBotCta` inside `<div onClickCapture={() => captureCta('telegram')}>`
  twice (649, 684): anything inside that wrapper fires `checker_cta_clicked`.
- `public/documents/`: four templates, each a Polish original (`.docx`, `.pdf`) with `-en`, `-ru`,
  `-uk` PDFs: `cesja-umowy-najmu`, `protokol-zdawczo-odbiorczy`, `umowa-podnajmu`,
  `umowa-wspollokatorska`.
- The bot's per-person sentence (`src/lib/bot/roommate-texts.ts`, `roomSplit`): EN "For two people
  about {value} each (half of the median flat, {count} tenant reports, {area}).", RU «На двоих —
  примерно по {value} с человека (половина медианы по целым квартирам, {area}; отчёты жильцов:
  {count}).», UK «Удвох — приблизно по {value} з людини (половина медіани за цілими квартирами,
  {area}; звіти мешканців: {count}).»
- e2e (`playwright.config.ts`) builds without a database and without a bot username: the home page
  and other non-city pages render; every `/[city]/…` page returns 500 there (`ralph/progress.md`
  Learnings), so the roommate, building, district, hub and calculator pages are not e2e-testable.
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
  `src/app/[locale]/[city]/roommate/client-namespaces.test.ts`, `src/i18n/honesty-copy.test.ts`,
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
- Hiding the type tabs at 0 offers is FR-7 (**Decided**, D82; §Footer product column): not done
  here.
- `roommate_intent_selected` fires only on a tap, as today; nothing fires on load.
- Not e2e-testable (the roommate page needs a database, §Current state): the helper's unit tests
  are the proof; the progress entry says the page was not rendered.

## Roommate page shell and metadata

FR-3 (**Decided**: URL, canonical, hreflang unchanged; **Assumption**: wording), FR-4
(**Assumption**: markup).

- Keys rewritten in four locales: `listings.titleRoommate` and `listings.roommateMetaDescription`
  from **appendix seo.md table A** (the source for both; table A's descriptions fit about 155
  characters, PRD 4 §8's longer ones do not), the PL title starting with "Szukam
  współlokatora"; new key `listings.roommateH1` from PRD 4 §8. No draft says "free" or
  "bezpłatnie" here; D89 (Q-12) allows "Free, no account", and the §Owner questions task adds it to
  the description. All three keys join
  `REWRITTEN_KEYS` (`src/i18n/honesty-copy.test.ts`); no promise of a match, a date or a result;
  the city stands after a colon or dash or as the literal "w Warszawie" (spec 09 §Nominative-safe
  templates).
- `generateMetadata` drops the ` — {cityName}` concatenation: the title is the key's value (it
  already names Warsaw), and the layout's template adds ` — Passflat`. It keeps
  `getAlternates('/${city}/roommate', locale)` and `getOgImage(title, description)`.
- `ListingsPageClient` renders `<h1 className="sr-only sm:not-sr-only …">{t('listings.roommateH1')}</h1>`
  (visually small, agent's choice of classes) as the first child of the content column on the
  roommate page only; the filters sidebar's heading stays `h2`.
- The content column (the `flex min-h-0 min-w-0 flex-1 flex-col` div) is wrapped in `<main id="main">`
  for all three listing types; the root class `h-screen` → `h-dvh`.
- `<Footer />` renders at the end of the scrolling list container (after the grid or empty state)
  for all three listing types, imported directly in the client component as the building client
  does (the footer is isomorphic, §Current state).
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
  reusing `common.buildingReviews` (the footer keeps its `useTranslations()` hook, which reads both
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
  `findHome|findRoommate|sublet` keys are deleted; `landing.cta.subtitle` rewritten (§8) and
  `landing.cta.freeNote` rewritten to "No account needed." (EN; PL "Bez zakładania konta.", RU «Без
  регистрации.», UK «Без реєстрації.»): the interim value; D89 (Q-12) makes it "Free, no account"
  in the §Owner questions task.
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
- The hero H1 and subtitle: the H1 is rewritten to the thesis in the §Owner questions task (D83,
  Q-6 (c)); the subtitle drops "document templates" (FR-10).

## Footer product column

FR-7, **Decided** (D82, Q-5 (a), answered 2026-11-20). Task T122.

- `src/components/landing/footer.tsx`: the product column drops `browseListings`
  (→ `/warsaw/replacement`), `temporarySublets` (→ `/warsaw/sublet`) and `addListing`
  (→ `/create-listing`); the keys `landing.footer.browseListings`, `temporarySublets` and
  `addListing` are deleted in four locales unless another component reads them (grep first; parity
  test). The other entries of the column stay as §Header and footer entries left them.
- `roommatePageLayout` (§Roommate page default view) gains `showTypeTabs`: `false` when
  `listingType === 'roommate' && cityOfferCount === 0`, otherwise `true`; `ListingsPageClient`
  renders the `ListingTypeTabs` row only when it is `true`. `/replacement` and `/sublet` keep their
  tabs; the roommate page shows them again when an offer exists. Unit tests: the three cases.
- `src/components/landing/no-frozen-links.test.ts` drops its footer exclusion: no file under
  `src/components/landing/` links to `/replacement`, `/sublet` or `/create-listing`.
- Nothing is removed or redirected: the three pages stay reachable by URL (D5).

## Flatmate callout

FR-8 (**Decided**: entries, D48; bot languages, D50; **Assumption**: component, copy, which surfaces
get counts or the figure).

- `src/components/roommate/flatmate-callout.tsx` (async server component, `getTranslations('listings')`):
  `FlatmateCallout({ surface, counts?, split? })` (`split` is added by §Per-person line).
  - `surface: FlatmateSurface = 'home' | 'building' | 'district' | 'hub' | 'calculator' | 'guide' |
'report'` (`report` = the data report `/blog/warsaw-rent-prices`, kept apart from the guides so
    the readout can tell them apart).
  - Renders a `section aria-labelledby` with: `h2` title (`listings.flatmateCallout.homeTitle` for
    `home`, else `listings.flatmateCallout.title`), the sentence `listings.findFlatmate.how`, the
    languages line `listings.findFlatmate.languages`, the count line when `counts?.status === 'counts'`
    (`listings.findFlatmate.count` with `{count: total}`, or `first` at 0), a `Link` to
    `/warsaw/roommate` (`listings.flatmateCallout.roommateLink`) and, when
    `process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is set, the bot button
    (`listings.findFlatmate.button`) → `botStartUrl(username, surface)`.
  - The two links are a small client component `FlatmateCalloutLinks` (it needs `usePostHog`). It
    reads **no message namespace**: the server callout resolves both labels and passes them as
    string props (`roommateLabel`, `botLabel`), so the callout also works under route-scoped
    providers such as the calculator's (`calculator`, `common`, `share` only). The roommate link
    captures `cta_click` with `placement: 'flatmate_callout_<surface>'`; the bot button captures
    `telegram_bot_opened` with `telegramBotOpenedProperties(surface)` (`has_building_context:
false`) and opens in a new tab.
  - Never returns `null`; without the username the bot button is absent.
  - A client component cannot import this async server component: client pages (the building
    client, the calculator client) receive it from their server `page.tsx` as a `ReactNode` prop.
- `src/lib/analytics/telegram-events.ts`: `TelegramBotSource` gains the seven surfaces;
  `botStartPayload(source, buildingId?)`: `buildingId` → `b_<id>`; `roommate` →
  `mate_web_roommate`; any of the seven surfaces → `mate_web_<surface>`; `checker` and `empty` →
  `web_<source>` as today. Table-driven test: every source. `parseStartPayload('mate_web_home')` →
  `{ kind: 'roommate', source: 'web', detail: 'home' }` (spec 04, already built; one test row per
  surface asserts the round trip).
- Pure helper `flatmateCalloutView({ surface, counts, hasUsername })` in
  `src/lib/roommate/flatmate-callout.ts` → `{ titleKey, countLine: 'count' | 'first' | 'none',
showBotButton, payload, placement }`; tests: each `counts` state, each surface's payload and
  placement, no username.
- Keys (four locales, PRD 4 §8): `listings.flatmateCallout.homeTitle`, `title`, `roommateLink`;
  the rest reuse `listings.findFlatmate.*`. The PL `languages` value carries the FR-17 clause.
- Counts: callers pass `loadFlatmateBlockCounts()` where they are dynamic or ISR (home, hub,
  district); static blog pages, the data report and the calculator pass nothing.
- **Attribution limit** (for the readout, spec 05): a visitor who takes the callout's roommate link
  and then the roommate page's bot button is recorded as `telegram_bot_opened {source: roommate}`
  and `mate_web_roommate`; only `cta_click.placement` tells which surface sent them to the roommate
  page. `entry_detail` names the surface only for the callout's own bot button.

## Home thesis section

FR-9 (**Decided**: the thesis sentence, D48; **Assumption**: placement).

- `src/app/[locale]/page.tsx`: `HomeContent`'s `Promise.allSettled` gains
  `loadFlatmateBlockCounts()`; a rejection → `undefined`. `<FlatmateCallout surface="home"
counts={…} />` renders between `Hero` and `CheckAddress`, inside `main`. The per-person split is
  added by the §Per-person line task (`loadWarsawPerPersonSplit()` joins the same `allSettled`).
- `generateMetadata` of the home page is unchanged (the layout's `meta.homeTitle` applies).
- e2e (`e2e/home.spec.ts`): `/` contains the thesis section (a link to `/warsaw/roommate` inside a
  section whose heading contains "Passflat"); the bot button is absent (no username in the e2e
  env) and the test says so in its name.

## Home copy

FR-10 (**Assumption**: drafts; D25 honesty rule **Decided**; the thesis-first positioning of the
hero H1, the home title, description and tagline is **Decided**, D83, Q-6 (c): built by the §Owner
questions task after this one).

- This task owns the home keys; spec 09 §Honesty keys does not touch them.
- **Honesty and D5 rewrite, current positioning kept** (the cost site first, as today): the values
  lose "real / realne / реальные / реальні", "the full truth / prawdziwą cenę" and the listings
  (D5), and add no "free" claim (Q-12). EN drafts, the agent writes PL, RU and UK in the same
  meaning: `meta.homeTitle` "Passflat — Warsaw rentals: reported costs, guides, documents";
  `meta.homeDescription` "Rental costs in Warsaw as tenants reported them, by building and district,
  each with its number of reports; an address check, a calculator, guides and document templates.";
  `landing.footer.tagline` "Rental costs in Warsaw as tenants reported them, with their counts;
  guides and document templates."; `landing.hero.costsCta` "See reported costs";
  `landing.hero.subtitle` drops "document templates" and keeps its cost sentence.
- The thesis-first versions (appendix seo.md table K, the PRD 4 §8 tagline) and the hero H1 are the
  §Owner questions task (D83); they replace the interim values above.
- `landing.tools.templatesDescription`: one sentence naming the four documents of
  `public/documents/` and the languages, EN "Lease assignment (cesja), handover protocol, sublease
  agreement and flatmate agreement — Polish originals with English, Russian and Ukrainian
  versions." (PL "Cesja umowy najmu, protokół zdawczo-odbiorczy, umowa podnajmu i umowa
  współlokatorska — polskie oryginały z wersjami po angielsku, rosyjsku i ukraińsku.", RU «Цессия
  договора аренды, протокол приёма-передачи, договор субаренды и соглашение соседей — польские
  оригиналы с версиями на английском, русском и украинском.», UK «Цесія договору оренди, акт
  приймання-передачі, договір суборенди та угода співмешканців — польські оригінали з версіями
  англійською, російською та українською.»).
- `meta.homeTitle`, `meta.homeDescription`, `landing.footer.tagline`, `landing.hero.costsCta`,
  `landing.tools.templatesDescription` join `REWRITTEN_KEYS`. A test asserts that every locale's
  `templatesDescription` names the same four languages (language words per locale encoded in the
  test) and that `public/documents/` holds exactly the four template stems with `-en`, `-ru`, `-uk`
  versions the sentence names (the test lists the stems).

## Callout placements

FR-11, FR-12 (**Decided**: entries, D48; not promoted, D5; **Assumption**: placement, no number on
a building, no counts on static pages).

| Surface      | File                                       | Task            | Where                                                               | Counts                      | Split (§Per-person line)              |
| ------------ | ------------------------------------------ | --------------- | ------------------------------------------------------------------- | --------------------------- | ------------------------------------- |
| `building`   | `[city]/building/[slug]/{page,client}.tsx` | FR-11           | replaces the bottom card (1215–1235); outside the contribution gate | none                        | none (N 1–3; SE-12)                   |
| `hub`        | `[city]/page.tsx`                          | FR-11           | under the buttons row                                               | `loadFlatmateBlockCounts()` | `loadWarsawPerPersonSplit()`          |
| `district`   | `[city]/[district]/page.tsx`               | FR-26 (spec 09) | inside spec 09 §District section                                    | `loadFlatmateBlockCounts()` | the district area's `split` (spec 09) |
| `calculator` | `[city]/calculator/{page,client}.tsx`      | FR-12           | under the result buttons; the server page passes it as a prop       | none                        | none                                  |
| `guide`      | `blog/[slug]/{page,client}.tsx`            | FR-12           | after the body and the template block                               | none (static)               | none                                  |
| `report`     | `blog/warsaw-rent-prices/page.tsx`         | FR-12           | under the city figure                                               | none                        | `loadWarsawPerPersonSplit()`          |

- Building page: the keys `costs.building.lookingForApartment`, `lookingForApartmentDesc`,
  `viewListingsIn` are deleted in four locales (`lookingForApartmentDesc` leaves `REWRITTEN_KEYS`);
  the client no longer references `/replacement`. The server page renders the callout and passes
  it to the client as a `ReactNode` prop; the client places it where the card was.
- Calculator: the server `page.tsx` renders the callout and passes it to the client as a
  `ReactNode` prop; its links carry their labels as props (§Flatmate callout), so the scoped
  provider needs no new namespace.
- Guide: one line before the callout with `listings.roommateCostsBridge` and a `Link` to
  `/${DEFAULT_CITY}/check` (`listings.roommateCostsBridgeCta`), without the roommate page's event
  (no `cost_data_cta_clicked` from guides: it belongs to the roommate bridge; agent's choice, named
  in the progress entry). Blog list: a second `Button` to `/warsaw/roommate` with `blog.ctaFlatmate`
  next to `blog.ctaButton`; `blog.ctaText` rewritten (§8).
- Tests: a static scan that the building client contains no `/replacement`; `flatmateCalloutView`
  per surface; key parity.

## Per-person line

FR-13 (**Decided**: D61, D71; **Assumption**: surfaces).

- **Where** (Assumption, PRD 4 FR-13): the roommate page's flatmate block, the home section, the hub
  callout, the data report callout and (spec 09) the district callout. The rule is the bot's,
  unchanged (D61, D71: tenant group, all-in median of whole flats with 2 or more rooms, halved,
  rounded half up to 10 zł, N ≥ 2, never asking prices or a known part); the website adds no
  aggregation.
- `src/lib/roommate/room-costs.ts` gains `loadWarsawPerPersonSplit(): Promise<PerPersonSplit | null>`:
  it reads the Warsaw city row with its districts (`id`, `slug`, `nameKey`; by slug `warsaw`, the
  shape `loadRoomCostAreas` needs: `loadRoomMoneyReference(cityId)` reads no city row), returns
  `loadRoomCostAreas(city, [])[0]?.split ?? null`, and catches every error → `null` (logged without
  data).
- **One key, the bot's wording**: `listings.flatmateCallout.perPerson` with `{value}` (the amount
  formatted as the room money block formats amounts, with "zł"), `{count}` and `{area}`: EN, RU and
  UK = the bot's `roomSplit` sentences verbatim (§Current state); PL "Na dwie osoby — około
  {value} na osobę (połowa mediany całych mieszkań, {area}; zgłoszenia najemców: {count})." The
  key joins `REWRITTEN_KEYS` and passes the honesty regexes (no «повністю», no "market", no
  percentage).
- `src/lib/roommate/per-person-line.ts` (pure): `perPersonLineValues(split, areaName)` →
  `{ value, count, area } | null`. `{area}` is the split's **own** area: the split has its own level
  (the district from 5 qualifying flats, else Warsaw, `room-costs.ts` 63–66), so a district page
  can show a Warsaw split, named Warsaw. The **server** resolves the name and passes a string (the
  city's `nameKey` through `getTranslations`, a district's `nameKey` display name as is); no client
  component reads a `city.*` key.
- Both `FindFlatmateBlock` (`split?: PerPersonSplit | null`, `splitArea?: string`) and
  `FlatmateCallout` (`split?`, `splitArea?`) render the line through the helper; `null` → nothing.
  The line is rendered **once** per page: on the district page and the data report only the
  callout renders it.
- Golden tests from PRD 4 §5: example 1 → `{ value: 2450, count: 5 }`; example 2 → `null`;
  example 3 → `null`. A consistency test (`src/lib/roommate/per-person-consistency.test.ts`) feeds
  one fixture through `perPersonSplit` + the website helper and through the bot's `roomCostsReply`
  for a profile with `anyDistrict: true`, and compares value and N.
- The roommate page passes `split` to `FindFlatmateBlock`, rendered under the title; the block's
  counts line stays where it is.

## Checker handoff

FR-14 (**Assumption**: markup and hint; payload and events **Decided** as built).

- `TelegramBotCta` renders `<a className={cn(buttonVariants({ variant: 'outline' }), 'h-auto min-h-11
whitespace-normal')}>` with the same href, `onClick` and label.
- The hint `<p className="mt-2 text-sm text-muted-foreground">{t('costs.telegramHint')}</p>` is a
  separate small component (`TelegramBotHint`, same file) that `check/client.tsx` renders **after**
  each `<div onClickCapture={() => captureCta('telegram')}>` wrapper, never inside it, so a tap on
  the hint fires no `checker_cta_clicked`. New key `checker.costs.telegramHint` (four locales, PRD 4
  §8; names EN/RU/UK for the bot and RU/UK for the deposit letter, D63).
  `src/i18n/bot-languages-copy.test.ts` passes (English named).
- Without the username both components return `null` (the checker never shows a bot line it
  cannot back). No roommate callout on the checker. A static test asserts the hint is not inside
  an `onClickCapture` wrapper in `check/client.tsx`.

## How it works, Help and About

FR-15 (**Assumption**: drafts); FR-16 **Decided** (D80, Q-3 (a) with "nothing is paid today").

- `HowItWorksTabs`: `TABS = ['roommate', 'replacement', 'sublet']` (roommate first and default);
  `landing.howItWorks.roommate.step{1..4}{Title,Desc}` and `landing.howItWorks.subtitle` rewritten
  (PRD 4 §8); the other tabs go in the FR-16 task (D80).
  Two tasks: (1) the tabs and the FAQ, (2) the Help and About copy.

- `landing.faq.q7` / `a7` added and rendered first. `faq.tsx` pairs answers by position today
  (`` `a${i + 1}` ``), so prepending `q7` would show `a1` under it: the list becomes explicit pairs
  `FAQ_ITEMS = [{ q: 'q7', a: 'a7' }, { q: 'q1', a: 'a1' }, …]` in a pure module with a test that
  every pair's numbers match and every key exists in four locales.
- Rewritten in four locales: `helpCenter.general.a1`, `about.solution.pillar{1,2,3}{Title,Desc}`,
  `about.team.description2`, `about.values.principle1Desc` (joins `REWRITTEN_KEYS`; this task owns
  it, spec 09 §Honesty keys does not). No price, listing feature, "verified", match guarantee or
  date in any rewritten value (the honesty test's forbidden list plus a check for "PLN" and "zł" in
  these keys).
- `helpCenter.general.a2` answers "Is Passflat free?": a statement about prices, so it belongs to
  FR-16 and is not changed here.
- **FR-16** (**Decided**, D80; task T133), "nothing is paid today":
  - `helpCenter.general.a2` → Passflat is free today, in the sense of EN "Yes. Everything on
    Passflat is free today: the figures, the address check, the calculator, the guides, the
    templates and the Telegram bot." (agent draft, four locales); nothing about future prices and
    no "forever".
  - The Help payments section (`helpCenter.payments.*`, with its 14-day withdrawal answer) is
    removed from `help/client.tsx` and its keys deleted; the promotion answer (the `a6` "Promoted
    listings … 39 PLN" of its Help section) goes with its question. The withdrawal text returns
    only with a real paid service; the terms and the checkout keep theirs for the frozen flows.
  - `HowItWorksTabs`: `TABS = ['roommate']`; with one tab the tab strip is not rendered (or the
    component becomes a plain list; the agent's choice); the `replacement` and `sublet` step keys
    and the `tabReplacement` / `tabSublet` labels are deleted in four locales.
  - `/how-it-works`: the `listers` tab and `howItWorksPage.listers.*` are removed; the `seekers`
    and `costs` tabs stay (`seekers.step1Desc` was reworded by spec 09 §Honesty keys).
  - `/about`: the "{listings}+" counter leaves the stats block (the cost-reports counter stays
    while it is above 0); its label key (`about.stats.listings`) is deleted if nothing else reads
    it.
  - `meta.pricingDescription` is deleted in four locales (grep for readers first).
  - Tests: key parity; a test asserts that no value under `helpCenter`, `howItWorksPage` and
    `landing.howItWorks` contains "PLN" or "zł" (a price); no page names a price.
  - Every changed value is listed in the progress entry for the owner (D29).

## Polish visitor and the posting kit

FR-17 (**Decided**: D50, D53; **Assumption**: the clause and the link rule).

- `listings.roommateRoles.findFlatmate` pl = "Szukam kogoś do wspólnego wynajmu".
- `listings.findFlatmate.languages` pl = "Bot mówi po angielsku, rosyjsku i ukraińsku — polskiej
  wersji jeszcze nie ma, po angielsku poradzisz sobie w minutę."; en, ru, uk unchanged;
  `bot-languages-copy.test.ts` passes.
- `docs/marketing/roommate-posts.md` "How to use a template": website links in posts carry the
  reader's locale (`/ru/…` or `/uk/…`; the site has no locale cookie, spec 01 / architecture §6),
  written without a literal bare URL in the rule sentence; a test in `roommate-posting-kit.test.ts`
  asserts every `passflat.com/` URL inside the kit's **templates** (the template blocks the test
  already parses, not the rule prose) has a `/ru/`, `/uk/` or `/en/` prefix (today the templates
  may hold none; the test still runs).

## Roommate page copy

FR-18 (**Assumption**). `listings.demandCapture.searchCardTitleRoommate` (new key, PRD 4 §8) is
used by `ListingsEmptyState` when `listingType === 'roommate'`; the other types keep
`searchCardTitle`. `listings.noMatch.title` ru/uk switch to «ты»/«ти». `listings.demandCapture.consentNote`
changes in the §Owner questions task (D86: «ты» / «ти»), not here.

## Dead-end forms

FR-19 (**Decided**, D79, Q-2; task T135) and FR-20 (**Decided**, D81, Q-4; task T136). Neither
answer is the decision review's proposal.

- **FR-19, the city-notify form stays** on the home page as a demand signal with new copy; the
  component, the API, the stored rows, `city_notify_subscribed` and the manual city-launch route
  (`/api/cron/city-launch`, D33, D47) are unchanged. Copy in `landing.cityNotify.*`, four locales:
  - `title`: RU «Живёте не в Варшаве?» (the owner's wording, given); EN "Live outside Warsaw?"; PL
    and UK in the same sense (agent drafts).
  - `subtitle`: RU «Пока работаем только здесь. Напишите свой город — так мы видим, где нас ждут.
    Когда откроем ваш город, пришлём уведомление на почту.» (given); EN "We only work here for
    now. Tell us your city — that is how we see where people are waiting for us. When we open your
    city, we'll send you an e-mail."; PL and UK in the same sense: "when", not "if", and an e-mail
    notification (one e-mail at the launch, which the city-launch route sends).
  - `badge` ("Expanding soon") contradicts "we only work here for now" (D6): it becomes the D87
    line ("Warsaw only for now.") or is dropped; `currentCity` stays or goes; `success` may say the
    e-mail comes when the city opens. The agent's choices (Assumption), listed in the progress
    entry; a dropped key is deleted in four locales.
  - The honesty test and key parity pass.
- **The checker's outside-city form** (`checker.outside.*`) already promises the same one e-mail
  ("we'll tell you when Passflat launches in this city") and is not changed.
- **FR-20, both stay:** `ListingsEmptyState` keeps the e-mail card on the roommate page (E13 keeps
  counting `listing_interest_saved` from it; spec 05's E13 note is unchanged) and "I have a free
  room" keeps its target (sign-in, then the listing form; PRD 1 FR-15's test stands). The wording is
  FR-18's (built, T134). T136 changes no code and closes with the answer in its progress entry.

## Owner questions (answered 2026-11-20)

The night rule (`prd-intake` §3) held every owner question in a blocked task; the owner answered
all of them on 2026-11-20 (D78 – D91, `../product/decisions.md`). The two copy tasks of this spec:

- **Q-6, positioning** (**Decided**, D83, option (c); task T125; audit S-3): thesis-first in four
  locales, as drafts for the owner's review (D29):
  - The hero H1, `landing.hero.title` + `landing.hero.titleHighlight` (today "Don't overpay for
    rent" + "in Warsaw."): EN "Who to rent with in Warsaw, and what it costs per person", RU «С кем
    снимать в Варшаве и сколько это на человека» (the owner's draft); PL and UK in the same sense
    (agent drafts). How the sentence splits across the two keys is the agent's choice (for example
    the per-person half as the highlight); `landing.hero.subtitle` stays as T124 left it.
  - `meta.homeTitle` and `meta.homeDescription`: appendix seo.md table K's drafts (EN "Passflat —
    who to rent with in Warsaw, and what it costs" / "Find a flatmate through our Telegram bot and
    see what tenants reported for rent in Warsaw: rent and utilities by building and district,
    calculator, guides."; PL, RU and UK in the table). The title stays under about 60 characters
    and the description under about 155 (shorten, never into a claim).
  - `landing.footer.tagline`: the PRD 4 §8 tagline (EN "Find someone to rent with in Warsaw and
    see what it costs per person — figures reported by tenants, with their counts."; PL, RU and UK
    there).
  - All five keys stay in `REWRITTEN_KEYS`; the honesty test and key parity pass; any e2e or unit
    test that reads the old H1 or title follows. The changed keys are listed for the owner.
- **Q-9 – Q-12, copy questions** (**Decided**, D86 – D89; task T137; audit S-34), four locales:
  - Q-9 (D86): `listings.demandCapture.consentNote` ru «Нажимая, ты соглашаешься на обработку
    данных — …», uk «Натискаючи, ти погоджуєшся на обробку даних — …»; the address form only, the
    meaning and the privacy link unchanged; en and pl untouched.
  - Q-10 (D87): `landing.footer.expanding` → EN "Warsaw only for now.", PL "Na razie tylko
    Warszawa.", RU «Пока только Варшава.», UK «Поки лише Варшава.» (D6).
  - Q-11 (D88): `landing.hero.trustLine` → EN "Figures are open — free, no account; the
    per-utility breakdown after you add yours"; PL, RU and UK in the same sense (agent drafts); the
    gate copy (D3) is unchanged.
  - Q-12 (D89): "Free, no account" joins `listings.roommateMetaDescription` (EN "… Free, no
    account."; the description stays under about 160 characters: shorten elsewhere, never into a
    claim) and `landing.cta.freeNote` (EN "Free, no account." instead of "No account needed."; PL
    "Bezpłatnie, bez konta.", RU «Бесплатно, без аккаунта.», UK «Безкоштовно, без акаунта.»).
    Nothing about future prices (D80).
  - The honesty test (the keys stay in `REWRITTEN_KEYS`) and key parity pass; the changed keys are
    listed for the owner.

## Events (PRD 4 values)

Existing names, new values (spec 01 §PRD 4 values): `telegram_bot_opened.source` ∈ `{checker,
empty, roommate, home, building, district, hub, calculator, guide, report}`; `cta_click.placement`
gains `flatmate_callout_<surface>`. The bot receives `mate_web_<surface>` and records
`tg_roommate_flow_started {entry_source: 'web', entry_detail: <surface>}` without a code change
(spec 04 §Start payloads). No new event; nothing stored. The attribution limit of §Flatmate callout
applies.
