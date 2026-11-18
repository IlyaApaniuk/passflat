# Development workflow

Project context is in `CLAUDE.md`, the shared entry point for agents is `AGENTS.md`, and the
build loop is described in `docs/ralph-loop.md`. Instructions guide agents; CI runs the checks.

## Start a task

1. Read `CLAUDE.md` and inspect `git status --short`; identify existing work to preserve.
2. Check the branch: never work on `main`.
3. Read the relevant source, tests and spec. Distinguish current code from proposed behaviour.
4. State the deliverable, acceptance criteria and any unresolved decision that affects it.
5. Implement one reviewable slice, run the relevant checks, inspect the focused diff, and hand
   off evidence and limitations.

Product scope comes from the current PRD in `docs/product/prd/`, translated into
`docs/specs/`. Loop tasks live in `ralph/tasks.json`.

## Local setup

Node 24 locally (CI uses Node 20), npm with `package-lock.json`.

```sh
npm ci                # runs prisma generate (postinstall)
supabase start        # local stack, project id passflat: API 54321, DB 54322, Studio 54323, Mailpit 54324
npm run dev           # the owner's dev server on port 3000
```

Next loads `.env.local`; the Prisma CLI reads `.env`. Both point to the local stack
(127.0.0.1:54322). `.env.prod` holds production credentials and is never used by tools or
agents. Agents use ports 3100–3199 for their own servers and stop them afterwards.

The PostHog key is commented out in `.env.local` on purpose, so no event reaches PostHog from
localhost. The Telegram dev bot token and an Anthropic API key are in `.env.local`; tests mock
both, and agents never start the bot (`npm run bot:dev` takes the dev bot's updates).

## Checks by change

| Change                            | Minimum useful verification                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Documentation                     | Verify paths and commands; format only changed Markdown; inspect the diff                    |
| Cost aggregation or display rules | Focused unit tests with fixtures per source kind and sample size; check every consumer       |
| Bot handlers or texts             | Unit tests with mocked Telegram, Google and Anthropic clients; RU and UK copy; HTML escaping |
| API routes                        | Route tests for validation, errors and the success path; no real external calls              |
| Schema or migration               | `npx prisma migrate dev` on the local stack, typecheck, inspect the SQL; name new tables     |
| Analytics events                  | Unit test around the capture call; event and property names as the spec defines them         |
| UI, routing, translations, build  | Lint, typecheck, affected tests, build; four locale files keep identical key sets            |

## The gate

The gate of every task is `npm run verify`. It runs, in order, and stops at the first failure:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run knip` (dead files and dependencies; CI and the pre-push hook run it too)
4. `npm test` (Vitest, `src/**/*.{test,spec}.{ts,tsx}`)
5. `npm run build` (Next build; no migration)

The gate writes to no database and sends nothing. A task is done only when the gate passes.

## End-to-end tests

`npm run test:e2e` runs Playwright (`playwright.config.ts`, specs in `e2e/`) in Chromium. The
current config builds and serves the app on port 3000 and reuses a server already running there,
which on this machine is the owner's dev server. Do not run it until task T001 moves it to its
own port and build directory. CI runs it as a separate, non-blocking job; `npm run verify` does
not include it.

## Commands with additional effects

| Command                    | Effect                                                                       |
| -------------------------- | ---------------------------------------------------------------------------- |
| `npm run db:generate`      | Generates the Prisma client; no database access                              |
| `npm run db:migrate`       | `prisma migrate dev` against the database in `.env` (the local stack)        |
| `npm run db:deploy`        | Applies migrations to the configured database; production only with approval |
| `npm run db:push`          | Pushes the schema without a migration; never used                            |
| `npm run db:seed`          | Runs `prisma/seed.ts` against the database in `.env`                         |
| `npm run db:import-pois`   | Imports OpenStreetMap points of interest; uses the network                   |
| `npm run bot:dev`          | Long-polls the Telegram dev bot; takes its updates; owner only               |
| `npm run bot:webhook -- …` | Registers or deletes the production webhook; owner only                      |
| `npm run test:e2e`         | Builds and serves the app; see the port caveat above                         |

## Feature task template

- **Outcome:** observable user or developer behaviour.
- **Source:** PRD requirement, spec section and explicit decisions.
- **Scope:** affected boundary and unsupported cases.
- **Acceptance:** examples of success, empty or partial data, and failure.
- **Evidence:** fixtures, test commands and results.
- **Open decisions:** questions that remain unresolved; do not hide them in defaults.

## Definition of done and handoff

- The slice works for the stated cases; partial data stays visible and honestly labelled.
- Relevant checks pass, or pre-existing and environment failures are reported separately.
- No unrelated work was reverted; no secrets or personal data entered the diff.
- Changed behaviour is reflected in its spec or in `docs/architecture.md`.
- The handoff states changed files, checks actually run, new tables that need RLS, migrations
  that production will need, remaining assumptions and next work.
