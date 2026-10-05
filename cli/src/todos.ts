import {
  CreateTodoInput,
  Todo,
  TodoId,
  TodoList,
  TodoListFilter,
  UpdateTodoInput,
} from "@todo-cat/contract";
import { z } from "zod";
import { callApi, callApiNoContent } from "./api";
import { CliError } from "./errors";
import { printJson, printText, todoDetails, todoLine } from "./output";

// One function per REST use case under /api/todos (tech-docs/rest-api.md).
// Input is checked with the contract schemas before it is sent, so a typo
// fails fast with the same `validation-failed` code the server would use.

function input<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new CliError("validation-failed", z.prettifyError(result.error));
  }
  return result.data;
}

function todoPath(id: string): string {
  if (!TodoId.safeParse(id).success) {
    throw new CliError(
      "validation-failed",
      `Not a todo id: "${id}". Ids are UUIDs; see \`todo-cat list\`.`,
    );
  }
  return `/todos/${id}`;
}

function printTodo(todo: Todo, json: boolean, verb: string): void {
  if (json) printJson(todo);
  else printText(`${verb}: ${todoLine(todo)}`);
}

export async function list(
  server: string,
  json: boolean,
  options: { status: string; text?: string },
): Promise<void> {
  const filter = input(TodoListFilter, options);
  const todos = await callApi(server, TodoList, "GET", "/todos", {
    query: { status: filter.status, text: filter.text || undefined },
  });
  if (json) return printJson(todos);
  if (todos.length === 0) {
    const which = filter.status === "all" ? "" : `${filter.status} `;
    return printText(`No ${which}todos${filter.text ? " match" : ""}.`);
  }
  printText(todos.map(todoLine).join("\n"));
}

export async function show(
  server: string,
  json: boolean,
  id: string,
): Promise<void> {
  const todo = await callApi(server, Todo, "GET", todoPath(id));
  if (json) printJson(todo);
  else printText(todoDetails(todo));
}

export async function add(
  server: string,
  json: boolean,
  title: string,
  options: { due?: string },
): Promise<void> {
  const body = input(CreateTodoInput, { title, dueDate: options.due });
  printTodo(
    await callApi(server, Todo, "POST", "/todos", { body }),
    json,
    "Added",
  );
}

export async function update(
  server: string,
  json: boolean,
  id: string,
  changes: { title?: string; dueDate?: string | null; done?: boolean },
  verb: string,
): Promise<void> {
  const path = todoPath(id);
  const body = input(UpdateTodoInput, changes);
  printTodo(await callApi(server, Todo, "PATCH", path, { body }), json, verb);
}

export async function remove(
  server: string,
  json: boolean,
  id: string,
  options: { yes?: boolean },
): Promise<void> {
  const path = todoPath(id);
  if (!options.yes) {
    throw new CliError(
      "invalid-usage",
      "Deleting cannot be undone; pass --yes to confirm.",
    );
  }
  await callApiNoContent(server, "DELETE", path);
  if (json) printJson({ id, deleted: true });
  else printText(`Deleted ${id}.`);
}
