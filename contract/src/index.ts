import { z } from "zod";

// Shared by the server and every client. Validation lives here, at the adapter
// boundary; the todo service trusts input that has passed these schemas.

export const TodoId = z.uuid();

// A calendar date without time, kept as `yyyy-mm-dd` everywhere. Never turn it
// into a JavaScript Date: that is midnight UTC and shows the previous day west
// of Greenwich.
export const DueDate = z.iso.date();

const Title = z.string().trim().min(1).max(200);

export const Todo = z.object({
  id: TodoId,
  title: z.string(),
  dueDate: DueDate.nullable(),
  done: z.boolean(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type Todo = z.infer<typeof Todo>;

export const TodoList = z.array(Todo);

export const CreateTodoInput = z.object({
  title: Title,
  dueDate: DueDate.nullish(),
});
export type CreateTodoInput = z.infer<typeof CreateTodoInput>;

// `dueDate: null` clears the due date; a missing field leaves it unchanged.
export const UpdateTodoInput = z
  .object({
    title: Title.optional(),
    dueDate: DueDate.nullable().optional(),
    done: z.boolean().optional(),
  })
  .refine((input) => Object.values(input).some((v) => v !== undefined), {
    message: "Nothing to update",
  });
export type UpdateTodoInput = z.infer<typeof UpdateTodoInput>;

export const TodoStatus = z.enum(["open", "done", "all"]);
export type TodoStatus = z.infer<typeof TodoStatus>;

export const TodoListFilter = z.object({
  status: TodoStatus.default("all"),
  // Case-insensitive substring of the title; blank means no text filter.
  text: z.string().trim().optional(),
});
export type TodoListFilter = z.infer<typeof TodoListFilter>;

export const ErrorCode = z.enum([
  "unauthorized",
  "todo-not-found",
  "validation-failed",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorBody = z.object({
  error: z.object({ code: ErrorCode, message: z.string() }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;
