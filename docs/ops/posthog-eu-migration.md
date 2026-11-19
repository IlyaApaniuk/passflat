# PostHog EU migration: owner checklist

- **Decision:** D30 (2026-11-19; PRD 1 Q-11, PRD 2 decision 7). Production analytics move to a
  new PostHog EU Cloud project together with the PRD 1 deploy. History stays in the current US
  project.
- **Who:** the owner. Agents never change PostHog settings, Vercel variables or deployments;
  the PostHog MCP server is read-only.
- **Source of the facts below:** the code at the commit that added this file, and the US
  project read through the PostHog MCP server (read-only) on 2026-11-19: project "Default
  project", id 451195, created 2026-06-02, `api_host` `https://us.i.posthog.com`, time zone
  UTC.

## 1. Create the EU project

1. Sign up or log in at `https://eu.posthog.com`. EU Cloud is a separate instance: the US
   organisation and its project cannot be moved there, so the EU side gets its own organisation
   and project.
2. Create one project for production (for example "Passflat"). Set the time zone to **UTC**,
   as in the US project, so weekly readouts (Monday–Sunday) stay comparable across the move.
3. Copy the new project's API key (`phc_…`). It is public by design (it ships to browsers), but
   it still goes only into Vercel, never into the repository.

## 2. Recreate the project settings by hand

Values read from the US project on 2026-11-19.

| Setting                                          | US value                                                                                                                                       | In the EU project                                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Filter out internal and test users               | 5 filters: event `$current_url` does not contain `http://localhost:3000/`; person `email` does not contain each of 4 internal e-mail addresses | The same 5 filters. Copy the 4 addresses from the US settings page (they are personal data and are not written here) |
| Filter test accounts by default                  | on                                                                                                                                             | on                                                                                                                   |
| Autocapture (events)                             | on                                                                                                                                             | on                                                                                                                   |
| Exception autocapture                            | on                                                                                                                                             | on (the client also sets `capture_exceptions: true`)                                                                 |
| Web vitals autocapture                           | on, all metrics                                                                                                                                | on, all metrics (FR-13's post-deploy check compares `$pageview` with `$web_vitals`)                                  |
| Console log capture, network timing (recordings) | on, on                                                                                                                                         | on, on                                                                                                               |
| Heatmaps                                         | on                                                                                                                                             | on                                                                                                                   |
| Dead clicks                                      | off                                                                                                                                            | off                                                                                                                  |
| Session replay (project switch)                  | on; mask all inputs; retention 30 days; no sample rate, linked flag or URL/event triggers                                                      | the same; the code starts recording only after consent and for sampled persons (flag below)                          |
| Surveys                                          | none configured                                                                                                                                | none (the client disables surveys until consent)                                                                     |
| Anonymise IPs                                    | off                                                                                                                                            | as before unless the owner decides otherwise                                                                         |
| Data attributes                                  | `data-attr`                                                                                                                                    | `data-attr`                                                                                                          |
| Authorised URLs (toolbar, heatmaps)              | none                                                                                                                                           | optional: `https://passflat.com`                                                                                     |
| Group analytics, cohorts, actions, experiments   | none in use                                                                                                                                    | nothing to recreate                                                                                                  |

The test-account filter cannot exclude the owner's anonymous visits in memory mode (D10), in
either project.

## 3. Recreate the feature flags by hand

Every flag key the code reads (`src/lib/feature-flags.ts`, `useFeatureFlagEnabled`,
`isServerFeatureFlagEnabled`), with its US definition. All five are boolean, have one condition
set with no property filters, no payload, no variants and evaluation runtime "all".

| Key                         | Enabled | Rollout | Read by                                                                                                                               | If missing in the EU project                                     |
| --------------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `session-recording-sample`  | yes     | 20 %    | `src/components/providers/posthog-provider.tsx` (`SessionRecordingGate`; recording only with consent)                                 | recordings stop: **recreate before the deploy**                  |
| `promoted-listings-enabled` | no      | 100 %   | client: `dashboard/client.tsx`, `create-listing/page.tsx`, `listing-card.tsx`; server: `api/checkout/listing/route.ts` (fails closed) | promotion stays off, as today                                    |
| `show_stats`                | no      | 100 %   | `src/app/[locale]/about/client.tsx`                                                                                                   | stats stay hidden, as today                                      |
| `show_testimonials`         | no      | 100 %   | `src/app/[locale]/how-it-works/client.tsx`                                                                                            | testimonials stay hidden, as today                               |
| `hero-variant-b`            | no      | 50 %    | declared in `feature-flags.ts` only; no component reads it (the hero A/B is parked)                                                   | nothing changes; recreate disabled only to keep the list in step |

- "Enabled: no" flags still have their rollout stored; recreate them disabled with the same
  rollout so that switching one on later behaves as it would have in the US project.
- The client bootstraps four of the keys to `false` and then reloads flags, so a missing flag
  reads as off.
- `cost-report-delete-enabled` appears only in a comment of `posthog-provider.tsx`; neither the
  code nor the US project has it. Nothing to recreate.

## 4. Change the Vercel environment variables

The code reads exactly two PostHog variables (`.env.example`, `posthog-provider.tsx:127-135`,
`posthog-server.ts:6-10`); there is no personal API key, project id, reverse proxy or other
PostHog setting in the code.

| Variable                   | Where it is used                                                                                                                                               | New value                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_POSTHOG_KEY`  | browser SDK (`posthog-provider.tsx`) and server SDK (`posthog-server.ts`: server events, Telegram bot events, server flag checks, `instrumentation.ts` errors) | the EU project's API key                                                                                       |
| `NEXT_PUBLIC_POSTHOG_HOST` | both SDKs; both default to `https://eu.i.posthog.com` when unset                                                                                               | `https://eu.i.posthog.com` (or remove the variable). It points to the US host today, since events arrive there |

- Change both in **Production** (and in **Preview** if previews send analytics). Both are
  `NEXT_PUBLIC_*`, so they are inlined at build time: the change takes effect only with a new
  build. Set them before the PRD 1 deploy so that one build carries both.
- The Telegram bot runs in the same Vercel project (webhook and cron routes), so it moves with
  the same two variables. The dev bot runs without a key, as locally.
- Locally nothing changes: the key stays commented out in `.env.local` (CLAUDE.md), and
  `.env.example` keeps empty placeholders.

## 5. Deploy and verify

1. Before the deploy: EU project created, settings (§2) and `session-recording-sample` (§3)
   recreated, both variables changed (§4).
2. Deploy PRD 1 (with the bot launch, D29). Note the deploy time: it is the **move date**.
3. In the EU project's Live Events, within the first hour: a `$pageview` from a landing page on
   `passflat.com` (also the FR-13 check), a server event (for example `tg_bot_started` from the
   production bot or `cost_report_submitted`), and `$feature_flag_called` for
   `session-recording-sample`.
4. In the US project: no new `passflat.com` events after the move date (stragglers from open
   tabs with the old build can arrive for a short while).
5. Consent and identity behave as before (D10); every visitor starts as a new person in the EU
   project, because identities are per project. Consented browsers keep an unused
   `ph_<old key>_posthog` cookie until it expires; the cookie table's `ph_*` entry still covers
   both.

## 6. Re-authenticate the MCP server

`.mcp.json` points to `https://mcp.posthog.com/mcp?readonly=true`, which does not name a
region; the login decides which organisation and project the server sees.

1. In Claude Code run `/mcp`, choose `posthog`, sign out or re-authenticate, and log in to the
   EU organisation. Keep the read-only URL.
2. Check with the `project-get` tool that the active project's `api_host` is
   `https://eu.i.posthog.com`.
3. Reading history later needs the US login again (or a second, separately named server entry
   for the US region). Each readout states which project it read.

## 7. What stays in the US project

- All events, persons and sessions from 2026-06-02 to the move date; session recordings expire
  after their 30-day retention.
- Saved insights, dashboards (the primary dashboard included), the test-account filters and the
  flag definitions. Nothing is copied: recreate only what a readout needs.
- Readouts that span the move date query both projects, report each project's numbers
  separately with its date range, and never add persons across projects (the ids differ).
  Numbers before 2026-07-28 remain not comparable (D10).
- Do not delete the US project; whether and when to close it is the owner's call.

## 8. Region statements in the repository (checked 2026-11-19)

| Place                                                                                    | What it says                                                           | After the move                                                                                                                                 |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/providers/posthog-provider.tsx:135`, `src/lib/posthog-server.ts:10`      | default host `https://eu.i.posthog.com`                                | correct; no change                                                                                                                             |
| `CLAUDE.md` §Analytics                                                                   | "PostHog (EU)"                                                         | correct after the move (wrong until then, since production sends to the US project)                                                            |
| `docs/architecture.md` §5                                                                | "the host defaults to `https://eu.i.posthog.com`"                      | correct; no change                                                                                                                             |
| `docs/analytics/activation-funnels.md` §Limitations                                      | states the decided move                                                | after the verification, add the move date and that earlier history is in the US project                                                        |
| `.claude/skills/metrics-review/SKILL.md`                                                 | "select the Passflat project" by its events                            | both projects have the same events; name the EU project and the move date there after the move                                                 |
| `docs/product/reviews/2026-11-18-metrics.md`, the decision reviews                       | the US host and project id                                             | dated records; keep                                                                                                                            |
| Privacy policy, `privacy.transfers.processors` in `src/i18n/messages/{pl,en,ru,uk}.json` | "Supabase and PostHog data locations depend on instance configuration" | not wrong (it names no region). Stating that PostHog data is stored in the EU is legal text: the owner's call, agents do not change the policy |
| Cookie table (`phName` `ph_*`, `phPurpose`)                                              | PostHog analytics cookies                                              | correct; no change                                                                                                                             |

No statement in the code, `CLAUDE.md`, `docs/architecture.md` or the privacy-policy copy becomes
wrong because of the move.
