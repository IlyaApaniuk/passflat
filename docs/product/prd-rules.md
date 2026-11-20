# PRD rules

From a PRD, Claude writes specs and atomic tasks for the build loop. The more precise the PRD,
the fewer questions and rewrites. These rules, the requirement template, the example and the
readiness checklist apply to every PRD. Adapted on 2026-11-18 from the rules used for Kwitax.

## How a PRD becomes work

1. **BRD** (`brd.md`): idea, model, limits, stages and the assumption registry A1, A2, … One per
   project, changes rarely.
2. **PRD** (`prd/prd-<n>-<slug>.md`): one stage, what we build and why. It does not repeat
   business assumptions; it cites them by BRD number. A PRD that tests a hypothesis names it
   (H<n>) and the experiment (E<n>) with its metric and threshold.
3. **Decision review** (`prd/prd-<n>-decision-review.md`): one file written by Claude with
   everything an agent may not decide (rule 5), each with a proposal and options, plus open
   questions and new assumptions for the BRD. The owner answers before decomposition.
4. **Specs** (`../specs/`): Claude writes specs per area, in English. Each spec cites the
   requirement IDs. A separate architect agent looks for gaps in the specs before tasks exist.
   The owner does not have to read them.
5. **Tasks** (`../../ralph/tasks.json`): atomic, one testable change each, with acceptance
   criteria and check commands.
6. **Loop**: iterations see only the specs and tasks. Anything missing from the PRD the agent
   either asks about or makes up. Both are expensive.
7. **Questions** go into the decision review or the PRD's open questions; the answer changes the
   PRD itself, not just the chat.

## Ten rules

1. **One requirement, one testable behaviour.** A requirement has an ID FR-N that is never
   reused. If "and" joins two actions, it is two requirements.
2. **Every requirement has acceptance criteria**: given what input, when the user or the system
   does what, then what must result. No criteria, no work.
3. **Numbers instead of adjectives.** Not "fast", "convenient", "many" but "answer in the bot
   within 3 s", "a building figure only from N ≥ 3 reports", "3 attempts".
4. **Every statement carries its certainty**, in the text:
   - **Decided**: build as written.
   - **Assumption**: build it so it is easy to change; the spec and the task log name it.
   - **Open**: the task is blocked, the question goes to the owner.
5. **Boundaries are explicit.** A PRD has a "Not in scope" section. Agents never decide: prices
   and tariffs, legal texts and legal reasoning (terms, privacy policy, disclaimers, deposit
   rules, letters), choice of external services and anything that costs money, which personal
   data is stored and for how long, the consent model, the honesty rules for displayed figures,
   deployments, production migrations and RLS.
6. **Every figure rule has a numeric example**: input reports with source kind, values and
   dates, and the expected output (median, range, N, label, fallback level). Such examples become
   golden tests. A display or aggregation rule without an example is not taken into work.
7. **Edge cases sit next to the requirement**: empty state, error, partial data, one report,
   repeated action, no network, someone else's data, a bot user who never answers. If behaviour
   is not described, the agent picks the most cautious option and marks it.
8. **References are exact**: to a file or route, to a decision (D7), to a spec section, to a BRD
   assumption (A12), to a hypothesis (H3) and experiment (E5). Any statement about demand, price,
   market, law or a provider cites an assumption or becomes a new one. Never "see above".
9. **User-facing copy.** Key wording is set in the PRD: disclaimers, errors, legal-sounding
   statements, buttons that ask for money or data. Where precision matters, write it in Polish
   and Russian directly. Other copy the agent drafts in four languages and marks for review.
10. **Changes are visible.** A PRD has a version and a "What changed" section. Decisions go into
    `decisions.md`. A changed requirement gets a new task; finished work is never silently
    rewritten.

## Requirement template

Copy the block and fill it in. Write "none" or "agent's choice" rather than leaving a field empty.

```text
FR-N. Short name
Milestone: M1 · Priority: Must / Should / Could · Status: Decided / Assumption / Open
Who and when: <user or system> <does what> <at which moment>
Result: <what must happen>
Acceptance criteria:
  1. Given … When … Then …
  2. …
Edge cases: empty / error / repeat / partial data / someone else's data
Data: which fields are stored and for how long
Analytics: events and properties (names exactly), or "none"
Screen: <route or component> or "no design"
Copy: key wording or "agent draft"
Depends on: FR-…, D…, A…, H…/E…
Open questions: Q-… (who decides, what it blocks)
```

## Example

**Bad:** "The building page should show costs honestly and clearly." Which costs, what is
"honestly", how do we check it is done?

**Good.** The numbers below show the form, not decisions.

```text
FR-7. One observation per building
Milestone: M2 · Priority: Must · Status: Decided
Who and when: a visitor opens a building page that has exactly one usable report
Result: the figure is labelled as one observation, not as the building's price
Acceptance criteria:
  1. Given one `user` report with rent 3,200 zł and utilities complete,
     when the page renders, then it shows "One observation at this address" and the values,
     and no median, range or comparison with the district.
  2. Given one report with `utilitiesComplete=false`, then the total is shown as
     "known part of the costs" and is excluded from the all-in median.
  3. The bot answer for the same building shows the same label and values.
Edge cases: zero usable reports → "no data for this building" plus a labelled district figure;
  reports only of kind `scraped` → labelled as asking prices
Data: none new
Analytics: `building_detail_viewed` gets `report_count` and `source_kinds`
Screen: src/app/[locale]/[city]/building/[slug]
Copy: agent draft in four languages, marked for review
Depends on: FR-5 (shared figure contract), D4 (blended medians)
Open questions: none
```

## Checklist: a requirement is ready

- It has an ID, a milestone and a priority.
- Acceptance criteria can be checked by a test or by eye in a minute.
- No "fast", "convenient", "many" without numbers.
- Every statement is marked Decided, Assumption or Open.
- Edge cases are described or explicitly left to the agent.
- A route or component is named, or "no design".
- Key copy is given or marked as a draft.
- Every figure rule has a numeric example.
- Analytics events and properties are named, and the metric of the tested hypothesis is
  measurable with them.
- Every open question has an owner and it is clear what it blocks.
- Dependencies on other requirements, decisions and assumptions are given.
- Business assumptions are cited by BRD number. The requirement does not rest on a contradicted
  assumption.

## What the agent does when the PRD lacks something

| Situation                                                     | What the agent does                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| No acceptance criteria                                        | Does not take it; proposes criteria in the decision review               |
| Marked Assumption                                             | Builds it, puts the value in config or a constant, names it in the spec  |
| Marked Open                                                   | Blocks the task; the question goes into the task and the decision review |
| PRD contradicts the decision log                              | The later decision wins; the PRD is corrected                            |
| PRD contradicts the BRD or rests on a contradicted assumption | Does not decide; it goes into the decision review                        |
| A claim about demand, price or a provider without an A-number | Proposes a new assumption for the BRD in the decision review             |
| A detail without description: spacing, field order, a hint    | Decides by neighbouring screens, does not ask                            |
| Money, legal text, personal data, honesty of figures          | Never decides                                                            |

## Glossary

One word, one meaning, across PRDs and specs.

| Term              | Meaning                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Cost report       | One record of what a flat costs: rent, administrative fee, utilities, extra charges (`CostReport`)              |
| Source kind       | `user` (a tenant's own report), `import` (entered on someone's behalf), `scraped` (asking price from a listing) |
| Building          | A street address with a number; never an apartment                                                              |
| Baseline          | Median and range for a building, district or city from usable reports                                           |
| Usable reports    | Reports that qualify for a given metric (for example utilities complete for an all-in total)                    |
| Checker           | The address check: known costs, location score, nuisances and nearby buildings                                  |
| Deposit case      | One tenant's deposit-return flow in the bot (`DepositCase`): answers, verdict, letter, follow-ups, outcome      |
| Waitlist interest | A saved interest for a city, district or listing type (`CityNotifySubscription`, `TelegramSubscription`)        |
| Activation        | The first useful result in a session or chat: an answered address, a viewed offer, a generated letter           |
