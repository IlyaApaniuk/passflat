# Performance, mobile and accessibility

Audited 2026-11-19 against branch `chore/agent-harness` (build `GDLuCdkRgAgKIVPiR_FST`, `.next` built 22:45) and the live site https://passflat.com, which still runs pre-PRD-1 code. Every live number below describes production as it is today; every bundle number describes the branch build. `lighthouse` is not installed, no server was started and nothing was built: judgements that would normally come from a Lighthouse run are marked "judgement".

## Verdict

The site is in reasonable technical shape for a Next.js app of this size: pages compress to 35–62 kB of HTML on the wire, static chunks are immutable and Brotli-compressed, the 1.7 MB Mapbox chunk is loaded only on demand everywhere it is used, fonts are self-hosted with a size-adjusted fallback, and every unknown route returns a real 404. The thesis-critical paths are where it falls short. The roommate page, the main Google landing page, is rendered on every request with a Supabase auth call, has no `<main>`, no `<h1>` and a `100vh` app-shell layout that mobile browsers cut off; the checker's handoff into the Telegram bot is a 14 px muted text link; the 404 page sends people to the frozen listings; every browser's automatic `/favicon.ico` request returns HTTP 500; link-preview images for chat links are rendered on every fetch with no CDN caching; the lime accent (#8bde54) is used as text for the hero figures at 1.6:1 contrast; and 67–103 kB of translation JSON plus a 230 kB Supabase chunk ride along on every page for the logged-out majority. All of these are one-task fixes; none needs a new dependency.

## Measurements

### Per-route JavaScript (branch build, uncompressed bytes of the `<script src>` chunks in the prerendered HTML)

Command: `python3 -I analyze_routes.py` over `.next/server/app/**/*.html` and `.next/static/chunks`. Routes without a prerendered HTML file (roommate, building, check, costs) render on demand; their script count comes from the live HTML and their chunk sizes cannot be read from this build.

| Route                                    | Scripts   | JS (kB) | CSS (kB) | Fonts preloaded | Notes                                              |
| ---------------------------------------- | --------- | ------- | -------- | --------------- | -------------------------------------------------- |
| `/_not-found` (root)                     | 10        | 802.8   | 212.4    | 0               | root main 634.0 + polyfill 110.0 + runtime         |
| `/` (pl, en)                             | 21        | 1459.2  | 216.3    | 4               | supabase 229.9, sonner 80.1, framer/vercel 41.7    |
| `/blog/przepisanie-licznikow-najem` (pl) | 21        | 1432.3  | 216.3    | 4               | same shared set + 9.3 kB route chunk               |
| `/warsaw/roommate`                       | 26 (live) | n/a     | —        | 0 (live)        | Mapbox chunk via `dynamic(..., {ssr:false})`       |
| `/warsaw/building/wolska-96`             | 21 (live) | n/a     | —        | 0 (live)        | date-fns + 4 locales statically imported           |
| `/warsaw/check`                          | 21 (live) | n/a     | —        | 0 (live)        | Google Places script injected on demand            |
| `/warsaw/costs`                          | 23 (live) | n/a     | —        | 0 (live)        | Mapbox via `lazy()` only when `viewMode === 'map'` |

Shared on every page (root main files): `03ow1_zwhvzk6.js` 229.2 kB (react-dom + posthog glue), `0c_mmj72ld~b0.js` 183.4 kB (posthog-js), `0-f2-2ydf7gdi.js` 138.5 kB, `0zjs5hlwbvch9.js` 43.9 kB, `0e04x6.faf19c.js` 28.7 kB, runtime 10.4 kB = 634.0 kB; polyfill `03~yq9q893hmn.js` 110.0 kB. Total static JS 74 chunks, 4608.9 kB; CSS 256.1 kB (global 212.4 kB, mapbox 39.8 kB, 3.9 kB).

### Largest chunks and what pulls them in (signature grep inside the chunk)

| kB            | Chunk              | Library                    | Loaded on                                                           |
| ------------- | ------------------ | -------------------------- | ------------------------------------------------------------------- |
| 1724.0        | `11~xn8.4hhv1t.js` | mapbox-gl (160 hits)       | on demand only (costs map tab, listings map, POI map)               |
| 229.9         | `10qh2yobkas3s.js` | @supabase (132 hits)       | every page, via `Header` (`src/components/landing/header.tsx:56`)   |
| 229.2 / 183.4 | root main          | posthog-js                 | every page, initialised before hydration (`instrumentation-client`) |
| 131.5         | `11pq07ki769j3.js` | unidentified shared        | every page                                                          |
| 113.4         | `11rcrj87qyfpw.js` | date-fns                   | building page and others                                            |
| 99.7          | `024s6c8ovnq4h.js` | framer-motion + dnd-kit    | create-listing (frozen)                                             |
| 80.1          | `0f76w5d3.do4d.js` | sonner (115 hits) + radix  | every page (`Toaster` in the locale layout)                         |
| 56.6          | `0e4cqdv6g~5v4.js` | radix + Google Places glue | checker / address forms                                             |

### Live HTML and headers (GET with a mobile Safari UA, `Accept-Language: pl`; `python3 -I live_probe.py`)

| Page                                | Status | HTML raw / on wire (br) | Non-script HTML | Cache-Control                                             | X-Vercel-Cache        | Prerender                        |
| ----------------------------------- | ------ | ----------------------- | --------------- | --------------------------------------------------------- | --------------------- | -------------------------------- |
| `/`                                 | 200    | 298.7 / 46.0 kB         | 91.0 kB         | `public, max-age=0, must-revalidate`                      | HIT                   | yes                              |
| `/ru`                               | 200    | 339.0 / 51.8 kB         | 92.8 kB         | same                                                      | HIT                   | yes                              |
| `/warsaw/roommate`                  | 200    | 227.9 / 38.4 kB         | 108.6 kB        | `private, no-cache, no-store, max-age=0, must-revalidate` | MISS                  | no                               |
| `/ru/warsaw/roommate`               | 200    | 261.4 / 43.9 kB         | 109.9 kB        | private, no-store                                         | MISS                  | no                               |
| `/warsaw/building/wolska-96`        | 200    | 169.0 / 37.5 kB         | 48.8 kB         | private, no-store                                         | MISS                  | no (branch: `revalidate = 3600`) |
| `/warsaw/check`                     | 200    | 146.1 / 34.5 kB         | 15.7 kB         | private, no-store                                         | MISS                  | no                               |
| `/blog/przepisanie-licznikow-najem` | 200    | 158.9 / 36.9 kB         | 22.9 kB         | public, max-age=0, must-revalidate                        | HIT (age 1 259 151 s) | yes                              |
| `/warsaw/costs`                     | 200    | 352.7 / 62.3 kB         | 103.5 kB        | private, no-store                                         | MISS                  | no                               |

Common to all pages: `content-encoding: br` (gzip fallback works: home 53.8 kB); `Link` header with 5 hreflang alternates, 300–459 characters; `strict-transport-security: max-age=63072000`; `vary: rsc, next-router-state-tree, …`. Absent on every page: `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`.

| Asset                                          | Status  | Size          | Cache-Control                                                                   |
| ---------------------------------------------- | ------- | ------------- | ------------------------------------------------------------------------------- |
| `/_next/static/chunks/0zjs5hlwbvch9.js`        | 200     | 9.7 kB br     | `public,max-age=31536000,immutable`                                             |
| `/icon.svg`                                    | 200     | 541 B         | `public, max-age=0, must-revalidate`                                            |
| `/logo.png` (public/, unreferenced in `src/`)  | 200     | 1 121 395 B   | `public, max-age=0, must-revalidate`                                            |
| `/linkedin-banner.png` (public/, unreferenced) | 200     | 1 452 778 B   | same                                                                            |
| `/api/og?title=…` (og:image of `/`)            | 200     | 145 763 B PNG | `public, max-age=0, must-revalidate`, X-Vercel-Cache MISS, age 0 on every fetch |
| `/favicon.ico`                                 | **500** | 10 620 B HTML | `public, max-age=0, must-revalidate`                                            |
| `/apple-touch-icon.png`                        | **500** | 10 620 B HTML | same                                                                            |

404 probes (`/warsaw/building/does-not-exist-xyz`, `/nonexistent-page`, `/ru/nonexistent-page`, `/nocity/costs`, `/warsaw/district/does-not-exist-xyz`, `/listing/does-not-exist-xyz`, `/warsaw/roommate/does-not-exist`): all return HTTP 404, title "Nie znaleziono strony — Passflat" / "Страница не найдена — Passflat", `private, no-store`, 115–151 kB HTML. No soft 404 found.

### Live DOM facts per page (scripts stripped; `python3 -I live_probe2.py`)

| Page                         | header/main/footer/nav | First headings                 | `<label>` / inputs                            | aria-expanded | Skip link |
| ---------------------------- | ---------------------- | ------------------------------ | --------------------------------------------- | ------------- | --------- |
| `/`                          | 1/1/1/1                | h1 → h2 → h2 → h3×12           | 1 / 3 (email + city inputs: placeholder only) | 7             | no        |
| `/warsaw/roommate`           | 1/**0**/**0**/1        | **h2 "Filtry"** → h3×7, no h1  | 43 / 54                                       | 11            | no        |
| `/warsaw/building/wolska-96` | 1/1/1/1                | h1 → **h3** → h3 → h4 (footer) | 0 / 0                                         | 1             | no        |
| `/warsaw/check`              | 1/1/1/1                | h1 → **h4** (footer)           | 1 (not associated) / 1                        | 1             | no        |
| blog post                    | 1/1/1/1                | h1 → h2×6 → h4 (footer)        | 0 / 0                                         | 1             | no        |
| `/warsaw/costs`              | 1/1/1/1 (+aside)       | h1 → h3×n                      | 0 / 2                                         | 2             | no        |

Viewport on every page: `width=device-width, initial-scale=1, viewport-fit=cover`; `<html lang>` = pl/ru per locale; header `fixed top-0 z-50`, content offset `pt-24` (96 px) against a header of 16+12+32+12+16 = 88 px (judgement from classes). `img` tags: 0 on all six pages (icons are inline SVG), so no missing `alt`/dimensions. `text-[9px]`–`text-[11px]` occurrences: home 12, building 14.

### Translation JSON inlined into every page (`pickMessages(messages, SHARED_CLIENT_NAMESPACES)`, compact JSON; `python3 -I messages_size.py`)

| Locale | Shipped to the client | Full catalog |
| ------ | --------------------- | ------------ |
| pl     | 72.8 kB               | 145.4 kB     |
| en     | 67.0 kB               | 133.0 kB     |
| ru     | 102.9 kB              | 215.0 kB     |
| uk     | 102.7 kB              | 212.7 kB     |

Biggest namespaces (pl): `costs` 22.6 kB, `listings` 16.2 kB, `landing` 12.0 kB, `dashboard` 4.2 kB, `auth` 2.2 kB; the remaining 16 namespaces total 13.8 kB.

### Fonts (branch build)

`Manrope` subsets latin + latin-ext + cyrillic and `JetBrains Mono` latin via `next/font/google` (`src/app/[locale]/layout.tsx:23-28`), default `display: swap` with size-adjusted fallback. Four woff2 files are `<link rel="preload" as="font">` on every prerendered page regardless of locale: 39.5 + 23.9 + 14.9 + 14.0 = 92.3 kB. Live dynamic pages show 0 font preloads (pre-PRD-1; not verifiable for the branch without a server).

### Colour contrast (WCAG 2.x, computed from the oklch tokens in `src/app/globals.css`; `python3 -I contrast.py`)

| Pair                                                                 | sRGB                         | Ratio           | Result                                             |
| -------------------------------------------------------------------- | ---------------------------- | --------------- | -------------------------------------------------- |
| foreground on background                                             | #05070b on #fdfdfd           | 19.83:1         | AA                                                 |
| muted-foreground on background                                       | #52555b on #fdfdfd           | 7.33:1          | AA                                                 |
| muted-foreground on card / secondary                                 |                              | 7.44:1 / 6.72:1 | AA                                                 |
| muted-foreground/80 on background (hero source line, `hero.tsx:193`) | ≈#747780                     | ≈4.4:1          | **fails AA at 11 px**                              |
| primary on background (links)                                        | #0036ff (clipped from gamut) | 6.97:1          | AA                                                 |
| white on primary (buttons)                                           |                              | 7.07:1          | AA                                                 |
| accent-foreground on accent (mobile "costs" pill)                    | #05070b on #8bde54           | 12.17:1         | AA                                                 |
| **accent as text on background** (`text-accent`)                     | #8bde54 on #fdfdfd           | **1.63:1**      | **fails**                                          |
| white on accent                                                      |                              | 1.65:1          | fails (not used for text, checked)                 |
| border on background                                                 | #dfe1e5 on #fdfdfd           | 1.29:1          | below 3:1 for non-text; outline buttons rely on it |

## Findings

### PE-1. `/favicon.ico` and `/apple-touch-icon.png` return HTTP 500

- **What**: Two paths every browser or iOS share sheet requests on its own return a 10.6 kB 500 page instead of an icon or a 404.
- **Where**: live `https://passflat.com/favicon.ico`; `src/app/layout.tsx:8-11` (icons point at `/icon.svg` only), `src/middleware.ts:142` (matcher excludes dotted paths, so `[locale]` receives `favicon.ico`), `src/app/[locale]/layout.tsx:34-36` (`generateMetadata` calls `getTranslations('meta')` before the `hasLocale` guard at line 65).
- **Evidence**: `GET /favicon.ico → 500, text/html, 10620 B`; `GET /apple-touch-icon.png → 500`; `/nonexistent-page → 404`. Likely cause (judgement): an unknown locale segment makes next-intl throw inside `generateMetadata` before the layout body can call `notFound()`.
- **Why it matters for the thesis**: one guaranteed 5xx per first visit from any browser, a serverless invocation each time, noise in error logs, and a missing home-screen icon for Telegram in-app-browser users who save the page.
- **Proposed change**: add `public/favicon.ico` and `src/app/apple-icon.png` (Next convention) or extend `metadata.icons.apple` to a PNG; in `src/app/[locale]/layout.tsx` guard `generateMetadata` with `hasLocale(routing.locales, locale)` → `notFound()` so unknown first segments 404. Verify locally with `curl -I`.
- **Size**: S. **Rank**: 1.

### PE-2. Roommate page: `100vh` app shell with no `<main>`, no `<h1>`, no footer

- **What**: The thesis's main Google landing page is laid out as a fixed-height app (`h-screen overflow-hidden`), its first heading is the filter sidebar's "Filtry", and it has no `main` landmark or footer.
- **Where**: `src/components/listings/listings-page-client.tsx:256` (`flex h-screen flex-col overflow-hidden pt-24`), the whole file (no `<main>`, no `<h1>`); live DOM table above.
- **Evidence**: live `/warsaw/roommate`: main 0, footer 0, headings start at h2 "Filtry"; `h-screen` = `100vh`, which on iOS Safari and Chrome Android with the toolbar visible exceeds the visible viewport, so the bottom of the inner list (and the last offer or block) sits under the toolbar (judgement; standard dvh issue).
- **Why it matters for the thesis**: a mobile visitor from Google lands on "Filtry", the FindFlatmate block and the room-money block scroll inside a clipped pane, and the page has no heading that names what it is.
- **Proposed change**: `h-screen` → `h-dvh` (Tailwind 4 ships it); wrap the content column in `<main>`; render an `h1` with the existing `listings.titleRoommate` message in the top bar (visually small or `sr-only` if the design must stay); give the filter sidebar heading `h2` → keep, now correctly nested. No new copy.
- **Size**: S. **Rank**: 1.

### PE-3. Roommate page runs `supabase.auth.getUser()` and four DB queries per request, uncached

- **What**: The page is dynamic (`searchParams`) and additionally reads auth cookies and calls Supabase Auth on every request, only to pass `isLoggedIn` to the favourites hook.
- **Where**: `src/app/[locale]/[city]/roommate/page.tsx:63-68, 86-89`; consumer `listings-page-client.tsx:109` (`useFavorites(isLoggedIn)`).
- **Evidence**: live `cache-control: private, no-cache, no-store`, `x-vercel-cache: MISS`, `age: 0` on every fetch, 228–261 kB HTML. The header already resolves auth on the client for every page.
- **Why it matters for the thesis**: TTFB on the one page where mobile Google traffic arrives cold includes a Supabase Auth round-trip plus Prisma queries on a Vercel function in fra1; every crawler hit does the same.
- **Proposed change**: drop the server auth read; let `useFavorites` resolve the session on the client the way `Header` does (or accept `isLoggedIn` from the header's state). Keep `searchParams` for now; measure TTFB in Vercel Speed Insights after deploy. A later task may move the URL-filter parsing fully to the client and set `revalidate = 300` on the page.
- **Size**: M. **Rank**: 2.

### PE-4. The checker's Telegram handoff is a 14 px muted text link

- **What**: The highest-intent moment on the site (an address was just checked) hands over to the bot through an inline link styled `text-sm text-muted-foreground`.
- **Where**: `src/components/costs/telegram-bot-cta.tsx:37-50`.
- **Evidence**: className `mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:…`; rendered height ≈ 20 px, far below 44 px; contrast 7.3:1 is fine, salience is not. Compare `find-flatmate-block.tsx:59` where the same handoff is a `Button` with `min-h-11`.
- **Why it matters for the thesis**: the checker is one of the named entries into the bot; the bot is where matching happens.
- **Proposed change**: render the anchor with `buttonVariants()` (default or outline) and `h-auto min-h-11 whitespace-normal`, same href, same `telegram_bot_opened` event, same `checker.costs.telegramCta` copy. No new copy.
- **Size**: S. **Rank**: 1.

### PE-5. 404 page sends visitors to the frozen listings

- **What**: The locale 404 offers "home" and a "browse" button that links to `/warsaw/replacement`.
- **Where**: `src/app/[locale]/not-found.tsx:54` (`href={`/${DEFAULT_CITY}/replacement`}`), copy `errors.notFound.browse` in the four message files.
- **Evidence**: code above; live 404s all return status 404 (good) but the live page is the older design without landmarks.
- **Why it matters for the thesis**: 954 building URLs are in the sitemap and buildings get merged or renamed; a dead building link from Google should land on the checker or the roommate page, not on a frozen listing search.
- **Proposed change**: second button → `/${DEFAULT_CITY}/check` (or `/roommate`), rename `errors.notFound.browse` to a check-the-address label in pl/en/ru/uk; keep status 404. Optionally a third link to `/warsaw/roommate`.
- **Size**: S. **Rank**: 1.

### PE-6. Supabase client (229.9 kB) loads on every page for logged-out visitors

- **What**: `Header` creates a Supabase browser client and calls `getUser()` in an effect on every route; nearly every visitor is anonymous.
- **Where**: `src/components/landing/header.tsx:8, 55-76`.
- **Evidence**: chunk `10qh2yobkas3s.js` 229.9 kB (132 `supabase` signatures) is in the script list of `/`, the blog post and the root 404 fallback set; it is the second-largest chunk after Mapbox.
- **Why it matters for the thesis**: ~230 kB (≈60 kB on the wire, judgement) of parse/execute on a mid-range Android before the header's login state settles, on pages whose job is to show one figure or one button.
- **Proposed change**: in the effect, check a cheap local signal first (a `sb-*-auth-token` cookie or localStorage key, matching the server's check in `costs/page.tsx:145`); only then `await import('@/lib/supabase/client')`; otherwise `setLoading(false)` immediately. `handleSignOut` imports the client the same lazy way.
- **Size**: M. **Rank**: 2.

### PE-7. 67–103 kB of translation JSON on every page

- **What**: 21 namespaces are inlined into the RSC payload of every route, including `costs` (22.6 kB) and `listings` (16.2 kB) on the blog, checker and building pages, and `dashboard`/`auth`/`account`/`pricing`/`contact`/`chat` for anonymous visitors.
- **Where**: `src/i18n/messages.ts:38-67`, `src/app/[locale]/layout.tsx:78-79`.
- **Evidence**: table above; blog post HTML 158.9 kB of which 22.9 kB is page content; ru/uk pay 103 kB (plus hydration of the same object).
- **Why it matters for the thesis**: RU/UK visitors from Telegram pay the most; every page carries ~50 kB of strings it never reads.
- **Proposed change**: move `costs` and `listings` to scoped `NextIntlClientProvider`s on their own routes (the pattern the file comment already prescribes for `privacy`, `help` etc.); the header reads `common.*` only. Verify with `messages.test.ts` and `client-namespaces.test.ts`.
- **Size**: M. **Rank**: 2.

### PE-8. Link-preview images are rendered on every fetch

- **What**: `/api/og` (edge runtime) returns a 120–148 kB PNG with `max-age=0, must-revalidate`; Vercel reports MISS on each fetch.
- **Where**: `src/app/api/og/route.tsx` (no `Cache-Control` set; `runtime = 'edge'`).
- **Evidence**: four distinct og:image URLs fetched twice each with a bot UA: status 200, `x-vercel-cache: MISS`, `age: 0` every time.
- **Why it matters for the thesis**: chat links in Telegram/WhatsApp are a named entry; each share re-renders the card, and a popular link in a group becomes repeated edge compute.
- **Proposed change**: return the `ImageResponse` with `headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' }`.
- **Size**: S. **Rank**: 2.

### PE-9. Security headers: only HSTS

- **What**: No `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`/`frame-ancestors`, no CSP.
- **Where**: `next.config.mjs` (no `headers()`), live headers of all six pages.
- **Evidence**: header table above.
- **Why it matters for the thesis**: trust and clickjacking protection for a site that asks people to type addresses and will hand them to a bot; `Referrer-Policy` also stops full URLs (with `?ref=`) leaking to Mapbox/Google.
- **Proposed change**: add `headers()` with `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` (no `geolocation` use found in `src/`). A CSP is a separate L task (PostHog EU, Mapbox, Google Maps, GA, inline JSON-LD) and should start report-only.
- **Size**: S. **Rank**: 2.

### PE-10. Accent lime used as text (1.63:1) including the hero figures

- **What**: `text-accent` (#8bde54) colours text on near-white: the hero stat values, hero/FAQ/check-address badges, cost-transparency card values and links, bento and tools links.
- **Where**: `src/components/landing/hero.tsx:125,188`, `cost-transparency-card.tsx:135,142,156,174`, `faq.tsx:22`, `bento-grid.tsx:120`, `tools.tsx:68`, `check-address.tsx:36`.
- **Evidence**: computed 1.63:1 (AA needs 4.5:1, large text 3:1). The hero source line "Tenant reports (N)" is `text-[11px] text-muted-foreground/80` ≈ 4.4:1 (`hero.tsx:193`).
- **Why it matters for the thesis**: the figure and its group+N label are the honesty surface; both are the least legible text on the landing page, especially outdoors on a phone.
- **Proposed change**: figure values → `text-foreground`; badge/link text → `text-primary` (6.97:1); icons may stay accent. Source line → `text-xs text-muted-foreground` (7.3:1). No copy change.
- **Size**: S. **Rank**: 2.

### PE-11. Tap targets below 44 px in the header, banner and costs toolbar; hamburger without state

- **What**: Hamburger `w-8 h-8` (32 px) with hard-coded English `aria-label="Toggle menu"`, no `aria-expanded`/`aria-controls`; mobile "costs" pill `size="sm"` (h-8, 32 px); mobile language buttons h-8 `text-xs`; cookie banner Accept/Decline h-8; costs list/map toggle `py-1.5 text-xs` (~28 px); sort select h-9 and map toggle `size="icon"` (36 px).
- **Where**: `header.tsx:237-266, 295-308`; `cookie-consent.tsx:155-160`; `costs/client.tsx:490-500`; `listings-page-client.tsx:202, 294`.
- **Evidence**: `button.tsx:25` `sm: 'h-8'`, `icon: 'size-9'`; the role selector and bot buttons already use `min-h-11` (good).
- **Why it matters for the thesis**: the header pill is the one-tap route to `/costs` for mobile social traffic; mis-taps on 32 px controls are the common failure on phones.
- **Proposed change**: `min-h-11 min-w-11` on these controls (`h-auto` where needed); `aria-expanded={mobileMenuOpen}`, `aria-controls="mobile-menu"`, `id="mobile-menu"` on the panel, aria-label from a new `common.menu` key in the four locales.
- **Size**: S. **Rank**: 2.

### PE-12. Form inputs without programmatic labels

- **What**: The checker's address input has a visible `<Label>` without `htmlFor` and an `<Input>` without `id`; the city-notify email and city inputs have placeholders only.
- **Where**: `src/components/buildings/address-intake.tsx:65-74`, `src/components/listings/address-autocomplete.tsx:269-283`, `src/components/landing/city-notify.tsx:87-102`.
- **Evidence**: live `/warsaw/check`: 1 label, 1 input, no `for`/`id` pairing; live `/`: 1 label (consent checkbox) for 3 inputs.
- **Why it matters for the thesis**: the address field is the checker; a screen reader announces it as an unlabelled edit field. Also a Lighthouse accessibility deduction.
- **Proposed change**: `AddressAutocomplete` accepts `id`; `AddressIntake` passes it and sets `htmlFor`; city-notify inputs get `aria-label` from the existing placeholder messages (no new copy).
- **Size**: S. **Rank**: 3.

### PE-13. Cookie banner "learn more" ignores the locale

- **What**: The banner links to `href="/privacy"` (plain `<a>`), so ru/uk/en visitors land on the Polish policy.
- **Where**: `src/components/cookie-consent.tsx:150`.
- **Evidence**: code; `detectLocale` is already computed two lines above.
- **Why it matters for the thesis**: RU/UA visitors from Telegram are the audience; the banner is the first thing they tap on.
- **Proposed change**: `href={locale === 'pl' ? '/privacy' : `/${locale}/privacy`}` (or `Link` from `@/i18n/navigation`). Banner copy stays in the component by design.
- **Size**: S. **Rank**: 3.

### PE-14. Heading order and skip link

- **What**: Building page h1 → h3; checker h1 → h4; the footer's column titles are `h4` on every page; no skip-to-content link anywhere.
- **Where**: `src/components/landing/footer.tsx` (column `h4`s), `building/[slug]/client.tsx`, `check/client.tsx`.
- **Evidence**: live DOM table.
- **Why it matters for the thesis**: minor; screen-reader navigation and Lighthouse a11y score.
- **Proposed change**: footer column titles → `h2` (styled as now) or `p` with `aria-hidden` plus `aria-label` on the `nav`s; card titles that follow the `h1` → `h2`; add `<a href="#main" class="sr-only focus:not-sr-only …">` in the locale layout with `common.skipToContent` in four locales and `id="main"` on each page's `main`.
- **Size**: S. **Rank**: 3.

### PE-15. Fonts: 92 kB preloaded on every page regardless of locale

- **What**: Four woff2 files are preloaded on every page; a Polish page preloads the Cyrillic subset and the mono face; mono is used only for figures and never on the LCP path.
- **Where**: `src/app/[locale]/layout.tsx:23-28`.
- **Evidence**: 4 `<link rel="preload" as="font">` = 92.3 kB in `pl.html`, `en.html`, `ru.html`.
- **Why it matters for the thesis**: preloads compete with the first chunks on a 3G/4G phone; the gain is small but free.
- **Proposed change**: `JetBrains_Mono({ …, preload: false })`. Per-locale subset preloading would need two `Manrope` declarations and is not worth it (judgement).
- **Size**: S. **Rank**: 3.

### PE-16. Dead MDX path in the blog client and a hand-rolled markdown renderer

- **What**: `BlogArticle` imports `MDXRemote` from `next-mdx-remote`, but nothing in `src/` ever sets `mdxSource`; the guides render through a regex markdown converter in the client bundle that supports no tables (so guides cannot carry comparison tables).
- **Where**: `src/app/[locale]/blog/[slug]/client.tsx:7, 99-104, 128-180`; `package.json:95`.
- **Evidence**: `grep mdxSource src` finds only the client; `src/lib/blog.ts` has no `serialize`.
- **Why it matters for the thesis**: dead bytes on every guide view; and the renderer's limits shape what guides can say.
- **Proposed change**: remove the `MDXRemote` branch and the dependency (knip may then flag it), or render the markdown on the server in `page.tsx` so the client receives HTML only. Keep output identical; the e2e snapshot of one guide is the check.
- **Size**: S. **Rank**: 3.

### PE-17. Unreferenced 1.1 MB and 1.45 MB PNGs in `public/`

- **What**: `public/logo.png` (1 121 395 B) and `public/linkedin-banner.png` (1 452 778 B) are deployed and served with `max-age=0`; no `src/` reference uses them.
- **Where**: `public/`; live `/logo.png`.
- **Evidence**: sizes from live GET; `grep -rn "logo.png\|linkedin-banner" src` returns nothing.
- **Why it matters for the thesis**: none at runtime; a 1.1 MB "logo" is one accidental `<Image src="/logo.png">` away from a 1 MB LCP. Housekeeping.
- **Proposed change**: move them to `docs/marketing/` or delete; if a raster logo is needed, add a ≤ 20 kB WebP.
- **Size**: S. **Rank**: 3.

## Summary table

| ID    | Title                                                    | Route                           | Size | Rank |
| ----- | -------------------------------------------------------- | ------------------------------- | ---- | ---- |
| PE-1  | `/favicon.ico` and `/apple-touch-icon.png` return 500    | all                             | S    | 1    |
| PE-2  | Roommate page: `100vh` shell, no `main`/`h1`/footer      | `/warsaw/roommate`              | S    | 1    |
| PE-3  | Roommate page: auth call + queries per request, uncached | `/warsaw/roommate`              | M    | 2    |
| PE-4  | Checker's bot handoff is a 14 px muted link              | `/warsaw/check`                 | S    | 1    |
| PE-5  | 404 page links to frozen listings                        | 404                             | S    | 1    |
| PE-6  | Supabase client (230 kB) on every page                   | all                             | M    | 2    |
| PE-7  | 67–103 kB i18n JSON on every page                        | all                             | M    | 2    |
| PE-8  | `/api/og` uncached per fetch                             | link previews                   | S    | 2    |
| PE-9  | Security headers absent (only HSTS)                      | all                             | S    | 2    |
| PE-10 | Accent lime as text, 1.63:1 (hero figures)               | `/`                             | S    | 2    |
| PE-11 | Tap targets < 44 px; hamburger aria state                | header, banner, `/warsaw/costs` | S    | 2    |
| PE-12 | Inputs without programmatic labels                       | `/warsaw/check`, `/`            | S    | 3    |
| PE-13 | Cookie banner privacy link ignores locale                | all                             | S    | 3    |
| PE-14 | Heading order skips; no skip link                        | building, check, footer         | S    | 3    |
| PE-15 | 92 kB fonts preloaded regardless of locale               | all                             | S    | 3    |
| PE-16 | Dead MDX import; regex markdown renderer                 | blog                            | S    | 3    |
| PE-17 | Unreferenced 1.1 MB / 1.45 MB PNGs in `public/`          | —                               | S    | 3    |

## Checked and found fine

- **Mapbox GL (1.7 MB)** is never on the initial path: `dynamic(..., { ssr: false })` on the listings map (`listings-page-client.tsx:27-33`), `lazy()` behind `viewMode === 'map'` on `/warsaw/costs` (`costs/client.tsx:47, 504`), `lazy()` for the POI map in `location-score-block.tsx:30`; `mapbox-gl.css` (39.8 kB) ships with those chunks only. Google Places is injected on demand by `address-autocomplete.tsx:54-86`, not as a layout script.
- **Static assets**: `/_next/static/*` are `public,max-age=31536000,immutable`, Brotli; HTML is Brotli with a working gzip fallback; the hreflang `Link` header is 300–459 bytes with 5 entries (not bloated).
- **Caching on the branch**: `revalidate = 3600` on city hub, district, building and calculator; `unstable_cache` for the costs city lookup; `cookies()` on `/costs` only decides whether to start the auth promise, and the anonymous path resolves without a skeleton. Middleware sets cookies only on `/costs/submit` and `/review`, so ISR stays cacheable (the live `private, no-store` on the building page is the pre-PRD-1 deployment).
- **404 behaviour**: unknown city, district, building, listing, roommate id and arbitrary paths all return HTTP 404 with `noindex`; `[...rest]` calls `notFound()`; `src/app/[locale]/error.tsx` and `src/app/global-error.tsx` exist, report to PostHog only when loaded, and offer retry + home.
- **Reduced motion**: `MotionConfig reducedMotion="user"` wraps the app (`posthog-provider.tsx:130-134`) and `globals.css:403-420` neutralises CSS animations; scroll reveals are CSS-only with CLS-safe transforms; blur and backdrop-filter are capped on coarse pointers (`globals.css:431-485`).
- **iOS input zoom**: `Input` is `text-base md:text-sm` (16 px on phones); Select triggers are 14 px but are not text inputs.
- **Sticky CTA vs cookie banner**: the pill measures the banner (`[data-cookie-banner]`) and lifts above it, with `env(safe-area-inset-bottom)`; `viewport-fit=cover` is set; the banner itself lifts above the cost form's bottom bar.
- **Role selector and bot buttons**: `min-h-11` tap targets, real `<button>`/`<a>` elements, keyboard reachable; `aria-expanded` on the collapsed chip; sections use `aria-labelledby`.
- **Language switcher (desktop)** is a Radix dropdown (keyboard and `aria-expanded` handled); social icons in the footer carry `aria-label`; no `<img>` without `alt` and no `<a>` without text on the six pages; muted text and primary links pass AA (7.3:1, 7.0:1); the mobile "costs" pill (dark on lime) passes at 12.2:1.
- **Dark mode**: tokens defined; not evaluated for contrast (no theme switch on the site).

Not verifiable in this session: Core Web Vitals (LCP/INP/CLS), actual compressed sizes of the on-demand route chunks on the current deployment, and whether the branch preloads fonts on dynamic routes. Read Vercel Speed Insights after the next deploy; PE-1, PE-8 and PE-9 can be confirmed with `curl -I` immediately after it.
