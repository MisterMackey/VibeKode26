# Testing

Vitest is the only test runner. Config: `vitest.config.mts`.

## Commands

- `npm test` — one-shot run of all projects (CI-safe; plain `vitest` would watch).
- `npm run test:watch` — watch mode while developing.
- `npx vitest run --project unit` (or `integration`) — one project only.

## QA script and CI

`npm run qa` (`scripts/qa.sh`) is the gate before any task is done: Biome, production build, typecheck (root and all workspaces via `npm run typecheck`), Vitest. Each section prints `PASS`/`FAIL`; only failing output is printed, everything goes to `.qa/qa.log` (override with `QA_LOG`). Exit code is non-zero on any failure; output has no colors.

- Build runs before typecheck because Next generates global types (e.g. `LayoutProps`) in `.next/types`.
- Fix findings in the code; do not suppress them.
- `.github/workflows/qa.yml` runs the same script on every push and pull request (Node 24, `npm ci`, dummy `.env` generated from `.env.example`; no real secrets, no deployment).
- No E2E/Playwright step: it is not used in this project.

## Strategy

Two Vitest projects, split by directory so each gets the right environment:

- `tests/unit/` — `jsdom` environment; React components (React Testing Library) and pure functions.
- `tests/integration/` — `node` environment; code that touches real `Request`/`Response`, route handlers, and (later) the database and workspaces together.

Put a test in the project that matches its environment needs, not its size. Files are named `*.test.ts(x)`.

The two existing tests are smoke tests proving the harness works (jsdom + `@/` alias + JSX; node + `next/server`). Replace or delete them when real features give better coverage.

## Gotchas

- Vitest does not support `async` Server Components; cover those with E2E (not set up yet), and unit-test only synchronous components.
- `@/` imports work through `resolve.tsconfigPaths` in the config; do not add `vite-tsconfig-paths`.
- Vitest 5 needs `@types/node` >= 22, so keep it at 22+.
- `tests/` is type-checked by the root `tsconfig.json` (`**/*.ts`), so test code must compile under `strict`.
