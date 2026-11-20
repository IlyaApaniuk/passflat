#!/usr/bin/env bash
# Watches a running Ralph loop for the owner's Claude Code session (run it under the Monitor tool)
# and prints one line per event:
#
#   RESULT <task> <status> · <milestone> <done>/<total> · blocked <n> · next <id> <title>
#   WAIT <task> paused: ...       the loop waits out a usage or rate limit
#   IDLE <last result> · <summary>  the loop ended and did not start again within two minutes
#   DEAD <last result>            the loop process is gone without writing its final state
#
# Read-only: it reads ralph/status.json and ralph/tasks.json and changes nothing.
cd "$(dirname "$0")/.." || exit 1

read_status() {
  node -e '
    try {
      const s = JSON.parse(require("fs").readFileSync("ralph/status.json", "utf8"));
      let alive = true;
      try { process.kill(s.pid, 0); } catch { alive = false; }
      console.log([s.state, s.pid, s.iteration, s.lastResult || "", alive].join("|"));
    } catch { console.log("none||||false"); }'
}

progress() {
  node -e '
    const d = JSON.parse(require("fs").readFileSync("ralph/tasks.json", "utf8"));
    const task = d.tasks.find((t) => t.id === process.argv[1]);
    const m = task ? task.milestone : undefined;
    const inM = d.tasks.filter((t) => t.milestone === m);
    const done = new Set(d.tasks.filter((t) => t.status === "done").map((t) => t.id));
    const next = d.tasks.find((t) => t.status === "todo" && (t.dependsOn || []).every((x) => done.has(x)));
    const blocked = d.tasks.filter((t) => t.status === "blocked").length;
    console.log(`${m} ${inM.filter((t) => t.status === "done").length}/${inM.length} · blocked ${blocked} · next ${next ? `${next.id} ${next.title}` : "none"}`);
  ' "$1"
}

emit_result() {
  case "$1" in
    *" paused: "*) echo "WAIT $1" ;;
    stopped:*) ;; # reported with IDLE
    *) echo "RESULT $1 · $(progress "${1%% *}")" ;;
  esac
}

IFS='|' read -r state pid iter last alive <<<"$(read_status)"
emitted_key="$pid|$iter|$last"
emitted_last="$last"
idle_since=""

while true; do
  IFS='|' read -r state pid iter last alive <<<"$(read_status)"
  key="$pid|$iter|$last"

  if [[ "$state" == "running" || "$state" == "waiting" ]]; then
    idle_since=""
    if [[ "$alive" != "true" ]]; then
      echo "DEAD ${last:-no result yet}"
      exit 0
    fi
    if [[ -n "$last" && "$key" != "$emitted_key" ]]; then
      emit_result "$last"
      emitted_key="$key"
      emitted_last="$last"
    fi
  else
    # The loop ended: its last result may only be in this final state. A restart within two
    # minutes (a new pid) keeps the watch going.
    if [[ -n "$last" && "$last" != "$emitted_last" ]]; then
      emit_result "$last"
      emitted_last="$last"
    fi
    emitted_key="$key"
    now="$(date +%s)"
    idle_since="${idle_since:-$now}"
    if ((now - idle_since >= 120)); then
      echo "IDLE ${last:-no result} · $(node scripts/ralph-tasks.mjs summary | tr '\n' ';')"
      exit 0
    fi
  fi
  sleep 15
done
