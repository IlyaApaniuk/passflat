#!/usr/bin/env node
/**
 * Small CLI over ralph/tasks.json, so loop iterations change task state the same way every time.
 *
 *   node scripts/ralph-tasks.mjs next              print the id of the next runnable task, or nothing
 *   node scripts/ralph-tasks.mjs show <id>         print one task as JSON
 *   node scripts/ralph-tasks.mjs status <id>       print the status of one task
 *   node scripts/ralph-tasks.mjs start <id>        mark in_progress and count an attempt
 *   node scripts/ralph-tasks.mjs done <id>         mark done
 *   node scripts/ralph-tasks.mjs fail <id> <why>   back to todo with a note (blocked after 3 attempts)
 *   node scripts/ralph-tasks.mjs reset <id>        back to todo without counting the attempt (usage limit)
 *   node scripts/ralph-tasks.mjs block <id> <why>  mark blocked with a note
 *   node scripts/ralph-tasks.mjs unblock <id> <answer>  back to todo with the owner's answer in the notes
 *   node scripts/ralph-tasks.mjs add <json>        append a task (status todo)
 *   node scripts/ralph-tasks.mjs summary           counts by status and milestone, current and blocked tasks
 *   node scripts/ralph-tasks.mjs list [status]     one line per task, optionally only one status
 *
 * A task is runnable when its status is todo and every task it depends on is done.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../ralph/tasks.json', import.meta.url);
const STATUSES = ['todo', 'in_progress', 'done', 'blocked'];
const MAX_ATTEMPTS = 3;

const load = () => JSON.parse(readFileSync(FILE, 'utf8'));
const save = (data) => writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);

function find(data, id) {
  const task = data.tasks.find((t) => t.id === id);
  if (!task) throw new Error(`Unknown task: ${id}`);
  return task;
}

function nextRunnable(data) {
  const done = new Set(data.tasks.filter((t) => t.status === 'done').map((t) => t.id));
  return data.tasks.find(
    (t) => t.status === 'todo' && (t.dependsOn ?? []).every((dep) => done.has(dep)),
  );
}

const [command, id, ...rest] = process.argv.slice(2);
const data = load();

switch (command) {
  case 'next': {
    const task = nextRunnable(data);
    if (task) console.log(task.id);
    break;
  }
  case 'show':
    console.log(JSON.stringify(find(data, id), null, 2));
    break;
  case 'status':
    console.log(find(data, id).status);
    break;
  case 'start': {
    const task = find(data, id);
    task.status = 'in_progress';
    task.attempts = (task.attempts ?? 0) + 1;
    save(data);
    break;
  }
  case 'done':
    find(data, id).status = 'done';
    save(data);
    break;
  case 'fail': {
    const task = find(data, id);
    task.status = (task.attempts ?? 0) >= MAX_ATTEMPTS ? 'blocked' : 'todo';
    task.notes = [task.notes, `Failed: ${rest.join(' ')}`].filter(Boolean).join('\n');
    save(data);
    break;
  }
  case 'reset': {
    const task = find(data, id);
    if (task.status === 'in_progress') {
      task.status = 'todo';
      task.attempts = Math.max(0, (task.attempts ?? 0) - 1);
      save(data);
    }
    break;
  }
  case 'block': {
    const task = find(data, id);
    task.status = 'blocked';
    task.notes = [task.notes, `Blocked: ${rest.join(' ')}`].filter(Boolean).join('\n');
    save(data);
    break;
  }
  case 'unblock': {
    const task = find(data, id);
    if (task.status !== 'blocked') throw new Error(`${id} is ${task.status}, not blocked`);
    task.status = 'todo';
    task.attempts = 0;
    task.notes = [task.notes, `Owner answer: ${rest.join(' ')}`].filter(Boolean).join('\n');
    save(data);
    break;
  }
  case 'list': {
    const only = id;
    if (only && !STATUSES.includes(only)) throw new Error(`Unknown status: ${only}`);
    for (const t of data.tasks.filter((x) => !only || x.status === only)) {
      console.log(`${t.id} ${t.milestone ?? '--'} ${t.status.padEnd(11)} ${t.title}`);
    }
    break;
  }
  case 'add': {
    const task = JSON.parse(id);
    if (!task.id || !task.title) throw new Error('A task needs at least id and title');
    if (data.tasks.some((t) => t.id === task.id)) throw new Error(`Duplicate task id: ${task.id}`);
    data.tasks.push({
      dependsOn: [],
      acceptance: [],
      checks: [],
      attempts: 0,
      notes: '',
      ...task,
      status: 'todo',
    });
    save(data);
    break;
  }
  case 'summary': {
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const t of data.tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
    console.log(STATUSES.map((s) => `${s}: ${counts[s]}`).join(', '));
    const milestones = [...new Set(data.tasks.map((t) => t.milestone).filter(Boolean))];
    for (const m of milestones) {
      const inM = data.tasks.filter((t) => t.milestone === m);
      const done = inM.filter((t) => t.status === 'done').length;
      console.log(`${m}: ${done}/${inM.length} done`);
    }
    for (const t of data.tasks.filter((x) => x.status === 'in_progress')) {
      console.log(`in progress ${t.id}: ${t.title}`);
    }
    for (const t of data.tasks.filter((x) => x.status === 'blocked')) {
      console.log(`blocked ${t.id}: ${t.title}`);
    }
    const next = nextRunnable(data);
    console.log(next ? `next ${next.id}: ${next.title}` : 'next: none runnable');
    break;
  }
  default:
    console.error(
      'Usage: ralph-tasks.mjs next|show|status|start|done|fail|reset|block|unblock|add|summary|list',
    );
    process.exit(2);
}
