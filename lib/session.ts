import "server-only";
import { auth } from "./auth";

// The one place that reads a session. Every adapter (REST, agent tools, MCP)
// maps a request to a user id through this; nothing else calls auth.api.getSession.
// The bearer plugin rewrites an `Authorization: Bearer <token>` header into the
// session cookie before this lookup runs, so cookie and bearer requests both work.
export async function getUserId(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  return session?.user.id ?? null;
}
