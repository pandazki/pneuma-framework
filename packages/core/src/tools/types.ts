import type { LifecycleOrchestrator } from "../lifecycle.js";
import type { AgentBackend } from "../agent-backend/types.js";

export interface ToolContext {
  orchestrator: LifecycleOrchestrator;
  backend?: AgentBackend;
}

export interface ToolResult {
  ok: boolean;
  state?: unknown;
  error?: string;
}

export type ToolHandler = (ctx: ToolContext, params: Record<string, unknown>) => Promise<ToolResult>;

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
}

export interface ToolRegistry {
  register(desc: ToolDescriptor, handler: ToolHandler): void;
  /** Remove a tool by name. No-op if the tool does not exist. */
  deregister(name: string): void;
  list(): ToolDescriptor[];
  call(name: string, params: Record<string, unknown>): Promise<ToolResult>;
  has(name: string): boolean;
}
