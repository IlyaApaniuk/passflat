# Site audit 2026-11-19

- **Written by:** Claude, night run authorized by the owner on the evening of 2026-11-19 (audit →
  PRD 4 → specs and tasks). Four fresh agents audited one area each in parallel; this file merges
  them. Their full sections are the appendix: [structure.md](2026-11-19-site-audit/structure.md),
  [seo.md](2026-11-19-site-audit/seo.md), [performance.md](2026-11-19-site-audit/performance.md),
  [funnel.md](2026-11-19-site-audit/funnel.md). Finding ids there (ST-, SE-, PE-, FU-) are mapped
  to the S-ids below.
- **State of this run (2026-11-20, 00:30):** the audit is complete and merged below. Only the SEO
  section reached the appendix folder in this run: the sandbox denied copying files from the
  scratchpad into the repository, and the three other agents hit the account's weekly API limit
  (resets 2026-11-21 21:00 Europe/Warsaw) before they could write their copies. Every finding of
  theirs is condensed in the tables below, so nothing is lost for PRD 4. **PRD 4, its decision
  review, the specs and the tasks were not written in this run** (budget and API limit); the
  "PRD 4" column below is the proposed mapping for the next run, which starts from this file.
- **Update (2026-11-20, second night run):** the three missing appendix sections (`structure.md`,
  `funnel.md`, `performance.md`) were copied from the session scratchpad into
  `2026-11-19-site-audit/`, so the appendix is complete. PRD 4 is written from this file:
  `../prd/prd-4-site-improvements.md`, with `../prd/prd-4-decision-review.md`; the "PRD 4" column
  below keeps the proposed mapping, and the PRD's own requirement table is the one that counts.
- **What was audited:** branch `chore/agent-harness` as the future site (PRD 1 and PRD 3 built, not
  deployed) and https://passflat.com as it is today (pre-PRD-1 build, read-only GET). Every finding
  says which. The bot CTAs render only with `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, unset in
  production today.
- **Limits:** no local server could be started in this session (the sandbox denied it) and
  Lighthouse is not installed, so Core Web Vitals are unverified; bundle sizes come from the fresh
  branch build in `.next` (22:45), headers and HTML from the live site. Rendered pixel positions
  are judgements from CSS classes. Nothing in the repository or in production was changed.
- **Inputs:** `thesis.md` (D48), `brd.md`, `decisions.md` (D1 – D77), `hypotheses.md`,
  `experiments.md`, `reviews/2026-11-18-metrics.md` (Search: 116 clicks in 12 months; building
  pages 42 %, roommate 26 %, blog 41 % of impressions at 0.7 % CTR), `../architecture.md`,
  `../specs/`, `../analytics/activation-funnels.md`.

## Verdict

The site does not yet read as "find someone to rent with and see what it costs per person". The
technical base is sound (per-locale canonical and hreflang, ISR on the cost pages, Mapbox loaded on
demand, real 404s, honest figure labels with group and N on every figure surface of the branch),
but every framing surface still tells the 2025 story of a listings marketplace with cost data on
the side: the home title, hero, footer, "how it works", About and Help describe lease takeovers,
roommate listings, sublets and "promoted listings from 39 PLN", while `/pricing` is a deliberate
404 and no roommate listing has existed since June. The one page built for the thesis,
`/warsaw/roommate` (25 of 116 Google clicks, position 8.8), opens on the frozen listings shell
("0 listings", type tabs, filters, an e-mail waitlist, "Post a listing"), its title and snippet
promise room listings, it has no `h1`, no `main` and no footer, and the PRD 3 "find a flatmate"
block renders only after the visitor taps a third role button, so neither Google nor the 90 % of
visitors who never click sees it. No building page (42 % of clicks), district page, guide, hub or
calculator links to the roommate page or the bot; the checker's bot handoff is a 14 px muted link.
Honesty is much better on the branch than live, but the "real / realne / naprawdę / реальные"
family survives in about 20 templated title and CTA keys outside the honesty test and in the blog
frontmatter ("77 % … w całości"). Two technical faults hit every visitor: `/favicon.ico` returns
HTTP 500, and link-preview images are re-rendered on every fetch. The fixes are mostly copy, links
and placement; the five that matter most for stage 1 inflow are S-1 (show the flatmate block by
default), S-2 (roommate metadata and H1), S-3 (a thesis section and entry on the home page), S-6
(a "find a flatmate, per person" entry on buildings, districts, hub and guides) and S-7 (the
per-person figure next to the block, from the figure contract).

## Findings by theme, ranked

Rank 1 = direct effect on stage 1 inflow or completion (or a fault every visitor meets); rank 2 =
trust and secondary entries; rank 3 = hygiene. Size: S under an hour of agent work, M a few hours,
L a day or more. "Open" marks a change the owner decides (removing or hiding a surface, URLs,
legal or consent text, personal data).

### A. Thesis, structure and navigation (stage 1 inflow)

- **S-1 · Roommate page opens on the frozen listings shell; the flatmate block is behind a tap**
  (ST-2, FU-1, SE-2). `showsFlatmateBlock` needs `intent === 'find_flatmate'`; the default view is
  type tabs, "0 listings", sort, filters, roles, room money block, e-mail card, "Post a listing".
  Show the block by default (role undefined or `find_flatmate`, and on `no_offers_in_city`), put
  the role selector above the type tabs, hide the "0 listings" line when the city has no offer.
  Hiding the type tabs is Open. S, rank 1.
- **S-2 · Roommate page metadata, H1 and landmarks** (ST-5, FU-2, SE-1, PE-2). Title "Roommate
  Search", description "Flatmate listings in {city} — rooms in shared flats, no agents"; no `h1`
  (first heading "Filtry"), no `main`, no footer, `h-screen overflow-hidden` (cut off by mobile
  toolbars). Rewrite title and description to the thesis in four locales (drafts: appendix seo.md
  table A, funnel.md FU-2), add a server-rendered `h1`, `main`, `h-dvh` and the footer; keep the
  URL, canonical and hreflang. S, rank 1.
- **S-3 · The home page never states the thesis and has no entry to the bot** (ST-1, FU-3). Hero
  "Don't overpay for rent in Warsaw", `meta.homeTitle` "costs, listings, documents", footer tagline
  "the full truth on costs from tenants, listings, and free document templates"; the ForWhom
  roommate card promises "lifestyle preferences and who already lives there". Add one thesis
  section under the hero (profile in the bot: district, budget per person, move-in month; bot
  languages; button to `/warsaw/roommate` and, with the username set, to the bot), rewrite the
  ForWhom card, the home title and description and the footer tagline (drafts in ST-1, FU-3,
  seo.md table K); the hero H1 itself stays for the owner. M, rank 1.
- **S-4 · The header has no flatmate entry** (ST-4). Nav = costs, check address, building reviews;
  the mobile pill goes to `/costs`. Add "Find a flatmate" → `/warsaw/roommate` first; point the
  mobile pill there; move "Building reviews" to the footer (agency and building reputation are out
  of focus, D48). S, rank 1.
- **S-5 · Frozen listings are promoted from every framing surface** (ST-3, PE-5, FU-6). Footer
  Product column (Lease Takeovers, Temporary Sublets, Post a Listing), hero pills, ForWhom cards,
  the home "how it works" tabs, the 404 "Browse listings" → `/warsaw/replacement`, the building
  page card "View listings in {district}" → `/warsaw/replacement?district=`, the dashboard
  "Browse listings". D5 says frozen and not promoted: re-point every one to the roommate page,
  the costs or the checker; the pages themselves stay reachable by URL. Removing the footer links
  to `/replacement`, `/sublet` and `/create-listing` is a navigation change under D5, the pages
  are not removed. M, rank 1.
- **S-6 · No cost surface links to the roommate page or the bot** (ST-4, FU-6, SE-8). Building
  pages, district pages, the `/warsaw` hub, the calculator result, the costs overview and the blog
  CTA lead only to the cost form. One shared callout "Renting this with someone? See the figures
  per person and find a flatmate" → `/warsaw/roommate` (and the bot link where the username is
  set) on the building page, the district page, the hub, the calculator result and the blog list
  and article; the bot link must not reuse `TelegramBotCta` (its `checker` namespace is kept off
  these routes). M, rank 1.
- **S-7 · No per-person figure next to the flatmate block** (FU-4). The thesis puts honest
  figures next to every step; the bot's roommate reply says "for two people about X each" (D61,
  D71), the website block shows only counts. Add the same line from the same loader (tenant
  group, all-in median of apartments with 2+ rooms in the area, half rounded to 10 zł, with N,
  labelled "half of the median flat"; absent when the rule has no figure), with a consistency
  test against the bot. M, rank 1.
- **S-8 · District pages for rooms and flatmates: extend `/[city]/[district]`, no new URLs**
  (SE-9, ST-9). Today the district page shows the D23 single number and the buildings. Add the
  district's room reference (both groups with N, city fallback labelled), the D71 per-person line
  and the honest count of active profiles naming the district (`loadRoommateCounts`, hourly cache),
  with the flatmate callout; serves "pokój Mokotów cena na osobę" and "współlokator Mokotów"
  without inventing a figure. M, rank 1.
- **S-9 · The checker's bot handoff is a 14 px muted link with no stated benefit** (FU-7, PE-4).
  Render it as a button (`min-h-11`) with one line naming what the bot does (figures, roommate
  profiles, the deposit letter in RU/UK), same payload and events. S, rank 2.
- **S-10 · Without the bot username the role tap shows nothing** (FU-5). `FindFlatmateBlock` and
  `TelegramBotCta` return `null`; the third role still fires its event and collapses into a chip.
  Hide the third role when the username is unset, or render the block with an honest "the bot is
  not connected yet" line; add the variable to the deploy checklist. S, rank 1.
- **S-11 · How-it-works, About and Help describe a marketplace with paid features** (ST-6, FU-9).
  "Three ways to find your next home", "message the current tenants", "promoted listings from 39
  PLN", "time-limited access to the cost-report database", while `/pricing` is a 404 and nothing
  is paid. Rewrite the home "how it works" to the bot's steps and the general answers to the
  thesis (drafts in FU-9); the payments answers mirror the terms and the cesja and sublet steps
  are frozen features: Open. M–L, rank 2.
- **S-12 · Dead-end forms** (ST-7, FU-11, FU-14). The home city-notify section ("we'll notify you
  when we launch", a second city is out of focus, D6), the roommate e-mail "save interest" card
  that competes with the bot (10 of 41 landings saw it, 0 saved; E13 counts it), and "I have a free
  room" → login wall → frozen listing form. All three collect personal data or lead to frozen
  flows; removing or re-targeting them is Open. S, rank 2.
- **S-13 · Sitemap and structured data favour frozen listings** (ST-8, SE-6, SE-7). `/replacement`
  0.7 above `/roommate` 0.5, active listings 0.8, a July sublet still indexed; the `WebSite`
  SearchAction points at `/warsaw/replacement`; the Instagram handle in the Organization schema
  (`passflat.com`) differs from the footer (`passflatapp`); the Article image is an SVG and the
  Article URL and breadcrumb names are not localised; blog entries lack `lastModified`. Raise the
  roommate priority, fix the schema and lastmod; dropping `/replacement`, `/sublet` and listing
  details from the sitemap or adding `noindex` is Open. S, rank 2.
- **S-14 · The Polish visitor's expectation** (ST-10, FU-10). PL third role "Szukam współlokatora
  do wynajmu" reads as the offer side; the PL block says the bot speaks EN/RU/UK without saying
  Polish is missing; chat links must carry `/ru` or `/uk` explicitly (no locale cookie). Fix the
  PL label and add a PL-only expectation clause; the posting kit uses prefixed links. S, rank 2.
- **S-15 · Two district navigations; the `/warsaw` hub is orphaned** (ST-9). Home district cards
  go to the costs map filter, the hub to the district pages; the hub is linked only from
  breadcrumbs. Point the home cards at `/warsaw/[district]` and link the hub from the footer. S,
  rank 3.

### B. Search metadata and content honesty

- **S-16 · About 20 templated title and CTA keys outside the honesty test still say "real"**
  (SE-3, FU-8). `costsSeo.buildingMetaTitle`, `districtMetaTitle/Description`, `cityMetaTitle`,
  `calculator.metaTitle/metaDescription`, `rentReport.metaTitle/metaDescription/ogTitle/lead`,
  `meta.homeTitle/homeDescription/aboutDescription/howItWorksDescription/blogDescription`,
  `landing.hero.costsCta` "See real costs", `landing.footer.tagline` "the full truth",
  `listings.demandCapture.costCtaTitle`, `about.values.principle1Desc` ("the market"). Add them to
  `REWRITTEN_KEYS`, add `really` to the EN scan, rewrite to "reported costs" wording in four
  locales (drafts in seo.md tables B, C, F, G, K and FU-8). S, rank 1.
- **S-17 · Blog frontmatter hard-codes "77 % … in full"; "real" wording in all 52 guide files**
  (SE-4, FU-12). The deposit and handover-protocol guides carry the old percentage in their
  descriptions in four locales; every guide ends on "check the building's real costs". Rewrite the
  frontmatter, replace the "real" family in the link sentences, add a frontmatter honesty test.
  S, rank 1.
- **S-18 · Title and description rewrites for the page-1 pages with CTR below 1 %** (SE-3,
  SE-10; metrics lever 3, H11). Meters guide (809 impressions, 0.9 %), hidden costs EN (806,
  0.4 %), data report EN (98, 0 %), calculator (375, 0.8 %), cesja (73, 0 %), deposit EN (59,
  0 %), no-agent EN (156, 1.3 %), occasional lease EN (128, 0 %). Four-locale drafts in seo.md
  tables D – J; the cesja guide's promise of tenant replacement is Open. S, rank 2.
- **S-19 · Nominative district and city names break Polish and Russian titles and H1s** (SE-5).
  "Wynajem w Mokotów", "w Warszawa": the district `nameKey` is inserted uninflected. Rephrase the
  templates so the name stands in the nominative ("Mokotów: czynsz i opłaty …"). S, rank 2.
- **S-20 · Guides have no entry to the roommate page or the bot** (FU-12, SE-8, SE-10). 13 guides ×
  4 locales end on a checker link; none mentions the bot, the roommate page or the flatmate
  agreement template. A shared end-of-article block with two links (check the address; find
  someone to rent with) and the template where it fits. M, rank 2.
- **S-21 · Blog details** (SE-10, SE-7). The cesja guide promises frozen tenant replacement (Open);
  raw `<a>` self-links open new tabs; `Article` JSON-LD uses the Polish URL for every locale;
  the breadcrumb name "Blog" is hard-coded. S, rank 2.
- **S-22 · robots and inherited metadata** (SE-11). `/api/og` is disallowed (link-preview images
  blocked for some crawlers); the disallow list has no locale prefixes for `/dashboard`,
  `/messages`, `/create-listing`, `/auth`; `/costs/submit` inherits the home title. S, rank 3.

### C. Performance, mobile and accessibility

- **S-23 · `/favicon.ico` and `/apple-touch-icon.png` return HTTP 500** (PE-1). The middleware
  matcher skips dotted paths, the `[locale]` layout's `generateMetadata` throws before
  `hasLocale` can `notFound()`. Add the icon files and guard `generateMetadata`. S, rank 1.
- **S-24 · Roommate page runs `supabase.auth.getUser()` and four queries per request** (PE-3).
  Live `private, no-store`, always MISS. Drop the server auth read (the header resolves auth on
  the client); measure TTFB after deploy. M, rank 2.
- **S-25 · The Supabase client (230 kB) loads on every page for anonymous visitors** (PE-6). The
  header creates the client in an effect on every route. Check a cheap local signal first and
  import the client lazily. M, rank 2.
- **S-26 · 67 – 103 kB of translation JSON on every page** (PE-7). `costs` (22.6 kB) and
  `listings` (16.2 kB) ship to blog, checker and building pages; RU/UK pay the most. Scope them to
  their routes like `checker`; mind the roommate block's `listings` keys. M, rank 2.
- **S-27 · `/api/og` is rendered on every fetch** (PE-8). 120 – 148 kB PNG with `max-age=0`,
  MISS every time; chat links are a named entry. Set a cache header. S, rank 2.
- **S-28 · Security headers: only HSTS** (PE-9). Add `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`; a CSP is a later L task. S, rank 2.
- **S-29 · The lime accent is used as text at 1.63:1, including the hero figures** (PE-10); the
  hero source line "Tenant reports (N)" is 11 px at about 4.4:1. Figures → foreground, badge and
  link text → primary, source line → `text-xs`. S, rank 2.
- **S-30 · Tap targets below 44 px and a stateless hamburger** (PE-11). Hamburger 32 px with an
  English `aria-label` and no `aria-expanded`; mobile pill, language and cookie buttons `h-8`;
  costs list/map toggle about 28 px. S, rank 2.
- **S-31 · Labels, locale and headings** (PE-12, PE-13, PE-14). The checker's address input and
  the city-notify inputs have no programmatic label; the cookie banner's privacy link ignores the
  locale; heading levels skip (h1 → h3/h4); no skip link. S, rank 3.
- **S-32 · Hygiene** (PE-15, PE-16, PE-17). The mono font is preloaded on every page; a dead
  `MDXRemote` import and a regex markdown renderer in the blog client; unreferenced 1.1 MB and
  1.45 MB PNGs in `public/`. S, rank 3.

### D. Copy consistency

- **S-33 · The four locales claim different template languages** (FU-13). EN "Polish and English",
  PL "po polsku", RU "на польском и русском", UK "польською та українською"; the files are Polish
  originals with EN, RU and UK versions. One sentence in four locales. S, rank 2.
- **S-34 · Small inconsistencies** (FU-15, FU-16, FU-17, ST-12). «ты»/«вы» mix on the roommate
  page (the consent note is consent text: Open); "The data is open — free, no account" against
  "unlock" gates (Open); footer "expanding across Europe" (D6; Open); dead message keys
  (`landing.hero.trustVerified*`, `browseCta`, `footer.pricing|careers|support|cookies`). S,
  rank 3.
- **S-35 · Live-only honesty leftovers fixed on the branch** (ST-11). "Przeglądaj zweryfikowane
  oferty", "77 % zwrot", "сколько платят жильцы", unsplit building figures. A deploy, not a task:
  list them in the PRD 1 deploy's copy-review checklist. S, rank 3.

## Table of findings

| ID   | Title                                                         | Route                                              | Appendix ids           | Size | Rank | PRD 4              |
| ---- | ------------------------------------------------------------- | -------------------------------------------------- | ---------------------- | ---- | ---- | ------------------ |
| S-1  | Flatmate block hidden behind a tap; frozen shell first        | `/warsaw/roommate`                                 | ST-2, FU-1, SE-2       | S    | 1    | M1 FR-1            |
| S-2  | Roommate metadata, H1, landmarks, `h-dvh`, footer             | `/warsaw/roommate`                                 | ST-5, FU-2, SE-1, PE-2 | S    | 1    | M1 FR-2, FR-3      |
| S-3  | Home never states the thesis; no bot entry                    | `/`                                                | ST-1, FU-3             | M    | 1    | M2 FR-8, FR-9      |
| S-4  | Header has no flatmate entry                                  | all                                                | ST-4                   | S    | 1    | M1 FR-4            |
| S-5  | Frozen listings promoted everywhere                           | `/`, 404, building, dashboard                      | ST-3, PE-5, FU-6       | M    | 1    | M1 FR-5, FR-6      |
| S-6  | No cost surface links to the roommate page or the bot         | building, district, hub, calculator, blog          | ST-4, FU-6, SE-8       | M    | 1    | M2 FR-10           |
| S-7  | No per-person figure next to the flatmate block               | `/warsaw/roommate`                                 | FU-4                   | M    | 1    | M2 FR-11           |
| S-8  | District pages: room reference, per-person line, counts       | `/[city]/[district]`                               | SE-9, ST-9             | M    | 1    | M3 FR-19           |
| S-9  | Checker bot handoff is a muted link                           | `/warsaw/check`                                    | FU-7, PE-4             | S    | 2    | M2 FR-12           |
| S-10 | Role tap shows nothing without the bot username               | `/warsaw/roommate`                                 | FU-5                   | S    | 1    | M1 FR-7            |
| S-11 | How-it-works, About, Help describe a marketplace              | `/`, `/how-it-works`, `/about`, `/help`            | ST-6, FU-9             | M–L  | 2    | M2 FR-13; Open Q-3 |
| S-12 | Dead-end forms (city notify, e-mail card, free room)          | `/`, `/warsaw/roommate`                            | ST-7, FU-11, FU-14     | S    | 2    | Open Q-2, Q-4      |
| S-13 | Sitemap and structured data favour frozen listings            | `/sitemap.xml`, JSON-LD                            | ST-8, SE-6, SE-7       | S    | 2    | M3 FR-20; Open Q-1 |
| S-14 | Polish visitor's expectation; chat links need the locale      | `/warsaw/roommate`, posting kit                    | ST-10, FU-10           | S    | 2    | M2 FR-14           |
| S-15 | Two district navigations; hub orphaned                        | `/`, `/warsaw`                                     | ST-9                   | S    | 3    | M1 FR-6            |
| S-16 | Templated "real" titles outside the honesty test              | building, district, city, calculator, report, home | SE-3, FU-8             | S    | 1    | M3 FR-15           |
| S-17 | Blog frontmatter "77 % in full"; "real" in 52 files           | `/blog/*`                                          | SE-4, FU-12            | S    | 1    | M3 FR-16           |
| S-18 | Title rewrites for page-1 pages with CTR < 1 %                | guides, calculator, report                         | SE-3, SE-10            | S    | 2    | M3 FR-17           |
| S-19 | Nominative district and city names in titles                  | `/[city]/[district]`, calculator                   | SE-5                   | S    | 2    | M3 FR-15           |
| S-20 | Guides: no entry to the roommate page or the bot              | `/blog/[slug]`                                     | FU-12, SE-8, SE-10     | M    | 2    | M2 FR-10           |
| S-21 | Blog details: cesja promise, raw links, non-localised JSON-LD | `/blog/*`                                          | SE-10, SE-7            | S    | 2    | M3 FR-18, FR-20    |
| S-22 | robots blocks `/api/og`; inherited metadata                   | `/robots.txt`, `/costs/submit`                     | SE-11                  | S    | 3    | M3 FR-20           |
| S-23 | `/favicon.ico` and apple icon return 500                      | all                                                | PE-1                   | S    | 1    | M4 FR-21           |
| S-24 | Roommate page auth call and queries per request               | `/warsaw/roommate`                                 | PE-3                   | M    | 2    | M4 FR-25           |
| S-25 | Supabase client on every page                                 | all                                                | PE-6                   | M    | 2    | M4 FR-26           |
| S-26 | 67 – 103 kB i18n JSON on every page                           | all                                                | PE-7                   | M    | 2    | Later              |
| S-27 | `/api/og` uncached                                            | link previews                                      | PE-8                   | S    | 2    | M4 FR-22           |
| S-28 | Security headers absent                                       | all                                                | PE-9                   | S    | 2    | M4 FR-23           |
| S-29 | Accent lime as text 1.63:1                                    | `/`                                                | PE-10                  | S    | 2    | M4 FR-24           |
| S-30 | Tap targets < 44 px; hamburger aria                           | header, banner, `/warsaw/costs`                    | PE-11                  | S    | 2    | M4 FR-24           |
| S-31 | Labels, banner locale, heading order, skip link               | checker, `/`, all                                  | PE-12 – PE-14          | S    | 3    | M4 FR-27           |
| S-32 | Fonts preload, dead MDX import, unreferenced PNGs             | all, blog                                          | PE-15 – PE-17          | S    | 3    | Later              |
| S-33 | Template languages differ per locale                          | `/`                                                | FU-13                  | S    | 2    | M2 FR-13           |
| S-34 | «ты»/«вы», "open" vs "unlock", "expanding", dead keys         | roommate, `/`, footer                              | FU-15 – FU-17, ST-12   | S    | 3    | Later; Open        |
| S-35 | Live-only honesty leftovers (deploy checklist)                | live                                               | ST-11                  | S    | 3    | M5 FR-30           |

## What was checked and found fine

Locale routing and the switcher; hreflang and x-default in HTML, `Link` header and sitemap; the
honesty rewrite of PRD 1 and the D40 interest copy on the branch; every figure surface labelled
with group and N; the room money block on the figure contract with a bot consistency test; the
role selector's events, mobile layout and tap targets; the checker CTA's payload and events;
protected routes and `robots` disallows; Mapbox and Google Places on demand; static assets
immutable and Brotli; real 404s with `noindex`; `MotionConfig reducedMotion="user"`; 16 px inputs
on phones; the sticky CTA clearing the cookie banner; muted text and primary links at AA contrast;
key parity of every quoted key. Details per area in the appendix.
