# Ralph loop iteration

You are one iteration of the Passflat build loop. You start with an empty context and end
when this task is finished; the next iteration will not remember anything you do not write
down. Your memory is the repository: `ralph/tasks.json`, `ralph/progress.md`, the specs and git.

Your task: **{{TASK_ID}}**

## Steps

1. Run `git status --short` and `git log --oneline -5`. You are on a feature branch; never
   switch branches. Changes already in the tree are an earlier unfinished attempt of this task
   that the loop restored: read its progress entry and continue from it.
2. Read `CLAUDE.md`, then `ralph/progress.md`: the whole "Learnings" section and the last three
   log entries.
3. Run `node scripts/ralph-tasks.mjs show {{TASK_ID}}` and read the task. Read
   `docs/specs/README.md` (markers and the "never decides" list) and the spec section the task
   points to. The specs are complete for your task: product documents in `docs/product/` explain
   why, but the spec is what you build. Read only the code you need.
4. Run `node scripts/ralph-tasks.mjs start {{TASK_ID}}`.
5. Implement this task and nothing else: the smallest complete change that meets every
   acceptance criterion, with tests. If you discover other missing work, add it as a new task
   with `node scripts/ralph-tasks.mjs add '<json>'` (give it `milestone`, `spec`, `dependsOn`,
   `acceptance` and `checks`), do not do it now.
   - **Assumption** values from the spec go into one config place (the one the spec names, or a
     constant next to the code that uses it) and are named in your progress entry.
   - Anything the task needs that the spec marks **Open**, or anything on the "never decides"
     list, is a reason to block, not to guess.
   - User-facing copy changes touch all four files in `src/i18n/messages/` (`pl`, `en`, `ru`,
     `uk`) with identical key sets; bot copy lives in `src/lib/bot/texts.ts` and
     `deposit-texts.ts` (RU and UK).
   - Database work targets only the local Supabase stack (`.env` and `.env.local` point to
     127.0.0.1:54322). Create and apply migrations with `npx prisma migrate dev`; never run
     `migrate deploy`, `db push`, `migrate reset` or anything against `.env.prod`. A new table
     ships without RLS in the migration (the owner switches RLS on by hand in the dashboard):
     name the table under "Owner review".
   - Analytics: keep existing event names; add new ones only where the spec says so. PostHog is
     disabled locally, so prove events with unit tests around the capture call, never by
     enabling a real key. Never put emails, free text, contract contents or Telegram chat IDs
     into web events.
   - External services (Telegram, Google, Anthropic, Stripe, Resend, DeepL) are mocked in tests.
     Never send a real message, email, payment or API request from a check.
6. Run every check listed in the task, then `npm run verify` if it exists (otherwise
   `npm run lint`, `npm run typecheck`, `npm run knip`, `npm test`, `npm run build`).
7. Record the outcome:
   - Everything passes: run `node scripts/ralph-tasks.mjs done {{TASK_ID}}`.
   - You cannot finish: leave the tree compiling (undo only your own broken edits with
     `git restore`), then run `node scripts/ralph-tasks.mjs fail {{TASK_ID}} '<one-line reason>'`.
     Use `block` instead of `fail` when the task needs a decision or input from the owner.
8. Append an entry to the "Log" section of `ralph/progress.md`:

   ```
   ### <YYYY-MM-DD HH:MM> · {{TASK_ID}} · <done | failed | blocked>
   - Done: <what changed, files>
   - Checks: <commands and results>
   - Did not work: <what failed and why, or "nothing">
   - Owner review: <draft copy keys, assumptions applied, new tables needing RLS, migrations to apply in production, owner actions needed, or "nothing">
   - Next: <the precise next step for whoever picks this up>
   ```

   Add to "Learnings" only durable rules that will help every later task (a command that works,
   a trap to avoid, a convention). One line each.

9. Commit. Stage the files of this task (only when it is done), `ralph/tasks.json` and
   `ralph/progress.md`; never stage `.env*`, `ralph/logs` or test artifacts. Subject:
   `{{TASK_ID}}: <task title>` for a done task, `{{TASK_ID}}: record <failed|blocked> attempt`
   otherwise. Last line of the message: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
   The husky pre-commit hook runs lint-staged; if it rewrites files, stage them and commit again.
10. End your final message with exactly one line: `RESULT: done`, `RESULT: failed` or `RESULT: blocked`.

## Never

- Push, open pull requests, deploy, or run `vercel`, `gh` or `supabase link`.
- Read or load `.env.prod`, or touch the production database, Vercel, PostHog or Cloudflare.
- Start the Telegram bot (`npm run bot:*`) or call the Telegram, Google, Anthropic, Stripe or
  Resend APIs for real.
- Change the honesty rules of the cost data (see `CLAUDE.md`) unless the task and its spec say so.
- Stop the owner's dev server on port 3000. Use ports 3100–3199 and stop your servers.
- Mark a task done when a check fails or was not run.
