---
name: metrics-review
description: Read Passflat's production metrics in PostHog (read-only) and report per hypothesis and experiment - funnels, entry pages, channels, languages, the bot - with what improved, what is stuck and what to try, saved to docs/product/reviews. Use when the owner asks about numbers, metrics, funnels or whether a hypothesis works ("что по метрикам", "проверь гипотезы", "как воронка", "что в постхоге").
argument-hint: '[focus: e.g. deposit, roommate, checker, channels, last 30 days]'
allowed-tools: Read, Write, Edit, Glob, Grep, mcp__posthog, Bash(git status *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(git branch --show-current)
---

# Metrics review

Reply to the owner in Russian; write the readout file in English.

## 1. Prepare

- Read `docs/product/hypotheses.md`, `docs/product/experiments.md`, the newest file in
  `docs/product/reviews/` matching `*-metrics.md`, and the analytics section of
  `docs/architecture.md` (event names and where they are captured).
- PostHog: the MCP server `posthog` (read-only). If its tools are missing or unauthenticated,
  stop and tell the owner to run `/mcp` → posthog → Authenticate in a session opened in the
  `passflat` folder.
- Select the Passflat project (list projects; confirm by events such as `cost_form_started`,
  `checker_viewed`, `tg_bot_started`). Write its name and id into the readout.

## 2. Collect

Use SQL over `events` (HogQL) for exact numbers; use trends or funnels where they are clearer.
For every number record: date range, query or insight, and whether it counts events, persons
(`distinct_id`) or sessions. Default range: the last 8 full weeks (Monday to Sunday) plus the
current partial week, labelled as partial.

Minimum set:

1. **Traffic per week**: `$pageview` persons and sessions, by `$current_url` path group
   (home, district/city costs, building, checker, calculator, roommate/listings, blog, templates),
   by locale (first path segment), by `ref` and UTM source, by referring domain.
2. **Jobs per week**: checker (`checker_viewed`, `address_checked`, `checker_check_failed`),
   building (`building_detail_viewed`), calculator (`calculator_viewed`, `calculator_estimated`),
   cost form (`cost_form_started` → `cost_form_address_selected` → `cost_form_submit_attempt` →
   `cost_form_submit_success`, plus `cost_form_submit_error` and `cost_form_validation_error`),
   listings and roommate (`listing_detail_viewed`, `interest_modal_opened`,
   `listing_external_contact_clicked`), templates (`template_downloaded`), affiliate
   (`affiliate_link_clicked`), payments (`checkout_initiated`), auth (`auth_started`).
3. **Funnels**: entry page → first useful action → contribution, per entry page group and
   locale; form start → success with the drop step.
4. **Bot**, if any `tg_*` events exist: starts, address and district checks, deposit flow steps.
5. **Experiments**: every row in `experiments.md` with status Running or Done and an empty result
   (for example E3 by `ref` for 2026-07-29 – 2026-08-11, E7 affiliate clicks since 2026-08-27).
6. **Data quality**: test traffic exclusion (internal or test filters in the project settings),
   bots, events with missing properties, and the D10 break on 2026-07-28.

Never export or quote personal data (emails, IPs, person properties) into the readout.

## 3. Analyse

- Where does activation already happen without manual outreach? Which entry, language and
  channel combinations convert, with counts.
- The biggest leak in each funnel, as a step with counts.
- Per hypothesis: supported, contradicted, no data, or not measurable yet (name the missing
  event or property).
- Two or three concrete levers to improve the numbers (copy, flow, channel, offer), each with the
  expected metric change and the cheapest test.

## 4. Write

Create `docs/product/reviews/<YYYY-MM-DD>-metrics.md`: project and date range, a short verdict,
tables per section above, hypotheses with their verdict, levers, data-quality notes, and the
queries used (in an appendix). Update the "Result" column in `experiments.md` only for facts you
measured, with the date range. Commit both on the current branch (never `main`) with the subject
`Metrics readout <date>` and the last line
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 5. Reply

At most eight lines in Russian: the verdict, three numbers that matter, the top two levers, and
the file path. Offer, do not do: new hypotheses, experiments or PRD requirements from the
levers; the owner picks.

## Never

Change anything in PostHog (flags, experiments, insights, dashboards, settings); enable analytics
locally; put personal data into files or chat.
