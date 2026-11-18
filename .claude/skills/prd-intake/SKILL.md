---
name: prd-intake
description: Take the next Passflat PRD into work - evaluate it, write the decision review, decompose it into English specs and atomic tasks after an architect gap review, then start the build loop. Use when the owner asks to review, evaluate, decompose or start a PRD, also from the phone ("разбери PRD 2", "оцени PRD", "бери PRD 2 в работу").
argument-hint: '[path of the PRD in docs/product/prd/] [evaluate | go]'
allowed-tools: Read, Edit, Write, Glob, Grep, Agent, Bash(node scripts/ralph-tasks.mjs *), Bash(git status *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(git mv *), Bash(git branch --show-current)
---

# Take a PRD into work

PRDs live in `docs/product/prd/` in English; the owner discusses them in Russian. One PRD is one
stage. A PRD is done when all of its tasks are done. Reply to the owner in Russian, briefly: they
are often on the phone.

Document chain (`docs/product/README.md`): the BRD (`docs/product/brd.md`) holds the idea, model,
limits and the assumption registry A1, A2, …; a PRD covers one stage, cites those assumptions
and the hypotheses and experiments it serves; for each PRD the agent writes one decision review
with everything on the "never decides" list, which the owner answers before decomposition; the
specs in `docs/specs/` are the system design (English, for agents); tasks come last.

## 0. Preconditions

- The loop must be idle: `ralph/status.json` missing or `state` not `running`. If it runs, say so
  and offer to wait or stop it.
- Run `node scripts/ralph-tasks.mjs summary`. If the current PRD still has `todo` tasks, ask
  whether to finish them first (default) or to append the new PRD's tasks after them.

## 1. Read

- The PRD: the path in `$ARGUMENTS`, or the newest `docs/product/prd/prd-<n>-*.md` whose status
  is not `Done` and that is not the one named in `ralph/tasks.json` under `prd`.
- The BRD: the assumptions the PRD cites, the limits and the "Never" list.
- `docs/product/prd-rules.md`, `docs/product/decisions.md`, `docs/product/hypotheses.md`,
  `docs/product/experiments.md`, `docs/specs/README.md` and the specs the PRD touches, and the
  code areas it changes (`docs/architecture.md` first).

## 2. Evaluate

For every requirement, check the readiness list in `prd-rules.md`: id and milestone, testable
acceptance criteria, numbers instead of adjectives, a Decided / Assumption / Open mark, edge
cases, a route or "no design", key copy, a numeric example for figure rules, analytics events
that make the tested hypothesis measurable, dependencies, open questions with an owner. A PRD not
yet in the requirement format is restructured into FR-numbered requirements in the decision
review's proposal, without changing its substance. Also check:

- conflicts with the BRD, the decision log, existing specs or code;
- business statements (demand, price, market, legal, provider availability) that rely on an
  assumption without citing its A-number, and new business assumptions the BRD does not have
  yet: propose each one as a new A-number with a status;
- requirements that rest on an assumption marked Contradicted;
- anything on the "never decides" list in `docs/specs/README.md` that the PRD leaves open;
- size: an estimate of tasks per milestone and loop time (about 2–5 minutes per small task,
  10–30 minutes per screen, bot flow or integration task);
- risks and what could be cut.

Write `docs/product/prd/prd-<n>-decision-review.md`: verdict (ready / ready with assumptions /
not ready), the number of decisions, the size estimate, then one table row per item: what has to
be decided, why it cannot be left to the agent, the agent's proposal with options and their cost,
what it blocks. Cover every never-decides item the PRD touches, the open questions and the
proposed new BRD assumptions. Set the PRD's status line to `Evaluated` with the date; keep the
PRD text itself unchanged. Commit both (`Evaluate PRD <n>`).

Send the owner the verdict in Russian (short, push-worthy: "PRD 2: 4 решения, ~40 тасок") with
the file path.

If `$ARGUMENTS` contains `evaluate`, stop here.

## 3. Close the questions

- Wait for the owner's answers in chat. Each decision goes into `decisions.md` and into the PRD
  (new version, "What changed"). Ask before rewording the owner's requirements; small
  clarifications marked as such are fine.
- New or changed business assumptions the owner accepts go into the BRD registry (new A-number,
  status, date and source, a change-log line); numbers are never reused.
- Questions the owner wants to leave open become blocked tasks, not guesses.
- When the owner has explicitly authorized decomposition before answering (for example a night
  run), every unanswered item becomes a blocked task with its question, and every task that does
  not depend on it proceeds.

## 4. Decompose

Only when the owner says to take it into work (`go`, "бери в работу", "разбирай"):

1. If the previous PRD has no `todo` tasks left, `git mv ralph/tasks.json
ralph/archive/<prd-slug>-tasks.json` and start a new file with `version`, `prd` (title,
   version, date) and `tasks`. Blocked tasks of the previous PRD move along with their notes.
2. Update `docs/specs/`: change existing specs where behaviour changes, add new numbered spec
   files, update the requirement map and "Current PRD" in `docs/specs/README.md`. English only.
   Mark every value Decided, Assumption or Open. Cite BRD assumptions as "BRD A<n>" and
   decisions as "D<n>".
3. Architect gap review, before any task is written: spawn a fresh `Plan` agent with the Agent
   tool. Give it the PRD path, the decision review, the list of new or changed spec files and the
   code areas they touch, and ask it to list what the specs miss: user flows without an end
   state, states and edge cases (empty, error, partial data, one report, retry, concurrent use,
   large input), data that is stored but never deleted or shown, background work (crons, emails
   or bot messages after events), limits and quotas of external services, security and privacy
   gaps, analytics that cannot answer the hypothesis, and work implied by one requirement but
   owned by none. Do not pass your own conclusions. Fold each confirmed gap into the specs; a gap
   that needs an owner decision goes into the decision review and back through section 3. Tell
   the owner in one line how many gaps were found and fixed.
4. Write atomic tasks: ids continue after the highest existing id (never reuse), each with
   `milestone`, `title`, `spec` (file#section), `dependsOn`, `status`, `acceptance`, `checks`
   (always `npm run verify`), `attempts: 0`, `notes`. Tasks needing owner input are `blocked`
   with the question. Order follows the PRD milestones.
5. Validate: every dependency exists and comes earlier in the file;
   `node scripts/ralph-tasks.mjs summary` runs.
6. Set the PRD status line to `In progress` with the date and the task count, update
   `docs/product/roadmap.md`, and commit on the current branch: specs, tasks, archive, PRD,
   roadmap. Subject `Decompose <PRD> into specs and tasks`, last line
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
7. Start the loop as the `ralph-start` skill describes, with enough iterations for all todo tasks.

## Never

Invent prices, legal texts, legal rules or paid services; put secrets into specs, tasks or
product documents; push, deploy or touch production resources.
