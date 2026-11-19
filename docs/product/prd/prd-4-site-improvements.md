# PRD 4: Site improvements — the website as an entry into roommate matching

- **Version:** 0.1, 2026-11-20
- **Status:** Evaluated, 2026-11-20 (`prd-4-decision-review.md`: ready with assumptions, 11
  decisions, 5 of them blocking one requirement each; written by Claude in the night run authorized
  by the owner on the evening of 2026-11-19: audit → PRD 4 → specs and tasks; the owner has not
  reviewed it yet)
- **Serves:** H10 (the roommate page as an entry, E11, D41), H14 (stage 1 inflow: web entries into
  the bot's roommate flow, E14 `entry_source=web`) and, through a denser pool, H15 (E15); the
  thesis stage 1 inflow (`../thesis.md`, D48). H11 (sharper titles on page-1 guides) is Parked and
  is not revived as a hypothesis; its title rewrite ships here as a small item, as its parked
  trigger allows, and is read inside this PRD's readout.
- **BRD assumptions:** A1 (Partly), A4, A5 (Partly), A21 (Contradicted, acted on: this PRD is read
  over 4 full weeks of Search Console and counts, never a two-week PostHog rate), A18
  (Contradicted, acted on: the frozen listings shell is demoted, no room offers are promised), A22,
  A23, A26 (the per-person figure). New assumptions proposed in `prd-4-decision-review.md`: A29
  (snippets and CTR), A30 (cost-surface visitors take the flatmate entry). No requirement rests on
  a contradicted assumption.
- **Builds on:** PRD 1 (`prd-1-activation-and-bot.md`: page context, `telegram_bot_opened`, the
  figure contract and its loaders, the honesty test, the roommate role selector) and PRD 3
  (`prd-3-roommate-matching.md`: the flatmate block, `loadRoommateCounts`, the room cost loader with
  the D71 per-person split, `mate_web_<detail>` deep links). Both are Done on `chore/agent-harness`
  and are deployed before or together with this PRD (D67). PRD 2 is On hold (D39) and is not a
  dependency.
- **Source:** the site audit of 2026-11-19 (`../reviews/2026-11-19-site-audit.md`, findings S-1 …
  S-35; appendix `../reviews/2026-11-19-site-audit/` with the ST-, SE-, FU- and PE- ids). Every
  requirement names the findings it ships. Written by Claude on 2026-11-20.
- **Database:** no new table, no migration, no RLS change (D9, D18). Nothing in this PRD touches
  personal data, the consent model (D10) or PostHog settings.

## 1. The test

**Question.** When the website says what Passflat does and every cost surface offers the next step
(see the figures per person, find someone to rent with in the bot), do the visitors who already
arrive from Google and from the owner's posts open the bot and finish a profile, and do sharper
titles and snippets bring more of them?

**Why this test** (facts with dates; judgements marked):

- The site still tells the 2025 listings story on every framing surface, while the one page built
  for the thesis hides its bot entry behind a tap that nobody makes: 41 roommate landings since
  2026-08-01 produced 0 useful actions (readout 2026-11-18; audit S-1, S-3).
- Google sends about 116 clicks in 12 months: building pages 42 %, the roommate page 25 clicks at
  position 8.8 with 1,409 impressions, guides 41 % of impressions at 0.7 % CTR (readout 2026-11-18).
  No building page, district page, guide or calculator links to the roommate page or the bot
  (S-6, S-20).
- Two faults hit every visitor: `/favicon.ico` returns HTTP 500 and link-preview images are
  re-rendered on every fetch (S-23, S-27).
- The fixes are copy, links and placement; none needs a dependency, a table or a migration
  (judgement of the audit; this PRD keeps it so).

**Metrics.** Three readings, each counted in counts and persons, never in invented rates:

1. **Search:** Search Console clicks, impressions, CTR and position per page group (the roommate
   page, building pages, district pages with the city hub, guides, the calculator, the data report,
   the home page), 4 full weeks (Monday–Sunday) after the deploy against the 4 full weeks before it.
   Read by the owner in Search Console (no code reads it).
2. **Web → bot:** `telegram_bot_opened` by `source` (the roommate page and the new callout surfaces
   of §6) and, on the bot side, persons (`tg_<chatId>`) with `tg_roommate_flow_started`
   `entry_source=web` by `entry_detail`, in the same 4 full weeks. The two identities are never
   joined (CLAUDE.md); both counts are reported side by side.
3. **Profile completion from the web:** persons with `tg_roommate_flow_started {entry_source: web}`
   → persons with `tg_roommate_profile_created {entry_source: web}` (A23), reported next to the
   same funnel for `tg`, `fb` and the other sources of E14.

**Thresholds — Assumptions** (the owner may change them; proposed in the decision review as E16):

- Roommate page: CTR ≥ 3 % on `/warsaw/roommate` (**Decided**, D41, E11) and clicks at least twice
  the previous 4 full weeks (**Assumption**).
- Rewritten page-1 pages (FR-25): CTR ≥ 2 % on at least 3 of the 8 pages (**Assumption**, from the
  parked E12).
- Total Google clicks over all page groups not below the previous 4 full weeks (**Assumption**: the
  title rewrites do not cost clicks); building, district, home and calculator groups reported with
  no threshold.
- Web → bot: at least 5 `telegram_bot_opened` from the website's roommate entries (`source` other
  than `checker` and `empty`) in the 4 full weeks (**Assumption**), split by `source`.
- Completion: at least half of the persons who start the roommate flow from the web finish a
  profile (**Assumption**, A23's estimate); below that, the roommate page's copy and the bot intake
  are the first suspects.

**What the readings decide.** Nothing about the thesis: stage 1 is decided by D52 on 2027-01-18
and D43 on 2027-01-20. This PRD's readout tells which entries bring people and which titles earn
clicks; a reading below a threshold goes into the next PRD as an item, not as a stop. There is no
stop rule for the site improvements.

**Dates.** Day 0 is the deploy of this PRD (the PRD 3 deploy around 2026-12-01 if the owner ships
them together, D67; otherwise the next deploy). Readout after 4 full weeks (about 2026-12-28 for a
deploy on 2026-12-01), folded into the stage 1 readout of 2027-01-18 where the dates allow. Search
Console keeps 16 months of history, so the "before" window needs no export before the deploy.

**Season.** December is the low season (Otodom: December 2025 demand 23 % below November); a null
result is weaker evidence than one in August–September, and the readout says so.

**Owner time.** None beyond the copy review before the deploy (D29) and the readout.

## 2. Milestones

Ordered by impact on stage 1 inflow. Milestones only order the work (`../../specs/README.md`).

| Milestone | What                                                                                   | Requirements  | Findings                                         |
| --------- | -------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------ |
| M1        | Structure and navigation: the roommate page opens on the thesis; entries in the header | FR-1 – FR-7   | S-1, S-2, S-4, S-5, S-10, S-15                   |
| M2        | Roommate entry and funnel copy: home, callouts on cost surfaces, per-person figure     | FR-8 – FR-20  | S-3, S-6, S-7, S-9, S-11, S-12, S-14, S-20, S-33 |
| M3        | Search metadata and district pages                                                     | FR-21 – FR-29 | S-8, S-13, S-16, S-17, S-18, S-19, S-21, S-22    |
| M4        | Performance, mobile and accessibility                                                  | FR-30 – FR-35 | S-23, S-24, S-25, S-27, S-28, S-29, S-30, S-31   |
| M5        | Measurement and docs                                                                   | FR-36, FR-37  | S-35 and the readout                             |

Everything ships in one deploy. Open requirements (FR-7, FR-16, FR-19, FR-20, FR-29) are blocked
tasks with their question; everything else proceeds (night rule, `prd-intake` §3).

## 3. Requirements

### M1. Structure and navigation

```text
FR-1. The flatmate block opens the roommate page
Milestone: M1 · Priority: Must · Status: Decided (the roommate page is an entry into the bot,
  D48, D41; listings stay frozen and are not promoted, D5); Assumption (placement and order, as
  spec 02 §Find a flatmate marks them, D68)
Who and when: a visitor lands on /[city]/roommate without choosing a role
Result: the "Looking for someone to rent with?" block (PRD 3 FR-21) is the first content of the
  page, the role selector stands above the frozen type tabs, and the "0 listings" line is not
  shown while the city has no offer
Acceptance criteria:
  1. Given no role chosen (intent undefined), when the page renders, then `showsFlatmateBlock`
     is true and the block is the first element of the scrolling list container, followed by
     the room money block (PRD 3 FR-22, shown on `no_offers_in_city` as today) and then the
     empty state; the listing grid stays rendered below when offers exist.
  2. Given the visitor taps "I'm looking for a room" (`find_room`) or "I have a free room"
     (`offer_room`), then the flatmate block is hidden (as today after those taps); given
     "Looking for someone to rent with" (`find_flatmate`), then it stays shown and the choices
     collapse into the chip as today.
  3. Given `listingType === 'roommate'`, then the role selector renders above the type tabs
     and the count/sort/filter row; on `/replacement` and `/sublet` nothing moves.
  4. Given `cityOfferCount === 0` on the roommate page, then the `listings.listingsInCity`
     count line is not rendered; given `cityOfferCount > 0`, it renders as today.
  5. The events are unchanged: `roommate_intent_selected {intent}` fires once per choice; no
     event fires on page load for the default block.
  6. Hiding the type tabs on the roommate page is not done: FR-7 (Open, Q-5).
Edge cases: offers appear again (`cityOfferCount > 0`) → the block stays first and the grid
  follows (Assumption); the counts loader fails → the block renders without counts (as today);
  another city's roommate page → no block (only `warsaw` has one, spec 02); no bot username →
  FR-2
Data: none new
Analytics: none new
Screen: src/components/listings/listings-page-client.tsx, src/lib/roommate-roles.ts
Copy: none
Depends on: PRD 3 FR-21, FR-22; D5, D48, D68
Open questions: Q-5 (type tabs; blocks nothing here)
```

```text
FR-2. The roommate page without the bot username
Milestone: M1 · Priority: Must · Status: Assumption (the honest line; the agent's cautious option
  of audit S-10)
Who and when: a build or deploy where NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is unset (production
  today, every preview build, the e2e server) renders /warsaw/roommate
Result: the flatmate block still explains the profile and says the bot is not connected yet;
  nothing on the page renders to nothing after a tap
Acceptance criteria:
  1. Given the username unset, when the roommate page renders, then the block shows its title,
     the how-it-works sentence and the languages line, no bot button, no count line, and one
     line "The Telegram bot is not connected yet." (four locales, draft in §8).
  2. Given the username unset, when the visitor taps the third role, then the block above is
     what they see (never an empty space); `roommate_intent_selected` still fires once.
  3. Given the username set, the block is as PRD 3 built it plus FR-13's line.
  4. `pageHasFlatmateBlock` no longer requires the username for rendering the block; it still
     gates loading the counts (no counts without a bot to join).
  5. The deploy checklist of FR-36 names NEXT_PUBLIC_TELEGRAM_BOT_USERNAME as a variable to set
     before or with the deploy (D76).
Edge cases: the e2e server (no username) → the block renders with the honest line, which the
  e2e smoke test of FR-37 may assert
Data: none · Analytics: none new
Screen: src/components/listings/find-flatmate-block.tsx, src/lib/roommate/website-counts.ts
Copy: agent draft, four locales (§8)
Depends on: FR-1; D76
Open questions: none
```

```text
FR-3. Roommate page title, description and H1
Milestone: M1 · Priority: Must · Status: Decided (the page stays at its URL with canonical and
  hreflang, PRD 1 §2, spec 02); Assumption (the wording: agent drafts for the owner's review; the
  snippet is read in §1)
Who and when: Google and a visitor read the roommate page's title, description and first heading
Result: they describe the thesis (a profile in the Telegram bot, district, budget per person,
  move-in month; what a room or a shared flat costs from reports), not room listings
Acceptance criteria:
  1. `listings.titleRoommate` and `listings.roommateMetaDescription` are rewritten in four
     locales from the drafts in §8 (appendix seo.md table A); the PL title keeps "Szukam
     współlokatora" as its first words (the ranking query).
  2. A server-rendered `<h1>` with a new key `listings.roommateH1` (§8) is the first heading of
     the page, above the role selector; the filter sidebar's heading stays `h2`.
  3. Both keys are in `REWRITTEN_KEYS` of the honesty test; no locale value matches the
     forbidden regex; the description contains no promise of a match, a date or a result.
  4. URL, canonical, hreflang and the OG image call are unchanged (`getAlternates`,
     `getOgImage(title, description)`).
Edge cases: the city name is inserted in the nominative by the ICU template → the drafts put
  the city at the start or after a colon so Polish and Russian stay correct (FR-22 rule)
Data: none · Analytics: none
Screen: src/app/[locale]/[city]/roommate/page.tsx, src/components/listings/listings-page-client.tsx
Copy: agent draft, four locales (§8)
Depends on: D41, D48, D50
Open questions: none
```

```text
FR-4. Roommate page landmarks and mobile height
Milestone: M1 · Priority: Must · Status: Assumption (agent's choice of markup, audit S-2)
Who and when: a visitor, a screen reader or a crawler reads /[city]/roommate
Result: the page has a `main` landmark, a footer and a height that mobile browsers do not clip
Acceptance criteria:
  1. The content column of `ListingsPageClient` is wrapped in `<main id="main">` on all three
     listing types (shared component; no behaviour change on `/replacement` and `/sublet`).
  2. The root `h-screen overflow-hidden` becomes `h-dvh overflow-hidden` (Tailwind 4 class).
  3. The `Footer` renders at the end of the scrolling list container on the roommate page
     (below the grid or the empty state), so the page is not a dead end; on `/replacement` and
     `/sublet` the footer renders the same way (shared container).
  4. A unit test over the pure props or markup helper asserts the `main` landmark and the h1 of
     FR-3 are present once.
Edge cases: the inner list scrolls inside the container as today; the footer scrolls with it
Data: none · Analytics: none
Screen: src/components/listings/listings-page-client.tsx
Copy: none
Depends on: FR-3
Open questions: none
```

```text
FR-5. Header: find a flatmate first; building reviews in the footer
Milestone: M1 · Priority: Must · Status: Decided (the roommate page is the entry, D48; agency and
  building reputation are out of focus, D48); Assumption (labels, order)
Who and when: any visitor opens the header on any page, on desktop or on a phone
Result: the first navigation item leads to the roommate page; the mobile pill leads there too;
  "Building reviews" moves from the header to the footer and stays reachable
Acceptance criteria:
  1. `navLinks` in the header becomes: Find a flatmate → /warsaw/roommate (new key
     `common.findFlatmate`, §8), Costs → /warsaw/costs, Check an address → /warsaw/check; the
     `/warsaw/review` link is removed from the header and added to the footer's product column
     with its existing `common.buildingReviews` label.
  2. The mobile pill links to /warsaw/roommate with the `common.findFlatmate` label and keeps
     its `cta_click {placement: 'header_mobile'}` event.
  3. The footer's product column gains "Costs by district" → /warsaw (new key
     `landing.footer.costsByDistrict`, §8; S-15) and "Building reviews" → /warsaw/review; the
     frozen listings links in that column are FR-7 (Open) and are not touched here.
  4. The e2e home test asserts the header contains a link to /warsaw/roommate.
Edge cases: the mobile menu lists the same three items; the active-link styling follows the
  new first item
Data: none · Analytics: none new
Screen: src/components/landing/header.tsx, src/components/landing/footer.tsx
Copy: agent draft, four locales (§8)
Depends on: D48
Open questions: none
```

```text
FR-6. Home framing surfaces stop promoting frozen listings
Milestone: M1 · Priority: Must · Status: Decided (frozen, not promoted, D5; the roommate page, the
  costs and the checker are the entries, D48); Assumption (targets and labels; the ForWhom
  segments)
Who and when: a visitor reads the hero chips, the "for whom" cards, the 404 page, the dashboard's
  "Browse listings" button or the home district cards
Result: every one of them leads to the roommate page, the costs, the checker or the district
  pages; none leads to /replacement, /sublet or /create-listing
Acceptance criteria:
  1. Hero: the three chips (Lease Takeovers, Roommate Search, Temporary Sublets) become one
     chip "Find someone to rent with" → /warsaw/roommate (label from
     `listings.roommateRoles.findFlatmate`, which the home route receives: `listings` is a shared
     client namespace).
  2. ForWhom: three cards, in this order: "Renting a whole flat with someone" → /warsaw/roommate;
     "Looking for a room" → /warsaw/roommate (the room money block, PRD 3 FR-22); "Checking a
     flat you found" → /warsaw/check. Keys `landing.forWhom.*` are rewritten (drafts §8); the
     section subtitle `landing.cta.subtitle` and `landing.cta.freeNote` ("posting is free") are
     rewritten to the thesis (drafts §8).
  3. 404: the second button → /warsaw/check with a "Check an address" label
     (`errors.notFound.browse` rewritten in four locales); a third link → /warsaw/roommate with
     `common.findFlatmate`. Status stays 404.
  4. Dashboard: "Browse listings" → /warsaw/costs with the costs label; the listings section of
     the dashboard itself is unchanged (frozen, reachable).
  5. Home district cards (`districts.tsx`) link to /warsaw/[district] (the indexable district
     pages) instead of the costs map filter; the slug overrides stay.
  6. A test asserts that no component under src/components/landing or src/app/[locale]/page.tsx,
     not-found.tsx links to /replacement, /sublet or /create-listing (the footer is excluded
     until FR-7).
Edge cases: a district card whose district page has no figure → the page exists and shows its
  own empty state (today's behaviour of /[city]/[district])
Data: none · Analytics: none new (ForWhom and 404 fire no events today; none is added)
Screen: src/components/landing/hero.tsx, for-whom.tsx, districts.tsx;
  src/app/[locale]/not-found.tsx; src/app/[locale]/dashboard/client.tsx
Copy: agent draft, four locales (§8)
Depends on: D5, D48; FR-5 (the common key)
Open questions: Q-6 (the hero H1; blocks nothing: the H1 is not changed here)
```

```text
FR-7. Footer product column without the frozen listings links
Milestone: M1 · Priority: Should · Status: Open (Q-5: removing navigation to /replacement, /sublet
  and /create-listing is a surface decision of the owner, although D5 says "not promoted")
Who and when: a visitor reads the footer on any page
Result (proposal): the product column lists Find a flatmate, Costs by building (/warsaw/costs),
  Costs by district (/warsaw), Check an address, Calculator, Guides, Building reviews, Templates;
  Lease Takeovers, Temporary Sublets and Post a Listing are removed; the pages stay reachable by
  URL; the roommate page's type tabs are hidden while cityOfferCount === 0
Acceptance criteria (when the owner answers (a)):
  1. The three links are removed in the footer; the dead keys `landing.footer.browseListings`,
     `temporarySublets`, `addListing` are deleted in four locales (parity test).
  2. On /warsaw/roommate with cityOfferCount === 0 the `ListingTypeTabs` row is not rendered;
     with offers it renders; /replacement and /sublet keep their tabs.
  3. The FR-6 test extends to the footer.
Edge cases: none
Data: none · Analytics: none
Screen: src/components/landing/footer.tsx, src/components/listings/listings-page-client.tsx
Copy: none new
Depends on: FR-5, FR-6; D5
Open questions: Q-5 (owner; blocks this requirement only)
```

### M2. Roommate entry and funnel copy

```text
FR-8. One shared flatmate callout
Milestone: M2 · Priority: Must · Status: Decided (the cost site, building pages, checker, guides
  and the roommate page are entries into the bot, D48; bot languages EN/RU/UK, D50); Assumption
  (the component, its copy and which surfaces show counts or the figure)
Who and when: a server component renders the callout on a cost or content surface (FR-9, FR-11,
  FR-12, FR-26)
Result: one component `FlatmateCallout` says what Passflat does and offers two links: the roommate
  page and, when the username is set, the bot
Acceptance criteria:
  1. `FlatmateCallout({ surface, counts?, split? })` renders: title "Looking for someone to rent
     with in Warsaw?", one sentence (a profile in the Passflat Telegram bot: district, budget
     per person, move-in month; contacts only on mutual interest), the languages line (English,
     Russian and Ukrainian), an optional count line ("{total} people in Warsaw have a profile";
     zero → "Be among the first"; absent when `counts` is missing or unavailable), an optional
     per-person line (FR-13; absent when `split` is missing), a link to /warsaw/roommate and,
     when NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is set, a bot button.
  2. `surface` is one of `home | building | district | hub | calculator | guide`; the bot button's
     payload is `mate_web_<surface>` through `botStartPayload`, which gains these sources
     (`TelegramBotSource` union), and its click captures `telegram_bot_opened {source: <surface>,
     has_building_context: false}`.
  3. The roommate-page link captures `cta_click {placement: 'flatmate_callout_<surface>'}`
     (existing event, new placement values).
  4. Copy keys live in `listings.flatmateCallout.*` (a shared client namespace), reusing
     `listings.findFlatmate.how`, `languages`, `first` where the sentence is the same; new keys
     in four locales (§8). The PL `languages` value carries the FR-17 clause.
  5. Without the username the bot button is absent and the roommate link stays; the component
     never returns null.
  6. Unit tests over a pure props mapper (`flatmateCalloutView`): count line per counts state,
     payload per surface, placement per surface, the no-username case; key parity.
Edge cases: `counts.status = 'unavailable'` → no count line; a surface other than Warsaw → the
  callers do not render the callout (only `warsaw` pages exist today)
Data: none · Analytics: §6
Screen: src/components/roommate/flatmate-callout.tsx (new), src/lib/analytics/telegram-events.ts
Copy: agent draft, four locales (§8)
Depends on: PRD 3 FR-2 (mate_web_<detail>), FR-21; D48, D50; FR-2
Open questions: none
```

```text
FR-9. The home page states the thesis under the hero
Milestone: M2 · Priority: Must · Status: Decided (the thesis sentence, D48); Assumption (placement
  under the hero, before CheckAddress; the hero H1 itself stays, Q-6)
Who and when: a visitor opens / in any locale
Result: directly under the hero one section says "Passflat helps people in Warsaw find someone to
  rent with and see what it costs per person", explains the profile and leads to the roommate page
  and the bot
Acceptance criteria:
  1. `src/app/[locale]/page.tsx` renders `FlatmateCallout surface="home"` between `Hero` and
     `CheckAddress`, with `counts` from `loadFlatmateBlockCounts()` (added to the home page's
     `Promise.allSettled`; a rejection → no count line) and `split` from FR-13's Warsaw loader
     (a rejection → no line).
  2. The section's heading is an `h2` with the thesis sentence (new key
     `listings.flatmateCallout.homeTitle`, §8); the rest is FR-8's content.
  3. The e2e home test asserts the section renders with a link to /warsaw/roommate; the bot
     button is absent in the e2e environment (no username) and the test says so.
  4. Nothing else on the home page moves in this requirement (copy: FR-10).
Edge cases: both loaders fail → the section renders with the links only
Data: none · Analytics: `telegram_bot_opened {source: 'home'}`, `cta_click {placement:
  'flatmate_callout_home'}` (FR-8)
Screen: src/app/[locale]/page.tsx
Copy: agent draft, four locales (§8)
Depends on: FR-8, FR-13
Open questions: Q-6 (hero H1; blocks nothing)
```

```text
FR-10. Home title, description, footer tagline, "for whom" copy and the templates sentence
Milestone: M2 · Priority: Must · Status: Assumption (agent drafts for the owner's review; the
  honesty rule of D25 and the test's forbidden list are Decided)
Who and when: Google and a visitor read the home title and description, the footer tagline, the
  "for whom" roommate card and the tools section's templates sentence
Result: they describe the thesis and the reported costs, name no listings and no "truth", and
  the four locales agree on the template languages
Acceptance criteria:
  1. `meta.homeTitle`, `meta.homeDescription` (appendix seo.md table K), `landing.footer.tagline`
     (§8), `landing.forWhom.*` (FR-6 drafts), `landing.hero.costsCta` ("See reported costs") and
     `landing.tools.templatesDescription` (one sentence in four locales: Polish originals with
     English, Russian and Ukrainian versions; checked against the files in public/documents) are
     rewritten in four locales.
  2. `meta.homeTitle`, `meta.homeDescription`, `landing.footer.tagline`, `landing.hero.costsCta`
     and `landing.tools.templatesDescription` are added to `REWRITTEN_KEYS`; no value matches
     the forbidden regex of its locale; `really` is added to the EN whole-file scan (FR-21).
  3. The templates sentence names the same four documents and the same four languages in every
     locale (a test compares the language words per locale).
  4. `landing.hero.subtitle` drops "document templates" and keeps its cost sentence (§8).
Edge cases: none
Data: none · Analytics: none
Screen: src/i18n/messages/{pl,en,ru,uk}.json
Copy: agent draft, four locales (§8 and appendix tables)
Depends on: D25, D48; FR-6
Open questions: none
```

```text
FR-11. The callout on building pages, district pages and the city hub
Milestone: M2 · Priority: Must · Status: Decided (entries, D48; not promoted, D5); Assumption
  (placement; no number on a building)
Who and when: a visitor reads /[city]/building/[slug], /[city]/[district] or /[city]
Result: each page offers the roommate entry; the building page's frozen "View listings in
  {district}" card is replaced by the callout; no building shows a per-person number
Acceptance criteria:
  1. Building page: the bottom card (`costs.building.lookingForApartment*`, `viewListingsIn`,
     the /replacement?district= link) is replaced by `FlatmateCallout surface="building"` with
     no counts and no split; the three keys are deleted in four locales. The district link of the
     breadcrumb stays the way to the district page.
  2. District page: `FlatmateCallout surface="district"` with `counts` from
     `loadFlatmateBlockCounts()` and the district's split (FR-27) renders inside the FR-26
     section; until FR-26 lands, directly under the buttons row.
  3. City hub: `FlatmateCallout surface="hub"` with counts and the Warsaw split (FR-13) renders
     under the buttons row.
  4. ISR pages (`revalidate = 3600`) show counts up to about two hours old (page cache plus the
     one-hour counts cache); the count line never claims freshness.
  5. Tests: the building client no longer references /replacement; a render-props test per page
     asserts the callout's surface value.
Edge cases: counts unavailable → no count line; the building page under the contribution gate
  shows the callout outside the gate (it is not cost detail)
Data: none · Analytics: `telegram_bot_opened {source: building | district | hub}`, `cta_click
  {placement: flatmate_callout_<surface>}`
Screen: src/app/[locale]/[city]/building/[slug]/{page,client}.tsx,
  src/app/[locale]/[city]/[district]/page.tsx, src/app/[locale]/[city]/page.tsx
Copy: FR-8's keys
Depends on: FR-8, FR-13; D5, D48
Open questions: none (removing the /replacement link from the building page follows D5 "not
  promoted"; the page /replacement itself stays)
```

```text
FR-12. The callout on the calculator result, the guides list and every guide
Milestone: M2 · Priority: Should · Status: Decided (guides and the calculator are entries, D48);
  Assumption (placement, no counts on static pages)
Who and when: a visitor reads a calculator result, /blog or /blog/[slug]
Result: each offers the roommate entry; guides get an end-of-article block with two links (check
  the address; find someone to rent with)
Acceptance criteria:
  1. Calculator: `FlatmateCallout surface="calculator"` renders under the result's buttons, no
     counts, no split (the calculator client is a client component: the callout's server-only
     parts are not needed; render it from the page or pass the username as a prop).
  2. Blog list: a second button "Find a flatmate" → /warsaw/roommate next to the existing costs
     button (`blog.ctaFlatmate`, §8); `blog.ctaText` is rewritten to name both.
  3. Guide article: `FlatmateCallout surface="guide"` renders after the article body and the
     template block, preceded by one line with a link to /warsaw/check ("Found a flat? Check the
     address and the reported costs", reusing `listings.roommateCostsBridge*` keys); no counts
     (static pages), no split.
  4. The data report (/blog/warsaw-rent-prices) renders the callout with the Warsaw split
     (FR-27 criterion 4).
Edge cases: the template block absent → the callout follows the body directly; a locale without
  the article → the page is 404 as today
Data: none · Analytics: `telegram_bot_opened {source: calculator | guide}`, `cta_click
  {placement: flatmate_callout_calculator | flatmate_callout_guide}`
Screen: src/app/[locale]/[city]/calculator/{page,client}.tsx, src/app/[locale]/blog/client.tsx,
  src/app/[locale]/blog/[slug]/{page,client}.tsx
Copy: agent draft, four locales (§8)
Depends on: FR-8
Open questions: none
```

```text
FR-13. The per-person figure next to the flatmate block
Milestone: M2 · Priority: Must · Status: Decided (the figure rule: tenant group, all-in median of
  apartments with 2 or more rooms, halved, rounded half up to 10 zł, with N, labelled "half of the
  median flat", never from asking prices or a known part, no line below N 2; D61, D71); Assumption
  (where it shows: the roommate block, the home section, the hub)
Who and when: a visitor reads the flatmate block on /warsaw/roommate, the home section (FR-9) or
  the hub callout (FR-11)
Result: one line "A whole flat in Warsaw, tenant reports ({n}): about {half} zł each for two
  (half of the median flat)" from the same loader the bot uses; absent when the rule has no figure
Acceptance criteria:
  1. The roommate page server loads `loadRoomCostAreas(city, [])` (the shared loader of
     src/lib/roommate/room-costs.ts, D71: `rentalType: 'apartment'`, `minRooms: 2`, tenant group,
     N ≥ 2, all-in total only) and passes `split` (`PerPersonSplit | null`) to the flatmate block;
     the home page and the hub pass the same to the callout.
  2. Given the Warsaw tenant apartment reports of §5 example 1, then the line reads "A whole flat
     in Warsaw, tenant reports (5): about 2,450 zł each for two (half of the median flat)" in the
     locale; given example 2 (one qualifying report) or example 3 (known part only), no line.
  3. The line never shows a percentage, "cheaper", "market" or an asking-price figure; the number
     is the loader's `value`, the N its `n`; the area name is Warsaw (level `city`).
  4. A consistency test feeds one fixture through `perPersonSplit` and the website line and
     through the bot's `roomCostsReply` for a profile with "any district", and compares value
     and N.
  5. The line is rendered by one pure helper shared by the block and the callout.
Edge cases: loader error → no line (logged without data); the bot's line for a district differs
  from the website's Warsaw line by design (different area, both say their area)
Data: none · Analytics: none
Screen: src/components/listings/find-flatmate-block.tsx, src/components/roommate/flatmate-callout.tsx,
  src/app/[locale]/[city]/roommate/page.tsx
Copy: agent draft, four locales (§8)
Depends on: PRD 3 FR-17; D61, D71; FR-8
Open questions: none
```

```text
FR-14. The checker's bot handoff is a button that names what the bot does
Milestone: M2 · Priority: Should · Status: Assumption (markup and the hint line; payload and
  events are Decided as built, PRD 1 FR-11)
Who and when: a visitor sees a checker result (with or without building data)
Result: the Telegram link is an outline button at least 44 px high with one line under it naming
  the bot's jobs and languages; payload and events unchanged
Acceptance criteria:
  1. `TelegramBotCta` renders the anchor with `buttonVariants({ variant: 'outline' })` and
     `h-auto min-h-11 whitespace-normal`, same href, same `telegram_bot_opened` properties, same
     `checker.costs.telegramCta` label; the checker's `checker_cta_clicked {cta: 'telegram'}` is
     unchanged.
  2. A new `checker.costs.telegramHint` line under the button: "This building's figures and
     roommate profiles in Telegram, in English, Russian and Ukrainian; the deposit letter in
     Russian and Ukrainian." (four locales, §8; D63 for the deposit line). The bot-languages test
     of spec 04 passes (English named for the general line).
  3. Without the username the component returns null as today (the checker never shows a bot
     line it cannot back); the roommate callout is not added to the checker (its handoff is the
     building card, `b_<id>`).
Edge cases: none
Data: none · Analytics: none new
Screen: src/components/costs/telegram-bot-cta.tsx, src/app/[locale]/[city]/check/client.tsx
Copy: agent draft, four locales (§8)
Depends on: PRD 1 FR-11; D63
Open questions: none
```

```text
FR-15. "How it works", Help and About describe the thesis
Milestone: M2 · Priority: Should · Status: Assumption (agent drafts for the owner's review); the
  removal of the cesja and sublet steps, the payments answers and the listings counter are FR-16
  (Open, Q-3)
Who and when: a visitor reads the home "how it works" section, /help "What is Passflat?" or
  /about
Result: the roommate tab describes the bot's steps and comes first; the general answers say what
  Passflat does now; nothing promises a paid feature
Acceptance criteria:
  1. Home `HowItWorksTabs`: the roommate tab is first and selected by default; its four steps are
     the bot's (profile in Telegram → honest counts and per-person figures → "Interested" on
     mutual interest → the Telegram username revealed; drafts §8); `landing.howItWorks.subtitle`
     drops "three ways to find your next home" (§8). The cesja and sublet tabs stay until Q-3 is
     answered.
  2. `helpCenter.general.a1`, `helpCenter.general.a2`, `about.solution.pillar1Title/Desc`,
     `pillar2Title/Desc`, `pillar3Title/Desc`, `about.team.description2` and
     `about.values.principle1Desc` ("the market") are rewritten to the thesis and to reported
     costs (drafts §8); `about.values.principle1Desc` joins `REWRITTEN_KEYS`.
  3. `landing.faq` gains q7/a7 "How do I find someone to rent with?" (§8), placed first.
  4. No rewritten text names a price, a listing feature, "verified", a match guarantee or a date.
Edge cases: none
Data: none · Analytics: none
Screen: src/components/landing/how-it-works-tabs.tsx, src/components/landing/faq.tsx,
  src/i18n/messages/*.json
Copy: agent draft, four locales (§8)
Depends on: D48, D5
Open questions: Q-3 (FR-16)
```

```text
FR-16. Help payments answers, cesja and sublet steps, the listings counter
Milestone: M2 · Priority: Could · Status: Open (Q-3: the payments answers mirror the terms and
  name 39 PLN; removing the cesja and sublet steps and the About listings counter hides frozen
  surfaces)
Who and when: a visitor reads /help payments and lease-takeover answers, the home "how it works"
  cesja and sublet tabs, `howItWorksPage.listers.*` and the About "{listings}+" counter
Result (proposal): the payments section says nothing is paid today and the promotion answer is
  removed; the cesja and sublet tabs and the listers block are removed from the home section and
  /how-it-works; the listings counter is removed from /about; `meta.pricingDescription` is deleted
Acceptance criteria (when the owner answers): the named keys are rewritten or deleted in four
  locales (parity test), the tabs component has one flow, the About counter is gone, and no page
  names a price.
Edge cases: none
Data: none · Analytics: none
Screen: src/app/[locale]/help/client.tsx, how-it-works/client.tsx, about/client.tsx,
  src/components/landing/how-it-works-tabs.tsx
Copy: agent draft after the answer
Depends on: FR-15
Open questions: Q-3 (owner; blocks this requirement only)
```

```text
FR-17. The Polish visitor's expectation and the posting kit's locale links
Milestone: M2 · Priority: Should · Status: Decided (no Polish bot locale now, D50; prefer Telegram
  and vary the wording, D53); Assumption (the clause, the rule for links)
Who and when: a Polish-locale visitor reads the roommate roles and the flatmate block; the owner
  copies a website link into a chat post
Result: the Polish third role reads as the seeker side; the Polish block says there is no Polish
  bot version yet; every website link in the posting kit carries /ru or /uk
Acceptance criteria:
  1. `listings.roommateRoles.findFlatmate` pl = "Szukam kogoś do wspólnego wynajmu" (the chip
     uses the same key).
  2. `listings.findFlatmate.languages` pl = "Bot mówi po angielsku, rosyjsku i ukraińsku —
     polskiej wersji jeszcze nie ma, po angielsku poradzisz sobie w minutę."; en, ru and uk keep
     their sentence; the bot-languages test still passes (English named in every locale).
  3. `docs/marketing/roommate-posts.md` "How to use a template" states that website links in
     posts always carry the reader's locale (`/ru/...` or `/uk/...`, never a bare
     `passflat.com/warsaw/...`, because the site has no locale cookie); a test asserts every
     `passflat.com/` link in the kit has a `/ru/`, `/uk/` or `/en/` prefix.
Edge cases: none
Data: none · Analytics: none
Screen: src/i18n/messages/*.json, docs/marketing/roommate-posts.md
Copy: given above (PL), owner review
Depends on: D50, D53; PRD 3 FR-21, FR-41
Open questions: none
```

```text
FR-18. Roommate page copy consistency
Milestone: M2 · Priority: Could · Status: Assumption (agent drafts); the consent note is FR-20's
  question (Q-9)
Who and when: a visitor reads the empty roommate list
Result: the e-mail card addresses room seekers, not flat-sharers; the filter title uses «ты»
Acceptance criteria:
  1. `listings.demandCapture.searchCardTitle` on the roommate page reads "Looking for a room?
     Save interest in listings" (four locales, §8); `/replacement` and `/sublet` keep their text
     (a roommate-specific key or a type-switched value).
  2. `listings.noMatch.title` ru «Нет предложений по твоим фильтрам», uk «Немає пропозицій за
     твоїми фільтрами».
  3. `listings.demandCapture.consentNote` is not changed (consent text, Q-9).
Edge cases: none
Data: none · Analytics: none
Screen: src/components/listings/listings-empty-state.tsx, src/i18n/messages/*.json
Copy: agent draft (§8)
Depends on: D42
Open questions: Q-9 (consent note; blocks nothing here)
```

```text
FR-19. The city-notify form on the home page
Milestone: M2 · Priority: Could · Status: Open (Q-2: the form collects e-mails for a launch that is
  out of focus, D6; removing it is a surface and personal-data decision)
Who and when: a visitor reads the home page's "Live in another city?" section
Result (proposal): the section is removed from the home page; the API and the checker's
  outside-city form stay; the checker's wording becomes "we may e-mail you once if Passflat
  launches there"
Acceptance criteria (when the owner answers): `CityNotify` no longer renders on /; its keys stay
  while the checker uses them; the checker's `checker.outside.*` copy is rewritten in four
  locales; the manual city-launch route is unchanged (D33).
Edge cases: none
Data: no change to stored rows
Screen: src/app/[locale]/page.tsx, src/components/landing/city-notify.tsx
Copy: agent draft after the answer
Depends on: D6, D33
Open questions: Q-2 (owner; blocks this requirement only)
```

```text
FR-20. The roommate e-mail card and "I have a free room"
Milestone: M2 · Priority: Could · Status: Open (Q-4: the e-mail card collects personal data and is
  counted by E13; the free-room role leads to a frozen listing form)
Who and when: a visitor on the empty roommate list
Result (proposal): the e-mail card is removed from the roommate page only (kept on /replacement
  and /sublet); "I have a free room" points to the room money block's links to OLX, Otodom and
  the Facebook groups instead of /create-listing
Acceptance criteria (when the owner answers): `ListingsEmptyState` does not render the capture
  on roommate; `listing_interest_saved` is no longer possible from the roommate page and spec 05
  says so for E13; the offer role's target changes and PRD 1 FR-15's sign-in test is retired or
  retargeted.
Edge cases: none
Data: fewer e-mails stored
Analytics: E13 counting note
Screen: src/components/listings/listings-empty-state.tsx, roommate-role-selector.tsx
Copy: agent draft after the answer
Depends on: D40, PRD 1 FR-15
Open questions: Q-4 (owner; blocks this requirement only)
```

### M3. Search metadata and district pages

```text
FR-21. Templated titles and CTAs under the honesty test
Milestone: M3 · Priority: Must · Status: Decided (reported-costs wording, D25; the test's forbidden
  list, spec 03 §Marketing copy); Assumption (the exact drafts; shipping the snippet changes with
  this deploy)
Who and when: Google and a visitor read the building, district, city, calculator, data-report and
  home titles and descriptions, and the costs CTAs
Result: none says "real", "really", "naprawdę", "realne", "реальные", "реальні", "the truth" or
  "market"; every key is in REWRITTEN_KEYS
Acceptance criteria:
  1. The keys `costsSeo.buildingMetaTitle`, `costsSeo.buildingMetaDescription`,
     `costsSeo.districtMetaTitle`, `costsSeo.districtMetaDescription`, `costsSeo.cityMetaTitle`,
     `calculator.metaTitle`, `calculator.metaDescription`, `rentReport.metaTitle`,
     `rentReport.metaDescription`, `rentReport.ogTitle`, `rentReport.lead`,
     `rentReport.checkStep1`, `meta.aboutDescription`, `meta.howItWorksDescription`,
     `meta.blogDescription`, `listings.demandCapture.costCtaTitle`, `about.values.principle1Desc`
     and the FR-10 keys are rewritten in four locales (appendix seo.md tables B, C, F, G, K; FU-8
     drafts) and added to `REWRITTEN_KEYS`.
  2. The EN whole-file scan regex gains `really`; `ALLOWED_EN_MATCHES` lists only matches that
     are not claims about figures, each with a reason in a comment.
  3. `buildingMetaDescription` without a figure says there is no report for the building yet and
     that a district or Warsaw reference with its group and N is shown (table B).
  4. No rewritten key names "market" or a percentage.
Edge cases: a key whose value legitimately contains a forbidden word in another sense → an
  explicit allow entry with a reason, never a regex loosening
Data: none · Analytics: none
Screen: src/i18n/messages/*.json, src/i18n/honesty-copy.test.ts
Copy: agent draft, four locales (appendix tables)
Depends on: D25; FR-10
Open questions: none
```

```text
FR-22. Nominative-safe templates for district and city names
Milestone: M3 · Priority: Should · Status: Assumption (template shapes; the district names stay the
  database `nameKey` display names)
Who and when: a Polish or Russian reader sees a title or heading with a district or city name
Result: the name stands in the nominative in every template ("Mokotów: koszty najmu", not
  "Wynajem w Mokotów")
Acceptance criteria:
  1. `costsSeo.districtH1` → "{district}: koszty najmu" (EN "{district}: rent costs", RU
     «{district}: расходы на аренду», UK «{district}: витрати на оренду»);
     `costsSeo.buildingsHeading` → "Budynki — {district}" and analogues; `districtMetaTitle` →
     "{district}, {city} — koszty najmu i pokoju" (table C); `calculator.metaTitle`,
     `calculator.h1` and the home/roommate templates put the city after a colon, a dash or in a
     fixed phrase ("w Warszawie" is allowed as a literal until a second city exists, D6).
  2. A test asserts that no PL or RU template places `{district}` or `{city}` directly after
     the prepositions w / na / в / у / на.
Edge cases: the EN and UK templates follow the same shapes for parity of meaning
Data: none · Analytics: none
Screen: src/i18n/messages/*.json
Copy: agent draft, four locales (table C, G)
Depends on: FR-21
Open questions: none
```

```text
FR-23. Guide frontmatter without percentages and the "real" family; a frontmatter honesty test
Milestone: M3 · Priority: Must · Status: Decided (no invented statistics, no "in full" claims,
  D25, CLAUDE.md honesty); Assumption (the drafts)
Who and when: Google reads a guide's title and description; the blog index shows them
Result: no frontmatter carries "77 %", "w całości", "in full", "полностью", "повністю" as a figure
  claim or the "real / rzeczywist / realn / реальн / actually / really" family; a test keeps it so
Acceptance criteria:
  1. The 8 files of `rental-deposit-kaucja-warsaw-*` and `protokol-zdawczo-odbiorczy-warsaw-*`
     get the table I drafts (deposit) and the same treatment without a number (protokół); the
     other frontmatters with the "real" family (`hidden-rental-costs-warsaw` pl/ru/uk,
     `renting-without-agent-warsaw` pl/ru/uk, `rental-contract-checklist-warsaw`,
     `bank-account-rent-poland-en` "actually", `move-out-cleaning-warsaw-en` "Actually") are
     reworded (tables E, J; drafts in the task).
  2. `src/content/blog.frontmatter.test.ts` (new) loads every `src/content/blog/*.mdx`
     frontmatter `title` and `description` and fails on the honesty test's FORBIDDEN regex of the
     file's locale or on `/\d+\s?%/`; the regex list is shared with `honesty-copy.test.ts` from
     one module.
  3. Guide bodies are FR-24; this requirement does not read them.
Edge cases: a legitimate percentage in a title (none today) → an explicit allow entry with a
  reason
Data: none · Analytics: none
Screen: src/content/blog/*.mdx, src/lib/blog.ts (unchanged), the new test
Copy: agent draft, four locales (appendix tables E, I, J)
Depends on: D25
Open questions: none
```

```text
FR-24. Guide bodies: reported-costs wording and relative self-links
Milestone: M3 · Priority: Should · Status: Decided (honesty wording, D25); Assumption (the
  mechanical replacement; link rendering)
Who and when: a reader reaches the end of any of the 52 guides or taps a self-link
Result: the closing sentence speaks of reported costs, and links to passflat.com open in the same
  tab as relative links
Acceptance criteria:
  1. In every guide body the phrases "realne liczby / realne koszty", «реальные цифры /
     расходы», «реальні цифри / витрати», "real numbers / real costs" become "zgłoszone
     koszty / liczby ze zgłoszeń", «расходы по отчётам / цифры из отчётов», «витрати за звітами /
     цифри зі звітів», "reported costs / figures from reports" (the task lists every changed
     line); no other sentence changes.
  2. A test scans the bodies of `src/content/blog/*.mdx` for the FORBIDDEN regex of the locale
     applied to sentences that contain a link to /check, /costs or /building (the closing
     sentences), and passes.
  3. `markdownToHtml` renders a link whose href starts with `https://passflat.com/` as a
     relative href without `target="_blank"`; absolute links to other hosts keep today's
     behaviour; the affiliate rule is unchanged.
  4. The cesja guide's links to /replacement are left as they are (Q-7).
Edge cases: a guide with no closing link sentence → nothing to change
Data: none · Analytics: none
Screen: src/content/blog/*.mdx, src/app/[locale]/blog/[slug]/client.tsx
Copy: mechanical, listed in the task
Depends on: FR-23
Open questions: Q-7 (cesja article; blocks nothing here)
```

```text
FR-25. Titles and descriptions of the page-1 pages with CTR below 1 %
Milestone: M3 · Priority: Should · Status: Assumption (agent drafts; read in §1 as the H11 item)
Who and when: Google shows the meters guide, the English hidden-costs guide, the data report, the
  calculator, the cesja guide, the English deposit guide, the English no-agent guide and the English
  occasional-lease guide
Result: each has a title under about 60 characters and a description under about 155 that names
  the question the page answers, without a frozen-feature promise
Acceptance criteria:
  1. The mdx frontmatters of `przepisanie-licznikow-najem` (table D), `hidden-rental-costs-warsaw`
     (table E), `cesja-najmu-guide` (table H: the description drops "how Passflat helps you find
     a new tenant"), `renting-without-agent-warsaw` and `najem-okazjonalny-vs-standard-warsaw`
     (table J) are rewritten in four locales; the deposit guide is FR-23; the data report and
     calculator keys are FR-21.
  2. Every rewritten title is ≤ 65 characters and description ≤ 160 characters (a test over the
     frontmatter of these slugs).
  3. The FR-23 test passes on the new values.
Edge cases: a locale whose draft would exceed the limit → shorten, never cut meaning into a
  claim
Data: none · Analytics: none (Search Console is read by the owner)
Screen: src/content/blog/*.mdx
Copy: agent draft, four locales (appendix tables D, E, H, J)
Depends on: FR-23
Open questions: Q-7 (keeping the cesja article at all; blocks nothing: the description is
  honest either way)
```

```text
FR-26. District page: how many people look for a flatmate here
Milestone: M3 · Priority: Must · Status: Decided (honest counts per district, nobody sees anybody,
  "any" profiles never added to a district, no combination with other fields, D49, D51, D68);
  Assumption (the section, the website count shape)
Who and when: a visitor reads /[city]/[district]
Result: a section "Room and shared renting: {district}" names how many active profiles name the
  district, or "nobody yet", and carries the flatmate callout
Acceptance criteria:
  1. `countRoommates` without a viewer also returns `byDistrict: Record<slug, number>` for every
     district named by at least one counted profile; `loadFlatmateBlockCounts()` carries it in
     its cached result (`status: 'counts'`), same one-hour cache, same error fallback.
  2. Given §5 example 2, the Mokotów page shows "2 people with a profile name Mokotów", Ochota
     2, Wola 1, Wawer "Nobody has named Wawer yet — be the first"; "any district" profiles
     count in no district; nothing is summed.
  3. The section renders after the buttons row and before the buildings heading, as an `h2`
     "Room and shared renting: {district}" (nominative-safe, FR-22), then the count line, then
     FR-27's figure lines, then `FlatmateCallout surface="district"` (FR-11).
  4. No percentage, rank, "cheapest" or "verified" appears; counts are the only numbers besides
     FR-27's figures.
  5. Unit test for `byDistrict` (example 2) and a render-props test for the count line's three
     states (n, zero, unavailable).
Edge cases: counts unavailable → the section renders without the count line; the page is ISR,
  so the count may be up to about two hours old
Data: none new (reads active profiles' district fields, as today)
Analytics: none
Screen: src/app/[locale]/[city]/[district]/page.tsx, src/lib/roommate/counts.ts,
  src/lib/roommate/website-counts.ts
Copy: agent draft, four locales (§8)
Depends on: FR-8, FR-11; PRD 3 FR-16; D49, D51, D68
Open questions: none
```

```text
FR-27. District page: the room reference and the per-person line; the data report's per-person line
Milestone: M3 · Priority: Must · Status: Decided (room figures per group with N and the level said,
  D23, PRD 3 FR-17; the per-person split, D61, D71)
Who and when: a visitor reads the FR-26 section of a district page, or the data report
Result: the district's room figures (both groups with N; Warsaw when the district has fewer than 5
  room reports, said so) and the district's per-person line, from the same loader as the bot
Acceptance criteria:
  1. The district page loads `loadRoomCostAreas(city, [district])` and renders the area's `room`
     reference with `AreaReferenceGroups` (the room money block's component: both groups with
     their N, "one observation", the known-part wording) under a lead-in "Rooms: tenant reports
     and asking prices" that names the level ("{district} has fewer than 5 room reports;
     Warsaw:" when the level is `city`); no room report at any level → no figure lines.
  2. The area's `split` renders as the FR-13 line with the area's name and N ("for two people
     about {half} zł each (half of the median flat, {n} tenant reports, {area})"); null → no line.
  3. Given spec 06 §Room cost reference's golden case (Mokotów), the lines equal the bot's for a
     profile naming Mokotów: tenant 1,700 zł (2), asking 1,550 zł known part (5), per person
     2,450 zł (5 tenant reports, Mokotów) under D71. A consistency test compares the page's data
     with `roomCostsReply`'s input for the same fixture.
  4. The data report (/blog/warsaw-rent-prices) shows the Warsaw per-person line under the city
     figure, from `loadRoomCostAreas(city, [])`, and the callout (FR-12 criterion 4).
  5. `costsSeo.districtMetaDescription` ends with the room and flatmate clause of table C only
     once this requirement ships (the FR-21 task uses the shorter variant; this task switches).
Edge cases: the district has room reports but no qualifying 2+-room apartment → room lines
  without the per-person line; the city has nothing → neither
Data: none · Analytics: none
Screen: src/app/[locale]/[city]/[district]/page.tsx, src/app/[locale]/blog/warsaw-rent-prices/page.tsx
Copy: agent draft, four locales (§8)
Depends on: FR-26, FR-13; D23, D61, D71
Open questions: none
```

```text
FR-28. Sitemap, robots, structured data and the submit page's metadata
Milestone: M3 · Priority: Should · Status: Assumption (priorities, schema choices); dropping
  frozen URLs from the sitemap or adding noindex is FR-29 (Open, Q-1); the Instagram handle is Q-8
Who and when: a crawler reads /sitemap.xml, /robots.txt and the JSON-LD of pages
Result: the roommate page outranks the frozen lists in the sitemap, blog entries carry lastmod,
  structured data points at live surfaces with per-locale URLs, link-preview images are not
  blocked, private URLs are blocked in every locale, and /costs/submit has its own title
Acceptance criteria:
  1. Sitemap: `/[city]/roommate` weekly 0.8; `/replacement` and `/sublet` 0.4; blog entries get
     `lastModified: post.date`; the listing-detail loop stays until Q-1.
  2. JSON-LD: the `WebSite` `SearchAction` is removed (no page performs a free-text search);
     `Article.image` = `getOgImage(title, description).url`; `Article.url` and every
     `BreadcrumbList` item use the locale URL from `getAlternates(path, locale).canonical`, with
     breadcrumb names from the `breadcrumbs` namespace ("Home", "Blog" translated); the data
     report passes `dateModified`; the duplicate `Organization` on /about is removed;
     `Organization.sameAs` keeps its current Instagram URL until Q-8 is answered (listed for the
     owner).
  3. robots: `allow: ['/', '/api/og']`; disallow `/api/` (the rest), `/dashboard/`, `/messages/`,
     `/create-listing/`, `/auth/`, `/admin/` each with and without the `/en`, `/ru`, `/uk`
     prefixes.
  4. `/[city]/costs/submit` gets a title and description in four locales (new keys
     `costs.submit.metaTitle`, `metaDescription`, §8) under the honesty test.
  5. Tests: sitemap priorities and lastmod over a mocked data set; the JSON-LD builders' URLs per
     locale; the robots output; key parity.
Edge cases: `isIndexable` false → robots disallows everything as today
Data: none · Analytics: none
Screen: src/app/sitemap.ts, src/app/robots.ts, src/lib/json-ld.tsx, src/app/[locale]/blog/[slug]/page.tsx,
  blog/warsaw-rent-prices/page.tsx, about/page.tsx, src/app/[locale]/[city]/costs/submit/page.tsx
Copy: agent draft, four locales (§8)
Depends on: none
Open questions: Q-1 (FR-29), Q-8 (Instagram handle; blocks the sameAs line only)
```

```text
FR-29. Frozen listing pages out of the sitemap, or noindex
Milestone: M3 · Priority: Could · Status: Open (Q-1: changing the discoverability of existing URLs
  is the owner's)
Who and when: a crawler reads the sitemap and the frozen pages
Result (proposal): `/[city]/replacement`, `/[city]/sublet` and the listing-detail loop leave the
  sitemap; the two list pages get `robots: { index: false, follow: true }`; the pages stay
  reachable; no URL is removed and no redirect is needed
Acceptance criteria (when the owner answers): the sitemap test asserts their absence; the two
  pages' metadata carries the robots setting; /warsaw/roommate is unchanged.
Edge cases: a listing detail that is still active stays reachable by URL
Data: none · Analytics: none
Screen: src/app/sitemap.ts, src/app/[locale]/[city]/{replacement,sublet}/page.tsx
Copy: none
Depends on: FR-28
Open questions: Q-1 (owner; blocks this requirement only)
```

### M4. Performance, mobile and accessibility

```text
FR-30. Icons and the locale guard
Milestone: M4 · Priority: Must · Status: Assumption (the mechanism: a redirect for /favicon.ico, an
  ImageResponse apple icon, the guard; no image dependency)
Who and when: a browser requests /favicon.ico or /apple-touch-icon.png on its own; any request
  carries an unknown first path segment
Result: no request returns HTTP 500; icons are served; unknown segments return 404
Acceptance criteria:
  1. `src/app/[locale]/layout.tsx` `generateMetadata` checks `hasLocale(routing.locales, locale)`
     first and calls `notFound()` otherwise, so `/favicon.ico`, `/apple-touch-icon.png` and
     `/anything.ext` return 404 instead of 500 when nothing else serves them.
  2. `next.config.mjs` redirects `/favicon.ico` to `/icon.svg` (permanent) and
     `/apple-touch-icon.png` to `/apple-icon`; `src/app/apple-icon.tsx` renders a 180 × 180 PNG
     with `ImageResponse` (the brand mark drawn in JSX, the logo's colours; no new dependency),
     so `metadata.icons.apple` is generated by Next.
  3. e2e: `GET /favicon.ico` and `GET /apple-touch-icon.png` return a status below 400 after
     redirects, `GET /apple-icon` returns 200 `image/png`, `GET /xx-unknown` returns 404.
Edge cases: a browser that ignores SVG favicons (older Safari) falls back to the apple icon
Data: none · Analytics: none
Screen: src/app/[locale]/layout.tsx, next.config.mjs, src/app/apple-icon.tsx (new)
Copy: none
Depends on: none
Open questions: none
```

```text
FR-31. HTTP headers: link-preview cache and security headers
Milestone: M4 · Priority: Should · Status: Assumption (values below; a CSP is Later)
Who and when: a chat app fetches /api/og; any response leaves the server
Result: /api/og is cached at the edge; every response carries the four security headers
Acceptance criteria:
  1. `/api/og` responses carry `Cache-Control: public, max-age=3600, s-maxage=86400,
     stale-while-revalidate=604800`; the e2e og-image test asserts the header.
  2. `next.config.mjs` `headers()` sets on every route: `X-Content-Type-Options: nosniff`,
     `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`,
     `Permissions-Policy: camera=(), microphone=(), geolocation=()`; the e2e home test asserts
     them on /.
  3. No `Content-Security-Policy` is added (Later).
Edge cases: the OG route's error responses are not cached (no header on a 4xx/5xx)
Data: none · Analytics: none
Screen: src/app/api/og/route.tsx, next.config.mjs
Copy: none
Depends on: none
Open questions: none
```

```text
FR-32. The roommate page does not read auth on the server
Milestone: M4 · Priority: Should · Status: Assumption (client-side resolution through the FR-33
  hook)
Who and when: any request renders /[city]/roommate
Result: the server does not call Supabase Auth; favourites resolve the session on the client
Acceptance criteria:
  1. `roommate/page.tsx` no longer imports the server Supabase client or calls `auth.getUser()`;
     `isLoggedIn` is no longer a prop.
  2. `ListingsPageClient` resolves the session with FR-33's `useClientAuthState()` and passes
     the result to `useFavorites`; a logged-out visitor sees the page without a skeleton.
  3. `/replacement` and `/sublet` pages follow the same change only where they pass the same
     prop (shared component); their rendering stays.
  4. Tests: the page module has no Supabase import (a test reads the file); the hook's two
     states are unit-tested in FR-33.
Edge cases: a logged-in visitor's favourites appear after hydration instead of on first paint
  (accepted)
Data: none · Analytics: none
Screen: src/app/[locale]/[city]/roommate/page.tsx, src/components/listings/listings-page-client.tsx
Copy: none
Depends on: FR-33
Open questions: none
```

```text
FR-33. The Supabase client loads only when a session may exist
Milestone: M4 · Priority: Should · Status: Assumption (the cheap signal and the lazy import)
Who and when: the header mounts on any page for a visitor
Result: anonymous visitors never download the Supabase browser client; signed-in visitors see
  their state as today
Acceptance criteria:
  1. A hook `useClientAuthState()` (new, src/lib/supabase/use-client-auth-state.ts) checks a cheap
     local signal first (a cookie whose name starts with `sb-` and ends with `-auth-token`, or
     the matching localStorage key, the same signal the costs page's server check uses) and only
     then `await import('@/lib/supabase/client')` to call `getUser()` and subscribe to
     `onAuthStateChange`; without the signal it resolves `{ user: null, loading: false }` at once.
  2. `Header` uses the hook; `handleSignOut` imports the client lazily the same way; the
     `initialUser` prop behaviour is unchanged.
  3. A build-output check (a test reading `.next` is not required): the task records in its
     progress entry the home page's script list before and after (the `@supabase` chunk absent
     from the home route's initial scripts).
  4. Unit tests for the signal detection (cookie present, localStorage present, none).
Edge cases: the signal exists but the session expired → the client loads and reports no user (as
  today); localStorage blocked → cookie only
Data: none · Analytics: none
Screen: src/components/landing/header.tsx, src/lib/supabase/use-client-auth-state.ts (new)
Copy: none
Depends on: none
Open questions: none
```

```text
FR-34. Contrast, tap targets and the hamburger
Milestone: M4 · Priority: Should · Status: Assumption (classes below)
Who and when: a visitor reads the hero figures or taps the header, banner or costs toolbar controls
  on a phone
Result: no text is drawn in the lime accent on the light background; every listed control is at
  least 44 px high; the hamburger announces its state in the visitor's language
Acceptance criteria:
  1. `text-accent` as a text colour is replaced: figure values → `text-foreground`; badge chips
     and link texts → `text-primary` (icons may stay accent) in hero.tsx (125, 188), faq.tsx (22),
     check-address.tsx (36), cost-transparency-card.tsx (135, 142, 156, 174), tools.tsx (68),
     bento-grid.tsx (120), cost-transparency.tsx (33), city-notify.tsx (56); the hero source line
     becomes `text-xs text-muted-foreground`.
  2. `min-h-11` (and `min-w-11` where square) on: the hamburger, the mobile pill, the mobile
     language buttons, the cookie banner's Accept and Decline, the costs list/map toggle, the
     listings sort select and map toggle.
  3. The hamburger gets `aria-expanded={mobileMenuOpen}`, `aria-controls="mobile-menu"`,
     `type="button"` and an `aria-label` from a new `common.menu` key (four locales); the panel
     gets `id="mobile-menu"`.
  4. A test asserts no `text-accent` class in the listed files except on `svg`/icon elements
     (a static scan with the allowed lines named), and the aria attributes in the header.
Edge cases: dark mode tokens are not evaluated (no theme switch on the site)
Data: none · Analytics: none
Screen: the files above
Copy: `common.menu` (four locales, §8)
Depends on: FR-5
Open questions: none
```

```text
FR-35. Labels, the banner's privacy link, heading order and a skip link
Milestone: M4 · Priority: Could · Status: Assumption
Who and when: a screen-reader user or keyboard user visits the checker, the home page or any page
Result: every input has a programmatic label, the cookie banner links to the visitor's locale
  policy, headings do not skip levels after the h1 on the building and checker pages and in the
  footer, and a skip link reaches the main content
Acceptance criteria:
  1. `AddressAutocomplete` accepts `id`; `AddressIntake` passes it and sets `htmlFor`; the
     city-notify inputs get `aria-label` from their placeholder messages.
  2. The cookie banner's privacy link uses the detected locale (`/privacy` for pl,
     `/<locale>/privacy` otherwise).
  3. Footer column titles become `h2` styled as today; the building page's and the checker's
     first card titles after the h1 become `h2`.
  4. The locale layout renders `<a href="#main" class="sr-only focus:not-sr-only …">` with
     `common.skipToContent` (four locales); every page's `<main>` gets `id="main"` (the task
     lists the pages it changed; FR-4 adds the roommate page's).
  5. Tests: the label pairing in a pure props test; the banner href per locale; a static scan
     for `<main` without `id="main"` under src/app/[locale].
Edge cases: pages without a `<main>` today get one in this requirement only when the change is
  one wrapper; otherwise they are listed for Later
Data: none · Analytics: none
Screen: src/components/buildings/address-intake.tsx, src/components/listings/address-autocomplete.tsx,
  src/components/landing/city-notify.tsx, src/components/cookie-consent.tsx,
  src/components/landing/footer.tsx, src/app/[locale]/layout.tsx and pages
Copy: `common.skipToContent` (four locales, §8)
Depends on: FR-4, FR-34
Open questions: none
```

### M5. Measurement and docs

```text
FR-36. Measurement and documentation
Milestone: M5 · Priority: Must · Status: Decided (existing event names, new values only, CLAUDE.md;
  the loop never queries PostHog); Assumption (the readout's shape)
Who and when: after M1 – M4 are built, from the code as it is
Result: the funnels document, the bot README and the architecture file describe the new values and
  the PRD 4 readout; the deploy copy-review checklist is written
Acceptance criteria:
  1. `docs/analytics/activation-funnels.md` §1 lists the new `telegram_bot_opened.source` values
     and the `cta_click.placement` values, and a new section "PRD 4 readout (E16, proposed)": the
     Search Console page groups and the before/after 4-full-week comparison (clicks, impressions,
     CTR, position; counts, not rates, while small), the HogQL for `telegram_bot_opened` by
     `source`, persons with `tg_roommate_flow_started {entry_source: web}` by `entry_detail`, the
     completion funnel by `entry_source`, the thresholds of §1 as Assumptions, the season note,
     and that web and bot identities are never joined.
  2. `src/lib/bot/README.md` "Deep links": `mate_web_<detail>` values the website sends
     (`roommate`, `home`, `building`, `district`, `hub`, `calculator`, `guide`).
  3. `docs/architecture.md`: §2 surfaces (the callout, the home section, the district section),
     §4 headers and redirects, §5 the new event values.
  4. `docs/ops/deploy-copy-review.md` (new): the owner's checklist for the deploy that carries
     PRD 1, PRD 3 and PRD 4: the four live-only honesty leftovers of S-35 to confirm live
     ("Przeglądaj zweryfikowane oferty", "77 % zwrot", "сколько платят жильцы", unsplit building
     figures), NEXT_PUBLIC_TELEGRAM_BOT_USERNAME set (D76), every PRD 4 draft copy key by task,
     and the Search Console groups to read after 4 weeks.
  5. `docs/specs/README.md` requirement map marks each FR Done, Blocked or Planned.
Edge cases: none
Data: none · Analytics: documentation only
Screen: no design
Copy: none
Depends on: FR-1 – FR-35 (the built ones)
Open questions: none
```

```text
FR-37. Final check and handoff
Milestone: M5 · Priority: Must · Status: Decided
Who and when: the last task of the PRD
Result: the gate and the e2e suite pass, the requirement map is complete, and the progress entry is
  the owner's handoff
Acceptance criteria:
  1. `npm run verify` and `npm run test:e2e` pass.
  2. `node scripts/ralph-tasks.mjs summary` shows every PRD 4 task done or blocked with its
     question (Q-1 – Q-5).
  3. The progress entry separates built, tested and not deployed: no migration, no table, no
     cron change; the redirects and headers added; every draft copy key for review (web four
     locales, by task); the Assumption constants and placements; the five blocked questions; the
     Search Console and PostHog readings to make after 4 full weeks; what stays unverified
     (Core Web Vitals, Live Events, the live headers and icons after deploy, mobile layout by eye).
Edge cases: none
Data: none · Analytics: none
Screen: no design
Copy: none
Depends on: FR-36
Open questions: none
```

## 4. Data

No new table, column, migration or cron (D9, D18). The requirements read existing data through
existing loaders: active roommate profiles' district fields (`loadRoommateCounts`, spec 06 §Counts),
visible cost reports through the figure contract (`loadRoomCostAreas` → `loadAreaReference`,
spec 03 §Loaders) and the blog frontmatter. Nothing new is stored about a visitor; no e-mail,
username, chat id or free text reaches analytics (CLAUDE.md). The counts and the per-person figure
are cached one hour (`loadFlatmateBlockCounts`) and 300 s under the `costs` tag (the figure
loaders), as built.

## 5. Counting and figure rules: numeric examples

These are golden tests.

**Example 1 — the Warsaw per-person line (FR-13).** Visible Warsaw reports with
`rentalType = apartment`, utilities complete, all-in totals and room counts:

| Report | Source    | Total (zł) | Rooms | Qualifies (D71: tenant, rooms ≥ 2)? |
| ------ | --------- | ---------- | ----- | ----------------------------------- |
| R1     | `user`    | 3,600      | 1     | no (studio)                         |
| R2     | `user`    | 4,100      | 2     | yes                                 |
| R3     | `import`  | 4,600      | 2     | yes                                 |
| R4     | `user`    | 4,900      | 3     | yes                                 |
| R5     | `user`    | 5,300      | 2     | yes                                 |
| R6     | `user`    | 5,800      | 3     | yes                                 |
| R7     | `user`    | 5,000      | null  | no (no room count)                  |
| R8     | `scraped` | 4,400      | 2     | no (asking price)                   |

Median of 4,100 / 4,600 / 4,900 / 5,300 / 5,800 = 4,900 zł, N = 5 → 4,900 ÷ 2 = 2,450 →
"A whole flat in Warsaw, tenant reports (5): about 2,450 zł each for two (half of the median flat)".
Level `city` (Warsaw is the area). The asking price R8 never enters; no percentage.

**Example 2 — one qualifying report.** Only R2 qualifies → N = 1 < 2 → no line. **Example 3 —
known part only.** R2 – R6 with `utilitiesComplete = false` → the headline is a known part → no
line (the rule applies only to all-in totals).

**Example 4 — district counts on the website (FR-26).** Active profiles P1 (Mokotów, Ochota), P2
(Mokotów), P3 (any district), P4 (Wola), P7 (Ochota); P5 hidden, P6 expired, P9 with a blocked chat.
No viewer. `total` = 5; `byDistrict` = { mokotow: 2, ochota: 2, wola: 1 }; P3 counts in no
district. The Mokotów page: "2 people with a profile name Mokotów"; Wawer: "Nobody has named
Wawer yet — be the first". The top-5 list of the roommate block is unchanged (Mokotów 2, Ochota 2,
Wola 1, ties alphabetical).

**Example 5 — the district room reference and split (FR-27).** Spec 06 §Room cost reference's
golden case: Mokotów room reports R1 `user` 1,600 complete, R2 `import` 1,800 complete, R3 – R7
`scraped` 1,400 / 1,500 / 1,550 / 1,700 / 2,000 known part → "Rooms in Mokotów — tenant reports:
1,700 zł a month all-in (2 reports); asking prices in listings: 1,550 zł, known part of the costs (5
listings)". Mokotów tenant apartment totals 4,200 (1 room) / 4,600 (2) / 4,800 (2) / 4,900 (3) /
5,100 (2) / 5,400 (3) → the studio is left out → median 4,900 → "for two people about 2,450 zł each
(half of the median flat, 5 tenant reports, Mokotów)". Wesoła with 2 room reports → "Wesoła has
fewer than 5 room reports; Warsaw:" and the Warsaw lines.

## 6. Analytics events

Existing event names only; new values are **Assumptions**. Nothing new is stored; web and bot
identities are never joined.

| Event                      | Where        | Change                                                                                                                                                          |
| -------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- | --- | ---------- | --------------------------------------------------------------------- |
| `telegram_bot_opened`      | web, callout | new `source` values `home`, `building`, `district`, `hub`, `calculator`, `guide` (FR-8); `has_building_context=false`; `checker`, `empty`, `roommate` unchanged |
| `cta_click`                | web, callout | new `placement` values `flatmate_callout_home                                                                                                                   | building | district | hub | calculator | guide`(the roommate-page link, FR-8);`header_mobile` unchanged (FR-5) |
| `roommate_intent_selected` | web          | unchanged; with FR-1 the `find_flatmate` taps fall (the block is open by default); E11's useful actions already count `telegram_bot_opened`                     |
| `tg_bot_started`           | bot          | unchanged; `payload` now also `mate_web_home` … `mate_web_guide`                                                                                                |
| `tg_roommate_flow_started` | bot          | unchanged; `entry_detail` now also `home`, `building`, `district`, `hub`, `calculator`, `guide` (from the payloads of FR-8)                                     |
| `checker_cta_clicked`      | web, checker | unchanged (FR-14 keeps `cta: 'telegram'`)                                                                                                                       |

No event on the ForWhom cards, the 404 buttons, the footer or the district count line.

## 7. Screens

- `/` (FR-6, FR-9, FR-10, FR-15, FR-34)
- `/[city]/roommate` (FR-1 – FR-4, FR-13, FR-17, FR-18, FR-32)
- Header and footer on every page (FR-5, FR-7, FR-34, FR-35)
- `/[city]/building/[slug]`, `/[city]/[district]`, `/[city]` (FR-11, FR-21, FR-22, FR-26, FR-27)
- `/[city]/calculator`, `/blog`, `/blog/[slug]`, `/blog/warsaw-rent-prices` (FR-12, FR-21, FR-23 –
  FR-25, FR-27)
- `/[city]/check` (FR-14, FR-35)
- `/help`, `/about`, `/how-it-works` (FR-15, FR-16)
- 404, `/dashboard` (FR-6)
- `/sitemap.xml`, `/robots.txt`, JSON-LD, `/favicon.ico`, `/apple-icon`, `/api/og`, HTTP headers
  (FR-28 – FR-31)
- No bot screen changes; no new route except `/apple-icon` (a generated icon).

## 8. Key copy (drafts for the owner's review)

Every line is an agent draft in four locales unless marked given; the owner reviews them before
the deploy (D29). Longer tables are in the audit appendix (`../reviews/2026-11-19-site-audit/seo.md`
tables A – K) and are cited by table letter; the tasks copy them into the message files.

**Roommate page (FR-3)** — title: PL "Szukam współlokatora w Warszawie: koszty na osobę", EN "Find
a flatmate in Warsaw — rent per person", RU «Сосед по квартире в Варшаве — цена на человека», UK
«Сусід по квартирі у Варшаві — ціна на особу». Description (FU-2 drafts): EN "Looking for someone
to rent a flat with in {city}? Create a short profile in the Passflat Telegram bot (district, budget
per person, move-in month) and see what renting costs per person. Free, no account."; PL "Szukasz
kogoś do wspólnego wynajmu w mieście {city}? Załóż krótki profil w bocie Passflat w Telegramie
(dzielnica, budżet na osobę, miesiąc przeprowadzki) i zobacz, ile kosztuje wynajem na osobę. Bez
konta."; RU «Ищешь, с кем снять квартиру — {city}? Создай короткую анкету в Telegram-боте Passflat
(район, бюджет на человека, месяц заезда) и посмотри, сколько выходит аренда на человека. Бесплатно,
без аккаунта.»; UK «Шукаєш, з ким зняти квартиру — {city}? Створи коротку анкету в Telegram-боті
Passflat (район, бюджет на людину, місяць заїзду) і подивися, скільки виходить оренда на людину.
Безкоштовно, без акаунта.» H1 (`listings.roommateH1`): PL "Szukam współlokatora w Warszawie", EN
"Find a flatmate in Warsaw", RU «Ищу соседа по квартире в Варшаве», UK «Шукаю сусіда по квартирі у
Варшаві».

**Bot not connected (FR-2)** — EN "The Telegram bot is not connected yet.", PL "Bot Telegram nie
jest jeszcze podłączony.", RU «Telegram-бот пока не подключён.», UK «Telegram-бот поки не
підключений.»

**Header and footer (FR-5)** — `common.findFlatmate`: PL "Szukam współlokatora", EN "Find a
flatmate", RU «Найти соседа», UK «Знайти співмешканця». `landing.footer.costsByDistrict`: PL "Koszty
według dzielnic", EN "Costs by district", RU «Расходы по районам», UK «Витрати за районами».

**Home framing (FR-6, FR-10)** — `meta.homeTitle` / `homeDescription`: table K. Footer tagline: PL
"Znajdź kogoś do wspólnego wynajmu w Warszawie i zobacz, ile to kosztuje na osobę — kwoty zgłoszone
przez najemców, z liczbą zgłoszeń.", EN "Find someone to rent with in Warsaw and see what it costs
per person — figures reported by tenants, with their counts.", RU «Найди, с кем снять квартиру в
Варшаве, и узнай, сколько это стоит на человека — цифры из отчётов жильцов, с их числом.», UK
«Знайди, з ким зняти квартиру у Варшаві, і дізнайся, скільки це коштує на людину — цифри зі звітів
мешканців, з їх кількістю.» Hero chip: `listings.roommateRoles.findFlatmate`. `landing.hero.costsCta`:
EN "See reported costs", PL "Zobacz zgłoszone koszty", RU «Смотреть расходы по отчётам», UK
«Дивитися витрати за звітами». ForWhom cards (FR-6): (1) EN "Renting a whole flat with someone" /
"Create a short profile in the Passflat Telegram bot: district, budget per person, move-in month.
Contacts appear only when the interest is mutual. English, Russian and Ukrainian." / CTA "Find
someone to rent with"; PL "Wynajem całego mieszkania z kimś" / "Załóż krótki profil w bocie Passflat
w Telegramie: dzielnica, budżet na osobę, miesiąc przeprowadzki. Kontakty widać dopiero przy
obopólnym zainteresowaniu. Po angielsku, rosyjsku i ukraińsku." / "Szukam kogoś do wynajmu"; RU
«Снять квартиру целиком вдвоём» / «Создай короткую анкету в Telegram-боте Passflat: район, бюджет на
человека, месяц заезда. Контакты видны, только когда интерес взаимный. По-английски, по-русски и
по-украински.» / «Ищу, с кем снять»; UK «Зняти квартиру повністю удвох» / «Створи коротку анкету в
Telegram-боті Passflat: район, бюджет на людину, місяць заїзду. Контакти видно, лише коли інтерес
взаємний. Англійською, російською та українською.» / «Шукаю, з ким зняти». (2) EN "Looking for a
room" / "What a room costs in Warsaw from tenant reports and asking prices, a checklist before you
pay, and where rooms are listed." / "See room costs"; PL, RU, UK analogues in the task. (3) EN
"Checking a flat you found" / "Known costs for the building, the location and the nuisances, in one
answer." / "Check an address"; PL, RU, UK analogues. `landing.cta.subtitle`: EN "Someone to rent
with, a room, or a flat you already found — start with the figures.", `landing.cta.freeNote`: EN
"Free, no account." (PL, RU, UK in the task). `landing.tools.templatesDescription` (FU-13): EN
"Lease agreement, handover protocol, flatmate agreement and termination notice — Polish originals
with English, Russian and Ukrainian versions."; PL "Umowa najmu, protokół zdawczo-odbiorczy, umowa
współlokatorska i wypowiedzenie — polskie oryginały z wersjami po angielsku, rosyjsku i ukraińsku.";
RU «Договор аренды, протокол приёма-передачи, соглашение соседей и расторжение — польские оригиналы
с версиями на английском, русском и украинском.»; UK «Договір оренди, акт приймання-передачі, угода
співмешканців і розірвання — польські оригінали з версіями англійською, російською та українською.»
404 second button `errors.notFound.browse`: EN "Check an address" (PL "Sprawdź adres", RU «Проверить
адрес», UK «Перевірити адресу»).

**Flatmate callout (FR-8, FR-9)** — `homeTitle` (the thesis sentence): EN "Passflat helps people in
Warsaw find someone to rent with and see what it costs per person", PL "Passflat pomaga znaleźć w
Warszawie kogoś do wspólnego wynajmu i zobaczyć, ile to kosztuje na osobę", RU «Passflat помогает
найти в Варшаве, с кем снять квартиру, и увидеть, сколько это стоит на человека», UK «Passflat
допомагає знайти у Варшаві, з ким зняти квартиру, і побачити, скільки це коштує на людину». `title`
(other surfaces): EN "Looking for someone to rent with in Warsaw?", PL "Szukasz kogoś do wspólnego
wynajmu w Warszawie?", RU «Ищешь, с кем снять квартиру в Варшаве?», UK «Шукаєш, з ким зняти
квартиру у Варшаві?». Sentence: `listings.findFlatmate.how` (built). Languages:
`listings.findFlatmate.languages` (built; PL with the FR-17 clause). Count: `listings.findFlatmate.count`
and `first` (built). Roommate link: EN "See the figures per person and the profiles", PL "Zobacz
koszty na osobę i profile", RU «Смотреть цифры на человека и анкеты», UK «Дивитися цифри на людину та
анкети». Bot button: `listings.findFlatmate.button` (built).

**Per-person line (FR-13, FR-27)** — EN "A whole flat in {area}, tenant reports ({n}): about {half}
zł each for two (half of the median flat).", PL "Całe mieszkanie — {area}, zgłoszenia najemców ({n}):
dla dwóch osób około {half} zł na osobę (połowa mediany).", RU «Квартира целиком — {area}, отчёты
жильцов ({n}): на двоих около {half} zł с человека (половина медианы).», UK «Квартира повністю —
{area}, звіти мешканців ({n}): на двох близько {half} zł з людини (половина медіани).» `{area}` is
Warsaw (the city's translated name) or the district's name.

**Checker hint (FR-14)** — EN "This building's figures and roommate profiles in Telegram, in English,
Russian and Ukrainian; the deposit letter in Russian and Ukrainian.", PL "Liczby dla tego budynku i
profile współlokatorów — w Telegramie, po angielsku, rosyjsku i ukraińsku; pismo o kaucję po rosyjsku
i ukraińsku.", RU «Цифры по этому дому и анкеты соседей — в Telegram, по-английски, по-русски и
по-украински; письмо о залоге — по-русски и по-украински.», UK «Цифри по цьому будинку й анкети
сусідів — у Telegram, англійською, російською та українською; лист про заставу — російською та
українською.»

**How it works (FR-15)** — subtitle: EN "How finding someone to rent with works", roommate steps:
EN (1) "Create a profile in the bot" / "District, budget per person, move-in month, languages. In
Telegram, in English, Russian or Ukrainian."; (2) "See who else is looking" / "Honest counts per
district and what a flat costs per person, from tenant reports."; (3) "Mark who you'd rent with" /
"Compatible people one at a time. Interested or skip; nobody sees your profile on the web."; (4)
"Contacts open on mutual interest" / "Both Telegram usernames appear only when the interest is
mutual. Never pay a reservation before a viewing and a signed contract." PL, RU, UK in the task.
FAQ q7/a7: EN "How do I find someone to rent with?" / "Open the Passflat bot in Telegram and create
a short profile: district, budget per person, move-in month. You see honest counts of who else is
looking and what a flat costs per person; contacts appear only when the interest is mutual."
`helpCenter.general.a1`: EN "Passflat helps people in Warsaw find someone to rent with (a profile in
our Telegram bot) and see what renting costs per person: costs tenants reported per building and
district, an address checker, a calculator, guides and free document templates." About pillars:
(1) "Find someone to rent with", (2) "What it costs per person", (3) "Checker, calculator, guides".
`about.values.principle1Desc`: EN "We show the figures tenants reported, with their counts — also
when they are inconvenient."

**Roommate page copy (FR-18)** — `searchCardTitle` on roommate: EN "Looking for a room? Save
interest in listings", PL "Szukasz pokoju? Zapisz zainteresowanie ogłoszeniami", RU «Ищешь комнату?
Сохрани интерес к объявлениям», UK «Шукаєш кімнату? Збережи інтерес до оголошень».

**District section (FR-26, FR-27)** — heading: EN "Room and shared renting: {district}", PL "Pokój i
wspólny najem: {district}", RU «Комната и совместная аренда: {district}», UK «Кімната та спільна
оренда: {district}». Count: EN "{n} people with a profile name {district}" (ICU plural) / zero
"Nobody has named {district} yet — be the first."; PL "{n} osób z profilem wskazało {district}" /
"Nikt jeszcze nie wskazał {district} — bądź pierwszy(-a)."; RU «{n} человек с анкетой указали
{district}» / «{district} ещё никто не указал — будь первым(-ой).»; UK «{n} людей з анкетою вказали
{district}» / «{district} ще ніхто не вказав — будь першим(-ою).» Room lead-in: EN "Rooms: tenant
reports and asking prices" and the level line "{district} has fewer than 5 room reports; Warsaw:"
(built in the bot, reused in meaning).

**Blog (FR-12)** — `blog.ctaFlatmate`: EN "Find a flatmate" (as `common.findFlatmate`); `blog.ctaText`:
EN "Looking for someone to rent with, or checking a flat? Start with the figures tenants reported."

**Submit page (FR-28)** — `costs.submit.metaTitle`: PL "Dodaj koszty swojego mieszkania w Warszawie",
EN "Add the costs of your flat in Warsaw", RU «Добавить расходы на свою квартиру в Варшаве», UK
«Додати витрати на свою квартиру у Варшаві»; description: EN "Two minutes: rent, czynsz, utilities
and deposit for your building. Shown only as aggregates with their counts."

**Accessibility (FR-34, FR-35)** — `common.menu`: EN "Menu" (PL "Menu", RU «Меню», UK «Меню»);
`common.skipToContent`: EN "Skip to content", PL "Przejdź do treści", RU «К содержимому», UK «До
вмісту».

**Titles and descriptions (FR-21, FR-22, FR-23, FR-25):** appendix seo.md tables B (building), C
(district), D (meters), E (hidden costs), F (data report), G (calculator), H (cesja), I (deposit), J
(no-agent, occasional lease), K (home).

## 9. Edge cases across the PRD

- **No bot username:** every bot button is absent and the roommate link stays (FR-2, FR-8); the
  checker's handoff returns null as today (FR-14); the e2e environment runs this way.
- **Counts unavailable or zero:** no count line, or "be the first"; never a stale-freshness claim.
- **No qualifying figure:** no per-person line, no room lines; a section never shows a number the
  figure contract did not produce.
- **Offers reappear on the roommate page:** the block stays first; the grid follows.
- **ISR and caches:** district and hub pages revalidate hourly and read hourly counts, so a count
  may be about two hours old; the figure loaders expire with `revalidateCostSurfaces()`.
- **Static blog pages:** the callout has no counts and no figure except on the data report
  (`force-dynamic`).
- **Unknown first path segment:** 404, never 500 (FR-30).
- **Four locales:** every new key in all four files (parity test); the PL-only clause of FR-17 is a
  value difference, not a key difference.
- **Snippet changes:** Google re-reads titles over weeks; the readout compares full weeks and says
  so.

## 10. Not in scope

- New products, payments, Telegram Stars, paid speed (stage 3, H16); listings revival or any
  change to the frozen listing flows beyond links to them (D5); aggregation of other platforms'
  listings (D45).
- A Polish bot locale (D50) or any bot copy change.
- PostHog settings, new event names, the consent model, the analytics identity (D10).
- A Content-Security-Policy (Later), scoping the translation JSON per route (S-26, Later), the
  hygiene items of S-32, new articles (appendix seo.md SE-10 topics), new URLs (no
  `/[district]/pokoj` pages), removing or redirecting any URL.
- Legal texts (terms, privacy, consent notes), prices, personal data retention.
- Deployments, Vercel variables, Search Console, production anything (owner, D18, D29).

## 11. Owner steps

1. Review this PRD and `prd-4-decision-review.md`; answer Q-1 – Q-11 when convenient (five block
   a task each; the rest block nothing).
2. Review the draft copy by task from the progress entries and the deploy checklist
   (`docs/ops/deploy-copy-review.md`, FR-36).
3. Deploy with PRD 3 (D67) or in the next deploy; set `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (D76);
   record the deploy day as day 0 in the posting log and as a PostHog annotation.
4. After the deploy: confirm the four live-only honesty leftovers are gone (S-35), `curl -I` the
   favicon, the apple icon, `/api/og` and the headers (FR-30, FR-31), and watch Live Events for
   `telegram_bot_opened` with the new sources.
5. After 4 full weeks: read Search Console per page group and the PostHog counts of §1; put the
   readings into the stage 1 readout of 2027-01-18 (E14) where the dates allow.

## 12. Open questions

| ID   | Question                                                                                                                                                                                                 | Owner | Blocks                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------- |
| Q-1  | Drop `/replacement`, `/sublet` and the listing details from the sitemap and set `noindex` on the two list pages (S-13)?                                                                                  | Owner | FR-29 only                                    |
| Q-2  | Remove the city-notify e-mail form from the home page (S-12; it collects e-mails for a launch out of focus, D6) and reword the checker's outside-city form?                                              | Owner | FR-19 only                                    |
| Q-3  | Help payments answers (39 PLN, cost-report access), the cesja and sublet steps of "how it works", `howItWorksPage.listers.*`, the About listings counter: rewrite to "nothing is paid" or remove (S-11)? | Owner | FR-16 only                                    |
| Q-4  | Remove the e-mail "save interest" card from the roommate page (E13 counts it) and where "I have a free room" should lead (S-12)?                                                                         | Owner | FR-20 only                                    |
| Q-5  | Remove Lease Takeovers, Temporary Sublets and Post a Listing from the footer, and hide the roommate page's type tabs while the city has no offer (S-5, S-1)?                                             | Owner | FR-7 only                                     |
| Q-6  | The hero H1 "Don't overpay for rent in Warsaw": keep, or rewrite to the thesis (S-3)? The section under it states the thesis either way.                                                                 | Owner | Nothing; a task is added when answered        |
| Q-7  | Keep the cesja guide (it promises frozen tenant replacement; S-18, S-21)? Removing it is a URL removal that needs a redirect.                                                                            | Owner | Nothing; the description is honest either way |
| Q-8  | Which Instagram handle is right: `passflatapp` (footer) or `passflat.com` (Organization schema) (S-13)?                                                                                                  | Owner | The `sameAs` line of FR-28 only               |
| Q-9  | Change the roommate page's consent note from «вы»/«ви» to «ты»/«ти» (consent text; S-34)?                                                                                                                | Owner | Nothing                                       |
| Q-10 | Drop or reword the footer line "Starting in Warsaw, expanding across Europe" (D6; S-34)?                                                                                                                 | Owner | Nothing                                       |
| Q-11 | "The data is open — free, no account" against the "unlock" gates: reword the trust line, the gate copy, or neither (S-34)?                                                                               | Owner | Nothing                                       |

## 13. Size

Estimated at about 30 loop tasks: M1 5 (1 blocked), M2 11 (3 blocked), M3 8 (1 blocked), M4 5,
M5 2 — 31 tasks, of which 5 blocked on Q-1 – Q-5; about 8 tasks of 10–30 minutes (the callout and
its placements, the district section, the templated keys, the icons and headers, the lazy client)
and about 18 small tasks of 2–5 minutes; roughly 3–6 hours of loop time. The decomposition is in
`../../specs/README.md` and `ralph/tasks.json`.

## Later

With the audit's finding ids, not in this PRD:

- **S-26** translation JSON scoped per route (`costs`, `listings` out of the shared namespaces).
- **S-32** hygiene: mono font preload off, the dead `MDXRemote` import and its dependency, the
  unreferenced PNGs in `public/`.
- **S-34** the parts that are Open (Q-9 – Q-11) and the dead message keys
  (`landing.hero.trustVerified*`, `browseCta`, `addCta`, `footer.pricing|careers|support|cookies`,
  `districts.listings|avgRent`).
- **S-11** the Open parts (Q-3) and a full rewrite of /how-it-works and /about.
- **S-28** a Content-Security-Policy, report-only first (PostHog EU, Mapbox, Google Maps, GA,
  inline JSON-LD).
- **S-13 / S-18** anything that changes a URL (needs a redirect task marked Open).
- **SE-10** new articles: the flatmate agreement and cost split, room prices per district, the cost
  of a flat for two as a living page, RU/UK "с кем снять квартиру", two tenants on one lease.
- **S-24** moving the roommate page's URL-filter parsing to the client and `revalidate = 300`.

## What changed

- **0.1, 2026-11-20.** First draft by Claude from the site audit of 2026-11-19 (S-1 … S-35) in the
  night run the owner authorized on the evening of 2026-11-19. Not yet reviewed by the owner.
