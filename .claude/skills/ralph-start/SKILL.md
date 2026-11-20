---
name: ralph-start
description: Start the Passflat build loop (Ralph) in the background, push to the owner's phone on failures and at the end, and close the PRD when its tasks are done. Use when the owner asks to start, run or resume the loop, also from the phone ("запусти цикл", "запусти все таски", "start the loop").
argument-hint: '[max iterations, default: all runnable tasks] [per-task pushes]'
allowed-tools: Read, Edit, Bash(scripts/ralph.sh *), Bash(scripts/ralph-watch.sh), Bash(node scripts/ralph-tasks.mjs *), Bash(git status *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(git branch --show-current)
---

Write every message and push to the owner in Russian.

# Start the build loop

## 1. Preflight (read-only)

- `git branch --show-current` must not be `main`.
- `git status --short` must be empty: the loop refuses a dirty tree. If it is not, tell the
  owner what is uncommitted and stop.
- If `ralph/status.json` says `running` and its pid is alive, the loop already runs: report its
  task instead of starting another.
- `node scripts/ralph-tasks.mjs summary`. N is the number in `$ARGUMENTS`, or the number of
  `todo` tasks plus 20 (room for tasks the agents add).

## 2. Start and watch

1. Start `scripts/ralph.sh <N>` with the Bash tool and `run_in_background: true`.
2. Arm a Monitor with the command `scripts/ralph-watch.sh` (timeout 30 minutes; re-arm with the
   same command on every expiry while the loop runs). It is read-only, allowed without a prompt,
   and prints one line per event: `RESULT <task> <status> · <milestone> n/m · blocked k · next
<task>`, `WAIT <task> paused: usage limit, retry at HH:MM`, `IDLE <last> · <summary>` or
   `DEAD <last>`. A restart of the loop within two minutes does not end the watch.
3. Tell the owner in two or three lines: the next task, how many iterations, when pushes come,
   that "статус цикла" shows progress and "останови цикл" stops it.

## 3. Pushes

Default: push only on a failed or blocked task, on the first `WAIT` of a pause series, on
`DEAD` and at the end. Push on every finished task only when `$ARGUMENTS` or the owner asks for
per-task pushes. Build each push from the event line alone, under 200 characters:
`T019 не вышла, повторю`, `T040 заблокирована, нужен ответ`, `Лимит подписки, цикл ждёт до HH:MM
и продолжит сам`, per task `T012 готова · M1 12/31 · дальше T013 <short title>`.

## 4. When the loop ends (IDLE, DEAD or the background command finishes)

Report briefly: summary per milestone, new commits (`git log --oneline` since the start), the
"Did not work" and "Owner review" lines added to `ralph/progress.md`, and every blocked task
with its question. Then:

- **Tasks left to do** (the loop stopped on failures or the iteration limit): push
  "Цикл остановился: <reason>. Сделано X, осталось Y" and suggest the next step.
- **Only blocked tasks left**: push "Цикл ждёт ответов: N тасок. <first question>" and list the
  questions; the owner answers with "ответ на T0xx: ..." (skill `ralph-answer`).
- **No todo and no blocked tasks**: the PRD is done. Set its status line in
  `docs/product/prd/prd-<n>-*.md` to `Done` with the date, update `docs/product/roadmap.md`,
  commit both (`Mark PRD <n> done`), and push "PRD <n> выполнен. Нужны твои шаги: ревью PR,
  миграции, деплой. Потом «что по метрикам»". The next PRD starts with the `prd-intake` skill,
  triggered by the owner.
- **DEAD**: push "Цикл упал на <task>", read the newest log in `ralph/logs/`, and explain what
  happened.

Never push to git, deploy, or change acceptance criteria from this skill.
