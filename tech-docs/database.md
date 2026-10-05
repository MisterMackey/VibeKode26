# Database

SQLite file via `@libsql/client`, accessed with Drizzle ORM. `DATABASE_URL` (`.env`, template in `.env.example`) points at the file, default `file:./data/app.db`; `data/` is git-ignored except its `.gitignore`.

## Layout

- `lib/db.ts` — the only module that opens the database at runtime; exports `db`. It imports `server-only`, so client bundles fail the build. Import it from server code only.
- `lib/schema.ts` — Drizzle schema. Empty on purpose: todos arrive with the architecture, auth tables with authentication.
- `drizzle.config.ts` — drizzle-kit config (schema, `drizzle/` output, `DATABASE_URL` via dotenv).
- `drizzle/` — generated migrations; commit them, never edit applied ones.

## Migrations

- `npm run db:generate` after a schema change, `npm run db:migrate` to apply, `npm run db:reset` to wipe the local file and migrate fresh (refuses non-`file:` URLs).
- Migrations are applied only through the `drizzle-kit` CLI, never programmatically, so nothing besides `lib/db.ts` opens the database from app code.
- `drizzle/*_init` is a hand-made baseline (`SELECT 1;`): drizzle-kit generates nothing for an empty schema, and an empty or comment-only SQL file fails in libsql ("not an error").

## Temp databases for tests

`scripts/with-temp-db.ts` exports `migrateTempDb()` (fresh temp dir, migrated via drizzle-kit, returns `url` and `cleanup`). Used two ways:

- `tests/integration/db.test.ts` calls it, sets `DATABASE_URL`, then imports `@/lib/db` dynamically, because `lib/db.ts` reads the env at import time.
- `tsx scripts/with-temp-db.ts <command...>` runs a command with `DATABASE_URL` set to a throwaway migrated database; wrap the e2e server start in it once e2e exists (none yet, see [testing.md](testing.md)).

## Gotchas

- Drizzle is on the 1.0 release candidate (`drizzle-orm@rc`, `drizzle-kit@rc`); the API differs from older tutorials. Check https://orm.drizzle.team/llms.txt.
- Vitest aliases `server-only` to `tests/empty.ts` (see `vitest.config.mts`), since the real package throws outside Next.
- Git worktrees do not contain the git-ignored `.env`; copy it in before running db commands.
