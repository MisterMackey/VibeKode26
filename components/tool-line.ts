import { ErrorBody, Todo } from "@todo-cat/contract";
import { z } from "zod";

// One readable line per Lissie tool call, instead of raw JSON in the chat. Pure
// so it can be tested without a browser. `result` is the tool's output as the
// JSON string AG-UI carries; anything unexpected falls back to a generic line.

type ToolCall = {
  name: string;
  status: "inProgress" | "executing" | "complete";
  parameters: unknown;
  result: string | undefined;
};

const Params = z.looseObject({
  title: z.string().optional(),
  dueDate: z.string().nullish(),
  status: z.string().optional(),
  text: z.string().optional(),
  done: z.boolean().optional(),
});
const Result = z.looseObject({
  todo: Todo.optional(),
  todos: z.array(Todo).optional(),
  error: ErrorBody.shape.error.optional(),
});

const parseResult = (result: string | undefined) => {
  if (result === undefined) return undefined;
  try {
    return Result.safeParse(JSON.parse(result)).data;
  } catch {
    return undefined;
  }
};

const quoted = (title: string) => `“${title}”`;

export function describeToolCall(call: ToolCall): string {
  const params = Params.safeParse(call.parameters).data ?? {};
  const result = parseResult(call.result);
  const pending = call.status !== "complete";

  if (result?.error) return `Lissie could not do that: ${result.error.message}`;

  switch (call.name) {
    case "listTodos": {
      if (pending || !result?.todos) return "Lissie is looking at your list";
      const open = result.todos.filter((todo) => !todo.done).length;
      const done = result.todos.length - open;
      const scope = params.text ? ` matching “${params.text}”` : "";
      return `Lissie looked at your list${scope}: ${open} open, ${done} done`;
    }
    case "addTodo": {
      const title = result?.todo?.title ?? params.title;
      const due = params.dueDate ? `, due ${params.dueDate}` : "";
      if (pending || !title) return "Lissie is adding a todo";
      return `Lissie added ${quoted(title)}${due}`;
    }
    case "setTodoDone": {
      const reopen = params.done === false;
      const title = result?.todo?.title;
      if (pending || !title)
        return reopen
          ? "Lissie is reopening a todo"
          : "Lissie is ticking off a todo";
      return `Lissie ${reopen ? "reopened" : "marked done"} ${quoted(title)}`;
    }
    default:
      return pending
        ? `Lissie is using ${call.name}`
        : `Lissie used ${call.name}`;
  }
}
