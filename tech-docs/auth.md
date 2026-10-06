# Auth

Better Auth (`better-auth`, `@better-auth/drizzle-adapter`), pinned to `1.7.7` exactly — later versions change the plugin/adapter APIs used here. Email+password only. The bearer plugin authenticates the REST API (see [rest-api.md](rest-api.md)); the device-authorization plugin is the CLI's login, approved on the `/device` page and restricted to the CLI's client id (see [cli.md](cli.md)).

## Layout

- `lib/auth.ts` — the Better Auth server instance (`auth`) and its config (`authOptions`), exported separately so tooling (see Schema below) can reuse the plugin/option list without constructing a real instance.
- `lib/auth-client.ts` — the browser client (`better-auth/react`, with the device-authorization client plugin), used by `/signup`, `/login` and `/device`.
- `lib/session.ts` — `getUserId(headers): Promise<string | null>`. The **only** place that calls `auth.api.getSession`. Every future adapter (REST, agent tools, MCP) goes through this, not through `auth` directly.
- `app/api/auth/[...all]/route.ts` — mounts `auth.handler` via `toNextJsHandler`.
- `app/signup/page.tsx`, `app/login/page.tsx` — client components calling `authClient.signUp.email` / `signIn.email`.
- `components/ui/form.tsx` — shared Tailwind form pieces (`AuthCard`, `FormField`, `SubmitButton`, `FormError`, `FormFooter`, `FooterLink`) used by both pages.
- `app/page.tsx` — server component; redirects to `/login` if `getUserId` returns null, otherwise renders the header (user's name, `<SignOutButton>`) and Lissie's chat ([agent.md](agent.md)). It looks up the display name with a plain `db.select()`, not a second session read — the helper above is still the only session reader.

## Why `getUserId` already handles bearer tokens

The `bearer` plugin installs a global `before` hook that rewrites any request with an `Authorization: Bearer <token>` header into the equivalent session cookie *before* the matched endpoint runs — including `auth.api.getSession`. So `getUserId` needs no bearer-specific branch: cookie and bearer requests both resolve through the same `auth.api.getSession({ headers })` call. Verified by reading `node_modules/better-auth/dist/plugins/bearer/index.mjs`, since training data on this is unreliable (see `AGENTS.md`).

## Drizzle adapter and `db._.fullSchema`

`drizzleAdapter(db, { provider: "sqlite", schema })` is given `schema` **explicitly** rather than relying on `db._.fullSchema`. In drizzle-orm's relations-v2 API (the `1.0.0-rc` line this project is on), `db._.fullSchema` is only populated when you pass `relations` (from `defineRelations`) to `drizzle()` — passing `schema` to `drizzle()` no longer populates it. Passing `schema` straight into the adapter config sidesteps this; `lib/db.ts` stays schema-agnostic.

## Schema: generated, not hand-written

The Better Auth CLI normally generates `lib/schema.ts` (`npx auth generate --adapter drizzle --dialect sqlite`), then `npm run db:generate`/`db:migrate` apply it like any other Drizzle change. **This sandbox blocks installing a package literally named `auth`** (name-confusion heuristic), even though it's Better Auth's real CLI (same GitHub repo, matching version). So instead:

- `scripts/gen-auth-schema.mjs` imports `@better-auth/drizzle-adapter`'s internal schema generator directly (by relative path — it isn't part of that package's public API) with the same options as `lib/auth.ts`, and prints the Drizzle table source for `lib/schema.ts`.
- **Run it with plain `node`, not `tsx`.** esbuild's transform (which `tsx` applies to the whole import graph, including this file's `node_modules` dependencies) mangles the upstream `/* @__PURE__ */ new Date()` annotation into a bare `new Date` reference, silently breaking every generated `.$onUpdate()` call. Confirmed by diffing `node scripts/gen-auth-schema.mjs` output against the same call under `tsx`.

To add a field or plugin: edit `lib/auth.ts`, mirror the same plugins/options in `scripts/gen-auth-schema.mjs`, run `node scripts/gen-auth-schema.mjs > /tmp/auth-schema.ts`, review and merge the diff into `lib/schema.ts` by hand (format with `npm run format`), then `npm run db:generate && npm run db:migrate` as usual. The generator also emits an `authRelations`/`defineRelationsPart` block for Drizzle's relational query API — dropped from `lib/schema.ts` since nothing here uses `db.query.*` or `advanced.database.joins` yet; regenerate and re-add it if that changes.

## Testing

- `tests/integration/auth.test.ts` — same temp-database + dynamic-import pattern as `tests/integration/db.test.ts` (see `database.md`): set `DATABASE_URL` to a freshly migrated temp db in `beforeAll`, then `await import("@/lib/auth")` / `await import("@/lib/session")` so the module-level `auth`/`db` singletons pick it up. Covers sign-up, right/wrong password sign-in, and `getUserId` against a cookie, a bearer token, and neither.
  - Uses `better-auth/test`'s `convertSetCookieToCookie` and `auth.api.*`'s `returnHeaders: true` option for cookies and bearer tokens.
  - 1.7.7 also ships the `testUtils()` plugin (`better-auth/plugins`; `createUser`, `saveUser`, `login` for session cookies); add it to a test-only instance built from `authOptions`, never to `lib/auth.ts` — see `tests/integration/cli.test.ts`.
- `e2e/auth.spec.ts` (Playwright) — real browser sign-up → sign-out → sign-in; `e2e/device.spec.ts` — approving a device code. Config and temp-database wiring in `testing.md`.

## Not done yet

- No email verification, password reset, or rate limiting beyond Better Auth's defaults.
