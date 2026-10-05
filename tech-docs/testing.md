# Testing

Vitest is the only test runner. Config: `vitest.config.mts`.

## Commands

- `npm test` — one-shot run of all projects (CI-safe; plain `vitest` would watch).
- `npm run test:watch` — watch mode while developing.
- `npx vitest run --project unit` (or `integration`) — one project only.

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
