<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# todo-cat

A to-do list web app kept by Lissie, a cat with attitude (an AI agent, coming later). Next.js 16 App Router; npm workspaces `contract/` (shared zod schemas) and `cli/` (the `todo-cat` CLI, a REST client).

## Commands

- `npm run dev` — dev server
- `npm run build` — production build
- `npm test` — Vitest, one-shot (unit + integration)
- `npx todo-cat --help` — the CLI (built on `npm install`; rebuild after changes with `npm run build -w todo-cat-cli`)
- `npm run qa` — full gate (Biome, app and CLI build, typecheck, Vitest); run it before you call a task done and fix the code instead of suppressing findings
- `npm run db:generate` / `db:migrate` — drizzle-kit migration generate / apply
- `npm run db:reset` — delete the local database file and migrate a fresh one
- `npm run db:seed` — demo user `demo@todo-cat.dev` / `cat-person-2026` with a dozen todos; rerunnable
- `npm run lint` — Biome check (lint, format, imports)
- `npm run format` — Biome format, writes files
- `npm run test:e2e` — Playwright e2e tests against a real browser and a temp database; not part of `npm run qa` (see tech-docs/testing.md)

## Verify, don't recall

The technologies here are newer than your training data. Check APIs against current docs; don't rely on memory.

## Researching docs

- Vendor `llms.txt` files first when the vendor has one (Drizzle: https://orm.drizzle.team/llms.txt; Better Auth: https://better-auth.com/llms.txt); follow its links to the exact page.
- Next.js: the docs in `node_modules/next/dist/docs/` (they match the installed version).
- Libraries with an installed skill (`.claude/skills/`: copilotkit, mastra, ...): use that skill.
- Any other library: `npx ctx7@latest library <name> "<query>"`, then `npx ctx7@latest docs <libraryId> "<query>"` (see the find-docs skill).

## Tech docs

`tech-docs/` holds project-specific technical docs; agents are the primary audience.

- Write: approach, principles, design decisions with their reasons, gotchas.
- Point to the central files instead of copying code.
- Leave out anything an agent finds out by reading the code.
- Current state only; delete outdated content instead of adding caveats.

Index:

- [tech-docs/architecture.md](tech-docs/architecture.md) — todo service, contract, adapters: the rules every feature follows
- [tech-docs/workspaces.md](tech-docs/workspaces.md) — workspace layout and why it exists before its content does
- [tech-docs/database.md](tech-docs/database.md) — Drizzle + libsql setup, migrations, temp databases for tests
- [tech-docs/testing.md](tech-docs/testing.md) — Vitest unit/integration split, Playwright e2e, QA script and CI, gotchas
- [tech-docs/auth.md](tech-docs/auth.md) — Better Auth setup: Drizzle adapter, plugins, session helper, schema regeneration
- [tech-docs/rest-api.md](tech-docs/rest-api.md) — `/api/todos` endpoints, error mapping, getting a bearer token with curl
- [tech-docs/cli.md](tech-docs/cli.md) — `todo-cat` CLI: build, output and exit-code rules, device-flow login, token storage, end-to-end test

## Git workflow

- Merge work into local `main` first, then push `main`; never push a branch or worktree ref straight to `origin/main`. Main has no write protection.

## Maintenance

Update AGENTS.md and the tech docs in the same change whenever a change invalidates a line or teaches a costly lesson. Prefer deleting over adding, pointers over prose, one sentence per bullet.
