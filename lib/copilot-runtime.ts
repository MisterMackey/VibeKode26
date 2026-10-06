import "server-only";
import { type BaseEvent, EventType, type Message } from "@ag-ui/client";
import { MastraAgent } from "@ag-ui/mastra";
import {
  CopilotRuntime,
  type CopilotRuntimeHooks,
  createCopilotRuntimeHandler,
  type HandlerHookContext,
} from "@copilotkit/runtime/v2";
import { RequestContext } from "@mastra/core/request-context";
import {
  getLissie,
  LISSIE_AGENT_ID,
  lissieThreadId,
  userIdFromThreadId,
} from "./lissie";
import { USER_ID_KEY } from "./lissie-tools";
import { getUserId } from "./session";

// Everything the CopilotKit runtime serves goes through the hooks below, and the
// rules are in tech-docs/agent.md. In short: authenticate every request, then
// allow only Lissie's run/connect/stop on the caller's own thread. The runtime
// has many more routes (thread lists, events, state, memories, inspector, ...)
// that read by thread id alone; they are all denied by default.

const json = (body: unknown, status: number) => Response.json(body, { status });
const unauthorized = () => json({ error: "Unauthorized" }, 401);
// Another user's thread and a route we don't serve look the same: not found.
const notFound = () => json({ error: "Not found" }, 404);

// The agent is built per request so the memory scope (resourceId) and the tools'
// user id are the verified user, never something the browser or the model says.
// Mastra memory refuses a thread that belongs to a different resource, a second
// line behind the hooks. The tools read the user from the request context; this
// is the only place that sets it, and nothing client-controlled is copied into it
// (AG-UI adds its own "ag-ui" key beside it).
const runtime = new CopilotRuntime({
  agents: async ({ request }) => {
    const userId = await getUserId(request.headers);
    if (!userId) throw unauthorized();
    const requestContext = new RequestContext();
    requestContext.set(USER_ID_KEY, userId);
    return {
      [LISSIE_AGENT_ID]: new MastraAgent({
        agent: getLissie(),
        resourceId: userId,
        requestContext,
      }),
    };
  },
});

async function bodyThreadId(request: Request): Promise<string | null> {
  try {
    // Clone: the runtime still has to read the original body.
    const body: unknown = await request.clone().json();
    const threadId = (body as { threadId?: unknown } | null)?.threadId;
    return typeof threadId === "string" ? threadId : null;
  } catch {
    return null;
  }
}

async function authorizeRoute({ request, route }: HandlerHookContext) {
  const userId = await getUserId(request.headers);
  if (!userId) throw unauthorized();
  const ownThread = lissieThreadId(userId);

  switch (route.method) {
    case "info":
      return;
    case "agent/run":
    case "agent/connect":
      if (route.agentId !== LISSIE_AGENT_ID) throw notFound();
      if ((await bodyThreadId(request)) !== ownThread) throw notFound();
      if (route.method === "agent/connect")
        throw await replayHistory(ownThread);
      return;
    case "agent/stop":
      if (route.agentId !== LISSIE_AGENT_ID) throw notFound();
      if (route.threadId !== ownThread) throw notFound();
      return;
    default:
      // Default deny: threads/*, agent/suggest, transcribe, memories/*, inspector/*,
      // trajectory/connect, annotate, cpk-debug-events, and whatever a CopilotKit
      // upgrade adds. Nothing here is needed by the chat.
      throw notFound();
  }
}

const hooks: CopilotRuntimeHooks = {
  // Runs before routing, so it also covers paths that match no route.
  onRequest: async ({ request }) => {
    if (!(await getUserId(request.headers))) throw unauthorized();
  },
  onBeforeHandler: authorizeRoute,
};

export const copilotHandler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
  hooks,
});

// The default in-memory runner has nothing to replay after a restart, so on
// connect the history comes from Mastra memory, the source of truth. Called only
// after the thread was verified to be the caller's own. The reply ends the
// request (thrown, like any hook short-circuit) as an AG-UI event stream.
async function replayHistory(threadId: string): Promise<Response> {
  const userId = userIdFromThreadId(threadId);
  const messages = userId ? await recallMessages(threadId, userId) : [];
  const runId = crypto.randomUUID();
  const events: BaseEvent[] = [
    { type: EventType.RUN_STARTED, threadId, runId },
    { type: EventType.MESSAGES_SNAPSHOT, messages },
    { type: EventType.RUN_FINISHED, threadId, runId },
  ];
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    },
  );
}

async function recallMessages(
  threadId: string,
  resourceId: string,
): Promise<Message[]> {
  const memory = await getLissie().getMemory();
  if (!memory) return [];
  let stored: Awaited<ReturnType<typeof memory.recall>>["messages"];
  try {
    ({ messages: stored } = await memory.recall({
      threadId,
      resourceId,
      perPage: false,
    }));
  } catch {
    // Mastra throws for a thread that does not exist yet: a first visit.
    return [];
  }
  const messages: Message[] = [];
  for (const message of stored) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    if (message.role === "user") {
      const text = textOf(message.content.parts);
      if (text) messages.push({ id: message.id, role: "user", content: text });
      continue;
    }
    // One stored assistant message can interleave text and tool calls. Split it
    // at each call, as the live stream does, so the chat shows them in order:
    // text, call, text. A call without a result (cut off mid-run) is dropped.
    let text: string[] = [];
    let part = 0;
    const nextId = () => (part++ === 0 ? message.id : `${message.id}:${part}`);
    for (const p of message.content.parts) {
      if (p.type === "text") {
        text.push(p.text);
      } else if (
        p.type === "tool-invocation" &&
        p.toolInvocation.state === "result"
      ) {
        const { toolCallId, toolName, args, result } = p.toolInvocation;
        messages.push(
          {
            id: nextId(),
            role: "assistant",
            content: text.join(""),
            toolCalls: [
              {
                id: toolCallId,
                type: "function",
                function: { name: toolName, arguments: JSON.stringify(args) },
              },
            ],
          },
          {
            id: `${toolCallId}:result`,
            role: "tool",
            toolCallId,
            content: JSON.stringify(result),
          },
        );
        text = [];
      }
    }
    if (text.join(""))
      messages.push({
        id: nextId(),
        role: "assistant",
        content: text.join(""),
      });
  }
  return messages;
}

const textOf = (parts: { type: string; text?: string }[]) =>
  parts.flatMap((p) => (p.type === "text" ? [p.text ?? ""] : [])).join("");
