import {
  CreateTodoInput,
  ErrorBody,
  TodoListFilter,
  UpdateTodoInput,
} from "@todo-cat/contract";
import { expect, test } from "vitest";

test("a new todo needs a non-blank title and an ISO date if any", () => {
  expect(CreateTodoInput.parse({ title: "  Feed Lissie  " })).toEqual({
    title: "Feed Lissie",
  });
  expect(CreateTodoInput.safeParse({ title: "   " }).success).toBe(false);
  for (const dueDate of ["2026-13-01", "2026-10-05T10:00:00Z", "05.10.2026"]) {
    expect(CreateTodoInput.safeParse({ title: "x", dueDate }).success).toBe(
      false,
    );
  }
});

test("an update must change something; null clears the due date", () => {
  expect(UpdateTodoInput.safeParse({}).success).toBe(false);
  expect(UpdateTodoInput.parse({ dueDate: null })).toEqual({ dueDate: null });
  expect(UpdateTodoInput.parse({ done: true })).toEqual({ done: true });
});

test("the list filter defaults to all todos", () => {
  expect(TodoListFilter.parse({})).toEqual({ status: "all" });
  expect(TodoListFilter.safeParse({ status: "later" }).success).toBe(false);
});

test("error bodies only carry known codes", () => {
  const body = { error: { code: "todo-not-found", message: "nope" } };
  expect(ErrorBody.parse(body)).toEqual(body);
  expect(
    ErrorBody.safeParse({ error: { code: "forbidden", message: "" } }).success,
  ).toBe(false);
});
