#!/usr/bin/env bash
# Ralph loop: one atomic task per iteration, each in a fresh Claude Code process.
#
#   scripts/ralph.sh            run up to 20 iterations
#   scripts/ralph.sh 5          run up to 5 iterations
#   touch ralph/STOP            stop gracefully after the current iteration
#
# Memory between iterations lives in ralph/tasks.json, ralph/progress.md and git.
# Permissions for iterations come from ralph/settings.json (dontAsk: anything not allowed is denied).
# Live state for status checks (also from the phone) is written to ralph/status.json.
#
# Environment:
#   RALPH_MAX_FAILURES   failed iterations in a row before stopping (default 2); a blocked task
#                        does not count, the loop skips it and goes on
#   RALPH_BUDGET_USD     spending cap per iteration, passed to --max-budget-usd (default 10)
#   RALPH_MODEL          model for iterations, passed to --model (default claude-opus-5-5), so the
#                        loop does not follow the model chosen in the owner's interactive session
#   RALPH_LIMIT_WAIT_SECONDS  pause after an iteration ended by a usage or rate limit (default 1200)
#   RALPH_MAX_LIMIT_WAITS     pauses in a row before stopping (default 30, about ten hours)
#   RALPH_ALLOW_DIRTY=1  start even when the working tree has uncommitted changes
#   CLAUDE_BIN           path to the Claude Code binary when `claude` is not on PATH
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Keep the Mac awake for the whole run (display, idle and system sleep).
if [[ "$(uname)" == "Darwin" && -z "${RALPH_CAFFEINATED:-}" ]] && command -v caffeinate >/dev/null; then
  export RALPH_CAFFEINATED=1
  exec caffeinate -dims "$0" "$@"
fi

MAX_ITERATIONS="${1:-20}"
MAX_FAILURES="${RALPH_MAX_FAILURES:-2}"
BUDGET_USD="${RALPH_BUDGET_USD:-10}"
MODEL="${RALPH_MODEL:-claude-opus-5-5}"
LIMIT_WAIT_SECONDS="${RALPH_LIMIT_WAIT_SECONDS:-1200}"
MAX_LIMIT_WAITS="${RALPH_MAX_LIMIT_WAITS:-30}"
LOG_DIR="ralph/logs"
STATUS_FILE="ralph/status.json"
LOCK_FILE="ralph/.lock"
mkdir -p "$LOG_DIR"

CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude || true)}"
if [[ -z "$CLAUDE_BIN" ]]; then
  CLAUDE_BIN="$(ls -d "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude 2>/dev/null | sort -V | tail -1 || true)"
fi
[[ -x "$CLAUDE_BIN" ]] || { echo "Claude Code binary not found; set CLAUDE_BIN"; exit 1; }

BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" == "main" || -z "$BRANCH" ]]; then
  echo "Refusing to run on '${BRANCH:-detached HEAD}': switch to a feature branch first"
  exit 1
fi

if [[ -f "$LOCK_FILE" ]] && kill -0 "$(cat "$LOCK_FILE")" 2>/dev/null; then
  echo "Another loop is running (pid $(cat "$LOCK_FILE")); stop it with: touch ralph/STOP"
  exit 1
fi

# Iterations commit task state themselves; the loop's own status writes may stay uncommitted.
LOOP_STATE=(':(exclude)ralph/tasks.json' ':(exclude)ralph/progress.md')

# Changes in the tree other than task state.
work_in_tree() { git status --porcelain -- . "${LOOP_STATE[@]}"; }

if [[ -n "$(work_in_tree)" && "${RALPH_ALLOW_DIRTY:-}" != "1" ]]; then
  echo "Working tree has uncommitted changes; commit or stash them first (or set RALPH_ALLOW_DIRTY=1):"
  work_in_tree
  exit 1
fi

echo $$ >"$LOCK_FILE"

write_status() {
  # state, iteration, task id, task title, last result
  STATE="$1" ITER="$2" TASK="$3" TITLE="$4" LAST="$5" PID="$$" MAXI="$MAX_ITERATIONS" BR="$BRANCH" \
    node -e '
      const e = process.env;
      const s = {
        state: e.STATE, pid: Number(e.PID), branch: e.BR,
        iteration: Number(e.ITER), maxIterations: Number(e.MAXI),
        task: e.TASK || null, title: e.TITLE || null, lastResult: e.LAST || null,
        updatedAt: new Date().toISOString(),
      };
      require("fs").writeFileSync("ralph/status.json", JSON.stringify(s, null, 2) + "\n");
    '
}

LAST_RESULT=""
cleanup() {
  write_status idle 0 "" "" "$LAST_RESULT" || true
  rm -f "$LOCK_FILE"
}
trap cleanup EXIT

notify() {
  # Desktop notification; harmless when it is not available.
  /usr/bin/osascript -e "display notification \"$1\" with title \"Passflat loop\"" >/dev/null 2>&1 || true
}

# The iteration ended on a usage, rate or capacity limit of the subscription or the API, not on
# the task itself. A spending cap (--max-budget-usd) is not a limit here: it counts as a failure.
hit_limit() {
  local result
  result="$(grep '"type":"result"' "$1" | tail -1 || true)"
  if [[ -n "$result" ]]; then
    grep -q '"is_error":true' <<<"$result" || return 1
    grep -qi 'budget' <<<"$result" && return 1
    grep -Eqi 'usage limit|hit your|session limit|weekly limit|rate.?limit|overloaded|"api_error_status":(429|529)' <<<"$result"
  else
    tail -20 "$1" | grep -Eqi 'usage limit|hit your|session limit|weekly limit|rate.?limit|overloaded'
  fi
}

# Unfinished work of a task is kept in a stash named "ralph-wip <task> ..." until the task runs again.
wip_stash() {
  # awk reads all input: an early exit would SIGPIPE git and, under pipefail, end the loop silently.
  git stash list --format='%gd %s' | awk -v t="ralph-wip $1 " '!found && index($0" ", t) { print $1; found = 1 }'
}

# The local Supabase stack backs integration and e2e tests.
if command -v supabase >/dev/null; then
  if ! supabase status >/dev/null 2>&1; then
    echo "Starting the local Supabase stack..."
    supabase start >/dev/null 2>&1 || echo "WARNING: supabase start failed (is Docker running?). Database tasks will fail or block."
  fi
else
  echo "WARNING: supabase CLI not found. Database tasks will fail or block."
fi

write_status running 0 "" "" ""

failures=0
for ((i = 1; i <= MAX_ITERATIONS; i++)); do
  if [[ -f ralph/STOP ]]; then
    rm -f ralph/STOP
    echo "STOP file found, stopping"
    break
  fi

  task="$(node scripts/ralph-tasks.mjs next)"
  if [[ -z "$task" ]]; then
    echo "No runnable tasks left"
    break
  fi

  title="$(node scripts/ralph-tasks.mjs show "$task" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).title))')"
  log="$LOG_DIR/$(date +%Y%m%d-%H%M%S)-$task.jsonl"
  echo "[$i/$MAX_ITERATIONS] $task: $title"

  # Every task starts from committed work (the first one may start dirty with RALPH_ALLOW_DIRTY=1).
  if ((i > 1)) && [[ -n "$(work_in_tree)" ]]; then
    echo "Uncommitted changes before $task; stopping:"
    work_in_tree
    LAST_RESULT="stopped: uncommitted changes before $task"
    notify "Loop stopped: uncommitted changes before $task"
    break
  fi

  # An earlier unfinished attempt of this task comes back into the tree.
  wip="$(wip_stash "$task")"
  if [[ -n "$wip" ]]; then
    if git stash pop --quiet "$wip"; then
      echo "    restored the earlier unfinished work of $task from $wip"
    else
      echo "Could not restore $wip for $task cleanly; stopping (the stash is kept)"
      LAST_RESULT="stopped: $task work in $wip does not apply"
      notify "Loop stopped: $task earlier work does not apply"
      break
    fi
  fi

  write_status running "$i" "$task" "$title" "$LAST_RESULT"

  set +e
  "$CLAUDE_BIN" -p "$(sed "s/{{TASK_ID}}/$task/g" ralph/PROMPT.md)" \
    --settings ralph/settings.json \
    --permission-mode dontAsk \
    --model "$MODEL" \
    --max-budget-usd "$BUDGET_USD" \
    --output-format stream-json --verbose >"$log" 2>&1
  code=$?
  set -e

  # A usage or rate limit is not the task's fault: put the task back, keep its work, wait, retry.
  if [[ "$(node scripts/ralph-tasks.mjs status "$task")" != "done" ]] && hit_limit "$log"; then
    node scripts/ralph-tasks.mjs reset "$task"
    if [[ -n "$(work_in_tree)" ]]; then
      git stash push --include-untracked --quiet -m "ralph-wip $task limit $(date +%Y%m%d-%H%M%S)" \
        -- . "${LOOP_STATE[@]}"
    fi
    limit_waits=$((${limit_waits:-0} + 1))
    if ((limit_waits > MAX_LIMIT_WAITS)); then
      echo "Still limited after $MAX_LIMIT_WAITS pauses; stopping"
      LAST_RESULT="stopped: usage limit after $MAX_LIMIT_WAITS pauses"
      break
    fi
    retry_at="$(date -v+"${LIMIT_WAIT_SECONDS}"S +%H:%M 2>/dev/null || date +%H:%M)"
    LAST_RESULT="$task paused: usage limit, retry at $retry_at"
    echo "    usage or rate limit (log: $log); waiting until $retry_at"
    write_status waiting "$i" "$task" "$title" "$LAST_RESULT"
    for ((waited = 0; waited < LIMIT_WAIT_SECONDS; waited += 30)); do
      [[ -f ralph/STOP ]] && break
      sleep 30
    done
    i=$((i - 1)) # the pause does not use up an iteration
    continue
  fi

  status="$(node scripts/ralph-tasks.mjs status "$task")"
  if [[ "$status" == "in_progress" ]]; then
    # The iteration ended without recording an outcome: count it as a failure.
    node scripts/ralph-tasks.mjs fail "$task" "iteration ended without an outcome (exit $code)"
    status="$(node scripts/ralph-tasks.mjs status "$task")"
  fi

  # A task that did not finish leaves its work in a stash, so the next task starts clean.
  if [[ "$status" != "done" && -n "$(work_in_tree)" ]]; then
    git stash push --include-untracked --quiet -m "ralph-wip $task $status $(date +%Y%m%d-%H%M%S)" \
      -- . "${LOOP_STATE[@]}"
    echo "    unfinished work of $task stashed; it comes back when $task runs again"
  fi

  LAST_RESULT="$task $status"
  echo "    -> $status (exit $code), log: $log"
  if [[ "$status" == "done" ]]; then
    failures=0
    limit_waits=0
  elif [[ "$status" == "blocked" ]]; then
    # The question waits for the owner; the loop skips the task and goes on.
    notify "$task blocked"
  else
    failures=$((failures + 1))
    notify "$task ended as $status"
  fi

  if ((failures >= MAX_FAILURES)); then
    echo "Stopping after $failures failed iterations in a row"
    break
  fi
done

summary="$(node scripts/ralph-tasks.mjs summary)"
echo "$summary"
notify "Loop finished. ${summary%%$'\n'*}"
