import { createMockModel } from "@mastra/core/test-utils/llm-mock";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { migrateTempDb } from "../../scripts/with-temp-db";

// The CopilotKit runtime endpoint (lib/copilot-runtime.ts) called directly on a
// temp database with real Better Auth bearer tokens and a mock model. Every rule
// in tech-docs/agent.md has a test here: authentication on every route, the
// caller's own thread only, everything else denied, memory scoped to the user.

const tempDb = { url: "", cleanup: () => {} };
const users = {
  max: { token: "", id: "" },
  mia: { token: "", id: "" },
};
type Name = keyof typeof users;

const REPLY = "Hello human. Your list is judging you.";

async function useFreshLissie() {
  // A new Memory and Agent on the same file stands in for a server restart.
  const { createLissie, setLissieForTests } = await import("@/lib/lissie");
  const memory = new Memory({
    storage: new LibSQLStore({ id: "lissie-test", url: tempDb.url }),
  });
  setLissieForTests(
    createLissie({
      model: createMockModel({ mockText: REPLY, version: "v2" }),
      memory,
    }),
  );
  return memory;
}

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
  await useFreshLissie();
}, 60_000);

afterAll(() => tempDb.cleanup());

const handler = async () =>
  (await import("@/lib/copilot-runtime")).copilotHandler;
const threadOf = async (name: Name) =>
  (await import("@/lib/lissie")).lissieThreadId(users[name].id);

type Call = { method?: string; path: string; body?: unknown };

async function send(token: string | null, { method, path, body }: Call) {
  const headers = new Headers();
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  const request = new Request(`http://localhost/api/copilotkit${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await handler())(request);
}

const as = (name: Name, call: Call) => send(users[name].token, call);

function runInput(threadId: string | undefined, text: string) {
  return {
    ...(threadId === undefined ? {} : { threadId }),
    runId: crypto.randomUUID(),
    messages: [{ id: crypto.randomUUID(), role: "user", content: text }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
}

async function say(name: Name, text: string, threadId?: string) {
  return as(name, {
    path: "/agent/lissie/run",
    body: runInput(threadId ?? (await threadOf(name)), text),
  });
}

type SnapshotMessage = { id: string; role: string; content: string };

async function history(name: Name): Promise<SnapshotMessage[]> {
  const response = await as(name, {
    path: "/agent/lissie/connect",
    body: { threadId: await threadOf(name) },
  });
  expect(response.status).toBe(200);
  const events = (await response.text())
    .split("\n\n")
    .filter((frame) => frame.startsWith("data: "))
    .map((frame) => JSON.parse(frame.slice("data: ".length)));
  expect(events.map((event) => event.type)).toEqual([
    "RUN_STARTED",
    "MESSAGES_SNAPSHOT",
    "RUN_FINISHED",
  ]);
  return events[1].messages;
}

// Every route the runtime can serve (RouteInfo in @copilotkit/runtime), once
// with a thread id of Max's. The id in the URL or body is the one a caller names.
const allRoutes = (threadId: string): [string, Call][] => [
  ["GET /info", { path: "/info" }],
  ["GET /inspector-metadata", { path: "/inspector-metadata" }],
  ["GET /inspector-learning", { path: "/inspector-learning?agentId=lissie" }],
  ["POST /transcribe", { path: "/transcribe", body: {} }],
  ["GET /cpk-debug-events", { path: "/cpk-debug-events" }],
  [
    "POST /agent/:agent/run",
    { path: "/agent/lissie/run", body: runInput(threadId, "hi") },
  ],
  [
    "POST /agent/:agent/suggest",
    { path: "/agent/lissie/suggest", body: runInput(threadId, "hi") },
  ],
  [
    "POST /agent/:agent/connect",
    { path: "/agent/lissie/connect", body: { threadId } },
  ],
  [
    "POST /trajectory/:id/connect",
    { path: "/trajectory/some-id/connect", body: {} },
  ],
  [
    "POST /agent/:agent/stop/:thread",
    { path: `/agent/lissie/stop/${threadId}`, body: {} },
  ],
  ["GET /threads", { path: "/threads?agentId=lissie" }],
  ["POST /threads/subscribe", { path: "/threads/subscribe", body: {} }],
  ["GET /threads/:id/messages", { path: `/threads/${threadId}/messages` }],
  ["GET /threads/:id/events", { path: `/threads/${threadId}/events` }],
  ["GET /threads/:id/state", { path: `/threads/${threadId}/state` }],
  [
    "PATCH /threads/:id",
    { method: "PATCH", path: `/threads/${threadId}`, body: { name: "x" } },
  ],
  ["DELETE /threads/:id", { method: "DELETE", path: `/threads/${threadId}` }],
  [
    "POST /threads/:id/archive",
    { path: `/threads/${threadId}/archive`, body: {} },
  ],
  ["POST /threads/clear", { path: "/threads/clear", body: {} }],
  ["GET /memories", { path: "/memories" }],
  ["POST /memories", { path: "/memories", body: {} }],
  ["POST /memories/recall", { path: "/memories/recall", body: {} }],
  ["POST /memories/subscribe", { path: "/memories/subscribe", body: {} }],
  ["DELETE /memories/:id", { method: "DELETE", path: "/memories/some-id" }],
  ["POST /annotate", { path: "/annotate", body: {} }],
  ["GET /no-such-route", { path: "/no-such-route" }],
];

describe("authentication: every route needs a signed-in user", () => {
  const routes = allRoutes("lissie-whoever");

  test.each(routes)("%s without credentials is 401", async (_, call) => {
    const response = await send(null, call);
    expect(response.status).toBe(401);
  });

  test.each(routes)("%s with an invalid token is 401", async (_, call) => {
    const response = await send("not-a-real-token", call);
    expect(response.status).toBe(401);
  });

  test("a 401 leaks nothing about agents or threads", async () => {
    const response = await send(null, { path: "/info" });
    expect(JSON.stringify(await response.json())).not.toContain("lissie");
  });
});

describe("a signed-in user and their own thread", () => {
  test("sees only Lissie in /info", async () => {
    const response = await as("max", { path: "/info" });
    expect(response.status).toBe(200);
    const info = (await response.json()) as { agents: Record<string, unknown> };
    expect(Object.keys(info.agents)).toEqual(["lissie"]);
  });

  test("a fresh user's history is empty, not an error", async () => {
    expect(await history("mia")).toEqual([]);
  });

  test("chats with Lissie, and the conversation is replayed from memory", async () => {
    const response = await say("max", "I have to buy tuna");
    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain("TEXT_MESSAGE_CONTENT");
    expect(stream).toContain("judging you");

    const messages = await history("max");
    expect(messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "I have to buy tuna"],
      ["assistant", REPLY],
    ]);
  });

  test("the conversation survives a restart", async () => {
    await useFreshLissie();
    const messages = await history("max");
    expect(messages.map((m) => m.content)).toEqual([
      "I have to buy tuna",
      REPLY,
    ]);
  });

  test("stopping their own thread passes authorization", async () => {
    const response = await as("max", {
      path: `/agent/lissie/stop/${await threadOf("max")}`,
      body: {},
    });
    expect(response.status).not.toBe(404);
    expect(response.status).not.toBe(401);
  });
});

describe("memory is scoped to the signed-in user", () => {
  test("each user's thread belongs to their own resource", async () => {
    await say("mia", "Dentist on Friday");
    const memory = await useFreshLissie();
    for (const name of ["max", "mia"] as const) {
      const thread = await memory.getThreadById({
        threadId: await threadOf(name),
      });
      expect(thread?.resourceId).toBe(users[name].id);
    }
  });

  test("one user's history never contains the other's messages", async () => {
    const max = (await history("max")).map((m) => m.content).join("|");
    const mia = (await history("mia")).map((m) => m.content).join("|");
    expect(max).toContain("tuna");
    expect(max).not.toContain("Dentist");
    expect(mia).toContain("Dentist");
    expect(mia).not.toContain("tuna");
  });

  test("the thread id is derived from the session, not the request", async () => {
    // The run names no thread of its own choosing: only Mia's own id is accepted.
    const response = await say("mia", "hello", await threadOf("max"));
    expect(response.status).toBe(404);
  });
});

describe("one user cannot reach another user's thread", () => {
  test("cannot run on it, and nothing is written", async () => {
    const before = (await history("max")).length;
    const response = await say("mia", "I am Max now", await threadOf("max"));
    expect(response.status).toBe(404);
    expect(await history("max")).toHaveLength(before);
  });

  test("cannot connect to it or read its history", async () => {
    const response = await as("mia", {
      path: "/agent/lissie/connect",
      body: { threadId: await threadOf("max") },
    });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("tuna");
  });

  test("cannot stop its run", async () => {
    const response = await as("mia", {
      path: `/agent/lissie/stop/${await threadOf("max")}`,
      body: {},
    });
    expect(response.status).toBe(404);
  });

  test("cannot read its messages, events or state", async () => {
    const threadId = await threadOf("max");
    for (const part of ["messages", "events", "state"]) {
      const response = await as("mia", {
        path: `/threads/${threadId}/${part}`,
      });
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("tuna");
    }
  });

  test("cannot list threads", async () => {
    const response = await as("mia", { path: "/threads" });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(await threadOf("max"));
  });

  test("a run without a thread id, or with a made-up one, is refused", async () => {
    expect((await say("mia", "hi", "")).status).toBe(404);
    expect((await say("mia", "hi", "lissie-nobody")).status).toBe(404);
    const noThread = await as("mia", {
      path: "/agent/lissie/run",
      body: runInput(undefined, "hi"),
    });
    expect(noThread.status).toBe(404);
  });

  test("a malformed body is refused, not a server error", async () => {
    const request = new Request(
      "http://localhost/api/copilotkit/agent/lissie/run",
      {
        method: "POST",
        headers: { authorization: `Bearer ${users.mia.token}` },
        body: "{not json",
      },
    );
    expect((await (await handler())(request)).status).toBe(404);
  });

  test("an agent other than Lissie does not exist, even on their own thread", async () => {
    const response = await as("mia", {
      path: "/agent/default/run",
      body: runInput(await threadOf("mia"), "hi"),
    });
    expect(response.status).toBe(404);
  });
});

describe("routes the chat does not need are denied by default", () => {
  const denied = new Set([
    "GET /inspector-metadata",
    "GET /inspector-learning",
    "POST /transcribe",
    "GET /cpk-debug-events",
    "POST /agent/:agent/suggest",
    "POST /trajectory/:id/connect",
    "GET /threads",
    "POST /threads/subscribe",
    "GET /threads/:id/messages",
    "GET /threads/:id/events",
    "GET /threads/:id/state",
    "PATCH /threads/:id",
    "DELETE /threads/:id",
    "POST /threads/:id/archive",
    "POST /threads/clear",
    "GET /memories",
    "POST /memories",
    "POST /memories/recall",
    "POST /memories/subscribe",
    "DELETE /memories/:id",
    "POST /annotate",
    "GET /no-such-route",
  ]);

  test("the denied list and the allowed list cover every route", () => {
    const allowed = [
      "GET /info",
      "POST /agent/:agent/run",
      "POST /agent/:agent/connect",
      "POST /agent/:agent/stop/:thread",
    ];
    const names = allRoutes("x").map(([name]) => name);
    expect(names.filter((n) => !denied.has(n)).sort()).toEqual(allowed.sort());
  });

  test.each(
    allRoutes("lissie-placeholder").filter(([name]) => denied.has(name)),
  )("%s is 404 even for their own thread", async (name, call) => {
    // Rebuild with Max's real thread so the thread id is genuinely his.
    const own = allRoutes(await threadOf("max")).find(([n]) => n === name);
    const response = await as("max", own?.[1] ?? call);
    expect(response.status).toBe(404);
  });

  test("clearing threads as a signed-in user wipes nothing", async () => {
    await as("max", { path: "/threads/clear", body: {} });
    expect((await history("max")).length).toBeGreaterThan(0);
  });
});

describe("the model", () => {
  test("defaults to GLM 5.3 Flash through OpenRouter", async () => {
    const { lissieModelId } = await import("@/lib/lissie");
    const saved = process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_MODEL;
    expect(lissieModelId()).toBe("openrouter/z-ai/glm-5.3-flash");
    process.env.OPENROUTER_MODEL = "z-ai/glm-5.2";
    expect(lissieModelId()).toBe("openrouter/z-ai/glm-5.2");
    if (saved === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = saved;
  });

  test("the API key never reaches a response", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-v1-secret-for-test";
    const bodies = [
      await (await as("max", { path: "/info" })).text(),
      await (await say("max", "psst")).text(),
    ];
    for (const body of bodies) expect(body).not.toContain("sk-or-v1-secret");
  });
});

test("the route mounts the runtime on every verb it uses", async () => {
  const route = await import("@/app/api/copilotkit/[[...slug]]/route");
  const { copilotHandler } = await import("@/lib/copilot-runtime");
  for (const verb of [route.GET, route.POST, route.PATCH, route.DELETE]) {
    expect(verb).toBe(copilotHandler);
  }
});
