---
name: ralph-status
description: Short status of the Passflat build loop - whether it runs, the current task, progress per milestone, blocked questions. Use when the owner asks how the loop or development is going ("статус цикла", "как дела с задачами").
allowed-tools: Read, Bash(node scripts/ralph-tasks.mjs *), Bash(git log *)
---

# Loop status

1. Read `ralph/status.json`. If it does not exist, the loop has not run on this machine.
2. Run `node scripts/ralph-tasks.mjs summary`.
3. Read the last two entries of the "Log" section in `ralph/progress.md`.
4. Run `git log --oneline -5`.

Reply in Russian in at most eight short lines, without tables (it is read on a phone): running
or idle, with the current task and iteration N of M; done per milestone; the last result;
blocked tasks with their one-line questions.
