# PRD 4 decision review

- **PRD:** `prd-4-site-improvements.md`, version 0.1 of 2026-11-20
- **Written by:** Claude, `prd-intake` sections 1 and 2, in the night run the owner authorized on the
  evening of 2026-11-19 (audit → PRD 4 → specs and tasks). Section 0: the loop is idle; PRD 3 is
  Done and milestone M7 (owner tooling, no PRD) keeps its `todo` and `blocked` tasks in
  `ralph/tasks.json`; PRD 4's tasks are appended after them. Section 3 runs under the night rule:
  every owner question is a blocked task, everything independent proceeds.
- **Verdict: ready with assumptions.** All 37 requirements have an id, a milestone, a priority,
  testable acceptance criteria, a Decided / Assumption / Open mark, edge cases, a route or "no
  design", copy or a draft, and dependencies; the three figure rules (the per-person line, the
  district count, the district room reference) have numeric examples (§5 of the PRD). Nothing is
  marked Decided without a decision row; copy is an agent draft for the owner's review. Five
  requirements are **Open** and each is held by one blocked task; nothing else waits for them.
- **Decisions for the owner:** 11 (Q-1 – Q-11 of the PRD), of which 5 block one requirement each
  (Q-1 – Q-5) and 6 block nothing (Q-6 – Q-11); plus a list of Assumption defaults to confirm (row 12) and two proposed BRD assumptions with a proposed experiment (rows 13 – 14).
- **Size:** 31 tasks (M1 5, M2 11, M3 8, M4 5, M5 2), of which 5 blocked; about 8 tasks of 10–30
  minutes and 18 small ones of 2–5 minutes, roughly 3–6 hours of loop time.

## Owner's answers

None yet (night run). When the owner answers in chat, each answer goes into `../decisions.md` and
into the PRD (version 0.2, "What changed"); the blocked task is unblocked with
`node scripts/ralph-tasks.mjs unblock <id> '<answer>'` (`ralph-answer` skill).

| Row | Question                                              | Answer | Decision |
| --- | ----------------------------------------------------- | ------ | -------- |
| 1   | Q-1 sitemap and noindex for the frozen list pages     | —      | —        |
| 2   | Q-2 the city-notify form on the home page             | —      | —        |
| 3   | Q-3 Help payments answers, cesja and sublet steps     | —      | —        |
| 4   | Q-4 the roommate e-mail card and "I have a free room" | —      | —        |
| 5   | Q-5 footer listings links and the type tabs           | —      | —        |
| 6   | Q-6 the hero H1                                       | —      | —        |
| 7   | Q-7 keeping the cesja guide                           | —      | —        |
| 8   | Q-8 the Instagram handle                              | —      | —        |
| 9   | Q-9 the consent note's register                       | —      | —        |
| 10  | Q-10 the "expanding across Europe" line               | —      | —        |
| 11  | Q-11 "open data" against "unlock"                     | —      | —        |

## Readiness check per requirement

| FR            | Ready | Notes                                                                                                                                                     |
| ------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1, FR-2    | Yes   | Placement is an Assumption as spec 02 §Find a flatmate already marks it (D68); the no-username line is the cautious option                                |
| FR-3, FR-4    | Yes   | URL, canonical and hreflang unchanged (PRD 1 §2); the snippet wording is a draft the owner reviews before the deploy                                      |
| FR-5, FR-6    | Yes   | Re-pointing links follows D5 "not promoted"; nothing is removed; the hero H1 is Q-6 and stays                                                             |
| FR-7          | No    | Removing footer links and hiding the type tabs is a surface decision (Q-5)                                                                                |
| FR-8 – FR-12  | Yes   | New `source` and `placement` values only; `mate_web_<detail>` is allowed by spec 04; no counts on static pages                                            |
| FR-13         | Yes   | The figure rule is Decided (D61, D71) and the loader exists (`loadRoomCostAreas`); only the surfaces are new                                              |
| FR-14         | Yes   | Payload and events unchanged; the hint names the deposit letter's languages per D63                                                                       |
| FR-15         | Yes   | Copy only; the removals are FR-16                                                                                                                         |
| FR-16         | No    | Payments copy mirrors the terms; removing frozen-feature steps hides surfaces (Q-3)                                                                       |
| FR-17, FR-18  | Yes   | The PL clause keeps English named (spec 04 test); the consent note is left alone (Q-9)                                                                    |
| FR-19         | No    | Removing a form that stores personal data (Q-2)                                                                                                           |
| FR-20         | No    | Removing a form that stores personal data and that E13 counts; changing PRD 1 FR-15's target (Q-4)                                                        |
| FR-21 – FR-23 | Yes   | The honesty rule is Decided (D25, the test's forbidden list); the drafts are for review; the test grows, never loosens                                    |
| FR-24, FR-25  | Yes   | Mechanical wording in guide bodies; the cesja description drops a frozen promise without touching the article (Q-7)                                       |
| FR-26, FR-27  | Yes   | Counting rules Decided (D49, D51, D68) and figure rules Decided (D23, D61, D71); the website count shape (`byDistrict`) is an Assumption named in spec 06 |
| FR-28         | Yes   | Priorities and schema shapes are Assumptions; the Instagram handle waits for Q-8 and the frozen URLs' discoverability for Q-1                             |
| FR-29         | No    | Changing the discoverability of existing URLs (Q-1)                                                                                                       |
| FR-30 – FR-35 | Yes   | No dependency added; `ImageResponse` for the apple icon avoids an image tool; values of the headers are Assumptions                                       |
| FR-36, FR-37  | Yes   | Documentation and the final check; the loop never queries PostHog or Search Console                                                                       |

## Conflicts and dependencies

- **D5 (listings frozen, not promoted) against the footer and the type tabs.** The PRD re-points
  every framing CTA (FR-6, FR-11) under D5 and leaves the footer links and the roommate page's
  type tabs to the owner (FR-7, Q-5), because removing navigation is a surface decision and the
  owner has kept the pages reachable on purpose. No conflict; one open question.
- **D41 / E11.** E11's useful actions and CTR threshold stay as decided; FR-1 makes the
  `find_flatmate` tap unnecessary, so `roommate_intent_selected {intent: find_flatmate}` will fall
  while `telegram_bot_opened {source: roommate}` becomes the direct signal. E11 already counts the
  latter; `docs/product/experiments.md` does not need a change, and FR-36 notes the shift.
- **D40 / E13.** FR-20 (Open) would remove the roommate page's e-mail card that E13 counts; until
  the owner answers, nothing changes. FR-18 only rewords its title.
- **D61, D71 (the per-person split).** FR-13 and FR-27 reuse `loadRoomCostAreas` and
  `perPersonSplit` as built (T080, T107). No second aggregation; a consistency test guards it.
- **D50 (no Polish bot).** FR-17's Polish clause says so on the page; FR-14's hint names the
  deposit letter's languages (D63).
- **PRD 1 FR-15.** "I have a free room" keeps its target until Q-4 is answered (FR-20).
- **H11 / E12 (Parked, Stopped).** The title rewrite ships as a small item inside PRD 4, as the
  parked trigger allows; the hypothesis stays Parked and E12 stays Stopped. The reading is part of
  the proposed E16 (row 14). If the owner prefers to revive H11 and E12 instead, only the labels in
  `hypotheses.md` and `experiments.md` change.
- **Spec 02 §Find a flatmate** marks placement an Assumption; FR-1 changes it (block by default) and
  the spec is amended, as the spec itself foresaw.
- **Spec 06 §Counts** says the website result exposes the total and the top 5; FR-26 adds the
  per-district map for the district pages. The counting rules (viewer excluded, "any" never added,
  no combinations) are unchanged.
- **Contradicted assumptions.** A18 and A21 are acted on, not relied on: no room offers are
  promised; the readout is Search Console over 4 full weeks plus counts, never a two-week rate.
- **External services.** None new: Search Console is read by the owner; no API, no dependency, no
  paid service. The apple icon is generated with Next's `ImageResponse` (already used by `/api/og`).
- **Calendar.** If the owner ships PRD 4 with PRD 3 (around 2026-12-01, D67), the 4-full-week
  readout lands about 2026-12-28, inside the stage 1 window; a later deploy moves it.

## Decisions for the owner

| #   | What has to be decided                                                                                                        | Why the agent cannot decide                                                | Agent's proposal and options (with cost)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | What it blocks                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | Sitemap and `noindex` for `/replacement`, `/sublet` and listing details (Q-1, S-13)                                           | Changes the discoverability of existing URLs                               | **Proposal (a):** drop the three from the sitemap and set `noindex, follow` on the two list pages; pages stay reachable, no redirect. (b) keep them listed at priority 0.4 (FR-28 already lowers them). Cost: one small task either way                                                                                                                                                                                                                                                                                                                                                                                | FR-29 (T141)                                      |
| 2   | The city-notify form on the home page (Q-2, S-12, FU-14)                                                                      | Removes a form that stores e-mails; a second city is out of focus (D6)     | **Proposal (a):** remove it from the home page; keep the API and the checker's outside-city form with "we may e-mail you once if Passflat launches there". (b) keep it as is and record that the promise is a manual mailing (D33). Cost: one small task                                                                                                                                                                                                                                                                                                                                                               | FR-19 (T132)                                      |
| 3   | Help payments answers, cesja and sublet steps, `howItWorksPage.listers.*`, the About listings counter (Q-3, S-11)             | Payments copy mirrors the terms and names 39 PLN; hiding frozen surfaces   | **Proposal (a):** payments → "nothing is paid today", promotion answer removed, cesja and sublet tabs and the listers block removed, the counter removed, `meta.pricingDescription` deleted. (b) rewrite only, remove nothing. Cost: one copy task (M) either way                                                                                                                                                                                                                                                                                                                                                      | FR-16 (T130)                                      |
| 4   | The roommate e-mail card and the target of "I have a free room" (Q-4, S-12, FU-11)                                            | Personal data; E13 counts the card; PRD 1 FR-15's target                   | **Proposal (a):** remove the card from the roommate page only (kept on `/replacement` and `/sublet`); point "I have a free room" to the room money block's links (OLX, Otodom, Facebook groups). (b) keep both; FR-18's rewording stands. Cost: one small task                                                                                                                                                                                                                                                                                                                                                         | FR-20 (T133)                                      |
| 5   | Footer links to Lease Takeovers, Temporary Sublets, Post a Listing; the roommate page's type tabs at 0 offers (Q-5, S-5, S-1) | Removing navigation to frozen pages (D5 says "not promoted", not "hidden") | **Proposal (a):** remove the three footer links and hide the type tabs on the roommate page while the city has no offer; everything stays reachable by URL. (b) keep the links and tabs. Cost: one small task                                                                                                                                                                                                                                                                                                                                                                                                          | FR-7 (T122)                                       |
| 6   | The hero H1 "Don't overpay for rent in Warsaw" (Q-6, S-3)                                                                     | Positioning copy the audit left to the owner                               | **Proposal:** keep it for this PRD; the thesis section under it (FR-9) states the new story. Option: rewrite to "Who to rent with in Warsaw, and what it costs per person" (table K's title shape) in a follow-up task                                                                                                                                                                                                                                                                                                                                                                                                 | Nothing                                           |
| 7   | Keep the cesja guide (Q-7, S-18, S-21)                                                                                        | Removing a URL needs a redirect (Open by rule)                             | **Proposal:** keep it; FR-25 drops the frozen-feature promise from its description, FR-24 leaves its `/replacement` links. Option: remove with a redirect to `/blog` in a later task                                                                                                                                                                                                                                                                                                                                                                                                                                   | Nothing                                           |
| 8   | The Instagram handle (Q-8, S-13)                                                                                              | A fact only the owner knows                                                | **Proposal:** the footer's `passflatapp` is right and the schema's `passflat.com` is a typo; FR-28 leaves `sameAs` unchanged until confirmed                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | The `sameAs` line of FR-28                        |
| 9   | The roommate page's consent note «вы» → «ты» (Q-9, S-34)                                                                      | Consent text                                                               | **Proposal (a):** change the address form only, meaning unchanged, RU and UK. (b) leave                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Nothing                                           |
| 10  | The footer line "Starting in Warsaw, expanding across Europe" (Q-10, S-34)                                                    | Removes a line of positioning                                              | **Proposal (a):** replace with "Warsaw only for now." in four locales. (b) drop the key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Nothing                                           |
| 11  | "The data is open — free, no account" against the "unlock" gates (Q-11, S-34)                                                 | The gate itself is a kept owner decision (D3)                              | **Proposal (a):** reword the trust line to "Figures are open — free, no account; the per-utility breakdown after you add yours". (b) leave                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Nothing                                           |
| 12  | Confirm the Assumption defaults (not blocking)                                                                                | They shape what visitors see first                                         | The flatmate block first on the roommate page, role selector above the tabs, count line hidden at 0 offers (FR-1); the honest "bot not connected" line (FR-2); the callout's surfaces, counts only on dynamic and ISR pages, no number on a building (FR-8, FR-11, FR-12); the per-person line on the roommate block, the home section and the hub (FR-13); the thesis section directly under the hero (FR-9); sitemap priorities 0.8 / 0.4 and the removed SearchAction (FR-28); the header values of FR-31; the redirect-and-ImageResponse icons (FR-30); shipping every snippet change in one deploy (FR-21, FR-25) | Nothing; each is one constant or one line         |
| 13  | New BRD assumptions (proposed; registered only when the owner accepts)                                                        | Business statements need an A-number (prd-rules rule 8)                    | **A29** "Sharper, honest titles and snippets on page-1 pages raise their CTR to at least 2 %" — Untested; source: the readout 2026-11-18 (meters 0.9 %, hidden costs EN 0.4 % at positions 6–7) and the parked E12. **A30** "Visitors of cost surfaces (building pages, district pages, guides, the calculator) take a visible flatmate entry when it is offered next to the figures" — Untested; source: thesis v2 (the cost site as an entry, D48) and the audit (0 links today)                                                                                                                                     | Nothing                                           |
| 14  | Proposed experiment **E16** "Site as an entry" (registered in `experiments.md` only when the owner accepts)                   | Only the owner turns a proposal into an experiment                         | Hypotheses H10, H14 (and A29, A30). Metric and thresholds as PRD §1: Search Console per page group over 4 full weeks before and after the deploy (roommate CTR ≥ 3 %, D41; clicks ≥ 2×; ≥ 3 of 8 rewritten pages at CTR ≥ 2 %; total clicks not below the previous window), `telegram_bot_opened` by `source` (≥ 5 from website entries), bot persons `tg_roommate_flow_started {entry_source: web}` by `entry_detail`, completion ≥ 50 %. Dates: day 0 = the deploy; readout after 4 full weeks, folded into E14's. No stop rule                                                                                      | Nothing; the PRD's §1 is the definition meanwhile |

## Risks and what could be cut

- **Snippet changes cost clicks** (A29): rewriting about 25 titles at once can move positions
  either way; the readout compares 4 full weeks and the total-clicks assumption catches a loss.
  Mitigation if the owner prefers: ship FR-21 and FR-25 in a second deploy (decision 12).
- **The callout everywhere reads as noise**: six surfaces get the same block; the counts and the
  per-person figure keep it honest and local. If the readout shows no bot opens from a surface, the
  next PRD drops it there.
- **E13 and FR-20**: removing the roommate e-mail card ends one of E13's two counts; the proposal
  keeps the card on the other two list pages, and E13's readout is two weeks after the PRD 1
  deploy, likely before PRD 4 ships.
- **Season**: December traffic is lower; the readout says so.
- **Scope**: 31 tasks, 5 blocked. **Cut first** if the night is short: FR-35 (labels, skip link),
  FR-33 and FR-32 (bundle and TTFB), FR-12 (calculator and blog callouts), FR-18, FR-22. Do not cut
  FR-1 – FR-3, FR-8 – FR-11, FR-13, FR-21, FR-23, FR-26, FR-27, FR-30.

## Architect gap review (2026-11-20)

To be filled after the fresh `Plan` agent reviews specs 08 and 09 and the changed sections of 01,
02, 03, 04, 05 and 06 against the code, before tasks are written (`prd-intake` §4 step 3).
