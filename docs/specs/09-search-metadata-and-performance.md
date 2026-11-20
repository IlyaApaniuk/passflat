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
  `e2e/posthog-landing.spec.ts`, `e2e/remove-interest.spec.ts`; the server env has no bot username.

## Honesty keys under test

FR-21 (**Decided**: reported-costs wording, D25; **Assumption**: drafts; shipping the snippet
changes in one deploy).

- Add to `REWRITTEN_KEYS`: every key listed under Current state plus `listings.titleRoommate`,
  `listings.roommateH1`, `listings.roommateMetaDescription` (spec 08), `costs.submit.metaTitle`,
  `costs.submit.metaDescription` (§Sitemap, robots, structured data). Rewrite them in four locales
  from appendix seo.md tables B, C, F, G, K and PRD 4 §8 (`landing.hero.costsCta`,
  `listings.demandCapture.costCtaTitle`, `about.values.principle1Desc`, `landing.footer.tagline`).
  `costsSeo.districtMetaDescription` uses the shorter variant of table C (stop before "cena
  pokoju") until §District section ships, which switches it.
- The EN whole-file scan regex becomes `/verified|checked|actually|really|in full/i`; every new
  match that is not a claim about figures goes into `ALLOWED_EN_MATCHES` with a one-line reason
  comment; the task lists them in the progress entry.
- Table B's no-figure building description says there is no report for this building and that a
  district or Warsaw reference with its group and N is shown.
- The `FORBIDDEN` regexes move to `src/i18n/honesty-rules.ts` (exported, no test code) so the
  frontmatter test (§Blog frontmatter) imports the same list; `honesty-copy.test.ts` imports it.

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
and fails on any match.

## Blog frontmatter

FR-23 (**Decided**: no invented statistics, D25; **Assumption**: drafts).

- Rewrite the frontmatter `title` and `description` of `rental-deposit-kaucja-warsaw-{en,pl,ru,uk}`
  (table I) and `protokol-zdawczo-odbiorczy-warsaw-*` (lead with the checklist, no percentage), and
  the "real / actually" frontmatters: `hidden-rental-costs-warsaw` pl/ru/uk (table E),
  `renting-without-agent-warsaw` pl/ru/uk (table J), `rental-contract-checklist-warsaw` pl/ru/uk,
  `bank-account-rent-poland-en` ("Who Wise actually works for" → "Who Wise works for"),
  `move-out-cleaning-warsaw-en` ("What Landlords Actually Check" → "What landlords check").
- `src/content/blog-frontmatter.test.ts` (new): for every `src/content/blog/*.mdx`, parse the
  frontmatter with the parser of `src/lib/blog.ts` (export it if it is private), take the locale
  from the file name, and fail when `title` or `description` matches `FORBIDDEN[locale]`
  (`src/i18n/honesty-rules.ts`) or `/\d+\s?%/`. An allow list exists but starts empty.
- Bodies are §Guide bodies.

## Guide bodies

FR-24 (**Decided**: honesty wording; **Assumption**: mechanical replacement, link rendering).

- In every guide body replace the closing-sentence phrases: pl "realne liczby" → "liczby ze
  zgłoszeń", "realne koszty" → "zgłoszone koszty", "realnymi liczbami" → "liczbami ze zgłoszeń";
  ru «реальные цифры / расходы» → «цифры из отчётов / расходы по отчётам», «реальными цифрами» →
  «цифрами из отчётов»; uk «реальні цифри / витрати» → «цифри зі звітів / витрати за звітами»,
  «реальними цифрами» → «цифрами зі звітів»; en "real numbers / real costs" → "figures from
  reports / reported costs". Nothing else in the bodies changes; the task lists every changed line.
- `src/content/blog-bodies.test.ts` (new): for every file, every line that contains a link to
  `/check`, `/costs` or `/building` must not match `FORBIDDEN[locale]`.
- `markdownToHtml`: a link whose href starts with `https://passflat.com/` is rendered with the
  path part as href (`/en/warsaw/check`), no `target`, no `rel`; other absolute links keep
  `target="_blank" rel="noopener"`; the affiliate rule is unchanged. Unit test with four hrefs.
- The cesja guide's `/replacement` links stay (Q-7).

## Low-CTR titles

FR-25 (**Assumption**: drafts). Rewrite frontmatter `title` and `description` in four locales of
`przepisanie-licznikow-najem` (table D), `hidden-rental-costs-warsaw` (table E), `cesja-najmu-guide`
(table H: the description drops the tenant-replacement promise), `renting-without-agent-warsaw` and
`najem-okazjonalny-vs-standard-warsaw` (table J). `src/content/blog-frontmatter.test.ts` also asserts
for these five slugs: `title.length ≤ 65` and `description.length ≤ 160` per locale. The deposit
guide is §Blog frontmatter; the data report and calculator keys are §Honesty keys under test.

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
- District page: after the buttons row and before `costsSeo.buildingsHeading`, a
  `<section aria-labelledby>` with:
  1. `h2` `costsSeo.districtRoommateHeading` ("Room and shared renting: {district}", nominative-safe);
  2. the count line: `costsSeo.districtProfileCount` with `{n}` (ICU plural) when
     `byDistrict[slug] > 0`, `costsSeo.districtProfileNone` at 0 or when the slug is absent; no line
     when counts are `unavailable`;
  3. the room reference: `loadRoomCostAreas(city, [district])[0]` → when `room` is set, a lead-in
     `costsSeo.districtRoomLead` and, when `room.level === 'city'`, the level line
     `costsSeo.districtRoomCityFallback` ("{district} has fewer than 5 room reports; Warsaw:"), then
     `<AreaReferenceGroups reference={room} area={areaName} oneObservationLabel={…} />` (the room
     money block's component, both groups with N); no `room` → nothing;
  4. the per-person line from `split` through spec 08 §Per-person line's helper with the area name
     (`split.name` for a district, `t(city.nameKey)` for the city); `null` → nothing;
  5. `<FlatmateCallout surface="district" counts={counts} split={split} />` (spec 08).
- Loads are added to the page's `Promise.all` and wrapped so a rejection renders the section without
  that part (counts → no count line; room costs → no figure lines). The page stays ISR
  (`revalidate = 3600`).
- No percentage, rank, "cheapest", "verified" or blended number; every figure comes from the
  contract with its group and N.
- Golden tests: PRD 4 §5 example 5 (spec 06's Mokotów case) through a render-props helper
  `districtRoommateSection({ slug, counts, area, t })` → the count line state, the room lines'
  presence and level line, the split values `{ n: 5, half: 2450, area: 'Mokotów' }`; the Wesoła
  case → the city fallback line. A consistency test feeds the same fixture to `roomCostsReply` for a
  profile naming Mokotów and compares median and N per group and the split.
- Data report (`blog/warsaw-rent-prices/page.tsx`): under the city figure, the Warsaw per-person
  line from `loadWarsawPerPersonSplit()` (spec 08), then `<FlatmateCallout surface="guide" split={…} />`.
- `costsSeo.districtMetaDescription` switches to the full table C variant in this task.
- New keys (four locales, PRD 4 §8): `costsSeo.districtRoommateHeading`, `districtProfileCount`,
  `districtProfileNone`, `districtRoomLead`, `districtRoomCityFallback`.

## Sitemap, robots, structured data and the submit page's metadata

FR-28 (**Assumption**); FR-29 **Open** (Q-1); the Instagram handle Q-8.

- Sitemap: `/${city}/roommate` → `('weekly', 0.8)`; `/replacement` and `/sublet` → `0.4`; blog
  entries get `lastModified: new Date(post.date)`; the listing-detail loop stays (Q-1). Test with
  mocked Prisma and `getAllPosts`: the three priorities and the blog `lastModified`.
- `src/lib/json-ld.tsx`: `webSiteJsonLd()` without `potentialAction`; `articleJsonLd` keeps its
  signature; callers (`blog/[slug]/page.tsx`, `blog/warsaw-rent-prices/page.tsx`) pass
  `url: getAlternates(path, locale).canonical`, `image: getOgImage(title, description).url` and,
  for the report, `dateModified: updatedIso`. `breadcrumbJsonLd(items, locale)` gains a `locale`
  argument: item URLs are `getAlternates(item.path, locale).canonical` and the home item's name is
  `t('breadcrumbs.home')`; callers pass translated names (the blog's "Blog" from
  `breadcrumbs.blog`; the task checks the `breadcrumbs` namespace's keys and adds `home` / `blog` in
  four locales if missing). `/about` stops rendering a second `organizationJsonLd()`.
  `organizationJsonLd().sameAs` is unchanged (Q-8; listed for the owner). Tests: the builders'
  URLs for `pl` and `ru`, no `potentialAction`, the article image URL.
- `src/app/robots.ts`: `allow: ['/', '/api/og']`; `disallow` = for each of `/api/`, `/dashboard/`,
  `/messages/`, `/create-listing/`, `/auth/`, `/admin/`: the bare path and `/en`, `/ru`, `/uk`
  prefixed variants (24 entries, built by one helper). `isIndexable === false` → disallow all, as
  today. Test over the output.
- `/[city]/costs/submit` `generateMetadata` returns `title: t('costs.submit.metaTitle')`,
  `description: t('costs.submit.metaDescription')` (new keys, PRD 4 §8, in `REWRITTEN_KEYS`) and the
  existing `alternates`.
- FR-29 (blocked task): when the owner answers (a), drop `/replacement`, `/sublet` and the
  listing-detail loop from the sitemap and set `robots: { index: false, follow: true }` in the two
  list pages' metadata; the sitemap test asserts their absence.

## Icons and the locale guard

FR-30 (**Assumption**: mechanism; no image dependency).

- `src/app/[locale]/layout.tsx` `generateMetadata`: `const { locale } = await params; if
(!hasLocale(routing.locales, locale)) notFound();` before `getTranslations`.
- `next.config.mjs` `redirects()`: `/favicon.ico` → `/icon.svg` (permanent), `/apple-touch-icon.png`
  → `/apple-icon` (permanent), `/apple-touch-icon-precomposed.png` → `/apple-icon` (permanent).
- `src/app/apple-icon.tsx`: `export const size = { width: 180, height: 180 }; export const
contentType = 'image/png'; export default function Icon() { return new ImageResponse(<div …/>,
size) }` drawing the brand mark (the rounded-square gradient of `public/icon.svg`, the same
  colours) in JSX; Next generates `<link rel="apple-touch-icon">` from it. `metadata.icons.apple` in
  `src/app/layout.tsx` is removed so the generated one applies; `icon` stays `/icon.svg`.
- e2e (`e2e/icons.spec.ts`, new): `GET /favicon.ico` follows to a status < 400; `GET
/apple-touch-icon.png` follows to 200 `image/png`; `GET /apple-icon` → 200 `image/png`; `GET
/xx-unknown` → 404; `GET /nonexistent.ext` → 404.

## HTTP headers

FR-31 (**Assumption**: values; no CSP).

- `src/app/api/og/route.tsx`: `new ImageResponse(jsx, { width, height, headers: { 'Cache-Control':
'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' } })`; error paths unchanged
  (no cache header on 4xx/5xx). `e2e/og-image.spec.ts` asserts the header.
- `next.config.mjs` `headers()`: `source: '/(.*)'` with `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`. `e2e/home.spec.ts` asserts the
  four on `/`.

## Roommate page server work

FR-32 (**Assumption**), after §Header client bundle.

- `roommate/page.tsx` drops the `@/lib/supabase/server` import and `auth.getUser()`; `isLoggedIn`
  leaves `ListingsPageClient`'s props; `ListingsPageClient` calls `useClientAuthState()` and passes
  `Boolean(user)` to `useFavorites`. `/replacement` and `/sublet` pages drop the same prop if they
  pass it (the task greps). Test: a static read of `roommate/page.tsx` asserts no `supabase` import.

## Header client bundle

FR-33 (**Assumption**: the signal and the lazy import).

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

## Labels, the banner's privacy link, heading order and a skip link

FR-35 (**Assumption**).

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
