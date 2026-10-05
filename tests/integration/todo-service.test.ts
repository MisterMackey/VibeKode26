import { Todo } from "@todo-cat/contract";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { migrateTempDb } from "../../scripts/with-temp-db";

// Two users in every use case: Mia must never see, change, or delete Max's todos.

const tempDb = { url: "", cleanup: () => {} };

beforeAll(async () => {
  Object.assign(tempDb, migrateTempDb());
  process.env.DATABASE_URL = tempDb.url;
  const { db } = await import("@/lib/db");
  const { user } = await import("@/lib/schema");
  await db.insert(user).values([
    { id: "max", name: "Max", email: "max@example.com" },
    { id: "mia", name: "Mia", email: "mia@example.com" },
    { id: "gone", name: "Gone", email: "gone@example.com" },
  ]);
}, 60_000);

afterAll(() => tempDb.cleanup());

const service = () => import("@/lib/todo-service");

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({
    name: "TodoError",
    code: "todo-not-found",
  });
}

describe("add", () => {
  test("returns a contract todo owned by the caller only", async () => {
    const { addTodo, listTodos } = await service();

    const todo = await addTodo("max", {
      title: "Buy tuna",
      dueDate: "2026-10-31",
    });

    expect(Todo.parse(todo)).toEqual(todo);
    expect(todo).toMatchObject({
      title: "Buy tuna",
      dueDate: "2026-10-31",
      done: false,
      completedAt: null,
    });
    expect((await listTodos("max")).map((t) => t.id)).toContain(todo.id);
    expect((await listTodos("mia")).map((t) => t.id)).not.toContain(todo.id);
  });

  test("keeps a due date as the same calendar day", async () => {
    const { addTodo, getTodo } = await service();

    const todo = await addTodo("max", {
      title: "New Year",
      dueDate: "2027-01-01",
    });

    expect((await getTodo("max", todo.id)).dueDate).toBe("2027-01-01");
  });
});

describe("get", () => {
  test("finds the caller's todo and hides it from everyone else", async () => {
    const { addTodo, getTodo } = await service();
    const todo = await addTodo("max", { title: "Vet appointment" });

    expect(await getTodo("max", todo.id)).toEqual(todo);
    await expectNotFound(getTodo("mia", todo.id));
  });

  test("an unknown id is not found", async () => {
    const { getTodo } = await service();

    await expectNotFound(getTodo("max", crypto.randomUUID()));
  });
});

describe("list", () => {
  test("filters by status and text within the caller's todos", async () => {
    const { addTodo, listTodos, updateTodo } = await service();
    const open = await addTodo("mia", { title: "Sharpen CLAWS" });
    const done = await addTodo("mia", { title: "Nap in the sun" });
    await updateTodo("mia", done.id, { done: true });
    await addTodo("max", { title: "Max's claws too" });

    const ids = async (filter: Parameters<typeof listTodos>[1]) =>
      (await listTodos("mia", filter)).map((t) => t.id);

    expect(await ids({ status: "open" })).toEqual([open.id]);
    expect(await ids({ status: "done" })).toEqual([done.id]);
    expect(await ids({ status: "all" })).toEqual([open.id, done.id]);
    expect(await ids({ status: "all", text: "claws" })).toEqual([open.id]);
    expect(await ids({ status: "all", text: "100%" })).toEqual([]);
    expect(await ids({ status: "all", text: "  " })).toHaveLength(2);
  });

  test("a user without todos gets an empty list", async () => {
    const { listTodos } = await service();

    expect(await listTodos("gone")).toEqual([]);
  });
});

describe("update", () => {
  test("changes title and due date, and clears the due date with null", async () => {
    const { addTodo, updateTodo } = await service();
    const todo = await addTodo("max", {
      title: "Groom",
      dueDate: "2026-11-01",
    });

    const renamed = await updateTodo("max", todo.id, {
      title: "Groom the fluff",
      dueDate: "2026-11-02",
    });
    expect(renamed).toMatchObject({
      title: "Groom the fluff",
      dueDate: "2026-11-02",
    });

    const cleared = await updateTodo("max", todo.id, { dueDate: null });
    expect(cleared).toMatchObject({ title: "Groom the fluff", dueDate: null });
  });

  test("sets completedAt when done and clears it when reopened", async () => {
    const { addTodo, updateTodo } = await service();
    const todo = await addTodo("max", { title: "Knock cup off table" });
    const doneAt = new Date("2026-10-04T08:00:00.000Z");

    const done = await updateTodo("max", todo.id, { done: true }, doneAt);
    expect(done).toMatchObject({
      done: true,
      completedAt: doneAt.toISOString(),
    });

    const again = await updateTodo("max", todo.id, { done: true });
    expect(again.completedAt).toBe(doneAt.toISOString());

    const reopened = await updateTodo("max", todo.id, { done: false });
    expect(reopened).toMatchObject({ done: false, completedAt: null });
  });

  test("another user's todo is not found and stays unchanged", async () => {
    const { addTodo, getTodo, updateTodo } = await service();
    const todo = await addTodo("max", { title: "Max's secret" });

    await expectNotFound(updateTodo("mia", todo.id, { title: "Mia was here" }));
    await expectNotFound(updateTodo("mia", todo.id, { done: true }));
    expect(await getTodo("max", todo.id)).toEqual(todo);
  });
});

describe("delete", () => {
  test("removes the caller's todo", async () => {
    const { addTodo, deleteTodo, getTodo } = await service();
    const todo = await addTodo("max", { title: "Temporary" });

    await deleteTodo("max", todo.id);

    await expectNotFound(getTodo("max", todo.id));
    await expectNotFound(deleteTodo("max", todo.id));
  });

  test("another user's todo is not found and survives", async () => {
    const { addTodo, deleteTodo, getTodo } = await service();
    const todo = await addTodo("max", { title: "Keep me" });

    await expectNotFound(deleteTodo("mia", todo.id));
    expect(await getTodo("max", todo.id)).toEqual(todo);
  });
});

test("deleting a user deletes their todos, and only theirs", async () => {
  const { db } = await import("@/lib/db");
  const { user } = await import("@/lib/schema");
  const { addTodo, listTodos } = await service();
  await addTodo("gone", { title: "Soon orphaned" });
  const maxBefore = await listTodos("max");

  await db.delete(user).where(eq(user.id, "gone"));

  expect(await listTodos("gone")).toEqual([]);
  expect(await listTodos("max")).toEqual(maxBefore);
});
