import "server-only";
import type { ErrorBody, ErrorCode } from "@todo-cat/contract";
import { z } from "zod";
import { getUserId } from "./session";
import { TodoError } from "./todo-service";

// Shared plumbing for the REST adapter under app/api/todos (see tech-docs/rest-api.md):
// resolve the user, parse input with contract schemas, map TodoError codes to statuses.
// No business rules here; those live in the todo service.

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  "validation-failed": 400,
  "todo-not-found": 404,
};

function errorResponse(code: ErrorCode, message: string): Response {
  const body: ErrorBody = { error: { code, message } };
  const headers: HeadersInit =
    code === "unauthorized" ? { "www-authenticate": "Bearer" } : {};
  return Response.json(body, { status: STATUS[code], headers });
}

// Runs `handle` for the signed-in user (bearer token or session cookie), or
// answers 401 before any input is looked at.
export async function withUser(
  request: Request,
  handle: (userId: string) => Promise<Response>,
): Promise<Response> {
  const userId = await getUserId(request.headers);
  if (!userId) {
    return errorResponse(
      "unauthorized",
      "Send a bearer token or a session cookie",
    );
  }
  try {
    return await handle(userId);
  } catch (error) {
    if (error instanceof TodoError) {
      return errorResponse(error.code, error.message);
    }
    throw error;
  }
}

// Parses adapter input; a failure becomes a 400 `validation-failed` via withUser.
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new TodoError("validation-failed", z.prettifyError(result.error));
  }
  return result.data;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new TodoError("validation-failed", "Request body must be JSON");
  }
}
