# Deploy copy review (PRD 1, PRD 3, PRD 4)

The owner's checklist for the deploy that carries PRD 1, PRD 3 and PRD 4 (spec 05 §PRD 4: readout
and docs, FR-36). All three are built and tested on `chore/agent-harness` and **not deployed**.
Written on 2026-11-20 from the progress entries of `ralph/progress.md` and the code at `4ec2457`;
the loop did none of the steps below. Each task's entry holds the full texts (old and new, four
locales); the current values are in `src/i18n/messages/` and `src/content/blog/`.

What this file does not repeat: the migrations, the bot token, the webhook and the bot profile
are in the PRD 1 handoff (the T059 entry) and the PRD 3 handoff (the T105 entry, with the note of
2026-11-19 evening in the "Learnings" of `ralph/progress.md`: D75 – D77). PRD 4 has no migration,
no table, no cron and no new event name.

## 1. Before the deploy: the PRD 4 draft copy, by task

Agent copy under D29: nothing here was reviewed by the owner. "§8" is PRD 4 §8 as written,
"table X" an appendix draft of `docs/product/reviews/2026-11-19-site-audit/seo.md`, "agent" the
agent's own draft. Four locales unless the row says otherwise.

| Task | FR           | Keys or content                                                                                                                                                                                                                                                                                                      | Text from                                                     |
| ---- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| T118 | FR-1, FR-2   | `listings.findFlatmate.notConnected` (new)                                                                                                                                                                                                                                                                           | §8                                                            |
| T119 | FR-3, FR-4   | `listings.titleRoommate`, `listings.roommateMetaDescription`, `listings.roommateH1` (new)                                                                                                                                                                                                                            | table A, §8                                                   |
| T120 | FR-5         | `common.findFlatmate` (new), `landing.footer.costsByDistrict` (new); `common.costsShort` deleted                                                                                                                                                                                                                     | §8                                                            |
| T121 | FR-6         | `landing.forWhom.rentTogether.*`, `landing.cta.freeNote`, `errors.notFound.browse`; `landing.forWhom.findRoom.*`, `landing.forWhom.checkFlat.*`, `landing.cta.subtitle`; deleted: `landing.hero.trust{LeaseTakeovers,Roommate,Sublet}`, `landing.forWhom.{findHome,findRoommate,sublet}`, `dashboard.browseListings` | §8; the second group EN from the spec, PL/RU/UK agent         |
| T122 | FR-7         | no new key; deleted `landing.footer.browseListings`, `landing.footer.temporarySublets`, `landing.footer.addListing` (the footer's three frozen links, D82)                                                                                                                                                           | —                                                             |
| T123 | FR-8, FR-9   | `listings.flatmateCallout.homeTitle` (the thesis), `listings.flatmateCallout.title`, `listings.flatmateCallout.roommateLink` (new)                                                                                                                                                                                   | §8                                                            |
| T124 | FR-10        | `meta.homeTitle`, `meta.homeDescription`, `landing.footer.tagline`, `landing.hero.costsCta`, `landing.hero.subtitle`, `landing.tools.templatesDescription`                                                                                                                                                           | EN spec 08; PL/RU/UK agent; `templatesDescription` spec 08    |
| T125 | FR-10 (Q-6)  | thesis-first (D83): `landing.hero.title` + `landing.hero.titleHighlight` (the H1), `meta.homeTitle`, `meta.homeDescription`, `landing.footer.tagline`; replaces T124's values of the last three                                                                                                                      | H1 EN spec 08, RU owner, PL/UK agent; table K; §8             |
| T126 | FR-11        | no new key; deleted `costs.building.lookingForApartment`, `lookingForApartmentDesc`, `viewListingsIn`                                                                                                                                                                                                                | —                                                             |
| T127 | FR-12        | none (the calculator reuses T123's keys)                                                                                                                                                                                                                                                                             | —                                                             |
| T128 | FR-12        | `blog.ctaText`, `blog.ctaFlatmate` (new, equals `common.findFlatmate`)                                                                                                                                                                                                                                               | EN §8; PL/RU/UK `ctaText` agent                               |
| T129 | FR-13        | `listings.flatmateCallout.perPerson` (new)                                                                                                                                                                                                                                                                           | EN/RU/UK the bot's `roomSplit`; PL spec 08                    |
| T130 | FR-14        | `checker.costs.telegramHint` (new)                                                                                                                                                                                                                                                                                   | §8                                                            |
| T131 | FR-15        | `landing.howItWorks.subtitle`, `landing.howItWorks.roommate.step{1,2,3,4}{Title,Desc}`, `landing.faq.q7`, `landing.faq.a7` (new)                                                                                                                                                                                     | EN §8; PL/RU/UK agent                                         |
| T132 | FR-15        | `helpCenter.general.a1`, `about.solution.pillar{1,2,3}{Title,Desc}`, `about.team.description2`, `about.values.principle1Desc`                                                                                                                                                                                        | EN titles, `principle1Desc` §8; `a1` §8 without "free"; agent |
| T133 | FR-16 (Q-3)  | `helpCenter.general.a2` (free today, D80); deleted `helpCenter.payments.*`, `helpCenter.leaseTakeovers.{q6,a6}`, `landing.howItWorks.{tabReplacement,tabRoommate,tabSublet,replacement,sublet}`, `howItWorksPage.{tabListers,listers}`, `about.stats.listings`, `meta.pricingDescription`                            | EN spec 08; PL/RU/UK agent                                    |
| T134 | FR-17, FR-18 | pl `listings.roommateRoles.findFlatmate`, pl `listings.findFlatmate.languages` (the PL-only clause), ru/uk `listings.noMatch.title` («ты» / «ти»), `listings.demandCapture.searchCardTitleRoommate` (new); the posting-kit rule "Website links carry the reader's locale"                                            | §8, spec 08; the kit rule agent                               |
| T135 | FR-19 (Q-2)  | `landing.cityNotify.{badge,title,subtitle,success}` (D79: the home form stays; the badge is the D87 line); deleted `landing.cityNotify.currentCity`                                                                                                                                                                  | title, subtitle RU owner, EN spec 08; badge D87; rest agent   |
| T138 | FR-21        | `costsSeo.buildingMetaTitle`, `costsSeo.buildingMetaDescription`, `costsSeo.districtMetaTitle`, `costsSeo.cityMetaTitle`, `calculator.metaTitle`, `calculator.metaDescription`, `listings.demandCapture.costCtaTitle`, `listings.detail.buildingCostHint`                                                            | tables B, C, G; `cityMetaTitle`, the last two agent           |
| T139 | FR-21        | `rentReport.{metaTitle,metaDescription,ogTitle,lead,checkStep1,anatomyTitle,doplatyBody2}`, `meta.{aboutDescription,howItWorksDescription,blogDescription}`, `howItWorksPage.seekers.step1Desc`                                                                                                                      | table F (EN; PL title and OG title); agent                    |
| T140 | FR-22        | `costsSeo.districtH1`, `costsSeo.buildingsHeading`, `calculator.h1`; pl/ru/uk `costsSeo.cityMetaDescription`, `cityH1`, `districtIntro`; pl `emails.cityNotifyConfirmation.{subject,body}`, `emails.cityLaunch.{subject,heading}`                                                                                    | spec 09 table, tables C, G; agent                             |
| T141 | FR-23        | guide frontmatter: 30 titles and descriptions in 29 files                                                                                                                                                                                                                                                            | tables E, I, J; agent                                         |
| T142 | FR-24        | guide bodies: 88 link lines in 48 files ("real" → "reported" and its forms)                                                                                                                                                                                                                                          | spec 09 forms; agent                                          |
| T143 | FR-24        | guide bodies: 122 lines (hard-coded statistics replaced by pointers to the data report or removed; rankings no longer attributed to tenant reports)                                                                                                                                                                  | agent                                                         |
| T145 | FR-25        | guide frontmatter: 32 titles and descriptions in 20 files (`przepisanie-licznikow-najem`, `hidden-rental-costs-warsaw`, `cesja-najmu-guide`, `renting-without-agent-warsaw`, `najem-okazjonalny-vs-standard-warsaw`)                                                                                                 | tables D, E, H, J (three small edits)                         |
| T147 | FR-26        | `costsSeo.districtRoommateHeading`, `costsSeo.districtProfileCount`, `costsSeo.districtProfileNone` (new)                                                                                                                                                                                                            | §8; agent                                                     |
| T148 | FR-27        | `costsSeo.districtRoomLead`, `costsSeo.districtRoomCityFallback` (new), `costsSeo.districtMetaDescription` (table C, full)                                                                                                                                                                                           | §8 (EN lead), the bot's `roomFallback`, table C; agent        |
| T149 | FR-28        | `costs.submit.metaTitle`, `costs.submit.metaDescription` (new)                                                                                                                                                                                                                                                       | §8; PL/RU/UK description agent                                |
| T155 | FR-34        | `common.menu` (new)                                                                                                                                                                                                                                                                                                  | agent                                                         |
| T158 | FR-22        | pl/ru/uk `costsSeo.cityIntro`, `costsSeo.backToCity` (city noun before the name); deleted `costs.building.districtAvg` (never read)                                                                                                                                                                                  | agent                                                         |

No copy: T144 (own links in guides render relative), T152 (icons), T153 (headers), T159 (the
data report's deposit figure turns `text-foreground`).

Points the entries raise for a decision (not blockers; each entry has the detail):

- **Bot username unset → mixed signals** (T118, T123, T126): without
  `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` the roommate page says "The Telegram bot is not connected
  yet.", while the home, hub and district callouts may still show a profile count with only the
  roommate link. Set the username at this deploy (§2) or decide to hide the count line without it.
- **The ru/uk deposit guide descriptions promise the deposit bot** (T141, table I): they go live
  only together with the bot.
- **Price and frozen-listing lines outside FR-16** (T133, not in the spec, left as they were):
  `howItWorksPage.faq.a4` ("Passflat is free: listings (up to 2 active), …") and
  `helpCenter.costTransparency.a2` ("free and forever", a statement about later prices, D80);
  the /how-it-works seekers tab (cesja steps, "Browse Listings" to `/warsaw/replacement`) and its
  bottom CTAs "Browse Listings" and "Post a Listing" (`/create-listing`).
- **Left as they were, for your call:** the move-out guide's "Cleaning disputes are the top
  reason …" (T141); 198 guide body lines that still match the claim words, most in another sense
  (T143); the rest of `/about` about frozen listings (T132); the ForWhom heading "Ready to find
  your next home?" (T121).
- **The thesis-first home copy** (T125): table K's RU and UK descriptions address the reader
  as «вы» / «ви» («Найдите … посмотрите»), while the hero, the tagline and the roommate copy use
  «ты» / «ти»; they shipped as drafted. The H1 is a sentence now: at the old `md:text-7xl
lg:text-8xl` it took four (EN, RU) to five (PL) lines on a 1280 px desktop and pushed the hero
  CTAs below the fold, so the desktop sizes are one step smaller (`md:text-6xl lg:text-7xl`, two
  to three lines; phones unchanged). Revert the class in `hero.tsx` if you prefer the bigger type.
- **The city-notify form** (T135, D79): the RU and UK copy keeps the section's «вы» / «ви»
  (the owner's RU wording), PL keeps "Ty". The badge became "Warsaw only for now." (the D87
  line) with a pin icon instead of the globe, and `currentCity` ("Currently live in Warsaw") is
  gone: the subtitle already says it. The confirmation e-mail on sign-up is unchanged, so a
  subscriber gets it now and the launch e-mail later.
- **Event targets changed:** `cta_click {placement: 'header_mobile'}` now counts taps to the
  roommate page and `district_card` taps to the district pages (T120, T121).

## 2. At the deploy: the two Vercel variables

- [ ] `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` = the production bot's username (D76; the name itself is
      Open, T117). It is inlined at build time: set it before the build, and redeploy after a
      change. Without it the website has no bot button at all (roommate page, callouts, checker).
- [ ] `ROOMMATE_MATCHING_ENABLED=true` (D75: matching is on from the deploy).
- [ ] Record day 0 in `docs/marketing/roommate-posting-log.md` and as a PostHog annotation.

## 3. After the deploy: the live-only honesty leftovers (audit S-35)

The audit saw these on the live site; the branch has fixed them, so they disappear only with this
deploy. On 2026-11-20 a search of `src/` found none of the three phrases.

- [ ] "Przeglądaj zweryfikowane oferty" is gone from `/how-it-works`.
- [ ] The "77 % zwrot" deposit-return figure is gone from the hero on `/`; the hero's deposit line
      reads "X of N who answered".
- [ ] «сколько платят жильцы» is gone from `/ru`.
- [ ] A building page with both kinds of data shows the tenant group and the asking-price group
      separately, each with its N, never one blended figure (PRD 1 package C).

## 4. After the deploy: headers, icons and Live Events

```sh
curl -sI https://passflat.com/favicon.ico
# 200, content-type: image/png, cache-control: public, max-age=86400, s-maxage=604800
curl -sI https://passflat.com/apple-touch-icon.png
# the same
curl -sI 'https://passflat.com/api/og?title=x'
# 200, content-type: image/png,
# cache-control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800
curl -sI https://passflat.com/
# x-content-type-options: nosniff
# referrer-policy: strict-origin-when-cross-origin
# permissions-policy: camera=(), microphone=(), geolocation=()
curl -sI https://passflat.com/nonexistent.ext
# 404, at once
```

- [ ] The five answers match the comments. Vercel may add headers of its own; no
      `x-frame-options` or `content-security-policy` is expected (the framing header waits for
      Q-13, blocked T154).
- [ ] PostHog Live Events (EU project, D30), from a test click (say in the readout which events
      were your own):
  - the callout's bot button on `/` → `telegram_bot_opened {source: 'home', has_building_context: false}`;
    the same on a building page, a district page, `/warsaw`, the calculator, a guide and the data
    report with their own `source`;
  - the callout's roommate link → `cta_click {placement: 'flatmate_callout_home'}` (and per surface);
  - in the bot, from a chat without a roommate profile or draft: `tg_bot_started
{payload: 'mate_web_home'}` and `tg_roommate_flow_started {entry_source: 'web', entry_detail: 'home'}`.

## 5. After 4 full weeks: Search Console and PostHog

The readout is `docs/analytics/activation-funnels.md` §9 (E16): the Search Console page
groups and the 8 rewritten pages (§9.1), the HogQL queries K – N (§9.2), the thresholds as
Assumptions (§9.3) and the attribution limit (§9.4).

- Window: 4 full weeks (Monday – Sunday, Europe/Warsaw) after day 0, against the 4 full weeks
  before. For a deploy on Tuesday 2026-12-01: 2026-12-07 – 2027-01-03 against 2026-11-02 –
  2026-11-29; read on or after Monday 2027-01-04.
- Search Console groups: the roommate page (four locales), building pages, district pages with the
  hub, guides, the calculator, the data report, the home page. Counts, not rates, while small;
  the first week after the deploy is weak evidence (Google re-reads titles over weeks).
- PostHog: start the window at the first full week with the bot username set; before it, every bot
  number is 0 by construction.
- Fold the readings into the stage 1 readout of 2027-01-18 (§7) where the dates allow. December is
  the low season; none of the thresholds is a stop rule.
