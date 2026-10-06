# Agent: Lissie

Lissie is one Mastra agent, served to a CopilotKit chat on `/` over AG-UI. Her tools (`listTodos`, `addTodo`, `setTodoDone`) are an adapter on the todo service (see [architecture.md](architecture.md)).

Versions are pinned exactly in `package.json` (`@mastra/*`, `@ag-ui/*`, `@copilotkit/*`); all three libraries move fast, so read the installed docs (`node_modules/@mastra/*/dist/docs/`) and the CopilotKit docs as Markdown (`https://docs.copilotkit.ai/<path>.md`) instead of recalling APIs.

## Layout

- `lib/lissie.ts` — the agent, its system prompt, model id, memory, and the per-user thread id.
- `lib/lissie-tools.ts` — the three tools; `tests/integration/lissie-tools.test.ts` runs them on a temp database with two users, and through the endpoint with a scripted model.
- `lib/copilot-runtime.ts` — the CopilotKit runtime, its auth hooks and the history replay. Everything security-relevant is in this one file.
- `app/api/copilotkit/[[...slug]]/route.ts` — mounts the handler on GET/POST/PATCH/DELETE.
- `components/lissie-chat.tsx` — the client chat; `app/page.tsx` passes it the server-computed thread id. `components/tool-line.ts` turns a tool call into its one-line text; `components/todo-sidebar.tsx` is the read-only list.
- `tests/integration/copilot-runtime.test.ts` — one test per rule below, against the real handler, temp database and a mock model; `e2e/chat.spec.ts` for the browser.

## Model

- `openrouter/<OPENROUTER_MODEL>` through Mastra's model router, default `z-ai/glm-5.3-flash`. The router reads `OPENROUTER_API_KEY`, which is only ever read on the server. Check a model id with `node .claude/skills/mastra/scripts/provider-registry.mjs --provider openrouter` before changing the default.
- Tests never call OpenRouter: they swap in `createMockModel` from `@mastra/core/test-utils/llm-mock` via `setLissieForTests`.

## Memory

- Mastra `Memory` with `LibSQLStore` on `DATABASE_URL`, the same SQLite file as Drizzle. Mastra creates its own `mastra_*` tables at first use; they are not in `lib/schema.ts` or `drizzle/` and drizzle-kit doesn't touch them.
- Scope: `resourceId` = Better Auth user id, one thread per user, `threadId` = `lissie-<userId>` (`lissieThreadId`). Memory survives a restart because it lives in the file.
- Mastra's memory has no access control of its own for queries, but it refuses to run a thread under a resource that doesn't own it. That is a second line behind the hooks, not a substitute for them.
- `@ag-ui/mastra` falls back to `resourceId = threadId` when none is given, which would let the client choose the scope. Always construct `MastraAgent` with `resourceId`.

## Authorization (the CopilotKit runtime)

The runtime serves many routes beyond the three the browser needs (thread lists, events, state, memories, inspector, transcribe, suggest, debug events, ...). Several read a thread by id alone, and the thread id is chosen by the client, so it is no secret. The rules, all in `lib/copilot-runtime.ts`:

1. **`onRequest`: no session, 401, on every path**, including paths that match no route. The session comes from `getUserId` like everywhere else, so cookie and bearer both work.
2. **`onBeforeHandler` is an allow-list, default deny (404).** Allowed: `info`; `agent/run` and `agent/connect` for agent `lissie` when the body's `threadId` is the caller's own; `agent/stop` for agent `lissie` on the caller's own thread. Everything else is 404, whatever the thread. A CopilotKit upgrade that adds a route is denied until someone allows it on purpose.
3. **Own thread means equality with `lissieThreadId(session user)`.** Knowing another user's thread id gets nothing; a missing, unparsable or foreign `threadId` is 404, like another user's todo ([architecture.md](architecture.md)).
4. **The agent is built per request** (`agents` factory) with `resourceId` = the session user. A shared instance would also refuse concurrent runs.
5. The browser never sees the API key or the memory store; no route returns anything but the caller's own conversation.

When adding a route or feature: extend the allow-list in `authorizeRoute`, add the route to `allRoutes` in the test, and keep the "allowed and denied lists cover every route" test passing.

## Tools

- The user id reaches a tool only through Mastra's request context: step 4 of the authorization rules builds a `RequestContext` with `userId` (`USER_ID_KEY`) from the session and hands it to `MastraAgent`; a tool reads it with `requestContext.get`. No tool input schema has a user field, so the model cannot supply one, and a tool without a user in the context throws.
- Tools never touch the database; they call `lib/todo-service.ts` and so inherit its ownership rules. A rule violation (`todo-not-found`) is returned as `{ error: { code, message } }` for the model to read; anything else throws.
- Persona: the comment on every added and every completed todo is an instruction in `LISSIE_INSTRUCTIONS`, not code. A mock model can't test it; the test only checks the instructions say it.
- Tests that script a model use `MastraLanguageModelV2Mock` and must give every tool call a unique `toolCallId`; Mastra replays the stored result for an id it has seen in the thread.
- Lissie is the browser's only write path to the list. The sidebar is a server component; `LissieChat` calls `router.refresh()` on every live `TOOL_CALL_RESULT` (not on history replay, which is a messages snapshot).
- The chat draws every tool call through one wildcard `useRenderTool` and `describeToolCall`; a new tool needs a case there or it gets the generic "Lissie used <name>" line.

## History replay on `connect`

CopilotKit hydrates a chat by calling `agent/connect` for the thread. The default `InMemoryAgentRunner` has nothing to replay after a restart, so `authorizeRoute` answers `connect` itself, after the ownership check, with `RUN_STARTED`, a `MESSAGES_SNAPSHOT` recalled from Mastra memory, `RUN_FINISHED`. It does this by throwing the Response (the hook short-circuit); the runtime's own connect handler is never reached.

- User and assistant text, plus tool calls and their results. A stored assistant message that interleaves text and calls is split at each call (text, call, result, text) with derived ids, as the live stream does; a call without a result is dropped.
- A run still streaming when the page reloads isn't replayed until it has finished and been saved.
- A thread that doesn't exist yet (first visit) is an empty history; Mastra throws for it, `recallMessages` catches.

## Frontend gotchas

- `@copilotkit/react-core/v2` must be imported from a `"use client"` file of our own, never from `app/layout.tsx`. Import from `/v2`; the package root is the deprecated v1.
- `<CopilotKit useSingleEndpoint={false}>` matches the multi-route handler.
- `CopilotChat` draws its welcome screen only for a thread it minted itself. Ours is explicit (so history replays), so `EmptyHint` renders the empty state, after the chat in the DOM so it isn't covered.
- `enableInspector={false}`: the dev inspector overlaps the header and calls routes we deny.

## Other

- The CopilotKit runtime sends anonymous usage telemetry unless `COPILOTKIT_TELEMETRY_DISABLED=1` is set.
- Mastra needs no `serverExternalPackages` entry here; the build and `next dev` work as is.
