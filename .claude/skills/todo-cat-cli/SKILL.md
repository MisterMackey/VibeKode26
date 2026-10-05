---
name: todo-cat-cli
description: Manage a person's todo-cat to-do list with the `todo-cat` CLI: add, find, edit, complete, reopen and delete todos, and answer questions about the list (what's overdue, what's due this week, what did I add or finish last week). Use this skill whenever the user mentions their to-do list, todos, tasks or reminders in this project, or asks to note, tick off, reschedule or look up something on it, even if they don't name the CLI or todo-cat. Also use it when a `todo-cat` command fails with "not logged in".
---

# Managing a to-do list with todo-cat

`todo-cat` is a REST client for the todo-cat app. You use it on behalf of a person: their list, their decisions. This skill covers how to work with it safely; for flags and syntax, `todo-cat --help` and `todo-cat <command> --help` are the source of truth, and they win whenever this file disagrees with them.

Run it as `npx todo-cat` from the repo root (or `todo-cat` if it is on PATH). It talks to `TODO_CAT_URL`, default `http://localhost:3000`. It never prompts, prints results to stdout and errors to stderr as `todo-cat: <message> [<code>]`, and its exit code tells you what went wrong.

## Before anything else: are you logged in?

Run `todo-cat whoami` once at the start. The exit code decides what you do next:

- **0**: logged in; go ahead.
- **3** (`unauthorized`): nobody is logged in for this server. Stop and tell the user, for example: "todo-cat isn't logged in. Run `npx todo-cat login` in the repo (in Claude Code, type `! npx todo-cat login`); it prints a link and a code that you approve in the browser where you're signed in to todo-cat. Tell me when it's done." If you can keep a background command running, you may instead start `todo-cat login --json` yourself and relay the URL and code from its first line verbatim; the human still approves it.
- **5** (`server-unreachable`): the app isn't running at that URL. Say so; in local development the fix is `npm run dev`.

Logging in is the human's act of consent, so never work around it: don't read, write or copy the token file, don't sign in with the seed or demo credentials, don't approve a device code yourself, don't call `/api/todos` or `/api/auth` with curl, and don't touch the database. If login is missing, the task waits for the human.

## Find the todo before you act on its id

Every change (`show`, `edit`, `done`, `reopen`, `delete`) takes a UUID, and people talk in titles. Look the id up each time; never guess, reuse one from memory, or construct one.

```bash
todo-cat list --status all --text vet --json
```

- `list` shows only **open** todos unless you pass `--status done` or `--status all`. To reopen something, or to check whether it already exists, you need `all`, or you will wrongly conclude it isn't there.
- `--text` is a case-insensitive substring of the title. Search for one distinctive word ("vet", not "the vet appointment on Tuesday"); if nothing matches, try another word before telling the user it isn't on the list.
- One match: act on it. Several plausible matches: ask which one, quoting their titles and due dates; don't pick for the user. No match: say so, and don't quietly create a new todo instead unless that is what they asked for.
- Exit 4 (`todo-not-found`) on an id you just looked up means it changed underneath you; list again rather than retrying.

When you report back, name todos by title (and due date when it helps), not by id. Ids are for you.

## Answering questions about the list: `--json` and a filter

For anything beyond "show me my list" (counts, overdue, due this week, added last week, grouping), fetch everything once as JSON and filter it with a program instead of reading the text output by eye:

```bash
todo-cat list --status all --json
```

That prints one JSON array of todos: `id`, `title`, `dueDate` (`yyyy-mm-dd` or null), `done`, `createdAt` and `completedAt` (ISO timestamps in UTC, or null). Filter with jq when it's installed (`command -v jq`), otherwise with node, which is always there because the CLI runs on it:

```bash
# Overdue: open todos whose due date is before today
todo-cat list --json | jq --arg today "$(date +%F)" \
  '[.[] | select(.dueDate != null and .dueDate < $today) | {title, dueDate}]'

# The same without jq
todo-cat list --json | node -e '
  const todos = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const today = new Date().toLocaleDateString("sv");  // local yyyy-mm-dd
  for (const t of todos) if (t.dueDate && t.dueDate < today) console.log(t.dueDate, t.title);'
```

## Dates: which date does the user mean?

A todo has three dates, and questions about time can point at any of them:

| The user says | Field |
|---|---|
| "due", "deadline", "what's coming up", "overdue", "for next week" | `dueDate` |
| "added", "created", "wrote down", "put on the list" | `createdAt` |
| "finished", "did", "got done", "ticked off" | `completedAt` |

"What's on my list for last week?" usually means due dates; "what did I add last week?" means creation dates. If the wording really is ambiguous, answer with the reading you chose and say so in one clause ("todos that were due last week: ...").

Pitfalls:

- **Work out the range from today's date**, `date '+%F %A'`, not from your own sense of what day it is. "Last week" is the previous Monday to Sunday; if the user may mean the past seven days, state the range you used. Say the concrete dates in your answer.
- **`dueDate` is a calendar date, not a time.** Compare it as a `yyyy-mm-dd` string. Turning it into a Date gives midnight UTC, which is the previous day west of Greenwich.
- **`createdAt` and `completedAt` are UTC.** Convert them to the local day before comparing, or a todo added late in the evening lands on the wrong day. In node: `new Date(t.createdAt).toLocaleDateString("sv")`. In jq: `.createdAt | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 | localtime | strftime("%F")` (jq's date parser rejects fractional seconds, hence the `sub`).
- **Relative due dates** ("by Friday", "next month") go into `--due` as `yyyy-mm-dd`. Compute them from today's date, and repeat the resolved date to the user ("added, due Friday 2026-10-09").

## Changing the list

- **Add**: `todo-cat add "Buy tuna" --due 2026-10-31`. Quote the title. Check first with `list --status all --text` if the user might already have it, and mention a near-duplicate rather than silently adding a second one.
- **Complete or undo**: "done", "finished", "tick off" mean `done <id>`, never delete; "not done after all" means `reopen <id>`.
- **Edit**: `edit <id> --title ...`, `--due yyyy-mm-dd`, or `--no-due` to clear the due date. Change only what was asked, and never delete-and-re-add to edit.

## Destructive commands only on request

`delete` is permanent: there is no undo and no trash. `logout` revokes the session, and the human has to approve a new login in the browser to undo it.

- Run them only when the user asked for exactly that: "delete", "remove", "get rid of", "log out". Finishing, tidying up, or a todo looking stale or duplicated is not a request to delete; report it and offer instead.
- `delete` refuses without `--yes`. Add `--yes` because the user asked for the deletion, not to get past the refusal.
- For deletions chosen by a rule ("delete everything I finished last month"), first list exactly which todos match, then delete those, and report the titles you deleted. If the rule is fuzzy, show the list and ask before deleting.
- If you created todos for your own testing, delete them again before you finish.

## When a command fails

The exit code says what to do; the stderr message says why.

| Exit | Meaning | What to do |
|---|---|---|
| 2 | invalid usage or input (`invalid-usage`, `validation-failed`) | Fix the command; check `todo-cat <command> --help`. |
| 3 | not logged in | See "Before anything else" above; never work around it. |
| 4 | todo not found | List again and find it by title. |
| 5 | server unreachable | Tell the user the app isn't running at `TODO_CAT_URL`. |
| 1 | unexpected | Report the message to the user; don't retry in a loop. |
