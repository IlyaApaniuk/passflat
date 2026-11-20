# 09 · Search metadata, district pages, performance and accessibility (PRD 4, M3 – M4)

Requirements FR-21 – FR-35 of PRD 4 (`../product/prd/prd-4-site-improvements.md`). Honesty rules of
`CLAUDE.md` and spec 03 apply to every figure and every title: reported costs, group and N, no
"real", "market", percentage or rank. No URL changes, no table, no migration, no dependency
(**Decided**). Copy changes touch the four message files and are listed for the owner's review.

## Current state (2026-11-20)

- `src/i18n/honesty-copy.test.ts`: `REWRITTEN_KEYS` (33 keys), `FORBIDDEN` per locale (en
  `/verified|checked|actually|really|in full/i`; pl `/zweryfikow|sprawdzon|naprawdę|realn|faktycznie|w całości(?! lub)/i`;
  ru `/проверенн|на самом деле|реальн|по факту|полностью(?! или)/i`; uk
  `/перевірен|насправді|реальн|за фактом|повністю(?! або)/i`), an EN whole-file scan with
  `/verified|checked|actually|in full/i` (no `really`) and `ALLOWED_EN_MATCHES` (8 paths).
- Templated keys outside the test that still say "real": `costsSeo.buildingMetaTitle`,
  `buildingMetaDescription`, `districtMetaTitle`, `districtMetaDescription`, `cityMetaTitle`,
  `calculator.metaTitle`, `metaDescription`, `rentReport.metaTitle`, `metaDescription`, `ogTitle`,
  `lead`, `checkStep1`, `meta.homeTitle`, `homeDescription`, `aboutDescription`,
  `howItWorksDescription`, `blogDescription`, `landing.hero.costsCta`, `landing.footer.tagline`,
  `listings.demandCapture.costCtaTitle`, `about.values.principle1Desc`; templates insert
  `{district}` and `{city}` after "w" / "в" (`costsSeo.districtH1` "Wynajem w {district}",
  `buildingsHeading` "Budynki w {district}", `calculator.h1` "… w {city}").
- `src/lib/blog.ts`: a hand parser reads frontmatter `title, description, date, locale, slug, tags`
  from `src/content/blog/*.mdx` (13 slugs × 4 locales); no test reads the frontmatter. Deposit and
  protokół guides say "77 % … w całości / in full"; 39 pl/ru/uk files use the "real" family in
  frontmatter or body; every body ends on a `/check` link sentence with "realne liczby" and its
  translations. `blog/[slug]/client.tsx` `markdownToHtml` (128–180) renders `https?://` links with
  `target="_blank" rel="noopener"`.
- District page (`[city]/[district]/page.tsx`, server, `revalidate = 3600`): `getCity`,
  `getBuildingsData`, `loadDistrictFigures`; `h1` `costsSeo.districtH1`, `DistrictFigureCard`
  (local), buttons, `h2` `costsSeo.buildingsHeading`, buildings, `Footer`. District display name =
  `district.nameKey` (a plain display name such as "Mokotów", not a message key); the city name
  goes through `t(city.nameKey)`.
- `src/lib/roommate/counts.ts`: `countRoommates(viewer, others)` → `{ kind: 'districts', … }`
  with a viewer or `{ kind: 'top', total, top }` without one (`TOP_DISTRICTS_ON_WEBSITE = 5`);
  `loadRoommateCounts(viewer = null, now)`; `src/lib/roommate/website-counts.ts`
  `loadFlatmateBlockCounts()` caches `{ status: 'counts', total, top }` for 3600 s.
- `src/lib/roommate/room-costs.ts`: `loadRoomCostAreas(city, [slug])` → `[{ district, room, split }]`
  (spec 08 §Current state); `AreaReferenceGroups` (`src/components/buildings/figure-group-block.tsx`,
  client) renders an `AreaReference` with both groups and N.
- `src/app/sitemap.ts`: `/replacement` weekly 0.7, `/sublet` 0.5, `/roommate` 0.5; active listing
  details weekly 0.8 with `lastModified`; blog monthly 0.6 without `lastModified`; buildings weekly
  0.7 with the latest report date. `src/app/robots.ts`: `allow: '/'`, `disallow: ['/api/',
'/dashboard/', '/messages/', '/create-listing/', '/auth/']` (no locale prefixes, no `/admin/`).
  `src/lib/json-ld.tsx`: `webSiteJsonLd` SearchAction → `/warsaw/replacement?q=`;
  `organizationJsonLd` `sameAs` Instagram `passflat.com` (footer: `passflatapp`); `articleJsonLd`
  `image` defaults to `/icon.svg`, `url` is passed unprefixed by the callers; `breadcrumbJsonLd`
  uses `BASE_URL` paths and "Home"; `organizationJsonLd` rendered in the layout and again on
  `/about`. `/[city]/costs/submit` `generateMetadata` returns only `alternates`.
- `src/app/layout.tsx` icons: `/icon.svg` for both `icon` and `apple`; no `favicon.ico`, no
  `apple-icon`; `src/middleware.ts` matcher skips dotted paths, so `/favicon.ico` reaches
  `[locale]/layout.tsx` whose `generateMetadata` (34–54) calls `getTranslations('meta')` before the
  `hasLocale` guard (65–67) → HTTP 500. `next.config.mjs` has no `headers()` or `redirects()`;
  `src/app/api/og/route.tsx` (edge) returns `new ImageResponse(jsx, { width: 1200, height: 630 })`
  without headers.
- Roommate page reads `createClient().auth.getUser()` on the server for `isLoggedIn` →
  `useFavorites(isLoggedIn)` (`listings-page-client.tsx:109`). `Header` imports
  `@/lib/supabase/client` statically and calls `getUser()` in an effect on every page (55–76);
  `handleSignOut` uses the same client.
- `text-accent` as a text colour: `hero.tsx` 125, 188; `faq.tsx` 22; `check-address.tsx` 36;
  `cost-transparency-card.tsx` 135, 142, 156, 174; `tools.tsx` 68; `bento-grid.tsx` 120;
  `cost-transparency.tsx` 33; `city-notify.tsx` 56; the hero source line `text-[11px]
text-muted-foreground/80` (193). Controls under 44 px: the hamburger `w-8 h-8` with
  `aria-label="Toggle menu"` and no `aria-expanded`; the mobile pill `size="sm"`; the mobile
  language buttons; the cookie banner's two `size="sm"` buttons (155, 158); the costs list/map
  toggle (`costs/client.tsx` 490–500); the listings sort select and map toggle. Inputs without
  labels: `address-intake.tsx:65` (`Label` without `htmlFor`), `address-autocomplete.tsx:269` (no
  `id`), `city-notify.tsx:87-101`. The cookie banner's privacy link is `<a href="/privacy">`
  (150). Footer column titles are `h4`; building and checker pages go h1 → h3/h4. No skip link; no
  `main` in the layout (pages supply their own).
- e2e: `e2e/home.spec.ts` (two smoke tests), `e2e/og-image.spec.ts` (200, `image/png`, > 1000 B),
  `e2e/posthog-landing.spec.ts`, `e2e/remove-interest.spec.ts`; the server env has no bot username
  and **no database** (`playwright.config.ts`): every `/[city]/…` page returns 500 there, so only
  the home page, non-city pages, `/api/og` and static routes are e2e-testable. `npm run verify`
  does not run e2e: tasks that change those surfaces list `npm run test:e2e` too.
- Gap review (2026-11-20) facts: the `FORBIDDEN` regexes miss EN `real`, `market`, `truth`, PL
  `rzeczywist|prawdziw`, RU «настоящ», UK «справжн» and the "market" family in PL/RU/UK; keys
  outside `REWRITTEN_KEYS` with the "real" family also include `rentReport.anatomyTitle` (four
  locales), `rentReport.doplatyBody2`, `howItWorksPage.seekers.step1Desc`,
  `listings.detail.buildingCostHint`. Running the current regexes over the blog frontmatter flags 22
  files; over the body lines with a `/check`, `/costs` or `/building` link, 74 lines. Bodies also
  hold "verified listings" (`foreigners-guide-renting-warsaw-*`, line 10) and "actually pay a median
  of around 3 420 zł" (`renting-without-agent-warsaw-en.mdx:24`). `markdownToHtml` is a private
  function of the client file `blog/[slug]/client.tsx`.
- The district page is on-demand ISR (`revalidate = 3600`, no `generateStaticParams`): a page
  regenerates only after a request, so the first visitor after a quiet week sees a week-old
  render; `revalidateCostSurfaces` (`src/lib/revalidate-costs.ts`) runs only on cost reports. Its
  `getCity` selects no district `id`, which `loadRoomCostAreas` needs.

## Honesty keys under test

FR-21 (**Decided**: reported-costs wording, D25; **Assumption**: drafts; shipping the snippet
changes in one deploy).

Two tasks: (1) the shared rules and the cost-page keys, (2) the report and page keys.

- **Rules** (task 1): `src/i18n/honesty-rules.ts` (exported, no test code) holds `FORBIDDEN` per
  locale, which `honesty-copy.test.ts`, the frontmatter test and the bodies test import. The lists
  grow (never loosen; CLAUDE.md: never "market", "verified", invented statistics): en
  `/verified|checked|actually|really|in full|\breal\b|market|truth/i`; pl adds
  `rzeczywist|prawdziw|rynk`; ru adds `настоящ|рыночн`; uk adds `справжн|ринков`, keeping the
  existing alternatives and lookaheads. Every existing `REWRITTEN_KEYS` value that the wider lists
  flag is reworded or, when it is not a claim about figures (for example a "real amount"
  disclaimer that tells the reader to check the real bill), listed in an `ALLOWED_KEY_MATCHES` map
  with a one-line reason; the task lists them.
- **Task 1 keys**, rewritten in four locales and added to `REWRITTEN_KEYS`: `costsSeo.buildingMetaTitle`,
  `buildingMetaDescription` (table B: no report for this building yet, a district or Warsaw
  reference with its group and N), `districtMetaTitle`, `districtMetaDescription` (table C, the
  shorter variant that stops before "cena pokoju"; §District section switches it),
  `cityMetaTitle`, `calculator.metaTitle`, `calculator.metaDescription` (table G),
  `listings.demandCapture.costCtaTitle`, `listings.detail.buildingCostHint`.
- **Task 2 keys**: `rentReport.metaTitle`, `metaDescription`, `ogTitle`, `lead`, `checkStep1`,
  `anatomyTitle`, `doplatyBody2` (table F and its note), `meta.aboutDescription`,
  `meta.howItWorksDescription`, `meta.blogDescription`, `howItWorksPage.seekers.step1Desc`. The EN
  whole-file scan regex becomes `/verified|checked|actually|really|in full/i`; every new match that
  is not a claim about figures goes into `ALLOWED_EN_MATCHES` with a one-line reason comment.
- Not here: the home keys (`meta.homeTitle`, `homeDescription`, `landing.footer.tagline`,
  `landing.hero.costsCta`; spec 08 §Home copy), `about.values.principle1Desc` (spec 08 §How it
  works), the roommate page's keys (spec 08 §Roommate page shell), `costs.submit.meta*` (§Sitemap,
  robots, structured data: the keys are created and listed there, since a listed key must exist).

## Nominative-safe templates

FR-22 (**Assumption**: shapes). Polish and Russian need a case after "w / na / в / на"; the
district `nameKey` is a nominative display name, so templates keep the name in the nominative:

| Key                          | Shape (PL)                                   | EN / RU / UK analogues                                                                       |
| ---------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `costsSeo.districtH1`        | `{district}: koszty najmu`                   | `{district}: rent costs` / `{district}: расходы на аренду` / `{district}: витрати на оренду` |
| `costsSeo.buildingsHeading`  | `Budynki — {district}`                       | `Buildings — {district}` / `Дома — {district}` / `Будинки — {district}`                      |
| `costsSeo.districtMetaTitle` | `{district}, {city} — koszty najmu i pokoju` | table C                                                                                      |
| `calculator.metaTitle`, `h1` | `Kalkulator kosztów najmu w Warszawie: …`    | table G; "w Warszawie" is a literal until a second city exists (D6)                          |
| `listings.titleRoommate`     | `Szukam współlokatora w Warszawie: …`        | table A (spec 08)                                                                            |

A test (`src/i18n/nominative-templates.test.ts`) scans the pl and ru files for `\b(w|na|в|у|на)\s+\{(district|city)\}`
and fails on any match. A verb with an object case is the same trap ("wskazało {district}" needs
Wolę): the district count lines of §District section put the name first, before a colon.

A governing word is the same trap without a preposition (T158): "dla" and «по» before either
name, and a district noun before the city ("w dzielnicach {city}", «Все районы {city}»: the
districts _of_ the city need the genitive). A second scan in the same test catches "dla" / «по»
before either name, any form of "dzielnic-" / «район-» before `{city}` and their plurals before
`{district}`. A city noun in apposition keeps the name in the nominative ("w dzielnicach miasta
{city}", «по районам города {city}», «по районах міста {city}»); a singular district noun before
`{district}` is apposition too ("w dzielnicy {district}", «по району {district}»).

## Blog frontmatter

FR-23 (**Decided**: no invented statistics, D25; **Assumption**: drafts).

- `src/content/blog-frontmatter.test.ts` (new) is written first: for every
  `src/content/blog/*.mdx`, parse the frontmatter with the parser of `src/lib/blog.ts` (export it
  if it is private), take the locale from the file name, and fail when `title` or `description`
  matches `FORBIDDEN[locale]` (`src/i18n/honesty-rules.ts`) or `/\d+\s?%/`. An allow list exists
  but starts empty. **The test defines the set**: every frontmatter it flags is rewritten (the gap
  review counted 22 with the old lists), at least these: `rental-deposit-kaucja-warsaw-{en,pl,ru,uk}`
  (table I), `protokol-zdawczo-odbiorczy-warsaw-*` (lead with the checklist, no percentage),
  `hidden-rental-costs-warsaw` pl/ru/uk (table E), `renting-without-agent-warsaw` pl/ru/uk (table
  J; the PL description also says "zweryfikow…"), `rental-contract-checklist-warsaw` pl/ru/uk,
  `bank-account-rent-poland` en/pl/ru/uk, `move-out-cleaning-warsaw` en/ru.
- Table I's deposit descriptions end on "the Telegram bot that drafts the return letter". The
  deposit helper speaks Russian and Ukrainian only (D63) and the bot has no Polish (D50): the clause
  stays in **ru and uk** only; the en and pl descriptions drop it (they keep the rules, the deadline
  and the protocol).
- The changed titles and descriptions are listed in the progress entry for the owner (D29).
- Bodies are §Guide bodies.

## Guide bodies

FR-24 (**Decided**: honesty wording; **Assumption**: mechanical replacement, link rendering).

Three tasks: (1) the link lines, (2) the claims in the rest of the bodies, (3) the renderer.

- **Link lines** (task 1). `src/content/blog-bodies.test.ts` (new) is written first: for every
  file, every line that contains a link to `/check`, `/costs` or `/building` must not match
  `FORBIDDEN[locale]` unless the line is in an allow list with a one-line reason (for example a
  deposit that "came back in full" as a statement about one case, not about figures). Every flagged
  line (74 with the old lists) is reworded with the smallest change in the meaning of "reported" /
  "from reports", by inflection: pl "realne liczby / koszty" → "liczby ze zgłoszeń / zgłoszone
  koszty", "realnymi liczbami" → "liczbami ze zgłoszeń", "realny koszt" → "koszt ze zgłoszeń",
  "realną cenę" → "cenę ze zgłoszeń"; ru «реальные цифры / расходы» → «цифры из отчётов / расходы по
  отчётам», «реальными цифрами» → «цифрами из отчётов», «реальную стоимость» → «стоимость по
  отчётам»; uk «реальні цифри / витрати» → «цифри зі звітів / витрати за звітами», «реальними
  цифрами» → «цифрами зі звітів», «реальну вартість» → «вартість за звітами»; en "real numbers /
  real costs" → "figures from reports / reported costs", "actually pay" → "report paying". Other
  forms follow the same meaning. The progress entry lists every changed line (a one-off node script
  may do the replacement; it is not committed).
- **Claims** (task 2): every body line (not only link lines) is scanned for the verification
  family (`verified|checked by|zweryfikow|sprawdzon|проверенн|перевірен`) and for a figure stated
  as Passflat data (a number with "%" or "zł" next to "median", "mediana", "медиана", "медіана",
  "average", "średni", "средн", "середн"). "Verified listings" becomes "listings" with no quality
  claim; a hard-coded statistic is removed or replaced by a link to the data report
  (`/blog/warsaw-rent-prices`) without a number (CLAUDE.md: never invent statistics; a number in a
  guide is not the figure contract). Legal facts with numbers (deadlines, statutory amounts,
  interest) are not touched. `blog-bodies.test.ts` gains the verification-family scan over all
  lines with its own allow list. The changed lines are listed for the owner (D29).
- **Renderer** (task 3): `markdownToHtml` moves from `blog/[slug]/client.tsx` to a pure module
  (`src/lib/blog-markdown.ts`) the client imports; a link whose href starts with
  `https://passflat.com/` is rendered with the path part as href (`/en/warsaw/check`), no `target`,
  no `rel`; other absolute links keep `target="_blank" rel="noopener"`; the affiliate rule is
  unchanged. Unit test with four hrefs.
- The cesja guide's `/replacement` links stay (D84: the guide stays at its URL).

## Low-CTR titles

FR-25 (**Assumption**: drafts). Rewrite frontmatter `title` and `description` in four locales of
`przepisanie-licznikow-najem` (table D), `hidden-rental-costs-warsaw` (table E), `cesja-najmu-guide`
(table H: the description drops the tenant-replacement promise), `renting-without-agent-warsaw` and
`najem-okazjonalny-vs-standard-warsaw` (table J). `src/content/blog-frontmatter.test.ts` also asserts
for these five slugs: `title.length ≤ 65` and `description.length ≤ 160` per locale. The deposit
guide is §Blog frontmatter; the data report and calculator keys are §Honesty keys under test.

The cesja guide stays at its URL (Q-7 (a), D84, answered 2026-11-20): no file is removed and no
redirect is added; T145's table H description (without the tenant-replacement promise) is the whole
change, and T146 closes with the answer in its progress entry.

## District section

FR-26 (**Decided**: D49, D51, D68; **Assumption**: the website count shape and the section), FR-27
(**Decided**: D23, D61, D71, PRD 3 FR-17).

- `countRoommates(viewer, others)`: when `viewer === null` the `kind: 'top'` result also carries
  `byDistrict: Record<string, number>` with every district slug named by at least one counted
  profile (same counting: active, not blocked, not banned, "any" profiles never added, no viewer).
  `loadFlatmateBlockCounts()` carries `byDistrict` in the cached result; the cache key becomes
  `roommate-website-counts-v2` (shape change, spec 03 §Loaders rule). `FlatmateBlockCounts`'s
  `counts` variant gains `byDistrict`. Golden test: PRD 4 §5 example 4 → `total 5`, `byDistrict
{ mokotow: 2, ochota: 2, wola: 1 }`; the top-5 list unchanged.
- **Freshness** (FR-26 task): the counts cache gets the tag `roommate-counts`; a never-throwing
  `revalidateRoommateCounts()` in `src/lib/roommate/website-counts.ts` calls
  `revalidateTag('roommate-counts', { expire: 0 })` (the Next 16 form `revalidate-costs.ts` uses),
  which also drops the ISR renders of the pages that read it (district, hub, home). It is called
  after every write that changes who is counted: a profile saved or edited, deleted, hidden or
  restored by moderation, and the daily cron's expiry and deletion (the task greps the write sites
  in `src/lib/roommate/` and `src/lib/bot/` and lists them). Outside a Next request (`bot:dev`) it
  catches the error and does nothing. A unit test with a mocked `next/cache` asserts the call and
  that a throw is swallowed. No count line says how fresh it is.
- District page: after the buttons row and before `costsSeo.buildingsHeading`, a
  `<section aria-labelledby>` with:
  1. `h2` `costsSeo.districtRoommateHeading` ("Room and shared renting: {district}", nominative-safe);
  2. the count line, the district name first so no case is needed: `costsSeo.districtProfileCount`
     "{district}: {n, plural, one {# person with a profile names this district} other {# people
     with a profile name this district}}" (PL `one/few/many/other`, RU and UK `one/few/many/other`
     with full forms, the agent's drafts) when `byDistrict[slug] > 0`;
     `costsSeo.districtProfileNone` "{district}: nobody has named this district yet — be the
     first." at 0 or when the slug is absent; no line when counts are `unavailable`;
  3. the room reference: `loadRoomCostAreas(city, [district])[0]` → when `room` is set, a lead-in
     `costsSeo.districtRoomLead` and, when `room.level === 'city'`, the level line
     `costsSeo.districtRoomCityFallback` ("{district} has fewer than 5 room reports; Warsaw:"), then
     `<AreaReferenceGroups reference={room} area={areaName} oneObservationLabel={…} />` (the room
     money block's component, both groups with N); no `room` → nothing;
  4. `<FlatmateCallout surface="district" counts={counts} split={split} splitArea={…} />` (spec 08):
     the callout renders the per-person line (once per page) with the split's **own** area name:
     the district when `split.level === 'district'`, Warsaw when the split fell back to the city
     (the server resolves both names).
- The page's `getCity` (or a second query) selects the city's districts with `id`, `slug` and
  `nameKey`, the shape `loadRoomCostAreas` needs.
- Loads are added to the page's `Promise.all` and wrapped so a rejection renders the section without
  that part (counts → no count line; room costs → no figure lines and no split). The page stays ISR
  (`revalidate = 3600`).
- No percentage, rank, "cheapest", "verified" or blended number; every figure comes from the
  contract with its group and N.
- Golden tests: PRD 4 §5 example 5 (spec 06's Mokotów case) through a render-props helper
  `districtRoommateSection({ slug, counts, area })` → the count line state, the room lines'
  presence and level line, the split values `{ value: 2450, count: 5, area: 'Mokotów' }`; the
  Wesoła case → the city fallback line; a district whose 2-room flats are too few → the split named
  Warsaw. A consistency test feeds the same fixture to `roomCostsReply` for a profile naming Mokotów
  and compares median and N per group and the split.
- Data report: the callout with the Warsaw split is spec 08 §Callout placements (`report`); it is
  not rendered a second time here.
- `costsSeo.districtMetaDescription` switches to the full table C variant in this task.
- New keys (four locales, PRD 4 §8): `costsSeo.districtRoommateHeading`, `districtProfileCount`,
  `districtProfileNone`, `districtRoomLead`, `districtRoomCityFallback`.

## Sitemap, robots, structured data and the submit page's metadata

FR-28 (**Assumption**); FR-29 **Decided** (D78, Q-1 (a); task T150); the Instagram handle
**Decided** (D85, Q-8: `passflatapp`; task T151: `organizationJsonLd().sameAs` →
`https://instagram.com/passflatapp`, the footer's URL in `footer.tsx`, one line and a unit test that
asserts the schema's Instagram URL equals the footer's). The
structured-data part below is **Later** (PRD 4 §Later: 14 `breadcrumbJsonLd` callers make it its own
piece of work); this PRD builds the sitemap, robots and the submit page's metadata in one task.

- Sitemap: `/${city}/roommate` → `('weekly', 0.8)`; `/replacement` and `/sublet` → `0.4`; blog
  entries get `lastModified: new Date(post.date)`; the listing-detail loop stayed until D78 (T150
  removes it). Test with
  mocked Prisma and `getAllPosts`: the three priorities and the blog `lastModified`.
- **Later**, kept as the design for the next PRD: `src/lib/json-ld.tsx`: `webSiteJsonLd()` without
  `potentialAction`; `articleJsonLd` keeps its
  signature; callers (`blog/[slug]/page.tsx`, `blog/warsaw-rent-prices/page.tsx`) pass
  `url: getAlternates(path, locale).canonical`, `image: getOgImage(title, description).url` and,
  for the report, `dateModified: updatedIso`. `breadcrumbJsonLd(items, locale)` gains a `locale`
  argument: item URLs are `getAlternates(item.path, locale).canonical` and the home item's name is
  `t('breadcrumbs.home')`; callers pass translated names (the blog's "Blog" from
  `breadcrumbs.blog`; the task checks the `breadcrumbs` namespace's keys and adds `home` / `blog` in
  four locales if missing; the builder is synchronous, so callers pass the translated home name).
  `/about` stops rendering a second `organizationJsonLd()`. Tests: the builders' URLs for `pl` and
  `ru`, no `potentialAction`, the article image URL.
- `src/app/robots.ts`: `allow: ['/', '/api/og']`; `disallow` = for each of `/api/`, `/dashboard/`,
  `/messages/`, `/create-listing/`, `/auth/`, `/admin/`: the bare path and `/en`, `/ru`, `/uk`
  prefixed variants (24 entries, built by one helper). `isIndexable === false` → disallow all, as
  today. Test over the output.
- `/[city]/costs/submit` `generateMetadata` returns `title: t('costs.submit.metaTitle')`,
  `description: t('costs.submit.metaDescription')` (new keys created here in four locales, PRD 4
  §8, and added to `REWRITTEN_KEYS` in the same task) and the existing `alternates`.
- **FR-29** (**Decided**, D78; task T150): `/[city]/replacement`, `/[city]/sublet` and the
  listing-detail loop leave `src/app/sitemap.ts`; the two list pages' `generateMetadata` returns
  `robots: { index: false, follow: true }` (as `/costs/share` does today) with their alternates
  unchanged; `/[city]/roommate` keeps `('weekly', 0.8)`. The sitemap test asserts the three are
  absent and the roommate entry present; a unit test or a static read asserts the robots value of
  both pages. No URL is removed or redirected; an active listing detail stays reachable by URL and
  keeps its own metadata (non-active details are `noindex` already).

## Icons and the locale guard

FR-30 (**Assumption**: mechanism; no image dependency).

- First reproduce: the 500 of `/favicon.ico` is the audit's reading of the live site; the task
  confirms it on the branch with a temporary e2e probe (`ralph/progress.md` Learnings), then
  deletes the probe.
- `src/app/[locale]/layout.tsx` `generateMetadata`: `const { locale } = await params; if
(!hasLocale(routing.locales, locale)) notFound();` before `getTranslations`.
- **No redirect** (a redirect is a URL change, which PRD 4 leaves to the owner): the two paths are
  served where browsers ask for them, by static route handlers that win over the dynamic
  `[locale]` segment. `src/lib/brand-mark.tsx` exports the brand mark as JSX for `next/og` (the
  rounded-square gradient of `public/icon.svg`, the same colours; no new dependency).
  `src/app/favicon.ico/route.tsx` returns `new ImageResponse(<BrandMark />, { width: 48, height:
48 })` (a PNG; browsers accept a PNG body at `/favicon.ico`) and `src/app/apple-touch-icon.png/route.tsx`
  returns the same mark at 180 × 180; both set `Cache-Control: public, max-age=86400,
s-maxage=604800`. `metadata.icons` in `src/app/layout.tsx` keeps `icon: '/icon.svg'` and sets
  `apple: '/apple-touch-icon.png'`. `/apple-touch-icon-precomposed.png` is not served (it falls
  to the guard's 404).
- e2e (`e2e/icons.spec.ts`, new): `GET /favicon.ico` → 200 `image/png`; `GET /apple-touch-icon.png`
  → 200 `image/png`; `GET /nonexistent.ext` → 404 (the guard). An unknown path without a dot
  (`/xx-unknown`) reaches the `[city]` segment, which returns 500 in the e2e build because it has
  no database (`ralph/progress.md` Learnings): it is not asserted in e2e.
- Built (T152): the guard alone did not answer `/nonexistent.ext` (on `next start` the request
  hung: the on-demand render of the static `/[locale]` home still read next-intl's request
  header). `src/app/[locale]/page.tsx` also exports `dynamicParams = false`, so a locale outside
  `generateStaticParams` gets the router's 404 without a render. The guard stays for deeper routes.

## HTTP headers

FR-31 (**Assumption**: values). The framing header is **Decided** (D90, Q-13 (b); task T154).

- `src/app/api/og/route.tsx`: `new ImageResponse(jsx, { width, height, headers: { 'Cache-Control':
'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' } })`; error paths unchanged
  (no cache header on 4xx/5xx). `e2e/og-image.spec.ts` asserts the header.
- `next.config.mjs` `headers()`: `source: '/(.*)'` with `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(),
microphone=(), geolocation=()` (the site uses none of the three, checked 2026-11-20).
  `e2e/home.spec.ts` asserts the three on `/`.
- **Framing header** (D90, Q-13 (b); task T154): the same `headers()` entry (`source: '/(.*)'`)
  adds `Content-Security-Policy: frame-ancestors 'self' https://eu.posthog.com`, the only directive
  (a full policy stays Later, PRD 4 §Later S-28); no `X-Frame-Options`, which would also block
  PostHog's in-app heatmap and toolbar views that load the site in a frame from the EU app host
  (not verified on the branch: if the toolbar is blocked after the deploy, the host list here is the
  place to change). `e2e/home.spec.ts` asserts the header's exact value on `/` next to the three
  headers of T153.

## Roommate page server work

FR-32 (**Assumption**), after §Header client bundle. **Later** (PRD 4 §Later): no task in this
PRD. The gap review added what the design below misses: `ListingsEmptyState` also takes
`isLoggedIn` (`listings-page-client.tsx` 402, 415) to switch the e-mail form to the one-tap save, so
the client passes `user` and `loading` and renders the card only after `loading` resolves; all
three listing pages pass the prop.

- `roommate/page.tsx` drops the `@/lib/supabase/server` import and `auth.getUser()`; `isLoggedIn`
  leaves `ListingsPageClient`'s props; `ListingsPageClient` calls `useClientAuthState()` and passes
  `Boolean(user)` to `useFavorites`. `/replacement` and `/sublet` pages drop the same prop if they
  pass it (the task greps). Test: a static read of `roommate/page.tsx` asserts no `supabase` import.

## Header client bundle

FR-33 (**Assumption**: the signal and the lazy import). **Later** (PRD 4 §Later): no task in this
PRD. The gap review added: `Header` also calls `useUnreadCount`, which imports the client
statically (`src/hooks/use-unread-count.ts:4`), so that hook needs the same lazy import or the
chunk stays; and password login is a server action with a soft redirect
(`src/app/[locale]/auth/actions.ts` 54–79) while the header lives in the layout, so without a
client and a listener the header keeps "Log in" until a reload: the hook re-checks the signal on
every pathname change.

- `src/lib/supabase/use-client-auth-state.ts`: `useClientAuthState({ initialUser? })` → `{ user,
loading }`. On mount: `hasLocalSession()` (pure, tested: any cookie `sb-*-auth-token*` or a
  localStorage key matching `/^sb-.*-auth-token$/`; both wrapped in try/catch) → if false, `{ user:
null, loading: false }` at once; if true, `const { createClient } = await import('@/lib/supabase/client')`,
  then `getUser()` and `onAuthStateChange` as the header does today. `initialUser` short-circuits
  as today's `serverResolved`.
- `Header` uses the hook; `handleSignOut` does `const { createClient } = await import(...)` before
  `signOut({ scope: 'local' })`. Behaviour for a signed-in visitor is unchanged.
- The progress entry records the home route's initial script list before and after (`.next`
  build output: the `@supabase` chunk absent from `/` and a blog page).

## Contrast, tap targets and the hamburger

FR-34 (**Assumption**: classes).

- Replace `text-accent` used as a text colour: figure values → `text-foreground`; badge chips and
  link texts → `text-primary`; icons keep `text-accent`. Files and lines: spec Current state. The
  hero source line → `text-xs text-muted-foreground`.
- `min-h-11` (plus `min-w-11` on square controls) on: the hamburger (`w-8 h-8` → `min-h-11 min-w-11`),
  the mobile pill (`size="sm"` → `className="min-h-11 …"`), the mobile language buttons, the cookie
  banner's two buttons, the costs list/map toggle, the listings sort `SelectTrigger` and the map
  toggle button.
- Hamburger: `type="button"`, `aria-label={t('common.menu')}`, `aria-expanded={mobileMenuOpen}`,
  `aria-controls="mobile-menu"`; the mobile panel gets `id="mobile-menu"`. New key `common.menu`.
- Test (`src/components/landing/accent-text.test.ts`, static): the listed files contain
  `text-accent` only on lines that also contain `<svg`, `Icon`, `className="h-4 w-4` or are in an
  allow list of icon lines the task names; a static test asserts the header's aria attributes.
- Built (T155): badge chips' inherited icons follow the chip to `text-primary`; the cost card's
  "already contributed" line counts as a badge (`text-primary`). The mobile pill keeps
  `size="sm"` (its width) plus `min-h-11`. The header bar is `py-1.5 lg:py-3`, so the 44 px
  controls keep the mobile bar at 58 px and the header at 90 px (measured 320 – 1023 px). The data
  report's deposit figure (`blog/warsaw-rent-prices/page.tsx`) is outside this list: task T159.
- Built (T159): that deposit figure is `text-foreground` on the unchanged `border-accent/30
bg-accent/5` card, and `accent-text.test.ts` scans the page with the same rule. The access
  card's `bg-accent/10 text-accent` is a 28 px icon circle and keeps the accent.

## Labels, the banner's privacy link, heading order and a skip link

FR-35 (**Assumption**). **Later** (PRD 4 §Later, rank 3 in the audit): no task in this PRD; when it
is taken up, split it into (1) labels and the banner link, (2) headings and the skip link.

- `AddressAutocomplete` accepts `id?: string` and puts it on the `Input`; `AddressIntake` creates
  `useId()` and passes it with `<Label htmlFor={id}>`. `city-notify.tsx` inputs get
  `aria-label={t('emailPlaceholder')}` and `aria-label={t('cityPlaceholder')}`.
- Cookie banner: `href={locale === 'pl' ? '/privacy' : `/${locale}/privacy`}` with the already
  detected `locale`.
- Footer column titles `h4` → `h2` with the same classes; the building client's first `h3` card
  title after the `h1` and the checker's first heading after its `h1` become `h2` (the task lists
  the lines).
- `src/app/[locale]/layout.tsx`: `<a href="#main" className="sr-only focus:not-sr-only focus:fixed
focus:left-4 focus:top-4 focus:z-[60] …">{t('common.skipToContent')}</a>` as the first child of
  `body`; every `<main>` under `src/app/[locale]` gets `id="main"` (the task greps `<main` and lists
  the pages). New key `common.skipToContent`.
- Tests: pure props for the label pairing (id present on both), the banner href per locale, a
  static scan that every `<main` under `src/app/[locale]` and `src/components` carries `id="main"`.
