import { copilotHandler } from "@/lib/copilot-runtime";

// The CopilotKit runtime, multi-route mode. Authentication and per-route rules
// are the hooks in lib/copilot-runtime.ts (tech-docs/agent.md).
export const GET = copilotHandler;
export const POST = copilotHandler;
export const PATCH = copilotHandler;
export const DELETE = copilotHandler;
