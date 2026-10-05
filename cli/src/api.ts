import { ErrorBody } from "@todo-cat/contract";
import { z } from "zod";
import { readToken } from "./config";
import { CliError } from "./errors";

// The CLI's only way to the data: HTTP to the todo-cat server. Every response
// body is parsed with a contract schema, so a shape change fails loudly here.

type RequestOptions = {
  token?: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
};

export type Reply = { status: number; body: unknown };

// Sends one request; only a network failure throws.
export async function send(
  server: string,
  method: string,
  path: string,
  { token, body, query }: RequestOptions = {},
): Promise<Reply> {
  const url = new URL(`${server}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  const headers = new Headers({ accept: "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("content-type", "application/json");

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new CliError(
      "server-unreachable",
      `Cannot reach the todo-cat server at ${server}. Is it running? Set TODO_CAT_URL to use another server.`,
    );
  }
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: response.status, body: parsed };
}

export function parseReply<T>(schema: z.ZodType<T>, reply: Reply): T {
  const result = schema.safeParse(reply.body);
  if (!result.success) {
    throw new CliError(
      "unexpected-response",
      `The server answered ${reply.status} with an unexpected body: ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

// Maps an API error body to a CliError with the API's code.
export function apiError(reply: Reply): CliError {
  const parsed = ErrorBody.safeParse(reply.body);
  if (!parsed.success) {
    return new CliError(
      "unexpected-response",
      `The server answered ${reply.status} without an error code`,
    );
  }
  const { code, message } = parsed.data.error;
  if (code === "unauthorized") return notLoggedIn();
  return new CliError(code, message);
}

export function notLoggedIn(): CliError {
  return new CliError(
    "unauthorized",
    "The server rejected the saved login; the session expired or was revoked. Run `todo-cat login`.",
  );
}

export function requireToken(server: string): string {
  const token = readToken(server);
  if (!token) {
    throw new CliError(
      "unauthorized",
      `Not logged in to ${server}. Run \`todo-cat login\`.`,
    );
  }
  return token;
}

// A call to the REST API (`/api${path}`) as the logged-in user.
async function callRest(
  server: string,
  method: string,
  path: string,
  options: Omit<RequestOptions, "token">,
): Promise<Reply> {
  const reply = await send(server, method, `/api${path}`, {
    ...options,
    token: requireToken(server),
  });
  if (reply.status < 200 || reply.status >= 300) throw apiError(reply);
  return reply;
}

export async function callApi<T>(
  server: string,
  schema: z.ZodType<T>,
  method: string,
  path: string,
  options: Omit<RequestOptions, "token"> = {},
): Promise<T> {
  return parseReply(schema, await callRest(server, method, path, options));
}

// For endpoints that answer 204 with no body.
export async function callApiNoContent(
  server: string,
  method: string,
  path: string,
): Promise<void> {
  await callRest(server, method, path, {});
}
