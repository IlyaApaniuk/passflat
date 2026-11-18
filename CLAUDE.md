# Passflat — project instructions

## Product and scope

Passflat (passflat.com) helps tenants in Poland, Warsaw first, with the money side of renting:
what tenants actually pay per building, district and city (rent plus utilities and extra
charges), an address checker, a cost calculator, guides, document templates, and a Telegram
bot for the Russian- and Ukrainian-speaking audience (address lookup and a deposit-return
helper). Listings and tenant replacement are frozen: the code stays, it is not extended or
promoted. Agency reputation is not built.

Product documents live in `docs/product/` (English): the BRD with the assumption registry, PRDs
in `docs/product/prd/`, the decision log, hypotheses, experiments and the roadmap. The build
loop works from `docs/specs/` (start at `docs/specs/README.md`), which translate the current PRD
into what to build. Do not expand the active task to the whole PRD. Hypotheses, prices,
thresholds and legal statements in product documents are not proof of implementation, demand
or legal review.

## Read before changing an area

- `docs/architecture.md`: stack, data model, boundaries, analytics, local setup.
- `docs/development-workflow.md`: checks, the gate and task handoff.
- `docs/specs/` and the spec section of the task; `docs/ralph-loop.md` for the build loop.
- `docs/product/README.md`: how product documents relate; `docs/product/decisions.md`: the
  latest decision wins over older notes.
- Cost figures: `src/lib/cost-aggregates.ts`, `cost-baselines.ts`, `cost-stats.ts`,
  `location-checker.ts` and their tests.
- Analytics: `src/components/providers/posthog-provider.tsx`, `src/lib/posthog-server.ts`,
  `src/lib/bot/analytics.ts`.
- Telegram bot: `src/lib/bot/README.md`.

Read only the relevant references. For existing behaviour, inspect the implementation and
tests rather than trusting prose.

## Repository language

English is the required language for all repository-authored content: documentation, plans,
specifications, product documents, agent instructions, code comments, identifiers, file names,
test descriptions and developer-facing messages. Translate non-English prose when you update an
existing file.

Exceptions are product content in its audience's language: `src/i18n/messages/` (the four
locales), `src/content/` (articles per locale), bot copy in `src/lib/bot/texts.ts` and
`deposit-texts.ts`, `docs/legal-templates/` (Polish legal templates and their translations),
`docs/marketing/` (copy and briefs written for an external audience), and literal external data
(Polish legal terms, provider field names, quotes). The language used with the owner in
conversation is Russian and is independent of repository language.

## Working agreements

- Start with `git status --short`. Preserve existing staged, unstaged and untracked work.
- Never commit to `main`. Work on a feature branch; the owner pushes and merges pull requests
  himself. Do not push unless asked. Re-check the branch after the owner merges something.
- Make the smallest complete change for the task. Do not add dependencies or architecture
  without a concrete need. `npm install` after switching branches: branches carry different deps.
- Separate planned, implemented, tested and deployed in progress reports.
- User-facing copy lives in `src/i18n/messages/`; every change touches all four files (`pl`,
  `en`, `ru`, `uk`) and keeps their key sets identical.
- Update the relevant documentation when a boundary, command or supported behaviour changes.
  Keep this file concise; put detail in `docs/`.

## Architecture boundaries

- Server database access goes through the Prisma client in `src/lib/prisma.ts`; never import
  it into client components. Supabase clients live in `src/lib/supabase/`.
- Route handlers validate requests and delegate to library code.
- The website and the bot read cost figures through the same library functions. Never build a
  second aggregation for the bot.
- Follow `src/i18n/navigation.ts` for locale-aware navigation.
- New tables: RLS is managed by hand in the Supabase dashboard by the owner's decision, never
  in migrations. Name every new table in the handoff so the owner switches RLS on.

## Cost data honesty

- Show aggregates (medians, ranges, counts) per building, district or city; raw reports stay
  server-side. Addresses are building-level only, never apartment numbers.
- Medians blend `user`, `import` and `scraped` sources by the owner's decision (cold start).
  Never call a blended figure "market", never write "verified" or "checked by tenants", never
  invent statistics, and gate any percentage comparison at N ≥ 5.
- Reviews and tags describe buildings, never named private persons.
- The deposit helper prepares a letter and explains statutory deadlines; it is not legal advice
  and must not give a confident personal verdict when data or the contract could not be read.
- Change these rules only when a task and its spec say so.

## Analytics

- PostHog (EU) runs cookieless with memory persistence until consent and upgrades on consent;
  Google Analytics stays consent-gated. Do not change the consent model without the owner.
- Keep existing event names; add events only where a spec defines them. Never send emails, free
  text, contract contents or Telegram chat IDs in web events; the bot identity `tg_<chatId>` is
  never merged with web identities.
- The PostHog key is commented out locally: prove events with tests around the capture call and
  verify them in PostHog Live Events after deploy. Never enable the real key locally.
- Funnel numbers before 2026-07-28 counted only consenting visitors and are not comparable.
- Production analytics are read through the PostHog MCP server (`.mcp.json`, read-only), only in
  the owner's Claude Code session. Loop iterations never call it.

## Privacy and execution boundaries

- Never commit `.env*` values, API keys or tokens; `.env.example` holds placeholders. `.env.prod`
  holds production credentials: never read or load it.
- Never log request bodies, emails, tokens, contract contents or chat IDs.
- Production database migrations need the owner's explicit approval for each migration.
  Develop against the local Supabase stack (`supabase start`; `.env` and `.env.local` point to
  127.0.0.1:54322).
- Deployments, real payments, emails, Telegram messages, webhook registration and outreach are
  side effects. Execute them only within the owner's authorized task; checks never perform them.

## Verification

Use npm and the lockfile. CI runs Node 20; local Node is 24. Read `package.json` for commands.

```sh
npm run lint
npm run typecheck
npm run knip
npm test
npm run build
```

`npm run verify` runs all five in order and stops at the first failure. `npm run build` needs the
build env from `.env.local` (CI uses dummies). `npm run test:e2e` builds into `.next-e2e` and
serves on port 3100, never reusing a running server, so the owner's dev server on port 3000 is
not touched. Never use `db:deploy`, `db:push`, `prisma migrate deploy`,
`prisma migrate reset`, `bot:dev` or `bot:webhook` as a check.

Finish with a focused diff review and report what changed, what passed and what remains
unverified. Do not claim a deploy, a live database change or a verified analytics event unless
it actually happened.
