# CLI

`todo-cat` (workspace `cli/`, package `todo-cat-cli`) is a client of the REST API built on commander 15. Its main users are AI agents working for a human, so every choice favours predictable, parseable behaviour over chattiness. `npx todo-cat --help` is the user-facing reference; this file covers why it is built the way it is.

## Layout

- `cli/src/main.ts` — the commander program: commands, help texts, global `--json`, mapping every failure to stderr output and an exit code.
- `cli/src/todos.ts` — one function per REST use case (list, show, add, edit/done/reopen, delete).
- `cli/src/auth.ts` — `login` (device flow), `logout`, `whoami`, against Better Auth under `/api/auth`.
- `cli/src/api.ts` — the only HTTP code; `cli/src/config.ts` — server URL and token file; `cli/src/errors.ts` — error codes and exit codes; `cli/src/output.ts` — text and JSON output.
- `.claude/skills/todo-cat-cli/` — the agent skill for using the CLI on someone's behalf (workflows and pitfalls, not flags); update it when a command's behaviour changes.
- Web side: `app/device/page.tsx` + `components/device-approval.tsx` (approve a code), `?next=` support in `app/login/page.tsx`.

## Build and running

- esbuild bundles `src/main.ts` with commander, zod and `@todo-cat/contract` into one file, `cli/dist/todo-cat.mjs` (git-ignored). Bundling is required: the contract ships TypeScript source, which Node can't import from `node_modules`.
- The workspace's `prepare` script builds it on every `npm install` (fresh clone or not); the `bin` entry makes `npx todo-cat` work from the repo root. After changing `cli/src`, rebuild with `npm run build -w todo-cat-cli`.
- Commander 15 is ESM-only and needs Node >= 22.12.

## Contract

- Todo requests and responses use the contract schemas; input is validated with them before sending, so bad input fails with the server's own `validation-failed` code without a round trip.
- The Better Auth responses the CLI reads (`DeviceCode`, `DeviceToken`, `DeviceTokenError`, `Session`) and `CLI_CLIENT_ID` also live in the contract, so the CLI declares no schemas of its own.

## Agent-friendly rules

- stdout carries results only; `--json` prints one JSON document per line (todos in the contract's shapes). `login --json` prints two: `pending` with the code, then `approved`.
- Errors go to stderr as `todo-cat: <message> [<code>]`, or with `--json` as the API's `{ error: { code, message } }` shape.
- Codes are the API's (`unauthorized`, `todo-not-found`, `validation-failed`) plus the CLI's own; `EXIT_CODES` in `cli/src/errors.ts` maps each to an exit code, and the help text is generated from it, so the two cannot drift.
- Exit codes: 0 ok, 1 unexpected, 2 usage or input, 3 not logged in / login denied or expired, 4 not found, 5 server unreachable.
- Never prompts; `delete` refuses without `--yes` (exit 2) instead of asking.
- `list` defaults to `--status open`, unlike the REST default `all`.

## Login and the token

- Device authorization flow (RFC 8628) via Better Auth's plugin: request a code, print the URL and code, poll `/device/token` at the server's interval (adding 5 s on `slow_down`) until approved, denied or expired. The CLI never opens a browser.
- The server accepts only `CLI_CLIENT_ID` (`validateClient` in `lib/auth.ts`); without it Better Auth accepts any client id.
- Approval needs a signed-in user who first *claims* the code (`GET /api/auth/device?user_code=`) and then approves it; the `/device` page does both, and redirects to `/login?next=...` first if needed.
- The access token is a Better Auth session token; the bearer plugin accepts it for the REST API, so the CLI is an ordinary REST client after login.
- Tokens live in `<config dir>/auth.json`, keyed by server URL so a token is only ever sent to the server that issued it. Directory 0700, file 0600, written via temp file and rename. Config dir: `TODO_CAT_CONFIG_DIR`, else `$XDG_CONFIG_HOME/todo-cat`, `~/.config/todo-cat`, or `%APPDATA%\todo-cat`.
- `logout` calls `/api/auth/sign-out` with the bearer token, which deletes the session server-side; the local token is removed even if that fails, and the error still exits non-zero.
- The server URL is `TODO_CAT_URL`, default `http://localhost:3000`.

## Tests

- `tests/integration/cli.test.ts` builds the CLI, starts `next start` on a spare port with a temp database, a fresh `BETTER_AUTH_SECRET` and a temp `TODO_CAT_CONFIG_DIR`, and drives the built binary through login, whoami, add, list, done, delete, logout and a failing whoami.
- It approves the device code over HTTP with session cookies from Better Auth's `testUtils()` plugin, on an auth instance in the test process that shares the server's database and secret.
- It needs the production build (`npm run build`; the QA script builds first) and fails fast without one. It uses `next start` because Next 16 allows only one `next dev` per project. A stale build tests stale server code.
- Each login waits one 5 s polling interval, so the test takes about 8 s.
- `e2e/device.spec.ts` covers the `/device` page in a real browser.
