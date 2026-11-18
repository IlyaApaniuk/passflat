# Progress

Written by every loop iteration. Read "Learnings" and the last entries before starting a task.

## Learnings

- The local Supabase stack (project id `passflat`, DB on 127.0.0.1:54322) must be running:
  `supabase start` in the repo root. `.env` (read by the Prisma CLI) and `.env.local` (read by
  Next) both point to it. `.env.prod` holds production credentials and is never used by tools.
- Create migrations with `npx prisma migrate dev --name <name>` (add `--create-only` to edit the
  SQL first). Never add RLS statements to migrations: the owner switches RLS on in the
  dashboard; name the new table under "Owner review".
- `npm test` runs Vitest on `src/**/*.{test,spec}.{ts,tsx}` only; `e2e/` is Playwright.
- `npm run test:e2e` builds into `.next` and reuses the owner's dev server on port 3000: do not
  run it before T001 is done. Iterations use ports 3100–3199 for their own servers.
- `npm run knip` is part of CI and of the pre-push hook: a new file must be imported or listed
  as an entry in `knip.json`; a new dependency must be used.
- The husky pre-commit hook runs lint-staged (ESLint fix and Prettier on staged files); if it
  rewrites files, stage them again before committing.
- Copy changes touch all four files in `src/i18n/messages/` (`pl`, `en`, `ru`, `uk`) with
  identical key sets. Bot copy is RU and UK in `src/lib/bot/texts.ts` and `deposit-texts.ts`.
- PostHog is disabled locally (key commented out): test analytics with a mocked client around
  the capture call; never enable a real key.
- Pipes and `;`-chained commands may be denied by the loop permissions; run one plain allowed
  command per Bash call.
- The gate is `npm run verify` (lint, typecheck, knip, test, build; stops at the first failure).
- `npm run build` rewrites `next-env.d.ts` (`.next/dev/types` → `.next/types`): run
  `git restore next-env.d.ts` before committing.
- Knip prints unlisted dependencies, unused exports and types as warnings (`knip.json` rules)
  and exits 0; only unused files and dependencies fail it. The current warnings pre-date the loop.

## Log

### 2026-11-18 23:26 · T000 · done

- Done: added the `verify` script to `package.json` (`npm run lint && npm run typecheck && npm run knip && npm test && npm run build`); `docs/development-workflow.md` "The gate" now names `npm run verify` without the "once T000 adds it" / "until the script exists" sentences; the matching "once it exists (task T000)" phrase in `CLAUDE.md` replaced. `.github/workflows/ci.yml` untouched.
- Checks: `npm run verify` passed (lint clean, typecheck clean, knip exit 0 with pre-existing warnings only, Vitest 29 files / 312 tests passed, `next build` succeeded).
- Did not work: nothing.
- Owner review: nothing.
- Next: T001 (move `npm run test:e2e` to its own port and build directory).
