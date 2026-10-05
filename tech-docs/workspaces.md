# Workspaces

The repo is an npm workspaces monorepo: the Next.js app at the root, plus `contract/` and `cli/` (see `workspaces` in `package.json`).

## Why the layout exists before its content does

- The web app, the CLI, and the future agent (Lissie) must agree on the shape of a todo, so the schemas live in one shared package rather than in the app.
- `contract/` (`@todo-cat/contract`) is meant to hold the shared zod schemas; the app and `cli/` depend on it instead of redefining types.
- `cli/` (`todo-cat-cli`) is meant to be the `todo-cat` command-line client of the same data.
- Both packages are empty on purpose: creating them first fixes the dependency direction (app and cli depend on contract, never the reverse) before code accumulates.

## Gotchas

- Install from the repo root so npm links the workspaces.
- Biome runs once from the root and covers all workspaces (`biome.json`).
