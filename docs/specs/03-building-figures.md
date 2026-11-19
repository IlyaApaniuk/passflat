# 03 · Honest building figures: the shared contract and its surfaces (PRD 1 package C)

Requirements FR-21 – FR-34 of PRD 1. Data honesty rules in `CLAUDE.md` apply. Raw reports stay
server-side; only aggregates and counts leave the server. No fair-price model, no new tables, no
calculator tariff change (**Decided**). If you find an outdated tariff or source in the
calculator, add a task for it (`node scripts/ralph-tasks.mjs add`) instead of changing it.

## Current state (2026-11-19)

- `CostReport` fields used here: `source` (`user|import|scraped`), `rentalType`
  (`apartment|room|null`), `rent`, `adminFee`, `electricityAvg`, `gas`, `heating`, `water`,
  `internet`, `otherCosts`, the `*Included` booleans, `utilitiesComplete` (`true` complete,
  `false` the tenant did not know, `null` legacy), `totalMonthlyAvg` (stored; nulls summed as 0),
  `depositAmount`, `depositReturned` (partial is stored as `true`), `depositReturnedAmount`,
  `isCurrentTenant`, `livedFrom`, `livedUntil`, `createdAt`, `confirmedAt`, `isVisible`.
- No aggregation reads `utilitiesComplete`; N counts all visible reports; the building page
  trims outliers (2.5·MAD) while `getBuildingsData`, the checker and the bot do not; expenses
  are clamped at 0 on the building page and the checker only.
- `getBuildingsData` (`src/lib/cost-aggregates.ts`) gives each building one `rentalType` (the
  dominant one) over medians of all its reports; `/[city]/costs` filters buildings by it.
- `aggregateLocationCheckerCosts` (`src/lib/location-checker.ts`) already counts
  `tenantReportCount` (`user` + `import`) and `sourceKind` (`tenant|mixed|scraped`).
- Overpay or "cheaper/pricier than the district" verdicts: post-submit screen and
  `cost-reports-panel.tsx` (`comparisonOverpay`, `comparisonSave`, `percentHigher/Lower`),
  building page comparison and `district-position-bar.tsx`, checker
  (`cheaperThanDistrict`/`pricierThanDistrict`), `CostsMap` (`vsMedianAbove/Below`), share page
  brag (`share.cardTitle*`, `landingBody*`), bot `verdict` (spec 04).

## The contract

FR-21 (**Decided**: one contract for site and bot); shape **Assumption**.

`src/lib/cost-figures.ts` (pure, no Prisma import) and `src/lib/cost-figures-query.ts`
(server loaders). The bot and every website surface named in this spec read figures only
through them (`CLAUDE.md`: never a second aggregation for the bot).

```ts
type SourceKind = 'user' | 'import' | 'scraped';
type FigureGroupKey = 'tenant' | 'asking'; // tenant = user + import, asking = scraped (Q-3, D24)
type RentalTypeFilter = 'all' | 'apartment' | 'room';

interface MetricFigure {
  median: number | null;
  p25: number | null;
  p75: number | null;
  n: number;
}
interface FigureGroup {
  key: FigureGroupKey;
  reportCount: number; // reports in the group
  sourceCounts: Record<SourceKind, number>;
  observation: 'none' | 'one' | 'several'; // by usable values of the headline metric (below)
  completeTotal: MetricFigure; // all-in totals, complete reports only
  knownPartTotal: MetricFigure; // totals of reports whose utilities are not established
  rent: MetricFigure;
  rentPerM2: MetricFigure; // perAreaValues over reports with areaM2 > 0
  completeTotalPerM2: MetricFigure;
  adminFeePerM2: MetricFigure; // perAreaValues of adminFee (0 counts); the calculator's czynsz anchor (T052)
  expenses: MetricFigure; // complete reports with rent: max(0, total − rent)
  characteristics: {
    rentalType: string | null;
    rooms: number | null;
    areaM2: number | null;
  } | null;
  // only when reportCount === 1, area rounded to 5 m²
  adminFee: MetricFigure;
  utilities: Record<
    'electricity' | 'gas' | 'heating' | 'water' | 'internet' | 'other',
    { value: MetricFigure; includedCount: number; unknownCount: number }
  >;
  rentalTypeCounts: { apartment: number; room: number; unknown: number };
  latestRecordedAt: string | null; // max(confirmedAt ?? createdAt), ISO date
  tenancy: { from: string | null; to: string | null } | null; // null = period unknown
}
interface FigureSummary {
  level: 'building' | 'district' | 'city';
  rentalType: RentalTypeFilter;
  reportCount: number;
  sourceCounts: Record<SourceKind, number>;
  groups: { tenant: FigureGroup | null; asking: FigureGroup | null }; // null = no report of that kind
}
```

Function: `summarizeFigures(reports, { level, rentalType })`. Medians use `computeStats` from
`src/lib/cost-stats.ts` without trimming (Q-3, D24). Rounding as `computeStats` rounds.

### Rules

- **Groups (FR-22):** `tenant` = `user` + `import`, `asking` = `scraped`. Labels: `user` reports
  are "reports from tenants" (never "verified" or "checked"); `import` reports are "entered by
  Passflat from tenants' answers"; `scraped` are "asking prices from listings". A label shows
  the per-source counts where the group has both `user` and `import`.
- **Rental type (FR-30):** the filter restricts reports before anything is computed. `room` and
  `apartment` drop reports whose `rentalType` differs or is `null`; `all` keeps every report and
  `rentalTypeCounts` shows the mix.
- **Completeness (FR-25, FR-26):** a report is complete only when `utilitiesComplete === true`
  (legacy `null` counts as not established: Q-3, D24, `LEGACY_NULL_IS_COMPLETE = false`).
  Complete totals feed `completeTotal` and `expenses`; the others feed `knownPartTotal`.
  Original records are not changed.
- **Zero vs unknown (FR-26):** a stored `0` is a confirmed zero and counts as a value; `null` is
  unknown and is counted in `unknownCount`, never as 0; `*Included === true` counts in
  `includedCount`, not as 0.
- **N (FR-27):** every `MetricFigure.n` counts the usable values of that metric only. `rent`
  and totals count values `> 0`. `reportCount` is shown only as the size of the group, never as
  the N of a metric.
- **Observation (FR-24):** `observation` follows the group's `reportCount`: `one` for exactly
  one report, `several` for more, `none` for zero (Q-3, D24). The headline metric of a group is
  `completeTotal` when its `n ≥ 1`, else `knownPartTotal`, else `rent`; every metric still shows
  its own N, so "4 reports, all-in total from 1" stays visible.
- **Dates (FR-28):** `latestRecordedAt` is when a report was added or confirmed, never shown as
  when the costs were paid; shown as month and year only. `tenancy` is the earliest `livedFrom`
  and the latest `livedUntil` (or "now" for `isCurrentTenant`) over the group, as years only
  ("2025–2026"); `null` when no report has them, and the surface then says the period is
  unknown. Month-and-year and years-only are cautious privacy defaults for one-report groups
  (Q-3, confirmed in D24).
- **Area name:** a reference carries `level`, `slug` and the display name source (`districtName`
  for a district, the city's `nameKey` for a city); each surface renders the name in its own
  locale and grammar (the bot needs case forms such as «по Варшаве»).
- **Area reference (FR-33):** `MIN_AREA_REPORTS = 5` moves from `src/lib/bot/lookup.ts` into
  `cost-figures.ts`. The reference level for a building is the district when the district's
  `reportCount` (visible reports after the rental-type filter) is `≥ MIN_AREA_REPORTS`;
  otherwise the city; when the city has no report either, there is no reference. This is the
  bot's existing rule, now shared. The reference is shown per group with that group's own N,
  so "Mokotów, tenant reports: 3,900 zł (1)" is possible and honest.
- **Deposit statistic (FR-38):** `summarizeDepositReturns(reports)` → `{ answered, gotBack,
full, medianDeposit }`: `answered` = reports with `depositReturned !== null` and
  `isCurrentTenant !== true`; `gotBack` = of them `depositReturned === true`; `full` = of them
  `depositReturnedAmount >= depositAmount` (both present). Shown as "X of N who answered got the
  deposit back, fully or partly" with the area name, only when `answered ≥ 3` (the bot's
  existing gate, now shared: `MIN_DEPOSIT_ANSWERS = 3`); `full` may be shown only with its own
  N. The area is the same level as the cost reference (district or city); a building shows its
  own statistic under the same gate. `DepositCase` rows are never read.

### Golden examples (tests in `src/lib/cost-figures.test.ts`)

1. **Mixed building.** R1 `user` apartment rent 3,200 total 4,000 complete; R2 `import`
   apartment rent 3,000 total 3,700 complete; R3 `user` apartment rent 3,400 total 3,900
   `utilitiesComplete=false`; R4 `scraped` apartment rent 3,500 total 4,100 false; R5 `scraped`
   apartment rent 3,300 total 3,900 false. Expect `reportCount 5`, `sourceCounts {user 2, import
1, scraped 2}`. Tenant: `reportCount 3`, `completeTotal {median 3,850, n 2}`, `knownPartTotal
{3,900, n 1}`, `rent {3,200, n 3}`, `expenses {750, n 2}`, `observation several`. Asking:
   `completeTotal {null, n 0}`, `knownPartTotal {4,000, n 2}`, `rent {3,400, n 2}`.
2. **One observation.** One `user` report, apartment, 2 rooms, 52 m², rent 3,200, total 4,000,
   complete. Tenant `observation one`, `completeTotal {4,000, n 1}`, `characteristics
{apartment, 2, 50}`; asking `null`. With a second `user` report (total 4,200,
   `utilitiesComplete=false`): `observation several`, `completeTotal.n 1`,
   `knownPartTotal.n 1`, `characteristics null`.
3. **Unknown utilities.** One `user` report, rent 2,800, total 3,100, `utilitiesComplete=false`.
   `completeTotal.n 0`, `knownPartTotal {3,100, n 1}`, `observation one`.
4. **Legacy null.** One `user` report, total 3,600, `utilitiesComplete=null`. With the default
   constant: `knownPartTotal {3,600, n 1}`, `completeTotal.n 0`.
5. **Zero vs unknown.** R1 `user` internet 0, complete; R2 `user` internet null, complete; R3
   `user` `internetIncluded=true`, complete. `utilities.internet {value {median 0, n 1},
includedCount 1, unknownCount 1}`.
6. **Rooms and flats.** R1 `user` room total 2,200; R2 `user` apartment total 4,300; R3 `user`
   apartment total 4,500; all complete. `room` → `completeTotal {2,200, n 1}`, `observation one`;
   `apartment` → `{4,400, n 2}`; `all` → `{4,300, n 3}` with `rentalTypeCounts {apartment 2,
room 1, unknown 0}`.
7. **No usable observations.** Zero reports → both groups `null`, `reportCount 0`.
8. **Only asking prices.** Two `scraped` reports → tenant `null`, asking `several`.
9. **Dates.** R1 created 2026-03-10, confirmed 2026-09-01, `livedFrom` 2025-01-01, `livedUntil`
   2026-06-30; R2 created 2026-05-02, no tenancy dates. `latestRecordedAt 2026-09` (month),
   `tenancy {from 2025, to 2026}`. Without R1: `tenancy null`.
10. **Deposit.** In one district: returned 4,000 of 4,000; returned 2,500 of 4,000
    (`depositReturned=true`); `depositReturned=false` with 0; a current tenant with `null`.
    `{answered 3, gotBack 2, full 1}`.
11. **Area reference.** Building without reports, district with 4 visible reports, city with
    40 → reference level `city`. District with 5 → `district`. City with 0 → no reference.

## Loaders

FR-21, FR-30, FR-34. `src/lib/cost-figures-query.ts`:

- `loadBuildingFigures(buildingId, rentalType = 'all')` → `FigureSummary` for that building's
  visible reports (`level: 'building'`).
- `loadAreaReference({ districtId, cityId, rentalType })` → `{ level: 'district' | 'city',
name, summary: FigureSummary } | null` with the rule above.
- `loadDepositReturns({ districtId | cityId })` → the deposit statistic for that area.
- Selects only the fields the contract needs, `isVisible: true`, `take: 5000` as today. Cached
  with `unstable_cache` and tag `costs` (300 s) so `revalidateCostSurfaces()` expires them;
  React `cache()` is not enough. `unstable_cache` throws outside Next (`npm run bot:dev` runs
  the bot with tsx): wrap it in a small helper that calls the loader directly when the Next
  incremental cache is unavailable. Tests `vi.mock('next/cache')` (pattern of
  `src/app/api/cost-reports/[id]/route.test.ts`). Every cache key whose result shape changes
  gets a new key name so old-shape entries are not served after deploy.
- Tests with mocked `@/lib/prisma` (pattern of `src/app/api/location-score/route.test.ts`):
  the `where` includes `isVisible: true`; the rental-type filter is applied before
  `summarizeFigures`; the area fallback of example 11.

## Building page

FR-22, FR-24 – FR-28, FR-31 – FR-33. `src/app/[locale]/[city]/building/[slug]/{page,client}.tsx`.

- **First screen order (FR-32):** address and district → a source line (what exists and from
  where: "3 reports from tenants (1 entered by Passflat) · 2 asking prices from listings") →
  known costs per group with their limits → two actions: "View details" (scrolls to the
  breakdown) and "Add your experience" (`/costs/submit?b=<id>&source=building`). Location score,
  tags, the breakdown and the comparison follow as today. The source line and limitations are
  never behind the contribution gate (`useHasContributed`).
- **Groups:** the tenant group first, then the asking group, each with its own figures and N.
  Never one number over both.
- **One observation (FR-24):** RU «Одно наблюдение по этому адресу» (given); PL, EN, UK draft
  ("One observation at this address"); the values and the known characteristics (rental type,
  rooms, area) are shown; no median, range or comparison.
- **Known part (FR-25):** a `knownPartTotal` is labelled "known part of the costs" (draft) and
  never as the full monthly cost.
- **Breakdown (FR-26):** a utility with only unknown values shows "unknown", an included one
  "included in rent", a confirmed zero "0 zł".
- **Dates (FR-28):** "Last report added or confirmed: <d MMMM yyyy>" (draft, year included);
  "Period of these costs: <from>–<to>" or "The period these costs were paid is not known".
- **Fallback (FR-33):** no visible report → "No data for this building" (RU «По дому данных
  нет», given) first; then the area reference with an explicit label ("Reference: tenant reports
  in <district> (N)" or "… in Warsaw (N)"), shown by group like the building figures; no
  reference → "No figures for this area yet" plus the location score and nuisances. District
  figures are never labelled as the building's.
- **Badges:** `costs.trust.reliable` ("reliable", N ≥ 5) and similar words must not claim
  verification or representativeness (FR-31). Replace "reliable" with a neutral sample-size
  badge ("5+ observations", draft); `earlyData` stays.
- **Metadata:** `generateMetadata` (title, OG image) is a single-number surface: §Single-number
  surfaces, slice 3 (T053).
- **What else the page computes today** (`page.tsx:444-640`) and where it goes:

  | Today                                                        | After                                                                                          |
  | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
  | per-field medians (rent, admin fee, utilities)               | per group from the contract (`rent`, `adminFee`, `utilities`)                                  |
  | winter / summer electricity and heating, periodic charges    | kept in the breakdown, computed over the tenant group's reports, labelled with the group and N |
  | per-m² medians                                               | `rentPerM2`, `completeTotalPerM2` per group                                                    |
  | deposit return rate (`isCurrentTenant === false`, no N gate) | `summarizeDepositReturns` for the building, `answered ≥ 3`                                     |
  | median deposit, deposit months, tenure, lease type           | kept, over the tenant group only, labelled with N                                              |
  | `utilitiesUnknown` chip (`user` + `false` only)              | replaced by the group's known-part figure                                                      |
  | outlier trimming (2.5·MAD)                                   | removed: untrimmed medians (Q-3, D24)                                                          |
  | comparison, percentile, position bars                        | §Comparisons                                                                                   |

- **Event:** `building_detail_viewed` keeps `report_count`, `user_count`, `import_count`,
  `scraped_count` (spec 01) from `sourceCounts`.

## Comparisons

FR-29 (**Decided**: no overpay / saving verdict); comparability **Assumption**.

- Remove every "you overpay / you save / cheaper / pricier than the district" conclusion listed
  under Current state, on the website. The bot's verdict is spec 04.
- Allowed instead: side-by-side reference values with their group label and N ("This building,
  tenant reports: 4,000 zł (2) · Mokotów, tenant reports: 3,900 zł (37)").
- A percentage, a position bar or a percentile only when both sides are the same group kind,
  both are restricted to the same single rental type, and both N ≥ 5 (CLAUDE.md N ≥ 5 gate).
  Otherwise no comparative statement. The building page, checker and bot load
  `rentalType: 'all'`, so in PRD 1 no percentage appears there: side-by-side values only.
- Surfaces and their data sources:
  - building page comparison section, `cheaperThanPercentile` and `district-position-bar.tsx`;
  - post-submit screen: the comparison is computed in `POST /api/cost-reports`
    (`src/app/api/cost-reports/route.ts:718-781`, blended district median); the response
    switches to the contract's area reference (tenant group, with N and level) and the client
    shows it side by side with the user's own total;
  - dashboard `CostReportsPanel` (`dashboard/page.tsx:129-131`, via `cost-baselines`): switches
    to `loadAreaReference`;
  - checker (§Checker);
  - `CostsMap` popups (`vsMedianAbove/Below/Equal`): removed;
  - share page (`costs/share/page.tsx`, `share.cardTitle*`, `landingBody*`): the card stays
    without a "less than X % of …" brag and shows the area reference neutrally (draft).
- `src/lib/cost-baselines.ts` (`getDistrictCostStats`, `getCityCostStats`) stays only for the
  single-number surfaces frozen by Q-2 and the share page; every consumer named in this spec
  (dashboard, post-submit, checker, bot) moves to the contract. List the remaining consumers in
  the progress entry.

## Checker

FR-22, FR-24, FR-29, FR-33, FR-34. `src/app/api/location-score/route.ts` (`summariseCosts`) and
`src/app/[locale]/[city]/check/client.tsx` read the building summary and the area reference
from the contract (the same loaders as the bot). The result shows the groups with N, one
observation, the labelled reference (district or city, with the `MIN_AREA_REPORTS` rule, no
longer an ungated district median), and the deposit statistic from `loadDepositReturns`. The
existing `sourceTenant` / `sourceMixed` / `sourceScraped` keys are reused or replaced by the
group labels. `aggregateLocationCheckerCosts` is removed or becomes a thin wrapper over the
contract; no second median code remains.

## Costs overview: room / flat filter

FR-30, FR-34. `getBuildingsData` keeps its existing fields byte-identical (they feed the home
page, city hub, district pages, calculator and blog report, all frozen by Q-2) and adds
`byType: { apartment, room }`, each `{ medianTotal, medianRent, reports }` computed with
`computeStats` over that type's reports only (the same D4 blend as the existing fields, just
type-restricted; labelled as the blend until Q-2). The `/[city]/costs` filter uses `byType` of
the selected type instead of the dominant type; a building with no report of that type is not
shown under the filter, and counts follow the filter. Bump the cache key
(`cost-aggregates-buildings` → a new name). The district tab's median of building medians
(`costs/client.tsx:212-243`, `rollUpDistricts`) can differ from `loadAreaReference`'s median of
reports for the same district: accepted until Q-2, noted in the progress entry. Golden test:
example 6 as buildings data (`byType.room.medianTotal 2,200`, `byType.apartment.medianTotal
4,400`).

## Single-number surfaces

FR-23, **Decided** (Q-2 option (a), D23, 2026-11-19; supersedes D4 for these surfaces). Map
markers and popups (`CostsMap`), list cards, district roll-ups (`rollUpDistricts`), the city
hub, district pages, the calculator baseline, the home hero and district medians, the home "top
building", the blog data report and OG images show one number per building or area. So do the
bot's `/districts` table with its "cheapest" rank (`lookup.ts:245-266`, `format.ts:269-277`,
labelled "по отчётам жильцов") and the neighbour medians in the bot and the checker
(`lookup.ts:138`, `location-score/route.ts:384`). The share page and its OG card show one
district figure too and follow the same rule. Every "until Q-2" note elsewhere in this spec
(costs overview, building metadata, `cost-baselines` consumers) ends with these tasks.

### The rule

- **Decided:** each building or area shows the tenant group (`user` + `import`) when that group
  has a usable value, otherwise the asking-price group (`scraped`); the number is always
  labelled with its group and its N. Scraped reports stay in the database and on the building
  page, where both groups are shown (§Building page). A blended number over both groups is never
  shown again on these surfaces.
- **Assumption (one function in `src/lib/cost-figures.ts`, for example
  `singleNumberFigure(summary)`):** "usable value" means the group's headline metric of the
  contract has `n ≥ 1` (`completeTotal`, else `knownPartTotal`, else `rent`, as in §Rules). The
  group is chosen once per building or area and every number of that item comes from it (a
  card never mixes tenant rent with an asking total). A known-part total is labelled "known
  part" (FR-25); one report is shown with N 1 and no range (FR-24).
- **Area figures** (district roll-ups, district pages, city hub, home district medians, the bot's
  `/districts`) are `summarizeFigures` over the area's visible reports (median of reports, not a
  median of building medians), so a district shows the same value and N as `loadAreaReference`
  (FR-34). The rental-type filter of a surface is applied before the summary (FR-30).
- **Ranks and "cheapest" lines** follow §Comparisons: a rank, "cheapest" or position statement
  only across items whose figures pass `isComparable` (same group, same single rental type, both
  N ≥ 5). With `rentalType: 'all'` (the bot's `/districts`, the typed-district rank line) no
  rank is shown; the table lists each area's value with its group and N. Sorting a list by
  value is a display order, not a claim, and is allowed.
- **Labels (draft copy, four locales and bot RU/UK):** "tenant reports (N)", "asking prices
  (N)", "known part". Existing keys such as the bot's «по отчётам жильцов» are used only when the
  figure is the tenant group. Name the keys in the progress entry (Q-8: the owner reviews draft
  copy before deploy).
- **Caching:** every cache key whose result shape changes gets a new name (§Loaders).

### Golden examples (tests in `src/lib/cost-figures.test.ts`)

12. **Tenant wins.** Example 1's building → tenant, `completeTotal` 3,850 (n 2), label "tenant
    reports (2)".
13. **Asking fallback.** Two `scraped` reports, totals 4,100 and 3,900, `utilitiesComplete=false`
    → asking, known part 4,000 (n 2), label "asking prices (2), known part".
14. **Tenant with fewer reports still wins.** One `user` report, total 3,100,
    `utilitiesComplete=false`, and three `scraped` reports → tenant, known part 3,100 (n 1).
15. **Area.** A district with 3 tenant and 40 asking reports → the district figure is the tenant
    group with N 3; its value equals `loadAreaReference(...).summary.groups.tenant`'s headline.
16. **No rank without comparability.** Districts A tenant 3,900 (37), B tenant 3,500 (6), C
    asking 3,200 (12), D tenant 3,000 (2), all `rentalType: 'all'` → no "cheapest" line; with
    `rentalType: 'apartment'` and the same figures, only A and B may be ranked (B before A).

### Slices (one loop iteration each)

1. **T028:** the rule function with examples 12–16, and the costs overview (`/[city]/costs`):
   `getBuildingsData` gives each building the chosen group, metric, median and N (per rental
   type, replacing the blended `byType`); map markers and popups, list cards and the district
   tab (district-level summaries instead of `rollUpDistricts`) show it with the label.
2. **T052:** the city hub (`[city]/page.tsx`), district pages (`[city]/[district]/page.tsx`),
   the calculator baseline (`[city]/calculator/page.tsx`, tariffs unchanged), the home hero's
   district medians and the home "top building" (`[locale]/page.tsx`).
3. **T053:** the blog data report (`blog/warsaw-rent-prices/page.tsx`), OG images (`/api/og`
   and every `generateMetadata` that passes a number to it, the building page included) and the
   share page with its OG card.
4. **T054:** the bot's `/districts` table and rank, the typed-district rank line and its
   `tg_district_checked.report_count`, the neighbour medians in the bot and the checker
   (`aggregateLocationCheckerCosts`); then remove `cost-baselines.ts` and the blended
   `getBuildingsData` fields when nothing reads them (knip), and update `CLAUDE.md` "Cost data
   honesty", this spec, `README.md`, `src/lib/bot/README.md` and `docs/architecture.md` so no
   text says single-number surfaces blend sources.

## Marketing copy

FR-31, **Decided** (Q-4, D25, 2026-11-19; supersedes D3 for honesty copy). Rewrite every key
below in all four locale files to "costs tenants reported" / "reported costs" wording (RU «расходы,
о которых сообщили жильцы» / «сообщённые расходы» or the closest natural phrase; the agent
drafts PL, EN, RU, UK and lists every key in the progress entry for the owner's review, Q-8).
No key may say "verified", "checked by tenants", "actually pay" or "returned in full" about
reported figures. `faqA3` becomes "got it back, fully or partly". Where a key states a number
of tenant reports for a count that includes asking prices, the count becomes the tenant group's
count or the wording names both groups. The home hero and the blog-report deposit numbers use
`summarizeDepositReturns` (gate `MIN_DEPOSIT_ANSWERS`, "X of N who answered got it back, fully or
partly"); below the gate the claim is not shown.

The list as found on 2026-11-19. Keys that claim verification or that a blended figure
is what tenants pay (same key in all four locale files): `landing.hero.subtitle`,
`landing.hero.trustRealCostDesc`, `landing.hero.trustVerified`, `trustVerifiedDesc`,
`landing.bentoGrid.realCostDataDesc`, `landing.costTransparency.subtitle`,
`landing.costTransparency.anonymousVerified`, `communityVerified`, `landing.faq.a5`,
`landing.checkAddress.subtitle`, `share.landingHeading`, `share.cardTitleArea`,
`rentReport.storyReality`, `storyNotException`, `faqA1`, `faqA3` ("back in full"),
`checker.subtitle`, `checker.result.checkedAddress`, `costsSeo.cityMetaDescription`,
`districtIntro`, `costs.subtitle`, `costs.overview.title`,
`costs.building.lookingForApartmentDesc`, `howItWorksPage.seekers.step1Title`,
`blog.topic4Desc`, `helpCenter.costTransparency.a1`, and `costs.building.basedOnReports` /
`estimateCaption` where they say "tenant reports" for counts that include asking prices (the
building page task fixes the latter two through the groups). The numbers behind the deposit
claims are in the same decision: the home hero (`src/app/[locale]/page.tsx:50-54`,
`landing.hero.statsDeposit`) and the blog report (`blog/warsaw-rent-prices/page.tsx:68-83`)
count partial returns and current tenants as "returned"; they switch to
`summarizeDepositReturns` (above). A search of `src/i18n/messages/en.json` for "verified",
"checked", "actually" and "in full" after the rewrite finds no claim about reported figures;
the progress entry lists any match left and why.

## Parameters to confirm

Q-3, **Decided** (D24, 2026-11-19): the owner confirmed every cautious default as built, each
one constant in `src/lib/cost-figures.ts`: `tenant = user + import`, with `import` labelled as
entered by Passflat from a tenant's answers; `LEGACY_NULL_IS_COMPLETE = false` (legacy
`utilitiesComplete = null` is not established); medians untrimmed everywhere
(`TRIM_OUTLIERS = false`); expenses `max(0, total − rent)` (`CLAMP_EXPENSES_AT_ZERO`);
`observation one` = a group with exactly one report; dates as month and year, tenancy as years,
area rounded to 5 m² for one report; `MIN_DEPOSIT_ANSWERS = 3`, also for a building's own
deposit statistic; the reference level chosen by the district's total report count and shown
per group with its own N. T030 (done) kept the values and the golden tests, marked the
constants' block and `areaReferenceLevel` as decided (D24), and pins every value in the
constants test of `src/lib/cost-figures.test.ts`, so a change is deliberate.

## Consistency

FR-34. For the same reports, the building page, the checker, the bot and (after T028–T054) the
map, cards and area pages show the same median and N of the same metric and group. A test in the checker task
and one in the bot task feed the same fixture through both paths and compare. Every new cached
loader carries the `costs` tag.
