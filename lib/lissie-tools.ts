import "server-only";
import { createTool } from "@mastra/core/tools";
import {
  CreateTodoInput,
  ErrorBody,
  Todo,
  TodoId,
  TodoListFilter,
} from "@todo-cat/contract";
import { z } from "zod";
import * as todoService from "./todo-service";
import { TodoError } from "./todo-service";

// Lissie's tools are one more adapter on the todo service (tech-docs/architecture.md):
// parse input with a contract schema, resolve the user, call the service, map errors.
// The user id is read from Mastra's request context, which lib/copilot-runtime.ts
// fills from the server-side session. No input schema has a user id field, so the
// model has nothing to put one in.

export const USER_ID_KEY = "userId";

const userIdOf = (requestContext?: {
  get(key: typeof USER_ID_KEY): unknown;
}): string => {
  const userId = requestContext?.get(USER_ID_KEY);
  if (typeof userId !== "string" || !userId)
    throw new Error("No signed-in user in the request context");
  return userId;
};

// A rule violation is a result the model can read and recover from ("not found,
// list the todos first"), not a crashed run. Anything else is a real failure.
const failure = z.object({ error: ErrorBody.shape.error });

async function mapErrors<T extends object>(
  run: () => Promise<T>,
): Promise<T | z.infer<typeof failure>> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TodoError)
      return { error: { code: error.code, message: error.message } };
    throw error;
  }
}

export const listTodos = createTool({
  id: "listTodos",
  description:
    "List the user's todos, open ones first. Use it to see the list and to find a todo's id before changing it.",
  inputSchema: TodoListFilter,
  outputSchema: z.object({ todos: z.array(Todo) }),
  execute: async (filter, { requestContext }) => ({
    todos: await todoService.listTodos(userIdOf(requestContext), filter),
  }),
});

export const addTodo = createTool({
  id: "addTodo",
  description:
    "Add a todo to the user's list, optionally with a due date (yyyy-mm-dd).",
  inputSchema: CreateTodoInput,
  outputSchema: z.object({ todo: Todo }),
  execute: async (input, { requestContext }) => ({
    todo: await todoService.addTodo(userIdOf(requestContext), input),
  }),
});

export const setTodoDone = createTool({
  id: "setTodoDone",
  description:
    "Mark a todo done, or reopen it with done=false. Needs the todo's id from listTodos.",
  inputSchema: z.object({ id: TodoId, done: z.boolean().default(true) }),
  outputSchema: z.union([z.object({ todo: Todo }), failure]),
  execute: ({ id, done }, { requestContext }) =>
    mapErrors(async () => ({
      todo: await todoService.updateTodo(userIdOf(requestContext), id, {
        done,
      }),
    })),
});

// The record's keys are the tool names the model calls and the chat renders.
export const lissieTools = { listTodos, addTodo, setTodoDone };
