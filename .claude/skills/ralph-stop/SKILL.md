---
name: ralph-stop
description: Stop the Passflat build loop after the current task. Use when the owner asks to stop or pause the loop ("останови цикл", "stop the loop").
allowed-tools: Read, Bash(touch ralph/STOP)
---

# Stop the loop

1. Read `ralph/status.json`. If the loop is not running, say so and stop.
2. Run `touch ralph/STOP`. The loop finishes the current task, commits it and then stops.
3. Tell the owner in Russian which task is still finishing.

Only when the owner explicitly asks to stop immediately: kill the loop process with the pid from
`ralph/status.json`, run `node scripts/ralph-tasks.mjs fail <task> 'stopped by the owner'` for
the task that was in progress, and say that its partial changes may be left uncommitted.
