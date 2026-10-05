import { ErrorBody, Todo, TodoList } from "@todo-cat/contract";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { migrateTempDb } from "../../scripts/with-temp-db";

// The REST adapter's route handlers, called directly on a temp database with
// real bearer tokens from Better Auth. Mapping only: the service tests cover the rules.

const tempDb = { url: "", cleanup: () => {} };
const tokens = { max: "", mia: "" };

beforeAll(async () => {
  Object.assign(tempDb, migrateTempDb());
  process.env.DATABASE_URL = tempDb.url;
  const { auth } = await import("@/lib/auth");
  for (const name of ["max", "mia"] as const) {
    const { headers } = await auth.api.signUpEmail({
      body: { name, email: `${name}@example.com`, password: "whiskers123" },
      returnHeaders: true,
    });
    tokens[name] = headers.get("set-auth-token") ?? "";
  }
}, 60_000);

afterAll(() => tempDb.cleanup());

const collection = () => import("@/app/api/todos/route");
const item = () => import("@/app/api/todos/[id]/route");

function request(
  token: string | null,
  init: { method?: string; query?: string; body?: unknown } = {},
): Request {
  const headers = new Headers();
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set("content-type", "application/json");
    body =
      typeof init.body === "string" ? init.body : JSON.stringify(init.body);
  }
  return new Request(`http://localhost/api/todos${init.query ?? ""}`, {
    method: init.method ?? "GET",
    headers,
    body,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(ErrorBody.parse(await response.json()).error.code).toBe(code);
}

const someId = crypto.randomUUID();
const endpoints: [string, (token: string | null) => Promise<Response>][] = [
  ["GET /api/todos", async (t) => (await collection()).GET(request(t))],
  [
    "POST /api/todos",
    async (t) =>
      (await collection()).POST(
        request(t, { method: "POST", body: { title: "Feed Lissie" } }),
      ),
  ],
  [
    "GET /api/todos/:id",
    async (t) => (await item()).GET(request(t), params(someId)),
  ],
  [
    "PATCH /api/todos/:id",
    async (t) =>
      (await item()).PATCH(
        request(t, { method: "PATCH", body: { done: true } }),
        params(someId),
      ),
  ],
  [
    "DELETE /api/todos/:id",
    async (t) =>
      (await item()).DELETE(request(t, { method: "DELETE" }), params(someId)),
  ],
];

describe("401 unauthorized", () => {
  test.each(endpoints)("%s without a token", async (_, call) => {
    const response = await call(null);
    await expectError(response, 401, "unauthorized");
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });

  test.each(endpoints)("%s with an invalid token", async (_, call) => {
    await expectError(await call("not-a-real-token"), 401, "unauthorized");
  });
});

test("add, list, mark done, filter, and delete with a bearer token", async () => {
  const { GET: list, POST: add } = await collection();
  const { GET: get, PATCH: update, DELETE: remove } = await item();
  const token = tokens.max;

  const created = await add(
    request(token, {
      method: "POST",
      body: { title: "Buy tuna", dueDate: "2026-10-31" },
    }),
  );
  expect(created.status).toBe(201);
  const todo = Todo.parse(await created.json());
  expect(todo).toMatchObject({ title: "Buy tuna", dueDate: "2026-10-31" });

  const listed = await list(request(token));
  expect(listed.status).toBe(200);
  expect(TodoList.parse(await listed.json())).toEqual([todo]);

  const updated = await update(
    request(token, { method: "PATCH", body: { done: true } }),
    params(todo.id),
  );
  expect(updated.status).toBe(200);
  expect(Todo.parse(await updated.json())).toMatchObject({
    id: todo.id,
    done: true,
    completedAt: expect.any(String),
  });

  const filtered = async (query: string) =>
    TodoList.parse(await (await list(request(token, { query }))).json()).map(
      (t) => t.id,
    );
  expect(await filtered("?status=done")).toEqual([todo.id]);
  expect(await filtered("?status=open")).toEqual([]);
  expect(await filtered("?text=TUNA")).toEqual([todo.id]);
  expect(await filtered("?text=salmon")).toEqual([]);

  const fetched = await get(request(token), params(todo.id));
  expect(Todo.parse(await fetched.json()).done).toBe(true);

  const deleted = await remove(
    request(token, { method: "DELETE" }),
    params(todo.id),
  );
  expect(deleted.status).toBe(204);
  expect(await deleted.text()).toBe("");
  await expectError(
    await get(request(token), params(todo.id)),
    404,
    "todo-not-found",
  );
});

test("another user's todo id is 404 todo-not-found", async () => {
  const { POST: add } = await collection();
  const { GET: get, PATCH: update, DELETE: remove } = await item();
  const created = await add(
    request(tokens.max, { method: "POST", body: { title: "Max's secret" } }),
  );
  const { id } = Todo.parse(await created.json());

  await expectError(
    await get(request(tokens.mia), params(id)),
    404,
    "todo-not-found",
  );
  await expectError(
    await update(
      request(tokens.mia, { method: "PATCH", body: { title: "Mine now" } }),
      params(id),
    ),
    404,
    "todo-not-found",
  );
  await expectError(
    await remove(request(tokens.mia, { method: "DELETE" }), params(id)),
    404,
    "todo-not-found",
  );

  const stillThere = await get(request(tokens.max), params(id));
  expect(Todo.parse(await stillThere.json()).title).toBe("Max's secret");
});

describe("400 validation-failed", () => {
  const cases: [string, (token: string) => Promise<Response>][] = [
    [
      "a blank title",
      async (t) =>
        (await collection()).POST(
          request(t, { method: "POST", body: { title: "  " } }),
        ),
    ],
    [
      "a due date that is not yyyy-mm-dd",
      async (t) =>
        (await collection()).POST(
          request(t, {
            method: "POST",
            body: { title: "Vet", dueDate: "next friday" },
          }),
        ),
    ],
    [
      "a body that is not JSON",
      async (t) =>
        (await collection()).POST(
          request(t, { method: "POST", body: "{title:" }),
        ),
    ],
    [
      "an unknown status filter",
      async (t) =>
        (await collection()).GET(request(t, { query: "?status=later" })),
    ],
    [
      "an empty update",
      async (t) =>
        (await item()).PATCH(
          request(t, { method: "PATCH", body: {} }),
          params(someId),
        ),
    ],
    [
      "an id that is not a uuid",
      async (t) => (await item()).GET(request(t), params("42")),
    ],
  ];

  test.each(cases)("%s", async (_, call) => {
    const response = await call(tokens.max);
    await expectError(response, 400, "validation-failed");
  });
});
