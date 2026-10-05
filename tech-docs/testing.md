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
- Playwright e2e is not part of `npm run qa` or CI: it needs browser binaries (`npx playwright install`) that aren't provisioned there. Run it manually with `npm run test:e2e`.

## Playwright e2e

`e2e/*.spec.ts`, config in `playwright.config.ts`. Covers flows Vitest can't (real browser, async Server Components, full page navigation) — currently the sign-up/sign-out/sign-in flow in `e2e/auth.spec.ts`.

- `npm run test:e2e` — runs against `npm run dev`, which Playwright's `webServer` option starts and stops automatically.
- The config calls `migrateTempDb()` (see [database.md](database.md)) directly at config-load time and passes the resulting URL to the dev server via `webServer.env.DATABASE_URL`; no need to wrap the command in `with-temp-db.ts`'s CLI mode.
- Needs browser binaries once per machine: `npx playwright install chromium`.

## Strategy

Two Vitest projects, split by directory so each gets the right environment:

- `tests/unit/` — `jsdom` environment; React components (React Testing Library) and pure functions.
- `tests/integration/` — `node` environment; code that touches real `Request`/`Response`, route handlers, the database (against a temp database, see [database.md](database.md)), and (later) workspaces together.

Put a test in the project that matches its environment needs, not its size. Files are named `*.test.ts(x)`.

`tests/integration/route-handler.test.ts` is a smoke test for `next/server` in the node environment; replace it once real route tests exist.

## Gotchas

- Vitest does not support `async` Server Components; cover those with E2E (not set up yet), and unit-test only synchronous components.
- `@/` imports work through `resolve.tsconfigPaths` in the config; do not add `vite-tsconfig-paths`.
- Vitest 5 needs `@types/node` >= 22, so keep it at 22+.
- `tests/` is type-checked by the root `tsconfig.json` (`**/*.ts`), so test code must compile under `strict`.
