---
name: ralph-answer
description: Record the owner's answer to a blocked Passflat task and put the task back in the queue. Use when the owner answers a question the loop asked ("ответ на T040 ...", "unblock T046").
argument-hint: '<task id> <answer>'
allowed-tools: Read, Edit, Bash(node scripts/ralph-tasks.mjs *), Bash(git add *), Bash(git commit *), Bash(git status *)
---

# Answer a blocked task

The owner answers in Russian; record everything in English.

1. Run `node scripts/ralph-tasks.mjs show <id>`. Confirm it is blocked and restate its question.
2. Secrets (API keys, tokens, passwords) never go into specs, task notes, commits or product
   documents. If the answer is a secret, tell the owner to put it into `.env.local` themselves
   and record only "provided in .env.local".
3. If the answer is a decision (a value, a wording, a chosen service, a rule), update the relevant
   spec in `docs/specs/`, replacing the **Open** marker, and add a row to
   `docs/product/decisions.md` (next D-number, date, area, decision, status Accepted). If it
   answers a PRD question, mark it answered in the PRD's decision review.
4. Run `node scripts/ralph-tasks.mjs unblock <id> '<the answer in one English line>'`.
5. The loop only starts on a clean tree, so commit the changed spec, decision log, decision review
   and `ralph/tasks.json` on the current branch with the subject `Unblock <id>: <short answer>`
   and the last line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage nothing
   else.
6. Tell the owner in Russian the task is back in the queue and when the loop will reach it
   (`node scripts/ralph-tasks.mjs summary`).
