# Ralph loop

How Passflat is built: agree a PRD with the owner, decompose it completely into specs and atomic
tasks, and let a loop of fresh agent runs implement one task at a time, with every result
written down. Product decisions are taken on evidence: PostHog metrics, experiments and
research recorded in `docs/product/`.

```text
BRD (assumptions A1, A2, …) ─┐
hypotheses + experiments ────┼→ PRD N (docs/product/prd/) → decision review (owner answers)
PostHog metrics readouts ────┘     → specs (docs/specs/*.md) → atomic tasks (ralph/tasks.json)
  → loop: pick next task → fresh Claude Code run → implement → gate → commit → progress.md → repeat
  → all tasks done → PRD N is done → owner deploys → metrics readout → next PRD
```

Milestones inside a PRD only order the work. A task that needs the owner is `blocked` with its
question; the loop skips it and keeps going with everything that does not depend on it.

## Files

| File                                   | Role                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `docs/product/`                        | BRD, PRDs and their decision reviews, decisions, hypotheses, experiments, roadmap, reviews         |
| `docs/specs/README.md`                 | Index of the current PRD's specs, markers (Decided, Assumption, Open), what agents never decide    |
| `docs/specs/*.md`                      | How each area works; tasks point to a spec section                                                 |
| `ralph/tasks.json`                     | Atomic tasks with milestone, acceptance criteria, checks, dependencies and status                  |
| `ralph/progress.md`                    | Learnings plus one log entry per iteration: done, checks, failures, owner review, next             |
| `ralph/PROMPT.md`                      | Instructions for one iteration; `{{TASK_ID}}` is filled in by the loop                             |
| `ralph/settings.json`                  | Permissions for iterations: an allowlist plus hard denies                                          |
| `ralph/status.json`                    | Live state of a running loop (git-ignored), read by the status command                             |
| `ralph/archive/`                       | Task lists of finished PRDs                                                                        |
| `scripts/ralph.sh`                     | The loop                                                                                           |
| `scripts/ralph-tasks.mjs`              | Task state changes used by the loop, by iterations and by the owner                                |
| `scripts/ralph-watch.sh`               | Read-only watcher for the owner's session (one line per event)                                     |
| `.claude/skills/*`                     | Owner commands: loop start, status, stop, answer; PRD intake; product, metrics and process reviews |
| `.claude/agents/product-strategist.md` | Read-only agent that reviews the product direction against evidence                                |
| `.mcp.json`                            | PostHog MCP server, read-only, for the owner's session                                             |

## Atomic tasks

- One reviewable change with tests, small enough for one run of an agent.
- Testable acceptance criteria and the exact checks to run; `npm run verify` is always one.
- `dependsOn` lists tasks that must be done first; the loop takes the first runnable `todo`
  task in file order.
- A task that needs a decision, a secret or real data from the owner is `blocked`, with the
  question in `notes`. `node scripts/ralph-tasks.mjs unblock <id> '<answer>'` puts it back.

## Running

```sh
scripts/ralph.sh                         # up to 20 iterations
scripts/ralph.sh 3                       # up to 3
touch ralph/STOP                         # stop after the current iteration
node scripts/ralph-tasks.mjs summary     # progress per milestone, blocked tasks, next task
node scripts/ralph-tasks.mjs list todo   # one line per task
```

Each iteration is a separate `claude -p` process, so its context starts empty. The loop:

- refuses `main`, a dirty working tree (unless `RALPH_ALLOW_DIRTY=1`) and a second loop;
- keeps the Mac awake with `caffeinate` for the whole run;
- starts the local Supabase stack when it is not running;
- runs iterations on `claude-opus-5-5` (`RALPH_MODEL`), independent of the model chosen in the
  owner's session;
- caps usage per iteration with `--max-budget-usd` (`RALPH_BUDGET_USD`, default 10; on the
  owner's subscription this is an API-equivalent estimate, not a charge);
- stashes the uncommitted work of a task that ends failed or blocked as `ralph-wip <task> ...`
  (`git stash list`) and restores it when that task runs again;
- skips a task that ends blocked and goes on with the rest;
- pauses 20 minutes when an iteration ends on a usage or rate limit, puts the task back without
  counting the attempt and retries (`RALPH_LIMIT_WAIT_SECONDS`, at most `RALPH_MAX_LIMIT_WAITS`
  pauses in a row, default 30); `ralph/status.json` then says `waiting`;
- stops when no runnable task is left, after two failed iterations in a row, or on `ralph/STOP`.

Transcripts go to `ralph/logs/` (git-ignored). Results reach `main` only through a pull request
the owner reviews; deploys and production migrations stay with the owner.

## Models

Two models, by kind of work (owner's rule of 2026-11-19):

- **Analysis and documents: `claude-fable-5-1`.** Audits, metrics readouts, direction reviews, PRDs,
  decision reviews, specs and task decomposition, the `product-strategist` agent (its `model:` line)
  and any headless step that writes documents.
- **Code: `claude-opus-5-5`.** Every loop iteration (`scripts/ralph.sh` passes `--model
"$RALPH_MODEL"`, default `claude-opus-5-5`), independent of the model chosen in the owner's
  interactive session.

A skill that spawns an agent for analysis passes `model: "fable"`; one that runs the loop leaves the
default.

## Safety

Iterations run with `--permission-mode dontAsk` and `ralph/settings.json`: anything not on the
allowlist is denied. Pushing, deploying, `gh`, `vercel`, `supabase link`, branch switching,
reading `.env.prod`, production migrations (`db:deploy`, `migrate deploy`, `db push`), resets of
the local database, starting the Telegram bot and the PostHog MCP server are explicitly denied.
Deny rules are not a sandbox: a script started by an allowed command can still read files. For
stronger isolation, enable the Claude Code sandbox or run in a container.

## Working from a phone

1. Open the `passflat` folder as the VS Code workspace (project skills, permissions and the
   PostHog server load only from the repository root). In the Claude Code prompt run
   `/remote-control` (or `/rc`); the session appears in the Claude mobile app under Code.
2. Pushes need Remote Control and are skipped while the terminal is focused.
3. Keep the Mac on power with the lid open, VS Code open and Docker running.
4. From the phone, use the commands or the same words:

| Command                       | Words that work too                   | What happens                                                                    |
| ----------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| `/ralph-start 5`              | "запусти цикл на 5 задач"             | Starts the loop in the background and reports when it ends                      |
| `/ralph-status`               | "статус цикла"                        | Running or idle, current task, done per milestone, blocked questions            |
| `/ralph-stop`                 | "останови цикл"                       | Stops after the current task                                                    |
| `/ralph-answer T040 ...`      | "ответ на T040: ..."                  | Records the answer, updates the spec, unblocks the task, commits                |
| `/prd-intake <file> evaluate` | "оцени PRD 2"                         | Checks a PRD against the PRD rules, writes the decision review                  |
| `/prd-intake <file> go`       | "бери PRD 2 в работу"                 | Specs, architect gap review, tasks, commit, then starts the loop                |
| `/metrics-review [focus]`     | "что по метрикам", "проверь гипотезы" | PostHog readout per hypothesis and experiment, saved to `docs/product/reviews/` |
| `/product-review [focus]`     | "оцени направление", "оцени идею ..." | Independent review by the `product-strategist` agent                            |
| `/process-review`             | "ретро", "оцени процесс"              | Loop metrics, failures, waits and proposals                                     |

While the loop runs, the session that started it watches it with `scripts/ralph-watch.sh` under
the Monitor tool. The watcher and the loop commands are allowed in `.claude/settings.json`, so an
unattended night needs no approvals; iterations themselves never ask (`dontAsk`).

Sources: https://code.claude.com/docs/en/remote-control.md,
https://code.claude.com/docs/en/headless.md and https://code.claude.com/docs/en/skills.md
(checked 17.11.2026 for the Kwitax setup this loop was copied from).
