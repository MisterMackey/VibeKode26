"use client";

import { CopilotChat, CopilotKit, useAgent } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";

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
      </div>
    </CopilotKit>
  );
}
