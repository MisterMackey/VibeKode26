"use client";

import {
  CopilotChat,
  CopilotKit,
  useAgent,
  useRenderTool,
} from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { describeToolCall } from "./tool-line";

const AGENT_ID = "lissie";

// CopilotChat only draws its welcome screen for a thread it minted itself. Ours
// is explicit (one per user, so history replays), so the empty state is ours.
function EmptyHint() {
  const { agent } = useAgent({ agentId: AGENT_ID });
  if (agent.messages.length > 0) return null;
  return (
    <p className="pointer-events-none absolute inset-x-0 top-1/3 px-6 text-center text-zinc-600 dark:text-zinc-400">
      Oh. You're here. Tell me about your list, I suppose.
    </p>
  );
}

// Lissie's tool calls as one line each. The wildcard covers all of her tools, and
// anything she gets later, so raw JSON never reaches the chat. describeToolCall
// reads the result of a finished call, which is also how a call replayed from
// history looks.
function ToolCallLines() {
  useRenderTool({
    name: "*",
    render: ({ name, status, parameters, result }) => (
      <p className="my-1 text-sm italic text-zinc-600 dark:text-zinc-400">
        {describeToolCall({ name, status, parameters, result })}
      </p>
    ),
  });
  return null;
}

// The sidebar is rendered on the server; when a live tool call finishes, ask
// Next to re-render it. A history replay is a messages snapshot, not tool result
// events, so reopening the page doesn't trigger this.
function RefreshOnToolResult() {
  const { agent } = useAgent({ agentId: AGENT_ID });
  const router = useRouter();
  useEffect(() => {
    const { unsubscribe } = agent.subscribe({
      onToolCallResultEvent: () => router.refresh(),
    });
    return unsubscribe;
  }, [agent, router]);
  return null;
}

// The thread id comes from the server (lib/lissie.ts), one per user. The runtime
// rejects any other id, so there is nothing for the browser to choose here.
export function LissieChat({ threadId }: { threadId: string }) {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent={AGENT_ID}
      useSingleEndpoint={false}
      // The dev inspector needs runtime routes we deny, and it covers the header.
      enableInspector={false}
    >
      <div className="relative h-full">
        <CopilotChat
          agentId={AGENT_ID}
          threadId={threadId}
          className="h-full"
          labels={{ chatInputPlaceholder: "Tell Lissie about your day..." }}
        />
        <EmptyHint />
        <ToolCallLines />
        <RefreshOnToolResult />
      </div>
    </CopilotKit>
  );
}
