import { describe, expect, test } from "vitest";
import { describeToolCall } from "@/components/tool-line";

const todo = (title: string, done = false) => ({
  id: crypto.randomUUID(),
  title,
  dueDate: null,
  done,
  createdAt: "2026-10-06T09:00:00.000Z",
  completedAt: done ? "2026-10-06T10:00:00.000Z" : null,
});

const complete = (name: string, parameters: unknown, result: unknown) => ({
  name,
  status: "complete" as const,
  parameters,
  result: JSON.stringify(result),
});

describe("describeToolCall", () => {
  test("addTodo, running and finished, with a due date", () => {
    expect(
      describeToolCall({
        name: "addTodo",
        status: "executing",
        parameters: { title: "Buy tuna" },
        result: undefined,
      }),
    ).toBe("Lissie is adding a todo");
    expect(
      describeToolCall(
        complete(
          "addTodo",
          { title: "Buy tuna", dueDate: "2026-10-31" },
          { todo: todo("Buy tuna") },
        ),
      ),
    ).toBe("Lissie added “Buy tuna”, due 2026-10-31");
  });

  test("setTodoDone names the todo from the result, since the call only has an id", () => {
    expect(
      describeToolCall(
        complete(
          "setTodoDone",
          { id: "x", done: true },
          { todo: todo("Feed the cat", true) },
        ),
      ),
    ).toBe("Lissie marked done “Feed the cat”");
    expect(
      describeToolCall(
        complete(
          "setTodoDone",
          { id: "x", done: false },
          { todo: todo("Feed the cat") },
        ),
      ),
    ).toBe("Lissie reopened “Feed the cat”");
  });

  test("listTodos counts open and done", () => {
    expect(
      describeToolCall(
        complete(
          "listTodos",
          { status: "all" },
          { todos: [todo("a"), todo("b"), todo("c", true)] },
        ),
      ),
    ).toBe("Lissie looked at your list: 2 open, 1 done");
  });

  test("a tool error reads as a sentence, not JSON", () => {
    expect(
      describeToolCall(
        complete(
          "setTodoDone",
          { id: "x" },
          { error: { code: "todo-not-found", message: "Todo x not found" } },
        ),
      ),
    ).toBe("Lissie could not do that: Todo x not found");
  });

  test("unknown tools and unreadable results fall back to a plain line", () => {
    expect(
      describeToolCall({
        name: "nap",
        status: "complete",
        parameters: {},
        result: "not json",
      }),
    ).toBe("Lissie used nap");
    expect(
      describeToolCall({
        name: "addTodo",
        status: "complete",
        parameters: { title: "Buy tuna" },
        result: "not json",
      }),
    ).toBe("Lissie added “Buy tuna”");
  });
});
