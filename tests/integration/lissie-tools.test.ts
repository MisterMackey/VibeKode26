import { RequestContext } from "@mastra/core/request-context";
import { MastraLanguageModelV2Mock } from "@mastra/core/test-utils/llm-mock";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { migrateTempDb } from "../../scripts/with-temp-db";

// Lissie's tools (lib/lissie-tools.ts) on a temp database, with two users in every
// case, and then the whole path: session -> request context -> tool -> service,
// through the CopilotKit endpoint with a scripted model.

const tempDb = { url: "", cleanup: () => {} };
const users = {
  max: { token: "", id: "" },
  mia: { token: "", id: "" },
};
type Name = keyof typeof users;

beforeAll(async () => {
  Object.assign(tempDb, migrateTempDb());
  process.env.DATABASE_URL = tempDb.url;
  const { auth } = await import("@/lib/auth");
  for (const name of Object.keys(users) as Name[]) {
    const { headers, response } = await auth.api.signUpEmail({
      body: { name, email: `${name}@example.com`, password: "whiskers123" },
      returnHeaders: true,
    });
    users[name] = {
      token: headers.get("set-auth-token") ?? "",
      id: response.user.id,
    };
  }
}, 60_000);

afterAll(() => tempDb.cleanup());

const tools = () => import("@/lib/lissie-tools");
const service = () => import("@/lib/todo-service");

// Mastra types `execute` as optional and wants a full execution context; the
// tests only supply what the tools read, as the agent loop does.
const run = (tool: unknown, input: unknown, context: unknown) =>
  (
    tool as { execute(input: unknown, context: unknown): Promise<unknown> }
  ).execute(input, context);

// What the CopilotKit runtime builds for a request: the verified user id in a
// Mastra RequestContext. The tools execute exactly as the agent runs them.
const contextFor = (name: Name) => {
  const requestContext = new RequestContext();
  requestContext.set("userId", users[name].id);
  return { requestContext };
};

describe("executors", () => {
  test("addTodo creates a todo for the signed-in user", async () => {
    const { addTodo } = await tools();
    const result = await run(
      addTodo,
      { title: "  Buy tuna  ", dueDate: "2026-10-31" },
      contextFor("max"),
    );
    expect(result).toMatchObject({
      todo: { title: "Buy tuna", dueDate: "2026-10-31", done: false },
    });
    const { listTodos } = await service();
    expect(await listTodos(users.max.id)).toHaveLength(1);
    expect(await listTodos(users.mia.id)).toHaveLength(0);
  });

  test("listTodos returns open before done and honours the filters", async () => {
    const { addTodo, setTodoDone, listTodos } = await tools();
    const ctx = contextFor("max");
    await run(addTodo, { title: "Feed the cat" }, ctx);
    const { todos } = (await run(listTodos, { status: "all" }, ctx)) as {
      todos: { id: string; title: string }[];
    };
    const feed = todos.find((todo) => todo.title === "Feed the cat");
    expect(feed).toBeDefined();
    await run(setTodoDone, { id: feed?.id ?? "", done: true }, ctx);

    const all = await run(listTodos, { status: "all" }, ctx);
    expect(all).toMatchObject({
      todos: [{ title: "Buy tuna" }, { title: "Feed the cat", done: true }],
    });
    expect(await run(listTodos, { status: "open" }, ctx)).toMatchObject({
      todos: [{ title: "Buy tuna" }],
    });
    expect(await run(listTodos, { status: "done" }, ctx)).toMatchObject({
      todos: [{ title: "Feed the cat" }],
    });
    expect(
      await run(listTodos, { status: "all", text: "TUNA" }, ctx),
    ).toMatchObject({ todos: [{ title: "Buy tuna" }] });
  });

  test("setTodoDone marks a todo done, and reopens it with done=false", async () => {
    const { addTodo, setTodoDone } = await tools();
    const ctx = contextFor("max");
    const { todo } = (await run(addTodo, { title: "Nap" }, ctx)) as {
      todo: { id: string };
    };

    const done = await run(setTodoDone, { id: todo.id }, ctx);
    expect(done).toMatchObject({ todo: { done: true } });
    expect((done as { todo: { completedAt: string | null } }).todo.completedAt)
      .not.toBeNull;

    const reopened = await run(setTodoDone, { id: todo.id, done: false }, ctx);
    expect(reopened).toMatchObject({
      todo: { done: false, completedAt: null },
    });
  });

  test("an unknown id is a result the model can read, not a crash", async () => {
    const { setTodoDone } = await tools();
    const result = await run(
      setTodoDone,
      { id: crypto.randomUUID() },
      contextFor("max"),
    );
    expect(result).toMatchObject({ error: { code: "todo-not-found" } });
  });

  test("bad input is refused before it reaches the service", async () => {
    const { addTodo, setTodoDone } = await tools();
    const { listTodos } = await service();
    const before = (await listTodos(users.max.id)).length;
    const blank = await run(addTodo, { title: "   " }, contextFor("max"));
    const badDate = await run(
      addTodo,
      { title: "x", dueDate: "tomorrow" },
      contextFor("max"),
    );
    const badId = await run(
      setTodoDone,
      { id: "not-a-uuid" },
      contextFor("max"),
    );
    for (const result of [blank, badDate, badId])
      expect(result).toMatchObject({ error: true });
    expect(await listTodos(users.max.id)).toHaveLength(before);
  });
});

describe("per-user isolation", () => {
  test("Mia's list does not contain Max's todos", async () => {
    const { listTodos } = await tools();
    expect(await run(listTodos, { status: "all" }, contextFor("mia"))).toEqual({
      todos: [],
    });
  });

  test("Mia cannot mark Max's todo done: not found, and it stays open", async () => {
    const { addTodo, setTodoDone } = await tools();
    const { todo } = (await run(
      addTodo,
      { title: "Max's secret stash" },
      contextFor("max"),
    )) as { todo: { id: string } };

    const result = await run(setTodoDone, { id: todo.id }, contextFor("mia"));
    expect(result).toMatchObject({ error: { code: "todo-not-found" } });

    const { getTodo } = await service();
    expect((await getTodo(users.max.id, todo.id)).done).toBe(false);
  });

  test("addTodo writes to the context's user, whatever the model puts in the input", async () => {
    const { addTodo } = await tools();
    // The schema has no user field, so an invented one is dropped by validation.
    await run(
      addTodo,
      { title: "Planted", userId: users.max.id } as never,
      contextFor("mia"),
    );
    const { listTodos } = await service();
    expect((await listTodos(users.mia.id)).map((t) => t.title)).toEqual([
      "Planted",
    ]);
    expect((await listTodos(users.max.id)).map((t) => t.title)).not.toContain(
      "Planted",
    );
  });

  test("without a user in the request context nothing runs", async () => {
    const { addTodo, listTodos } = await tools();
    const { listTodos: all } = await service();
    const before = (await all(users.max.id)).length;
    for (const context of [
      { requestContext: new RequestContext() },
      { requestContext: undefined },
    ]) {
      // A server misconfiguration, not something for the model to read: it throws.
      await expect(
        run(addTodo, { title: "Orphan" }, context as never),
      ).rejects.toThrow("No signed-in user");
      await expect(
        run(listTodos, { status: "all" }, context as never),
      ).rejects.toThrow("No signed-in user");
    }
    expect(await all(users.max.id)).toHaveLength(before);
  });
});

// ---- Through the CopilotKit endpoint ---------------------------------------

type Step = { tool: string; input: Record<string, unknown> } | { text: string };

// A model that follows a script: one step per model call in a run. It can call
// a tool with any input, including an invented user id, which is the point.
function scriptedModel(steps: Step[]) {
  let call = 0;
  return new MastraLanguageModelV2Mock({
    doStream: async () => {
      const step = steps[Math.min(call++, steps.length - 1)];
      const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
      const parts =
        "tool" in step
          ? [
              {
                type: "tool-call" as const,
                toolCallId: crypto.randomUUID(),
                toolName: step.tool,
                input: JSON.stringify(step.input),
              },
              {
                type: "finish" as const,
                finishReason: "tool-calls" as const,
                usage,
              },
            ]
          : [
              { type: "text-start" as const, id: `t-${call}` },
              {
                type: "text-delta" as const,
                id: `t-${call}`,
                delta: step.text,
              },
              { type: "text-end" as const, id: `t-${call}` },
              { type: "finish" as const, finishReason: "stop" as const, usage },
            ];
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  });
}

async function useScript(steps: Step[]) {
  const { createLissie, setLissieForTests } = await import("@/lib/lissie");
  setLissieForTests(
    createLissie({
      model: scriptedModel(steps),
      memory: new Memory({
        storage: new LibSQLStore({ id: "lissie-tools-test", url: tempDb.url }),
      }),
    }),
  );
}

async function post(name: Name, path: string, body: unknown) {
  const { copilotHandler } = await import("@/lib/copilot-runtime");
  return copilotHandler(
    new Request(`http://localhost/api/copilotkit${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${users[name].token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

async function say(name: Name, text: string) {
  const { lissieThreadId } = await import("@/lib/lissie");
  const response = await post(name, "/agent/lissie/run", {
    threadId: lissieThreadId(users[name].id),
    runId: crypto.randomUUID(),
    messages: [{ id: crypto.randomUUID(), role: "user", content: text }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  });
  expect(response.status).toBe(200);
  return response.text();
}

type Msg = {
  id: string;
  role: string;
  content?: string;
  toolCalls?: { id: string; function: { name: string; arguments: string } }[];
  toolCallId?: string;
};

async function history(name: Name): Promise<Msg[]> {
  const { lissieThreadId } = await import("@/lib/lissie");
  const response = await post(name, "/agent/lissie/connect", {
    threadId: lissieThreadId(users[name].id),
  });
  const frames = (await response.text())
    .split("\n\n")
    .filter((frame) => frame.startsWith("data: "))
    .map((frame) => JSON.parse(frame.slice(6)));
  return frames.find((e) => e.type === "MESSAGES_SNAPSHOT").messages;
}

describe("through the CopilotKit endpoint", () => {
  test("the tool acts for the session's user, even if the model names someone else", async () => {
    await useScript([
      {
        tool: "addTodo",
        input: { title: "Sneak one in", userId: users.max.id },
      },
      { text: "Written down. Riveting." },
    ]);
    const stream = await say("mia", "add sneak one in");
    expect(stream).toContain("TOOL_CALL_RESULT");

    const { listTodos } = await service();
    expect((await listTodos(users.mia.id)).map((t) => t.title)).toContain(
      "Sneak one in",
    );
    expect((await listTodos(users.max.id)).map((t) => t.title)).not.toContain(
      "Sneak one in",
    );
  });

  test("the model cannot reach another user's todo by id", async () => {
    const { listTodos, addTodo } = await service();
    const maxTodo = await addTodo(users.max.id, { title: "Max only" });
    await useScript([
      { tool: "setTodoDone", input: { id: maxTodo.id } },
      { text: "No such todo." },
    ]);
    const stream = await say("mia", "finish Max only");
    expect(stream).toContain("todo-not-found");
    const [after] = (await listTodos(users.max.id)).filter(
      (t) => t.id === maxTodo.id,
    );
    expect(after.done).toBe(false);
  });

  test("tool calls and their results survive a restart, in order", async () => {
    const { addTodo } = await service();
    const todo = await addTodo(users.mia.id, { title: "Feed the cat" });
    await useScript([
      { tool: "setTodoDone", input: { id: todo.id } },
      { text: "Finally. The bowl was a disgrace." },
    ]);
    await say("mia", "I fed the cat");

    // A new agent and memory on the same file stand in for a server restart.
    await useScript([{ text: "unused" }]);
    const messages = await history("mia");
    const tail = messages.slice(-4);
    expect(tail.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    const [, call, result, comment] = tail;
    expect(call.toolCalls?.[0].function.name).toBe("setTodoDone");
    expect(JSON.parse(call.toolCalls?.[0].function.arguments ?? "{}")).toEqual({
      id: todo.id,
    });
    expect(result.toolCallId).toBe(call.toolCalls?.[0].id);
    expect(JSON.parse(result.content ?? "{}")).toMatchObject({
      todo: { id: todo.id, done: true },
    });
    expect(comment.content).toBe("Finally. The bowl was a disgrace.");
    const ids = messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("Max's history holds none of Mia's tool calls", async () => {
    const max = JSON.stringify(await history("max"));
    expect(max).not.toContain("Feed the cat");
    expect(max).not.toContain("Sneak one in");
  });
});

test("Lissie's instructions require a comment on every add and every completion", async () => {
  const { LISSIE_INSTRUCTIONS } = await import("@/lib/lissie");
  expect(LISSIE_INSTRUCTIONS).toMatch(
    /every todo you add and every todo you mark done/,
  );
  expect(LISSIE_INSTRUCTIONS).toContain("Feed the cat");
  for (const name of ["listTodos", "addTodo", "setTodoDone"])
    expect(LISSIE_INSTRUCTIONS).toContain(name);
});
