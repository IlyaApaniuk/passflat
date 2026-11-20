---
name: process-review
description: Retrospective of the Passflat development process - loop speed, estimated cost, failures, blocked tasks, spec and PRD quality - with concrete improvements, saved to docs/product/reviews. Use when the owner asks how the process goes or for a retro ("оцени процесс", "ретро", "что улучшить в разработке").
allowed-tools: Read, Write, Bash(node scripts/ralph-tasks.mjs *), Bash(node -e *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(git branch --show-current)
---

# Process review

Reply to the owner in Russian; the report file is in English.

## 1. Collect

- `node scripts/ralph-tasks.mjs summary`, and from `ralph/tasks.json`: tasks per status and
  milestone, `attempts` above 1, failure and block notes.
- Per-iteration numbers from the loop logs (estimated API-equivalent cost; the loop runs on the
  owner's subscription, so this is usage, not money spent):

  ```sh
  node -e '
  const fs=require("fs"),p="ralph/logs";const rows=[];
  for(const f of fs.readdirSync(p).filter(f=>f.endsWith(".jsonl"))){
    for(const l of fs.readFileSync(p+"/"+f,"utf8").split("\n")){
      try{const d=JSON.parse(l);if(d.type==="result")rows.push({task:f.split("-").pop().replace(".jsonl",""),min:+(d.duration_ms/60000).toFixed(1),usd:+(d.total_cost_usd||0).toFixed(2),turns:d.num_turns,ok:d.subtype})}catch{}
    }
  }
  console.table(rows);const s=k=>rows.reduce((a,r)=>a+r[k],0);
  console.log("iterations",rows.length,"minutes",s("min").toFixed(1),"usd estimate",s("usd").toFixed(2));'
  ```

- `ralph/progress.md`: every "Did not work" and "Owner review" line, and the Learnings.
- `git log --oneline` since the current PRD started.

## 2. Analyse

Where the time goes; recurring failure causes (spec gaps, unclear acceptance criteria, flaky or
slow checks, environment problems); tasks that were too big (many turns, several attempts); what
waits on the owner and for how long; whether the PRD and specs carried enough detail (compare
with `docs/product/prd-rules.md`).

## 3. Report

Write `docs/product/reviews/<YYYY-MM-DD>-process-retro.md`: a metrics table, what works, what
does not, and numbered proposals with the expected effect (for example "split screen tasks in
two", "add a learning", "change a check", "add a rule to prd-rules.md"). Commit it on the
current branch with the subject `Process retro <date>` and the last line
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Reply with at most five lines and the
path. Apply a proposal only after the owner picks it.
