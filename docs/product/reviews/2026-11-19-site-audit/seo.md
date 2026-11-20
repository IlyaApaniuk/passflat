# Search (SEO) and content — audit section

Auditor: agent, 2026-11-19. Branch `chore/agent-harness` read as the future site ("code"); live
checks are read-only GETs of https://passflat.com ("live": HTML head, HTTP headers, sitemap.xml,
robots.txt). Branch key values come from `src/i18n/messages/{pl,en,ru,uk}.json`; blog values from
`src/content/blog/*.mdx` frontmatter (all 52 files read). Every title/description draft below is
an **agent draft for the owner's review**. Lengths exclude the layout's " — Passflat" suffix
(`[locale]/layout.tsx:39`, +11 chars).

## Verdict

The technical base is sound: per-locale canonical, hreflang pl/en/ru/uk + x-default in the HTML,
the HTTP `Link` header and the sitemap; `Place` + `BreadcrumbList` on buildings; `Article`,
`Dataset` and `FAQPage` on the data report; ISR on the cost pages. What does not match the thesis
is what Google reads: `/warsaw/roommate`, the one page already ranking for the thesis query
cluster, is titled and described as a listings board ("Ogłoszenia współlokatorów … pokoje … bez
pośredników" on the branch too), has no H1, and its bot entry block renders only after a client
click, so neither Google nor a non-clicking visitor sees "find someone to rent with", the
per-person budget or the bot. The honesty test guards 33 keys; the templated titles of buildings,
districts, the city hub, the calculator, the data report and the home page are outside it and
still say "realne koszty" / "real rental costs" / "ile naprawdę kosztuje" / "реальные расходы" on
the branch; blog frontmatter is outside every test and two guides hard-code "77 % … w całości".
The sitemap ranks the frozen `/warsaw/replacement` (0.7) above the roommate page (0.5); the
`WebSite` SearchAction points at `/warsaw/replacement`; no building, district or guide links to
the roommate page or the bot except through the footer. Highest value for least work: rewrite
the roommate metadata, add an H1 and server-render the bot block (SE-1, SE-2); bring the other
templated keys and the blog frontmatter under the honesty test (SE-3, SE-4); one shared "find a
flatmate / per person" callout on buildings, districts and guides (SE-8); extend the existing
district pages with the room figure, the D71 per-person line and the honest profile counts
instead of new URLs (SE-9).

## Findings

### SE-1 — The roommate page is described as a listings board and has no H1

- **What:** Title/description promise room listings without agents; the page shows "Brak
  ogłoszeń" (0 offers) and, on the branch, the bot matching entry and the room money reference.
  No `<h1>` on the page.
- **Where (code):** `src/app/[locale]/[city]/roommate/page.tsx:33-36`; `listings.titleRoommate`
  = "Szukam współlokatora" / "Roommate Search" / «Поиск соседа» / «Пошук співмешканця»;
  `listings.roommateMetaDescription` (en.json:383) = "Flatmate listings in {city} — rooms in
  shared flats, no agents. Before you move in, check the costs reported for the building…" (PRD 1
  only replaced "realne" with "zgłoszone"). `listings-page-client.tsx` renders no h1; the blocks
  use h2 (`find-flatmate-block.tsx:38`, `room-money-block.tsx:66`).
- **Evidence (live):** `<title>Szukam współlokatora — Warszawa — Passflat</title>`, no `<h1`;
  GSC 25 clicks / 1,409 impressions / position 8.8; `/en/warsaw/roommate` position 42; 41
  landings, 0 useful actions.
- **Why it matters:** The thesis entry for Polish Google searchers; the snippet selects people
  who want an offer list and lands them on an empty one.
- **Proposed change:** (1) Four-locale rewrite (table A); the PL text names the bot's languages
  (D50). (2) A server-rendered `<h1>` in the header stack: PL "Szukam współlokatora w
  Warszawie", EN "Find a flatmate in Warsaw", RU «Ищу соседа по квартире в Варшаве», UK «Шукаю
  сусіда по квартирі у Варшаві» (new `listings.roommateH1`). (3) Add `listings.titleRoommate`
  to `REWRITTEN_KEYS`.
- **Size:** S. **Rank:** 1.

### SE-2 — The bot entry block is invisible to Google and to non-clicking visitors

- **What (code):** `FindFlatmateBlock` (counts, how matching works, bot button
  `t.me/<bot>?start=mate_web_roommate`) renders only after the visitor picks the third role
  (`src/lib/roommate-roles.ts:52-54`; `listings-page-client.tsx:385-391`); `RoomMoneyBlock` only
  for `find_room` or an empty city (`:61-66`).
- **Evidence:** the served HTML of `/warsaw/roommate` (live) contains no `t.me` link and no
  profile count; the role state is client-only (spec 02 §Find a flatmate: "Choosing it shows a
  block").
- **Why it matters:** the page's job is to be an entry into the bot (D48, H10); hidden content is
  neither indexed nor seen by the clicks that arrive.
- **Proposed change:** render `FindFlatmateBlock` by default when `cityOfferCount === 0` (true
  today), keep the role selector as a filter; amend spec 02 §Find a flatmate with one line. Keep
  the 1 h counts cache.
- **Size:** S–M. **Rank:** 1.

### SE-3 — Templated titles outside the honesty test still claim "real / actually"

- **What (code, confirmed in all four files):** `costsSeo.buildingMetaTitle` "{address}, {city}
  — realne koszty najmu" / "real rental costs" / «реальные расходы» / «реальні витрати»;
  `costsSeo.buildingMetaDescription` (no figure) "Realne koszty wynajmu…"; `districtMetaTitle`
  "— realne koszty najemców" / "real tenant costs"; `districtMetaDescription` "Realne koszty…
  Dane od najemców" / "Crowdsourced from tenants"; `cityMetaTitle` "realne koszty według
  dzielnic"; `calculator.metaTitle` "ile naprawdę kosztuje" / "what it really costs" / «сколько
  реально стоит»; `calculator.metaDescription` "realny miesięczny koszt" / "the real monthly
  cost"; `rentReport.metaTitle/metaDescription/ogTitle/lead` "realne dane lokatorów" / "real
  tenant data" / «реальные данные»; `meta.homeTitle/homeDescription` "ogłoszenia (cesja,
  współlokator, podnajem)… Poznaj prawdziwą cenę"; `meta.aboutDescription`,
  `howItWorksDescription`, `blogDescription` ("realnym rynku najmu"). None is in
  `REWRITTEN_KEYS` (`src/i18n/honesty-copy.test.ts:34-68`); the EN whole-file scan (`:128`) omits
  `really`. Live heads match these values.
- **Why it matters:** CLAUDE.md forbids "real prices" / "actually pay" on every title; the test
  exists so this cannot regress, but it covers neither these keys nor the home copy that still
  sells frozen listings (D5).
- **Proposed change:** add the keys above to `REWRITTEN_KEYS`, add `really` to the EN scan, and
  rewrite in four locales (tables B, C, F, G, K). Home/about/how-it-works copy is positioning:
  **Open: owner decision**.
- **Size:** S. **Rank:** 1.

### SE-4 — Blog frontmatter hard-codes "77 % … in full"; live data-report FAQ still says "actually pay"

- **What (code):** `rental-deposit-kaucja-warsaw-{en,pl,ru,uk}.mdx` and
  `protokol-zdawczo-odbiorczy-warsaw-{en,pl,ru,uk}.mdx` descriptions: "77% of Warsaw tenants got
  their deposit back in full", "Tylko 77% najemców w Warszawie odzyskało kaucję w całości",
  «77% … вернули залог полностью», «77% … повернули кауцію повністю». Other frontmatter uses
  "rzeczywistych/реальной/реальну" (hidden costs PL/RU/UK), "realnej ceny dzielnicy / реальной
  цены района / справжньої ціни" (no-agent PL/RU/UK), "realny koszt miesięczny / реальная
  стоимость" (contract checklist), "Who Wise actually works for" (bank account EN), "What
  Landlords Actually Check" (move-out EN). **Live:** the data report's FAQPage JSON-LD says "the
  full amount tenants actually pay" and "77% of leavers get the deposit back in full"; on the
  branch `rentReport.faqA1/faqA3` are rewritten (test `:52-53,112-124`), fixed by the deploy.
- **Where:** `src/content/blog/*.mdx:2-3`; `src/lib/blog.ts` reads only the frontmatter keys
  `title, description, date, locale, slug, tags`.
- **Why it matters:** two of these guides sit on page 1 (deposit EN position 6.6; protokół in
  the deposit cluster) with a statistic the figure contract gates (`MIN_DEPOSIT_ANSWERS`, "fully
  or partly"); frontmatter is outside every test.
- **Proposed change:** rewrite the eight deposit/protokół frontmatters (table I gives the deposit
  guide; the protokół guide follows the same pattern without the number) and the "real" ones in
  tables E and J; search the bodies for "77", "w całości", "полностью", "повністю", "in full"
  (bodies **unverified**); add a vitest over `src/content/blog/*.mdx` frontmatter with the same
  `FORBIDDEN` regexes plus `/\d+\s?%/`.
- **Size:** S. **Rank:** 1.

### SE-5 — Nominative district and city names break Polish and Russian in titles and H1s

- **What (code + live):** `costsSeo.districtH1` "Wynajem w {district}" → "Wynajem w Mokotów";
  `districtMetaTitle` "Wynajem w {district}, {city}"; `buildingsHeading` "Budynki w {district}";
  `calculator.metaTitle` "Kalkulator wynajmu w {city}" and `calculator.h1` "Ile kosztuje wynajem
  w {city}…" → "w Warszawa"; RU «Аренда в Mokotów», «Калькулятор аренды в Warszawa» (live RU
  shows «Варшава» for the city key but the district stays nominative). Polish needs the locative
  and the right preposition ("na Mokotowie", "w Śródmieściu", "na Woli", "w Warszawie").
- **Why it matters:** Polish searchers are the Google segment; 65 district/city pages earned 1
  click in 12 months.
- **Proposed change:** nominative-safe templates — "{district}, {city} — …", H1
  "{district}: koszty najmu", "w dzielnicy {district}", "Budynki — {district}"; the calculator
  keys may hard-code "w Warszawie" until a second city exists (D6). Drafts in tables C and G.
- **Size:** S. **Rank:** 2.

### SE-6 — Sitemap ranks frozen listings above the roommate page; blog entries lack lastmod

- **What (code + live):** `/{city}/replacement` 0.7, `/{city}/sublet` 0.5, `/{city}/roommate`
  0.5 (`src/app/sitemap.ts:78-80`); every active listing detail 0.8 with `lastModified`
  (`:95-102`; live: one frozen sublet detail with a transliterated RU slug); blog posts 0.6 and no
  `lastModified` although frontmatter has `date` (`:127-130`). Live: 366 URLs, hreflang
  alternates on every entry, `lastmod` only on buildings and the listing.
- **Proposed change:** roommate 0.8; replacement and sublet 0.4; drop listing details from the
  sitemap (pages stay reachable — **Open: owner decision**, it touches frozen URLs'
  discoverability); `lastModified: post.date` for blog entries.
- **Size:** S. **Rank:** 2.

### SE-7 — Structured data: SearchAction to a frozen page, wrong Instagram handle, SVG article image, non-localised URLs and names

- **What (code, confirmed live):** (a) `WebSite.potentialAction.target` =
  `/warsaw/replacement?q={search_term_string}` (`src/lib/json-ld.tsx:30`). (b)
  `Organization.sameAs` `instagram.com/passflat.com` vs footer `instagram.com/passflatapp`;
  Threads missing (`:16`). (c) `Article.image` = `/icon.svg` (`:88`); the OG PNG exists. (d)
  `Article.url` always `${SITE_URL}/blog/${slug}` (`blog/[slug]/page.tsx:59`,
  `warsaw-rent-prices/page.tsx:159`) and every `BreadcrumbList.item` unprefixed (`json-ld.tsx:122`)
  with hard-coded English names "Home", "Blog": live `/en/blog/warsaw-rent-prices` emits
  `"url":"https://passflat.com/blog/warsaw-rent-prices"` next to canonical `/en/…`. Only
  `buildingPlaceJsonLd` gets the per-locale canonical (`building/[slug]/page.tsx:305`). (e) No
  JSON-LD at all on roommate, check, costs, review (fine for now); `about` emits a second
  `Organization`. No `AggregateRating` anywhere (correct).
- **Proposed change:** target `/{city}/check?q=` or remove the SearchAction; fix the handle (owner
  confirms the accounts); `image: getOgImage(...).url`; pass `getAlternates(path,
locale).canonical` to `articleJsonLd` and a locale plus translated names to `breadcrumbJsonLd`;
  drop the duplicate `Organization` on `/about`. `FAQPage` on a guide only where a visible FAQ
  exists, with the same strings.
- **Size:** S. **Rank:** 2.

### SE-8 — No page group links to the roommate page or the bot except the footer

- **What (code, link inventory):** building client links to city, district, `/costs`,
  `/costs/submit`, `/review`, `/replacement?district=` (frozen, `client.tsx:1226`) — not to
  `/check`, `/calculator`, `/roommate`, `/blog` or `t.me`. District page: `/costs/submit`,
  `/calculator?district=`, `/costs`, buildings. All 52 blog bodies link to `/check` and `/costs`;
  none to `/roommate`, `/calculator` or `t.me`; the cesja guides link to `/replacement`.
  `/warsaw/roommate` reaches `t.me` only inside the hidden block (SE-2); the other Telegram CTA
  exists only on the check page (`check/client.tsx:650,685`). Live link inventories of
  `/warsaw/building/wolska-96` and the meters guide agree.
- **Why it matters:** 42 % of clicks land on building pages and 41 % of impressions on guides;
  none offers the thesis's next step.
- **Proposed change:** one shared server component `FlatmateCallout` (`listings` keys): "Looking
  for someone to rent with in Warsaw? {count} people have a profile · budget per person · the
  bot in EN/RU/UK" + links to `/warsaw/roommate` and `botStartUrl(username, 'roommate')`; counts
  from `loadFlatmateBlockCounts()` (1 h cache), no count line when unavailable. Place it under
  the figures on building pages, under the figure card on district pages and at the end of
  guides (`blog/[slug]/client.tsx` below the article). Replace the building page's
  `/replacement?district=` link with the district page.
- **Size:** M. **Rank:** 1.

### SE-9 — District pages for rooms and flatmates: extend `/[city]/[district]`, no new URLs

- **Today (code):** one figure for `rentalType: 'all'` with group and N (`DistrictFigureCard`),
  the buildings list, three buttons; no room figure, no per-person line, no profile count, no
  "pokój" / "współlokator" in any heading.
- **What the contract allows:** room figure = `loadAreaReference({ districtId, cityId,
rentalType: 'room' })`: the district when it has ≥ 5 room reports, else Warsaw, the level said
  ("Wesoła has fewer than 5 room reports; Warsaw:"), both groups with N — the bot's lines (spec 06
  §Room cost reference). Per-person = `loadAreaReference({ …, rentalType: 'apartment', minRooms:
2 })` tenant group, all-in `completeTotal` with N ≥ 2, median ÷ 2 rounded to 10 zł, "for two
  people about X each (half of the median flat, N tenant reports, <area>)" (D61/D71; spec 03
  §Loaders). Never the asking group or a known part. Profile counts: `loadRoommateCounts()` loads
  every active profile's districts (spec 06 §Counts); the website result exposes the total and
  the top 5, so a per-district count needs the counting rule to return every district (zero →
  "nobody yet"; "any" profiles never added; no percentage).
- **Proposed change (one section, no route):** `<h2>` "Pokój i wspólny najem: {district}" with the
  room lines, the D71 line when it qualifies, "{n} people with a profile name {district}" or
  "nobody yet", the bot button and a link to `/warsaw/roommate`. Title/description gain
  "pokój"/"room" (table C; the shorter description variant until this ships). Why not
  `/[district]/pokoj`: 16 × 4 = 64 thin pages with the same three lines; the existing 65 pages
  earned 1 click — the problem is content and snippet, not URL count. Revisit new URLs only if
  Search Console shows district-level room queries after the section ships.
- **Honesty:** every number from the two loaders with group and N; a line without data is
  omitted; no "cheapest" (needs `isComparable`).
- **Size:** M (section + counts rule + one-line amendments to specs 02/06). **Rank:** 1.

### SE-10 — Blog: thesis fit, a frozen-feature promise, cross-links, the data report

- **Classification (13 slugs × 4 locales, frontmatter read):** on-thesis (room or shared-flat
  money, deposit, meters): `przepisanie-licznikow-najem`, `hidden-rental-costs-warsaw`,
  `doplaty-rozliczenie-warsaw`, `protokol-zdawczo-odbiorczy-warsaw`,
  `rental-deposit-kaucja-warsaw`, `move-out-cleaning-warsaw`, data report `warsaw-rent-prices`.
  Newcomer-adjacent, keep without promotion: `bank-account-rent-poland` (EN 3 clicks),
  `foreigners-guide-renting-warsaw`, `internet-apartment-warsaw`,
  `rental-contract-checklist-warsaw`, `najem-okazjonalny-vs-standard-warsaw`,
  `renting-without-agent-warsaw` (agency angle, H6 parked). Off-thesis: `cesja-najmu-guide` —
  all four descriptions promise "jak Passflat pomaga znaleźć nowego najemcę" / "how Passflat
  helps you find a match" / «помогает найти замену» (tenant replacement, frozen D5) and the
  bodies link to `/replacement`.
- **Rendering (code):** article bodies go through `markdownToHtml`
  (`blog/[slug]/client.tsx:140-144`) as raw `<a>`; absolute `https://passflat.com/...` self-links
  (najem-okazjonalny, foreigners, no-agent, cesja, deposit, part of the checklist) open in a new
  tab with `rel="noopener"`; PL bodies use unprefixed paths, other locales `/en/…` etc. The
  `MDXRemote` branch never runs.
- **Data report (code):** honest per group and N; links to districts, calculator, check, submit,
  two guides; no per-person figure, no roommate link; its meta keys still say "real" (SE-3).
- **Proposed change:** (1) `cesja-najmu-guide` frontmatter without the replacement promise
  (table H; keeping the article: **Open: owner decision**). (2) The D71 per-person line and a
  roommate/bot link in the data report, from the same loader call as the roommate page. (3)
  `FlatmateCallout` (SE-8) under every guide. (4) Convert absolute self-links to relative ones
  rendered without `target="_blank"` (small change in `markdownToHtml`). (5) Drafts for the five
  low-CTR pages (tables D, E, H, I, J).
- **Topics to consider (no more than five):** (a) "umowa między współlokatorami / jak dzielić
  koszty mieszkania" — the roommate cluster holds 12 of 15 visible query clicks and no article
  covers the step after a match; (b) "ile kosztuje pokój w Warszawie" per district — thesis
  segment 3 and the room-money block; no GSC query evidence yet (hypothesis); (c) "mieszkanie na
  dwie osoby w Warszawie: koszt na osobę" as a living page fed by the D71 loader like the data
  report — the thesis's core number; no GSC evidence (hypothesis); (d) RU/UK «с кем снять
  квартиру в Варшаве» / «як знайти сусіда у Варшаві» — `/ru/warsaw/roommate` 3 clicks from 25
  impressions at position 5, 14 visible RU queries with 0 clicks; (e) "dwóch najemców na jednej
  umowie (solidarna odpowiedzialność)" — lease-documents cluster 12 queries, 0 clicks; legal
  content, owner review required.
- **Size:** M. **Rank:** 2.

### SE-11 — robots and noindex gaps: `/api/og` blocked, non-Polish private URLs not blocked

- **What (code `src/app/robots.ts`, confirmed live):** `Disallow: /api/` covers `/api/og?…`, the
  `og:image` of every page, so Googlebot cannot fetch the image offered to it (Telegram/Facebook
  scrapers ignore robots). The disallow list (`/dashboard/`, `/messages/`, `/create-listing/`,
  `/auth/`) has no locale prefix, so `/en/dashboard`, `/ru/auth/login` and bare `/dashboard`
  are crawlable; `/admin` is not listed; those pages carry no metadata and no `noindex`.
  `/[city]/costs/submit` sets only `alternates`, so it inherits the home title and description.
- **Proposed change:** `allow: ['/', '/api/og']`; disallow patterns with and without the three
  locale prefixes (or `robots: { index: false }` in the auth/dashboard/admin/messages layouts);
  a title and description for `/costs/submit` (PL draft "Dodaj koszty swojego mieszkania w
  Warszawie").
- **Size:** S. **Rank:** 3.

### SE-12 — Building pages: the largest click group needs only the wording fix

- **What (code + live):** address and localized city in the title; the description carries one
  group's figure with rent/expenses split and `{reports}` = group label with N
  (`single-number-metadata.ts:68-102`; `buildingMetaDescriptionWithData` already "Zgłoszone
  koszty"); OG card with group and N; `Place` and breadcrumbs; UUID → slug redirect
  (`page.tsx:197-199`); ISR 1 h. Address queries: 261 visible, position 26, 66 in the top 10,
  CTR 0.3 %; RU URLs position 19.5.
- **Proposed change:** only the title and the no-figure description (table B) and the
  `FlatmateCallout` (SE-8). Do not put a per-person number on a building (N is 1–3); the D71 line
  belongs to the district page.
- **Size:** S. **Rank:** 2.

## Metadata drafts

"current" = branch value (code), which equals the live head except where SE-1/SE-4 note the PRD 1
rewrite. `{…}` are template variables; `{reports}` is the group label with N.

### A. `/warsaw/roommate` (SE-1)

| locale | current title                   | current description                                                                                                                                                      | draft title                                       | draft description                                                                                                                                           |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pl     | Szukam współlokatora — Warszawa | Ogłoszenia współlokatorów — {city}: pokoje we wspólnych mieszkaniach, bez pośredników. Zanim się wprowadzisz, sprawdź zgłoszone koszty budynku: czynsz, opłaty i kaucję. | Szukam współlokatora w Warszawie: koszty na osobę | Znajdź współlokatora do wynajmu w Warszawie: profil w bocie Telegram (EN/RU/UK), dzielnica, budżet na osobę. Koszty pokoju: zgłoszenia i ogłoszenia.        |
| en     | Roommate Search — Warsaw        | Flatmate listings in {city} — rooms in shared flats, no agents. Before you move in, check the costs reported for the building: rent, utilities and deposit.              | Find a flatmate in Warsaw — rent per person       | Find someone to rent with in Warsaw: a Telegram bot profile (district, budget per person), contacts on mutual interest. Room costs: reports and listings.   |
| ru     | Поиск соседа — Варшава          | Объявления соседей по квартире — {city}: комнаты в общих квартирах, без посредников. Перед переездом посмотрите расходы дома по отчётам…                                 | Сосед по квартире в Варшаве — цена на человека    | Найди, с кем снять квартиру в Варшаве: профиль в Telegram-боте (район, бюджет на человека), контакт при взаимном интересе. Цены комнат: отчёты, объявления. |
| uk     | Пошук співмешканця — Варшава    | Оголошення сусідів по квартирі — {city}: кімнати у спільних квартирах, без посередників. Перед переїздом перегляньте витрати будинку за звітами…                         | Сусід по квартирі у Варшаві — ціна на особу       | Знайди, з ким зняти квартиру у Варшаві: профіль у Telegram-боті (район, бюджет на особу), контакт за взаємного інтересу. Ціни кімнат: звіти та оголошення.  |

### B. Building page (`costsSeo.buildingMetaTitle`, `buildingMetaDescription`) (SE-3, SE-12)

`buildingMetaDescriptionWithData` / `…Partial` are already honest ("Zgłoszone koszty wynajmu —
{address}, {city}: razem ≈ {total} zł/mies. (czynsz ≈ {rent}, opłaty ≈ {expenses}). {reports}.")
and keep their text.

| locale | current title                                  | current description (no figure)                                                                                    | draft title                                      | draft description (no figure)                                                                                                                        |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| pl     | {address}, {city} — realne koszty najmu        | Realne koszty wynajmu — {address}, {city}: czynsz, opłaty i kaucja. Sprawdź dane albo dodaj swoje.                 | {address}, {city} — koszty najmu wg zgłoszeń     | {address}, {city}: brak zgłoszeń dla tego budynku — pokazujemy odniesienie dla dzielnicy lub Warszawy z grupą i liczbą zgłoszeń. Dodaj swoje koszty. |
| en     | {address}, {city} — real rental costs          | Real rental costs for {address}, {city}: rent, utilities and deposit. See the data or add yours.                   | {address}, {city} — reported rental costs        | {address}, {city}: no report for this building yet — we show the district or Warsaw reference with its group and N. Add your own costs.              |
| ru     | {address}, {city} — реальные расходы на аренду | Реальные расходы на аренду — {address}, {city}: аренда, коммуналка и депозит. Посмотрите данные или добавьте свои. | {address}, {city} — расходы на аренду по отчётам | {address}, {city}: отчётов по этому дому пока нет — показываем ориентир по району или Варшаве с группой и числом N. Добавьте свои расходы.           |
| uk     | {address}, {city} — реальні витрати на оренду  | Реальні витрати на оренду — {address}, {city}: оренда, комуналка та застава. Перегляньте дані або додайте свої.    | {address}, {city} — витрати на оренду за звітами | {address}, {city}: звітів по цьому будинку ще немає — показуємо орієнтир по району або Варшаві з групою і числом N. Додайте свої витрати.            |

### C. District page (`costsSeo.districtMetaTitle/Description`, `districtH1`) (SE-5, SE-9)

| locale | current title                                           | current description                                                                                                      | draft title                                       | draft description (after SE-9; until then stop before "cena pokoju")                                                                                         |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pl     | Wynajem w {district}, {city} — realne koszty najemców   | Realne koszty wynajmu w {district}, {city}: czynsz, opłaty i kaucje, budynek po budynku. Dane od najemców.               | {district}, {city} — koszty najmu i pokoju        | Koszty najmu w dzielnicy {district} ({city}) wg zgłoszeń: czynsz, opłaty, budynek po budynku, cena pokoju i ile osób szuka tu współlokatora.                 |
| en     | Rent in {district}, {city} — real tenant costs          | Real rental costs in {district}, {city}: rent, utilities and deposits, building by building. Crowdsourced from tenants.  | {district}, {city} — rent costs and room prices   | Rent costs in {district}, {city} as reported: rent, utilities and deposits building by building, room figures, and how many people look for a flatmate here. |
| ru     | Аренда в {district}, {city} — реальные расходы жильцов  | Реальные расходы на аренду в {district}, {city}: аренда, коммуналка и депозиты по конкретным домам. Данные от жильцов.   | {district} ({city}) — аренда и комната по отчётам | Расходы на аренду в районе {district} ({city}) по отчётам: аренда, коммуналка и депозиты по домам, цены комнат и сколько человек ищут здесь соседа.          |
| uk     | Оренда в {district}, {city} — реальні витрати мешканців | Реальні витрати на оренду в {district}, {city}: оренда, комуналка та застави по конкретних будинках. Дані від мешканців. | {district} ({city}) — оренда і кімната за звітами | Витрати на оренду в районі {district} ({city}) за звітами: оренда, комуналка й застави по будинках, ціни кімнат і скільки людей шукають тут сусіда.          |

H1 (`districtH1`, now "Wynajem w {district}"): PL "{district}: koszty najmu", EN "{district}: rent
costs", RU «{district}: расходы на аренду», UK «{district}: витрати на оренду»; `buildingsHeading`
"Budynki — {district}" (and EN/RU/UK analogues).

### D. `/blog/przepisanie-licznikow-najem` (meters guide)

| locale | current title                                                                                       | current description                                                                                                                                           | draft title                                                 | draft description                                                                                                                                              |
| ------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pl     | Przepisanie liczników przy wynajmie — poradnik najemcy krok po kroku (68)                           | Czy przepisać licznik prądu i gazu na najemcę? Co da się przepisać, co zostaje na właścicielu i jak krok po kroku wygląda cesja w PGE, Tauron czy Orlen.      | Przepisanie liczników na najemcę: prąd i gaz krok po kroku  | Czy przepisać prąd i gaz na siebie przy wynajmie? Co da się przepisać, co zostaje na właścicielu, cesja w PGE, Tauron i Orlen krok po kroku, dług poprzednika. |
| en     | Utility Meters and Contracts When Renting in Poland: What Goes in Your Name (and What Doesn't) (93) | Should electricity and gas go in your name when renting in Poland? What can be transferred to the tenant, what can't, and how the process works step by step. | Utility meters in your name when renting in Poland?         | Put electricity and gas in your name when renting in Poland? What transfers, what stays with the landlord, the PGE/Tauron/Orlen steps and old meter debts.     |
| ru     | Счётчики, свет и газ при заселении в Польше: что переоформлять на себя, а что нет (80)              | Переводить ли свет и газ на себя при аренде в Польше? Что можно переоформить на арендатора, что нет, и как пройти процедуру с PGE, Tauron или Orlen.          | Переоформлять ли свет и газ на себя при аренде в Польше     | Что можно перевести на арендатора, что остаётся на владельце, как проходит переоформление в PGE, Tauron и Orlen и что делать с долгом прошлого жильца.         |
| uk     | Лічильники, світло і газ при заселенні в Польщі: що переоформлювати на себе, а що ні (82)           | Чи переоформлювати світло і газ на себе при оренді в Польщі? Що можна перевести на орендаря, що ні, і як пройти процедуру з PGE, Tauron чи Orlen.             | Чи переоформлювати світло і газ на себе при оренді в Польщі | Що можна перевести на орендаря, що лишається на власнику, як проходить переоформлення в PGE, Tauron і Orlen і що робити з боргом попереднього мешканця.        |

### E. `/blog/hidden-rental-costs-warsaw`

| locale | current title                                            | current description                                                                                                                                                | draft title                                                  | draft description                                                                                                                                  |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| en     | Hidden Rental Costs in Warsaw: The Complete Guide        | Everything you need to know about real rental costs in Warsaw — czynsz administracyjny, utilities, deposits, and fees that landlords don't always mention upfront. | Hidden rental costs in Warsaw: czynsz, utilities, deposit    | What a Warsaw listing leaves out: czynsz administracyjny, utilities and dopłaty, deposit, agent fees — and how to check an address before signing. |
| pl     | Ukryte koszty wynajmu w Warszawie — kompletny przewodnik | Wszystko o rzeczywistych kosztach wynajmu w Warszawie — czynsz administracyjny, media, kaucja i opłaty, o których wynajmujący nie zawsze mówią od razu.            | Ukryte koszty wynajmu w Warszawie: czynsz, media, kaucja     | Czego nie ma w ogłoszeniu: czynsz administracyjny, media i dopłaty, kaucja, prowizja — i jak sprawdzić adres przed podpisaniem umowy.              |
| ru     | Скрытые расходы при аренде в Варшаве: полное руководство | Всё, что нужно знать о реальной стоимости аренды в Варшаве — czynsz administracyjny, коммунальные платежи, залог и сборы…                                          | Скрытые расходы аренды в Варшаве: чинш, коммуналка, депозит  | Чего нет в объявлении: czynsz administracyjny, коммуналка и доплаты, депозит, комиссия — и как проверить адрес до подписания договора.             |
| uk     | Приховані витрати на оренду у Варшаві: повний посібник   | Усе, що потрібно знати про реальну вартість оренди у Варшаві — czynsz administracyjny, комунальні платежі, застава та збори…                                       | Приховані витрати оренди у Варшаві: чинш, комуналка, застава | Чого немає в оголошенні: czynsz administracyjny, комуналка й доплати, застава, комісія — і як перевірити адресу до підписання договору.            |

### F. `/blog/warsaw-rent-prices` (`rentReport.metaTitle/metaDescription`)

| locale | current title                                                     | current description                                                                                                | draft title                                                 | draft description                                                                                                                                                  |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pl     | Ile kosztuje wynajem w Warszawie w {year} — realne dane lokatorów | Realne koszty wynajmu w Warszawie w {year} według dzielnic: mediany czynszu i mediów. Aktualizowane automatycznie. | Czynsz i opłaty w Warszawie {year} — zgłoszenia wg dzielnic | Czynsz i opłaty w Warszawie {year} wg dzielnic: mediany ze zgłoszeń najemców lub cen ofertowych, każda z liczbą zgłoszeń, zwroty kaucji i lista kontrolna kosztów. |
| en     | How much rent costs in Warsaw in {year} — real tenant data        | Real rental costs in Warsaw in {year} by district: median rent and utilities. Updated automatically.               | Rent in Warsaw {year}: what tenants report, by district     | Monthly rent and utilities in Warsaw {year} by district: medians from tenant reports or asking prices, each with its N, deposit returns, cost checklist.           |
| ru     | Сколько стоит аренда в Варшаве в {year} — реальные данные жильцов | Реальные расходы на аренду в Варшаве в {year} по районам: медианы аренды и коммуналки. Обновляется автоматически.  | Аренда в Варшаве {year}: отчёты жильцов по районам          | Аренда и коммуналка в Варшаве {year} по районам: медианы из отчётов жильцов или цен объявлений, каждая с числом N, возврат депозитов и чек-лист расходов.          |
| uk     | Скільки коштує оренда у Варшаві у {year} — реальні дані мешканців | Реальні витрати на оренду у Варшаві у {year} за районами: медіани оренди та комуналки. Оновлюється автоматично.    | Оренда у Варшаві {year}: звіти мешканців за районами        | Оренда й комуналка у Варшаві {year} за районами: медіани зі звітів мешканців або цін оголошень, кожна з N, повернення застав і чек-лист витрат.                    |

Also `rentReport.ogTitle` ("realne dane" → "zgłoszenia wg dzielnic") and `lead` ("Realne koszty"
→ "Zgłoszone koszty"), same pattern in four locales.

### G. `/warsaw/calculator` (`calculator.metaTitle/metaDescription`; H1 `calculator.h1`) (SE-3, SE-5)

| locale | current title                                                                   | current description                                                                                                                                                                                  | draft title                                           | draft description                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pl     | Kalkulator wynajmu w {city} — ile naprawdę kosztuje (czynsz najmu + media) (76) | Oszacuj realny miesięczny koszt wynajmu w {city}: czynsz najmu z mediany lokatorów plus media według stawek Warszawy — czynsz administracyjny, ogrzewanie, prąd, woda, wywóz śmieci, internet. (196) | Kalkulator kosztów najmu w Warszawie: czynsz i media  | Policz koszt najmu w Warszawie: czynsz wg mediany dla dzielnicy (z grupą i N) plus media wg stawek — czynsz administracyjny, ogrzewanie, prąd, woda, internet. |
| en     | Rent calculator for {city} — what it really costs (rent + utilities) (68)       | Estimate the real monthly cost of renting in {city}: rent from the tenant median plus utilities based on Warsaw tariffs — admin fee (czynsz), heating, electricity, water, garbage, internet.        | Warsaw rent calculator: rent plus utilities per month | Estimate a month of renting in Warsaw: the district's median rent with its source and N plus utilities at Warsaw tariffs: czynsz, heating, water, internet.    |
| ru     | Калькулятор аренды в {city} — сколько реально стоит (аренда + коммуналка)       | Оцените реальную месячную стоимость аренды в {city}: аренда по медиане от жильцов плюс коммуналка по тарифам Варшавы — czynsz, отопление, электричество, вода, вывоз мусора, интернет.               | Калькулятор аренды в Варшаве: аренда плюс коммуналка  | Оцените месяц аренды в Варшаве: медиана аренды по району с источником и N плюс коммуналка по варшавским тарифам — чинш, отопление, свет, вода, интернет.       |
| uk     | Калькулятор оренди у {city} — скільки реально коштує (оренда + комуналка)       | Оцініть реальну місячну вартість оренди у {city}: оренда за медіаною від мешканців плюс комуналка за тарифами Варшави — czynsz, опалення, електрика, вода, вивіз сміття, інтернет.                   | Калькулятор оренди у Варшаві: оренда плюс комуналка   | Оцініть місяць оренди у Варшаві: медіана оренди по району з джерелом і N плюс комуналка за варшавськими тарифами — чинш, опалення, світло, вода, інтернет.     |

H1 `calculator.h1` "Ile kosztuje wynajem w {city} z wszystkimi opłatami" → PL "Koszt najmu w
Warszawie ze wszystkimi opłatami" (EN/RU/UK analogous, city in the right case).

### H. `/blog/cesja-najmu-guide` — Open: owner decision on keeping the article

| locale | current title                                           | current description                                                                                                                                      | draft title                                            | draft description                                                                                                                                           |
| ------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pl     | Cesja najmu w Polsce — kompletny poradnik krok po kroku | Jak przeprowadzić cesję najmu w Polsce — co to jest, wymogi prawne, proces krok po kroku i jak Passflat pomaga znaleźć nowego najemcę.                   | Cesja najmu: jak przekazać umowę nowemu najemcy        | Czym jest cesja najmu, czy potrzebna jest zgoda właściciela, jakie dokumenty podpisać i jak rozliczyć kaucję między starym a nowym najemcą — krok po kroku. |
| en     | How to Do a Lease Takeover (Cesja Najmu) in Poland      | Complete guide to lease takeovers in Poland — what cesja najmu means, legal requirements, step-by-step process, and how Passflat helps you find a match. | Lease assignment (cesja najmu) in Poland: step by step | What cesja najmu is, whether the landlord's consent is needed, which documents to sign and how to settle the deposit between the old and the new tenant.    |
| ru     | Как оформить переуступку аренды (cesja najmu) в Польше  | Полное руководство по переуступке аренды в Польше — … и как Passflat помогает найти замену.                                                              | Cesja najmu: как передать договор аренды в Польше      | Что такое cesja najmu, нужно ли согласие владельца, какие документы подписать и как рассчитать депозит между старым и новым арендатором.                    |
| uk     | Як оформити переуступку оренди (cesja najmu) у Польщі   | Повний посібник із переуступки оренди в Польщі — … і як Passflat допомагає знайти заміну.                                                                | Cesja najmu: як передати договір оренди в Польщі       | Що таке cesja najmu, чи потрібна згода власника, які документи підписати і як розрахувати заставу між старим і новим орендарем.                             |

### I. `/blog/rental-deposit-kaucja-warsaw` (SE-4) — the bot clause only after the bot deploy

| locale | current title                                                | current description                                                                                                                                          | draft title                                               | draft description                                                                                                                                          |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| en     | How to Get Your Rental Deposit (Kaucja) Back in Warsaw       | 77% of Warsaw tenants got their deposit back in full — one in four loses part of it. What the kaucja is, why the protokół matters, and how to be in the 77%. | Getting your deposit (kaucja) back in Warsaw: the rules   | What the kaucja is, when it must be returned, what may be deducted, why the handover protocol matters, and the Telegram bot that drafts the return letter. |
| pl     | Jak odzyskać kaucję przy wyprowadzce w Warszawie             | 77% najemców w Warszawie odzyskało kaucję w całości — co czwarty traci część. Czym jest kaucja, po co protokół i jak znaleźć się w większości.               | Zwrot kaucji za mieszkanie w Warszawie: zasady i termin   | Czym jest kaucja, w jakim terminie musi wrócić, co właściciel może potrącić, dlaczego liczy się protokół i bot Telegram, który przygotuje pismo o zwrot.   |
| ru     | Как вернуть залог (kaucja) при съезде в Польше               | 77% арендаторов в Варшаве вернули залог полностью — каждый четвёртый теряет часть. Что такое kaucja, зачем нужен protokół и как попасть в большинство.       | Возврат залога за квартиру в Варшаве: правила и сроки     | Что такое kaucja, в какой срок её должны вернуть, что может удержать владелец, зачем нужен протокол и бот в Telegram, который составит письмо о возврате.  |
| uk     | Як повернути заставу (kaucja) при виїзді з квартири в Польщі | 77% орендарів у Варшаві повернули кауцію повністю — кожен четвертий втрачає частину. Що таке kaucja, навіщо protokół і як опинитися в більшості.             | Повернення застави за квартиру у Варшаві: правила і строк | Що таке kaucja, у який строк її мають повернути, що може утримати власник, навіщо протокол і бот у Telegram, який складе лист про повернення.              |

The protokół guide (`protokol-zdawczo-odbiorczy-warsaw-*`, "Tylko 77% … w całości") takes the
same treatment: lead with the 20-point checklist, no percentage.

### J. `/blog/renting-without-agent-warsaw` and `/blog/najem-okazjonalny-vs-standard-warsaw`

| page / locale    | current title                                                                         | current description                                                                                                                                             | draft title                                                | draft description                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| no-agent / en    | Renting in Warsaw without an agent: where to look and how not to overpay (72)         | Where to find direct-from-owner (od właściciela) listings… and why the real risk isn't the commission but not knowing the district's true price. (238)          | Renting in Warsaw without an agent: where to look          | Where to find od właściciela listings in Warsaw, how to spot an agent posing as the owner, and how to check ownership in the księga wieczysta.                 |
| no-agent / pl    | Wynajem mieszkania w Warszawie bez pośrednika: gdzie szukać i jak nie przepłacić (79) | Gdzie znaleźć ogłoszenia bezpośrednio od właściciela… nieznajomość realnej ceny dzielnicy. (>250)                                                               | Wynajem w Warszawie bez pośrednika: gdzie szukać           | Gdzie znaleźć ogłoszenia od właściciela w Warszawie, jak rozpoznać pośrednika udającego właściciela i jak sprawdzić właściciela w księdze wieczystej.          |
| no-agent / ru    | Аренда без риелтора в Варшаве: где искать и как не переплатить                        | Где найти объявления напрямую от владельца… незнании реальной цены района. (>230)                                                                               | Аренда в Варшаве без посредника: где искать                | Где искать объявления от владельца в Варшаве, как отличить посредника, выдающего себя за владельца, и как проверить собственника по księga wieczysta.          |
| no-agent / uk    | Оренда без ріелтора у Варшаві: де шукати і як не переплатити                          | Де знайти оголошення напряму від власника… незнанні справжньої ціни району. (>230)                                                                              | Оренда у Варшаві без посередника: де шукати                | Де шукати оголошення від власника у Варшаві, як відрізнити посередника, що видає себе за власника, і як перевірити власника за księga wieczysta.               |
| okazjonalny / en | Najem okazjonalny vs standard lease: the difference for a tenant (64)                 | How najem okazjonalny differs from a standard rental contract in Poland, what each means for the tenant, which to prefer, and what to watch for before signing. | Najem okazjonalny: what it means for the tenant            | Najem okazjonalny vs a standard umowa najmu in Poland: the notary statement, the eviction address, which protects you more and what to check first.            |
| okazjonalny / pl | Najem okazjonalny vs zwykła umowa najmu: różnica dla najemcy (60)                     | Czym najem okazjonalny różni się od zwykłej umowy najmu w Polsce, co każda z form oznacza dla najemcy, którą wybrać i na co uważać przed podpisaniem.           | Najem okazjonalny a zwykła umowa: co to znaczy dla najemcy | Czym najem okazjonalny różni się od zwykłej umowy najmu: oświadczenie u notariusza, wskazanie lokalu, która umowa lepiej chroni najemcę i na co uważać.        |
| okazjonalny / ru | Najem okazjonalny vs обычный договор: в чём разница для арендатора (66)               | Чем najem okazjonalny отличается от стандартного договора аренды в Польше, что это значит для арендатора, какой выбрать…                                        | Najem okazjonalny или обычный договор: что это для жильца  | Чем najem okazjonalny отличается от обычного договора аренды: заявление у нотариуса, адрес на случай выселения, что лучше защищает жильца и что проверить.     |
| okazjonalny / uk | Najem okazjonalny vs звичайний договір: у чому різниця для орендаря (67)              | Чим najem okazjonalny відрізняється від стандартного договору оренди в Польщі, що це означає для орендаря, який обрати…                                         | Najem okazjonalny чи звичайний договір: що це для орендаря | Чим najem okazjonalny відрізняється від звичайного договору оренди: заява в нотаріуса, адреса на випадок виселення, що краще захищає орендаря і що перевірити. |

### K. Home (`meta.homeTitle/homeDescription`) — Open: owner decision (positioning)

| locale | current title                                                 | current description                                                                                                                                                          | draft title                                              | draft description                                                                                                                                           |
| ------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pl     | Passflat — wynajem w Warszawie: koszty, ogłoszenia, dokumenty | Realne koszty wynajmu w Warszawie od samych najemców, ogłoszenia (cesja, współlokator, podnajem) i darmowe wzory dokumentów. Poznaj prawdziwą cenę przed podpisaniem.        | Passflat — z kim i za ile wynająć mieszkanie w Warszawie | Znajdź współlokatora przez bota Telegram i zobacz, ile zgłoszono za najem w Warszawie: czynsz i opłaty wg budynków i dzielnic, kalkulator, poradniki.       |
| en     | Passflat — Warsaw rentals: costs, listings, documents         | Real rental costs in Warsaw from tenants themselves, listings (lease takeover, roommate, sublet) and free document templates. Know the real price before you sign.           | Passflat — who to rent with in Warsaw, and what it costs | Find a flatmate through our Telegram bot and see what tenants reported for rent in Warsaw: rent and utilities by building and district, calculator, guides. |
| ru     | Passflat — аренда в Варшаве: расходы, объявления, документы   | Реальные расходы на аренду в Варшаве от самих жильцов, объявления (переуступка, сосед, субаренда) и бесплатные шаблоны документов. Узнай настоящую цену до подписания.       | Passflat — с кем и за сколько снять квартиру в Варшаве   | Найдите соседа через Telegram-бот и посмотрите, что сообщают об аренде в Варшаве: аренда и коммуналка по домам и районам, калькулятор, гайды.               |
| uk     | Passflat — оренда у Варшаві: витрати, оголошення, документи   | Реальні витрати на оренду у Варшаві від самих мешканців, оголошення (переуступка, сусід, субооренда) і безкоштовні шаблони документів. Дізнайся справжню ціну до підписання. | Passflat — з ким і за скільки зняти квартиру у Варшаві   | Знайдіть сусіда через Telegram-бот і подивіться, що повідомляють про оренду у Варшаві: оренда й комуналка по будинках і районах, калькулятор, гайди.        |

## Findings table

| id    | title                                                                                            | route                                                   | size | rank |
| ----- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ---- | ---- |
| SE-1  | Roommate page metadata promises listings; no H1                                                  | `/[city]/roommate`                                      | S    | 1    |
| SE-2  | Bot entry block hidden behind a client-side click                                                | `/warsaw/roommate`                                      | S–M  | 1    |
| SE-3  | Templated titles outside the honesty test ("realne", "naprawdę", "really")                       | building, district, city, calculator, data report, home | S    | 1    |
| SE-4  | Blog frontmatter: "77 % … w całości" in two guides; "real" wording in others                     | `/blog/*`                                               | S    | 1    |
| SE-5  | Nominative district/city names in PL/RU titles and H1s                                           | `/[city]/[district]`, `/[city]/calculator`              | S    | 2    |
| SE-6  | Sitemap priorities favour frozen listings; blog lastmod missing                                  | `/sitemap.xml`                                          | S    | 2    |
| SE-7  | Structured data: SearchAction → replacement, Instagram handle, SVG image, non-localised URLs     | all pages, blog, buildings                              | S    | 2    |
| SE-8  | No page group links to the roommate page or the bot                                              | buildings, districts, guides                            | M    | 1    |
| SE-9  | District pages: room figure, D71 per-person line, profile counts — extend, no new URLs           | `/[city]/[district]`                                    | M    | 1    |
| SE-10 | Blog: thesis fit, cesja promise, raw `<a>` self-links, data report per-person line, topics       | `/blog/*`                                               | M    | 2    |
| SE-11 | robots blocks `/api/og`; non-Polish private URLs not blocked; `/costs/submit` inherits home meta | `/robots.txt`, auth/dashboard, `/[city]/costs/submit`   | S    | 3    |
| SE-12 | Building pages: wording only; description with figure and N already honest                       | `/[city]/building/[slug]`                               | S    | 2    |

## Checked and found fine

- Canonical = the page's own locale URL; hreflang pl/en/ru/uk + x-default in HTML and in the
  HTTP `Link` header (`src/lib/seo.ts:50-60`; live heads/headers of roommate and building pages
  in four locales). The sitemap's alternates use the same rule (`sitemap.ts:9-24`; live).
- 41 `page.tsx` files: every public page has `generateMetadata` with `getAlternates`; private
  pages (auth, dashboard, admin, messages) have none; `/costs/share` is `noindex, follow`;
  e-mail pages `noindex, nofollow`; non-active listing details return `noindex`.
- robots.txt allows the site, lists the sitemap; the `isIndexable` fail-safe blocks everything
  when the env flag is not `"true"` (`seo.ts:14-27`, `robots.ts`).
- Sitemap lists only districts with visible cost data and buildings with visible reports; 366
  URLs live; building `lastmod` from the latest report.
- Building pages: `Place` with `PostalAddress` + `GeoCoordinates`, `BreadcrumbList`, localized
  city in the title, honest figure description with group and N, cost OG card, UUID → slug
  redirect, ISR 1 h (code; live matches).
- Data report: `Article` + `Dataset` + `FAQPage` share the visible FAQ strings; every number is
  one group's single number with N; `faqA1/faqA3` rewritten on the branch.
- Blog: 13 slugs × 4 locales with identical slugs, so every hreflang set resolves;
  `generateStaticParams` for all pairs; `Article.inLanguage` per locale; the index features the
  data report.
- `/en/warsaw/calculator` already converts at 5.7 %; the calculator baseline is labelled with
  group and N (`calculatorBaseline`).
- Title template "%s — Passflat" applied once; no layout-level canonical (`layout.tsx:42-47`).
- No `AggregateRating`, no invented statistics in structured data on the branch.

## Not verified

- Blog article bodies: whether the "77 %" / "in full" claims and "Telegram channels" mentions
  appear in the text (frontmatter and link targets were read; bodies were not).
- Whether live production is strictly pre-PRD-1: live building descriptions already carry a
  figure with N and the roommate role selector exists; the live roommate description still has
  "realne", so at least `listings.roommateMetaDescription` is pre-PRD-1.
- `AreaReferenceGroups` (`figure-group-block.tsx`) rendering inside the room money block.
