# REST API

`/api/todos` is the adapter for non-browser clients (the CLI, stdio MCP). Rules it follows: [architecture.md](architecture.md).

## Endpoints

Schemas are from `@todo-cat/contract`; every error body is `ErrorBody`. Every endpoint can also answer 401 `unauthorized`.

- `GET /api/todos?status=&text=` — query `TodoListFilter` → 200 `TodoList`; 400 `validation-failed`.
- `POST /api/todos` — body `CreateTodoInput` → 201 `Todo`; 400 `validation-failed`.
- `GET /api/todos/:id` — id `TodoId` → 200 `Todo`; 400 `validation-failed`, 404 `todo-not-found`.
- `PATCH /api/todos/:id` — id `TodoId`, body `UpdateTodoInput` → 200 `Todo`; 400 `validation-failed`, 404 `todo-not-found`.
- `DELETE /api/todos/:id` — id `TodoId` → 204, no body; 400 `validation-failed`, 404 `todo-not-found`.

Mark a todo done with `PATCH {"done": true}`; reopen it with `{"done": false}`.

## Design decisions

- Handlers live in `app/api/todos/route.ts` and `app/api/todos/[id]/route.ts`; the shared plumbing (`withUser`, `parse`, `readJson`, status mapping) is in `lib/rest.ts`.
- Auth is checked before any input is parsed, so an anonymous caller gets a 401 rather than a 400. The 401 response also carries `WWW-Authenticate: Bearer`.
- Validation failures at the boundary (bad JSON, schema errors, a non-uuid id) are thrown as `TodoError("validation-failed")`, so there is one error type and one mapping. The message is `z.prettifyError` output: readable, but clients should branch on `code`.
- A malformed id is 400, not 404: it is invalid input, not a missing todo.
- Unknown errors are rethrown, so Next answers 500 and logs them.

## Getting a bearer token with curl

Sign in through Better Auth; the bearer plugin returns the token in the `set-auth-token` response header (the seeded demo user shown):

```sh
TOKEN=$(curl -s -D - -o /dev/null -X POST http://localhost:3000/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -d '{"email":"demo@todo-cat.dev","password":"cat-person-2026"}' \
  | awk 'tolower($1)=="set-auth-token:" {print $2}' | tr -d '\r')

curl -s "http://localhost:3000/api/todos?status=open" -H "authorization: Bearer $TOKEN"
curl -s -X POST http://localhost:3000/api/todos -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"title":"Buy tuna","dueDate":"2026-10-31"}'
```

The token is the signed session token and expires with the session. Sign-up (`/api/auth/sign-up/email`) returns one too.

## Tests

`tests/integration/rest-api.test.ts` calls the route handlers directly with `Request` objects and real bearer tokens from `auth.api.signUpEmail({ returnHeaders: true })`, on a temp database. It covers mapping only (401 per endpoint without and with an invalid token, 404 across users, 400 codes, one happy-path flow); the service tests cover the rules.
