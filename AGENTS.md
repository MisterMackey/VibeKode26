<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# todo-cat

A to-do list web app kept by Lissie, a cat with attitude (an AI agent, coming later). Next.js 16 App Router; npm workspaces `contract/` (shared zod schemas) and `cli/` (the `todo-cat` CLI), both still empty.

## Commands

- `npm run dev` — dev server
- `npm run build` — production build
- `npm test` — Vitest, one-shot (unit + integration)
- `npm run qa` — full gate (Biome, build, typecheck, Vitest); run it before you call a task done and fix the code instead of suppressing findings
- `npm run lint` — Biome check (lint, format, imports)
- `npm run format` — Biome format, writes files

## Verify, don't recall

The technologies here are newer than your training data. Check APIs against current docs; don't rely on memory.

## Tech docs

`tech-docs/` holds project-specific technical docs; agents are the primary audience.

- Write: approach, principles, design decisions with their reasons, gotchas.
- Point to the central files instead of copying code.
- Leave out anything an agent finds out by reading the code.
- Current state only; delete outdated content instead of adding caveats.

Index:

- [tech-docs/workspaces.md](tech-docs/workspaces.md) — workspace layout and why it exists before its content does
- [tech-docs/testing.md](tech-docs/testing.md) — Vitest unit/integration split, QA script and CI, gotchas

## Git workflow

- Merge work into local `main` first, then push `main`; never push a branch or worktree ref straight to `origin/main`. Main has no write protection.

## Maintenance

Update AGENTS.md and the tech docs in the same change whenever a change invalidates a line or teaches a costly lesson. Prefer deleting over adding, pointers over prose, one sentence per bullet.
