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

// Better Auth endpoints the CLI calls. Better Auth owns these shapes; they live
// here so the CLI declares none itself and fails loudly if they drift.

// The only client id the server's device authorization flow accepts.
export const CLI_CLIENT_ID = "todo-cat-cli";

// POST /api/auth/device/code (RFC 8628 device authorization response).
export const DeviceCode = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.url(),
  verification_uri_complete: z.url(),
  expires_in: z.number(),
  interval: z.number(),
});
export type DeviceCode = z.infer<typeof DeviceCode>;

// POST /api/auth/device/token, success. The access token is a session token
// that the bearer plugin accepts.
export const DeviceToken = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
});
export type DeviceToken = z.infer<typeof DeviceToken>;

// POST /api/auth/device/token, failure (400).
export const DeviceTokenError = z.object({
  error: z.enum([
    "authorization_pending",
    "slow_down",
    "expired_token",
    "access_denied",
    "invalid_request",
    "invalid_grant",
  ]),
  error_description: z.string(),
});
export type DeviceTokenError = z.infer<typeof DeviceTokenError>;

// GET /api/auth/get-session: the signed-in user, or null without a session.
export const SessionUser = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
});
export type SessionUser = z.infer<typeof SessionUser>;

export const Session = z.object({ user: SessionUser }).nullable();
export type Session = z.infer<typeof Session>;
